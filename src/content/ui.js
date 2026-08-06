import { state } from "./state.js";

/* ────────────────────────────────────────────
   * 사용자 번역 테마 스타일 동적 적용 유틸리티
   * ──────────────────────────────────────────── */

  export function hexToRgba(hex, alpha) {
    if (!hex || typeof hex !== "string") return `rgba(129, 140, 248, ${alpha})`;
    var cleanHex = hex.replace("#", "");
    if (cleanHex.length === 3) {
      cleanHex = cleanHex.split("").map((c) => c + c).join("");
    }
    var num = parseInt(cleanHex, 16);
    if (isNaN(num)) return `rgba(129, 140, 248, ${alpha})`;
    var r = (num >> 16) & 255;
    var g = (num >> 8) & 255;
    var b = num & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  export function getAutoTextColor(hex, bgAlpha = 0) {
    if (!hex || typeof hex !== "string") hex = "#818cf8";
    var cleanHex = hex.replace("#", "");
    if (cleanHex.length === 3) cleanHex = cleanHex.split("").map((c) => c + c).join("");
    var r = parseInt(cleanHex.substring(0, 2), 16);
    var g = parseInt(cleanHex.substring(2, 4), 16);
    var b = parseInt(cleanHex.substring(4, 6), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) { r = 129; g = 140; b = 248; }

    var yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h, s, l = (max + min) / 2;
    if (max === min) {
      h = s = 0;
    } else {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }
    h = Math.round(h * 360);
    s = Math.round(s * 100);
    var origL = Math.round(l * 100);

    // 배경색의 밝기에 따라 목표 명도(targetL) 설정
    var targetL = yiq > 128 ? Math.max(15, origL - 60) : Math.min(95, origL + 60);
    
    // bgAlpha(0~1)에 따라 원래 명도에서 목표 명도로 보간
    var intensity = Math.min(1, bgAlpha * 1.5);
    var finalL = origL + (targetL - origL) * intensity;
    
    finalL = Math.round(Math.max(10, Math.min(95, finalL)));
    return `hsl(${h}, ${s}%, ${finalL}%)`;
  }

  export function updateCustomStyles(settings) {
    if (!settings) return;
    var root = document.documentElement;
    var themeColor = settings.transColor || "#818cf8";
    var bgAlpha = settings.transBgAlpha !== undefined ? settings.transBgAlpha : 0.12;
    var textColor = getAutoTextColor(themeColor, bgAlpha);

    root.style.setProperty("--wt-theme-color", themeColor);
    root.style.setProperty("--wt-text-color", textColor);
    root.style.setProperty("--wt-trans-bg", hexToRgba(themeColor, bgAlpha));
    root.style.setProperty("--wt-trans-border", hexToRgba(themeColor, 0.45));

    var glowColor = "rgba(255,255,255,0.9)";
    var match = textColor.match(/hsl\(\d+,\s*\d+%,\s*(\d+)%\)/);
    if (match) {
      if (parseInt(match[1]) > 50) glowColor = "rgba(0,0,0,0.85)";
    }
    root.style.setProperty("--wt-inline-glow-color", glowColor);

    if (settings.transFontSize) {
      root.style.setProperty("--wt-trans-font-size", settings.transFontSize);
    }
    if (settings.transItalic !== undefined) {
      root.style.setProperty("--wt-trans-font-style", settings.transItalic ? "italic" : "normal");
    }

    if (settings.inlineShadow) root.setAttribute("data-wt-inline-shadow", "true");
    else root.removeAttribute("data-wt-inline-shadow");

    if (settings.inlineHighlight) root.setAttribute("data-wt-inline-highlight", "true");
    else root.removeAttribute("data-wt-inline-highlight");

    if (settings.inlineAdaptiveColor) root.setAttribute("data-wt-inline-adaptive", "true");
    else root.removeAttribute("data-wt-inline-adaptive");

    if (settings.inlineInheritColor) root.setAttribute("data-wt-inline-inherit", "true");
    else root.removeAttribute("data-wt-inline-inherit");
  }

  /* ────────────────────────────────────────────
   * overflow:hidden 해제 / 복원 (Fix E)
   * ──────────────────────────────────────────── */

  export function unlockOverflowAncestors(element) {
    var el = element.parentElement;
    var depth = 0;
    while (el && el !== document.body && depth < 6) {
      var style = window.getComputedStyle(el);
      var hasClip =
        style.overflow === "hidden" || style.overflowY === "hidden" ||
        style.overflow === "clip"   || style.overflowY === "clip";
      var hasMaxH = style.maxHeight && style.maxHeight !== "none" && style.maxHeight !== "0px";
      if (hasClip && hasMaxH && !el.hasAttribute("data-wt-overflow-original")) {
        el.setAttribute("data-wt-overflow-original",
          `${el.style.overflow}|${el.style.overflowY}|${el.style.maxHeight}`);
        el.style.overflowY = "visible";
        el.style.maxHeight = "none";
      }
      el = el.parentElement;
      depth++;
    }
  }

  /* ────────────────────────────────────────────
   * 상태 표시기
   * ──────────────────────────────────────────── */

  export function createStatusElement() {
    if (state.statusEl) return state.statusEl;
    state.statusEl = document.createElement("div");
    state.statusEl.className = "wt-status-indicator";
    document.body.appendChild(state.statusEl);
    return state.statusEl;
  }

  export function showStatus(text, type = "loading", autoHideMs = 0) {
    if (state.hideTimer) {
      clearTimeout(state.hideTimer);
      state.hideTimer = null;
    }

    var el = createStatusElement();
    el.classList.remove("wt-hiding");
    el.innerHTML = "";

    if (type === "loading") {
      var spinner = document.createElement("div");
      spinner.className = "wt-spinner";
      el.appendChild(spinner);
    } else if (type === "done") {
      var icon = document.createElement("span");
      icon.className = "wt-icon-done";
      icon.innerHTML =
        '<svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>';
      el.appendChild(icon);
    } else if (type === "error") {
      var icon = document.createElement("span");
      icon.className = "wt-icon-error";
      icon.innerHTML =
        '<svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>';
      el.appendChild(icon);
    }

    var span = document.createElement("span");
    span.textContent = text;
    el.appendChild(span);

    if (type === "loading") {
      var bar = document.createElement("div");
      bar.className = "wt-progress-bar";
      bar.style.width = "0%";
      el.appendChild(bar);
    }

    if (autoHideMs > 0) {
      state.hideTimer = setTimeout(() => hideStatus(), autoHideMs);
    }
  }

  export function updateStatus(text, progress = 0) {
    if (!state.statusEl) return;
    var span = state.statusEl.querySelector("span:not([class])");
    if (span) span.textContent = text;
    var bar = state.statusEl.querySelector(".wt-progress-bar");
    if (bar) bar.style.width = `${Math.round(progress * 100)}%`;
  }

  export function hideStatus() {
    if (!state.statusEl) return;
    state.statusEl.classList.add("wt-hiding");
    setTimeout(() => {
      if (state.statusEl?.parentNode) {
        state.statusEl.parentNode.removeChild(state.statusEl);
        state.statusEl = null;
      }
    }, 300);
  }

