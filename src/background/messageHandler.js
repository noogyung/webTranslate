import { handleTranslation, handleWordDictionary } from "./translationService.js";
import { handleImageTranslation, handleBoundingBoxesLocation, fetchImageAsBase64 } from "./imageService.js";

export function initializeMessageHandlers() {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action === "getSettings") {
      chrome.storage.sync
        .get({
          translationMode: "google",
          geminiApiKey: "",
          geminiModel: "gemini-3.6-flash",
          openaiApiKey: "",
          openaiModel: "gpt-4o-mini",
          claudeApiKey: "",
          claudeModel: "claude-3-5-haiku-20241022",
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
        })
        .then(sendResponse);
      return true;
    }

    if (message.action === "translate") {
      handleTranslation(message)
        .then(sendResponse)
        .catch((err) => sendResponse({ error: err.message }));
      return true;
    }

    if (message.action === "getCache") {
      const cacheKey = `wt_cache_${message.targetLang}`;
      chrome.storage.local.get([cacheKey]).then((data) => {
        sendResponse({ cache: data[cacheKey] || {} });
      });
      return true;
    }

    if (message.action === "setCache") {
      const cacheKey = `wt_cache_${message.targetLang}`;
      chrome.storage.local.get([cacheKey]).then((data) => {
        const currentCache = data[cacheKey] || {};
        const newCache = { ...currentCache, ...message.dictionary };
        chrome.storage.local.set({ [cacheKey]: newCache });
      });
      return false;
    }

    if (message.action === "clearCache") {
      chrome.storage.local.clear().then(() => sendResponse({ success: true }));
      return true;
    }

    if (message.action === "lookupWord") {
      handleWordDictionary(message)
        .then((dictData) => sendResponse({ data: dictData }))
        .catch((err) => sendResponse({ error: err.message }));
      return true;
    }

    if (message.action === "translateImage") {
      handleImageTranslation(message, _sender)
        .then((res) => sendResponse({ success: true, blocks: res }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;
    }

    if (message.action === "locateBoundingBoxes") {
      handleBoundingBoxesLocation(message, _sender)
        .then((res) => sendResponse({ success: true, items: res }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;
    }

    if (message.action === "fetchBase64") {
      fetchImageAsBase64(message.imageUrl, message.pageUrl || _sender?.tab?.url || "")
        .then((dataUrl) => sendResponse({ success: true, dataUrl }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;
    }
  });
}
