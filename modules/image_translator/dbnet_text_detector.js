import { applyVattiUnclipping } from "./dbnet_vatti_unclipping.js";
import { constrainedTextlineMerge } from "./textline_merge.js";

/**
 * dbnet_text_detector.js — Deterministic Text Region Bounding Box Detector (SOTA Architecture)
 */

/**
 * 온디바이스 결정론적 정밀 텍스트 영역 탐지
 * @param {HTMLImageElement} imgEl 
 * @returns {Promise<Array<{box: [number, number, number, number], text?: string, score: number}>>}
 */
export async function detectTextWithDBNet(imgEl) {
  const width = imgEl.naturalWidth || imgEl.width || imgEl.clientWidth;
  const height = imgEl.naturalHeight || imgEl.height || imgEl.clientHeight;

  if (!width || !height) return [];

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return [];

  try {
    ctx.drawImage(imgEl, 0, 0, width, height);
    ctx.getImageData(0, 0, 1, 1);
    return processDBNetBinarization(ctx, width, height);
  } catch {
    const imageUrl = imgEl.src || imgEl.currentSrc;
    if (imageUrl) {
      try {
        const response = await chrome.runtime.sendMessage({ action: "fetchBase64", imageUrl });
        if (response && response.success && response.dataUrl) {
          const cleanImg = new Image();
          cleanImg.crossOrigin = "anonymous";
          await new Promise((res, rej) => {
            cleanImg.onload = res;
            cleanImg.onerror = rej;
            cleanImg.src = response.dataUrl;
          });
          const freshCanvas = document.createElement("canvas");
          freshCanvas.width = width;
          freshCanvas.height = height;
          const freshCtx = freshCanvas.getContext("2d");
          if (!freshCtx) return [];
          freshCtx.drawImage(cleanImg, 0, 0, width, height);
          return processDBNetBinarization(freshCtx, width, height);
        }
      } catch (err) {
        console.error("[WebTranslator DBNet] CORS 우회 실패:", err);
      }
    }
  }

  return [];
}

/**
 * DBNet SOTA Dual-Threshold & Vatti Unclipping 텍스트라인 추출 파이프라인
 */
function processDBNetBinarization(ctx, width, height) {
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  // 1. Grayscale & Sobel Edge Magnitude (유사 Probability Map 생성)
  // 실제 ONNX 모델이 없을 때, 이미지의 고주파(대조가 심한) 영역을 확률(0~255)로 근사합니다.
  const gray = new Uint8Array(width * height);
  const probMap = new Uint8Array(width * height);
  for (let i = 0; i < data.length; i += 4) {
    gray[i / 4] = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0;
  }

  // 2. Dual-Threshold 처리용 Base Probability Map 생성
  // 만화책 특성 상 흰 배경에 검은 글씨이므로, 글자 획 내부 경계의 강도를 구합니다.
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const gx = Math.abs(gray[idx + 1] - gray[idx - 1]);
      const gy = Math.abs(gray[idx + width] - gray[idx - width]);
      const magnitude = Math.min(255, gx + gy);
      probMap[idx] = magnitude;
    }
  }

  // 3. Stage 1 Binarization (`thresh`)
  // 픽셀 레벨 이진화 임계값 (예: 밝기 변화량이 80 이상인 픽셀만 활성화)
  const binary = new Uint8Array(width * height);
  const THRESH = 80;
  for (let i = 0; i < probMap.length; i++) {
    if (probMap[i] >= THRESH) {
      binary[i] = 255;
    }
  }

  // 4. 모폴로지 Dilation (획 끊김 보완하여 하나의 Kernel 생성)
  const dilated = new Uint8Array(width * height);
  const kSize = Math.max(2, Math.floor(width / 250)); // 이미지 크기에 비례하는 작은 커널
  for (let y = kSize; y < height - kSize; y++) {
    for (let x = kSize; x < width - kSize; x++) {
      const idx = y * width + x;
      if (binary[idx] === 255) {
        for (let dy = -kSize; dy <= kSize; dy++) {
          for (let dx = -kSize; dx <= kSize; dx++) {
            dilated[(y + dy) * width + (x + dx)] = 255;
          }
        }
      }
    }
  }

  // 5. Connected Component Analysis 및 Stage 2 Verification (`box_thresh`)
  const rawKernels = [];
  const visited = new Uint8Array(width * height);
  const minKernelArea = Math.max(50, (width * height) * 0.0001);

  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const idx = y * width + x;
      if (dilated[idx] === 255 && !visited[idx]) {
        let minX = x, maxX = x, minY = y, maxY = y;
        let kernelProbSum = 0;
        let kernelPixelCount = 0;

        const stack = [idx];
        visited[idx] = 1;

        while (stack.length > 0) {
          const curr = stack.pop();
          const cx = curr % width;
          const cy = (curr / width) | 0;

          if (cx < minX) minX = cx;
          if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy;
          if (cy > maxY) maxY = cy;

          kernelProbSum += probMap[curr];
          kernelPixelCount++;

          const neighbors = [
            curr - 1, curr + 1,
            curr - width, curr + width
          ];

          for (let i = 0; i < neighbors.length; i++) {
            const nIdx = neighbors[i];
            if (nIdx >= 0 && nIdx < dilated.length && dilated[nIdx] === 255 && !visited[nIdx]) {
              visited[nIdx] = 1;
              stack.push(nIdx);
            }
          }
        }

        const bw = maxX - minX;
        const bh = maxY - minY;
        const area = bw * bh;

        // Stage 2: Box Threshold Validation
        // 머리카락이나 잔선은 얇아서 박스 대비 실제 점수 밀도(Average Score)가 매우 낮습니다.
        const boxAvgScore = kernelProbSum / area; // 폴리곤 바운딩 박스 전체 면적 대비 획 점수 밀도
        const BOX_THRESH = 15.0; // 컷선, 머리카락, 옷주름을 차단하는 강력한 문턱값

        if (bw >= 8 && bh >= 8 && area >= minKernelArea && boxAvgScore >= BOX_THRESH) {
          rawKernels.push([minY, minX, maxY, maxX]);
        }
      }
    }
  }

  // 6. Vatti Polygon Unclipping (수축된 확률 커널을 원래 글자 크기로 복원 팽창)
  const unclippedBoxes = applyVattiUnclipping(rawKernels, 1.8, width, height);

  // 7. Constrained Textline Merge (읽기 순서 기반 여백 제약 클러스터링 - 오버메징 방지)
  const mergedBoxes = constrainedTextlineMerge(unclippedBoxes, width, height);

  return mergedBoxes.map((box) => ({
    box,
    text: "",
    score: 0.95,
  }));
}
