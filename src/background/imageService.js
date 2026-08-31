import { translateImageWithVision, locateBoundingBoxesWithVision } from "../api/index.js";
import { translatePremiumGemini, translatePremiumOpenAI, incrementImageCount } from "../api/imageTranslate.js";

/* ── Step D: 세션 내 번역 결과 LRU 캐시 (최대 20개) ─────────── */
const _translationCache = new Map();
const CACHE_MAX = 20;

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
    geminiModel: message.geminiModel || "gemini-3.6-flash",
    openaiApiKey: message.openaiApiKey || "",
    openaiModel: openaiModel,
    userSpecifiedModel: message.openaiModel || "",
    targetLang: message.targetLang || "ko",
  });
}

export async function handleStandardTranslation(message, sender) {
  // Step D: 캐시 조회 (URL + targetLang 키)
  const cacheKey = `${message.imageUrl}::${message.targetLang || "ko"}`;
  const cached = cacheGet(cacheKey);
  if (cached) {
    console.log("[WT Cache] 캐시 HIT — 즉시 반환");
    return cached;
  }

  let base64DataUrl = message.imageUrl;

  if (!base64DataUrl.startsWith("data:")) {
    const refererUrl = message.pageUrl || sender?.tab?.url || "";
    base64DataUrl = await fetchImageAsBase64(message.imageUrl, refererUrl);
  }

  const result = await translateImageWithVision({
    base64DataUrl,
    naturalWidth: message.naturalWidth,
    naturalHeight: message.naturalHeight,
    mode: message.mode || "gemini",
    apiKey: message.apiKey || "",
    geminiModel: message.geminiModel || "gemini-3.6-flash",
    openaiApiKey: message.openaiApiKey || "",
    openaiModel: message.openaiModel || "gpt-4o-mini",
    targetLang: message.targetLang || "ko",
  });

  cacheSet(cacheKey, result);
  await incrementImageCount("standard");
  return result;
}

export async function handlePremiumTranslation(message, sender) {
  let base64DataUrl = message.imageUrl;

  if (!base64DataUrl.startsWith("data:")) {
    const refererUrl = message.pageUrl || sender?.tab?.url || "";
    base64DataUrl = await fetchImageAsBase64(message.imageUrl, refererUrl);
  }

  // ── Step 1: OCR + 텍스트 번역으로 번역 쌍 확보 ─────────────
  let translationPairs = [];
  try {
    console.log("[WT Premium] Step 1: OCR + 텍스트 번역 시작...");
    const ocrBlocks = await translateImageWithVision({
      base64DataUrl,
      naturalWidth: message.naturalWidth || 0,
      naturalHeight: message.naturalHeight || 0,
      mode: message.mode || "gemini",
      apiKey: message.apiKey || "",
      geminiModel: message.geminiModel || "gemini-3.6-flash",
      openaiApiKey: message.openaiApiKey || "",
      openaiModel: message.openaiModel || "gpt-4o-mini",
      targetLang: message.targetLang || "ko",
    });

    translationPairs = ocrBlocks
      .filter(b => b.originalText?.trim() && b.translatedText?.trim())
      .map(b => ({ original: b.originalText, translated: b.translatedText }));

    console.log(`[WT Premium] Step 1 완료: ${translationPairs.length}개 번역 쌍 확보`);
    console.table(translationPairs.map((p, i) => ({
      "#": i,
      원문: p.original.substring(0, 30),
      번역: p.translated.substring(0, 30),
    })));
  } catch (ocrErr) {
    console.warn("[WT Premium] Step 1 OCR 실패 — 직접 번역(폴백)으로 진행:", ocrErr.message);
  }

  // ── Step 2: 번역 쌍 주입 후 이미지 합성 ────────────────────
  const engine = message.premiumEngine || "gemini";
  let translatedDataUrl;

  console.log(`[WT Premium] Step 2: ${engine} 이미지 합성 (번역 쌍 ${translationPairs.length}개 주입)`);

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
