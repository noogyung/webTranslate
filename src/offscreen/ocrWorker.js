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

// 언어 → 모델/사전 매핑
const REC_MODELS = {
  ko: { model: "korean_PP-OCRv3_rec_infer.onnx", dict: "korean_dict.txt" },
  ja: { model: "japan_PP-OCRv3_rec_infer.onnx", dict: "japan_dict.txt" },
  zh: { model: "ch_PP-OCRv4_rec_infer.onnx", dict: "ppocr_keys_v1.txt" },
  en: { model: "en_PP-OCRv3_rec_infer.onnx", dict: "en_dict.txt" },
};

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
  const modelUrl = chrome.runtime.getURL("src/models/ch_PP-OCRv4_det_infer.onnx");
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

async function ensureRecSession(lang) {
  const targetLang = REC_MODELS[lang] ? lang : "ja";
  if (recSession && currentRecLang === targetLang) return;

  if (recSession) {
    recSession.release();
    recSession = null;
    charDict = null;
    console.log(`[OCR Worker] Rec 모델 해제: ${currentRecLang}`);
  }

  initOrt();
  const config = REC_MODELS[targetLang];
  const modelUrl = chrome.runtime.getURL(`src/models/${config.model}`);
  console.log("[OCR Worker] Rec 모델 로드 시작:", modelUrl);
  const response = await fetch(modelUrl);
  if (!response.ok) throw new Error(`Rec 모델 다운로드 실패: HTTP ${response.status} (${config.model})`);
  const buffer = await response.arrayBuffer();
  console.log("[OCR Worker] Rec 모델 크기:", (buffer.byteLength / 1024 / 1024).toFixed(1), "MB");
  recSession = await ort.InferenceSession.create(buffer, {
    executionProviders: ["wasm"],
  });

  const dictUrl = chrome.runtime.getURL(`src/models/${config.dict}`);
  const dictRes = await fetch(dictUrl);
  if (!dictRes.ok) throw new Error(`사전 파일 다운로드 실패: HTTP ${dictRes.status} (${config.dict})`);
  const dictText = await dictRes.text();
  charDict = dictText.split("\n").map(l => l.trim()).filter(l => l.length > 0);
  charDict.push(" ");

  currentRecLang = targetLang;
  console.log(`[OCR Worker] Rec 모델 로드 완료: ${targetLang} (${config.model}, 사전 ${charDict.length}자) — inputs:`, recSession.inputNames, "outputs:", recSession.outputNames);
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
  const canvas = new OffscreenCanvas(box.width, box.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height);

  const ratio = recH / box.height;
  const recW = Math.max(1, Math.round(box.width * ratio));
  const resCanvas = new OffscreenCanvas(recW, recH);
  const resCtx = resCanvas.getContext("2d");
  resCtx.drawImage(canvas, 0, 0, recW, recH);
  const imageData = resCtx.getImageData(0, 0, recW, recH);

  const chw = recW * recH;
  const tensor = new Float32Array(3 * chw);
  for (let i = 0; i < chw; i++) {
    tensor[i] = (imageData.data[i * 4] / 255 - 0.5) / 0.5;
    tensor[chw + i] = (imageData.data[i * 4 + 1] / 255 - 0.5) / 0.5;
    tensor[2 * chw + i] = (imageData.data[i * 4 + 2] / 255 - 0.5) / 0.5;
  }
  return { tensor, width: recW, height: recH };
}

// ── DBNet 후처리 ──

function dbnetPostProcess(probMap, mapW, mapH, origW, origH) {
  const thresh = 0.3, boxThresh = 0.6, unclipRatio = 1.5, minSize = 3;

  const bitmap = new Uint8Array(mapW * mapH);
  for (let i = 0; i < bitmap.length; i++) {
    bitmap[i] = probMap[i] > thresh ? 1 : 0;
  }

  const components = findConnectedComponents(bitmap, mapW, mapH);
  const boxes = [];
  const scaleX = origW / mapW;
  const scaleY = origH / mapH;

  for (const pixels of components) {
    if (pixels.length < minSize * minSize) continue;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [px, py] of pixels) {
      if (px < minX) minX = px;
      if (py < minY) minY = py;
      if (px > maxX) maxX = px;
      if (py > maxY) maxY = py;
    }

    const bw = maxX - minX + 1, bh = maxY - minY + 1;
    if (bw < minSize || bh < minSize) continue;

    let sum = 0;
    for (const [px, py] of pixels) sum += probMap[py * mapW + px];
    const score = sum / pixels.length;
    if (score < boxThresh) continue;

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

  boxes.sort((a, b) => a.y - b.y || a.x - b.x);
  return boxes;
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
  await ensureRecSession(lang);
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
  const results = [];
  for (const box of boxes) {
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
      if (decoded.text.trim().length > 0) {
        results.push({
          text: decoded.text.trim(),
          confidence: decoded.confidence,
          bbox: box,
        });
      }
    } catch (e) {
      console.warn("[OCR Worker] Rec 실패:", e.message, box);
    }
  }

  const tRec = performance.now();
  console.log(`[OCR Worker] 완료 — ${results.length}블록 | 로드=${Math.round(tLoad - t0)}ms Det=${Math.round(tDet - tLoad)}ms 후처리=${Math.round(tPost - tDet)}ms Rec=${Math.round(tRec - tPost)}ms 합계=${Math.round(tRec - t0)}ms`);

  return results;
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

console.log("[OCR Worker] Offscreen OCR Worker 초기화 완료 — ort 존재:", typeof ort !== "undefined");
