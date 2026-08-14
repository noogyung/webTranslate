# [Part 1] #02. 단축키 연타 레이스 컨디션과 스토리지 분리

> **작업 일자**: 2026-07-23  
> **관련 대화**: `77cc2ad9-b95c-40d9-8e3e-f640d42635c2`, `9705f7a4-1d92-4dee-8421-ae36595ba159`  
> **핵심 분류**: `새로운 지시`, `지시 수정 (비동기 제어)`, `지시 보완 (스토리지 분리)`

---

## 1. 요구 사항과 이유 (Requirement & Why)

### 요구 이유
웹페이지에서 `Alt+A` 단축키를 눌러 번역을 요청한 뒤, 마음이 바뀌어 곧바로 다시 `Alt+A`를 눌러 원본으로 복원하려 할 때 문제가 터졌다. 첫 번째 번역 API 응답이 1~2초 뒤에 뒤늦게 도착하면서, 복원된 원본 페이지 위에 번역문이 강제로 덮어씌워져 화면이 엉망진창으로 깨져버렸다.

### 요구 사항
1. 사용자가 번역 중에 `Alt+A`를 다시 누르면 진행 중이던 모든 네트워크 요청과 DOM 렌더링을 즉시 강제 취소(Abort)할 것.
2. 사용자의 번역 설정(API 키, 선호 언어)과 대용량 번역 캐시 데이터를 용도에 맞게 분리 저장할 것.

---

## 2. 지시 내용 (Instruction)

AI에게 비동기 레이스 컨디션 방어 및 스토리지 연동을 지시했다:

> **"Alt+A 단축키를 연타해도 DOM이 깨지지 않도록 상태 머신을 만들고, 설정값과 캐시를 Chrome Storage에 저장하도록 구현해라."**

---

## 3. AI의 구현 결과 및 발생한 시행착오 (Trial & Error)

AI가 코드를 작성했으나 2가지 결함이 나타났다.

```javascript
// AI가 작성한 상태 제어 (오류 코드)
let isTranslating = false;
async function toggleTranslation() {
  if (isTranslating) {
    isTranslating = false; // 단순 플래그 변경만으로는 이미 날아간 fetch 응답을 막을 수 없음!
    return;
  }
  isTranslating = true;
  const result = await chrome.runtime.sendMessage({ action: "translate" });
  renderTranslation(result); // 뒤늦게 도착한 응답이 그대로 DOM에 렌더링됨
}
```

### 발생한 문제점
1. **뒤늦은 응답의 DOM 침범**: 단순 boolean 플래그로는 백그라운드에서 비동기로 실행 중인 HTTP 요청과 파싱 작업을 중단시키지 못함.
2. **스토리지 쿼터 초과 위험**: AI가 번역 캐시 데이터까지 전부 `chrome.storage.sync`에 때려 박아 100KB 용량 제한 에러 발생 위험 초래.

---

## 4. 지시 수정 및 보완 (Action: Fix & Supplement)

* **[지시 수정 - AbortController 기반 강제 취소 상태 머신]**:  
  > "단순 boolean 변수로 때우지 마라. **`AbortController`를 도입하여 단축키가 다시 눌리는 즉시 진행 중인 `fetch` 신호를 강제 `abort()`시키고, `document.body`의 데이터셋(`data-wt-status`)으로 현재 상태(idle, translating, translated)를 엄격히 통제해라.**"
* **[지시 보완 - 스토리지 역할 분리]**:  
  > "API 키나 번역 엔진 같은 사용자 설정은 기기간 동기화되는 `chrome.storage.sync`에 저장하고, 수 메가바이트까지 커질 수 있는 번역문 캐시는 로컬 전용인 `chrome.storage.local`로 완벽히 분리해라."

---

## 5. 해결 과정 및 결과 (Resolution)

AI가 `AbortController`와 분리형 스토리지 구조를 적용했다.

```javascript
// src/content/index.js
let currentAbortController = null;

export async function toggleTranslation() {
  const body = document.body;
  const state = body.dataset.wtStatus || "idle";

  // 번역 중 재입력 시 즉시 중단
  if (state === "translating") {
    if (currentAbortController) currentAbortController.abort();
    body.dataset.wtStatus = "idle";
    revertTranslation();
    return;
  }

  if (state === "translated") {
    revertTranslation();
    body.dataset.wtStatus = "idle";
    return;
  }

  body.dataset.wtStatus = "translating";
  currentAbortController = new AbortController();

  try {
    const texts = collectTextNodes();
    const translated = await requestTranslation(texts, currentAbortController.signal);
    renderTranslation(translated);
    body.dataset.wtStatus = "translated";
  } catch (err) {
    if (err.name === "AbortError") return; // 사용자 취소는 정상 종료
    body.dataset.wtStatus = "idle";
  }
}
```

단축키를 아무리 빠르게 연타해도 이전 비동기 작업이 깨끗이 취소되며 레이아웃이 안전하게 유지되었다.

---

## 6. 다음 작업 사항과 이유 (Next Work & Why)

단축키와 스토리지 기본기를 다지고 v0.1 현황을 점검하던 중, 사용자가 설정한 '단어 사용자 사전(Custom Dictionary)'이 번역 결과에 전혀 반영되지 않고 씹히는 심각한 번역 누락 버그가 발견되었다.

**v0.1 스냅샷을 정리하고, 사용자 사전이 왜 무시되는지 파이프라인 순서를 파헤쳐야겠다.**
