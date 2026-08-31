export function initializeKeyboardShortcuts() {
  chrome.commands.onCommand.addListener(async (command) => {
    if (command !== "translate-page" && command !== "translate-image") return;

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
      if (command === "translate-page") {
        await chrome.tabs.sendMessage(tab.id, { action: "toggleTranslation" });
      } else if (command === "translate-image") {
        await chrome.tabs.sendMessage(tab.id, { action: "triggerImageTranslation" });
      }
    } catch (err) {
      console.warn("[WebTranslator] 탭 메시지 전송 실패 (페이지 새로고침 필요):", err);
    }
  });
}
