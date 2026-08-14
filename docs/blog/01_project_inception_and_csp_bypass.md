# [Part 1] #01. 웹 번역 확장 프로그램 기획과 CSP 차단 극복

> **작업 일자**: 2026-07-22 ~ 2026-07-23  
> **관련 대화**: `77cc2ad9-b95c-40d9-8e3e-f640d42635c2`  
> **핵심 분류**: `새로운 지시`, `지시 수정 (오류 바로잡기)`

---

## 1. 요구 사항과 이유 (Requirement & Why)

### 요구 이유
해외 개발 공식 문서(GitHub, MDN)나 스팀(Steam) 상점의 패치 노트를 읽을 때, 크롬 브라우저 기본 번역을 사용하면 웹페이지의 CSS 레이아웃이 완전히 깨져 버튼이 밀려나거나 텍스트가 겹치는 문제가 반복되었다. 또한 번역이 어색할 때 원문과 대조하기가 매우 불편했다.

### 요구 사항
1. 원본 웹페이지의 레이아웃을 100% 보존하면서 원문 아래에 번역문을 별도 태그로 삽입할 것.
2. 키보드 단축키(`Alt+A`) 한 번으로 번역과 원본 복원을 즉시 토글할 수 있을 것.
3. Chrome Manifest V3(MV3) 기반으로 구현할 것.

---

## 2. 지시 내용 (Instruction)

AI 에이전트에게 초기 구조 설계를 지시했다:

> **"Alt+A 단축키를 누르면 웹페이지의 텍스트를 수집하여 번역 API로 전달하고, 원문 아래에 번역 결과를 자연스럽게 렌더링하는 Chrome MV3 확장 프로그램의 기본 골격을 작성해라."**

---

## 3. AI의 구현 결과 및 발생한 시행착오 (Trial & Error)

AI가 코드를 작성해왔으나, 브라우저에 로드하자마자 번역 요청이 완전히 먹통이 되었다.

```javascript
// AI가 작성한 content.js (오류 코드)
async function fetchTranslation(text) {
  // Content Script에서 외부 API 직접 fetch 시도
  const response = await fetch("https://translation-api.example.com/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ q: text, target: "ko" })
  });
  return response.json();
}
```

### 발생한 문제점
* **CSP(Content Security Policy) 및 CORS 보안 차단**: 웹사이트(GitHub, Steam 등)의 엄격한 보안 정책으로 인해 웹페이지 내부에서 실행되는 Content Script가 외부 번역 API 서버로 직접 HTTP 요청을 보내는 것이 브라우저 레벨에서 원천 차단(`Refused to connect...`)됨.

---

## 4. 지시 수정: 오류 바로잡기 (Action: Instruction Fix)

내가 Content Script에서 직접 호출하라고 지시한 적이 없음에도 AI가 보안 모델을 무시하고 직접 통신을 시도했으므로, 아키텍처를 바로잡는 지시 수정을 내렸다.

* **[지시 수정 - Background Service Worker 중계 아키텍처 강제]**:  
  > "Content Script에서 직접 외부 API를 fetch하지 마라. **보안 제약이 없는 Background Service Worker가 외부 API 통신을 전담하게 만들고, Content Script는 `chrome.runtime.sendMessage`로 텍스트만 넘겨받아 렌더링하도록 통신 파이프라인을 전면 수정해라.**"

---

## 5. 해결 과정 및 결과 (Resolution)

AI가 Background 중계 파이프라인으로 구조를 변경했다.

```
[Content Script] ──(chrome.runtime.sendMessage)──► [Background Service Worker]
                                                            │
                                                     (CORS/CSP 제약 없음)
                                                            ▼
                                                    [외부 번역 API 호출]
                                                            │
[Content Script] ◄──(sendResponse: 번역 결과)───────────────┘
```

```javascript
// src/background/index.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "translateBatch") {
    handleTranslation(request.payload)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // 비동기 응답 대기
  }
});
```

GitHub와 Steam 등 보안이 엄격한 웹페이지에서도 차단 없이 번역 API 응답을 수신하는 것을 확인했다.

---

## 6. 다음 작업 사항과 이유 (Next Work & Why)

통신 파이프라인은 뚫었으나, 사용자가 번역 토글 단축키(`Alt+A`)를 빠르게 연타하거나 API 응답이 늦게 올 때 비동기 응답 순서가 꼬여 원문과 번역문이 뒤섞이며 DOM이 파괴되는 치명적인 상태 꼬임 현상이 발견되었다.

**단축키 연타 시 이전 요청을 즉시 폐기하는 비동기 취소 상태 머신과 안정적인 설정 스토리지를 구축해야겠다.**
