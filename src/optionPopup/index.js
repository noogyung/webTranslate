import { getSettings, saveSettings, clearTranslationCache } from "../options/storage.js";

const elements = {
  translationMode: document.getElementById("translationMode"),
  targetLang: document.getElementById("targetLang"),
  displayMode: document.getElementById("displayMode"),
  transColor: document.getElementById("transColor"),
  transBgAlpha: document.getElementById("transBgAlpha"),
  transFontSize: document.getElementById("transFontSize"),
  openOptionsBtn: document.getElementById("openOptionsBtn"),
  clearCacheBtn: document.getElementById("clearCacheBtn"),
  inlineShadow: document.getElementById("inlineShadow"),
  inlineHighlight: document.getElementById("inlineHighlight"),
  inlineAdaptiveColor: document.getElementById("inlineAdaptiveColor"),
  inlineInheritColor: document.getElementById("inlineInheritColor"),
  inlineOptionsToggle: document.getElementById("inlineOptionsToggle"),
  inlineOptionsMenu: document.getElementById("inlineOptionsMenu"),
  inlineOptionsLabel: document.getElementById("inlineOptionsLabel"),
};

// 1. 기존 설정 불러오기
async function initialize() {
  const settings = await getSettings();
  
  if (elements.translationMode) elements.translationMode.value = settings.translationMode || "google";
  if (elements.targetLang) elements.targetLang.value = settings.targetLang || "ko";
  if (elements.displayMode) elements.displayMode.value = settings.displayMode || "dual";
  if (elements.transColor) elements.transColor.value = settings.transColor || "#818cf8";
  if (elements.transBgAlpha) elements.transBgAlpha.value = settings.transBgAlpha !== undefined ? settings.transBgAlpha : 0.12;
  if (elements.transFontSize) elements.transFontSize.value = settings.transFontSize || "100%";
  
  if (elements.inlineShadow) elements.inlineShadow.checked = settings.inlineShadow || false;
  if (elements.inlineHighlight) elements.inlineHighlight.checked = settings.inlineHighlight || false;
  if (elements.inlineAdaptiveColor) elements.inlineAdaptiveColor.checked = settings.inlineAdaptiveColor || false;
  if (elements.inlineInheritColor) elements.inlineInheritColor.checked = settings.inlineInheritColor !== undefined ? settings.inlineInheritColor : true;
  
  updateInlineOptionsLabel();
}

function updateInlineOptionsLabel() {
  if (!elements.inlineOptionsLabel) return;
  let count = 0;
  if (elements.inlineShadow && elements.inlineShadow.checked) count++;
  if (elements.inlineHighlight && elements.inlineHighlight.checked) count++;
  if (elements.inlineAdaptiveColor && elements.inlineAdaptiveColor.checked) count++;
  if (elements.inlineInheritColor && elements.inlineInheritColor.checked) count++;
  
  elements.inlineOptionsLabel.textContent = count === 0 ? "선택 안됨" : `선택 (${count})`;
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
  ['translationMode', 'targetLang', 'displayMode', 'transFontSize'].forEach(id => {
    if (elements[id]) {
      elements[id].addEventListener("change", (e) => updateSetting(id, e.target.value));
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

  // 인라인 옵션 이벤트
  ['inlineShadow', 'inlineHighlight', 'inlineAdaptiveColor', 'inlineInheritColor'].forEach(id => {
    if (elements[id]) {
      elements[id].addEventListener("change", (e) => {
        updateSetting(id, e.target.checked);
        updateInlineOptionsLabel();
        notifyPreview(id, e.target.checked);
      });
    }
  });

  if (elements.inlineOptionsToggle && elements.inlineOptionsMenu) {
    elements.inlineOptionsToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      const isVisible = elements.inlineOptionsMenu.style.display === "block";
      elements.inlineOptionsMenu.style.display = isVisible ? "none" : "block";
    });
    
    document.addEventListener("click", (e) => {
      if (!elements.inlineOptionsToggle.contains(e.target) && !elements.inlineOptionsMenu.contains(e.target)) {
        elements.inlineOptionsMenu.style.display = "none";
      }
    });
  }

  // 상세 설정 열기
  if (elements.openOptionsBtn) {
    elements.openOptionsBtn.addEventListener("click", () => {
      chrome.runtime.openOptionsPage();
      window.close(); // 팝업 닫기
    });
  }

  // 캐시 초기화
  if (elements.clearCacheBtn) {
    elements.clearCacheBtn.addEventListener("click", async () => {
      try {
        await clearTranslationCache();
        alert("캐시가 초기화되었습니다.");
      } catch (e) {
        alert("캐시 초기화 실패");
      }
    });
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  await initialize();
  bindEvents();
});
