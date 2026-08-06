  /* ────────────────────────────────────────────
   * 메시지 리스너
   * ──────────────────────────────────────────── */

  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "toggleTranslation") {
      if (isTranslating) return;
      if (isTranslated) revertTranslation();
      else startTranslation();
    }
  });

\n  /* ────────────────────────────────────────────
   * v3.0 이미지 번역 호버 버튼 초기화
   * ──────────────────────────────────────────── */
  import(chrome.runtime.getURL("modules/image_translator/hover_button_manager.js"))
    .then((mod) => mod.initHoverButtonManager())
    .catch((err) => console.error("[WebTranslator] v3.0 HoverManager 로드 실패:", err));
})();

