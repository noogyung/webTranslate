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

export function getAutoTextColor(hex) {
  if (!hex || typeof hex !== "string") return "#818cf8";
  let cleanHex = hex.replace("#", "");
  if (cleanHex.length === 3) cleanHex = cleanHex.split("").map((c) => c + c).join("");
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return "#818cf8";

  const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
  if (yiq > 200) return "#1e293b"; 
  if (yiq < 60) return "#f8fafc";  
  return hex; 
}

export function updateStylePreview() {
  const transColorInput = document.getElementById("transColor");
  const transFontSizeSelect = document.getElementById("transFontSize");
  const transItalicInput = document.getElementById("transItalic");
  const transBgAlphaInput = document.getElementById("transBgAlpha");

  const color = transColorInput ? transColorInput.value : "#818cf8";
  const textColor = getAutoTextColor(color);
  const size = transFontSizeSelect ? transFontSizeSelect.value : "100%";
  const fontStyle = transItalicInput && transItalicInput.checked ? "italic" : "normal";
  const bgAlpha = transBgAlphaInput ? parseFloat(transBgAlphaInput.value) : 0.12;

  const inlineEl = document.getElementById("previewInline");
  const blockEl = document.getElementById("previewBlock");

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
