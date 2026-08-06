/**
 * textline_merge.js — SOTA Constrained Textline Merging Engine
 * 
 * 기존 단순 겹침(Overlap) 병합의 Over-merging(과도한 뭉개짐) 문제를 해결합니다.
 * DBNet으로 도출된 각 글자/줄(Textline) 커널을, 엄격한 여백 제약(Gap Constraint)과 
 * 글자 높이(Line Height) 비율 조건을 적용하여 말풍선 및 단락 단위로 묶어줍니다.
 */

/**
 * 엄격한 제약 조건을 적용하여 텍스트 라인 바운딩 박스를 병합
 * 
 * @param {Array<[number, number, number, number]>} boxes [ymin, xmin, ymax, xmax] 배열
 * @param {number} imgWidth 
 * @param {number} imgHeight 
 * @returns {Array<[number, number, number, number]>}
 */
export function constrainedTextlineMerge(boxes, imgWidth, imgHeight) {
  if (!boxes || boxes.length <= 1) return boxes;

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

        // 1. 현재 병합 중인 박스의 동적 크기 계산
        const w1 = x2 - x1;
        const h1 = y2 - y1;
        const w2 = nx2 - nx1;
        const h2 = ny2 - ny1;

        // 2. 동적 간격 임계값 (글자 크기에 비례하는 max gap ratio)
        // 만화 특성상 말풍선 내 세로줄(column) 간격은 글자 너비의 1.5배 이내
        const maxGapX = Math.max(10, Math.min(w1, w2) * 1.8);
        const maxGapY = Math.max(10, Math.min(h1, h2) * 1.5);

        // 3. 인접 여부 확인
        const gapX = Math.max(0, Math.max(x1, nx1) - Math.min(x2, nx2));
        const gapY = Math.max(0, Math.max(y1, ny1) - Math.min(y2, ny2));

        const isCloseHorizontally = gapX < maxGapX && gapY < Math.max(h1, h2) * 0.8;
        const isCloseVertically = gapY < maxGapY && gapX < Math.max(w1, w2) * 0.8;

        if (isCloseHorizontally || isCloseVertically) {
          // 4. 병합 후 과도하게 커지는지 안전선 검사 (전체 화면의 40% 이상 차지 금지)
          const newW = Math.max(x2, nx2) - Math.min(x1, nx1);
          const newH = Math.max(y2, ny2) - Math.min(y1, ny1);

          if (newW > imgWidth * 0.40 || newH > imgHeight * 0.40) {
            continue; // Over-merging 차단
          }

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
