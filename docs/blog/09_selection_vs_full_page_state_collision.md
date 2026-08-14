# [Part 3] #09. 선택 영역 번역과 전체 번역(Alt+A) 간 상태 충돌

> **작업 일자**: 2026-08-05  
> **관련 대화**: `1ab22664-44c0-4f67-8d47-c854439e95ee`  
> **핵심 분류**: `새로운 지시`, `지시 수정 (상태 충돌 해결)`

---

## 1. 요구 사항과 이유 (Requirement & Why)

### 요구 이유
사용자가 모르는 단어나 문장을 마우스로 드래그하여 사전/선택 번역 팝업을 띄워놓고 보다가, "그냥 페이지 전체를 번역해서 읽어야겠다" 하고 `Alt+A` 단축키를 눌렀을 때 버그가 터졌다. 기존의 선택 번역 팝업창(`.wt-dictionary-popup`)이 닫히지 않은 채 화면 한가운데 흉하게 남아있고, 그 아래로 전체 페이지 번역 태그들이 겹쳐서 렌더링되면서 글자들이 뒤엉켜버렸다.

### 요구 사항
1. `Alt+A` 전체 번역을 실행하면 현재 화면에 떠 있는 모든 선택 영역 번역 팝업과 단어 사전 카드를 즉시 깨끗하게 닫을 것.
2. 반대로 전체 번역이 켜져 있는 상태에서 특정 단어를 드래그하여 사전을 열어도 전체 번역 레이아웃이 깨지거나 복원되지 않고 독립적으로 공존할 것.

---

## 2. 지시 내용 (Instruction)

AI에게 상호 배타적 상태 제어 및 팝업 정리를 지시했다:

> **"선택 영역 번역 이후 Alt+A를 눌렀을 때 선택 영역 번역 팝업이 사라지지 않고 전체 번역과 충돌하는 문제를 해결해라. 단축키 입력 시 기존 팝업을 모두 닫고 전체 번역이 깔끔하게 실행되도록 수정해라."**

---

## 3. AI의 구현 결과 및 발생한 시행착오 (Trial & Error)

AI가 코드를 작성했으나 이벤트 처리 순서가 어긋났다.

```javascript
// AI가 작성한 토글 로직 (오류 코드)
function togglePageTranslation() {
  // 전체 번역 시작
  startFullPageTranslation();
  // 번역이 다 끝난 뒤에 팝업을 닫으려고 시도 (비동기 지연으로 팝업이 번역 중에 계속 떠있음)
  document.querySelectorAll(".wt-dictionary-popup").forEach(el => el.remove());
}
```

### 발생한 문제점
* **비동기 렌더링 중 팝업 잔존**: 전체 페이지 번역 파서가 DOM을 순회하는 동안 팝업 요소가 여전히 DOM 트리에 남아있어서, 파서가 팝업 내부의 텍스트까지 번역 대상 목록으로 긁어가는 어이없는 재번역 참사가 발생함.

---

## 4. 지시 수정: 상태 충돌 바로잡기 (Action: Instruction Fix)

* **[지시 수정 - 파서 실행 전 선행 소탕(Cleanup-First)]**:  
  > "번역을 시작한 뒤에 지우지 마라. **`Alt+A`가 눌리는 즉시 0.001초 만에 `closeAllPopups()`를 호출하여 화면의 모든 플로팅 팝업 요소를 DOM에서 완전히 제거하고, 그 직후에 깨끗해진 DOM 트리를 수집하여 번역을 시작하도록 순서를 강제해라.**"

---

## 5. 해결 과정 및 결과 (Resolution)

AI가 선행 소탕 함수와 상태 분리 로직을 완성했다.

```javascript
// src/content/popup_manager.js
export function closeAllPopups() {
  const popups = document.querySelectorAll(".wt-dictionary-popup, .wt-selection-card");
  popups.forEach(p => p.remove());
}

// src/content/index.js
export async function toggleTranslation() {
  // 1. 단축키 진입 즉시 모든 활성 팝업 강제 제거
  closeAllPopups();

  const body = document.body;
  const state = body.dataset.wtStatus || "idle";

  if (state === "translating" || state === "translated") {
    revertTranslation();
    body.dataset.wtStatus = "idle";
    return;
  }

  // 2. 깨끗해진 상태에서 전체 페이지 번역 진행
  body.dataset.wtStatus = "translating";
  await executePageTranslation();
}
```

선택 영역 팝업이 떠 있는 상태에서 단축키를 눌러도 팝업이 즉시 부드럽게 닫히며 전체 페이지 번역으로 매끄럽게 전환되었다.

---

## 6. 다음 작업 사항과 이유 (Next Work & Why)

다중 엔진과 팝업 정리를 마치고 본격적으로 Gemini API를 쓰던 중, 문단이 100개 이상인 긴 웹문서를 번역할 때 구글의 무료 티어 제한(15 RPM)에 걸려 `429 Too Many Requests` 에러가 터지고, 모델별로 프롬프트가 제각각이라 번역 품질이 들쑥날쑥해지는 문제가 발생했다.

**Gemini 요청 쿼터를 제어하는 배치 스로틀링과 다중 모델의 프롬프트를 하나로 통일하는 중앙 통합 빌더를 구축해야겠다.**
