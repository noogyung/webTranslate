import { getLanguageName } from '../constants.js';
import { buildTranslationPrompt, buildDictionaryPrompt } from '../prompts.js';

export async function fetchAvailableCustomModels(apiUrl, apiKey) {
  if (!apiUrl || !apiKey) throw new Error("커스텀 엔진 URL 또는 API Key가 설정되지 않았습니다.");
  const url = apiUrl.replace(/\/+$/, "") + "/models";

  const response = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error?.message || `HTTP ${response.status}`);
  }

  const data = await response.json();
  if (!Array.isArray(data.data)) return [];

  return data.data.map((m) => m.id).sort();
}

export async function translateWithCustom(texts, targetLang, apiUrl, apiKey, modelName, options = {}) {
  if (!apiUrl || !apiKey) throw new Error("커스텀 엔진 URL 또는 API Key가 설정되지 않았습니다.");
  const langName = getLanguageName(targetLang);
  const url = apiUrl.replace(/\/+$/, "") + "/chat/completions";

  const systemPrompt = buildTranslationPrompt(langName, "openai", "", options);
  const userContent = JSON.stringify({ texts });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelName,
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
    throw new Error(`커스텀 엔진 HTTP ${response.status}: ${errObj.error?.message || response.statusText}`);
  }

  const data = await response.json();
  const rawText = data.choices?.[0]?.message?.content;
  if (!rawText) throw new Error("커스텀 엔진 응답이 비어있습니다.");

  const cleanJsonStr = rawText
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  const parsed = JSON.parse(cleanJsonStr);

  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.translations)) return parsed.translations;
  throw new Error("커스텀 엔진 번역 결과 형식이 올바르지 않습니다.");
}

export async function fetchCustomDictionary(word, targetLang, apiUrl, apiKey, modelName) {
  if (!apiUrl || !apiKey) throw new Error("커스텀 엔진 URL 또는 API Key가 설정되지 않았습니다.");
  const langName = getLanguageName(targetLang);
  const url = apiUrl.replace(/\/+$/, "") + "/chat/completions";
  const prompt = buildDictionaryPrompt(word, langName);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelName,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
    }),
    signal: AbortSignal.timeout(12000),
  });

  if (!response.ok) throw new Error(`커스텀 엔진 사전 HTTP ${response.status}`);
  const data = await response.json();
  const rawText = data.choices?.[0]?.message?.content;
  if (!rawText) throw new Error("커스텀 엔진 사전 응답이 비어있습니다.");

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
