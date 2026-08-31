export const DEFAULT_SETTINGS = {
  translationMode: "google",
  geminiApiKey: "",
  targetLang: "ko",
  displayMode: "dual",
  geminiModel: "gemini-flash-lite-latest",
  openaiApiKey: "",
  openaiModel: "gpt-4o-mini",
  claudeApiKey: "",
  claudeModel: "claude-3-5-haiku-20241022",
  ollamaUrl: "http://localhost:11434",
  ollamaModel: "qwen2.5",
  ollamaCustomPrompt: "",
  libreUrl: "http://localhost:5000",
  lazyTranslate: true,
  customDict: [],
  transColor: "#818cf8",
  transFontSize: "100%",
  transItalic: false,
  transBgAlpha: 0.12,
  customShortcut: "Alt+A",
  inlineShadow: false,
  inlineHighlight: false,
  inlineAdaptiveColor: false,
  inlineInheritColor: true,
  // v2.0 이미지 번역 설정
  imageTransMode: "ask",
  imageTransPremiumEngine: "gemini",
  imageTransPremiumModel: "gemini-3.1-flash-image",
  premiumGeminiModel: "gemini-3.1-flash-image",
  premiumOpenAIModel: "gpt-image-2",
  imageCostNotify: true,
  // v2.0 커스텀 OpenAI 호환 엔진 설정
  customApiUrl: "",
  customApiKey: "",
  customModel: "",
};

export function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULT_SETTINGS, (settings) => resolve(settings));
  });
}

export function saveSettings(settings) {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.set(settings, () => {
      if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
      else resolve();
    });
  });
}

export function clearTranslationCache() {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action: "clearCache" }, (response) => {
      if (response && response.success) resolve();
      else reject(new Error("캐시 초기화 실패"));
    });
  });
}
