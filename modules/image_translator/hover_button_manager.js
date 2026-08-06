/**
 * hover_button_manager.js — Mouse Hover Detection & Floating Button Manager
 */

import { extractImageSource, isEligibleImageElement } from "./image_loader.js";
import { detectTextWithLocalTesseract } from "./tesseract_ocr.js";
import {
  toggleGridOverlay,
  toggleDebugOverlay,
  toggleBoundingBoxesOverlay,
  isGridVisible,
  isDebugVisible,
  isBoundingBoxesVisible,
  getStoredBlocks,
  setStoredBlocks,
  getStoredBoundingBoxes,
  setStoredBoundingBoxes,
} from "./overlay_manager.js";

let activeHoverBtn = null;
let currentTargetEl = null;

export function initHoverButtonManager() {
  document.addEventListener("mouseover", handleMouseOver, true);
}

function handleMouseOver(e) {
  const target = e.target;
  if (!target || target.closest(".wt-image-trans-btn") || target.closest(".wt-image-canvas-overlay")) {
    return;
  }

  if (!isEligibleImageElement(target)) {
    return;
  }

  if (currentTargetEl === target && activeHoverBtn) {
    return;
  }

  currentTargetEl = target;
  showHoverButtons(target);
}

function updateButtonsPosition(targetEl) {
  if (!targetEl) return;
  const rect = targetEl.getBoundingClientRect();
  const scrollX = window.scrollX || window.pageXOffset;
  const scrollY = window.scrollY || window.pageYOffset;

  let top = rect.top + scrollY - 38;
  if (rect.top < 42) {
    top = rect.top + scrollY + rect.height + 8;
  }

  const rightBase = rect.right + scrollX;

  if (activeHoverBtn) {
    activeHoverBtn.style.position = "absolute";
    activeHoverBtn.style.left = `${rightBase - 95}px`;
    activeHoverBtn.style.top = `${top}px`;
    activeHoverBtn.style.zIndex = "999999";
  }

  const gridBtn = document.querySelector(".wt-grid-btn");
  if (gridBtn) {
    gridBtn.style.position = "absolute";
    gridBtn.style.left = `${rightBase - 190}px`;
    gridBtn.style.top = `${top}px`;
    gridBtn.style.zIndex = "999999";
  }

  const debugBtn = document.querySelector(".wt-debug-btn");
  if (debugBtn) {
    debugBtn.style.position = "absolute";
    debugBtn.style.left = `${rightBase - 295}px`;
    debugBtn.style.top = `${top}px`;
    debugBtn.style.zIndex = "999999";
  }

  const bboxBtn = document.querySelector(".wt-bbox-btn");
  if (bboxBtn) {
    bboxBtn.style.position = "absolute";
    bboxBtn.style.left = `${rightBase - 425}px`;
    bboxBtn.style.top = `${top}px`;
    bboxBtn.style.zIndex = "999999";
  }
}

function createDebugButton(targetEl, blocks) {
  if (document.querySelector(".wt-debug-btn")) {
    return;
  }

  const debugBtn = document.createElement("button");
  debugBtn.className = "wt-image-trans-btn wt-debug-btn";
  debugBtn.setAttribute("type", "button");

  const debugActive = isDebugVisible(targetEl);
  debugBtn.textContent = debugActive ? "디버그끄기" : "위치디버깅";
  debugBtn.style.backgroundColor = debugActive ? "#E65100" : "#ff9800";
  debugBtn.style.color = "#fff";
  debugBtn.style.border = "none";
  debugBtn.style.boxShadow = "0 2px 8px rgba(0,0,0,0.3)";

  debugBtn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    ev.preventDefault();
    const isVisible = toggleDebugOverlay(targetEl, blocks);
    debugBtn.textContent = isVisible ? "디버그끄기" : "위치디버깅";
    debugBtn.style.backgroundColor = isVisible ? "#E65100" : "#ff9800";
  });

  document.body.appendChild(debugBtn);
  updateButtonsPosition(targetEl);
}

function showHoverButtons(targetEl) {
  removeHoverButton();

  // 1. OCR 검사 버튼
  const btn = document.createElement("button");
  btn.className = "wt-image-trans-btn";
  btn.setAttribute("type", "button");
  btn.style.boxShadow = "0 2px 8px rgba(0,0,0,0.3)";

  const storedBlocks = getStoredBlocks(targetEl);
  const ocrDone = storedBlocks && storedBlocks.length > 0;
  btn.textContent = ocrDone ? "OCR 검사 완료" : "OCR 검사";

  // 2. 라인파악 버튼
  const gridBtn = document.createElement("button");
  gridBtn.className = "wt-image-trans-btn wt-grid-btn";
  gridBtn.setAttribute("type", "button");
  gridBtn.style.color = "#fff";
  gridBtn.style.border = "none";
  gridBtn.style.boxShadow = "0 2px 8px rgba(0,0,0,0.3)";

  const gridActive = isGridVisible(targetEl);
  gridBtn.textContent = gridActive ? "라인끄기" : "라인파악";
  gridBtn.style.backgroundColor = gridActive ? "#1565C0" : "#2196F3";

  gridBtn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    ev.preventDefault();
    const isVisible = toggleGridOverlay(targetEl);
    gridBtn.textContent = isVisible ? "라인끄기" : "라인파악";
    gridBtn.style.backgroundColor = isVisible ? "#1565C0" : "#2196F3";
  });

  // 3. 바운딩박스파악 버튼 (로컬 결정론적 100% 픽셀 정밀 엔진 연동)
  const bboxBtn = document.createElement("button");
  bboxBtn.className = "wt-image-trans-btn wt-bbox-btn";
  bboxBtn.setAttribute("type", "button");
  bboxBtn.style.color = "#fff";
  bboxBtn.style.border = "none";
  bboxBtn.style.boxShadow = "0 2px 8px rgba(0,0,0,0.3)";

  const bboxActive = isBoundingBoxesVisible(targetEl);
  bboxBtn.textContent = bboxActive ? "박스끄기" : "바운딩박스파악";
  bboxBtn.style.backgroundColor = bboxActive ? "#00838F" : "#00ACC1";

  bboxBtn.addEventListener("click", async (ev) => {
    ev.stopPropagation();
    ev.preventDefault();

    const storedItems = getStoredBoundingBoxes(targetEl);
    if (storedItems && storedItems.length > 0) {
      const isVisible = toggleBoundingBoxesOverlay(targetEl, storedItems);
      bboxBtn.textContent = isVisible ? "박스끄기" : "바운딩박스파악";
      bboxBtn.style.backgroundColor = isVisible ? "#00838F" : "#00ACC1";
      return;
    }

    bboxBtn.classList.add("wt-loading");
    bboxBtn.innerHTML = `<span class="wt-spinner"></span> 탐지 중...`;

    try {
      // 100% 온디바이스 로컬 WASM OCR 실행 (외부 AI API 0% 연결) + 엄격한 노이즈 필터링 적용
      const items = await detectTextWithLocalTesseract(targetEl);

      console.log(`[WT Local WASM OCR] 결정론적 100% 픽셀 바운딩 박스 & 텍스트 파악 완료 (총 ${items.length}개):`, items);

      setStoredBoundingBoxes(targetEl, items);
      toggleBoundingBoxesOverlay(targetEl, items);

      bboxBtn.classList.remove("wt-loading");
      bboxBtn.textContent = "박스끄기";
      bboxBtn.style.backgroundColor = "#00838F";

    } catch (err) {
      console.error("[WebTranslator] 바운딩 박스 추출 실패:", err);
      alert(`바운딩 박스 추출 오류: ${err.message}`);
      bboxBtn.classList.remove("wt-loading");
      bboxBtn.textContent = "바운딩박스파악";
    }
  });

  document.body.appendChild(bboxBtn);
  document.body.appendChild(gridBtn);
  document.body.appendChild(btn);

  activeHoverBtn = btn;
  updateButtonsPosition(targetEl);

  if (ocrDone) {
    createDebugButton(targetEl, storedBlocks);
  }

  let mouseLeaveTimer = null;

  const handleTargetMouseLeave = () => {
    mouseLeaveTimer = setTimeout(() => {
      const isHoveringBtn = btn && btn.matches(":hover");
      const isHoveringGrid = gridBtn && gridBtn.matches(":hover");
      const isHoveringBBox = bboxBtn && bboxBtn.matches(":hover");
      const debugBtn = document.querySelector(".wt-debug-btn");
      const isHoveringDebug = debugBtn && debugBtn.matches(":hover");

      if (!isHoveringBtn && !isHoveringGrid && !isHoveringBBox && !isHoveringDebug && (!btn || !btn.classList.contains("wt-loading"))) {
        removeHoverButton();
      }
    }, 400);
  };

  targetEl.addEventListener("mouseleave", handleTargetMouseLeave, { once: true });

  btn.addEventListener("click", async (e) => {
    e.stopPropagation();
    e.preventDefault();

    if (btn.classList.contains("wt-loading")) return;

    btn.classList.add("wt-loading");
    btn.innerHTML = `<span class="wt-spinner"></span> 검사 중...`;

    const imageUrl = extractImageSource(targetEl);
    if (!imageUrl) {
      alert("이미지 주소를 추출할 수 없습니다.");
      btn.classList.remove("wt-loading");
      btn.textContent = "OCR 검사";
      return;
    }

    try {
      const settings = await chrome.runtime.sendMessage({ action: "getSettings" });

      const response = await chrome.runtime.sendMessage({
        action: "translateImage",
        imageUrl,
        naturalWidth: targetEl.naturalWidth || targetEl.width || targetEl.clientWidth || 800,
        naturalHeight: targetEl.naturalHeight || targetEl.height || targetEl.clientHeight || 600,
        pageUrl: window.location.href,
        mode: settings.translationMode === "openai" ? "openai" : "gemini",
        apiKey: settings.geminiApiKey,
        geminiModel: settings.geminiModel || "gemini-3.6-flash",
        openaiApiKey: settings.openaiApiKey,
        openaiModel: settings.openaiModel || "gpt-4o-mini",
        targetLang: settings.targetLang || "ko",
      });

      if (!response.success) {
        throw new Error(response.error || "이미지 OCR 검사에 실패했습니다.");
      }

      const blocks = response.blocks || [];
      console.log(`[WT Step 2] 범용 고정밀 OCR & 세부 텍스트 마스킹 검출 완료 (총 ${blocks.length}개 요소 발견):`, blocks);

      setStoredBlocks(targetEl, blocks);

      btn.classList.remove("wt-loading");
      btn.textContent = "OCR 검사 완료";

      createDebugButton(targetEl, blocks);

    } catch (err) {
      console.error("[WebTranslator] 이미지 OCR 실패:", err);
      alert(`이미지 OCR 오류: ${err.message}`);
      btn.classList.remove("wt-loading");
      btn.textContent = "OCR 검사";
    }
  });
}

function removeHoverButton() {
  if (activeHoverBtn) {
    activeHoverBtn.remove();
    activeHoverBtn = null;
  }
  document.querySelectorAll(".wt-debug-btn").forEach((b) => b.remove());
  document.querySelectorAll(".wt-grid-btn").forEach((b) => b.remove());
  document.querySelectorAll(".wt-bbox-btn").forEach((b) => b.remove());
}



