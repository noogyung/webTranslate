import { getLanguageName } from '../constants.js';
import { buildTranslationPrompt } from '../prompts.js';

export async function translateWithOllama(texts, targetLang, ollamaUrl, modelName, customPrompt = "", options = {}) {
  const baseUrl = (ollamaUrl || "http://localhost:11434").replace(/\/+$/, "");
  const model = modelName || "qwen2.5";
  const langName = getLanguageName(targetLang);

  const prompt = buildTranslationPrompt(langName, "ollama", customPrompt, options) + `\n\nInput JSON: ${JSON.stringify({ texts })}`;

  const response = await fetch(`${baseUrl}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      format: "json",
    }),
    signal: AbortSignal.timeout(120000),
  });

  if (!response.ok) {
    throw new Error(`Ollama HTTP ${response.status}: Ollama 서버(${baseUrl}) 연결 실패`);
  }

  const data = await response.json();
  if (!data.response) throw new Error("Ollama 응답이 비어있습니다.");

  const parsed = JSON.parse(data.response);
  let translations;
  if (Array.isArray(parsed)) {
    translations = parsed;
  } else if (parsed.translations && Array.isArray(parsed.translations)) {
    translations = parsed.translations;
  } else {
    throw new Error("Ollama 응답 형식이 올바르지 않습니다.");
  }

  return translations;
}
