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
  const available = await fetchAvailableGeminiModels(apiKey).catch(() => []);
  if (available.length === 0) return preferredModel || "gemini-flash-lite-latest";

  if (preferredModel && available.includes(preferredModel)) {
    return preferredModel;
  }

  const valid =
    available.find((m) => m.includes("flash-lite-latest")) ||
    available.find((m) => m.includes("flash-latest")) ||
    available.find((m) => m.includes("2.5") && m.includes("flash")) ||
    available.find((m) => m.includes("2.0") && m.includes("flash")) ||
    available.find((m) => m.includes("flash")) ||
    available[0];

  return valid || preferredModel || "gemini-flash-lite-latest";
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
    const response = await _geminiRequestWithRetry(batch.texts, langName, apiKey, activeModel, 0, new Set(), options);
    
    if (options.isPopup && options.showPhonetics) {
      return response;
    }

    response.forEach((t, j) => {
      results[batch.startIdx + j] = t;
    });
  }

  return results;
}

async function _geminiRequestWithRetry(texts, langName, apiKey, modelName, attempt = 0, blacklisted = new Set(), options = {}) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  try {
    return await _geminiRequest(texts, langName, url, options);
  } catch (err) {
    const is404 = err.message.includes("404") || err.message.includes("is not found") || err.message.includes("not supported");
    const isQuotaZero = err.message.includes("limit: 0") || err.message.includes("limit:0") || err.message.includes("limit: 3");
    const is429 = err.message.includes("429") || err.message.includes("Quota exceeded") || err.message.includes("RESOURCE_EXHAUSTED") || err.message.includes("503") || err.message.includes("overloaded");

    if (is404 || isQuotaZero) {
      blacklisted.add(modelName);
      if (attempt < 3) {
        console.warn(`[WebTranslator] 모델 '${modelName}' 불가 ➔ 블랙리스트 등록 [${Array.from(blacklisted).join(', ')}]`);
        const availableModels = await fetchAvailableGeminiModels(apiKey).catch(() => []);
        
        const validCandidates = availableModels.filter((m) => !blacklisted.has(m));
        
        const fallback = validCandidates.find((m) => m.includes("2.0") && m.includes("flash")) ||
                         validCandidates.find((m) => m.includes("flash")) ||
                         validCandidates.find((m) => m.includes("pro")) ||
                         validCandidates[0];

        if (fallback) {
          console.warn(`[WebTranslator] 대체 가용 모델 '${fallback}'(으)로 자동 전환하여 재시도`);
          return _geminiRequestWithRetry(texts, langName, apiKey, fallback, attempt + 1, blacklisted, options);
        }
      }
    }

    if (is429) {
      if (attempt < 2) {
        const waitMs = 1500 * Math.pow(2, attempt);
        console.warn(`[WebTranslator] Gemini 429 — ${waitMs}ms 대기 후 재시도 (${attempt + 1}/2)`);
        await new Promise((r) => setTimeout(r, waitMs));
        return _geminiRequestWithRetry(texts, langName, apiKey, modelName, attempt + 1, blacklisted, options);
      }
      
      blacklisted.add(modelName);
      const availableModels = await fetchAvailableGeminiModels(apiKey).catch(() => []);
      const validCandidates = availableModels.filter((m) => !blacklisted.has(m));
      const fallback = validCandidates.find((m) => m.includes("2.0") && m.includes("flash")) ||
                       validCandidates.find((m) => m.includes("flash")) ||
                       validCandidates[0];
      if (fallback) {
        console.warn(`[WebTranslator] 모델 '${modelName}' 429/503 ➔ 대체 가용 모델 '${fallback}'(으)로 전환`);
        return _geminiRequestWithRetry(texts, langName, apiKey, fallback, attempt + 1, blacklisted, options);
      }

      throw new Error(`Gemini API 요청 한도 초과 또는 일시적 서버 과부하 (429/503)`);
    }

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

  let translations;
  try {
    translations = JSON.parse(rawText);
  } catch {
    throw new Error("Gemini 응답을 JSON으로 파싱할 수 없습니다.");
  }

  if (options.isPopup && options.showPhonetics) {
    if (!Array.isArray(translations.translations)) throw new Error("Gemini 응답이 유효한 JSON 형식이 아닙니다 (translations 키 없음).");
    return {
      translations: translations.translations,
      phonetics: Array.isArray(translations.phonetics) ? translations.phonetics : null,
    };
  }

  if (!Array.isArray(translations)) {
    throw new Error("Gemini 응답이 배열 형식이 아닙니다.");
  }

  while (translations.length < texts.length) translations.push("");
  return translations.slice(0, texts.length);
}

export async function fetchGeminiDictionary(word, targetLang, apiKey, modelName, attempt = 0, blacklisted = new Set()) {
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
    
    const is404 = errStr.includes("404") || errStr.includes("is not found") || errStr.includes("not supported");
    const isQuotaZero = errStr.includes("limit: 0") || errStr.includes("limit:0") || errStr.includes("limit: 3");
    const is429 = errStr.includes("429") || errStr.includes("Quota exceeded") || errStr.includes("RESOURCE_EXHAUSTED") || errStr.includes("503") || errStr.includes("overloaded");

    if (is404 || isQuotaZero || is429) {
      if (attempt < 2) {
        blacklisted.add(activeModel);
        const availableModels = await fetchAvailableGeminiModels(apiKey).catch(() => []);
        const validCandidates = availableModels.filter((m) => !blacklisted.has(m));
        
        const fallback = validCandidates.find((m) => m.includes("2.0") && m.includes("flash")) ||
                         validCandidates.find((m) => m.includes("flash")) ||
                         validCandidates[0];
                         
        if (fallback) {
          if (is429) {
            const waitMs = 1500 * Math.pow(2, attempt);
            console.warn(`[WebTranslator] Gemini Dictionary 429/503 — ${waitMs}ms 대기 후 대체 모델 '${fallback}'(으)로 재시도 (${attempt + 1}/2)`);
            await new Promise((r) => setTimeout(r, waitMs));
          } else {
            console.warn(`[WebTranslator] 사전 모델 '${activeModel}' 불가 ➔ 대체 모델 '${fallback}'(으)로 재시도`);
          }
          return fetchGeminiDictionary(word, targetLang, apiKey, fallback, attempt + 1, blacklisted);
        }
      }
    }
    
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
