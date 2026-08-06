import { fetchGeminiDictionary } from './engines/gemini.js';
import { fetchOpenAIDictionary } from './engines/openai.js';
import { fetchClaudeDictionary } from './engines/claude.js';
import { fetchLibreDictionary } from './engines/libre.js';
import { fetchGoogleDictionary } from './engines/google.js';

export function normalizePos(posStr) {
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
    return await fetchGeminiDictionary(cleanWord, targetLang, apiKey, modelName);
  } else if (mode === "openai" && apiKey) {
    return await fetchOpenAIDictionary(cleanWord, targetLang, apiKey, modelName);
  } else if (mode === "claude" && apiKey) {
    return await fetchClaudeDictionary(cleanWord, targetLang, apiKey, modelName);
  } else if (mode === "libre") {
    return await fetchLibreDictionary(cleanWord, targetLang, extraUrl);
  }

  return await fetchGoogleDictionary(cleanWord, targetLang);
}
