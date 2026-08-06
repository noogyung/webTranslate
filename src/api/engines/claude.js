import { getLanguageName } from '../constants.js';
import { buildTranslationPrompt, buildDictionaryPrompt } from '../prompts.js';

export async function translateWithClaude(texts, targetLang, apiKey, modelName, options = {}) {
  if (!apiKey) throw new Error("Claude API 키가 설정되지 않았습니다.");
  const langName = getLanguageName(targetLang);
  const model = modelName || "claude-3-5-haiku-20241022";

  const systemPrompt = buildTranslationPrompt(langName, "claude", "", options);
  const userContent = JSON.stringify({ texts });

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "dangerously-allow-browser": "true",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const errObj = await response.json().catch(() => ({}));
    throw new Error(`Claude HTTP ${response.status}: ${errObj.error?.message || response.statusText}`);
  }

  const data = await response.json();
  const rawText = data.content?.[0]?.text;
  if (!rawText) throw new Error("Claude 응답이 비어있습니다.");

  const cleanJsonStr = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
  const parsed = JSON.parse(cleanJsonStr);
  if (!Array.isArray(parsed.translations)) throw new Error("Claude 번역 결과 형식이 올바르지 않습니다.");
  
  if (options.isPopup && options.showPhonetics) {
    return {
      translations: parsed.translations,
      phonetics: Array.isArray(parsed.phonetics) ? parsed.phonetics : null,
    };
  }
  
  return parsed.translations;
}

export async function fetchClaudeDictionary(word, targetLang, apiKey, modelName) {
  const langName = getLanguageName(targetLang);
  const model = modelName || "claude-3-5-haiku-20241022";
  const prompt = buildDictionaryPrompt(word, langName);

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "dangerously-allow-browser": "true",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) throw new Error(`Claude 사전 HTTP ${response.status}`);
  const data = await response.json();
  const rawText = data.content?.[0]?.text;
  if (!rawText) throw new Error("Claude 사전 응답이 비어있습니다.");

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
