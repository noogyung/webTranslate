/**
 * background.js — Service Worker (Manifest V3)
 *
 * 역할:
 *  1. Alt+A 단축키 이벤트를 수신하여 활성 탭의 Content Script에 번역 토글 메시지 전송.
 *  2. Content Script로부터 번역 요청을 받아 api.js의 함수를 호출한 뒤 결과를 응답.
 *  3. 확장 프로그램 아이콘 클릭 시 옵션 페이지 열기.
 */

import {
  translateWithGoogle,
  translateWithGemini,
  translateWithLibre,
  translateWithOpenAI,
  translateWithClaude,
  translateWithOllama,
  fetchWordDictionary,
  translateImageWithVision,
  locateBoundingBoxesWithVision,
} from "./api.js";

/* ────────────────────────────────────────────
 * 1. 키보드 단축키(Alt+A) 처리
 * ──────────────────────────────────────────── */

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "translate-page") return;

  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (!tab?.id) return;

  // chrome:// 등 내부 페이지에서는 content script가 동작하지 않으므로 무시
  if (
    tab.url?.startsWith("chrome://") ||
    tab.url?.startsWith("chrome-extension://") ||
    tab.url?.startsWith("edge://") ||
    tab.url?.startsWith("about:")
  ) {
    return;
  }

  try {
    await chrome.tabs.sendMessage(tab.id, { action: "toggleTranslation" });
  } catch {
    // Content script가 아직 로드되지 않았을 경우 수동 주입
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content.js"],
      });
      await chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        files: ["content.css"],
      });
      // 주입 후 다시 메시지 전송
      setTimeout(async () => {
        await chrome.tabs.sendMessage(tab.id, { action: "toggleTranslation" });
      }, 200);
    } catch (injectErr) {
      console.error("[WebTranslator] Content script 주입 실패:", injectErr);
    }
  }
});

/* ────────────────────────────────────────────
 * 2. Content Script ↔ Background 메시지 처리
 * ──────────────────────────────────────────── */

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  // 2-a. 설정 가져오기
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
    return true; // 비동기 응답 유지
  }

  // 2-b. 번역 요청
  if (message.action === "translate") {
    handleTranslation(message)
      .then(sendResponse)
      .catch((err) => sendResponse({ error: err.message }));
    return true; // 비동기 응답 유지
  }

  // 2-c. 캐시 조회 (영구 저장)
  if (message.action === "getCache") {
    const cacheKey = `wt_cache_${message.targetLang}`;
    chrome.storage.local.get([cacheKey]).then((data) => {
      sendResponse({ cache: data[cacheKey] || {} });
    });
    return true;
  }

  // 2-d. 캐시 저장 (병합) — [P1 FIX #10] fire-and-forget (메시지 채널 즉시 해제)
  if (message.action === "setCache") {
    const cacheKey = `wt_cache_${message.targetLang}`;
    chrome.storage.local.get([cacheKey]).then((data) => {
      const currentCache = data[cacheKey] || {};
      const newCache = { ...currentCache, ...message.dictionary };
      chrome.storage.local.set({ [cacheKey]: newCache });
    });
    return false; // 비동기 응답 불필요 — SW 수명 누수 방지
  }

  // 2-e. 캐시 전체 초기화
  if (message.action === "clearCache") {
    chrome.storage.local.clear().then(() => sendResponse({ success: true }));
    return true;
  }

  // 2-f. 단어 사전 조회
  if (message.action === "lookupWord") {
    const apiKey =
      message.mode === "openai" ? message.openaiApiKey :
      message.mode === "claude" ? message.claudeApiKey :
      message.apiKey;
    const modelName =
      message.mode === "openai" ? message.openaiModel :
      message.mode === "claude" ? message.claudeModel :
      message.geminiModel;

    fetchWordDictionary(
      message.word,
      message.targetLang,
      message.mode,
      apiKey,
      modelName,
      message.libreUrl || message.ollamaUrl
    )
      .then((dictData) => sendResponse({ data: dictData }))
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  // 2-g. 이미지 번역 (v3.0)
  if (message.action === "translateImage") {
    handleImageTranslation(message, _sender)
      .then((res) => sendResponse({ success: true, blocks: res }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // 비동기 응답 유지
  }

  // 2-h. 텍스트 바운딩 박스 추출 및 수학적 중심점 계산
  if (message.action === "locateBoundingBoxes") {
    handleBoundingBoxesLocation(message, _sender)
      .then((res) => sendResponse({ success: true, items: res }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // 2-i. CORS 우회 이미지 Base64 변환 요청
  if (message.action === "fetchBase64") {
    fetchImageAsBase64(message.imageUrl, message.pageUrl || _sender?.tab?.url || "")
      .then((dataUrl) => sendResponse({ success: true, dataUrl }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

/**
 * 텍스트 바운딩 박스 탐지 처리
 */
async function handleBoundingBoxesLocation(message, sender) {
  let base64DataUrl = message.imageUrl;
  if (!base64DataUrl.startsWith("data:")) {
    const refererUrl = message.pageUrl || sender?.tab?.url || "";
    base64DataUrl = await fetchImageAsBase64(message.imageUrl, refererUrl);
  }

  let openaiModel = message.openaiModel || "gpt-4o-mini";
  if (openaiModel.toLowerCase().includes("nano")) {
    openaiModel = "gpt-4o";
  }

  return await locateBoundingBoxesWithVision({
    base64DataUrl,
    naturalWidth: message.naturalWidth,
    naturalHeight: message.naturalHeight,
    mode: message.mode || "gemini",
    apiKey: message.apiKey || "",
    geminiModel: message.geminiModel || "gemini-3.6-flash",
    openaiApiKey: message.openaiApiKey || "",
    openaiModel: openaiModel,
  });
}

/**
 * 이미지 번역 처리 (Base64 변환 & Vision API 연동)
 */
async function handleImageTranslation(message, sender) {
  let base64DataUrl = message.imageUrl;

  // Data URL이 아니라 일반 HTTP(S) URL일 경우 Service Worker에서 Referer 포함하여 fetch
  if (!base64DataUrl.startsWith("data:")) {
    const refererUrl = message.pageUrl || sender?.tab?.url || "";
    base64DataUrl = await fetchImageAsBase64(message.imageUrl, refererUrl);
  }

  let openaiModel = message.openaiModel || "gpt-4o-mini";
  // nano / mini 계열 극소형 모델인 경우 Vision OCR 정밀도를 위해 풀사이즈 gpt-4o로 자동 매핑
  if (openaiModel.toLowerCase().includes("nano")) {
    openaiModel = "gpt-4o";
  }

  return await translateImageWithVision({
    base64DataUrl,
    mode: message.mode || "gemini",
    apiKey: message.apiKey || "",
    geminiModel: message.geminiModel || "gemini-3.6-flash",
    openaiApiKey: message.openaiApiKey || "",
    openaiModel: openaiModel,
    userSpecifiedModel: message.openaiModel || "",
    targetLang: message.targetLang || "ko",
  });
}

/**
 * CORS/Referer 보호 이미지를 Base64 DataURL로 변환
 */
async function fetchImageAsBase64(imageUrl, refererUrl) {
  const ruleId = 9999;
  if (refererUrl && chrome.declarativeNetRequest) {
    try {
      await chrome.declarativeNetRequest.updateSessionRules({
        removeRuleIds: [ruleId],
        addRules: [
          {
            id: ruleId,
            priority: 1,
            action: {
              type: "modifyHeaders",
              requestHeaders: [
                { header: "Referer", operation: "set", value: refererUrl }
              ]
            },
            condition: {
              urlFilter: imageUrl,
              resourceTypes: ["xmlhttprequest", "image", "other"]
            }
          }
        ]
      });
    } catch (ruleErr) {
      console.warn("[WebTranslator] DeclarativeNetRequest 규칙 설정 실패:", ruleErr);
    }
  }

  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`이미지 다운로드 실패 (HTTP ${response.status})`);
    }

    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("이미지 Base64 변환 실패"));
      reader.readAsDataURL(blob);
    });
  } finally {
    if (chrome.declarativeNetRequest) {
      try {
        await chrome.declarativeNetRequest.updateSessionRules({
          removeRuleIds: [ruleId]
        });
      } catch {}
    }
  }
}

/**
 * 번역 모드에 따라 적절한 API를 호출합니다.
 */
async function handleTranslation({
  texts,
  targetLang,
  mode,
  apiKey,
  geminiModel,
  openaiApiKey,
  openaiModel,
  claudeApiKey,
  claudeModel,
  ollamaUrl,
  ollamaModel,
  ollamaCustomPrompt,
  libreUrl,
  isPopup,
  showPhonetics,
  phoneticLanguage,
}) {
  const startTime = performance.now();
  console.group(`[WebTranslator DEBUG] [Engine: ${mode.toUpperCase()}] 번역 요청 전송 (Target: ${targetLang} / Batch Size: ${texts.length})`);
  console.table(texts.map((t, idx) => ({ Index: idx, OriginalText: t })));
  console.groupEnd();

  let translations;
  let phonetics = null;
  
  const apiOptions = { isPopup, showPhonetics, phoneticLanguage };

  try {
    let result;
    if (mode === "gemini") {
      result = await translateWithGemini(texts, targetLang, apiKey, geminiModel, apiOptions);
    } else if (mode === "openai") {
      result = await translateWithOpenAI(texts, targetLang, openaiApiKey, openaiModel, apiOptions);
    } else if (mode === "claude") {
      result = await translateWithClaude(texts, targetLang, claudeApiKey, claudeModel, apiOptions);
    } else if (mode === "ollama") {
      result = await translateWithOllama(texts, targetLang, ollamaUrl, ollamaModel, ollamaCustomPrompt, apiOptions);
    } else if (mode === "libre") {
      result = await translateWithLibre(texts, targetLang, libreUrl, apiOptions);
    } else {
      result = await translateWithGoogle(texts, targetLang, apiOptions);
    }

    // Some APIs might just return an array of strings (backwards compatibility)
    if (Array.isArray(result)) {
      translations = result;
    } else {
      translations = result.translations;
      phonetics = result.phonetics;
    }
    const duration = Math.round(performance.now() - startTime);

    console.group(`[WebTranslator DEBUG] [Engine: ${mode.toUpperCase()}] 번역 응답 수신 (소요시간: ${duration}ms)`);
    console.table(texts.map((t, idx) => ({
      Index: idx,
      Original: t,
      Translated: translations[idx] || "(응답 없음)"
    })));
    console.groupEnd();

    return { translations, phonetics, engine: mode };
  } catch (err) {
    console.error(`[WebTranslator DEBUG] [Engine: ${mode.toUpperCase()}] 번역 실패:`, err);
    throw err;
  }
}

/* ────────────────────────────────────────────
 * 3. 확장 프로그램 아이콘 클릭 → 옵션 페이지 열기
 * ──────────────────────────────────────────── */

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

/* ────────────────────────────────────────────
 * 4. 설치/업데이트 시 우클릭 컨텍스트 메뉴 등록 및 기본 설정 초기화
 * ──────────────────────────────────────────── */

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === "install") {
    chrome.storage.sync.set({
      translationMode: "google",
      geminiApiKey: "",
      targetLang: "ko",
      displayMode: "dual",
    });
  }
});



