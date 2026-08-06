import { state } from "./state.js";
import { startTranslation, revertTranslation } from "./translation.js";
import "./dictionary.js";

/* ────────────────────────────────────────────
   * 설정 실시간 업데이트 리스너 (팝업 메뉴용)
   * ──────────────────────────────────────────── */
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync") {
    let styleChanged = false;
    for (let [key, { newValue }] of Object.entries(changes)) {
      if (state.settings) {
        state.settings[key] = newValue;
      }
      if (['transColor', 'transBgAlpha', 'transFontSize', 'transItalic'].includes(key)) {
        styleChanged = true;
      }
    }
    // 색상 등 스타일 관련 값이 변했다면 화면 내 블록들 즉시 업데이트
    if (styleChanged && state.settings) {
      import("./ui.js").then((ui) => {
        ui.updateCustomStyles(state.settings);
      });
    }
  }
});

/* ────────────────────────────────────────────
   * 메시지 리스너
   * ──────────────────────────────────────────── */

  function handleToggleTranslation() {
    if (state.isTranslating) return;
    if (state.isTranslated) revertTranslation();
    else startTranslation();
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "toggleTranslation") {
      handleToggleTranslation();
    } else if (message.action === "updateStylePreview") {
      if (state.settings) {
        state.settings[message.key] = message.value;
        import("./ui.js").then((ui) => {
          ui.updateCustomStyles(state.settings);
        });
      }
    }
  });

  // 커스텀 단축키 리스너
  window.addEventListener("keydown", (e) => {
    try {
      chrome.storage.sync.get(["customShortcut"], (settings) => {
        if (chrome.runtime.lastError) return; // 무시
        if (settings.customShortcut && settings.customShortcut !== "Alt+A") {
          const keys = settings.customShortcut.split("+");
          const requiresAlt = keys.includes("Alt");
          const requiresCtrl = keys.includes("Ctrl");
          const requiresShift = keys.includes("Shift");
          const mainKey = keys[keys.length - 1];

          if (
            e.altKey === requiresAlt &&
            e.ctrlKey === requiresCtrl &&
            e.shiftKey === requiresShift &&
            e.key.toUpperCase() === mainKey.toUpperCase()
          ) {
            e.preventDefault();
            handleToggleTranslation();
          }
        }
      });
    } catch (err) {
      // Extension context invalidated 에러 등은 무시 (새로고침 필요 상태)
    }
  });

  /* ────────────────────────────────────────────
   * v3.0 이미지 번역 호버 버튼 초기화
   * ──────────────────────────────────────────── */
  import(chrome.runtime.getURL("modules/image_translator/hover_button_manager.js"))
    .then((mod) => mod.initHoverButtonManager())
    .catch((err) => console.error("[WebTranslator] v3.0 HoverManager 로드 실패:", err));
