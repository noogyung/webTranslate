/**
 * image_loader.js — Universal DOM Image Source Extractor
 */

export function extractImageSource(element) {
  if (!element) return null;

  // 1. <img> 요소
  if (element.tagName === "IMG") {
    return element.currentSrc || element.src || null;
  }

  // 2. <canvas> 요소
  if (element.tagName === "CANVAS") {
    try {
      return element.toDataURL("image/png");
    } catch {
      return null;
    }
  }

  // 3. <svg> 요소
  if (element.tagName === "SVG" || element.closest("svg")) {
    const svgEl = element.tagName === "SVG" ? element : element.closest("svg");
    const xml = new XMLSerializer().serializeToString(svgEl);
    return "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(xml)));
  }

  // 4. CSS background-image
  const style = window.getComputedStyle(element);
  const bg = style.backgroundImage;
  if (bg && bg !== "none") {
    const match = bg.match(/url\((['"]?)(.*?)\1\)/);
    if (match && match[2]) {
      return match[2];
    }
  }

  return null;
}

export function isEligibleImageElement(el) {
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;

  const rect = el.getBoundingClientRect();
  if (rect.width < 50 || rect.height < 50) {
    return false; // 50px 미만 아이콘/버튼 예외 제외
  }

  const tag = el.tagName.toUpperCase();
  if (tag === "IMG" || tag === "CANVAS" || tag === "SVG") {
    return true;
  }

  const style = window.getComputedStyle(el);
  if (style.backgroundImage && style.backgroundImage !== "none") {
    return true;
  }

  return false;
}
