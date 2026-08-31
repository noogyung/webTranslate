export const LANGUAGE_NAMES = {
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

export function getLanguageName(code) {
  return LANGUAGE_NAMES[code] || code;
}

export const LLM_ENGINES = new Set(["gemini", "chatgpt", "openai", "claude", "ollama", "custom"]);

export function isLLMEngine(mode) {
  return LLM_ENGINES.has((mode || "").toLowerCase());
}
