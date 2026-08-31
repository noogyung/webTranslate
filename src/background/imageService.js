import { translateImageWithVision, locateBoundingBoxesWithVision } from "../api/index.js";
import { translatePremiumGemini, translatePremiumOpenAI, incrementImageCount } from "../api/imageTranslate.js";

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

  await incrementImageCount("standard");
  return result;
}

export async function handlePremiumTranslation(message, sender) {
  let base64DataUrl = message.imageUrl;

  if (!base64DataUrl.startsWith("data:")) {
    const refererUrl = message.pageUrl || sender?.tab?.url || "";
    base64DataUrl = await fetchImageAsBase64(message.imageUrl, refererUrl);
  }

  const engine = message.premiumEngine || "gemini";
  let translatedDataUrl;

  if (engine === "openai") {
    translatedDataUrl = await translatePremiumOpenAI({
      base64DataUrl,
      apiKey: message.openaiApiKey || "",
      model: message.premiumModel || "gpt-image-2",
      targetLang: message.targetLang || "ko",
    });
  } else {
    translatedDataUrl = await translatePremiumGemini({
      base64DataUrl,
      apiKey: message.apiKey || "",
      model: message.premiumModel || "gemini-3.1-flash-image",
      targetLang: message.targetLang || "ko",
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
