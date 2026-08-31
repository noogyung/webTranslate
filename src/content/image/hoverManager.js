/* ────────────────────────────────────────────
 * 이미지 호버 감지 및 하이라이트
 * ──────────────────────────────────────────── */

let hoveredImage = null;
let hintEl = null;

const STYLE_ID = "wt-image-hover-styles";

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .wt-image-hover {
      outline: 2px dashed var(--wt-theme-color, #818cf8) !important;
      outline-offset: -2px;
      cursor: pointer;
    }
    .wt-image-hint {
      position: absolute;
      top: 4px;
      right: 4px;
      width: 28px;
      height: 28px;
      background: rgba(0, 0, 0, 0.6);
      color: #fff;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      pointer-events: none;
      z-index: 2147483646;
      line-height: 1;
      backdrop-filter: blur(4px);
    }
  `;
  document.head.appendChild(style);
}

function showHighlight(img) {
  injectStyles();
  img.classList.add("wt-image-hover");

  // 힌트 아이콘: img의 offsetParent를 기준으로 absolute 배치
  if (hintEl) hideHint();

  const wrapper = img.parentElement;
  if (!wrapper) return;

  const wrapperStyle = window.getComputedStyle(wrapper);
  if (wrapperStyle.position === "static") {
    wrapper.style.position = "relative";
    wrapper.dataset.wtPositionSet = "true";
  }

  hintEl = document.createElement("div");
  hintEl.className = "wt-image-hint";
  hintEl.textContent = "🌐";
  hintEl.title = "Alt+S: 이미지 번역";
  wrapper.appendChild(hintEl);
}

function hideHighlight(img) {
  img.classList.remove("wt-image-hover");
  hideHint();

  const wrapper = img.parentElement;
  if (wrapper && wrapper.dataset.wtPositionSet) {
    wrapper.style.position = "";
    delete wrapper.dataset.wtPositionSet;
  }
}

function hideHint() {
  if (hintEl && hintEl.parentNode) {
    hintEl.parentNode.removeChild(hintEl);
  }
  hintEl = null;
}

function isTranslatableImage(img) {
  if (!img || img.tagName !== "IMG") return false;
  if (img.dataset.wtImageTranslated) return false;
  const w = img.naturalWidth || img.offsetWidth;
  const h = img.naturalHeight || img.offsetHeight;
  return w >= 80 && h >= 80;
}

document.addEventListener("mouseover", (e) => {
  const img = e.target.closest("img");
  if (!img || !isTranslatableImage(img)) return;
  if (hoveredImage === img) return;

  // 이전 호버 정리
  if (hoveredImage) hideHighlight(hoveredImage);

  hoveredImage = img;
  showHighlight(img);
});

document.addEventListener("mouseout", (e) => {
  const img = e.target.closest("img");
  if (!img || img !== hoveredImage) return;

  // relatedTarget이 힌트 아이콘이거나 이미지 내부면 무시
  if (e.relatedTarget && (img.contains(e.relatedTarget) || e.relatedTarget === hintEl)) return;

  hideHighlight(img);
  hoveredImage = null;
});

export function getHoveredImage() {
  return hoveredImage;
}
