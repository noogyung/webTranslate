# [Part 2] #04. 스팀 <a> 링크 색상 오추출과 고아 텍스트 노드 래핑

> **작업 일자**: 2026-08-04  
> **관련 대화**: `ea46cbb1-d55b-4620-b33f-787fbc92ad35` (커밋 `c9b9cf4`)  
> **핵심 분류**: `새로운 지시`, `지시 수정 (DOM 파괴 방지)`

---

## 1. 요구 사항과 이유 (Requirement & Why)

### 요구 이유
스팀(Steam) 게임 상세 페이지의 복잡한 레이아웃에서 번역을 돌렸을 때 2가지 문제가 발생했다:
1. `<div>`나 `<p>` 안에 별도 태그 없이 바로 들어있는 텍스트(고아 텍스트 노드)에 번역문을 붙이려다 부모 Flex/Grid 컨테이너 레이아웃이 찢어지고 링크 클릭 이벤트가 날아감.
2. 부모 컨테이너 내부에 파란색 `<a>` 링크가 하나라도 있으면, 링크 바깥의 일반 본문 텍스트 번역문까지 전부 파란 링크 색상으로 칠해져 가독성이 망가짐.

### 요구 사항
1. 원본 웹페이지의 Flex, Grid, Table 레이아웃 구조를 0.1px도 틀어짐 없이 보존하면서 텍스트 노드만 안전하게 래핑할 것.
2. 각 텍스트 노드가 속한 실제 부모 요소의 고유 글자 색상(computed color)을 1:1로 정확하게 추출하여 상속할 것.

---

## 2. 지시 내용 (Instruction)

AI에게 고아 텍스트 노드 안전 래핑 및 색상 추출 보정을 지시했다:

> **"스팀 페이지 스크린샷의 레이아웃 깨짐을 분석하고, 고아 텍스트 노드를 Flex 레이아웃 영향 없이 감싸는 DOM 순회 수집기를 작성해라. 또한 링크 색상이 전체로 번지는 버그를 고쳐라."**

---

## 3. AI의 구현 결과 및 발생한 시행착오 (Trial & Error)

AI가 코드를 고쳐왔으나 여전히 스팀 레이아웃이 깨졌다.

```javascript
// AI가 작성한 노드 래핑 (오류 코드)
function wrapTextNode(textNode) {
  const span = document.createElement("span"); // 일반 span으로 감쌈
  span.className = "wt-text-wrapper";
  textNode.parentNode.insertBefore(span, textNode);
  span.appendChild(textNode);
  // 부모의 첫 번째 자식 링크 색상을 무조건 상속
  span.style.color = window.getComputedStyle(span.parentElement.querySelector("a") || span.parentElement).color;
}
```

### 발생한 문제점
1. **Flex 레이아웃 파괴**: `display: flex` 부모 아래에 일반 `<span>`이 삽입되면서 Flex Item 수가 증가해 그리드 배치가 깨지고 버튼들이 아래로 밀려남.
2. **색상 오추출**: 텍스트 노드 자신의 부모가 아닌, 컨테이너 내의 `<a>` 태그 색상을 긁어와 전체 번역문에 파란 링크 색을 입힘.

---

## 4. 지시 수정: DOM 파괴 방지 (Action: Instruction Fix)

* **[지시 수정 1 - `display: contents` 가상 래퍼 도입]**:  
  > "일반 `span`으로 감싸서 Flex Item을 늘리지 마라. **CSS `display: contents`를 적용하여 부모 레이아웃 엔진에는 래퍼가 없는 것처럼 투명하게 동작하면서 오직 텍스트 묶음만 통제하는 가상 래퍼(`.wt-text-wrapper`)를 적용해라.**"
* **[지시 수정 2 - 텍스트 노드 직속 부모 색상 정밀 추출]**:  
  > "`querySelector('a')` 따위로 색상을 찾지 마라. **해당 텍스트 노드의 직속 부모(`parentElement`)의 `window.getComputedStyle(el).color`만 엄격하게 추출하도록 즉시 수정해라.**"

---

## 5. 해결 과정 및 결과 (Resolution)

AI가 `display: contents`를 적용한 안전한 텍스트 래핑 함수 `wrapTextRuns`를 완성했다.

```javascript
// src/content/dom_collector.js
export function wrapTextRuns(element) {
  const childNodes = Array.from(element.childNodes);

  for (const node of childNodes) {
    if (node.nodeType === Node.TEXT_NODE && node.nodeValue.trim().length > 0) {
      const wrapper = document.createElement("span");
      wrapper.className = "wt-text-wrapper";
      wrapper.style.display = "contents"; // 부모 Flex/Grid에 영향 제로!

      node.parentNode.insertBefore(wrapper, node);
      wrapper.appendChild(node);
    }
  }
}
```

```css
/* content.css */
.wt-text-wrapper {
  display: contents !important;
}
```

스팀 상점의 복잡한 배너, 가격 태그, 복합 Flex 레이아웃이 단 1px의 어긋남 없이 보존되었고 링크 색상 왜곡도 완벽히 사라졌다.

---

## 6. 다음 작업 사항과 이유 (Next Work & Why)

고아 텍스트 노드는 잘 감쌌으나, 스팀 상점의 `장바구니에 추가(Add to Cart)` 같은 작은 녹색 버튼 안에서 번역문이 `<div>` 블록처럼 렌더링되어 버튼이 세로로 거대하게 뚱뚱해지는 심각한 렌더링 붕괴가 발견되었다.

**태그의 성격과 글자 길이에 따라 인라인(Inline)과 블록(Block) 렌더링을 지능적으로 분기하는 듀얼 렌더러를 구축해야겠다.**
