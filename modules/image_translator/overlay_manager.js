/**
 * overlay_manager.js — Multi-Layer Canvas Overlay & Independent Toggle Controller
 */

import { renderTranslationOnCanvas, renderDebugOnCanvas, renderGridOnCanvas, renderBoundingBoxesOnCanvas } from "./canvas_renderer.js";

const OVERLAY_MAP = new WeakMap();

/**
 * targetEl에 대한 overlayEntry를 가져오거나 생성합니다.
 */
function getOrCreateOverlayEntry(targetEl) {
  let entry = OVERLAY_MAP.get(targetEl);
  if (!entry) {
    const updatePosition = () => {
      const rect = targetEl.getBoundingClientRect();
      const scrollX = window.scrollX || window.pageXOffset;
      const scrollY = window.scrollY || window.pageYOffset;

      const pos = {
        left: `${rect.left + scrollX}px`,
        top: `${rect.top + scrollY}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      };

      for (const mode of ["grid", "debug", "bbox", "translation"]) {
        const canvas = entry.canvases[mode];
        if (canvas) {
          canvas.style.left = pos.left;
          canvas.style.top = pos.top;
          canvas.style.width = pos.width;
          canvas.style.height = pos.height;
        }
      }
    };

    const resizeObserver = new ResizeObserver(() => updatePosition());
    resizeObserver.observe(targetEl);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, { passive: true });

    entry = {
      targetEl,
      blocks: [],
      boundingBoxes: [],
      canvases: { grid: null, debug: null, bbox: null, translation: null },
      visibility: { grid: false, debug: false, bbox: false, translation: false },
      resizeObserver,
      updatePosition,
    };

    OVERLAY_MAP.set(targetEl, entry);
  }
  return entry;
}

/**
 * 특정 모드의 canvas 생성 또는 반환
 */
function getOrCreateCanvas(entry, mode, zIndex) {
  if (!entry.canvases[mode]) {
    const canvas = document.createElement("canvas");
    canvas.className = `wt-image-canvas-overlay wt-overlay-${mode}`;
    canvas.style.position = "absolute";
    canvas.style.pointerEvents = "none";
    canvas.style.zIndex = String(zIndex);
    canvas.style.boxSizing = "border-box";
    canvas.style.display = "none";

    document.body.appendChild(canvas);
    entry.canvases[mode] = canvas;
    entry.updatePosition();
  }
  return entry.canvases[mode];
}

/**
 * OCR 검사 결과 블록 저장
 */
export function setStoredBlocks(targetEl, blocks) {
  const entry = getOrCreateOverlayEntry(targetEl);
  entry.blocks = blocks;
}

/**
 * 바운딩 박스 추출 결과 저장
 */
export function setStoredBoundingBoxes(targetEl, items) {
  const entry = getOrCreateOverlayEntry(targetEl);
  entry.boundingBoxes = items;
}

export function getStoredBoundingBoxes(targetEl) {
  const entry = OVERLAY_MAP.get(targetEl);
  return entry ? entry.boundingBoxes : [];
}

/**
 * 라인파악(Grid) 오버레이 토글
 */
export function toggleGridOverlay(targetEl) {
  const entry = getOrCreateOverlayEntry(targetEl);
  const canvas = getOrCreateCanvas(entry, "grid", 999990);

  entry.visibility.grid = !entry.visibility.grid;

  if (entry.visibility.grid) {
    const naturalWidth = targetEl.naturalWidth || targetEl.width || targetEl.clientWidth || 800;
    const naturalHeight = targetEl.naturalHeight || targetEl.height || targetEl.clientHeight || 600;
    renderGridOnCanvas(canvas, naturalWidth, naturalHeight);
    canvas.style.display = "block";
    entry.updatePosition();
  } else {
    canvas.style.display = "none";
  }

  return entry.visibility.grid;
}

/**
 * 위치디버깅(Debug) 오버레이 토글
 */
export function toggleDebugOverlay(targetEl, blocks = null) {
  const entry = getOrCreateOverlayEntry(targetEl);
  if (blocks && blocks.length > 0) {
    entry.blocks = blocks;
  }

  const canvas = getOrCreateCanvas(entry, "debug", 999991);

  entry.visibility.debug = !entry.visibility.debug;

  if (entry.visibility.debug) {
    const naturalWidth = targetEl.naturalWidth || targetEl.width || targetEl.clientWidth || 800;
    const naturalHeight = targetEl.naturalHeight || targetEl.height || targetEl.clientHeight || 600;
    renderDebugOnCanvas(canvas, entry.blocks, naturalWidth, naturalHeight);
    canvas.style.display = "block";
    entry.updatePosition();
  } else {
    canvas.style.display = "none";
  }

  return entry.visibility.debug;
}

/**
 * 바운딩박스파악(BBox) 오버레이 토글
 */
export function toggleBoundingBoxesOverlay(targetEl, items = null) {
  const entry = getOrCreateOverlayEntry(targetEl);
  if (items && items.length > 0) {
    entry.boundingBoxes = items;
  }

  const canvas = getOrCreateCanvas(entry, "bbox", 999993);

  entry.visibility.bbox = !entry.visibility.bbox;

  if (entry.visibility.bbox) {
    const naturalWidth = targetEl.naturalWidth || targetEl.width || targetEl.clientWidth || 800;
    const naturalHeight = targetEl.naturalHeight || targetEl.height || targetEl.clientHeight || 600;
    renderBoundingBoxesOnCanvas(canvas, entry.boundingBoxes, naturalWidth, naturalHeight);
    canvas.style.display = "block";
    entry.updatePosition();
  } else {
    canvas.style.display = "none";
  }

  return entry.visibility.bbox;
}

export function isBoundingBoxesVisible(targetEl) {
  const entry = OVERLAY_MAP.get(targetEl);
  return entry ? Boolean(entry.visibility.bbox) : false;
}

/**
 * 번역(Translation) 오버레이 생성 및 표시
 */
export function createOrUpdateTranslationOverlay(targetEl, blocks) {
  const entry = getOrCreateOverlayEntry(targetEl);
  entry.blocks = blocks;

  const canvas = getOrCreateCanvas(entry, "translation", 999992);

  entry.visibility.translation = true;
  const naturalWidth = targetEl.naturalWidth || targetEl.width || targetEl.clientWidth || 800;
  const naturalHeight = targetEl.naturalHeight || targetEl.height || targetEl.clientHeight || 600;
  renderTranslationOnCanvas(canvas, blocks, naturalWidth, naturalHeight);
  canvas.style.display = "block";
  entry.updatePosition();

  return true;
}

/**
 * 번역(Translation) 오버레이 토글
 */
export function toggleTranslationOverlay(targetEl, blocks = null) {
  const entry = getOrCreateOverlayEntry(targetEl);
  if (blocks && blocks.length > 0) {
    entry.blocks = blocks;
  }

  const canvas = getOrCreateCanvas(entry, "translation", 999992);

  entry.visibility.translation = !entry.visibility.translation;

  if (entry.visibility.translation) {
    const naturalWidth = targetEl.naturalWidth || targetEl.width || targetEl.clientWidth || 800;
    const naturalHeight = targetEl.naturalHeight || targetEl.height || targetEl.clientHeight || 600;
    renderTranslationOnCanvas(canvas, entry.blocks, naturalWidth, naturalHeight);
    canvas.style.display = "block";
    entry.updatePosition();
  } else {
    canvas.style.display = "none";
  }

  return entry.visibility.translation;
}

/**
 * 상태 확인 헬퍼들
 */
export function isGridVisible(targetEl) {
  const entry = OVERLAY_MAP.get(targetEl);
  return entry ? Boolean(entry.visibility.grid) : false;
}

export function isDebugVisible(targetEl) {
  const entry = OVERLAY_MAP.get(targetEl);
  return entry ? Boolean(entry.visibility.debug) : false;
}

export function isTranslationVisible(targetEl) {
  const entry = OVERLAY_MAP.get(targetEl);
  return entry ? Boolean(entry.visibility.translation) : false;
}

export function hasTranslationOverlay(targetEl) {
  const entry = OVERLAY_MAP.get(targetEl);
  return entry ? Boolean(entry.canvases.translation) : false;
}

export function getStoredBlocks(targetEl) {
  const entry = OVERLAY_MAP.get(targetEl);
  return entry ? entry.blocks : [];
}

/** 하위 호환성 유지 래퍼 */
export function createOrUpdateOverlay(targetEl, blocks, isDebug = false) {
  if (isDebug) {
    return toggleDebugOverlay(targetEl, blocks);
  } else {
    return createOrUpdateTranslationOverlay(targetEl, blocks);
  }
}

export function createOrUpdateGridOverlay(targetEl) {
  return toggleGridOverlay(targetEl);
}

export function toggleOverlayVisibility(targetEl) {
  const entry = OVERLAY_MAP.get(targetEl);
  if (!entry) return false;
  if (entry.visibility.translation) return toggleTranslationOverlay(targetEl);
  if (entry.visibility.debug) return toggleDebugOverlay(targetEl);
  if (entry.visibility.grid) return toggleGridOverlay(targetEl);
  return false;
}

export function hasOverlay(targetEl) {
  const entry = OVERLAY_MAP.get(targetEl);
  return entry ? Boolean(entry.canvases.grid || entry.canvases.debug || entry.canvases.translation) : false;
}

export function isOverlayVisible(targetEl) {
  const entry = OVERLAY_MAP.get(targetEl);
  return entry ? Boolean(entry.visibility.grid || entry.visibility.debug || entry.visibility.translation) : false;
}

export function getOverlayMode(targetEl) {
  const entry = OVERLAY_MAP.get(targetEl);
  if (!entry) return null;
  if (entry.visibility.grid) return 'grid';
  if (entry.visibility.debug) return 'debug';
  if (entry.visibility.translation) return 'translation';
  return null;
}


