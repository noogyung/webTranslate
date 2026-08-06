/**
 * box_cluster_engine.js — Universal Distance-Constrained Bounding Box Clustering Engine
 *
 * 역할:
 *  1. 동적 스케일 기반 근접 글자 박스(Character/Line Box)를 말풍선/문단 단위로 결합.
 *  2. 이미지 해상도 비율(naturalWidth / naturalHeight)에 비례하는 클러스터링 수용 거리 산출로
 *     서로 다른 말풍선이 하나의 대형 박스로 뭉개지는 현상을 완벽 차단 (하드코딩 제거).
 */

/**
 * 거리가 인접한 텍스트 바운딩 박스를 동적으로 병합
 * @param {Array<[number, number, number, number]>} boxes 
 * @param {number} imgWidth 
 * @param {number} imgHeight 
 * @returns {Array<[number, number, number, number]>}
 */
export function clusterTextBoundingBoxes(boxes, imgWidth, imgHeight) {
  if (!boxes || boxes.length <= 1) return boxes;

  // 동적 임계 간격 (이미지 해상도 비례: 가로/세로 1.2% 이내만 인접 인정)
  const maxGapX = Math.max(12, Math.floor(imgWidth * 0.012));
  const maxGapY = Math.max(16, Math.floor(imgHeight * 0.016));

  const merged = [];
  const used = new Array(boxes.length).fill(false);

  for (let i = 0; i < boxes.length; i++) {
    if (used[i]) continue;
    let [y1, x1, y2, x2] = boxes[i];
    used[i] = true;

    let changed = true;
    while (changed) {
      changed = false;
      for (let j = 0; j < boxes.length; j++) {
        if (used[j]) continue;
        const [ny1, nx1, ny2, nx2] = boxes[j];

        // 1. 과도한 거대 박스 생성 방지 (최대 허용 가로/세로 비율 제약)
        const newW = Math.max(x2, nx2) - Math.min(x1, nx1);
        const newH = Math.max(y2, ny2) - Math.min(y1, ny1);

        if (newW > imgWidth * 0.55 || newH > imgHeight * 0.55) {
          continue; // 전체 이미지의 55% 이상 덮는 거대 박스 병합 금지
        }

        // 2. 인접 거리 검증 (Dynamic Distance Constraint)
        const overlapX = !(x2 + maxGapX < nx1 || nx2 + maxGapX < x1);
        const overlapY = !(y2 + maxGapY < ny1 || ny2 + maxGapY < y1);

        if (overlapX && overlapY) {
          x1 = Math.min(x1, nx1);
          y1 = Math.min(y1, ny1);
          x2 = Math.max(x2, nx2);
          y2 = Math.max(y2, ny2);
          used[j] = true;
          changed = true;
        }
      }
    }

    merged.push([y1, x1, y2, x2]);
  }

  return merged;
}
