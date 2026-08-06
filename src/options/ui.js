  function updateUI(mode) {
    var isGemini = mode === "gemini";
    var isOpenAI = mode === "openai";
    var isClaude = mode === "claude";
    var isOllama = mode === "ollama";
    var isLibre = mode === "libre";

    if (apiKeySection) apiKeySection.style.display = isGemini ? "block" : "none";
    if (apiModelSection) apiModelSection.style.display = isGemini ? "block" : "none";
    if (openaiSection) openaiSection.style.display = isOpenAI ? "block" : "none";
    if (claudeSection) claudeSection.style.display = isClaude ? "block" : "none";
    if (ollamaSection) ollamaSection.style.display = isOllama ? "block" : "none";
    if (libreUrlSection) libreUrlSection.style.display = isLibre ? "block" : "none";
  }

\n  /* ── 번역 스타일 실시간 미리보기 ──────────────────────────────────── */

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
    if (yiq > 200) return "#1e293b"; // 아주 밝은 색(흰색 등)일 경우 어두운 글자
    if (yiq < 60) return "#f8fafc";  // 아주 어두운 색(검은색 등)일 경우 밝은 글자
    return hex; // 중간 밝기는 테마색과 동일하게 (예: #818cf8)
  }

  function updateStylePreview() {
    var color = transColorInput ? transColorInput.value : "#818cf8";
    var textColor = getAutoTextColor(color);
    var size = transFontSizeSelect ? transFontSizeSelect.value : "100%";
    var fontStyle = transItalicInput && transItalicInput.checked ? "italic" : "normal";
    var bgAlpha = transBgAlphaInput ? parseFloat(transBgAlphaInput.value) : 0.12;

    var inlineEl = document.getElementById("previewInline");
    var blockEl = document.getElementById("previewBlock");

    if (inlineEl) {
      inlineEl.style.color = textColor;
      inlineEl.style.fontSize = size;
      inlineEl.style.fontStyle = fontStyle;
    }
    if (blockEl) {
      blockEl.style.color = textColor;
      blockEl.style.background = hexToRgba(color, bgAlpha);
      blockEl.style.borderLeftColor = color;
      blockEl.style.fontSize = size;
      blockEl.style.fontStyle = fontStyle;
    }
  }

\n  /* ── 저장 상태 메시지 ───────────────────────────────────────── */

  var statusTimer = null;

  function showSaveStatus(text, type) {
    if (statusTimer) clearTimeout(statusTimer);

    saveStatus.textContent = text;
    saveStatus.className = `save-status show ${type}`;

    statusTimer = setTimeout(() => {
      saveStatus.classList.remove("show");
    }, 3000);
  }
})();
