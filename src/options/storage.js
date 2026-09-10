export const DEFAULT_SETTINGS = {
  // ── 메인 텍스트 번역 설정 ──
  translationMode: "google",
  geminiApiKey: "",
  geminiModel: "gemini-flash-lite-latest",
  openaiApiKey: "",
  openaiModel: "gpt-5.6-luna",
  claudeApiKey: "",
  claudeModel: "claude-3-5-haiku-latest",
  ollamaUrl: "http://localhost:11434",
  ollamaModel: "qwen2.5",
  ollamaCustomPrompt: "",
  libreUrl: "http://localhost:5000",
  targetLang: "ko",
  displayMode: "dual",
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
  // v2.0 커스텀 OpenAI 호환 엔진 설정
  customApiUrl: "",
  customApiKey: "",
  customModel: "",

  // ── v2.0 이미지 번역 공통 설정 ──
  imageMode: "ask",                            // "ask" | "standard" | "premium"
  imageCostNotify: true,

  // ── 1. 일반 번역 (Standard: 단순 OCR + 번역) ──
  imageStdEngine: "free",                      // "free" | "gemini" | "openai" | "other"
  imageStdGeminiModel: "gemini-flash-lite-latest",
  imageStdOpenAIModel: "gpt-5.6-luna",
  // [일반용 Other: 전용 OCR / Vision 서버]
  imageStdOtherType: "ocr_server",             // "ocr_server" | "vision_api"
  imageStdOtherUrl: "http://localhost:8000/predict",
  imageStdOtherKey: "",
  imageStdOtherModel: "qwen2.5-vl",

  // ── 2. 고급 번역 (Premium: 이미지 생성 기반 번역) ──
  imagePremEngine: "gemini",                   // "gemini" | "openai" | "other"
  // [Gemini 고급]
  imagePremGeminiOcrModel: "gemini-flash-lite-latest",
  imagePremGeminiSynthModel: "gemini-3.1-flash-image",
  // [OpenAI 고급]
  imagePremOpenAIOcrModel: "gpt-5.6-luna",
  imagePremOpenAISynthModel: "gpt-image-2",
  // [고급용 Other: 사설 이미지 생성 / 인페인팅 전용 서버]
  imagePremOtherUrl: "http://localhost:7860",
  imagePremOtherKey: "",
  imagePremOtherOcrModel: "qwen2.5-vl",
  imagePremOtherSynthModel: "sd_inpainting_model",
};

export function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULT_SETTINGS, (settings) => {
      // ── 구버전 키 자동 마이그레이션 (하위 호환) ──
      if (settings.imageTransMode !== undefined && settings.imageMode === DEFAULT_SETTINGS.imageMode) {
        const modeMap = { ask: "ask", standard: "standard", premium: "premium" };
        settings.imageMode = modeMap[settings.imageTransMode] || "ask";
      }
      if (settings.imageTransPremiumEngine !== undefined && settings.imagePremEngine === DEFAULT_SETTINGS.imagePremEngine) {
        settings.imagePremEngine = settings.imageTransPremiumEngine === "openai" ? "openai" : "gemini";
      }
      if (settings.premiumGeminiModel !== undefined && settings.imagePremGeminiSynthModel === DEFAULT_SETTINGS.imagePremGeminiSynthModel) {
        settings.imagePremGeminiSynthModel = settings.premiumGeminiModel;
      }
      if (settings.premiumOpenAIModel !== undefined && settings.imagePremOpenAISynthModel === DEFAULT_SETTINGS.imagePremOpenAISynthModel) {
        settings.imagePremOpenAISynthModel = settings.premiumOpenAIModel;
      }
      if (settings.imageTransPremiumModel !== undefined) {
        const eng = settings.imagePremEngine;
        if (eng === "openai" && settings.imagePremOpenAISynthModel === DEFAULT_SETTINGS.imagePremOpenAISynthModel) {
          settings.imagePremOpenAISynthModel = settings.imageTransPremiumModel;
        } else if (eng === "gemini" && settings.imagePremGeminiSynthModel === DEFAULT_SETTINGS.imagePremGeminiSynthModel) {
          settings.imagePremGeminiSynthModel = settings.imageTransPremiumModel;
        }
      }
      resolve(settings);
    });
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
