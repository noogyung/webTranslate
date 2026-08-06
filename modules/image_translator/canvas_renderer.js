/**
 * canvas_renderer.js — Advanced Canvas Overlay & Text Renderer (v3.0 Refined)
 */

function getBoxCoords(box) {
  if (!box || box.length !== 4) return null;
  const [ymin, xmin, ymax, xmax] = box;

  return {
    x: xmin,
    y: ymin,
    w: xmax - xmin,
    h: ymax - ymin,
  };
}

export function renderDebugOnCanvas(canvas, blocks, naturalWidth, naturalHeight) {
  canvas.width = naturalWidth;
  canvas.height = naturalHeight;

  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, naturalWidth, naturalHeight);

  blocks.forEach((block, index) => {
    const container = getBoxCoords(block.containerBox);
    if (container) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
      ctx.fillRect(container.x, container.y, container.w, container.h);
      ctx.strokeStyle = "rgba(0, 0, 0, 1)";
      ctx.lineWidth = 2;
      ctx.strokeRect(container.x, container.y, container.w, container.h);
    }

    const erase = getBoxCoords(block.eraseBox);
    if (erase) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
      ctx.fillRect(erase.x, erase.y, erase.w, erase.h);
      ctx.strokeStyle = "rgba(255, 255, 255, 1)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(erase.x, erase.y, erase.w, erase.h);
    }

    const glyph = getBoxCoords(block.glyphBox);
    if (glyph) {
      ctx.strokeStyle = "rgba(0, 255, 0, 1)";
      ctx.lineWidth = 2;
      ctx.strokeRect(glyph.x, glyph.y, glyph.w, glyph.h);
    }

    const labelCoords = glyph || erase || container;
    if (labelCoords) {
      const text = `[${index}] ${block.type || "unknown"}`;
      const textX = labelCoords.x;
      const textY = labelCoords.y > 15 ? labelCoords.y - 5 : labelCoords.y + 15;

      ctx.font = "bold 16px sans-serif";
      
      ctx.strokeStyle = "rgba(0, 0, 0, 1)";
      ctx.lineWidth = 3;
      ctx.strokeText(text, textX, textY);
      
      ctx.fillStyle = "rgba(255, 0, 0, 1)";
      ctx.fillText(text, textX, textY);
    }
  });
}

export function renderBoundingBoxesOnCanvas(canvas, items, naturalWidth, naturalHeight) {
  canvas.width = naturalWidth;
  canvas.height = naturalHeight;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, naturalWidth, naturalHeight);

  if (!Array.isArray(items) || items.length === 0) return;

  items.forEach((item, index) => {
    const box = item.box || item.glyphBox || item.eraseBox || item.containerBox;
    if (!box || box.length !== 4) return;

    const [ymin, xmin, ymax, xmax] = box;

    // 실제 이미지 해상도(naturalWidth x naturalHeight) 1:1 순수 픽셀 좌표 바인딩
    const x = xmin;
    const y = ymin;
    const w = xmax - xmin;
    const h = ymax - ymin;

    // 1. Draw Bounding Box (청록색 테두리 + 15% 반투명 배경)
    ctx.fillStyle = "rgba(0, 229, 255, 0.15)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "rgba(0, 229, 255, 1)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);

    // 2. Calculate Mathematical Center Point (수학적 중심점)
    const centerX = x + w / 2;
    const centerY = y + h / 2;

    // Crosshair (십자선)
    ctx.strokeStyle = "rgba(255, 0, 0, 1)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(centerX - 8, centerY);
    ctx.lineTo(centerX + 8, centerY);
    ctx.moveTo(centerX, centerY - 8);
    ctx.lineTo(centerX, centerY + 8);
    ctx.stroke();

    // Center Circle (노란 중심점)
    ctx.fillStyle = "rgba(255, 235, 59, 1)";
    ctx.beginPath();
    ctx.arc(centerX, centerY, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Label: [index] (centerX, centerY) "text"
    const label = `[${index}] (${Math.round(centerX)}, ${Math.round(centerY)}) ${item.text || ""}`;
    ctx.font = "bold 14px sans-serif";
    
    ctx.strokeStyle = "rgba(0, 0, 0, 1)";
    ctx.lineWidth = 3;
    ctx.strokeText(label, centerX + 10, centerY + 4);

    ctx.fillStyle = "rgba(255, 255, 0, 1)";
    ctx.fillText(label, centerX + 10, centerY + 4);
  });
}

export function renderGridOnCanvas(canvas, naturalWidth, naturalHeight) {
  canvas.width = naturalWidth;
  canvas.height = naturalHeight;
  const ctx = canvas.getContext("2d");

  ctx.clearRect(0, 0, naturalWidth, naturalHeight);

  ctx.fillStyle = "rgba(255, 0, 0, 0.3)";
  ctx.fillRect(0, 0, naturalWidth, naturalHeight);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= naturalWidth; x += 10) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, naturalHeight);
  }
  for (let y = 0; y <= naturalHeight; y += 10) {
    ctx.moveTo(0, y);
    ctx.lineTo(naturalWidth, y);
  }
  ctx.stroke();

  ctx.strokeStyle = "rgba(0, 0, 255, 0.8)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = 0; x <= naturalWidth; x += 100) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, naturalHeight);
  }
  for (let y = 0; y <= naturalHeight; y += 100) {
    ctx.moveTo(0, y);
    ctx.lineTo(naturalWidth, y);
  }
  ctx.stroke();

  ctx.fillStyle = "rgba(0, 0, 255, 1)";
  ctx.font = "bold 12px sans-serif";
  for (let x = 0; x <= naturalWidth; x += 100) {
    for (let y = 0; y <= naturalHeight; y += 100) {
      if (x > 0 || y > 0) ctx.fillText(`${x},${y}`, x + 4, y + 14);
    }
  }
}

export function renderTranslationOnCanvas(canvas, blocks, naturalWidth, naturalHeight) {
  canvas.width = naturalWidth;
  canvas.height = naturalHeight;
  const ctx = canvas.getContext("2d");

  ctx.clearRect(0, 0, naturalWidth, naturalHeight);

  for (const block of blocks) {
    const coords = getBoxCoords(block.containerBox || block.eraseBox || block.glyphBox);
    if (!coords) continue;
    
    const { x, y, w, h } = coords;

    if (w <= 5 || h <= 5) continue;

    const text = block.translatedText || "";
    if (!text.trim()) continue;

    const padding = Math.min(4, Math.max(2, Math.floor(Math.min(w, h) * 0.05)));
    const innerW = Math.max(10, w - padding * 2);
    const innerH = Math.max(10, h - padding * 2);

    const bgColor = block.bgColor || "#ffffff";
    const isDarkBg = isColorDark(bgColor);

    ctx.save();
    ctx.globalAlpha = 0.90;
    ctx.fillStyle = bgColor;
    drawRoundedRect(ctx, x, y, w, h, Math.min(10, Math.floor(Math.min(w, h) / 4)));
    ctx.fill();
    ctx.restore();

    const textColor = block.textColor || (isDarkBg ? "#ffffff" : "#000000");
    ctx.fillStyle = textColor;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";

    let fontSize = Math.min(
      Math.floor(innerH * 0.8),
      Math.max(10, Math.floor(Math.sqrt((innerW * innerH) / (text.length * 1.4))))
    );

    let lines = [];
    while (fontSize >= 9) {
      ctx.font = `bold ${fontSize}px sans-serif, "Noto Sans CJK KR", "Malgun Gothic"`;
      lines = wrapText(ctx, text, innerW);
      const totalHeight = lines.length * (fontSize * 1.25);
      if (totalHeight <= innerH + 2) {
        break;
      }
      fontSize -= 1;
    }

    ctx.font = `bold ${fontSize}px sans-serif, "Noto Sans CJK KR", "Malgun Gothic"`;
    
    const strokeColor = isDarkBg ? "#000000" : "#ffffff";
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = Math.max(2.5, Math.floor(fontSize * 0.15));

    const lineHeight = fontSize * 1.25;
    const totalBlockHeight = lines.length * lineHeight;
    const centerY = y + h / 2 - (totalBlockHeight / 2) + (lineHeight / 2);
    const centerX = x + w / 2;

    lines.forEach((line, idx) => {
      const lineY = centerY + idx * lineHeight;
      ctx.strokeText(line, centerX, lineY);
      ctx.fillText(line, centerX, lineY);
    });

    if (window.WT_DEBUG) {
      ctx.save();
      ctx.strokeStyle = "red";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = "red";
      ctx.font = "bold 11px monospace";
      ctx.fillText(`#${blocks.indexOf(block)}: ${block.originalText}`, x + 4, y + 12);
      ctx.restore();
    }
  }
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function wrapText(ctx, text, maxWidth) {
  const chars = text.split("");
  const lines = [];
  let currentLine = "";

  for (let i = 0; i < chars.length; i++) {
    const char = chars[i];
    const testLine = currentLine + char;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && currentLine !== "") {
      lines.push(currentLine);
      currentLine = char;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }
  return lines;
}

function isColorDark(hexColor) {
  if (!hexColor || !hexColor.startsWith("#")) return false;
  const hex = hexColor.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16) || 255;
  const g = parseInt(hex.substring(2, 4), 16) || 255;
  const b = parseInt(hex.substring(4, 6), 16) || 255;
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness < 128;
}
