import {
  translateWithGoogle,
  translateWithGemini,
  translateWithLibre,
  translateWithOpenAI,
  translateWithClaude,
  translateWithOllama,
  translateWithCustom,
  fetchWordDictionary
} from "../api/index.js";

export async function handleTranslation({
  texts,
  targetLang,
  mode,
  apiKey,
  geminiModel,
  openaiApiKey,
  openaiModel,
  claudeApiKey,
  claudeModel,
  ollamaUrl,
  ollamaModel,
  ollamaCustomPrompt,
  libreUrl,
  targetLanguage,
  customApiUrl,
  customApiKey,
  customModel,
}) {
  const startTime = performance.now();
  console.group(`[WebTranslator DEBUG] [Engine: ${mode.toUpperCase()}] 번역 요청 전송 (Target: ${targetLang} / Batch Size: ${texts.length})`);
  console.table(texts.map((t, idx) => ({ Index: idx, OriginalText: t })));
  console.groupEnd();

  let translations;
  const apiOptions = {};

  try {
    let result;
    if (mode === "gemini") {
      result = await translateWithGemini(texts, targetLang, apiKey, geminiModel, apiOptions);
    } else if (mode === "openai") {
      result = await translateWithOpenAI(texts, targetLang, openaiApiKey, openaiModel, apiOptions);
    } else if (mode === "claude") {
      result = await translateWithClaude(texts, targetLang, claudeApiKey, claudeModel, apiOptions);
    } else if (mode === "ollama") {
      result = await translateWithOllama(texts, targetLang, ollamaUrl, ollamaModel, ollamaCustomPrompt, apiOptions);
    } else if (mode === "libre") {
      result = await translateWithLibre(texts, targetLang, libreUrl, apiOptions);
    } else if (mode === "custom") {
      result = await translateWithCustom(texts, targetLang, customApiUrl, customApiKey, customModel, apiOptions);
    } else {
      result = await translateWithGoogle(texts, targetLang, apiOptions);
    }

    let phonetics = [];
    if (Array.isArray(result)) {
      translations = result;
    } else if (result && result.translations) {
      translations = result.translations;
      phonetics = result.phonetics || [];
    } else {
      translations = [];
    }
    const duration = Math.round(performance.now() - startTime);

    console.group(`[WebTranslator DEBUG] [Engine: ${mode.toUpperCase()}] 번역 응답 수신 (소요시간: ${duration}ms)`);
    console.table(texts.map((t, idx) => ({
      Index: idx,
      Original: t,
      Translated: translations[idx] || "(응답 없음)",
      Phonetic: phonetics[idx] || ""
    })));
    console.groupEnd();

    return { translations, phonetics, engine: mode };
  } catch (err) {
    console.error(`[WebTranslator DEBUG] [Engine: ${mode.toUpperCase()}] 번역 실패:`, err);
    throw err;
  }
}

export function handleWordDictionary(message) {
  const apiKey =
    message.mode === "openai" ? message.openaiApiKey :
    message.mode === "claude" ? message.claudeApiKey :
    message.apiKey;
  const modelName =
    message.mode === "openai" ? message.openaiModel :
    message.mode === "claude" ? message.claudeModel :
    message.geminiModel;

  let extraUrl = message.libreUrl || message.ollamaUrl;
  if (message.mode === "custom") {
    extraUrl = `${message.customApiUrl}|${message.customApiKey}|${message.customModel}`;
  }

  return fetchWordDictionary(
    message.word,
    message.targetLang,
    message.mode,
    apiKey,
    modelName,
    extraUrl
  );
}
