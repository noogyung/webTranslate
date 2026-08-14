# [Part 2] #06. 선택 영역 번역 도입과 "내용 없음" 오탐 버그 해결

> **작업 일자**: 2026-08-04  
> **관련 대화**: `a0140cae-5285-4e4d-89fd-977583d33279`  
> **핵심 분류**: `새로운 지시 (선택 영역 번역 기능 신규 개발)`, `지시 수정 (선택 영역 파서 오판정 및 alert 제거)`

---

## 1. 요구 사항과 이유 (Requirement & Why)

### 요구 이유
웹페이지 전체를 한 번에 번역하는 `Alt+A` 기능은 전체 글의 맥락을 훑기에는 좋았으나, 개발 공식 문서나 포럼에서 특정 코드 설명, 에러 메시지, 또는 특정 문단 1~2개만 가볍고 빠르게 확인하고 싶을 때는 페이지 전체를 번역하는 것이 매우 무겁고 비효율적이었다.

사용자가 마우스로 원하는 텍스트만 쓱 긁어서(Drag) 즉시 번역 결과를 확인할 수 있는 **핀포인트 선택 영역 번역(Selection Translation)** 인터랙션 기능이 필수적으로 요구되었다.

### 요구 사항
1. 웹페이지 내에서 마우스로 드래그한 선택 영역(`window.getSelection`)의 텍스트를 감지하여 즉시 번역 파이프라인으로 전송할 것.
2. 드래그한 텍스트의 길이에 맞춰, 짧은 단어는 미니 툴팁으로, 50자를 초과하는 긴 문단은 자동 줄바꿈이 지원되는 독립 플로팅 카드(`wt-selection-card`)로 분기 렌더링할 것.
3. 부모 DOM 구조나 과거 번역 이력에 구애받지 않고 사용자가 선택한 순수 문자열을 100% 신뢰하여 번역할 것.
4. 사용자 작업 흐름을 강제로 끊는 브라우저 네이티브 `alert()` 대화상자를 전면 금지할 것.

---

## 2. 지시 내용 (Instruction)

AI에게 선택 영역 번역 기능의 신규 개발을 지시했다:

> **"페이지 전체 번역 외에, 사용자가 마우스로 텍스트를 드래그했을 때 해당 영역만 번역해 주는 선택 영역 번역 기능을 개발해라. 단어는 툴팁으로, 긴 문단은 플로팅 카드로 깔끔하게 띄워라."**

---

## 3. AI의 구현 결과 및 발생한 시행착오 (Trial & Error)

AI가 선택 영역 이벤트 핸들러를 작성해왔으나, 심각한 오탐(False Alarm)과 렌더링 결함이 발생했다.

```javascript
// AI가 작성한 초기 선택 영역 핸들러 (오류 코드)
function handleSelectionTranslate() {
  const selection = window.getSelection();
  const text = selection.toString().trim();
  
  // 부모 컨테이너 내부에 과거 번역된 .wt-translation 클래스가 하나라도 있으면 전체를 빈 텍스트로 처리!
  if (selection.anchorNode.parentElement.querySelector(".wt-translation")) {
    alert("번역이 이미 되어있거나 번역할 내용이 없습니다."); // 거슬리는 alert() 발생
    return;
  }
  
  sendTranslateRequest(text, "inline"); // 텍스트 길이와 무관하게 무조건 inline 고정
}
```

### 발생한 문제점
1. **과도한 부모 DOM 검사로 인한 오탐**: 선택한 텍스트의 상위 컨테이너(`parentElement`) 어딘가에 과거에 번역되었던 태그가 잔존해 있으면, 사용자가 새로 드래그한 영문 원문까지 "이미 번역 완료됨"으로 잘못 판정하여 번역을 거부하고 `"번역이 이미 되어있거나 번역할 내용이 없습니다"`라는 엉뚱한 경고창을 띄움.
2. **긴 문단 인라인 찌그러짐**: 300자 이상의 긴 문단을 드래그해도 길이를 판별하지 않고 무조건 `inline`으로 처리하여, 문장 끝이 브라우저 화면 바깥으로 삐져나가고 레이아웃이 붕괴됨.
3. **작업 흐름을 끊는 `alert()`**: 번역 대상이 아닐 때마다 화면 중앙에 브라우저 모달 창이 떠서 마우스 조작을 가로막음.

---

## 4. 지시 수정: 선택 영역 파서 바로잡기 (Action: Instruction Fix)

* **[지시 수정 1 - 순수 선택 문자열 길이 기반 정밀 판정]**:  
  > "부모 요소의 과거 번역 태그를 조회하지 마라. **사용자가 현재 드래그한 `window.getSelection().toString().trim()`의 순수 문자열(String)만 검증하여, 공백이 아닌 실제 문자가 존재하면 무조건 번역을 수행하도록 검사 로직을 전면 수정해라.**"
* **[지시 수정 2 - 브라우저 alert() 전면 제거 및 50자 기준 듀얼 분기]**:  
  > "화면을 가로막는 `alert()` 경고창을 당장 싹 다 없애고 빈 텍스트는 조용히 무반응(Silent return) 처리해라. **선택한 문자열이 50자를 초과하면 자동 줄바꿈이 지원되는 문단형 플로팅 카드(`wt-selection-card`)로, 50자 이하는 미니 툴팁으로 유연하게 표출해라.**"

---

## 5. 해결 과정 및 결과 (Resolution)

AI가 순수 문자열 기반의 선택 영역 파서와 50자 분기 렌더러를 완성했다.

```javascript
// src/content/selection_handler.js
export function initSelectionTranslation() {
  document.addEventListener("mouseup", handleSelectionTranslation);
}

export function handleSelectionTranslation() {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) return;

  const rawText = selection.toString().trim();
  if (rawText.length === 0) return; // 불필요한 alert() 없이 조용히 종료

  // 부모 DOM 오염 여부와 상관없이 사용자가 드래그한 순수 텍스트 자체를 번역 파이프라인으로 전송
  chrome.runtime.sendMessage({
    action: "translateSelection",
    payload: {
      text: rawText,
      isLongParagraph: rawText.length > 50
    }
  }, (response) => {
    if (response && response.success) {
      const range = selection.getRangeAt(0);
      renderSelectionPopup(range, response.data, rawText.length > 50);
    }
  });
}
```

```javascript
// src/content/selection_renderer.js
export function renderSelectionPopup(range, translatedText, isLongParagraph) {
  const rect = range.getBoundingClientRect();
  const card = document.createElement("div");
  card.className = isLongParagraph ? "wt-selection-card" : "wt-selection-tooltip";
  card.textContent = translatedText;
  
  // 마우스 드래그 좌표 상/하단에 유동 배치
  card.style.top = `${window.scrollY + rect.bottom + 6}px`;
  card.style.left = `${window.scrollX + rect.left}px`;
  
  document.body.appendChild(card);
}
```

더 이상 억울한 "내용 없음" 경고창이 뜨지 않고, 긴 기술 문서의 설명을 마우스로 긁었을 때도 가독성 높은 독립 문단 카드로 번역 결과가 매끄럽게 표출되었다.

---

## 6. 다음 작업 사항과 이유 (Next Work & Why)

기본 번역 엔진인 구글 번역 외에, 고품질 문맥 이해가 가능한 Gemini, OpenAI ChatGPT, Claude, 로컬 프라이버시를 위한 Ollama 등 최신 AI 엔진을 붙이고 싶다는 요구가 커졌다.

**각 AI 엔진의 API 통신 규격을 연동하고, AI가 뱉어내는 지저분한 마크다운과 깨진 JSON을 정제하는 다중 엔진 파이프라인을 구축해야겠다.**
