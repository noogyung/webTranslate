/* ────────────────────────────────────────────
 * 이미지 번역 API (고급/일반 공통)
 * ──────────────────────────────────────────── */

import { getLanguageName } from './constants.js';

const IMAGE_STATS_KEY = "wtImageStats";

/**
 * 고급 모드 프롬프트 생성.
 * @param {string} targetLang - 목표 언어 코드
 * @param {Array<{original:string, translated:string}>} translationPairs - 사전 번역 쌍 (있으면 AI 재번역 방지)
 */
export function buildWebtoonPrompt(targetLang, translationPairs = []) {
  const langName = getLanguageName(targetLang);

  let prompt = `You are a professional manga/webtoon image editor and typesetter.\n\n`;

  if (translationPairs.length > 0) {
    // 2단계 모드: 이미 번역된 텍스트를 그대로 사용 (재번역 금지)
    prompt +=
      `The following text translations have been pre-determined by a professional translation engine.\n` +
      `You MUST use EXACTLY these ${langName} translations — do NOT re-translate, paraphrase, or modify them:\n\n`;

    translationPairs.forEach((pair, i) => {
      const orig = pair.original.replace(/\n/g, "\\n");
      const trans = pair.translated.replace(/\n/g, "\\n");
      prompt += `[${i}] "${orig}" → "${trans}"\n`;
    });

    prompt +=
      `\nReplace each original text in the image with its corresponding ${langName} translation EXACTLY as listed above.\n` +
      `If a text block is not in the list, leave it unchanged.\n`;
  } else {
    // 폴백: 직접 번역 (translationPairs 없을 때만)
    prompt += `Translate ALL text in this image to ${langName}.\n`;
  }

  prompt +=
    `\nCRITICAL RULES:\n` +
    `- PRESERVE the original art, backgrounds, character drawings, and panel layout EXACTLY.\n` +
    `- Match the original font style, size, weight, and color as closely as possible.\n` +
    `- For SFX (sound effects): Match the original artistic style (bold, stylized, rotated).\n` +
    `- For transparent/semi-transparent backgrounds: Maintain the same transparency.\n` +
    `- Text must fit within the original bubble/box boundaries without overflow.\n` +
    `- Do NOT add watermarks, borders, or artifacts.\n` +
    `- Output ONLY the modified image with no other content.`;

  return prompt;
}

/**
 * 고급 모드: Gemini Image-to-Image 번역.
 * @param {Array} translationPairs - 사전 번역 쌍 (2단계 파이프라인)
 */
export async function translatePremiumGemini({ base64DataUrl, apiKey, model, targetLang, translationPairs = [] }) {
  const mimeType = base64DataUrl.match(/^data:(image\/[^;]+)/)?.[1] || "image/png";
  const base64Data = base64DataUrl.split(",")[1];
  const prompt = buildWebtoonPrompt(targetLang, translationPairs);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: prompt },
          { inline_data: { mime_type: mimeType, data: base64Data } }
        ]
      }],
      generationConfig: {
        response_modalities: ["IMAGE"],
        temperature: 0.2
      }
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) {
    const errJson = await response.json().catch(() => null);
    const errMsg = errJson?.error?.message || `HTTP ${response.status}`;

    if (response.status === 429) {
      // retryDelay 파싱
      const retryInfo = errJson?.error?.details?.find(d => d["@type"]?.includes("RetryInfo"));
      const retrySec = retryInfo?.retryDelay
        ? parseInt(retryInfo.retryDelay, 10) || 0
        : 0;

      const isFreeTier = errMsg.includes("free_tier");
      if (isFreeTier) {
        throw new Error(
          `고급 모드는 Gemini 유료 플랜이 필요합니다.\n` +
          `Google AI Studio에서 결제를 활성화하거나 일반 모드를 사용하세요.\n` +
          `(모델: ${model})`
        );
      }

      const waitMsg = retrySec > 0 ? ` (${retrySec}초 후 재시도 가능)` : "";
      throw new Error(`Gemini API 요청 한도 초과${waitMsg}. 잠시 후 다시 시도해 주세요.`);
    }

    throw new Error(`Gemini Image API 오류 (${response.status}): ${errMsg.substring(0, 200)}`);
  }

  const data = await response.json();
  const imagePart = data.candidates?.[0]?.content?.parts?.find(p => p.inline_data);

  if (!imagePart) {
    throw new Error("Gemini Image API에서 번역된 이미지를 반환하지 않았습니다.");
  }

  return `data:${imagePart.inline_data.mime_type};base64,${imagePart.inline_data.data}`;
}

/**
 * 고급 모드: OpenAI GPT Image 2 번역.
 * @param {Array} translationPairs - 사전 번역 쌍 (2단계 파이프라인)
 */
export async function translatePremiumOpenAI({ base64DataUrl, apiKey, model, targetLang, translationPairs = [] }) {
  const prompt = buildWebtoonPrompt(targetLang, translationPairs);

  // base64를 Blob으로 변환
  const base64Data = base64DataUrl.split(",")[1];
  const mimeType = base64DataUrl.match(/^data:(image\/[^;]+)/)?.[1] || "image/png";
  const byteChars = atob(base64Data);
  const byteArray = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    byteArray[i] = byteChars.charCodeAt(i);
  }
  const blob = new Blob([byteArray], { type: mimeType });

  const formData = new FormData();
  formData.append("model", model || "gpt-image-2");
  formData.append("prompt", prompt);
  formData.append("image", blob, "image.png");

  const response = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) {
    const errJson = await response.json().catch(() => null);
    const errMsg = errJson?.error?.message || `HTTP ${response.status}`;

    if (response.status === 429) {
      throw new Error(`OpenAI API 요청 한도 초과. 잠시 후 다시 시도해 주세요.\n세부: ${errMsg.substring(0, 120)}`);
    }
    if (response.status === 401) {
      throw new Error("OpenAI API Key가 잘못되었거나 만료되었습니다.");
    }

    throw new Error(`OpenAI Image API 오류 (${response.status}): ${errMsg.substring(0, 200)}`);
  }

  const data = await response.json();
  const imageUrl = data.data?.[0]?.url || data.data?.[0]?.b64_json;

  if (!imageUrl) {
    throw new Error("OpenAI Image API에서 번역된 이미지를 반환하지 않았습니다.");
  }

  // b64_json이면 data URL로 변환
  if (data.data?.[0]?.b64_json) {
    return `data:image/png;base64,${data.data[0].b64_json}`;
  }

  // URL이면 fetch해서 Base64로 변환
  const imgResponse = await fetch(imageUrl);
  const imgBlob = await imgResponse.blob();
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(imgBlob);
  });
}

/**
 * 일일 사용 통계 조회.
 */
export async function getImageDailyStats() {
  return new Promise((resolve) => {
    chrome.storage.local.get([IMAGE_STATS_KEY], (data) => {
      const stats = data[IMAGE_STATS_KEY] || {};
      const today = new Date().toISOString().split("T")[0];
      resolve(stats[today] || { premium: 0, standard: 0 });
    });
  });
}

/**
 * 일일 사용 카운트 증가.
 */
export async function incrementImageCount(mode) {
  return new Promise((resolve) => {
    chrome.storage.local.get([IMAGE_STATS_KEY], (data) => {
      const stats = data[IMAGE_STATS_KEY] || {};
      const today = new Date().toISOString().split("T")[0];

      // 7일 이전 데이터 정리
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 7);
      for (const key of Object.keys(stats)) {
        if (key < cutoff.toISOString().split("T")[0]) delete stats[key];
      }

      if (!stats[today]) stats[today] = { premium: 0, standard: 0 };
      stats[today][mode === "premium" ? "premium" : "standard"]++;

      chrome.storage.local.set({ [IMAGE_STATS_KEY]: stats }, () => {
        resolve(stats[today]);
      });
    });
  });
}
