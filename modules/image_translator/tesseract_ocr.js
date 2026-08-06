import "../../lib/tesseract.min.js";

/**
 * tesseract_ocr.js — 100% Client-Side Pure WASM Local OCR Engine
 *
 * 특징:
 *  1. 외부 AI API (Gemini/OpenAI LLM) 0% 사용 — 오직 클라이언트 온디바이스 WASM OCR만 사용.
 *  2. 100% 결정론적(Deterministic) — 할루시네이션 0%.
 *  3. 제공된 링크 기술 규격: Tesseract WASM Character & Word Bounding Box Extractor.
 */

let tesseractWorker = null;

/**
 * Tesseract.js 로컬 WASM 워커 생성 및 초기화
 */
async function getTesseractWorker() {
  if (tesseractWorker) return tesseractWorker;

  const tessObj = window.Tesseract || globalThis.Tesseract;
  if (!tessObj) {
    throw new Error("Tesseract WASM 번들이 로드되지 않았습니다.");
  }

  tesseractWorker = await tessObj.createWorker("jpn+eng+kor", 1, {
    logger: (m) => console.log("[WT Local WASM OCR]", m.status, m.progress),
  });

  return tesseractWorker;
}

/**
 * 100% 로컬 클라이언트 WASM OCR을 통한 바운딩 박스 및 텍스트 파악 (AI API 전무)
 * @param {HTMLImageElement} imgEl 
 * @returns {Promise<Array<{box: [number, number, number, number], text: string}>>}
 */
export async function detectTextWithLocalTesseract(imgEl) {
  const width = imgEl.naturalWidth || imgEl.width || imgEl.clientWidth;
  const height = imgEl.naturalHeight || imgEl.height || imgEl.clientHeight;

  if (!width || !height) return [];

  // Canvas 데이터 생성 (CORS 안전 처리)
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return [];

  try {
    ctx.drawImage(imgEl, 0, 0, width, height);
    ctx.getImageData(0, 0, 1, 1);
  } catch {
    const imageUrl = imgEl.src || imgEl.currentSrc;
    if (imageUrl) {
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
        if (freshCtx) {
          freshCtx.drawImage(cleanImg, 0, 0, width, height);
          return runTesseractOnCanvas(freshCanvas);
        }
      }
    }
  }

  return runTesseractOnCanvas(canvas);
}

/**
 * Canvas 이미지를 Tesseract WASM OCR에 전달하여 Word/Line 단위 바운딩 박스 및 텍스트 추출
 */
async function runTesseractOnCanvas(canvas) {
  try {
    const worker = await getTesseractWorker();
    const result = await worker.recognize(canvas);

    const items = [];
    if (result && result.data && Array.isArray(result.data.lines)) {
      result.data.lines.forEach((line) => {
        const text = (line.text || "").replace(/\s+/g, "");
        if (!text) return;

        // 1. Confidence Score Filter (오탐 제거)
        // 만화의 머리카락, 컷선 등은 Tesseract가 인식하더라도 confidence가 매우 낮습니다.
        if (line.confidence < 50) return;

        // 2. CJK / Valid Character Filter (비정상 기호 제거)
        // 텍스트가 특수기호(~, |, /, ', \)로만 이루어져 있다면 쓰레기(Noise)로 간주합니다.
        // 한글, 일본어(히라가나, 가타카나, 한자), 영문 알파벳이 최소 1자 이상 포함되어야 합니다.
        const validCharRegex = /[가-힣ㄱ-ㅎㅏ-ㅣa-zA-Zぁ-んァ-ン一-龥]/;
        if (!validCharRegex.test(text)) return;

        const bb = line.bbox;
        if (bb) {
          items.push({
            box: [bb.y0, bb.x0, bb.y1, bb.x1],
            text: text,
            confidence: line.confidence,
          });
        }
      });
    } else if (result && result.data && Array.isArray(result.data.words)) {
      result.data.words.forEach((word) => {
        const text = (word.text || "").replace(/\s+/g, "");
        if (!text) return;

        if (word.confidence < 50) return;
        const validCharRegex = /[가-힣ㄱ-ㅎㅏ-ㅣa-zA-Zぁ-んァ-ン一-龥]/;
        if (!validCharRegex.test(text)) return;

        const bb = word.bbox;
        if (bb) {
          items.push({
            box: [bb.y0, bb.x0, bb.y1, bb.x1],
            text: text,
            confidence: word.confidence,
          });
        }
      });
    }

    return items;
  } catch (err) {
    console.error("[WebTranslator Local WASM OCR] Tesseract 파싱 실패:", err);
    return [];
  }
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}
