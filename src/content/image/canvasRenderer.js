/* ────────────────────────────────────────────
 * 일반 모드 Canvas 렌더러
 * 원문 영역 배경 채우기 + 번역문 자동 폰트 맞춤 렌더링
 * ──────────────────────────────────────────── */

/**
 * Canvas 위에 번역 오버레이를 렌더링.
 * @param {HTMLCanvasElement} canvas
 * @param {Array} blocks - normalizeBox 적용된 블록 배열
 * @param {number} naturalWidth - 원본 이미지 자연 너비
 * @param {number} naturalHeight - 원본 이미지 자연 높이
 */
export function renderTranslatedOverlay(canvas, blocks, naturalWidth, naturalHeight) {
  canvas.width = naturalWidth;
  canvas.height = naturalHeight;
  const ctx = canvas.getContext("2d");

  blocks.forEach((block, blockIdx) => {
    if (!block.eraseBox || !block.translatedText) return;

    const { x, y, width, height } = block.eraseBox;

    // 디버깅: 실제 Canvas에 그려지는 좌표
    console.log(
      `%c[WT Canvas] #${blockIdx} "${block.originalText?.substring(0, 20)}" → "${block.translatedText?.substring(0, 20)}"`,
      "color: #a6e3a1; font-size: 11px;",
      `| eraseBox: x=${x} y=${y} w=${width} h=${height}`,
      `| canvas: ${naturalWidth}×${naturalHeight}px`
    );

    // Step 1: 원문 영역 배경색으로 지우기
    ctx.fillStyle = block.backgroundColor || "#FFFFFF";
    ctx.fillRect(x, y, width, height);

    // Step 2: 번역문 렌더링
    const padX = 3;
    const padY = 2;
    const drawX = x + padX;
    const drawY = y + padY;
    const drawW = width - padX * 2;
    const drawH = height - padY * 2;

    if (drawW <= 0 || drawH <= 0) return;

    const textColor = block.textColor || "#000000";
    const fontSize = calculateFitFontSize(ctx, block.translatedText, drawW, drawH);

    ctx.fillStyle = textColor;
    ctx.font = `${fontSize}px sans-serif`;
    ctx.textBaseline = "top";

    // 외곽선(stroke) 적용
    if (block.strokeColor && block.strokeColor !== textColor) {
      ctx.strokeStyle = block.strokeColor;
      ctx.lineWidth = Math.max(1, fontSize * 0.08);
      ctx.lineJoin = "round";
      wrapText(ctx, block.translatedText, drawX, drawY, drawW, fontSize * 1.25, true);
    }

    wrapText(ctx, block.translatedText, drawX, drawY, drawW, fontSize * 1.25, false);
  });
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

    if (totalHeight <= maxHeight) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return best;
}

/**
 * 텍스트를 maxWidth에 맞춰 줄바꿈한 행 배열 반환.
 */
function getWrappedLines(ctx, text, maxWidth) {
  const words = text.split("");  // 한글/CJK 대응: 글자 단위 분리
  const lines = [];
  let currentLine = "";

  for (const char of words) {
    const testLine = currentLine + char;
    const metrics = ctx.measureText(testLine);

    if (metrics.width > maxWidth && currentLine.length > 0) {
      lines.push(currentLine);
      currentLine = char;
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine) lines.push(currentLine);
  return lines;
}

/**
 * Canvas에 줄바꿈 텍스트 렌더링.
 * @param {boolean} strokeOnly - true면 strokeText만 호출
 */
function wrapText(ctx, text, x, y, maxWidth, lineHeight, strokeOnly = false) {
  const lines = getWrappedLines(ctx, text, maxWidth);

  for (let i = 0; i < lines.length; i++) {
    const lineY = y + i * lineHeight;
    if (strokeOnly) {
      ctx.strokeText(lines[i], x, lineY);
    } else {
      ctx.fillText(lines[i], x, lineY);
    }
  }
}
