export function inspectReport(r) {
  const warnings = [];
  const boxes = r.sprite.cropBboxes, regions = r.sprite.layout.regions;
  if (boxes.length !== r.translationPairs.length || regions.length !== boxes.length) warnings.push('블록·크롭·스프라이트 영역 개수가 다릅니다.');
  boxes.forEach((b, i) => {
    const valid = [b?.x,b?.y,b?.width,b?.height].every(Number.isFinite) && b.width > 0 && b.height > 0;
    if (!valid) { warnings.push(`#${i+1}: 유효하지 않은 크롭 좌표`); return; }
    if (b.x < 0 || b.y < 0 || b.x+b.width > r.inputWidth || b.y+b.height > r.inputHeight) warnings.push(`#${i+1}: 크롭이 입력 이미지 범위를 벗어납니다.`);
    for (let j=0;j<i;j++) {
      const a=boxes[j];
      if(!a)continue;
      if (Math.min(a.x+a.width,b.x+b.width)>Math.max(a.x,b.x) && Math.min(a.y+a.height,b.y+b.height)>Math.max(a.y,b.y)) warnings.push(`#${j+1} ↔ #${i+1}: 크롭 중첩 — 뒤쪽 크롭이 앞쪽을 덮습니다.`);
    }
    const region=regions[i];
    if (region && region.width < b.width-1) warnings.push(`#${i+1}: 스프라이트 축소 ${Math.round(region.width/b.width*100)}%`);
    if (region && regions[i+1] && region.y+region.height+r.sprite.layout.gap > regions[i+1].y) warnings.push(`#${i+1}: 구분선이 다음 영역과 겹칠 수 있습니다.`);
  });
  return warnings;
}
