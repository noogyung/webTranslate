import { translateImageWithVision, locateBoundingBoxesWithVision } from "../api/image/vision.js";
import { translatePremiumGemini, translatePremiumOpenAI, translateCropGemini, translateCropOpenAI, translateSpriteGemini, translateSpriteOpenAI, buildCropPrompt, buildAnnotatedPrompt, incrementImageCount } from "../api/image/imageTranslate.js";
import { runCustomOcrServer } from "../api/image/customOcrServer.js";
import { translateTextArray } from "./translationService.js";
import { cleanOcrTextForTranslation } from "../utils/cleaner.js";
import { applyLocalDictionary } from "../utils/dictionary.js";
import { getSettings } from "../options/storage.js";

/* ── Step D: 세션 내 번역 결과 LRU 캐시 (최대 20개) ─────────── */
const _translationCache = new Map();
const CACHE_MAX = 20;

/* ── Offscreen Document 관리 (PP-OCR WASM 추론용) ────────────── */
let _offscreenCreating = null;

async function ensureOffscreenDocument() {
  // 이미 존재하면 스킵
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [chrome.runtime.getURL("src/offscreen/ocr.html")],
  });
  if (existingContexts.length > 0) return;

  // 생성 중이면 대기
  if (_offscreenCreating) {
    await _offscreenCreating;
    return;
  }

  _offscreenCreating = chrome.offscreen.createDocument({
    url: "src/offscreen/ocr.html",
    reasons: ["WORKERS"],
    justification: "PP-OCR WASM ONNX 추론 실행",
  });
  await _offscreenCreating;
  _offscreenCreating = null;
  console.log("[WT] Offscreen Document 생성 완료");
}

/**
 * 타겟 번역 언어로부터 소스 언어를 추측 (OCR 모델 선택용).
 * 이미지 번역은 주로 ja→ko, zh→ko 등의 패턴이므로
 * targetLang이 ko이면 소스는 ja(일본어)로 추정.
 */
function guessSourceLang(targetLang) {
  if (targetLang === "ko" || targetLang === "en") return "ja"; // 일→한/영 번역이 주 사용 패턴
  if (targetLang === "ja") return "zh"; // 중→일
  return "ja"; // 기본값
}

async function translateTextArrayWithRetry(texts, settings) {
  try {
    return await translateTextArray(texts, settings);
  } catch (err) {
    console.warn("[WT] 텍스트 번역 1차 실패, 1초 후 재시도:", err.message);
    await new Promise(r => setTimeout(r, 1000));
    return await translateTextArray(texts, settings);
  }
}

/* ── 압축 좌표계 → 원본 좌표계 스케일업 ──────────────────────
 * vision API는 압축본(compressedWidth×compressedHeight)을 기준으로
 * 정규화 좌표를 px로 역변환하므로, 원본 치수로 다시 스케일업 필요.
 * compressedWidth/Height가 없으면 noop.
 * ─────────────────────────────────────────────────────────── */
function scaleBlocksToOriginal(blocks, message) {
  const cw = message.compressedWidth;
  const ch = message.compressedHeight;
  const nw = message.naturalWidth;
  const nh = message.naturalHeight;
  if (!cw || !ch || !nw || !nh || (cw === nw && ch === nh)) return blocks;

  const sx = nw / cw;
  const sy = nh / ch;

  return (blocks || []).map(block => {
    if (!block.eraseBox) return block;
    const b = block.eraseBox;
    return {
      ...block,
      eraseBox: {
        x: Math.round(b.x * sx),
        y: Math.round(b.y * sy),
        width: Math.round(b.width * sx),
        height: Math.round(b.height * sy),
        _wasNormalized: b._wasNormalized,
      },
    };
  });
}

function cacheGet(key) {
  if (!_translationCache.has(key)) return null;
  // LRU: hit 시 맨 뒤로 이동
  const val = _translationCache.get(key);
  _translationCache.delete(key);
  _translationCache.set(key, val);
  return val;
}

function cacheSet(key, val) {
  if (_translationCache.has(key)) _translationCache.delete(key);
  if (_translationCache.size >= CACHE_MAX) {
    _translationCache.delete(_translationCache.keys().next().value);
  }
  _translationCache.set(key, val);
}

export async function handleBoundingBoxesLocation(message, sender) {
  let base64DataUrl = message.imageUrl;
  if (!base64DataUrl.startsWith("data:")) {
    const refererUrl = message.pageUrl || sender?.tab?.url || "";
    base64DataUrl = await fetchImageAsBase64(message.imageUrl, refererUrl);
  }

  let openaiModel = message.openaiModel || "gpt-4o-mini";
  if (openaiModel.toLowerCase().includes("nano")) {
    openaiModel = "gpt-4o";
  }

  return await locateBoundingBoxesWithVision({
    base64DataUrl,
    naturalWidth: message.naturalWidth,
    naturalHeight: message.naturalHeight,
    mode: message.mode || "gemini",
    apiKey: message.apiKey || "",
    geminiModel: message.geminiModel || "gemini-3.6-flash",
    openaiApiKey: message.openaiApiKey || "",
    openaiModel: openaiModel,
  });
}

export async function handleImageTranslation(message, sender) {
  let base64DataUrl = message.imageUrl;

  if (!base64DataUrl.startsWith("data:")) {
    const refererUrl = message.pageUrl || sender?.tab?.url || "";
    base64DataUrl = await fetchImageAsBase64(message.imageUrl, refererUrl);
  }

  let openaiModel = message.openaiModel || "gpt-4o-mini";
  if (openaiModel.toLowerCase().includes("nano")) {
    openaiModel = "gpt-4o";
  }

  return await translateImageWithVision({
    base64DataUrl,
    mode: message.mode || "gemini",
    apiKey: message.apiKey || "",
    geminiModel: message.geminiModel || "",
    openaiApiKey: message.openaiApiKey || "",
    openaiModel: openaiModel,
    targetLang: message.targetLang || "ko",
  });
}

export async function handleStandardTranslation(message, sender) {
  // LRU 캐시 조회
  const cacheKey = `${message.imageUrl}::${message.targetLang || "ko"}::${message.imageStdEngine || "gemini"}`;
  const cached = cacheGet(cacheKey);
  if (cached) {
    console.log("[WT Cache] 캐시 HIT — 즉시 반환");
    return cached;
  }

  let base64DataUrl = message.imageUrl;
  if (!base64DataUrl.startsWith("data:")) {
    base64DataUrl = await fetchImageAsBase64(
      message.imageUrl,
      message.pageUrl || sender?.tab?.url || ""
    );
  }

  const engine = message.imageStdEngine || "gemini";
  let result;

  if (engine === "free") {
    // PP-OCR WASM: Offscreen Document에서 OCR 실행 → 메인 번역기로 텍스트 위임
    await ensureOffscreenDocument();
    const ocrResult = await chrome.runtime.sendMessage({
      action: "runFreeOcr",
      imageDataUrl: base64DataUrl,
      lang: guessSourceLang(message.targetLang),
    });

    if (!ocrResult?.success || !ocrResult.blocks?.length) {
      console.warn("[WT] Free OCR 결과 없음 — 빈 배열 반환");
      result = [];
    } else {
      const settings = await getSettings();
      const validBlocks = ocrResult.blocks
        .map(b => ({ ...b, cleanedText: cleanOcrTextForTranslation(b.text) }))
        .filter(b => b.cleanedText.length > 0);
      const texts = validBlocks.map(b => b.cleanedText);
      const translations = await translateTextArrayWithRetry(texts, settings);

      result = validBlocks.map((block, i) => ({
        originalText: block.text,
        translatedText: applyLocalDictionary(translations[i] || block.text, settings.customDict),
        eraseBox: block.bbox,
        orientation: block.bbox.width < block.bbox.height ? "vertical" : "horizontal",
      }));
      // OCR는 원본 해상도 기준 좌표 반환 → scaleBlocksToOriginal 불필요할 수 있으나
      // 압축 이미지를 전송했다면 스케일업 필요
      result = scaleBlocksToOriginal(result, message);
    }

  } else if (engine === "other" && message.imageStdOtherType === "ocr_server") {
    // Other [OCR 서버] 방식: 사설 OCR 서버 → 메인 번역기 위임
    const ocrBlocks = await runCustomOcrServer({
      base64DataUrl,
      serverUrl: message.imageStdOtherUrl || "",
      apiKey: message.imageStdOtherKey || "",
      naturalWidth: message.compressedWidth || message.naturalWidth,
      naturalHeight: message.compressedHeight || message.naturalHeight,
    });

    const settings = await getSettings();
    const validBlocks = ocrBlocks
      .map(b => ({ ...b, cleanedText: cleanOcrTextForTranslation(b.text) }))
      .filter(b => b.cleanedText.length > 0);
    const texts = validBlocks.map(b => b.cleanedText);

    const translations = await translateTextArray(texts, settings);

    result = validBlocks.map((block, i) => ({
      originalText: block.text,
      translatedText: applyLocalDictionary(translations[i] || block.text, settings.customDict),
      eraseBox: block.bbox,
      orientation: "horizontal",
    }));
    result = scaleBlocksToOriginal(result, message);

  } else {
    // Gemini / OpenAI / Other [Vision API] 방식: 1-Pass 직접 번역
    const mode = engine === "openai" ? "openai"
               : engine === "other" ? "other_vision"
               : "gemini";

    result = await translateImageWithVision({
      base64DataUrl,
      // AI가 실제로 본 이미지 치수로 좌표 역변환
      naturalWidth: message.compressedWidth || message.naturalWidth,
      naturalHeight: message.compressedHeight || message.naturalHeight,
      mode,
      apiKey: message.apiKey || "",
      geminiModel: message.imageStdGeminiModel || "",
      openaiApiKey: message.openaiApiKey || "",
      openaiModel: message.imageStdOpenAIModel || "",
      otherVisionUrl: message.imageStdOtherUrl || "",
      otherVisionKey: message.imageStdOtherKey || "",
      otherVisionModel: message.imageStdOtherModel || "",
      targetLang: message.targetLang || "ko",
    });
    // 압축 좌표 → 원본 좌표로 스케일업
    result = scaleBlocksToOriginal(result, message);
  }

  cacheSet(cacheKey, result);
  await incrementImageCount("standard");
  return result;
}

/**
 * 겹치는 번역 쌍 병합 (Vision OCR의 줄 단위/말풍선 단위 중복 박스 정리).
 * - 한 박스가 다른 박스에 거의 포함: 원문이 더 긴 쪽만 유지
 * - 부분 겹침(작은 쪽 면적의 30% 이상): 합집합 박스 + 텍스트 연결
 * 더 이상 병합할 쌍이 없을 때까지 반복.
 */
function mergeOverlappingPairs(pairs) {
  const list = pairs.map(p => ({ ...p, bbox: { x: p.bbox.x, y: p.bbox.y, width: p.bbox.width, height: p.bbox.height } }));

  const overlapRatio = (a, b) => {
    const ix = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
    const iy = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
    const inter = ix * iy;
    const minArea = Math.min(a.width * a.height, b.width * b.height) || 1;
    return inter / minArea;
  };

  let merged = true;
  while (merged) {
    merged = false;
    outer:
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const ratio = overlapRatio(list[i].bbox, list[j].bbox);
        if (ratio < 0.3) continue;

        if (ratio >= 0.8) {
          // 포함 관계: 면적이 큰 쪽을 기준 박스로 유지.
          // 작은 쪽 원문이 큰 쪽 원문에 이미 포함되면 제거, 아니면 텍스트를 이어 붙여
          // "박스 안 이미지 = 원문/번역 텍스트"가 항상 대응되도록 한다.
          const areaI = list[i].bbox.width * list[i].bbox.height;
          const areaJ = list[j].bbox.width * list[j].bbox.height;
          const big = areaI >= areaJ ? i : j;
          const small = big === i ? j : i;
          const norm = (s) => String(s).replace(/\s+/g, "");
          if (!norm(list[big].original).includes(norm(list[small].original))) {
            list[big] = {
              ...list[big],
              original: `${list[big].original}\n${list[small].original}`,
              translated: `${list[big].translated}\n${list[small].translated}`,
            };
          }
          list.splice(small, 1);
        } else {
          // 부분 겹침: 합집합
          const a = list[i], b = list[j];
          const x1 = Math.min(a.bbox.x, b.bbox.x);
          const y1 = Math.min(a.bbox.y, b.bbox.y);
          const x2 = Math.max(a.bbox.x + a.bbox.width, b.bbox.x + b.bbox.width);
          const y2 = Math.max(a.bbox.y + a.bbox.height, b.bbox.y + b.bbox.height);
          list[i] = {
            original: `${a.original}\n${b.original}`,
            translated: `${a.translated}\n${b.translated}`,
            bbox: { x: x1, y: y1, width: x2 - x1, height: y2 - y1 },
          };
          list.splice(j, 1);
        }
        merged = true;
        break outer;
      }
    }
  }
  return list;
}

export async function handlePremiumTranslation(message, sender) {
  const T = { start: Date.now() };
  let base64DataUrl = message.imageUrl;
  if (!base64DataUrl.startsWith("data:")) {
    base64DataUrl = await fetchImageAsBase64(
      message.imageUrl,
      message.pageUrl || sender?.tab?.url || ""
    );
  }

  const ocrEngine = message.imageStdEngine || "free";
  const synthEngine = message.imagePremSynthEngine || message.imagePremEngine || "gemini";

  // ══════════════════════════════════════════════════════════════
  // Step 1: OCR + 텍스트 번역 (ocrEngine에 따라 분기)
  // ══════════════════════════════════════════════════════════════
  let translationPairs = [];

  T.ocr0 = Date.now();
  console.log(`[WT Premium Hybrid] Step 1: OCR [${ocrEngine}] + 번역...`);

  if (ocrEngine === "free") {
    // PP-OCR 로컬 WASM
    try {
      await ensureOffscreenDocument();
      const ocrResult = await chrome.runtime.sendMessage({
        action: "runFreeOcr",
        imageDataUrl: base64DataUrl,
        lang: guessSourceLang(message.targetLang),
      });
      T.ocr1 = Date.now();

      if (!ocrResult?.success || !ocrResult.blocks?.length) {
        console.warn("[WT Premium Hybrid] PP-OCR 미검출 → 폴백");
        return await handlePremiumFallback(base64DataUrl, synthEngine, message);
      }

      const ocrBlocks = ocrResult.blocks;
      console.log(`[WT Premium Hybrid] Step 1a PP-OCR: ${ocrBlocks.length}개 블록 (${T.ocr1 - T.ocr0}ms)`);

      // LLM 텍스트 번역
      T.llm0 = Date.now();
      const settings = await getSettings();
      const validBlocks = ocrBlocks
        .map(b => ({ ...b, cleanedText: cleanOcrTextForTranslation(b.text) }))
        .filter(b => b.cleanedText.length > 0);
      const texts = validBlocks.map(b => b.cleanedText);
      const translations = await translateTextArrayWithRetry(texts, settings);
      T.llm1 = Date.now();

      translationPairs = validBlocks.map((block, i) => ({
        original: block.text,
        translated: applyLocalDictionary(translations[i] || block.text, settings.customDict),
        bbox: block.bbox,
      }));

      const untranslated = translationPairs.filter(p => p.original === p.translated).length;
      if (untranslated > 0) {
        console.warn(`[WT Premium Hybrid] ⚠️ ${untranslated}/${translationPairs.length}개 번역 미적용`);
      }
      console.log(`[WT Premium Hybrid] Step 1b LLM번역: ${translationPairs.length}개 쌍 (${T.llm1 - T.llm0}ms)`);
    } catch (ocrErr) {
      console.warn("[WT Premium Hybrid] PP-OCR 실패 → 폴백:", ocrErr.message);
      return await handlePremiumFallback(base64DataUrl, synthEngine, message);
    }
  } else {
    // Gemini / GPT Vision API OCR
    try {
      await ensureOffscreenDocument();
      const visionMode = ocrEngine === "openai" ? "openai" : "gemini";
      const ocrBlocks = await translateImageWithVision({
        base64DataUrl,
        naturalWidth: message.compressedWidth || message.naturalWidth || 0,
        naturalHeight: message.compressedHeight || message.naturalHeight || 0,
        mode: visionMode,
        apiKey: message.apiKey || "",
        geminiModel: message.imageStdGeminiModel || "",
        openaiApiKey: message.openaiApiKey || "",
        openaiModel: message.imageStdOpenAIModel || "",
        targetLang: message.targetLang || "ko",
      });
      T.ocr1 = Date.now();
      T.llm0 = T.ocr1;
      T.llm1 = T.ocr1;

      translationPairs = ocrBlocks
        .filter(b => b.originalText?.trim() && b.translatedText?.trim() && b.eraseBox)
        .map(b => ({ original: b.originalText, translated: b.translatedText, bbox: b.eraseBox }));
      const beforeMerge = translationPairs.length;
      translationPairs = mergeOverlappingPairs(translationPairs);
      if (translationPairs.length !== beforeMerge) {
        console.log(`[WT Premium Hybrid] 겹침 병합: ${beforeMerge} → ${translationPairs.length}개`);
      }

      console.log(`[WT Premium Hybrid] Step 1 Vision [${ocrEngine}]: ${translationPairs.length}개 쌍 (${T.ocr1 - T.ocr0}ms)`);

      if (!translationPairs.length) {
        console.warn("[WT Premium Hybrid] Vision OCR 미검출 → 폴백");
        return await handlePremiumFallback(base64DataUrl, synthEngine, message);
      }
    } catch (visionErr) {
      console.warn("[WT Premium Hybrid] Vision OCR 실패 → 폴백:", visionErr.message);
      return await handlePremiumFallback(base64DataUrl, synthEngine, message);
    }
  }

  // ══════════════════════════════════════════════════════════════
  // Step 2: 이미지 합성 (synthMode: crop = 박스별 개별 호출 / annotated = 번호표 전체 이미지)
  // ══════════════════════════════════════════════════════════════
  const synthMode = message.imagePremSynthMode === "crop" ? "crop" : "annotated";
  const lang = message.targetLang || "ko";
  const boxes = translationPairs.map(p => p.bbox);

  // 2a. 조각 준비 (오프스크린: 원본 복사 → 자르기/번호표 → 표준 크기 패딩)
  T.sprite0 = Date.now();
  const prep = await chrome.runtime.sendMessage({
    action: "prepareSlices",
    imageDataUrl: base64DataUrl,
    mode: synthMode,
    boxes,
    padding: 15,
    padToStandard: synthEngine === "openai",
  });
  if (!prep?.success) throw new Error("조각 준비 실패: " + (prep?.error || "unknown"));
  T.sprite1 = Date.now();
  console.log(`[WT Premium Hybrid] 조각 준비 [${synthMode}/${synthEngine}]: ${prep.slices.length}개 (${T.sprite1 - T.sprite0}ms)`);

  // 2b. 조각별 이미지 생성 API 호출 (동시 3개)
  T.api0 = Date.now();
  const callOne = async (slice, idx) => {
    const pairs = slice.boxIdx.map(i => ({
      ...translationPairs[i],
      regionW: translationPairs[i].bbox.width,
      regionH: translationPairs[i].bbox.height,
    }));
    const promptOverride = synthMode === "crop"
      ? buildCropPrompt(pairs[0].original, pairs[0].translated, lang)
      : buildAnnotatedPrompt(pairs, lang);

    console.log(`[WT Premium Hybrid] 조각 ${idx + 1}/${prep.slices.length} 호출 (영역 ${pairs.length}개, ${slice.apiSize || "원본 크기"})`);
    if (synthEngine === "openai") {
      return await translateSpriteOpenAI({
        base64DataUrl: slice.dataUrl,
        apiKey: message.openaiApiKey || "",
        model: message.imagePremOpenAISynthModel || "gpt-image-2",
        targetLang: lang,
        apiSize: slice.apiSize,
        promptOverride,
      });
    }
    return await translateSpriteGemini({
      base64DataUrl: slice.dataUrl,
      apiKey: message.apiKey || "",
      model: message.imagePremGeminiSynthModel || "gemini-3.1-flash-image",
      targetLang: lang,
      promptOverride,
    });
  };

  const tasks = prep.slices.map((slice, idx) => async () => {
    try {
      return { ok: true, url: await callOne(slice, idx) };
    } catch (e) {
      console.warn(`[WT Premium Hybrid] 조각 ${idx + 1} 실패:`, e.message);
      return { ok: false, error: e.message };
    }
  });
  const results = await runWithConcurrency(tasks, 3);
  T.api1 = Date.now();
  console.log(`[WT Premium Hybrid] Image Gen API: ${T.api1 - T.api0}ms (성공 ${results.filter(r => r.ok).length}/${results.length})`);

  const items = results
    .map((r, i) => (r.ok ? { translatedUrl: r.url, meta: prep.slices[i].meta } : null))
    .filter(Boolean);
  if (!items.length) {
    throw new Error("이미지 생성 실패: " + (results.find(r => !r.ok)?.error || "unknown"));
  }

  // 2c. 합성 (오프스크린: 박스 영역만 페더링 합성)
  T.comp0 = Date.now();
  const compositeResult = await chrome.runtime.sendMessage({
    action: "compositeSlices",
    originalDataUrl: base64DataUrl,
    items,
  });
  if (!compositeResult?.success) throw new Error("합성 실패: " + (compositeResult?.error || "unknown"));
  T.comp1 = Date.now();

  const total = T.comp1 - T.start;
  console.log(
    `[WT Premium Hybrid] ✅ 완료 [${synthMode}] — 총 ${total}ms\n` +
    `  OCR: ${(T.ocr1 - T.ocr0)}ms | 번역: ${(T.llm1 - T.llm0)}ms\n` +
    `  조각 준비: ${(T.sprite1 - T.sprite0)}ms\n` +
    `  Image Gen API: ${(T.api1 - T.api0)}ms\n` +
    `  합성: ${(T.comp1 - T.comp0)}ms`
  );

  await incrementImageCount("premium");
  return compositeResult.dataUrl;
}

/**
 * 세마포어 기반 동시 실행 제한.
 */
async function runWithConcurrency(tasks, limit = 3) {
  const results = [];
  const executing = new Set();

  for (const task of tasks) {
    const p = task().then(result => {
      executing.delete(p);
      return result;
    });
    executing.add(p);
    results.push(p);
    if (executing.size >= limit) await Promise.race(executing);
  }
  return Promise.all(results);
}

/**
 * 기존 전체 이미지 방식 폴백 (PP-OCR 미검출/실패 시).
 */
async function handlePremiumFallback(base64DataUrl, synthEngine, message) {
  // Step 1 폴백: Vision API OCR
  let translationPairs = [];
  try {
    const ocrEngine = message.imageStdEngine || "free";
    const fallbackOcrEngine = ocrEngine === "free" ? synthEngine : ocrEngine;
    const step1Mode = fallbackOcrEngine === "other" ? "other_vision" : fallbackOcrEngine;
    const ocrBlocks = await translateImageWithVision({
      base64DataUrl,
      naturalWidth: message.naturalWidth || 0,
      naturalHeight: message.naturalHeight || 0,
      mode: step1Mode,
      apiKey: message.apiKey || "",
      geminiModel: message.imageStdGeminiModel || "",
      openaiApiKey: message.openaiApiKey || "",
      openaiModel: message.imageStdOpenAIModel || "",
      otherVisionUrl: message.imageStdOtherUrl || "",
      otherVisionKey: message.imageStdOtherKey || "",
      otherVisionModel: message.imageStdOtherModel || "",
      targetLang: message.targetLang || "ko",
    });
    translationPairs = ocrBlocks
      .filter(b => b.originalText?.trim() && b.translatedText?.trim())
      .map(b => ({ original: b.originalText, translated: b.translatedText }));
  } catch (e) {
    console.warn("[WT Premium] 폴백 Step 1도 실패:", e.message);
  }

  // Step 2: 전체 이미지 방식
  let translatedDataUrl;
  if (synthEngine === "openai") {
    translatedDataUrl = await translatePremiumOpenAI({
      base64DataUrl, apiKey: message.openaiApiKey || "",
      model: message.imagePremOpenAISynthModel || "gpt-image-2",
      targetLang: message.targetLang || "ko", translationPairs,
    });
  } else {
    translatedDataUrl = await translatePremiumGemini({
      base64DataUrl, apiKey: message.apiKey || "",
      model: message.imagePremGeminiSynthModel || "gemini-3.1-flash-image",
      targetLang: message.targetLang || "ko", translationPairs,
    });
  }

  await incrementImageCount("premium");
  return translatedDataUrl;
}

/* ── Step E: 이미지 합성 전용 (translationPairs 이미 확보된 상태) */
export async function handlePremiumStep2Translation(message, sender) {
  let base64DataUrl = message.imageUrl;

  if (!base64DataUrl.startsWith("data:")) {
    const refererUrl = message.pageUrl || sender?.tab?.url || "";
    base64DataUrl = await fetchImageAsBase64(message.imageUrl, refererUrl);
  }

  const engine = message.premiumEngine || "gemini";
  const translationPairs = message.translationPairs || [];

  let translatedDataUrl;
  if (engine === "openai") {
    translatedDataUrl = await translatePremiumOpenAI({
      base64DataUrl,
      apiKey: message.openaiApiKey || "",
      model: message.premiumModel || "gpt-image-2",
      targetLang: message.targetLang || "ko",
      translationPairs,
    });
  } else {
    translatedDataUrl = await translatePremiumGemini({
      base64DataUrl,
      apiKey: message.apiKey || "",
      model: message.premiumModel || "gemini-3.1-flash-image",
      targetLang: message.targetLang || "ko",
      translationPairs,
    });
  }

  await incrementImageCount("premium");
  return translatedDataUrl;
}

export async function fetchImageAsBase64(imageUrl, refererUrl) {
  const ruleId = 9999;
  let effectiveReferer = refererUrl;
  try {
    const u = new URL(imageUrl);
    if (u.hostname.endsWith("pximg.net")) {
      effectiveReferer = "https://www.pixiv.net/";
    }
  } catch {}

  if (effectiveReferer && chrome.declarativeNetRequest) {
    try {
      // urlFilter에 전체 URL 대신 hostname 기반 패턴 사용
      // declarativeNetRequest는 ||hostname/* 형식 지원
      const urlObj = new URL(imageUrl);
      const urlPattern = `||${urlObj.hostname}/*`;

      await chrome.declarativeNetRequest.updateSessionRules({
        removeRuleIds: [ruleId],
        addRules: [
          {
            id: ruleId,
            priority: 1,
            action: {
              type: "modifyHeaders",
              requestHeaders: [
                { header: "Referer", operation: "set", value: effectiveReferer },
              ],
            },
            condition: {
              urlFilter: urlPattern,
              resourceTypes: ["xmlhttprequest", "image", "other", "main_frame", "sub_frame"],
            },
          },
        ],
      });
    } catch (ruleErr) {
      console.warn("[WebTranslator] DeclarativeNetRequest 규칙 설정 실패:", ruleErr);
    }
  }

  try {
    // 서비스 워커에서는 Referer 헤더 직접 설정도 가능 (CSP 우회용 이중 처리)
    const headers = {};
    if (effectiveReferer) headers["Referer"] = effectiveReferer;

    const response = await fetch(imageUrl, {
      headers,
      credentials: "omit",
    });

    if (!response.ok) {
      throw new Error(
        `이미지 다운로드 실패 (HTTP ${response.status}) — ` +
        `이미지 URL: ${imageUrl.substring(0, 80)}`
      );
    }

    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("이미지 Base64 변환 실패"));
      reader.readAsDataURL(blob);
    });
  } finally {
    if (chrome.declarativeNetRequest) {
      try {
        await chrome.declarativeNetRequest.updateSessionRules({
          removeRuleIds: [ruleId],
        });
      } catch {}
    }
  }
}
