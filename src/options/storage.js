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
