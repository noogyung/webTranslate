/**
 * dbnet_vatti_unclipping.js — DBNet Vatti Polygon Expansion Algorithm
 * 
 * SOTA DBNet은 학습 시 라벨(글자 영역)을 수축(Shrink)시켜 Probability Kernel을 만듭니다.
 * 추론(Inference) 시 검출된 확률 영역 커널은 원래 글자 크기보다 작으므로, 
 * 면적(Area)과 둘레(Perimeter) 비례식(Vatti Clipping 방식)을 사용하여 
 * 원본 크기로 바운딩 박스를 동적 팽창(Expand)시킵니다.
 */

/**
 * DBNet 이진화로 추출된 수축된(Shrunk) 바운딩 박스를 정상 텍스트 크기로 팽창
 * 공식: D' = (Area * unclip_ratio) / Perimeter
 * 
 * @param {Array<[number, number, number, number]>} boxes [ymin, xmin, ymax, xmax] 배열
 * @param {number} unclipRatio 팽창 계수 (기본값: 1.5 ~ 2.0)
 * @param {number} maxWidth 최대 허용 가로 픽셀
 * @param {number} maxHeight 최대 허용 세로 픽셀
 * @returns {Array<[number, number, number, number]>}
 */
export function applyVattiUnclipping(boxes, unclipRatio, maxWidth, maxHeight) {
  return boxes.map(box => {
    const [ymin, xmin, ymax, xmax] = box;
    const w = xmax - xmin;
    const h = ymax - ymin;
    
    // 비정상 박스는 그대로 반환
    if (w <= 0 || h <= 0) return box;

    const area = w * h;
    const perimeter = 2 * (w + h);
    
    if (perimeter === 0) return box;

    // Vatti Expansion Distance
    const distance = (area * unclipRatio) / perimeter;
    
    // 사방으로 distance 만큼 팽창 후 경계 클리핑
    const newYmin = Math.max(0, Math.floor(ymin - distance));
    const newXmin = Math.max(0, Math.floor(xmin - distance));
    const newYmax = Math.min(maxHeight, Math.ceil(ymax + distance));
    const newXmax = Math.min(maxWidth, Math.ceil(xmax + distance));

    return [newYmin, newXmin, newYmax, newXmax];
  });
}
