export function initializeInstallHooks() {
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
}
