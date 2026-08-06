/* ────────────────────────────────────────────
   * Background 메시지 유틸
   * ──────────────────────────────────────────── */

  export function sendToBackground(message) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            resolve({ error: chrome.runtime.lastError.message || "Unknown communication error" });
          } else if (response === undefined) {
            resolve({ error: "Background script returned undefined response" });
          } else {
            resolve(response);
          }
        });
      } catch (err) {
        resolve({ error: err.message || "Failed to send message to background" });
      }
    });
  }

