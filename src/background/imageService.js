import { translateImageWithVision, locateBoundingBoxesWithVision } from "../api/image/vision.js";
import { translatePremiumGemini, translatePremiumOpenAI, incrementImageCount } from "../api/image/imageTranslate.js";
import { runCustomOcrServer } from "../api/image/customOcrServer.js";
import { translateTextArray } from "./translationService.js";
import { cleanOcrTextForTranslation } from "../utils/cleaner.js";
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
      const ocrBlocks = ocrResult.blocks;
      const texts = ocrBlocks
        .map(b => cleanOcrTextForTranslation(b.text))
        .filter(t => t.length > 0);
      const translations = await translateTextArray(texts, settings);

      result = ocrBlocks.map((block, i) => ({
        originalText: block.text,
        translatedText: translations[i] || block.text,
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
    const texts = ocrBlocks
      .map(b => cleanOcrTextForTranslation(b.text))
      .filter(t => t.length > 0);

    const translations = await translateTextArray(texts, settings);

    result = ocrBlocks.map((block, i) => ({
      originalText: block.text,
      translatedText: translations[i] || block.text,
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

export async function handlePremiumTranslation(message, sender) {
  let base64DataUrl = message.imageUrl;
  if (!base64DataUrl.startsWith("data:")) {
    base64DataUrl = await fetchImageAsBase64(
      message.imageUrl,
      message.pageUrl || sender?.tab?.url || ""
    );
  }

  const engine = message.imagePremEngine || "gemini";

  // ── Step 1: 엔진별 OCR 모델로 텍스트 번역 쌍 확보 ──────────
  let translationPairs = [];
  try {
    console.log(`[WT Premium] Step 1: ${engine} OCR 시작...`);

    // Step 1 OCR 모드 결정 (Other의 경우 vision_api 모드로 1-Pass)
    const step1Mode = engine === "openai" ? "openai"
                    : engine === "other"  ? "other_vision"
                    : "gemini";

    const ocrBlocks = await translateImageWithVision({
      base64DataUrl,
      naturalWidth: message.naturalWidth || 0,
      naturalHeight: message.naturalHeight || 0,
      mode: step1Mode,
      // ── Gemini OCR 모델 (Step 1 전용) ──
      apiKey: message.apiKey || "",
      geminiModel: message.imagePremGeminiOcrModel || "",
      // ── OpenAI OCR 모델 (Step 1 전용) ──
      openaiApiKey: message.openaiApiKey || "",
      openaiModel: message.imagePremOpenAIOcrModel || "",
      // ── Other Vision API (OCR 역할) ──
      otherVisionUrl: message.imagePremOtherUrl || "",
      otherVisionKey: message.imagePremOtherKey || "",
      otherVisionModel: message.imagePremOtherOcrModel || "",
      targetLang: message.targetLang || "ko",
    });

    translationPairs = ocrBlocks
      .filter(b => b.originalText?.trim() && b.translatedText?.trim())
      .map(b => ({ original: b.originalText, translated: b.translatedText }));

    console.log(`[WT Premium] Step 1 완료: ${translationPairs.length}개 번역 쌍`);
  } catch (ocrErr) {
    console.warn("[WT Premium] Step 1 실패 — 직접 번역(폴백)으로 진행:", ocrErr.message);
  }

  // ── Step 2: 엔진별 합성 모델로 이미지 생성 ──────────────────
  console.log(`[WT Premium] Step 2: ${engine} 이미지 합성 (${translationPairs.length}쌍 주입)`);
  let translatedDataUrl;

  if (engine === "openai") {
    translatedDataUrl = await translatePremiumOpenAI({
      base64DataUrl,
      apiKey: message.openaiApiKey || "",
      model: message.imagePremOpenAISynthModel || "gpt-image-2",
      targetLang: message.targetLang || "ko",
      translationPairs,
    });
  } else if (engine === "other") {
    // Other 고급: 사설 이미지 생성 서버 (SD WebUI / ComfyUI / OpenAI Edit 호환)
    // 현재는 OpenAI images/edits 규격으로 사설 서버에 위임
    translatedDataUrl = await translatePremiumOpenAI({
      base64DataUrl,
      apiKey: message.imagePremOtherKey || "",
      model: message.imagePremOtherSynthModel || "sd_inpainting_model",
      targetLang: message.targetLang || "ko",
      translationPairs,
      // 사설 서버 URL 오버라이드 (imageTranslate.js가 지원하면 사용)
      overrideUrl: message.imagePremOtherUrl || "",
    });
  } else {
    // Gemini (기본)
    translatedDataUrl = await translatePremiumGemini({
      base64DataUrl,
      apiKey: message.apiKey || "",
      model: message.imagePremGeminiSynthModel || "gemini-3.1-flash-image",
      targetLang: message.targetLang || "ko",
      translationPairs,
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

  if (refererUrl && chrome.declarativeNetRequest) {
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
                { header: "Referer", operation: "set", value: refererUrl },
              ],
            },
            condition: {
              urlFilter: urlPattern,
              resourceTypes: ["xmlhttprequest", "image", "other"],
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
    if (refererUrl) headers["Referer"] = refererUrl;

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
