  /* ────────────────────────────────────────────
   * 사용자 번역 테마 스타일 동적 적용 유틸리티
   * ──────────────────────────────────────────── */

  function hexToRgba(hex, alpha) {
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
  function getAutoTextColor(hex) {
    if (!hex || typeof hex !== "string") return "#818cf8";
    var cleanHex = hex.replace("#", "");
    if (cleanHex.length === 3) cleanHex = cleanHex.split("").map((c) => c + c).join("");
    var r = parseInt(cleanHex.substring(0, 2), 16);
    var g = parseInt(cleanHex.substring(2, 4), 16);
    var b = parseInt(cleanHex.substring(4, 6), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return "#818cf8";

    var yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    if (yiq > 200) return "#1e293b"; // 아주 밝은 색일 경우 어두운 글자
    if (yiq < 60) return "#f8fafc";  // 아주 어두운 색일 경우 밝은 글자
    return hex; // 중간 밝기는 테마색 유지
  }

  function updateCustomStyles(settings) {
    if (!settings) return;
    var root = document.documentElement;
    var themeColor = settings.transColor || "#818cf8";
    var textColor = getAutoTextColor(themeColor);
    var bgAlpha = settings.transBgAlpha !== undefined ? settings.transBgAlpha : 0.12;

    root.style.setProperty("--wt-theme-color", themeColor);
    root.style.setProperty("--wt-text-color", textColor);
    root.style.setProperty("--wt-trans-bg", hexToRgba(themeColor, bgAlpha));
    root.style.setProperty("--wt-trans-border", hexToRgba(themeColor, 0.45));

    if (settings.transFontSize) {
      root.style.setProperty("--wt-trans-font-size", settings.transFontSize);
    }
    if (settings.transItalic !== undefined) {
      root.style.setProperty("--wt-trans-font-style", settings.transItalic ? "italic" : "normal");
    }
  }

\n  /* ────────────────────────────────────────────
   * overflow:hidden 해제 / 복원 (Fix E)
   * ──────────────────────────────────────────── */

  function unlockOverflowAncestors(element) {
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

\n  /* ────────────────────────────────────────────
   * 상태 표시기
   * ──────────────────────────────────────────── */

  function createStatusElement() {
    if (statusEl) return statusEl;
    statusEl = document.createElement("div");
    statusEl.className = "wt-status-indicator";
    document.body.appendChild(statusEl);
    return statusEl;
  }

  function showStatus(text, type = "loading", autoHideMs = 0) {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
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
      hideTimer = setTimeout(() => hideStatus(), autoHideMs);
    }
  }

  function updateStatus(text, progress = 0) {
    if (!statusEl) return;
    var span = statusEl.querySelector("span:not([class])");
    if (span) span.textContent = text;
    var bar = statusEl.querySelector(".wt-progress-bar");
    if (bar) bar.style.width = `${Math.round(progress * 100)}%`;
  }

  function hideStatus() {
    if (!statusEl) return;
    statusEl.classList.add("wt-hiding");
    setTimeout(() => {
      if (statusEl?.parentNode) {
        statusEl.parentNode.removeChild(statusEl);
        statusEl = null;
      }
    }, 300);
  }

