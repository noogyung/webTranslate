/* ── UI 헬퍼 및 DOM 조작 ──────────────────────────────────── */

let statusTimer = null;

export function showSaveStatus(text, type) {
  const saveStatus = document.getElementById("saveStatus");
  if (!saveStatus) return;
  if (statusTimer) clearTimeout(statusTimer);

  saveStatus.textContent = text;
  saveStatus.className = `save-status show ${type}`;

  statusTimer = setTimeout(() => {
    saveStatus.classList.remove("show");
  }, 3000);
}

export function updateUI(mode) {
  const isGemini = mode === "gemini";
  const isOpenAI = mode === "openai";
  const isClaude = mode === "claude";
  const isOllama = mode === "ollama";
  const isLibre = mode === "libre";

  const apiKeySection = document.getElementById("apiKeySection");
  const apiModelSection = document.getElementById("apiModelSection");
  const openaiSection = document.getElementById("openaiSection");
  const claudeSection = document.getElementById("claudeSection");
  const ollamaSection = document.getElementById("ollamaSection");
  const libreUrlSection = document.getElementById("libreUrlSection");

  if (apiKeySection) apiKeySection.style.display = isGemini ? "block" : "none";
  if (apiModelSection) apiModelSection.style.display = isGemini ? "block" : "none";
  if (openaiSection) openaiSection.style.display = isOpenAI ? "block" : "none";
  if (claudeSection) claudeSection.style.display = isClaude ? "block" : "none";
  if (ollamaSection) ollamaSection.style.display = isOllama ? "block" : "none";
  if (libreUrlSection) libreUrlSection.style.display = isLibre ? "block" : "none";
}

export function hexToRgba(hex, alpha) {
  if (!hex || typeof hex !== "string") return `rgba(129, 140, 248, ${alpha})`;
  let cleanHex = hex.replace("#", "");
  if (cleanHex.length === 3) {
    cleanHex = cleanHex.split("").map((c) => c + c).join("");
  }
  const num = parseInt(cleanHex, 16);
  if (isNaN(num)) return `rgba(129, 140, 248, ${alpha})`;
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function getAutoTextColor(hex, bgAlpha = 0) {
  if (!hex || typeof hex !== "string") hex = "#818cf8";
  let cleanHex = hex.replace("#", "");
  if (cleanHex.length === 3) cleanHex = cleanHex.split("").map((c) => c + c).join("");
  let r = parseInt(cleanHex.substring(0, 2), 16);
  let g = parseInt(cleanHex.substring(2, 4), 16);
  let b = parseInt(cleanHex.substring(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) { r = 129; g = 140; b = 248; }

  const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
  
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
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
  const origL = Math.round(l * 100);

  const targetL = yiq > 128 ? Math.max(15, origL - 60) : Math.min(95, origL + 60);
  const intensity = Math.min(1, bgAlpha * 1.5);
  let finalL = origL + (targetL - origL) * intensity;
  
  finalL = Math.round(Math.max(10, Math.min(95, finalL)));
  return `hsl(${h}, ${s}%, ${finalL}%)`;
}

export function updateStylePreview() {
  const transColorInput = document.getElementById("transColor");
  const transFontSizeSelect = document.getElementById("transFontSize");
  const transItalicInput = document.getElementById("transItalic");
  const transBgAlphaInput = document.getElementById("transBgAlpha");

  const color = transColorInput ? transColorInput.value : "#818cf8";
  const bgAlpha = transBgAlphaInput ? parseFloat(transBgAlphaInput.value) : 0.12;
  const textColor = getAutoTextColor(color, bgAlpha);
  const size = transFontSizeSelect ? transFontSizeSelect.value : "100%";
  const fontStyle = transItalicInput && transItalicInput.checked ? "italic" : "normal";

  const inlineEl = document.getElementById("previewInline");
  const blockEl = document.getElementById("previewBlock");

  const inlineShadowInput = document.getElementById("inlineShadow");
  const inlineHighlightInput = document.getElementById("inlineHighlight");
  const inlineAdaptiveColorInput = document.getElementById("inlineAdaptiveColor");
  const inlineInheritColorInput = document.getElementById("inlineInheritColor");

  if (inlineEl) {
    inlineEl.style.color = textColor;
    inlineEl.style.fontSize = size;
    inlineEl.style.fontStyle = fontStyle;

    inlineEl.style.textShadow = "none";
    inlineEl.style.backgroundColor = "transparent";
    inlineEl.style.padding = "0";
    inlineEl.style.borderRadius = "0";
    inlineEl.style.mixBlendMode = "normal";

    if (inlineAdaptiveColorInput && inlineAdaptiveColorInput.checked) {
      // 미리보기 상자는 어두운 배경(rgba(15,23,42))이므로 환경 적응 시 흰색 글자가 됨
      inlineEl.style.color = "#ffffff";
    } else if (inlineInheritColorInput && inlineInheritColorInput.checked) {
      inlineEl.style.color = "inherit";
    }

    if (inlineHighlightInput && inlineHighlightInput.checked) {
      inlineEl.style.backgroundColor = hexToRgba(color, 0.12);
      inlineEl.style.padding = "0 4px";
      inlineEl.style.borderRadius = "4px";
    }

    if (inlineShadowInput && inlineShadowInput.checked) {
      let glowColor = "rgba(255,255,255,0.9)";
      
      // 원문 글자 색상 옵션이 켜져 있으면, 상속된 글자 색상(#cbd5e1 - 밝은 회색)을 기준으로 그림자 계산
      if (inlineInheritColorInput && inlineInheritColorInput.checked) {
         glowColor = "rgba(0,0,0,0.85)";
      } else {
         const match = textColor.match(/hsl\(\d+,\s*\d+%,\s*(\d+)%\)/);
         if (match && parseInt(match[1]) > 50) glowColor = "rgba(0,0,0,0.85)";
      }
      
      inlineEl.style.textShadow = `0 1px 2px ${glowColor}, 0 0 3px ${glowColor}`;
    }
  }
  if (blockEl) {
    blockEl.style.color = textColor;
    blockEl.style.background = hexToRgba(color, bgAlpha);
    blockEl.style.borderLeftColor = color;
    blockEl.style.fontSize = size;
    blockEl.style.fontStyle = fontStyle;
  }
}
