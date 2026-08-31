/* ────────────────────────────────────────────
 * 이미지 번역 모듈 진입점
 * ──────────────────────────────────────────── */

import { getHoveredImage } from "./hoverManager.js";
import { showModeDialog, getSavedModeForSite } from "./modeDialog.js";
import { createCanvasOverlay, createImageOverlay, toggleOverlay } from "./overlayManager.js";
import { sendToBackground } from "../api.js";

let isProcessing = false;

/* ────────────────────────────────────────────
 * Alt+S 단축키 메시지 리스너
 * ──────────────────────────────────────────── */
chrome.runtime.onMessage.addListener((message) => {
  if (message.action !== "triggerImageTranslation") return;

  const img = getHoveredImage();
  if (!img) return;

  // 이미 번역된 이미지 → 토글
  if (img.dataset.wtImageTranslated) {
    toggleOverlay(img);
    return;
  }

  if (isProcessing) return;
  handleImageTranslation(img);
});

async function handleImageTranslation(img) {
  isProcessing = true;

  try {
    // 설정 가져오기
    const settings = await sendToBackground({ action: "getSettings" });

    let mode = null;

    if (settings.imageTransMode && settings.imageTransMode !== "ask") {
      mode = settings.imageTransMode;
    } else {
      const savedMode = await getSavedModeForSite(location.hostname);
      if (savedMode) {
        mode = savedMode;
      } else {
        mode = await showModeDialog();
      }
    }

    if (!mode) {
      isProcessing = false;
      return;
    }

    // 로딩 상태 표시
    img.style.opacity = "0.5";
    img.style.transition = "opacity 0.2s";

    // 이미지 Base64 가져오기
    let imageUrl = img.src;
    if (!imageUrl.startsWith("data:")) {
      const fetchResult = await sendToBackground({
        action: "fetchBase64",
        imageUrl: img.src,
        pageUrl: location.href,
      });
      if (!fetchResult.success) throw new Error(fetchResult.error || "이미지 다운로드 실패");
      imageUrl = fetchResult.dataUrl;
    }

    if (mode === "standard") {
      await handleStandardMode(img, imageUrl, settings);
    } else if (mode === "premium") {
      await handlePremiumMode(img, imageUrl, settings);
    }

  } catch (err) {
    console.error("[WT Image] 번역 오류:", err);
    showErrorToast(err.message);
  } finally {
    img.style.opacity = "";
    img.style.transition = "";
    isProcessing = false;
  }
}

async function handleStandardMode(img, imageUrl, settings) {
  const result = await sendToBackground({
    action: "translateStandard",
    imageUrl,
    naturalWidth: img.naturalWidth,
    naturalHeight: img.naturalHeight,
    targetLang: settings.targetLang || "ko",
    mode: settings.translationMode || "gemini",
    apiKey: settings.geminiApiKey || "",
    geminiModel: settings.geminiModel || "gemini-3.6-flash",
    openaiApiKey: settings.openaiApiKey || "",
    openaiModel: settings.openaiModel || "gpt-4o-mini",
    pageUrl: location.href,
  });

  if (!result.success) throw new Error(result.error || "일반 모드 번역 실패");
  if (!result.blocks || result.blocks.length === 0) throw new Error("감지된 텍스트가 없습니다.");

  // ── 디버깅: OCR + 번역 결과 콘솔 출력 ──────────────────────
  console.group(
    `%c[WT Image Debug] 일반 모드 OCR 결과 — ${result.blocks.length}개 블록 / 이미지 ${img.naturalWidth}×${img.naturalHeight}px`,
    "color: #89b4fa; font-weight: bold; font-size: 13px;"
  );
  console.table(
    result.blocks.map((b, i) => {
      const box = b.eraseBox || {};
      return {
        "#": i,
        원문: b.originalText?.substring(0, 40),
        번역: b.translatedText?.substring(0, 40),
        "X(px)": box.x ?? "?",
        "Y(px)": box.y ?? "?",
        "W(px)": box.width ?? "?",
        "H(px)": box.height ?? "?",
        좌표변환: box._wasNormalized ? "0~1000→px" : "원본px",
        타입: b.type || "-",
        방향: b.orientation || "-",
      };
    })
  );
  console.log("[WT Image Debug] 전체 블록 데이터:", result.blocks);
  console.groupEnd();
  // ─────────────────────────────────────────────────────────────

  createCanvasOverlay(img, result.blocks);
}

async function handlePremiumMode(img, imageUrl, settings) {
  const result = await sendToBackground({
    action: "translatePremium",
    imageUrl,
    targetLang: settings.targetLang || "ko",
    premiumEngine: settings.imageTransPremiumEngine || "gemini",
    premiumModel: settings.imageTransPremiumModel || "gemini-3.1-flash-image",
    apiKey: settings.geminiApiKey || "",
    openaiApiKey: settings.openaiApiKey || "",
    pageUrl: location.href,
  });

  if (!result.success) throw new Error(result.error || "고급 모드 번역 실패");
  if (!result.dataUrl) throw new Error("번역된 이미지가 반환되지 않았습니다.");

  createImageOverlay(img, result.dataUrl);

  // 비용 안내 (10회마다)
  if (settings.imageCostNotify !== false) {
    showCostNotificationIfNeeded(settings);
  }
}

function showErrorToast(message) {
  const toast = document.createElement("div");
  const isPaidPlanError = message.includes("유료 플랜") || message.includes("결제");
  const displayTime = isPaidPlanError ? 8000 : 5000;

  toast.style.cssText = `
    position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
    background: #f38ba8; color: #1e1e2e; padding: 12px 20px;
    border-radius: 8px; font-size: 13px; z-index: 2147483647;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    max-width: min(480px, 90vw);
    white-space: pre-wrap;
    line-height: 1.5;
    display: flex;
    align-items: flex-start;
    gap: 8px;
  `;

  const icon = document.createElement("span");
  icon.textContent = "⚠️";
  icon.style.flexShrink = "0";

  const text = document.createElement("span");
  text.style.flex = "1";
  text.textContent = message;

  const closeBtn = document.createElement("span");
  closeBtn.textContent = "✕";
  closeBtn.style.cssText = "cursor: pointer; margin-left: 8px; flex-shrink: 0; opacity: 0.7;";
  closeBtn.addEventListener("click", () => toast.remove());

  toast.appendChild(icon);
  toast.appendChild(text);
  toast.appendChild(closeBtn);
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), displayTime);
}

async function showCostNotificationIfNeeded(settings) {
  try {
    const statsKey = "wtImageStats";
    const data = await new Promise((resolve) => {
      chrome.storage.local.get([statsKey], resolve);
    });
    const stats = data[statsKey] || {};
    const today = new Date().toISOString().split("T")[0];
    const todayStats = stats[today] || { premium: 0, standard: 0 };
    const count = todayStats.premium;

    if (count > 0 && count % 10 === 0) {
      const costLow = (count * 0.02).toFixed(2);
      const costHigh = (count * 0.045).toFixed(2);

      const toast = document.createElement("div");
      toast.style.cssText = `
        position: fixed; bottom: 20px; right: 20px;
        background: #313244; color: #cdd6f4; padding: 12px 18px;
        border-radius: 8px; font-size: 13px; z-index: 2147483647;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3); max-width: 340px;
        border-left: 3px solid #89b4fa;
      `;
      toast.innerHTML = `ℹ️ 오늘 고급 번역 <b>${count}회</b> · 예상 ~$${costLow}~${costHigh}`;

      const closeBtn = document.createElement("span");
      closeBtn.textContent = " ✕";
      closeBtn.style.cssText = "cursor: pointer; margin-left: 8px; color: #a6adc8;";
      closeBtn.addEventListener("click", () => toast.remove());
      toast.appendChild(closeBtn);

      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 6000);
    }
  } catch {}
}
