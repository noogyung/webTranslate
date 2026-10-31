/* ────────────────────────────────────────────
 * 일반 모드 Canvas 렌더러 v2.1
 * - 항상 수평 텍스트 렌더링
 * - 배경 없음 (원본 이미지 보존)
 * - 글자색: 항상 #111111 (검정)
 * - 테두리: 항상 #FFFFFF (흰색) stroke
 * - 위치: 박스 가운데 정렬 (수직/수평 모두)
 * ──────────────────────────────────────────── */

import { applyLocalDictionary } from "../../utils/dictionary.js";

/**
 * Canvas 위에 번역 오버레이를 렌더링.
 * @param {HTMLCanvasElement} canvas
 * @param {HTMLImageElement} sourceImg - 현재 미사용 (서명 호환 유지)
 * @param {Array} blocks - normalizeBox 적용된 블록 배열
 * @param {number} naturalWidth
 * @param {number} naturalHeight
 * @param {Array} [customDict=[]] - 사용자 사전 배열
 */
export function renderTranslatedOverlay(canvas, sourceImg, blocks, naturalWidth, naturalHeight, customDict = []) {
  canvas.width = naturalWidth;
  canvas.height = naturalHeight;
  const ctx = canvas.getContext("2d");

  blocks.forEach((block, blockIdx) => {
    if (!block.eraseBox || !block.translatedText) return;

    const { x, y, width, height } = block.eraseBox;
    const orientation = block.orientation || "horizontal";
    const displayText = applyLocalDictionary(block.translatedText, customDict);

    console.log(
      `%c[WT Canvas] #${blockIdx} "${block.originalText?.substring(0, 20)}" → "${displayText?.substring(0, 20)}"`,
      "color: #a6e3a1; font-size: 11px;",
      `| ${orientation} | eraseBox: x=${x} y=${y} w=${width} h=${height}`
    );

    // 내부 패딩
    const PAD_X = 4, PAD_Y = 3;
    const drawW = Math.max(1, width - PAD_X * 2);
    const drawH = Math.max(1, height - PAD_Y * 2);

    ctx.save();

    // 원문 완전 차폐용 불투명 흰색 라운드 박스 배경
    const BG_PAD = 2;
    const bx = Math.max(0, x - BG_PAD);
    const by = Math.max(0, y - BG_PAD);
    const bw = Math.min(naturalWidth - bx, width + BG_PAD * 2);
    const bh = Math.min(naturalHeight - by, height + BG_PAD * 2);
    const radius = Math.min(6, bw / 4, bh / 4);
    ctx.fillStyle = "rgba(255, 255, 255, 0.97)";
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(bx, by, bw, bh, radius);
    } else {
      ctx.rect(bx, by, bw, bh);
    }
    ctx.fill();

    // 폰트 크기 결정
    const fontSize = calculateFitFontSize(ctx, displayText, drawW, drawH);
    ctx.font = `bold ${fontSize}px sans-serif`;

    // 줄 계산 (세로 중앙 정렬에 필요)
    const lines = getWrappedLines(ctx, displayText, drawW);
    const lineHeight = fontSize * 1.25;
    const totalTextHeight = lines.length * lineHeight;

    // 박스 가운데 기준 렌더링 좌표
    const centerX = x + width / 2;
    const startY = y + (height - totalTextHeight) / 2;

    // 흰색 stroke 테두리
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = Math.max(2, fontSize * 0.14);
    ctx.lineJoin = "round";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    lines.forEach((line, i) => {
      ctx.strokeText(line, centerX, startY + i * lineHeight);
    });

    // 검정 텍스트
    ctx.fillStyle = "#111111";
    lines.forEach((line, i) => {
      ctx.fillText(line, centerX, startY + i * lineHeight);
    });

    ctx.restore();
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
    ctx.font = `bold ${mid}px sans-serif`;
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
