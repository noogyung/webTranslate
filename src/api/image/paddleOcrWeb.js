/**
 * src/api/image/paddleOcrWeb.js
 * PP-OCRv4 WASM 추론 엔진 — DBNet 후처리 + CTC Decoder (순수 JS, OpenCV 배제)
 *
 * 참조: x3zvawq/paddleocr.js, PaddlePaddle/PaddleOCR DBNet 후처리 알고리즘
 * 실행 환경: Offscreen Document (DOM/Canvas 접근 가능)
 */

// ──────────────────────────────────────────────────────────────
// 1. 이미지 전처리 (Canvas 2D → Float32 텐서)
// ──────────────────────────────────────────────────────────────

/**
 * Base64 이미지를 Det 모델 입력용 Float32 텐서로 변환.
 * 긴 축을 maxSide로 리사이즈 + 32배수 패딩 + RGB 정규화.
 * @returns {{ tensor: Float32Array, width: number, height: number, origW: number, origH: number }}
 */
export async function preprocessForDet(base64DataUrl, maxSide = 960) {
  const img = await loadImage(base64DataUrl);
  const origW = img.width, origH = img.height;

  // 긴 축 리사이즈 (비율 유지)
  let scale = 1;
  if (Math.max(origW, origH) > maxSide) {
    scale = maxSide / Math.max(origW, origH);
  }
  let newW = Math.round(origW * scale);
  let newH = Math.round(origH * scale);

  // 32배수 패딩 (DBNet 요구)
  newW = Math.ceil(newW / 32) * 32;
  newH = Math.ceil(newH / 32) * 32;

  const canvas = new OffscreenCanvas(newW, newH);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, newW, newH);
  const imageData = ctx.getImageData(0, 0, newW, newH);

  // NCHW [1, 3, H, W] 텐서, ImageNet 정규화
  const mean = [0.485, 0.456, 0.406];
  const std = [0.229, 0.224, 0.225];
  const chw = newW * newH;
  const tensor = new Float32Array(3 * chw);

  for (let i = 0; i < chw; i++) {
    const r = imageData.data[i * 4] / 255;
    const g = imageData.data[i * 4 + 1] / 255;
    const b = imageData.data[i * 4 + 2] / 255;
    tensor[i] = (r - mean[0]) / std[0];           // R
    tensor[chw + i] = (g - mean[1]) / std[1];     // G
    tensor[2 * chw + i] = (b - mean[2]) / std[2]; // B
  }

  return { tensor, width: newW, height: newH, origW, origH };
}

/**
 * 검출된 BBox에서 텍스트 영역을 크롭 + Rec 모델 입력 크기로 변환.
 * @returns {{ tensor: Float32Array, width: number }}
 */
export function preprocessForRec(base64DataUrl, img, box, recH = 48) {
  // box = { x, y, width, height }
  const cropCanvas = new OffscreenCanvas(box.width, box.height);
  const cropCtx = cropCanvas.getContext("2d");
  cropCtx.drawImage(img, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height);

  // 높이를 recH에 맞추고 가로 비율 유지
  const ratio = recH / box.height;
  const recW = Math.max(1, Math.round(box.width * ratio));

  const resCanvas = new OffscreenCanvas(recW, recH);
  const resCtx = resCanvas.getContext("2d");
  resCtx.drawImage(cropCanvas, 0, 0, recW, recH);
  const imageData = resCtx.getImageData(0, 0, recW, recH);

  // NCHW [1, 3, recH, recW] 텐서, 0~1 정규화 후 (x - 0.5) / 0.5
  const chw = recW * recH;
  const tensor = new Float32Array(3 * chw);
  for (let i = 0; i < chw; i++) {
    tensor[i] = (imageData.data[i * 4] / 255 - 0.5) / 0.5;
    tensor[chw + i] = (imageData.data[i * 4 + 1] / 255 - 0.5) / 0.5;
    tensor[2 * chw + i] = (imageData.data[i * 4 + 2] / 255 - 0.5) / 0.5;
  }

  return { tensor, width: recW, height: recH };
}

// ──────────────────────────────────────────────────────────────
// 2. DBNet 후처리: Probability Map → BBox 배열
// ──────────────────────────────────────────────────────────────

/**
 * DBNet 출력(확률 맵)에서 텍스트 바운딩 박스 배열 추출.
 * @param {Float32Array} probMap - [1, 1, H, W] 확률 맵
 * @param {number} mapW - 확률 맵 너비
 * @param {number} mapH - 확률 맵 높이
 * @param {number} origW - 원본 이미지 너비
 * @param {number} origH - 원본 이미지 높이
 * @returns {Array<{x: number, y: number, width: number, height: number, score: number}>}
 */
export function dbnetPostProcess(probMap, mapW, mapH, origW, origH, {
  thresh = 0.3,
  boxThresh = 0.6,
  unclipRatio = 1.5,
  minSize = 3,
} = {}) {
  // 1) 이진화
  const bitmap = new Uint8Array(mapW * mapH);
  for (let i = 0; i < bitmap.length; i++) {
    bitmap[i] = probMap[i] > thresh ? 1 : 0;
  }

  // 2) 연결 컴포넌트 (8-connected) 라벨링으로 외곽선 대체
  const contours = findConnectedComponents(bitmap, mapW, mapH);

  // 3) 각 컴포넌트에서 BBox 추출
  const boxes = [];
  const scaleX = origW / mapW;
  const scaleY = origH / mapH;

  for (const contour of contours) {
    if (contour.length < minSize) continue;

    // 최소/최대 좌표로 축 정렬 바운딩 박스 계산
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [px, py] of contour) {
      if (px < minX) minX = px;
      if (py < minY) minY = py;
      if (px > maxX) maxX = px;
      if (py > maxY) maxY = py;
    }

    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;
    if (bw < minSize || bh < minSize) continue;

    // Box Score: 해당 영역 내 확률 맵 평균값
    const score = calcBoxScore(probMap, mapW, minX, minY, maxX, maxY);
    if (score < boxThresh) continue;

    // Unclip: 영역 약간 확장
    const area = bw * bh;
    const perimeter = 2 * (bw + bh);
    const d = area * unclipRatio / perimeter;

    const x = Math.max(0, Math.round((minX - d) * scaleX));
    const y = Math.max(0, Math.round((minY - d) * scaleY));
    const x2 = Math.min(origW, Math.round((maxX + d + 1) * scaleX));
    const y2 = Math.min(origH, Math.round((maxY + d + 1) * scaleY));

    if (x2 - x < minSize || y2 - y < minSize) continue;

    boxes.push({ x, y, width: x2 - x, height: y2 - y, score });
  }

  // 큰 영역 → 작은 영역 순 정렬 (NMS 대체)
  boxes.sort((a, b) => (b.width * b.height) - (a.width * a.height));

  return boxes;
}

/**
 * 8-connected 연결 컴포넌트 라벨링.
 * 각 컴포넌트의 경계 픽셀 좌표 배열 반환.
 */
function findConnectedComponents(bitmap, w, h) {
  const labels = new Int32Array(w * h);
  let labelId = 0;
  const components = new Map(); // labelId → [[x,y], ...]

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (bitmap[idx] === 0 || labels[idx] !== 0) continue;

      // BFS flood fill
      labelId++;
      const queue = [[x, y]];
      const pixels = [];
      labels[idx] = labelId;

      while (queue.length > 0) {
        const [cx, cy] = queue.shift();
        pixels.push([cx, cy]);

        // 8방향 이웃
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
            const nIdx = ny * w + nx;
            if (bitmap[nIdx] === 1 && labels[nIdx] === 0) {
              labels[nIdx] = labelId;
              queue.push([nx, ny]);
            }
          }
        }
      }

      if (pixels.length >= 3) {
        components.set(labelId, pixels);
      }
    }
  }

  return Array.from(components.values());
}

/**
 * 바운딩 박스 내부 확률 맵 픽셀 평균값 계산.
 */
function calcBoxScore(probMap, mapW, minX, minY, maxX, maxY) {
  let sum = 0, count = 0;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      sum += probMap[y * mapW + x];
      count++;
    }
  }
  return count > 0 ? sum / count : 0;
}

// ──────────────────────────────────────────────────────────────
// 3. CTC Greedy Decoder
// ──────────────────────────────────────────────────────────────

/**
 * CRNN/SVTR 출력을 CTC Greedy Decoding으로 텍스트 변환.
 * @param {Float32Array} logits - [1, T, C] 형태의 출력
 * @param {number} timeSteps - T (시퀀스 길이)
 * @param {number} numClasses - C (문자 클래스 수, blank 포함)
 * @param {string[]} charDict - 문자 사전 배열 (index 0 = 사전 첫 문자)
 * @returns {{ text: string, confidence: number }}
 */
export function ctcGreedyDecode(logits, timeSteps, numClasses, charDict) {
  let lastIdx = 0; // blank
  let text = "";
  let totalScore = 0;
  let count = 0;

  for (let t = 0; t < timeSteps; t++) {
    let maxIdx = 0;
    let maxVal = -Infinity;
    const offset = t * numClasses;
    for (let c = 0; c < numClasses; c++) {
      if (logits[offset + c] > maxVal) {
        maxVal = logits[offset + c];
        maxIdx = c;
      }
    }
    // blank=0 건너뛰기, 연속 반복 축약
    if (maxIdx > 0 && maxIdx !== lastIdx) {
      const ch = charDict[maxIdx - 1];
      if (ch !== undefined) {
        text += ch;
        totalScore += maxVal;
        count++;
      }
    }
    lastIdx = maxIdx;
  }

  return { text, confidence: count > 0 ? totalScore / count : 0 };
}

// ──────────────────────────────────────────────────────────────
// 4. 유틸리티
// ──────────────────────────────────────────────────────────────

/** Base64 DataURL → ImageBitmap */
function loadImage(base64DataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = base64DataUrl;
  });
}

/**
 * 사전 파일(텍스트) 로드 → 문자 배열.
 * @param {string} url - chrome.runtime.getURL(...)
 * @returns {Promise<string[]>}
 */
export async function loadDictionary(url) {
  const res = await fetch(url);
  const text = await res.text();
  const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);
  // PaddleOCR 표준: 마지막에 공백 문자 추가
  lines.push(" ");
  return lines;
}
