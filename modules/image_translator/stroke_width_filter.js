/**
 * stroke_width_filter.js — Universal Stroke Width Transform (SWT) & Noise Filter
 *
 * 역할:
 *  1. 텍스트획(Stroke)은 양쪽 평행 경계선의 두께가 일정하다는 개체 기하 특성을 검증.
 *  2. 머리카락, 눈동자 뾰족한 곡선, 옷주름, 컷 테두리 등 굵기가 일정하지 않고 꺾이는 그림선을 자동 차단.
 *  3. 하드코딩 없는 정규화 비율 수치 검증.
 */

/**
 * 텍스트 후보 박스 검증 및 오탐(Non-text Noise) 차단
 * @param {Array<[number, number, number, number]>} rawBoxes 
 * @param {ImageData} imgData 
 * @param {number} width 
 * @param {number} height 
 * @returns {Array<[number, number, number, number]>}
 */
export function filterNonTextArtifacts(rawBoxes, imgData, width, height) {
  const data = imgData.data;

  return rawBoxes.filter(([ymin, xmin, ymax, xmax]) => {
    const bw = xmax - xmin;
    const bh = ymax - ymin;
    const area = bw * bh;

    // 1. 종횡비(Aspect Ratio) 필터링 — 컷선, 긴 속도선 제거 (범용비율 > 15:1 또는 < 1:15)
    const aspectRatio = bw / bh;
    if (aspectRatio > 15 || aspectRatio < 1 / 15) {
      return false;
    }

    // 2. 픽셀 밀도(Density Ratio) 검증 — 너무 빽빽한 면(컷 프레임) 또는 비어있는 선 제거
    let strokePixels = 0;
    for (let y = ymin; y < ymax; y += 2) {
      for (let x = xmin; x < xmax; x += 2) {
        const idx = (y * width + x) * 4;
        const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        if (lum < 160) {
          strokePixels++;
        }
      }
    }

    const sampledArea = (bw * bh) / 4;
    const density = strokePixels / sampledArea;

    // 텍스트 밀도는 보통 10% ~ 75% 사이 위치
    if (density < 0.08 || density > 0.85) {
      return false;
    }

    // 3. 스트로크 분산 검증 (Stroke Width Variance Check)
    const swtVariance = computeSWTVariance(imgData, xmin, ymin, bw, bh, width);
    if (swtVariance > 0.65) {
      // 획 두께 변화율이 너무 크면 그림 선(머리카락/주름)으로 판단하여 차단
      return false;
    }

    return true;
  });
}

/**
 * 획 두께 변동 분산(Stroke Width Variance) 산출
 */
function computeSWTVariance(imgData, startX, startY, bw, bh, imgWidth) {
  const data = imgData.data;
  const strokeWidths = [];

  for (let y = startY + 2; y < startY + bh - 2; y += 4) {
    let inStroke = false;
    let strokeLen = 0;

    for (let x = startX + 2; x < startX + bw - 2; x++) {
      const idx = (y * imgWidth + x) * 4;
      const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];

      if (lum < 150) {
        inStroke = true;
        strokeLen++;
      } else {
        if (inStroke && strokeLen > 1 && strokeLen < Math.min(bw, bh)) {
          strokeWidths.push(strokeLen);
        }
        inStroke = false;
        strokeLen = 0;
      }
    }
  }

  if (strokeWidths.length < 3) return 0;

  // 평균 및 표준편차 산출
  const mean = strokeWidths.reduce((a, b) => a + b, 0) / strokeWidths.length;
  if (mean === 0) return 0;

  const variance = strokeWidths.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / strokeWidths.length;
  const stdDev = Math.sqrt(variance);

  // 변동 계수 (Coefficient of Variation) = 표준편차 / 평균
  return stdDev / mean;
}
