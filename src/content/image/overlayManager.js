/* ────────────────────────────────────────────
 * 이미지 오버레이 관리 + 토글
 * ──────────────────────────────────────────── */

import { renderTranslatedOverlay } from "./canvasRenderer.js";

const OVERLAY_CLASS = "wt-image-overlay-wrap";

/**
 * 일반 모드: Canvas 오버레이를 원본 이미지 위에 배치.
 * @param {HTMLImageElement} img - 원본 이미지
 * @param {Array} blocks - normalizeBox 적용된 번역 블록
 */
export function createCanvasOverlay(img, blocks) {
  const naturalWidth = img.naturalWidth;
  const naturalHeight = img.naturalHeight;

  // 래퍼 생성
  const wrapper = ensureWrapper(img);

  // img의 object-fit 읽기 (ensureWrapper 이후 img 스타일이 바뀌어 있을 수 있으므로 직접 확인)
  const imgCs = window.getComputedStyle(img);
  const objFit = imgCs.objectFit || "fill";
  const objPos = imgCs.objectPosition || "50% 50%";

  // Canvas 생성
  const canvas = document.createElement("canvas");
  canvas.className = "wt-image-overlay-canvas";
  canvas.style.cssText = `
    position: absolute; top: 0; left: 0;
    width: 100%; height: 100%;
    pointer-events: none;
    z-index: 1;
    object-fit: ${objFit};
    object-position: ${objPos};
  `;

  renderTranslatedOverlay(canvas, blocks, naturalWidth, naturalHeight);
  wrapper.appendChild(canvas);

  // 이미지 마킹
  img.dataset.wtImageTranslated = "standard";
  img.dataset.wtShowingTranslated = "true";

  // 토글 버튼 생성
  createToggleButtons(wrapper, img);

  // 리사이즈 대응
  setupResizeObserver(wrapper, img, canvas, blocks);
}

/**
 * 고급 모드: 번역된 이미지를 원본 위에 <img>로 배치.
 * @param {HTMLImageElement} img - 원본 이미지
 * @param {string} translatedDataUrl - 번역된 이미지 dataURL
 */
export function createImageOverlay(img, translatedDataUrl) {
  const wrapper = ensureWrapper(img);

  const overlay = document.createElement("img");
  overlay.className = "wt-image-overlay-img";
  overlay.src = translatedDataUrl;
  overlay.style.cssText = `
    position: absolute; top: 0; left: 0;
    width: 100%; height: 100%;
    object-fit: ${window.getComputedStyle(img).objectFit || "contain"};
    z-index: 1;
    pointer-events: none;
  `;

  wrapper.appendChild(overlay);

  img.dataset.wtImageTranslated = "premium";
  img.dataset.wtShowingTranslated = "true";

  createToggleButtons(wrapper, img);
}

/**
 * Canvas 오버레이 → AI 합성 이미지로 업그레이드 (낙관적 업데이트 Step E).
 * @param {HTMLImageElement} img - 원본 이미지
 * @param {string} translatedDataUrl - 번역된 이미지 dataURL
 */
export function upgradeToImageOverlay(img, translatedDataUrl) {
  const wrapper = img.closest(`.${OVERLAY_CLASS}`);

  if (!wrapper) {
    // 래퍼가 없으면 새로 생성
    createImageOverlay(img, translatedDataUrl);
    return;
  }

  // 기존 Canvas 오버레이 제거
  wrapper.querySelectorAll(".wt-image-overlay-canvas").forEach(el => el.remove());

  // AI 이미지 오버레이 삽입
  const imgCs = window.getComputedStyle(img);
  const overlay = document.createElement("img");
  overlay.className = "wt-image-overlay-img";
  overlay.src = translatedDataUrl;
  overlay.style.cssText = `
    position: absolute; top: 0; left: 0;
    width: 100%; height: 100%;
    object-fit: ${imgCs.objectFit || "fill"};
    object-position: ${imgCs.objectPosition || "50% 50%"};
    z-index: 1;
    pointer-events: none;
  `;

  wrapper.appendChild(overlay);

  img.dataset.wtImageTranslated = "premium";
  img.dataset.wtShowingTranslated = "true";

  // 토글 버튼 재생성 (premium 상태로)
  createToggleButtons(wrapper, img);
}

/**
 * 원본/번역 토글.
 */
export function toggleOverlay(img) {
  const wrapper = img.closest(`.${OVERLAY_CLASS}`);
  if (!wrapper) return;

  const isShowing = img.dataset.wtShowingTranslated === "true";
  const overlay = wrapper.querySelector(".wt-image-overlay-canvas, .wt-image-overlay-img");

  if (overlay) {
    overlay.style.display = isShowing ? "none" : "block";
  }

  img.dataset.wtShowingTranslated = isShowing ? "false" : "true";

  // 버튼 텍스트 업데이트
  const btnOriginal = wrapper.querySelector(".wt-toggle-original");
  const btnTranslated = wrapper.querySelector(".wt-toggle-translated");
  if (btnOriginal && btnTranslated) {
    btnOriginal.classList.toggle("wt-toggle-active", isShowing);
    btnTranslated.classList.toggle("wt-toggle-active", !isShowing);
  }
}

/* ──────── 내부 유틸 ──────── */

function ensureWrapper(img) {
  if (img.parentElement?.classList.contains(OVERLAY_CLASS)) {
    return img.parentElement;
  }

  // img의 현재 computed 스타일 캡처
  const cs = window.getComputedStyle(img);
  const imgDisplay = cs.display === "inline" ? "inline-block" : cs.display;

  const wrapper = document.createElement("div");
  wrapper.className = OVERLAY_CLASS;

  // wrapper는 img가 차지하던 크기와 동일하게
  wrapper.style.cssText = `
    position: relative;
    display: ${imgDisplay};
    line-height: 0;
    width: ${cs.width !== "auto" ? cs.width : ""};
    height: ${cs.height !== "auto" ? cs.height : ""};
    max-width: ${cs.maxWidth !== "none" ? cs.maxWidth : ""};
    max-height: ${cs.maxHeight !== "none" ? cs.maxHeight : ""};
    flex-shrink: ${cs.flexShrink};
    flex-grow: ${cs.flexGrow};
  `;

  img.parentNode.insertBefore(wrapper, img);
  wrapper.appendChild(img);

  // img는 wrapper에 꽉 채움 (Canvas와 1:1 대응)
  img.style.display = "block";
  img.style.width = "100%";
  img.style.height = "100%";

  injectOverlayStyles();
  return wrapper;
}

function createToggleButtons(wrapper, img) {
  // 기존 버튼 제거
  wrapper.querySelectorAll(".wt-toggle-group").forEach(el => el.remove());

  const group = document.createElement("div");
  group.className = "wt-toggle-group";

  const btnOriginal = document.createElement("button");
  btnOriginal.className = "wt-toggle-btn wt-toggle-original";
  btnOriginal.textContent = "🔄 원본";
  btnOriginal.addEventListener("click", (e) => {
    e.stopPropagation();
    if (img.dataset.wtShowingTranslated === "true") toggleOverlay(img);
  });

  const btnTranslated = document.createElement("button");
  btnTranslated.className = "wt-toggle-btn wt-toggle-translated wt-toggle-active";
  btnTranslated.textContent = "▶ 번역";
  btnTranslated.addEventListener("click", (e) => {
    e.stopPropagation();
    if (img.dataset.wtShowingTranslated === "false") toggleOverlay(img);
  });

  group.appendChild(btnOriginal);
  group.appendChild(btnTranslated);
  wrapper.appendChild(group);
}

function setupResizeObserver(wrapper, img, canvas, blocks) {
  const observer = new ResizeObserver(() => {
    // Canvas는 CSS로 100% 스트레칭되므로 내부 해상도는 변경 불필요
    // 위치 보정만 필요한 경우 여기에 추가
  });
  observer.observe(img);
}

const OVERLAY_STYLE_ID = "wt-image-overlay-styles";

function injectOverlayStyles() {
  if (document.getElementById(OVERLAY_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = OVERLAY_STYLE_ID;
  style.textContent = `
    .wt-toggle-group {
      position: absolute;
      top: 4px;
      right: 4px;
      z-index: 2147483646;
      display: flex;
      gap: 2px;
      opacity: 0;
      transition: opacity 0.2s;
    }
    .${OVERLAY_CLASS}:hover .wt-toggle-group {
      opacity: 1;
    }
    .wt-toggle-btn {
      padding: 4px 10px;
      font-size: 11px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      background: rgba(0, 0, 0, 0.55);
      color: #ccc;
      backdrop-filter: blur(4px);
      pointer-events: auto;
      white-space: nowrap;
    }
    .wt-toggle-btn:hover {
      background: rgba(0, 0, 0, 0.75);
      color: #fff;
    }
    .wt-toggle-btn.wt-toggle-active {
      background: rgba(137, 180, 250, 0.8);
      color: #1e1e2e;
    }
  `;
  document.head.appendChild(style);
}
