export function initializeKeyboardShortcuts() {
  chrome.commands.onCommand.addListener(async (command) => {
    if (command !== "translate-page") return;

    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!tab?.id) return;

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
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["content.js"],
        });
        await chrome.scripting.insertCSS({
          target: { tabId: tab.id },
          files: ["content.css"],
        });
        setTimeout(async () => {
          await chrome.tabs.sendMessage(tab.id, { action: "toggleTranslation" });
        }, 200);
      } catch (injectErr) {
        console.error("[WebTranslator] Content script 주입 실패:", injectErr);
      }
    }
  });
}
