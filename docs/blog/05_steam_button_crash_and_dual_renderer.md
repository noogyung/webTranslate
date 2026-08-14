# [Part 2] #05. 스팀 장바구니 버튼 깨짐과 인라인/블록 듀얼 분기

> **작업 일자**: 2026-08-04  
> **관련 대화**: `ea46cbb1-d55b-4620-b33f-787fbc92ad35`  
> **핵심 분류**: `새로운 지시`, `지시 수정 (렌더링 분기 바로잡기)`

---

## 1. 요구 사항과 이유 (Requirement & Why)

### 요구 이유
스팀 상점에서 `Add to Cart(장바구니에 추가)`나 `Buy Now(지금 구매)` 같은 작은 UI 버튼을 번역했을 때 참사가 일어났다. 버튼 안에 `원문 + 줄바꿈 + 번역문` 형태의 거대한 블록이 강제로 밀고 들어오면서, 날씬했던 버튼이 세로로 3배 이상 뚱뚱해져 옆의 가격표와 겹치고 페이지 전체 디자인이 망가졌다.

### 요구 사항
1. 버튼(`button`), 링크(`a`), 짧은 배지 태그 내부는 원문 옆에 괄호나 슬래시 형태로 나란히 붙는 **인라인(Inline) 모드**로 렌더링할 것.
2. 긴 본문 문단이나 게시글 설명은 원문 바로 아래에 자연스럽게 배치되는 **블록(Block) 모드**로 렌더링할 것.
3. 원문 복원 시 DOM 요소를 손상시키지 않고 번역 이전의 깨끗한 상태로 100% 되돌릴 것.

---

## 2. 지시 내용 (Instruction)

AI에게 인라인/블록 듀얼 렌더링 분기를 지시했다:

> **"모든 요소를 일괄 블록으로 처리하지 말고, 버튼이나 짧은 태그는 인라인으로, 본문 문단은 블록으로 분기하여 렌더링하는 지능형 렌더러를 작성해라."**

---

## 3. AI의 구현 결과 및 발생한 시행착오 (Trial & Error)

AI가 코드를 작성했으나 기준이 모호하여 새로운 부작용이 터졌다.

```javascript
// AI가 작성한 분기 기준 (오류 코드)
function renderTranslatedNode(el, translatedText) {
  // 단순히 태그 이름만으로 분기
  if (el.tagName === "P" || el.tagName === "DIV") {
    el.innerHTML += `<div class="wt-block">${translatedText}</div>`; // innerHTML 직접 삽입으로 이벤트 소실
  } else {
    el.innerText += ` (${translatedText})`; // innerText로 기존 자식 노드 파괴!
  }
}
```

### 발생한 문제점
1. **자식 노드 및 이벤트 파괴**: `innerText`나 `innerHTML`을 무식하게 조작하여 버튼 내부에 있던 아이콘(`<i>`, `<svg>`)과 클릭 핸들러가 통째로 증발함.
2. **짧은 DIV의 뚱뚱화**: 글자 수가 5글자밖에 안 되는 짧은 제목/헤더 `<div>`까지 무조건 거대한 블록으로 처리되어 여백이 흉하게 늘어남.

---

## 4. 지시 수정: 렌더링 분기 바로잡기 (Action: Instruction Fix)

* **[지시 수정 - 25자 기준 + 시맨틱 태그 결합 듀얼 렌더러 구현]**:  
  > "`innerHTML`/`innerText`로 기존 DOM을 덮어쓰지 마라. **독립된 `<span>` 요소를 생성해 삽입하고, 태그 종류(`a, button, span, label`)와 글자 수(25자 이하)를 동시에 검사하는 `isInlineElement` 함수를 만들어 25자 이하의 짧은 UI 요소는 인라인으로, 긴 문장은 블록으로 칼같이 분기해라.**"

---

## 5. 해결 과정 및 결과 (Resolution)

AI가 지능형 인라인 판별 함수 `isInlineElement`와 안전한 DOM 삽입 렌더러를 완성했다.

```javascript
// src/content/renderer.js
export function isInlineElement(el, originalText) {
  const tagName = el.tagName.toLowerCase();

  // 1. 본질이 인라인 태그인 경우
  const inlineTags = ["a", "span", "b", "strong", "em", "i", "button", "label"];
  if (inlineTags.includes(tagName)) return true;

  // 2. 블록 태그라도 글자 수가 25자 이하로 짧은 UI 요소인 경우 인라인 처리
  if (originalText.trim().length <= 25) {
    const display = window.getComputedStyle(el).display;
    if (display.includes("inline") || display.includes("flex")) return true;
  }

  return false;
}
```

```css
/* content.css */
.wt-translation-inline {
  display: inline !important;
  margin-left: 6px;
}

.wt-translation-block {
  display: block !important;
  margin-top: 4px;
}
```

스팀 장바구니 버튼 안에서는 `Add to Cart (장바구니 추가)` 형태로 깔끔하게 인라인 삽입되고, 긴 게임 소개글은 아래쪽에 단락 블록으로 정돈되어 완벽한 시각적 균형을 달성했다.

---

## 6. 다음 작업 사항과 이유 (Next Work & Why)

페이지 전체 번역(`Alt+A`)은 안정화되었으나, 사용자가 긴 웹페이지 중 특정 문단만 마우스로 긁어서 번역하려 할 때 "번역할 내용이 없습니다"라는 엉뚱한 경고 알림이 뜨거나 긴 문단이 인라인으로 찌그러지는 선택 영역 번역 버그가 보고되었다.

**선택 영역 번역의 오탐을 없애고 긴 문단 파싱을 보정해야겠다.**
