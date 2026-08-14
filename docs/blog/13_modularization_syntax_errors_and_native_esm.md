# [Part 5] #13. 3,000줄 모놀리스 붕괴와 모듈화 직후 전면 먹통 수습

> **작업 일자**: 2026-08-06  
> **관련 대화**: `5e699ff6-7258-4013-95a7-38598f5eb7eb`, `300bc085-3261-4372-9867-7a6fdf05a4a5` (커밋 `23e19f0`)  
> **핵심 분류**: `새로운 지시`, `지시 번복 (번들러 계획 취소)`, `지시 수정 (비롤백 정상화)`

---

## 1. 요구 사항과 이유 (Requirement & Why)

### 요구 이유
다중 AI 엔진, 듀얼 렌더러, DOM 순회기, 커스텀 사전이 한 파일에 뭉쳐지면서 `content.js`와 `background.js`가 각각 **3,000줄을 넘어섰다.**
이로 인해 2,800번째 줄에서 괄호 오타 하나만 나도 파일 전체가 `SyntaxError`로 죽어버려 크롬 익스텐션이 완전히 멈췄고, 코드 탐색과 디버깅이 불가능한 한계에 부딪혔다.

### 요구 사항
1. 3,000줄짜리 거대 파일을 200줄 내외의 독립 모듈(DOM 수집기, 렌더러, 테마 계산기, API 엔진들)로 깔끔히 쪼갤 것.
2. Webpack이나 Vite 같은 무거운 번들러 없이, 크롬 브라우저의 표준 **네이티브 ES 모듈(`import/export`)**만으로 빌드 단계 없이 동작시킬 것.

---

## 2. 지시 내용 (Instruction)

AI에게 모듈화 리팩토링 및 깃허브 연동을 지시했다:

> **"프로젝트를 GitHub 레포지토리에 올리고, 빌드 도구 없이 브라우저 네이티브 ES 모듈을 사용하여 `src/` 디렉토리 아래로 역할을 분리해 리팩토링해라."**

---

## 3. AI의 구현 결과 및 발생한 대형 장애 (Trial & Error)

AI가 1차 모듈화를 마쳤다고 보고했으나, 브라우저에 띄우자마자 확장 프로그램이 전면 마비되었다.

```text
Uncaught SyntaxError: Cannot use import statement outside a module (at content.js:1)
Uncaught ReferenceError: isOurElement is not defined (at dom_collector.js:45)
```

### 발생한 문제점
1. **Content Script의 import 차단**: 크롬 MV3의 Content Script는 `manifest.json`에서 직접 `"type": "module"`을 지원하지 않아서 상단에 `import`를 쓰면 즉시 문법 에러로 죽어버림.
2. **모듈 간 참조 누락**: 함수들을 분리하면서 `export/import` 바인딩을 빠뜨려 수십 개의 `ReferenceError`가 연쇄 폭발함.

---

## 4. 지시 번복 및 지시 수정 (Action: Reversal & Fix)

AI가 당황하여 *"리팩토링 이전의 단일 파일 정상 상태로 롤백하겠다"*고 제안했으나, 이를 단호히 거부하고 정면 돌파를 명령했다.

* **[지시 번복 - Webpack 번들러 도입 제안 전면 취소]**:  
  > "번들러 쓰자는 계획은 싹 취소한다. 복잡한 빌드 파이프라인과 난독화는 유지보수만 어렵게 만든다. **오직 표준 네이티브 ES 모듈만 고수해라.**"
* **[지시 수정 - 롤백 거부 및 Content Script `boot.js` 동적 로더 강제]**:  
  > "옛날 3,000줄 쓰레기 코드로 롤백하지 마라! **리팩토링 상태를 유지한 채로 문법 오류를 하나씩 잡아라. Content Script는 `manifest.json`에 7줄짜리 `boot.js`를 등록하고, 내부에서 `import(chrome.runtime.getURL('src/content/index.js'))`로 동적 로드하도록 구조를 뚫어라.**"

---

## 5. 해결 과정 및 결과 (Resolution)

AI가 `boot.js` 부트로더와 완벽한 네이티브 ES 모듈 체계를 완성했다 (`commit: 23e19f0`).

```javascript
// src/content/boot.js (Content Script의 네이티브 ESM 진입점)
(async () => {
  const src = chrome.runtime.getURL("src/content/index.js");
  const module = await import(src);
  module.initContentScript();
})();
```

```json
// manifest.json
{
  "background": {
    "service_worker": "src/background/index.js",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["src/content/boot.js"]
    }
  ],
  "web_accessible_resources": [
    {
      "resources": ["src/content/*"],
      "matches": ["<all_urls>"]
    }
  ]
}
```

빌드 명령어(`npm run build`)를 0.1초도 돌릴 필요 없이, 코드를 수정하고 크롬에서 새로고침만 누르면 즉시 반영되는 초경량 네이티브 모듈 구조가 완성되었다.

---

## 6. 다음 작업 사항과 이유 (Next Work & Why)

모듈화로 코드베이스가 가벼워진 후, 단어 사전의 API 비용을 절감하기 위해 Kaikki 및 오픈소스 영영사전 API를 연동해보았으나 CJK 404 에러와 심각한 3~5초 응답 지연이 터져 단어 사전 아키텍처를 재정립해야 하는 과제가 생겼다.

**외부 무료 사전의 한계를 극복하고 0.8초 만에 뜻을 띄우는 단일 LLM 사전 파이프라인을 구축해야겠다.**
