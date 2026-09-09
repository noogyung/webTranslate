export { LANGUAGE_NAMES, getLanguageName, LLM_ENGINES, isLLMEngine } from './constants.js';
export { buildTranslationPrompt, buildDictionaryPrompt } from './prompts.js';

export { translateWithGoogle } from './engines/google.js';
export { fetchAvailableGeminiModels, getValidGeminiModel, translateWithGemini } from './engines/gemini.js';
export { fetchAvailableOpenAIModels, translateWithOpenAI } from './engines/openai.js';
export { translateWithClaude } from './engines/claude.js';
export { translateWithOllama } from './engines/ollama.js';
export { translateWithLibre } from './engines/libre.js';
export { translateWithCustom, fetchCustomDictionary, fetchAvailableCustomModels } from './engines/custom.js';

// v2.0: 신규 image/ 서브디렉토리 (이미지 번역 전용)
export { translateImageWithVision, locateBoundingBoxesWithVision, normalizeBox } from './image/vision.js';
export { translatePremiumGemini, translatePremiumOpenAI, incrementImageCount, getImageDailyStats } from './image/imageTranslate.js';
export { runCustomOcrServer } from './image/customOcrServer.js';

export { fetchWordDictionary, normalizePos } from './dictionary.js';
