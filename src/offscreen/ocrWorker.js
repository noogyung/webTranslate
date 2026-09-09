/**
 * src/offscreen/ocrWorker.js
 * Offscreen Document에서 실행되는 PP-OCR ONNX 추론 워커.
 * Background SW로부터 메시지를 수신하여 OCR 수행 후 결과 반환.
 *
 * 메모리 최적화: Det 모델 1개 상시 로드 + Rec 모델은 언어별 1개만 동적 로드.
 */

/* global ort */

// ── 상태 ──
let detSession = null;
let recSession = null;
let currentRecLang = null;
let charDict = null;
let ortInitialized = false;

// PP-OCRv6 small 통합 모델 (50개 언어 단일 모델)
const DET_MODEL = "PP-OCRv6_small_det.onnx";
const REC_MODEL = "PP-OCRv6_small_rec.onnx";
const REC_DICT = "ppocrv6_dict.txt";

// ── ONNX Runtime 초기화 ──
function initOrt() {
  if (ortInitialized) return;
  if (typeof ort === "undefined") {
    throw new Error("ort 전역 객체를 찾을 수 없습니다. ort.min.js가 로드되지 않았습니다.");
  }
  const wasmDir = chrome.runtime.getURL("src/models/");
  console.log("[OCR Worker] WASM 경로:", wasmDir);
  ort.env.wasm.wasmPaths = wasmDir;
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.simd = true;
  ortInitialized = true;
}

async function ensureDetSession() {
  if (detSession) return;
  initOrt();
  const modelUrl = chrome.runtime.getURL(`src/models/${DET_MODEL}`);
  console.log("[OCR Worker] Det 모델 로드 시작:", modelUrl);
  const response = await fetch(modelUrl);
  if (!response.ok) throw new Error(`Det 모델 다운로드 실패: HTTP ${response.status}`);
  const buffer = await response.arrayBuffer();
  console.log("[OCR Worker] Det 모델 크기:", (buffer.byteLength / 1024 / 1024).toFixed(1), "MB");
  detSession = await ort.InferenceSession.create(buffer, {
    executionProviders: ["wasm"],
  });
  console.log("[OCR Worker] Det 모델 로드 완료 — inputs:", detSession.inputNames, "outputs:", detSession.outputNames);
}

async function ensureRecSession() {
  if (recSession) return;

  initOrt();
  const modelUrl = chrome.runtime.getURL(`src/models/${REC_MODEL}`);
  console.log("[OCR Worker] Rec 모델 로드 시작:", modelUrl);
  const response = await fetch(modelUrl);
  if (!response.ok) throw new Error(`Rec 모델 다운로드 실패: HTTP ${response.status} (${REC_MODEL})`);
  const buffer = await response.arrayBuffer();
  console.log("[OCR Worker] Rec 모델 크기:", (buffer.byteLength / 1024 / 1024).toFixed(1), "MB");
  recSession = await ort.InferenceSession.create(buffer, {
    executionProviders: ["wasm"],
  });

  const dictUrl = chrome.runtime.getURL(`src/models/${REC_DICT}`);
  const dictRes = await fetch(dictUrl);
  if (!dictRes.ok) throw new Error(`사전 파일 다운로드 실패: HTTP ${dictRes.status} (${REC_DICT})`);
  const dictText = await dictRes.text();
  // 공백 문자도 유효 사전 항목 — trim/filter 금지, trailing empty line만 제거
  charDict = dictText.split("\n").map(l => l.replace(/\r$/, ""));
  while (charDict.length > 0 && charDict[charDict.length - 1] === "") charDict.pop();

  currentRecLang = "v6";
  console.log(`[OCR Worker] Rec 모델 로드 완료: PP-OCRv6 (${REC_MODEL}, 사전 ${charDict.length}자) — inputs:`, recSession.inputNames, "outputs:", recSession.outputNames);
}

// ── 이미지 전처리 ──

async function loadImageBitmap(base64DataUrl) {
  const res = await fetch(base64DataUrl);
  const blob = await res.blob();
  return createImageBitmap(blob);
}

function preprocessDet(img, maxSide = 960) {
  const origW = img.width, origH = img.height;
  let scale = 1;
  if (Math.max(origW, origH) > maxSide) {
    scale = maxSide / Math.max(origW, origH);
  }
  let newW = Math.ceil(Math.round(origW * scale) / 32) * 32;
  let newH = Math.ceil(Math.round(origH * scale) / 32) * 32;

  const canvas = new OffscreenCanvas(newW, newH);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, newW, newH);
  const imageData = ctx.getImageData(0, 0, newW, newH);

  const mean = [0.485, 0.456, 0.406];
  const std = [0.229, 0.224, 0.225];
  const chw = newW * newH;
  const tensor = new Float32Array(3 * chw);
  for (let i = 0; i < chw; i++) {
    tensor[i] = (imageData.data[i * 4] / 255 - mean[0]) / std[0];
    tensor[chw + i] = (imageData.data[i * 4 + 1] / 255 - mean[1]) / std[1];
    tensor[2 * chw + i] = (imageData.data[i * 4 + 2] / 255 - mean[2]) / std[2];
  }
  return { tensor, width: newW, height: newH, origW, origH };
}

function preprocessRec(img, box, recH = 48) {
  // 1) 원본에서 박스 영역 크롭
  const cropCanvas = new OffscreenCanvas(box.width, box.height);
  const cropCtx = cropCanvas.getContext("2d");
  cropCtx.drawImage(img, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height);

  // 2) 세로 텍스트 감지 → 90° 반시계 회전 (PaddleOCR 표준)
  let srcCanvas = cropCanvas;
  let srcW = box.width, srcH = box.height;
  const isVertical = box.height > box.width * 1.5;

  if (isVertical) {
    // 90° CCW 회전: (x,y) → (y, width-1-x), 결과 크기 height×width
    const rotCanvas = new OffscreenCanvas(box.height, box.width);
    const rotCtx = rotCanvas.getContext("2d");
    rotCtx.translate(0, box.width);
    rotCtx.rotate(-Math.PI / 2);
    rotCtx.drawImage(cropCanvas, 0, 0);
    srcCanvas = rotCanvas;
    srcW = box.height;
    srcH = box.width;
  }

  // 3) 높이를 recH에 맞추고 가로 비율 유지
  const ratio = recH / srcH;
  const recW = Math.max(1, Math.round(srcW * ratio));
  const resCanvas = new OffscreenCanvas(recW, recH);
  const resCtx = resCanvas.getContext("2d");
  resCtx.drawImage(srcCanvas, 0, 0, recW, recH);
  const imageData = resCtx.getImageData(0, 0, recW, recH);

  // 4) NCHW 텐서 생성, [-1, 1] 정규화
  const chw = recW * recH;
  const tensor = new Float32Array(3 * chw);
  for (let i = 0; i < chw; i++) {
    tensor[i] = (imageData.data[i * 4] / 255 - 0.5) / 0.5;
    tensor[chw + i] = (imageData.data[i * 4 + 1] / 255 - 0.5) / 0.5;
    tensor[2 * chw + i] = (imageData.data[i * 4 + 2] / 255 - 0.5) / 0.5;
  }
  return { tensor, width: recW, height: recH, isVertical };
}

// ── DBNet 후처리 ──

function dbnetPostProcess(probMap, mapW, mapH, origW, origH) {
  const thresh = 0.2, boxThresh = 0.4, unclipRatio = 2.0, minSize = 3;

  // 확률 맵 통계 디버그
  let maxProb = 0, sumProb = 0, aboveThreshCount = 0;
  for (let i = 0; i < mapW * mapH; i++) {
    const v = probMap[i];
    if (v > maxProb) maxProb = v;
    sumProb += v;
    if (v > thresh) aboveThreshCount++;
  }
  console.log(`[OCR Worker] ProbMap 통계: ${mapW}×${mapH} | max=${maxProb.toFixed(3)} avg=${(sumProb / (mapW * mapH)).toFixed(4)} | thresh>${thresh}: ${aboveThreshCount}px (${(aboveThreshCount / (mapW * mapH) * 100).toFixed(1)}%)`);

  const bitmap = new Uint8Array(mapW * mapH);
  for (let i = 0; i < bitmap.length; i++) {
    bitmap[i] = probMap[i] > thresh ? 1 : 0;
  }

  const components = findConnectedComponents(bitmap, mapW, mapH);
  const boxes = [];
  const scaleX = origW / mapW;
  const scaleY = origH / mapH;

  console.log(`[OCR Worker] 연결 컴포넌트: ${components.length}개 (scale: ${scaleX.toFixed(2)}×${scaleY.toFixed(2)})`);
  let filteredBySize = 0, filteredByScore = 0;

  for (const pixels of components) {
    if (pixels.length < minSize * minSize) { filteredBySize++; continue; }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [px, py] of pixels) {
      if (px < minX) minX = px;
      if (py < minY) minY = py;
      if (px > maxX) maxX = px;
      if (py > maxY) maxY = py;
    }

    const bw = maxX - minX + 1, bh = maxY - minY + 1;
    if (bw < minSize || bh < minSize) { filteredBySize++; continue; }

    let sum = 0;
    for (const [px, py] of pixels) sum += probMap[py * mapW + px];
    const score = sum / pixels.length;
    if (score < boxThresh) { filteredByScore++; continue; }

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

  console.log(`[OCR Worker] 필터링: 크기=${filteredBySize}, 스코어=${filteredByScore} → ${boxes.length}개 박스 (병합 전)`);

  // NMS: 겹치는 박스 병합 (같은 말풍선의 내/외곽 중복 제거)
  const merged = mergeOverlappingBoxes(boxes, 0.3);
  console.log(`[OCR Worker] 병합: ${boxes.length} → ${merged.length}개 박스`);
  merged.sort((a, b) => a.y - b.y || a.x - b.x);
  return merged;
}

/**
 * 겹치는 박스를 병합 (IoU 기반 NMS).
 * DBNet이 같은 텍스트 영역에서 내/외곽 윤곽을 별도 컴포넌트로 검출하는 문제 해결.
 */
function mergeOverlappingBoxes(boxes, iouThresh = 0.3) {
  if (boxes.length <= 1) return boxes;

  // 스코어 높은 순 정렬
  const sorted = [...boxes].sort((a, b) => b.score - a.score);
  const used = new Array(sorted.length).fill(false);
  const result = [];

  for (let i = 0; i < sorted.length; i++) {
    if (used[i]) continue;
    let merged = { ...sorted[i] };
    used[i] = true;

    // 현재 박스와 겹치는 모든 박스를 합침
    for (let j = i + 1; j < sorted.length; j++) {
      if (used[j]) continue;
      if (calcIoU(merged, sorted[j]) > iouThresh) {
        // 두 박스를 감싸는 최소 직사각형으로 병합
        const x1 = Math.min(merged.x, sorted[j].x);
        const y1 = Math.min(merged.y, sorted[j].y);
        const x2 = Math.max(merged.x + merged.width, sorted[j].x + sorted[j].width);
        const y2 = Math.max(merged.y + merged.height, sorted[j].y + sorted[j].height);
        merged = {
          x: x1, y: y1, width: x2 - x1, height: y2 - y1,
          score: Math.max(merged.score, sorted[j].score),
        };
        used[j] = true;
      }
    }
    result.push(merged);
  }
  return result;
}

function calcIoU(a, b) {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  if (x2 <= x1 || y2 <= y1) return 0;
  const inter = (x2 - x1) * (y2 - y1);
  const areaA = a.width * a.height;
  const areaB = b.width * b.height;
  return inter / (areaA + areaB - inter);
}

function findConnectedComponents(bitmap, w, h) {
  const labels = new Int32Array(w * h);
  let labelId = 0;
  const components = [];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (bitmap[idx] === 0 || labels[idx] !== 0) continue;

      labelId++;
      const stack = [[x, y]];
      const pixels = [];
      labels[idx] = labelId;

      while (stack.length > 0) {
        const [cx, cy] = stack.pop();
        pixels.push([cx, cy]);

        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
            const nIdx = ny * w + nx;
            if (bitmap[nIdx] === 1 && labels[nIdx] === 0) {
              labels[nIdx] = labelId;
              stack.push([nx, ny]);
            }
          }
        }
      }

      if (pixels.length >= 9) {
        components.push(pixels);
      }
    }
  }
  return components;
}

// ── CTC Greedy Decoder ──

function ctcDecode(logits, timeSteps, numClasses) {
  let lastIdx = 0;
  let text = "";
  let totalScore = 0;
  let count = 0;

  for (let t = 0; t < timeSteps; t++) {
    let maxIdx = 0, maxVal = -Infinity;
    const offset = t * numClasses;
    for (let c = 0; c < numClasses; c++) {
      if (logits[offset + c] > maxVal) {
        maxVal = logits[offset + c];
        maxIdx = c;
      }
    }
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

// ── 메인 OCR 파이프라인 ──

async function runOcr(base64DataUrl, lang = "ja") {
  const t0 = performance.now();

  await ensureDetSession();
  await ensureRecSession();
  const tLoad = performance.now();
  console.log(`[OCR Worker] 모델 로드: ${Math.round(tLoad - t0)}ms`);

  const img = await loadImageBitmap(base64DataUrl);
  console.log(`[OCR Worker] 이미지: ${img.width}×${img.height}`);

  // Detection
  const det = preprocessDet(img);
  console.log(`[OCR Worker] Det 전처리: ${det.width}×${det.height} (원본 ${det.origW}×${det.origH})`);
  const detInput = new ort.Tensor("float32", det.tensor, [1, 3, det.height, det.width]);
  const detInputName = detSession.inputNames[0];
  const detResult = await detSession.run({ [detInputName]: detInput });
  const detOutputName = detSession.outputNames[0];
  const probMap = detResult[detOutputName].data;
  const tDet = performance.now();
  console.log(`[OCR Worker] Det 추론: ${Math.round(tDet - tLoad)}ms`);

  // DBNet 후처리
  const boxes = dbnetPostProcess(probMap, det.width, det.height, det.origW, det.origH);
  const tPost = performance.now();
  console.log(`[OCR Worker] 후처리: ${boxes.length}개 박스, ${Math.round(tPost - tDet)}ms`);

  // Recognition
  const rawResults = [];
  for (let bi = 0; bi < boxes.length; bi++) {
    const box = boxes[bi];
    try {
      const rec = preprocessRec(img, box);
      const recInput = new ort.Tensor("float32", rec.tensor, [1, 3, rec.height, rec.width]);
      const recInputName = recSession.inputNames[0];
      const recResult = await recSession.run({ [recInputName]: recInput });
      const recOutputName = recSession.outputNames[0];
      const logits = recResult[recOutputName].data;
      const dims = recResult[recOutputName].dims;
      const timeSteps = dims[1];
      const classes = dims[2];

      const decoded = ctcDecode(logits, timeSteps, classes);
      console.log(`[OCR Worker] Box#${bi}: ${box.x},${box.y} ${box.width}×${box.height}${rec.isVertical ? " [V→H]" : ""} | recInput=${rec.width}×${rec.height} | dims=[${dims}] | text="${decoded.text}" conf=${decoded.confidence.toFixed(2)}`);

      if (decoded.text.trim().length > 0) {
        rawResults.push({
          text: decoded.text.trim(),
          confidence: decoded.confidence,
          bbox: box,
          isVertical: rec.isVertical,
        });
      }
    } catch (e) {
      console.warn(`[OCR Worker] Rec#${bi} 실패:`, e.message, box);
    }
  }

  const tRec = performance.now();

  // ── 후처리: 노이즈 필터 + 인접 박스 그룹화 ──
  const filtered = rawResults.filter(r => r.confidence >= 0.5);
  console.log(`[OCR Worker] 노이즈 필터: ${rawResults.length} → ${filtered.length}개 (conf>=0.5)`);

  const grouped = groupAdjacentBlocks(filtered);
  console.log(`[OCR Worker] 그룹화: ${filtered.length} → ${grouped.length}개 블록`);
  console.log(`[OCR Worker] 완료 — ${grouped.length}블록 | 로드=${Math.round(tLoad - t0)}ms Det=${Math.round(tDet - tLoad)}ms 후처리=${Math.round(tPost - tDet)}ms Rec=${Math.round(tRec - tPost)}ms 합계=${Math.round(tRec - t0)}ms`);

  return grouped;
}

/**
 * 인접한 세로 텍스트 블록을 같은 말풍선으로 그룹화.
 * 조건: 수평 겹침/근접 + 수직 겹침 > 30%.
 * 그룹 내 읽기 순서: 우→좌 (x 내림차순, 만화 세로 텍스트 규칙).
 */
function groupAdjacentBlocks(blocks) {
  if (blocks.length <= 1) return blocks;

  // Union-Find
  const parent = blocks.map((_, i) => i);
  function find(i) { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; }
  function union(a, b) { parent[find(a)] = find(b); }

  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      if (shouldGroup(blocks[i], blocks[j])) union(i, j);
    }
  }

  // 그룹별 수집
  const groups = {};
  for (let i = 0; i < blocks.length; i++) {
    const root = find(i);
    if (!groups[root]) groups[root] = [];
    groups[root].push(blocks[i]);
  }

  // 각 그룹을 하나의 블록으로 병합
  const result = [];
  for (const members of Object.values(groups)) {
    if (members.length === 1) {
      result.push(members[0]);
      continue;
    }

    // 우→좌 정렬 (x 내림차순) — 만화 세로 텍스트 읽기 순서
    members.sort((a, b) => b.bbox.x - a.bbox.x);

    // 바운딩 박스 합산
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    let confSum = 0;
    for (const m of members) {
      x1 = Math.min(x1, m.bbox.x);
      y1 = Math.min(y1, m.bbox.y);
      x2 = Math.max(x2, m.bbox.x + m.bbox.width);
      y2 = Math.max(y2, m.bbox.y + m.bbox.height);
      confSum += m.confidence;
    }

    result.push({
      text: members.map(m => m.text).join("\n"),
      confidence: confSum / members.length,
      bbox: { x: x1, y: y1, width: x2 - x1, height: y2 - y1, score: members[0].bbox.score },
      isVertical: members[0].isVertical,
    });
  }

  result.sort((a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x);
  return result;
}

function shouldGroup(a, b) {
  const ax1 = a.bbox.x, ax2 = a.bbox.x + a.bbox.width;
  const bx1 = b.bbox.x, bx2 = b.bbox.x + b.bbox.width;
  const ay1 = a.bbox.y, ay2 = a.bbox.y + a.bbox.height;
  const by1 = b.bbox.y, by2 = b.bbox.y + b.bbox.height;

  // 수평: 겹침 또는 간격 < 큰 박스 너비의 50%
  const hOverlap = Math.min(ax2, bx2) - Math.max(ax1, bx1);
  const maxW = Math.max(a.bbox.width, b.bbox.width);
  if (hOverlap < -maxW * 0.5) return false; // 너무 떨어짐

  // 수직: 겹침 > 작은 박스 높이의 30%
  const vOverlap = Math.min(ay2, by2) - Math.max(ay1, by1);
  const minH = Math.min(a.bbox.height, b.bbox.height);
  if (vOverlap < minH * 0.3) return false;

  return true;
}

// ── 메시지 핸들러 ──

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action !== "runFreeOcr") return false;

  runOcr(message.imageDataUrl, message.lang || "ja")
    .then(results => sendResponse({ success: true, blocks: results }))
    .catch(err => {
      console.error("[OCR Worker] 오류:", err?.message || err, err?.stack || "");
      sendResponse({ success: false, error: String(err?.message || err) });
    });

  return true;
});

// ── 크롭/합성/스프라이트 메시지 핸들러 (고급 하이브리드 파이프라인용) ──

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "cropBoxes") {
    cropBoxes(message.imageDataUrl, message.boxes, message.padding || 10)
      .then(crops => sendResponse({ success: true, crops }))
      .catch(err => sendResponse({ success: false, error: String(err?.message || err) }));
    return true;
  }

  if (message.action === "compositeCrops") {
    compositeCrops(message.originalDataUrl, message.crops)
      .then(dataUrl => sendResponse({ success: true, dataUrl }))
      .catch(err => sendResponse({ success: false, error: String(err?.message || err) }));
    return true;
  }

  if (message.action === "buildSpriteSheet") {
    buildSpriteSheet(message.crops, message.gap || 4)
      .then(result => sendResponse({ success: true, ...result }))
      .catch(err => sendResponse({ success: false, error: String(err?.message || err) }));
    return true;
  }

  if (message.action === "splitSpriteSheet") {
    splitSpriteSheet(message.dataUrl, message.layout, message.cropBboxes)
      .then(crops => sendResponse({ success: true, crops }))
      .catch(err => sendResponse({ success: false, error: String(err?.message || err) }));
    return true;
  }
});

/**
 * 원본 이미지에서 bbox별 크롭 생성.
 * @param {string} imageDataUrl - 원본 이미지 base64
 * @param {Array<{x,y,width,height}>} boxes - 크롭 영역 배열
 * @param {number} padding - 주변 여백 (px)
 * @returns {Array<{bbox, dataUrl}>} 크롭 결과
 */
async function cropBoxes(imageDataUrl, boxes, padding) {
  const img = await loadImageBitmap(imageDataUrl);
  const crops = [];

  for (const box of boxes) {
    // 패딩 적용 (이미지 경계 클램프)
    const x = Math.max(0, box.x - padding);
    const y = Math.max(0, box.y - padding);
    const x2 = Math.min(img.width, box.x + box.width + padding);
    const y2 = Math.min(img.height, box.y + box.height + padding);
    const w = x2 - x;
    const h = y2 - y;

    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, x, y, w, h, 0, 0, w, h);

    const blob = await canvas.convertToBlob({ type: "image/png" });
    const reader = new FileReader();
    const dataUrl = await new Promise(resolve => {
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });

    crops.push({
      bbox: { x, y, width: w, height: h },
      originalBbox: box,
      dataUrl,
    });
  }

  console.log(`[OCR Worker] 크롭 완료: ${crops.length}개 (padding=${padding}px)`);
  img.close();
  return crops;
}

/**
 * 번역된 크롭들을 원본 이미지 위에 합성.
 * @param {string} originalDataUrl - 원본 이미지 base64
 * @param {Array<{bbox:{x,y,width,height}, dataUrl:string}>} crops - 번역된 크롭 배열
 * @returns {string} 합성된 이미지 base64 dataUrl
 */
async function compositeCrops(originalDataUrl, crops) {
  const bgImg = await loadImageBitmap(originalDataUrl);
  const canvas = new OffscreenCanvas(bgImg.width, bgImg.height);
  const ctx = canvas.getContext("2d");

  // 원본 이미지 배경
  ctx.drawImage(bgImg, 0, 0);
  bgImg.close();

  // 번역된 크롭 오버레이
  for (const crop of crops) {
    try {
      const cropImg = await loadImageBitmap(crop.dataUrl);
      ctx.drawImage(cropImg, crop.bbox.x, crop.bbox.y, crop.bbox.width, crop.bbox.height);
      cropImg.close();
    } catch (e) {
      console.warn("[OCR Worker] 크롭 합성 실패:", e.message, crop.bbox);
    }
  }

  const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.95 });
  const reader = new FileReader();
  const dataUrl = await new Promise(resolve => {
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });

  console.log(`[OCR Worker] 합성 완료: ${crops.length}개 크롭`);
  return dataUrl;
}

/**
 * 크롭들을 세로로 쌓아 스프라이트 시트 생성.
 * API 출력 사이즈 왜곡 방지를 위해 표준 사이즈로 패딩.
 * @param {Array<{dataUrl, bbox}>} crops - 크롭 배열
 * @param {number} gap - 크롭 간 간격 (px)
 * @returns {{ dataUrl, layout, apiSize }}
 */
async function buildSpriteSheet(crops, gap) {
  // 각 크롭 이미지 로드 + 치수 파악
  const images = [];
  for (const crop of crops) {
    const img = await loadImageBitmap(crop.dataUrl);
    images.push({ img, width: img.width, height: img.height, bbox: crop.bbox });
  }

  const contentWidth = Math.max(...images.map(i => i.width));
  let contentHeight = 0;
  const regions = [];

  for (let i = 0; i < images.length; i++) {
    regions.push({ y: contentHeight, width: images[i].width, height: images[i].height });
    contentHeight += images[i].height;
    if (i < images.length - 1) contentHeight += gap;
  }

  // 표준 API 사이즈 선택 (OpenAI gpt-image-2: 1024×1024, 1024×1536, 1536×1024)
  const STANDARD_SIZES = [
    { w: 1024, h: 1024 },
    { w: 1024, h: 1536 },
    { w: 1536, h: 1024 },
  ];

  // 콘텐츠가 들어가는 최소 표준 사이즈 선택
  let bestSize = STANDARD_SIZES.find(s => contentWidth <= s.w && contentHeight <= s.h);
  if (!bestSize) {
    // 표준 사이즈에 안 들어가면 비례 축소
    const scale = Math.min(1536 / contentWidth, 1536 / contentHeight);
    bestSize = contentWidth > contentHeight
      ? { w: 1536, h: 1024 }
      : { w: 1024, h: 1536 };
    // 리전 좌표 축소
    for (const r of regions) {
      r.y = Math.round(r.y * scale);
      r.width = Math.round(r.width * scale);
      r.height = Math.round(r.height * scale);
    }
    contentHeight = Math.round(contentHeight * scale);
  }

  const canvasW = bestSize.w;
  const canvasH = bestSize.h;

  // 캔버스 생성 (패딩 영역은 회색)
  const canvas = new OffscreenCanvas(canvasW, canvasH);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#E8E8E8";
  ctx.fillRect(0, 0, canvasW, canvasH);

  // 콘텐츠를 좌상단에 배치
  const scaleX = bestSize === STANDARD_SIZES.find(s => contentWidth <= s.w && contentHeight <= s.h) ? 1 : Math.min(canvasW / contentWidth, canvasH / contentHeight);

  for (let i = 0; i < images.length; i++) {
    const drawW = Math.round(images[i].width * scaleX);
    const drawH = Math.round(images[i].height * scaleX);
    const drawY = Math.round(regions[i].y);
    ctx.drawImage(images[i].img, 0, drawY, drawW, drawH);
    images[i].img.close();

    // 구분선
    if (i < images.length - 1 && gap > 0) {
      ctx.fillStyle = "#808080";
      ctx.fillRect(0, drawY + drawH, canvasW, Math.round(gap * scaleX));
      ctx.fillStyle = "#E8E8E8";
    }
  }

  const blob = await canvas.convertToBlob({ type: "image/png" });
  const reader = new FileReader();
  const dataUrl = await new Promise(resolve => {
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });

  const layout = {
    regions,
    spriteWidth: canvasW,
    spriteHeight: canvasH,
    contentWidth: Math.round(contentWidth * scaleX),
    contentHeight: Math.round(contentHeight * scaleX),
    gap,
  };
  const apiSize = `${canvasW}x${canvasH}`;
  console.log(`[OCR Worker] 스프라이트 시트: ${canvasW}×${canvasH}px (콘텐츠: ${layout.contentWidth}×${layout.contentHeight}, ${crops.length}개 크롭, gap=${gap})`);
  return { dataUrl, layout, apiSize };
}

/**
 * 번역된 스프라이트 시트를 개별 크롭으로 분할.
 * 출력 해상도가 입력과 다를 수 있으므로 비례 스케일링 적용.
 * @param {string} dataUrl - 번역된 스프라이트 base64
 * @param {{ regions, spriteWidth, spriteHeight }} layout - 원본 레이아웃
 * @param {Array<{x,y,width,height}>} cropBboxes - 원본 이미지 상의 크롭 좌표
 * @returns {Array<{bbox, dataUrl}>}
 */
async function splitSpriteSheet(dataUrl, layout, cropBboxes) {
  const img = await loadImageBitmap(dataUrl);
  const sx = img.width / layout.spriteWidth;
  const sy = img.height / layout.spriteHeight;

  console.log(`[OCR Worker] 스프라이트 분할: 입력 ${layout.spriteWidth}×${layout.spriteHeight} → 출력 ${img.width}×${img.height} (scale ${sx.toFixed(2)}×${sy.toFixed(2)})`);

  const results = [];
  for (let i = 0; i < layout.regions.length; i++) {
    const r = layout.regions[i];
    const cy = Math.round(r.y * sy);
    const cw = Math.round(r.width * sx);
    const ch = Math.round(r.height * sy);

    const canvas = new OffscreenCanvas(cw, ch);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, cy, cw, ch, 0, 0, cw, ch);

    const blob = await canvas.convertToBlob({ type: "image/png" });
    const reader = new FileReader();
    const cropUrl = await new Promise(resolve => {
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });

    results.push({ bbox: cropBboxes[i], dataUrl: cropUrl });
  }

  img.close();
  console.log(`[OCR Worker] 스프라이트 분할 완료: ${results.length}개 크롭`);
  return results;
}

console.log("[OCR Worker] Offscreen OCR Worker 초기화 완료 — ort 존재:", typeof ort !== "undefined");
