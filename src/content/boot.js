(async () => {
  try {
    const src = chrome.runtime.getURL("src/content/index.js");
    await import(src);
    console.log("[WebTranslator] Content scripts loaded via boot.js");
  } catch (err) {
    console.error("[WebTranslator] Failed to load content scripts:", err);
  }
})();
