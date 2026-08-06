import { getLanguageName } from '../constants.js';
import { buildTranslationPrompt, buildDictionaryPrompt } from '../prompts.js';

const GEMINI_BATCH = 200;

export async function fetchAvailableGeminiModels(apiKey) {
  if (!apiKey) throw new Error("Gemini API 키가 입력되지 않았습니다.");
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error?.message || `HTTP ${response.status}`);
  }
  const data = await response.json();
  if (!Array.isArray(data.models)) return [];

  return data.models
    .filter((m) => {
      const name = m.name.toLowerCase();
      const isGenerate = m.supportedGenerationMethods?.includes("generateContent");
      const isNonText = name.includes("-tts") || name.includes("-audio") || name.includes("embed") || name.includes("-realtime");
      return isGenerate && !isNonText;
    })
    .map((m) => m.name.replace(/^models\//, ""));
}

export async function getValidGeminiModel(apiKey, preferredModel) {
  // 사용자가 지정한 모델을 최우선으로 사용하며 임의로 다른 모델로 전환하지 않음
  return preferredModel || "gemini-flash-lite-latest";
}

export async function translateWithGemini(texts, targetLang, apiKey, modelName = "gemini-2.0-flash", options = {}) {
  if (!apiKey) {
    throw new Error("Gemini API 키가 설정되지 않았습니다. 옵션 페이지에서 설정해 주세요.");
  }

  const langName = getLanguageName(targetLang);
  const activeModel = modelName || "gemini-2.0-flash";

  const batches = [];
  for (let i = 0; i < texts.length; i += GEMINI_BATCH) {
    batches.push({ texts: texts.slice(i, i + GEMINI_BATCH), startIdx: i });
  }

  const results = new Array(texts.length).fill("");

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    if (i > 0) {
      await new Promise((r) => setTimeout(r, 800));
    }
    const response = await _geminiRequestWithRetry(batch.texts, langName, apiKey, activeModel, 0, options);
    
    response.forEach((t, j) => {
      results[batch.startIdx + j] = t;
    });
  }

  return results;
}

async function _geminiRequestWithRetry(texts, langName, apiKey, modelName, attempt = 0, options = {}) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  try {
    return await _geminiRequest(texts, langName, url, options);
  } catch (err) {
    const is429 = err.message.includes("429") || err.message.includes("Quota exceeded") || err.message.includes("RESOURCE_EXHAUSTED") || err.message.includes("503") || err.message.includes("overloaded");

    if (is429) {
      if (attempt < 2) {
        const waitMs = 1500 * Math.pow(2, attempt);
        console.warn(`[WebTranslator] Gemini 429/503 — ${waitMs}ms 대기 후 동일 모델('${modelName}')로 재시도 (${attempt + 1}/2)`);
        await new Promise((r) => setTimeout(r, waitMs));
        return _geminiRequestWithRetry(texts, langName, apiKey, modelName, attempt + 1, options);
      }
      throw new Error(`Gemini API 요청 한도 초과 또는 일시적 서버 과부하 (429/503)`);
    }

    // 404, QuotaZero 등 다른 에러는 자동 대체하지 않고 즉시 에러 반환
    throw err;
  }
}

async function _geminiRequest(texts, langName, url, options = {}) {
  const prompt = buildTranslationPrompt(langName, "gemini", "", options) + `\n\nInput:\n${JSON.stringify(texts)}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" },
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    const errMsg = errData.error?.message || `Gemini API HTTP ${response.status}`;
    throw new Error(`${response.status} ${errMsg}`);
  }

  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) throw new Error("Gemini API에서 유효한 응답을 받지 못했습니다.");

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error("Gemini 응답을 JSON으로 파싱할 수 없습니다.");
  }

  let translations;
  if (Array.isArray(parsed)) {
    translations = parsed;
  } else if (parsed && Array.isArray(parsed.translations)) {
    translations = parsed.translations;
  } else {
    translations = parsed;
  }

  if (!Array.isArray(translations)) {
    throw new Error("Gemini 응답이 배열 형식이 아닙니다.");
  }

  while (translations.length < texts.length) translations.push("");
  return translations.slice(0, texts.length);
}

export async function fetchGeminiDictionary(word, targetLang, apiKey, modelName, attempt = 0) {
  const langName = getLanguageName(targetLang);
  const activeModel = await getValidGeminiModel(apiKey, modelName);

  const prompt = buildDictionaryPrompt(word, langName);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" },
    }),
  });

  if (!response.ok) {
    const errObj = await response.json().catch(() => ({}));
    const errMsg = errObj.error?.message || `HTTP ${response.status}`;
    const errStr = `Gemini(${activeModel}) ${response.status}: ${errMsg}`;
    
    const is429 = errStr.includes("429") || errStr.includes("Quota exceeded") || errStr.includes("RESOURCE_EXHAUSTED") || errStr.includes("503") || errStr.includes("overloaded");

    if (is429) {
      if (attempt < 2) {
        const waitMs = 1500 * Math.pow(2, attempt);
        console.warn(`[WebTranslator] Gemini Dictionary 429/503 — ${waitMs}ms 대기 후 동일 모델('${activeModel}')로 재시도 (${attempt + 1}/2)`);
        await new Promise((r) => setTimeout(r, waitMs));
        return fetchGeminiDictionary(word, targetLang, apiKey, activeModel, attempt + 1);
      }
    }
    
    // 다른 모델로의 자동 전환 로직 제거 (실패 시 즉시 예외 반환)
    throw new Error(errStr);
  }

  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) throw new Error("Gemini 사전 응답이 비어있습니다.");

  const cleanJsonStr = rawText
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  const parsed = JSON.parse(cleanJsonStr);
  if (Array.isArray(parsed.definitions)) {
    parsed.definitions = parsed.definitions.slice(0, 3);
  }
  return parsed;
}
