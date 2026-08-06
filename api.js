/**
 * api.js — Translation API Modules (v2.4)
 *
 * v2.4 주요 개선:
 *  - 모든 AI 엔진(Gemini, OpenAI, Claude, Ollama)에 대한 프롬프트 생성 로직 단일화 (buildTranslationPrompt, buildDictionaryPrompt)
 *  - Ollama 사용자 정의 프롬프트(customPrompt) 주입 기능 추가
 * v2.3 주요 개선:
 *  - OpenAI(ChatGPT) API 실시간 가용 모델 목록 조회 지원 (fetchAvailableOpenAIModels)
 *  - Gemini API 최신 경량 모델 (gemini-flash-lite-latest) 기본 적용 및 가용 모델 동기화 (getValidGeminiModel)
 *  - 단어 사전 조회 (fetchWordDictionary) OpenAI 단일 요청 구조 기반 완전 단순화/리팩토링 (무한 로딩 및 429 연쇄 복구 방지)
 *  - LibreTranslate 전용 단어 사전 조회 지원 (_fetchLibreDictionary)
 *  - 모든 API fetch 요청 타임아웃 (AbortSignal.timeout) 보완
 */

/* ────────────────────────────────────────────
 * Language helpers
 * ──────────────────────────────────────────── */

const LANGUAGE_NAMES = {
  ko: "Korean",  en: "English",  ja: "Japanese",
  "zh-CN": "Simplified Chinese",  "zh-TW": "Traditional Chinese",
  es: "Spanish",  fr: "French",  de: "German",
  pt: "Portuguese",  ru: "Russian",  ar: "Arabic",
  hi: "Hindi",  vi: "Vietnamese",  th: "Thai",
  id: "Indonesian",  it: "Italian",  nl: "Dutch",
  tr: "Turkish",  pl: "Polish",  sv: "Swedish",
  uk: "Ukrainian",  cs: "Czech",  el: "Greek",
  he: "Hebrew",  ro: "Romanian",  hu: "Hungarian",
  fi: "Finnish",  da: "Danish",  no: "Norwegian",
  ms: "Malay",
};

function getLanguageName(code) {
  return LANGUAGE_NAMES[code] || code;
}

/* ────────────────────────────────────────────
 * Prompt Builders
 * ──────────────────────────────────────────── */

function buildTranslationPrompt(langName, engineType, customPrompt = "", options = {}) {
  if (engineType === "ollama") {
    let prompt = `You are a translator into ${langName}.\n` +
                 `Translate each text item in the input into ${langName}.\n`;
    if (customPrompt && customPrompt.trim() !== "") {
      prompt += `ADDITIONAL INSTRUCTIONS:\n${customPrompt.trim()}\n\n`;
    }
    if (options.isPopup && options.showPhonetics) {
      let phLang = `How to read the original text in ${langName} pronunciation`;
      prompt += `CRITICAL: Return ONLY a JSON object formatted exactly as: {"translations": ["translated_1", "translated_2"], "phonetics": ["${phLang}"]}`;
    } else {
      prompt += `CRITICAL: Return ONLY a JSON object formatted exactly as: {"translations": ["translated_1", "translated_2"]}`;
    }
    return prompt;
  }

  let baseRules = 
    `You are a professional comic, manga, and website translator into natural, fluent ${langName}.\n` +
    `CRITICAL TRANSLATION RULES:\n` +
    `- Translate all dialogue, narration, and text accurately and naturally into fluent ${langName}.\n` +
    `- Transliterate character names and surnames accurately according to standard pronunciation in ${langName}.\n` +
    `- Maintain consistent terminology, dialogue relationships, and natural spoken tone appropriate for the context.\n` +
    `- Preserve original punctuation, whitespace, and numbers.\n`;

  if (options.pageContext) {
    baseRules += `- PAGE-WIDE CONTEXT: The texts below all belong to the SAME image/page. Read ALL texts together to understand character names, dialogue relationships, and tone consistency before translating each line.\n`;
  }

  let formatRules = "";
  let phoneticRule = "";
  
  if (options.isPopup && options.showPhonetics) {
    let phLang = `How to read the original text using ${langName} characters (transliteration/pronunciation)`;
    phoneticRule = `- Also provide the phonetic reading of the ORIGINAL text. Format it in ${phLang}.\n`;
  }

  if (engineType === "gemini") {
    if (options.isPopup && options.showPhonetics) {
      formatRules = `- Return ONLY a JSON object with "translations" array and "phonetics" array. No markdown wrapper, no explanation.`;
    } else {
      formatRules = `- Return ONLY a JSON array of strings (same length as input). No markdown wrapper, no explanation.`;
    }
  } else if (engineType === "openai") {
    if (options.isPopup && options.showPhonetics) {
      formatRules = `- Maintain EXACT 1-to-1 array order and length.\n` +
                    `- Return ONLY a valid JSON object with the keys "translations" (array of translated strings) and "phonetics" (array of phonetic strings). Do NOT add explanation, markdown formatting, or notes.`;
    } else {
      formatRules = `- Maintain EXACT 1-to-1 array order and length.\n` +
                    `- Return ONLY a valid JSON object with the key "translations" mapped to an array of translated strings. Do NOT add explanation, markdown formatting, or notes.`;
    }
  } else if (engineType === "claude") {
    if (options.isPopup && options.showPhonetics) {
      formatRules = `- Return ONLY a JSON object with keys "translations" and "phonetics" containing arrays of strings in exact order. No markdown wrapper, no conversational text.\n` +
                    `Example: {"translations": ["번역문1"], "phonetics": ["phonetic1"]}`;
    } else {
      formatRules = `- Return ONLY a JSON object with key "translations" containing an array of strings in exact order. No markdown wrapper, no conversational text.\n` +
                    `Example: {"translations": ["번역문1", "번역문2"]}`;
    }
  }

  return baseRules + phoneticRule + formatRules;
}

function buildDictionaryPrompt(word, langName) {
  return `Provide a concise dictionary entry for "${word}" translated into ${langName}.\n` +
    `CRITICAL INSTRUCTIONS:\n` +
    `1. Provide AT MOST THE TOP 3 MOST COMMON definitions.\n` +
    `2. Each definition MUST have a short, concise ${langName} meaning (2 to 5 words only, e.g. "경기, 놀이" or "(시스템을) 악용하다"). Do NOT write long explanatory sentences!\n` +
    `3. For EVERY definition, provide a realistic example sentence in source language with its natural ${langName} translation that ACCURATELY matches that specific definition.\n` +
    `4. Return ONLY a JSON object: {"word":"${word}","pronunciation":"[How to read the original word in ${langName} characters]","inflections":"","definitions":[{"pos":"Part of speech in ${langName}","meaning":"Short concise meaning","example":{"en":"Example","ko":"Translation"}}]}`;
}

/* ────────────────────────────────────────────
 * XML/HTML 태그 배치 유틸리티 (Google)
 * ──────────────────────────────────────────── */

function escapeXml(str) {
  return (str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function unescapeXml(str) {
  return (str || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function buildTagPayload(texts) {
  return texts.map((t, idx) => `<block id="${idx}">${escapeXml(t)}</block>`).join("\n");
}

function parseTagPayload(translatedHtml, count) {
  const results = new Array(count).fill("");
  const regex = /<block\s+id=["']?(\d+)["']?>([\s\S]*?)<\/block>/gi;
  let match;
  let foundCount = 0;
  while ((match = regex.exec(translatedHtml)) !== null) {
    const idx = parseInt(match[1], 10);
    if (idx >= 0 && idx < count) {
      results[idx] = unescapeXml(match[2].trim());
      foundCount++;
    }
  }
  return { results, foundCount };
}

/* ────────────────────────────────────────────
 * Google Translate (비공개 웹 API)
 * ──────────────────────────────────────────── */

const GT_MAX_CHUNK = 2500;
const GT_BASE = "https://translate.googleapis.com/translate_a/single";

export async function translateWithGoogle(texts, targetLang, options = {}) {
  const cleaned = texts.map((t) => (t || "").trim());

  const chunks = [];
  let curTexts = [], curIndices = [], curSize = 0;

  cleaned.forEach((text, i) => {
    if (!text) return;
    const tagLen = `<block id="${i}">${text}</block>\n`.length;
    if (curSize + tagLen > GT_MAX_CHUNK && curTexts.length > 0) {
      chunks.push({ texts: curTexts.slice(), indices: curIndices.slice() });
      curTexts = []; curIndices = []; curSize = 0;
    }
    curTexts.push(text);
    curIndices.push(i);
    curSize += tagLen;
  });
  if (curTexts.length > 0) chunks.push({ texts: curTexts, indices: curIndices });

  if (chunks.length === 0) return new Array(texts.length).fill("");

  const results = new Array(texts.length).fill("");
  const CONCURRENCY = 4;
  let idx = 0;

  async function chunkWorker() {
    while (idx < chunks.length) {
      const chunk = chunks[idx++];
      await _translateGoogleChunk(chunk, targetLang, results);
    }
  }

  const workers = [];
  for (let i = 0; i < Math.min(CONCURRENCY, chunks.length); i++) {
    workers.push(chunkWorker());
  }
  await Promise.all(workers);

  return results;
}

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 2000;

async function _translateGoogleChunk(chunk, targetLang, results, attempt = 0) {
  const combined = buildTagPayload(chunk.texts);
  const url = `${GT_BASE}?client=gtx&sl=auto&tl=${encodeURIComponent(targetLang)}&dt=t`;

  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `q=${encodeURIComponent(combined)}`,
      signal: AbortSignal.timeout(6000),
    });
  } catch (err) {
    throw new Error(`Google 번역 네트워크 오류: ${err.message}`);
  }

  if (response.status === 429) {
    if (attempt < 1) {
      await new Promise((r) => setTimeout(r, 1000));
      return _translateGoogleChunk(chunk, targetLang, results, attempt + 1);
    }
    throw new Error("Google 번역 API 요청 한도 초과 (429)");
  }
  if (!response.ok) {
    throw new Error(`Google 번역 HTTP 오류: ${response.status}`);
  }

  const data = await response.json().catch(() => null);
  if (!data?.[0]) throw new Error("Google 번역 응답이 비어 있습니다.");

  const fullTranslation = data[0].map((seg) => seg?.[0] || "").join("");
  const { results: parsed, foundCount } = parseTagPayload(fullTranslation, chunk.texts.length);

  if (foundCount === chunk.texts.length) {
    chunk.indices.forEach((origIdx, j) => {
      results[origIdx] = parsed[j] || chunk.texts[j];
    });
  } else {
    console.warn(`[WebTranslator] Google 태그 분리 미완료 (${foundCount}/${chunk.texts.length}), 개별 번역 진행`);
    await _fallbackIndividual(chunk, targetLang, results);
  }
}

async function _fallbackIndividual(chunk, targetLang, results) {
  const CONCURRENCY = 2;
  let failCount = 0;

  async function worker() {
    for (let i = 0; i < chunk.texts.length; i++) {
      const text = chunk.texts[i];
      if (!text) continue;

      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const url = `${GT_BASE}?client=gtx&sl=auto&tl=${encodeURIComponent(targetLang)}&dt=t`;
          const resp = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: `q=${encodeURIComponent(text)}`,
          });

          if (resp.status === 429) {
            if (attempt < 2) {
              await new Promise((r) => setTimeout(r, BASE_DELAY_MS * Math.pow(2, attempt)));
              continue;
            }
            failCount++;
            break;
          }
          if (!resp.ok) { failCount++; break; }

          const data = await resp.json().catch(() => null);
          if (data?.[0]) {
            results[chunk.indices[i]] = data[0].map((s) => s?.[0] || "").join("");
          }
          break;
        } catch {
          if (attempt === 2) failCount++;
        }
      }
    }
  }

  const workers = [];
  for (let i = 0; i < Math.min(CONCURRENCY, chunk.texts.length); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  if (failCount > chunk.texts.length * 0.8) {
    throw new Error("Google 번역 API 접근이 차단되었습니다. 잠시 후 다시 시도하세요.");
  }
}

/* ────────────────────────────────────────────
 * Google Gemini API — 실시간 가용 모델 동적 탐색 및 Fallback
 * ──────────────────────────────────────────── */

const GEMINI_BATCH = 200; // AI 엔진용 대용량 단일 페이로드 번들링
const GEMINI_CONCURRENCY = 1;

const LLM_ENGINES = new Set(["gemini", "chatgpt", "openai", "claude", "ollama"]);

export function isLLMEngine(mode) {
  return LLM_ENGINES.has((mode || "").toLowerCase());
}

/**
 * 사용자 API Key로 호출 가능한 실시간 텍스트 생성 Gemini 모델 목록 조회
 */
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

/**
 * 사용자 API Key로 호출 가능한 실시간 OpenAI (ChatGPT) 모델 목록 조회
 */
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
    
    // If it's a popup and phonetics were requested, return the full object immediately
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

/* ────────────────────────────────────────────
 * LibreTranslate API — 1:1 순수 단일 요청 워커 (오염/밀림 방지)
 * ──────────────────────────────────────────── */

const LIBRE_CONCURRENCY = 6;

export async function translateWithLibre(texts, targetLang, serverUrl, options = {}) {
  if (!serverUrl) {
    throw new Error("LibreTranslate 서버 주소가 설정되지 않았습니다.");
  }

  const baseUrl = serverUrl.replace(/\/$/, "");
  const endpoint = `${baseUrl}/translate`;

  const results = new Array(texts.length).fill("");
  let idx = 0;

  async function worker() {
    while (idx < texts.length) {
      const curIdx = idx++;
      const origText = (texts[curIdx] || "").trim();
      if (!origText) continue;

      // ALL-CAPS 단어("STORE", "COMMUNITY")는 TitleCase로 정규화하여 Argos NMT 오작동 방지
      let queryText = origText;
      if (/^[A-Z0-9\s\W_]+$/.test(origText) && /[A-Z]/.test(origText) && origText.length <= 40) {
        queryText = origText.toLowerCase().replace(/(?:^|\s|-)\S/g, (c) => c.toUpperCase());
      }

      results[curIdx] = await _libreSingle(queryText, targetLang, endpoint);
    }
  }

  const workers = [];
  for (let i = 0; i < Math.min(LIBRE_CONCURRENCY, texts.length); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  return results;
}

async function _libreSingle(text, targetLang, endpoint) {
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        q: text,
        source: "auto",
        target: targetLang,
        format: "text"
      }),
    });

    if (!response.ok) return text;
    const data = await response.json();
    const trans = typeof data.translatedText === "string" ? data.translatedText.trim() : text;
    return trans || text;
  } catch {
    return text;
  }
}

/* ────────────────────────────────────────────
 * OpenAI API (ChatGPT)
 * ──────────────────────────────────────────── */

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

/* ────────────────────────────────────────────
 * Anthropic API (Claude)
 * ──────────────────────────────────────────── */

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

/* ────────────────────────────────────────────
 * Ollama Local LLM
 * ──────────────────────────────────────────── */

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
  if (!Array.isArray(parsed.translations)) throw new Error("Ollama 번역 결과 형식이 올바르지 않습니다.");
  
  if (options.isPopup && options.showPhonetics) {
    return {
      translations: parsed.translations,
      phonetics: Array.isArray(parsed.phonetics) ? parsed.phonetics : null,
    };
  }
  
  return parsed.translations;
}

/* ────────────────────────────────────────────
 * 단어 사전 조회 (Dictionary Lookup)
 * ──────────────────────────────────────────── */

function normalizePos(posStr) {
  if (!posStr) return "other";
  const s = posStr.toLowerCase().trim();
  if (s.includes("noun") || s.includes("명사") || s.includes("名詞") || s.includes("名词")) return "noun";
  if (s.includes("verb") || s.includes("동사") || s.includes("動詞") || s.includes("动词")) return "verb";
  if (s.includes("adj") || s.includes("형용사") || s.includes("形容詞") || s.includes("形容词")) return "adjective";
  if (s.includes("adv") || s.includes("부사") || s.includes("副詞") || s.includes("副词")) return "adverb";
  if (s.includes("pron") || s.includes("대명사") || s.includes("代名詞") || s.includes("代词")) return "pronoun";
  if (s.includes("prep") || s.includes("전치사") || s.includes("前置詞") || s.includes("介词")) return "preposition";
  if (s.includes("conj") || s.includes("접속사") || s.includes("接続詞") || s.includes("连词")) return "conjunction";
  if (s.includes("interj") || s.includes("감탄사") || s.includes("感動詞") || s.includes("感叹词")) return "interjection";
  return s;
}

export async function fetchWordDictionary(word, targetLang, mode, apiKey, modelName, extraUrl) {
  const cleanWord = (word || "").trim();
  if (!cleanWord) throw new Error("조회할 단어가 없습니다.");

  if (mode === "gemini" && apiKey) {
    return await _fetchGeminiDictionary(cleanWord, targetLang, apiKey, modelName);
  } else if (mode === "openai" && apiKey) {
    return await _fetchOpenAIDictionary(cleanWord, targetLang, apiKey, modelName);
  } else if (mode === "claude" && apiKey) {
    return await _fetchClaudeDictionary(cleanWord, targetLang, apiKey, modelName);
  } else if (mode === "libre") {
    return await _fetchLibreDictionary(cleanWord, targetLang, extraUrl);
  }

  return await _fetchGoogleDictionary(cleanWord, targetLang);
}

async function _fetchLibreDictionary(word, targetLang, serverUrl) {
  if (!serverUrl) {
    throw new Error("LibreTranslate 서버 주소가 설정되지 않았습니다.");
  }
  const baseUrl = serverUrl.replace(/\/$/, "");
  const endpoint = `${baseUrl}/translate`;

  const translatedText = await _libreSingle(word, targetLang, endpoint);

  return {
    word: word,
    pronunciation: "",
    inflections: "",
    definitions: [
      {
        pos: "번역",
        meaning: translatedText || word,
        example: null,
      },
    ],
  };
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

async function _fetchGeminiDictionary(word, targetLang, apiKey, modelName, attempt = 0, blacklisted = new Set()) {
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
          return _fetchGeminiDictionary(word, targetLang, apiKey, fallback, attempt + 1, blacklisted);
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

async function _fetchOpenAIDictionary(word, targetLang, apiKey, modelName) {
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

async function _fetchClaudeDictionary(word, targetLang, apiKey, modelName) {
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

async function _fetchGoogleDictionary(word, targetLang) {
  const url = `${GT_BASE}?client=gtx&sl=auto&tl=${encodeURIComponent(targetLang)}&hl=${encodeURIComponent(targetLang)}&dt=t&dt=bd&dt=rm&q=${encodeURIComponent(word)}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Google 사전 HTTP ${resp.status}`);
  const data = await resp.json();

  const primaryTrans = data[0]?.map((s) => s[0]).join("") || word;
  const phonetic = data[0]?.[1]?.[3] || data[0]?.[1]?.[2] || "";

  const definitions = [];
  if (Array.isArray(data[1])) {
    data[1].slice(0, 3).forEach((item) => {
      const pos = item[0] || "뜻";
      const meaningStr = Array.isArray(item[1]) ? item[1].slice(0, 3).join(", ") : primaryTrans;
      definitions.push({
        pos,
        meaning: meaningStr,
        example: null,
      });
    });
  } else {
    definitions.push({
      pos: "뜻",
      meaning: primaryTrans,
      example: null,
    });
  }

  return {
    word: word,
    pronunciation: phonetic ? `[${phonetic}]` : "",
    inflections: "",
    definitions: definitions.slice(0, 3),
  };
}

/* ────────────────────────────────────────────
 * Image Translation with Vision LLM (v3.0)
 * ──────────────────────────────────────────── */

export async function translateImageWithVision({
  base64DataUrl,
  naturalWidth,
  naturalHeight,
  mode = "gemini",
  apiKey = "",
  geminiModel = "gemini-3.6-flash",
  openaiApiKey = "",
  openaiModel = "gpt-4o-mini",
  userSpecifiedModel = "",
  targetLang = "ko"
}) {
  const langName = getLanguageName(targetLang);

  // Extract base64 and mimeType
  const match = base64DataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
  if (!match) {
    throw new Error("올바르지 않은 이미지 Base64 포맷입니다.");
  }
  const mimeType = match[1];
  const base64Data = match[2];

  // Step 2: Universal Fine-grained Text Erasure & Layout OCR Engine
  const imageDimNotice = (naturalWidth && naturalHeight)
    ? `The image dimensions are ${naturalWidth} pixels wide by ${naturalHeight} pixels high.\n`
    : "";

  const ocrSystemInstruction = 
    `You are a high-precision OCR Layout Analyzer for image translation.\n\n` +
    imageDimNotice +
    `Detect every visible text block in the image and return layout information for accurate text replacement.\n\n` +
    `Rules:\n` +
    `- Detect all text regardless of language.\n` +
    `- Treat each independent text region as a separate object.\n` +
    `- Never merge unrelated text.\n` +
    `- Classify each block as one of: container, text, sfx, ui, caption.\n` +
    `- Preserve original text exactly, including punctuation and line breaks.\n` +
    `- Split every visual line into the "lines" array.\n` +
    `- Return actual image pixel coordinates [ymin, xmin, ymax, xmax] matching the original image dimensions.\n` +
    `- glyphBox must tightly enclose only visible glyph pixels in actual pixel coordinates.\n` +
    `- eraseBox must fully cover the text for clean removal in actual pixel coordinates.\n` +
    `- containerBox is the drawable region for translated text in actual pixel coordinates, or null if unavailable.\n` +
    `- Detect orientation: horizontal, vertical or rotated.\n` +
    `- Estimate textColor, backgroundColor and strokeColor when visible.\n` +
    `- Return only valid JSON without markdown or explanation.\n\n` +
    `Output format:\n` +
    `[\n` +
    `  {\n` +
    `    "type":"container",\n` +
    `    "glyphBox":[ymin,xmin,ymax,xmax],\n` +
    `    "eraseBox":[ymin,xmin,ymax,xmax],\n` +
    `    "containerBox":[ymin,xmin,ymax,xmax] | null,\n` +
    `    "lines":[\n` +
    `      {\n` +
    `        "glyphBox":[ymin,xmin,ymax,xmax],\n` +
    `        "eraseBox":[ymin,xmin,ymax,xmax]\n` +
    `      }\n` +
    `    ],\n` +
    `    "orientation":"horizontal|vertical|rotated",\n` +
    `    "originalText":"...",\n` +
    `    "textColor":"#000000",\n` +
    `    "backgroundColor":"#FFFFFF",\n` +
    `    "strokeColor":"#000000"\n` +
    `  }\n` +
    `]`;

  let rawContent = "";

  if (mode === "openai") {
    const key = openaiApiKey || apiKey;
    if (!key) throw new Error("OpenAI API Key가 설정되지 않았습니다.");
    const model = openaiModel || "gpt-4o-mini";

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: ocrSystemInstruction },
              { type: "image_url", image_url: { url: base64DataUrl, detail: "high" } }
            ]
          }
        ],
        max_completion_tokens: 2048,
        temperature: 0.0,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI Vision HTTP ${response.status}: ${errText}`);
    }

    const data = await response.json();
    rawContent = data.choices?.[0]?.message?.content || "";
  } else {
    // Gemini Vision
    const key = apiKey || openaiApiKey;
    if (!key) throw new Error("Gemini API Key가 설정되지 않았습니다.");
    const model = geminiModel || "gemini-3.6-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: ocrSystemInstruction },
              { inline_data: { mime_type: mimeType, data: base64Data } }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.0,
          response_mime_type: "application/json"
        }
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini Vision HTTP ${response.status}: ${errText}`);
    }

    const data = await response.json();
    rawContent = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  }

  const ocrBlocks = parseVisionJsonResponse(rawContent);
  if (!Array.isArray(ocrBlocks) || ocrBlocks.length === 0) {
    console.warn("[WT Image Debug] OCR 추출 실패: 감지된 텍스트가 없습니다.");
    return [];
  }

  // Step 3: Cost-Optimized Context-Aware Manga/Image Translation
  // OCR은 gpt-4o 고성능 Vision을 사용했으나, 텍스트 번역은 사용자가 지정한 원래 모델(예: gpt-5.4-nano)을 사용하여 비용 최소화
  const originalTexts = ocrBlocks.map((b) => b.originalText || "");
  let translations = [];

  const transModelToUse = userSpecifiedModel || (mode === "openai" ? "gpt-4o-mini" : "gemini-3.6-flash");

  try {
    const transOptions = { isPopup: false, pageContext: true };
    const transResult = await (mode === "openai"
      ? translateWithOpenAI(originalTexts, targetLang, openaiApiKey || apiKey, transModelToUse, transOptions)
      : translateWithGemini(originalTexts, targetLang, apiKey || openaiApiKey, geminiModel, transOptions));

    translations = Array.isArray(transResult) ? transResult : (transResult.translations || []);
  } catch (transErr) {
    console.warn(`[WT Image Debug] Step 3 번역 실패 (${transModelToUse}), 원문 유지:`, transErr);
    translations = originalTexts;
  }

  const finalBlocks = ocrBlocks.map((block, idx) => ({
    ...block,
    translatedText: translations[idx] || block.originalText || "",
  }));

  // [STEP 3 CONSOLE INSPECTOR] F12 콘솔창에 1:1 번역 결과 표로 출력
  console.group(`[WT Step 3] 이미지 텍스트 번역 완료 (비용 최적화 모델: ${transModelToUse})`);
  console.table(
    finalBlocks.map((b, idx) => ({
      Index: `#${idx}`,
      Type: b.type || "container",
      Orientation: b.orientation || "horizontal",
      OriginalText: b.originalText,
      TranslatedText: b.translatedText,
      BBox: JSON.stringify(b.bbox)
    }))
  );
  console.groupEnd();

  return finalBlocks;
}

export async function locateBoundingBoxesWithVision({
  base64DataUrl,
  naturalWidth,
  naturalHeight,
  mode = "gemini",
  apiKey = "",
  geminiModel = "gemini-3.6-flash",
  openaiApiKey = "",
  openaiModel = "gpt-4o-mini",
}) {
  const blocks = await translateImageWithVision({
    base64DataUrl,
    naturalWidth,
    naturalHeight,
    mode,
    apiKey,
    geminiModel,
    openaiApiKey,
    openaiModel,
    targetLang: "ko",
  });

  if (!Array.isArray(blocks)) return [];

  return blocks
    .map((b) => ({
      box: b.glyphBox || b.eraseBox || b.containerBox,
      text: b.originalText || "",
    }))
    .filter((item) => item.box && item.box.length === 4);
}

function filterDuplicateBlocks(blocks) {
  const result = [];
  for (const block of blocks) {
    if (!block.bbox || block.bbox.length !== 4) continue;
    
    // 동일한 원문이 이미 존재하고 Bbox 위치가 유의미하게 유사한 경우 중복 제외
    const isDup = result.some((prev) => {
      const isSameText = prev.originalText?.trim() === block.originalText?.trim();
      const iou = calculateBboxIoU(prev.bbox, block.bbox);
      return (isSameText && iou > 0.3) || iou > 0.7;
    });

    if (!isDup) {
      result.push(block);
    }
  }
  return result;
}

function calculateBboxIoU(boxA, boxB) {
  const [y1A, x1A, y2A, x2A] = boxA;
  const [y1B, x1B, y2B, x2B] = boxB;

  const interX1 = Math.max(x1A, x1B);
  const interY1 = Math.max(y1A, y1B);
  const interX2 = Math.min(x2A, x2B);
  const interY2 = Math.min(y2A, y2B);

  const interWidth = Math.max(0, interX2 - interX1);
  const interHeight = Math.max(0, interY2 - interY1);
  const interArea = interWidth * interHeight;

  const areaA = (x2A - x1A) * (y2A - y1A);
  const areaB = (x2B - x1B) * (y2B - y1B);
  const unionArea = areaA + areaB - interArea;

  return unionArea > 0 ? interArea / unionArea : 0;
}

function parseVisionJsonResponse(rawText) {
  if (!rawText || rawText.trim() === "") {
    return [];
  }

  const cleanJsonStr = rawText
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  try {
    const parsed = JSON.parse(cleanJsonStr);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed.textBlocks)) return parsed.textBlocks;
    if (Array.isArray(parsed.data)) return parsed.data;
    return [];
  } catch (err) {
    console.error("[WebTranslator] Vision JSON 파싱 오류:", err, "raw:", rawText);
    return [];
  }
}



