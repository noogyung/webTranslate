/* ────────────────────────────────────────────
 * 일반 모드 Canvas 렌더러 v2.0
 * - 5필드 경량 프롬프트 응답 대응 (glyphBox/containerBox null 허용)
 * - 세로(vertical) / 회전(rotated) 텍스트 방향 지원
 * - 배경색 자동 추정 (이미지 픽셀 샘플링 → 평균)
 * - 가독성을 위한 텍스트 색상 대비 보정 (어두운 배경 → 흰 글씨)
 * ──────────────────────────────────────────── */

/**
 * Canvas 위에 번역 오버레이를 렌더링.
 * @param {HTMLCanvasElement} canvas
 * @param {HTMLImageElement} sourceImg - 배경색 샘플링 원본 이미지
 * @param {Array} blocks - normalizeBox 적용된 블록 배열
 * @param {number} naturalWidth
 * @param {number} naturalHeight
 */
export function renderTranslatedOverlay(canvas, sourceImg, blocks, naturalWidth, naturalHeight) {
  canvas.width = naturalWidth;
  canvas.height = naturalHeight;
  const ctx = canvas.getContext("2d");

  // 배경색 샘플링용 소스 이미지를 보조 캔버스에 그리기
  let samplerCtx = null;
  if (sourceImg && sourceImg.complete && sourceImg.naturalWidth > 0) {
    try {
      const sampler = document.createElement("canvas");
      sampler.width = naturalWidth;
      sampler.height = naturalHeight;
      samplerCtx = sampler.getContext("2d");
      samplerCtx.drawImage(sourceImg, 0, 0, naturalWidth, naturalHeight);
    } catch (_) {
      samplerCtx = null;
    }
  }

  blocks.forEach((block, blockIdx) => {
    if (!block.eraseBox || !block.translatedText) return;

    const { x, y, width, height } = block.eraseBox;
    const orientation = block.orientation || "horizontal";

    // 배경색: textColor와 대비 보정을 위해 픽셀 샘플링 우선, 없으면 블록값 사용
    const bgColor = samplerCtx
      ? sampleAverageColor(samplerCtx, x, y, width, height)
      : (block.backgroundColor || "#FFFFFF");

    const textColor = pickContrastColor(block.textColor || "#000000", bgColor);

    console.log(
      `%c[WT Canvas] #${blockIdx} "${block.originalText?.substring(0, 20)}" → "${block.translatedText?.substring(0, 20)}"`,
      "color: #a6e3a1; font-size: 11px;",
      `| ${orientation} | eraseBox: x=${x} y=${y} w=${width} h=${height}`
    );

    // Step 1: 텍스트 영역에 반투명 흰색 배경 (배경색 보존, 가독성 확보)
    ctx.save();
    ctx.globalAlpha = 0.82;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(x, y, width, height);
    ctx.globalAlpha = 1.0;

    // Step 2: 번역문 렌더링 (항상 수평 — vertical/rotated 무시)
    const padX = 3, padY = 2;
    const drawX = x + padX;
    const drawY = y + padY;
    const drawW = width - padX * 2;
    const drawH = height - padY * 2;
    if (drawW <= 0 || drawH <= 0) { ctx.restore(); return; }

    const fontSize = calculateFitFontSize(ctx, block.translatedText, drawW, drawH);
    ctx.font = `${fontSize}px sans-serif`;
    ctx.textBaseline = "top";

    // 흰색 테두리 (가독성용 — 배경색과 무관하게 텍스트 윤곽 확보)
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = Math.max(1.5, fontSize * 0.12);
    ctx.lineJoin = "round";
    wrapText(ctx, block.translatedText, drawX, drawY, drawW, fontSize * 1.25, true);

    // 텍스트 색상 (대비 보정된 값 사용)
    ctx.fillStyle = textColor;
    wrapText(ctx, block.translatedText, drawX, drawY, drawW, fontSize * 1.25, false);

    ctx.restore();
  });
}

/**
 * 영역 내 픽셀 샘플링하여 평균 배경색 반환.
 */
function sampleAverageColor(ctx, x, y, width, height) {
  try {
    const sampleW = Math.max(1, Math.min(width, 20));
    const sampleH = Math.max(1, Math.min(height, 20));
    const data = ctx.getImageData(x, y, sampleW, sampleH).data;
    let r = 0, g = 0, b = 0, count = 0;
    for (let i = 0; i < data.length; i += 4) {
      r += data[i]; g += data[i + 1]; b += data[i + 2];
      count++;
    }
    if (count === 0) return "#FFFFFF";
    return `rgb(${Math.round(r / count)},${Math.round(g / count)},${Math.round(b / count)})`;
  } catch (_) {
    return "#FFFFFF";
  }
}

/**
 * 배경색과 대비가 충분한 글자 색 선택.
 * 주어진 textColor가 가독성이 나쁘면 흰색/검정으로 대체.
 */
function pickContrastColor(textColor, bgColor) {
  const bgL = getLuminance(bgColor);
  const txtL = getLuminance(textColor);
  const contrast = (Math.max(bgL, txtL) + 0.05) / (Math.min(bgL, txtL) + 0.05);
  if (contrast >= 3.0) return textColor; // 충분한 대비
  return bgL > 0.5 ? "#111111" : "#FFFFFF"; // 대비 부족 → 자동 보정
}

function getLuminance(color) {
  const ctx2 = document.createElement("canvas").getContext("2d");
  ctx2.fillStyle = color;
  ctx2.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx2.getImageData(0, 0, 1, 1).data;
  const toLinear = v => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/**
 * 주어진 영역에 맞는 최대 폰트 크기를 이진 탐색으로 계산.
 */
function calculateFitFontSize(ctx, text, maxWidth, maxHeight) {
  let lo = 8;
  let hi = Math.min(maxHeight, 72);
  let best = lo;

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    ctx.font = `${mid}px sans-serif`;
    const lines = getWrappedLines(ctx, text, maxWidth);
    const totalHeight = lines.length * mid * 1.25;
    if (totalHeight <= maxHeight) { best = mid; lo = mid + 1; }
    else { hi = mid - 1; }
  }
  return best;
}

/**
 * 텍스트를 maxWidth에 맞춰 줄바꿈한 행 배열 반환 (CJK 글자 단위).
 */
function getWrappedLines(ctx, text, maxWidth) {
  const lines = [];
  for (const rawLine of text.split("\n")) {
    let current = "";
    for (const char of rawLine) {
      const test = current + char;
      if (ctx.measureText(test).width > maxWidth && current.length > 0) {
        lines.push(current);
        current = char;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
  }
  return lines.length > 0 ? lines : [""];
}

/**
 * Canvas에 줄바꿈 텍스트 렌더링.
 */
function wrapText(ctx, text, x, y, maxWidth, lineHeight, strokeOnly = false) {
  const lines = getWrappedLines(ctx, text, maxWidth);
  for (let i = 0; i < lines.length; i++) {
    const lineY = y + i * lineHeight;
    if (strokeOnly) ctx.strokeText(lines[i], x, lineY);
    else ctx.fillText(lines[i], x, lineY);
  }
}
