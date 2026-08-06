import { getSettings, saveSettings } from "../options/storage.js";

const elements = {
  targetLang: document.getElementById("targetLang"),
  displayMode: document.getElementById("displayMode"),
  lazyTranslate: document.getElementById("lazyTranslate"),
  transColor: document.getElementById("transColor"),
  transBgAlpha: document.getElementById("transBgAlpha"),
  transFontSize: document.getElementById("transFontSize"),
  transItalic: document.getElementById("transItalic"),
  openOptionsBtn: document.getElementById("openOptionsBtn"),
};

// 1. 기존 설정 불러오기
async function initialize() {
  const settings = await getSettings();
  
  if (elements.targetLang) elements.targetLang.value = settings.targetLang || "ko";
  if (elements.displayMode) elements.displayMode.value = settings.displayMode || "dual";
  if (elements.lazyTranslate) elements.lazyTranslate.checked = settings.lazyTranslate !== false; // 기본값 true
  if (elements.transColor) elements.transColor.value = settings.transColor || "#818cf8";
  if (elements.transBgAlpha) elements.transBgAlpha.value = settings.transBgAlpha !== undefined ? settings.transBgAlpha : 0.12;
  if (elements.transFontSize) elements.transFontSize.value = settings.transFontSize || "100%";
  if (elements.transItalic) elements.transItalic.checked = settings.transItalic || false;
}

// 2. 실시간 저장 로직
async function updateSetting(key, value) {
  try {
    const changes = {};
    changes[key] = value;
    await saveSettings(changes);
  } catch (err) {
    console.error("[WebTranslator] 팝업 설정 저장 실패:", err);
  }
}

// 3. 이벤트 바인딩
function bindEvents() {
  // select elements
  ['targetLang', 'displayMode', 'transFontSize'].forEach(id => {
    if (elements[id]) {
      elements[id].addEventListener("change", (e) => updateSetting(id, e.target.value));
    }
  });

  // checkbox elements
  ['lazyTranslate', 'transItalic'].forEach(id => {
    if (elements[id]) {
      elements[id].addEventListener("change", (e) => updateSetting(id, e.target.checked));
    }
  });

  // 실시간 미리보기 (Storage 쿼터 초과 방지를 위해 input은 메시지만 발송하고 change에서 최종 저장)
  async function notifyPreview(key, value) {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs.length > 0 && tabs[0].id) {
        chrome.tabs.sendMessage(tabs[0].id, { action: "updateStylePreview", key, value }).catch(() => {});
      }
    } catch (e) {}
  }

  if (elements.transColor) {
    elements.transColor.addEventListener("input", (e) => notifyPreview("transColor", e.target.value));
    elements.transColor.addEventListener("change", (e) => updateSetting("transColor", e.target.value));
  }

  if (elements.transBgAlpha) {
    elements.transBgAlpha.addEventListener("input", (e) => notifyPreview("transBgAlpha", parseFloat(e.target.value)));
    elements.transBgAlpha.addEventListener("change", (e) => updateSetting("transBgAlpha", parseFloat(e.target.value)));
  }

  // 상세 설정 열기
  if (elements.openOptionsBtn) {
    elements.openOptionsBtn.addEventListener("click", () => {
      chrome.runtime.openOptionsPage();
      window.close(); // 팝업 닫기
    });
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  await initialize();
  bindEvents();
});
