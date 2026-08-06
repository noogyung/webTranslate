import { getLanguageName } from '../constants.js';
import { buildTranslationPrompt, buildDictionaryPrompt } from '../prompts.js';

export async function fetchAvailableOpenAIModels(apiKey) {
  if (!apiKey) throw new Error("OpenAI API 키가 입력되지 않았습니다.");
  const response = await fetch("https://api.openai.com/v1/models", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error?.message || `HTTP ${response.status}`);
  }

  const data = await response.json();
  if (!Array.isArray(data.data)) return [];

  return data.data
    .map((m) => m.id)
    .filter((id) => {
      const lid = id.toLowerCase();
      return (
        lid.startsWith("gpt-") &&
        !lid.includes("audio") &&
        !lid.includes("realtime") &&
        !lid.includes("embedding") &&
        !lid.includes("instruct") &&
        !lid.includes("tts") &&
        !lid.includes("whisper") &&
        !lid.includes("dall-e")
      );
    })
    .sort();
}

export async function translateWithOpenAI(texts, targetLang, apiKey, modelName, options = {}) {
  if (!apiKey) throw new Error("OpenAI API 키가 설정되지 않았습니다.");
  const langName = getLanguageName(targetLang);
  const model = modelName || "gpt-4o-mini";

  const systemPrompt = buildTranslationPrompt(langName, "openai", "", options);
  const userContent = JSON.stringify({ texts });

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      temperature: 0.3,
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const errObj = await response.json().catch(() => ({}));
    throw new Error(`OpenAI HTTP ${response.status}: ${errObj.error?.message || response.statusText}`);
  }

  const data = await response.json();
  const rawText = data.choices?.[0]?.message?.content;
  if (!rawText) throw new Error("OpenAI 응답이 비어있습니다.");

  const parsed = JSON.parse(rawText);
  if (!Array.isArray(parsed.translations)) throw new Error("OpenAI 번역 결과 형식이 올바르지 않습니다.");
  
  if (options.isPopup && options.showPhonetics) {
    return {
      translations: parsed.translations,
      phonetics: Array.isArray(parsed.phonetics) ? parsed.phonetics : null,
    };
  }
  
  return parsed.translations;
}

export async function fetchOpenAIDictionary(word, targetLang, apiKey, modelName) {
  const langName = getLanguageName(targetLang);
  const model = modelName || "gpt-4o-mini";
  const prompt = buildDictionaryPrompt(word, langName);

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
    }),
  });

  if (!response.ok) throw new Error(`OpenAI 사전 HTTP ${response.status}`);
  const data = await response.json();
  const rawText = data.choices?.[0]?.message?.content;
  if (!rawText) throw new Error("OpenAI 사전 응답이 비어있습니다.");

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
