import {
  translateWithGoogle,
  translateWithGemini,
  translateWithLibre,
  translateWithOpenAI,
  translateWithClaude,
  translateWithOllama,
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
  translateAsReplace,
  targetLanguage,
}) {
  const startTime = performance.now();
  console.group(`[WebTranslator DEBUG] [Engine: ${mode.toUpperCase()}] 번역 요청 전송 (Target: ${targetLang} / Batch Size: ${texts.length})`);
  console.table(texts.map((t, idx) => ({ Index: idx, OriginalText: t })));
  console.groupEnd();

  let translations;
  const isPopup = !translateAsReplace;
  const apiOptions = { isPopup };

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
    } else {
      result = await translateWithGoogle(texts, targetLang, apiOptions);
    }

    translations = result;
    const duration = Math.round(performance.now() - startTime);

    console.group(`[WebTranslator DEBUG] [Engine: ${mode.toUpperCase()}] 번역 응답 수신 (소요시간: ${duration}ms)`);
    console.table(texts.map((t, idx) => ({
      Index: idx,
      Original: t,
      Translated: translations[idx] || "(응답 없음)"
    })));
    console.groupEnd();

    return { translations, engine: mode };
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

  return fetchWordDictionary(
    message.word,
    message.targetLang,
    message.mode,
    apiKey,
    modelName,
    message.libreUrl || message.ollamaUrl
  );
}
