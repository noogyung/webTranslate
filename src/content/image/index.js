/* ────────────────────────────────────────────
 * 이미지 번역 모듈 진입점
 * ──────────────────────────────────────────── */

import { getHoveredImage } from "./hoverManager.js";
import { showModeDialog, getSavedModeForSite } from "./modeDialog.js";
import { createCanvasOverlay, createImageOverlay, upgradeToImageOverlay, toggleOverlay } from "./overlayManager.js";
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

/* ── 단계별 타이밍 로거 ──────────────────────────────────────── */
function wtTimer(label) {
  const start = performance.now();
  return () => {
    const ms = Math.round(performance.now() - start);
    console.log(`%c[WT Timing] ${label}: ${ms}ms`, "color: #a6e3a1; font-weight: bold;");
    return ms;
  };
}

async function handleImageTranslation(img) {
  isProcessing = true;
  const t0 = performance.now();
  console.group("%c[WT Image] 번역 시작", "color: #89b4fa; font-weight: bold;");

  try {
    let tEnd = wtTimer("설정 로드");
    const settings = await sendToBackground({ action: "getSettings" });
    tEnd();

    let mode = null;
    if (settings.imageMode && settings.imageMode !== "ask") {
      mode = settings.imageMode;
    } else {
      const savedMode = await getSavedModeForSite(location.hostname);
      mode = savedMode || await showModeDialog();
    }

    if (!mode) { isProcessing = false; console.groupEnd(); return; }

    img.style.opacity = "0.5";
    img.style.transition = "opacity 0.2s";

    // ── 이미지 Fetch ──────────────────────────────────────────
    let imageUrl = img.src;
    if (!imageUrl.startsWith("data:")) {
      tEnd = wtTimer("이미지 다운로드 (fetchBase64)");
      const fetchResult = await sendToBackground({
        action: "fetchBase64",
        imageUrl: img.src,
        pageUrl: location.href,
      });
      tEnd();
      if (!fetchResult.success) throw new Error(fetchResult.error || "이미지 다운로드 실패");
      imageUrl = fetchResult.dataUrl;
    }

    // ── 이미지 압축 (긴 축 1024px) ───────────────────────────
    tEnd = wtTimer("이미지 압축 (compressBase64ForOcr)");
    imageUrl = await compressBase64ForOcr(imageUrl, img.naturalWidth, img.naturalHeight);
    tEnd();

    if (mode === "standard") {
      await handleStandardMode(img, imageUrl, settings);
    } else if (mode === "premium") {
      await handlePremiumMode(img, imageUrl, settings);
    }

    const total = Math.round(performance.now() - t0);
    console.log(`%c[WT Timing] ✅ 전체 완료: ${total}ms`, "color: #cba6f7; font-size: 13px; font-weight: bold;");

  } catch (err) {
    console.error("[WT Image] 번역 오류:", err);
    showErrorToast(err.message);
  } finally {
    img.style.opacity = "";
    img.style.transition = "";
    isProcessing = false;
    console.groupEnd();
  }
}
/* ── OCR 정확도 유지 최소 해상도 압축 ─────────────────────────
 * 긴 축 1024px: Vision API OCR 정확도 유지 최솟값
 * 이미 작은 이미지는 그대로 반환
 * ─────────────────────────────────────────────────────────── */
async function compressBase64ForOcr(base64DataUrl, naturalWidth, naturalHeight) {
  const MAX_LONG_EDGE = 1024;
  if (!naturalWidth || !naturalHeight) return base64DataUrl;

  const longEdge = Math.max(naturalWidth, naturalHeight);
  if (longEdge <= MAX_LONG_EDGE) {
    console.log(`[WT Compress] 압축 불필요 (${naturalWidth}×${naturalHeight}px)`);
    return base64DataUrl;
  }

  const scale = MAX_LONG_EDGE / longEdge;
  const targetW = Math.round(naturalWidth * scale);
  const targetH = Math.round(naturalHeight * scale);

  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = targetW;
      canvas.height = targetH;
      canvas.getContext("2d").drawImage(image, 0, 0, targetW, targetH);
      const compressed = canvas.toDataURL("image/jpeg", 0.92);
      const ratio = Math.round(compressed.length / base64DataUrl.length * 100);
      console.log(`[WT Compress] ${naturalWidth}×${naturalHeight} → ${targetW}×${targetH}px | 크기 ${ratio}%`);
      resolve(compressed);
    };
    image.onerror = () => { console.warn("[WT Compress] 압축 실패, 원본 사용"); resolve(base64DataUrl); };
    image.src = base64DataUrl;
  });
}

async function handleStandardMode(img, imageUrl, settings) {
  const engine = settings.imageStdEngine || "free";
  const tEnd = wtTimer(`일반 번역 [${engine}] (translateStandard)`);

  const result = await sendToBackground({
    action: "translateStandard",
    imageUrl,
    naturalWidth: img.naturalWidth,
    naturalHeight: img.naturalHeight,
    targetLang: settings.targetLang || "ko",
    pageUrl: location.href,
    // v2.0 일반 번역 엔진 정보
    imageStdEngine: engine,
    imageStdGeminiModel: settings.imageStdGeminiModel || "",
    imageStdOpenAIModel: settings.imageStdOpenAIModel || "",
    imageStdOtherType: settings.imageStdOtherType || "ocr_server",
    imageStdOtherUrl: settings.imageStdOtherUrl || "",
    imageStdOtherKey: settings.imageStdOtherKey || "",
    imageStdOtherModel: settings.imageStdOtherModel || "",
    // API 키 (공통)
    apiKey: settings.geminiApiKey || "",
    openaiApiKey: settings.openaiApiKey || "",
  });
  tEnd();

  if (!result.success) throw new Error(result.error || "일반 모드 번역 실패");
  if (!result.blocks || result.blocks.length === 0) throw new Error("감지된 텍스트가 없습니다.");

  console.group(
    `%c[WT Debug] OCR 결과 — ${result.blocks.length}개 블록 / ${img.naturalWidth}×${img.naturalHeight}px`,
    "color: #89b4fa; font-weight: bold;"
  );
  console.table(
    result.blocks.map((b, i) => {
      const box = b.eraseBox || {};
      return {
        "#": i,
        원문: b.originalText?.substring(0, 40),
        번역: b.translatedText?.substring(0, 40),
        "X(px)": box.x ?? "?", "Y(px)": box.y ?? "?",
        "W(px)": box.width ?? "?", "H(px)": box.height ?? "?",
        좌표: box._wasNormalized ? "0~1000→px" : "원본px",
        방향: b.orientation || "-",
      };
    })
  );
  console.groupEnd();

  const tRender = wtTimer("Canvas 렌더링");
  createCanvasOverlay(img, result.blocks);
  tRender();
}

/* ── 고급 모드: Step1 OCR모델 + Step2 합성모델 분리 전달 ────── */
async function handlePremiumMode(img, imageUrl, settings) {
  const engine = settings.imagePremEngine || "gemini";
  const tEnd = wtTimer(`고급 번역 [${engine}] (OCR → 이미지 합성)`);

  const result = await sendToBackground({
    action: "translatePremium",
    imageUrl,
    naturalWidth: img.naturalWidth,
    naturalHeight: img.naturalHeight,
    targetLang: settings.targetLang || "ko",
    pageUrl: location.href,
    // v2.0 고급 번역 엔진 정보
    imagePremEngine: engine,
    // Gemini Step1/Step2 모델
    imagePremGeminiOcrModel: settings.imagePremGeminiOcrModel || "",
    imagePremGeminiSynthModel: settings.imagePremGeminiSynthModel || "",
    // OpenAI Step1/Step2 모델
    imagePremOpenAIOcrModel: settings.imagePremOpenAIOcrModel || "",
    imagePremOpenAISynthModel: settings.imagePremOpenAISynthModel || "",
    // Other 서버 + Step1/Step2 모델
    imagePremOtherUrl: settings.imagePremOtherUrl || "",
    imagePremOtherKey: settings.imagePremOtherKey || "",
    imagePremOtherOcrModel: settings.imagePremOtherOcrModel || "",
    imagePremOtherSynthModel: settings.imagePremOtherSynthModel || "",
    // API 키 (공통)
    apiKey: settings.geminiApiKey || "",
    openaiApiKey: settings.openaiApiKey || "",
  });
  tEnd();

  if (!result.success) throw new Error(result.error || "고급 모드 번역 실패");
  if (!result.dataUrl) throw new Error("번역된 이미지가 반환되지 않았습니다.");

  createImageOverlay(img, result.dataUrl);

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
