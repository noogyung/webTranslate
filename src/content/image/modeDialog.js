/* ────────────────────────────────────────────
 * 이미지 번역 모드 선택 다이얼로그
 * ──────────────────────────────────────────── */

const DIALOG_ID = "wt-image-mode-dialog";
const SITE_MEMORY_KEY = "wtImageModeSites";

export async function getSavedModeForSite(hostname) {
  return new Promise((resolve) => {
    chrome.storage.local.get([SITE_MEMORY_KEY], (data) => {
      const sites = data[SITE_MEMORY_KEY] || {};
      resolve(sites[hostname] || null);
    });
  });
}

function saveModeForSite(hostname, mode) {
  chrome.storage.local.get([SITE_MEMORY_KEY], (data) => {
    const sites = data[SITE_MEMORY_KEY] || {};
    sites[hostname] = mode;
    chrome.storage.local.set({ [SITE_MEMORY_KEY]: sites });
  });
}

export function showModeDialog() {
  return new Promise((resolve) => {
    // 기존 다이얼로그 제거
    const existing = document.getElementById(DIALOG_ID);
    if (existing) existing.remove();

    // 스타일 주입
    injectDialogStyles();

    // 오버레이
    const overlay = document.createElement("div");
    overlay.id = DIALOG_ID;
    overlay.className = "wt-mode-overlay";

    // 다이얼로그 본체
    const dialog = document.createElement("div");
    dialog.className = "wt-mode-dialog";

    dialog.innerHTML = `
      <div class="wt-mode-title">이미지 번역 모드 선택</div>
      <button class="wt-mode-btn" data-mode="standard">
        <span class="wt-mode-icon">📄</span>
        <div class="wt-mode-info">
          <div class="wt-mode-name">일반</div>
          <div class="wt-mode-desc">텍스트 추출 → 오버레이 번역 · 추가 비용 없음 · 빠름</div>
        </div>
      </button>
      <button class="wt-mode-btn" data-mode="premium">
        <span class="wt-mode-icon">✨</span>
        <div class="wt-mode-info">
          <div class="wt-mode-name">고급</div>
          <div class="wt-mode-desc">AI가 원본에 직접 번역 합성 · 최고 품질 · Gemini/OpenAI · 과금</div>
        </div>
      </button>
      <label class="wt-mode-remember">
        <input type="checkbox" class="wt-mode-checkbox" />
        이 사이트에서 기억하기
      </label>
      <div class="wt-mode-actions">
        <button class="wt-mode-cancel">취소</button>
      </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    // 이벤트 바인딩
    const cleanup = () => {
      overlay.remove();
    };

    dialog.querySelectorAll(".wt-mode-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const mode = btn.dataset.mode;
        const remember = dialog.querySelector(".wt-mode-checkbox").checked;
        if (remember) {
          saveModeForSite(location.hostname, mode);
        }
        cleanup();
        resolve(mode);
      });
    });

    dialog.querySelector(".wt-mode-cancel").addEventListener("click", () => {
      cleanup();
      resolve(null);
    });

    // 오버레이 배경 클릭 → 취소
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        cleanup();
        resolve(null);
      }
    });

    // ESC 키
    const onEsc = (e) => {
      if (e.key === "Escape") {
        document.removeEventListener("keydown", onEsc);
        cleanup();
        resolve(null);
      }
    };
    document.addEventListener("keydown", onEsc);
  });
}

const DIALOG_STYLE_ID = "wt-mode-dialog-styles";

function injectDialogStyles() {
  if (document.getElementById(DIALOG_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = DIALOG_STYLE_ID;
  style.textContent = `
    .wt-mode-overlay {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    .wt-mode-dialog {
      background: #1e1e2e;
      color: #cdd6f4;
      border-radius: 12px;
      padding: 24px;
      width: 380px;
      max-width: 90vw;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    }
    .wt-mode-title {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 16px;
      color: #cdd6f4;
    }
    .wt-mode-btn {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
      padding: 12px;
      margin-bottom: 8px;
      background: #313244;
      border: 1px solid #45475a;
      border-radius: 8px;
      cursor: pointer;
      text-align: left;
      color: #cdd6f4;
      transition: border-color 0.15s, background 0.15s;
    }
    .wt-mode-btn:hover {
      border-color: #89b4fa;
      background: #3b3d52;
    }
    .wt-mode-icon {
      font-size: 24px;
      flex-shrink: 0;
    }
    .wt-mode-name {
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 2px;
    }
    .wt-mode-desc {
      font-size: 11px;
      color: #a6adc8;
      line-height: 1.4;
    }
    .wt-mode-remember {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      color: #a6adc8;
      margin: 12px 0 16px;
      cursor: pointer;
    }
    .wt-mode-checkbox {
      accent-color: #89b4fa;
    }
    .wt-mode-actions {
      display: flex;
      justify-content: flex-end;
    }
    .wt-mode-cancel {
      padding: 6px 16px;
      background: transparent;
      border: 1px solid #45475a;
      border-radius: 6px;
      color: #a6adc8;
      cursor: pointer;
      font-size: 13px;
    }
    .wt-mode-cancel:hover {
      background: #313244;
    }
  `;
  document.head.appendChild(style);
}
