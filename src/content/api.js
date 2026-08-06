/* ────────────────────────────────────────────
   * Background 메시지 유틸
   * ──────────────────────────────────────────── */

  export function sendToBackground(message) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) resolve(null);
          else resolve(response);
        });
      } catch {
        resolve(null);
      }
    });
  }

