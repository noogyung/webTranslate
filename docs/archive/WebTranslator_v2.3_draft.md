# WebTranslator v2.3 — Specification & Release Notes

## 1. Overview
WebTranslator v2.3은 **OpenAI(ChatGPT) 및 Gemini API의 실시간 가용 모델 동적 탐색**, **단어 사전 조회의 OpenAI 단일 호출 패턴 구조 단순화/리팩토링**, **LibreTranslate 사전 조회 지원**, 그리고 **무한 로딩 및 타임아웃 안정이 적용된 성능 강화 마이너 버전**입니다.

---

## 2. Main Features & Key Updates

### 2.1 사전 조회 파이프라인 리팩토링 (`fetchWordDictionary`)
- **단일 API 1회 호출 구조 전환**:
  - 기존 복잡한 가용 모델 탐색 루프, 외부 Free Dictionary API 연쇄 호출, 2차/3차 Google Fallback 연쇄를 전면 제거.
  - OpenAI 사전 방식(`_fetchOpenAIDictionary`)과 동일하게 단 1회의 깔끔한 HTTP 요청으로 사전 데이터 반환 (1초 내외 빠른 팝업 응답).
- **LibreTranslate 전용 사전 지원 (`_fetchLibreDictionary`)**:
  - LibreTranslate 선택 시 Google 사전 API로 넘어가 429 한도 초과 에러가 발생하는 문제를 해결하고, LibreTranslate `/translate` 결과를 사전 데이터 구조로 바로 포맷팅.
- **무한 로딩(검색중...) 방지 타임아웃**:
  - 모든 API fetch에 `AbortSignal.timeout(5s~12s)` 적용 및 429 감지 시 지연 백오프 대기시간 1초대로 단축.

### 2.2 실시간 LLM 가용 모델 탐색 & 최신 모델 반영
- **OpenAI(ChatGPT) 실시간 가용 모델 조회 (`fetchAvailableOpenAIModels`)**:
  - `GET https://api.openai.com/v1/models` 엔드포인트를 호출하여 현재 사용자의 OpenAI API Key로 실제 사용 가능한 GPT 번역 모델 목록을 실시간 조회하고 옵션 페이지에 자동 반영.
  - 옵션 페이지에 **[가용 모델 조회]** 버튼 및 datalist 제공.
- **Gemini 최신 경량 모델(`gemini-flash-lite-latest`) 기본 적용**:
  - 최신 Gemini 경량 모델을 기본값으로 추천 및 자동 매핑 (`getValidGeminiModel`).
  - 사전 조회 시에도 사용자의 API Key로 작동이 확인된 실시간 모델로 페이지 번역과 100% 동일하게 동작하도록 통합.

### 2.3 옵션 페이지 UI/UX 및 안정성 개선
- **Alert 팝업 제거 및 UX 개선**:
  - 불필요한 브라우저 `alert()` 경고 창을 전면 제거하고, 페이지 상/하단 상태 표시줄(`showSaveStatus`)로 조용히 안내.
- **설정 저장 기능 안정성 강화**:
  - DOM 요소 참조 오류(`openaiModelInput`) 수정으로 설정 저장 버튼 마비 현상 완전 해결.

---

## 3. Architecture & File Matrix

| 파일 | 주요 역할 및 v2.3 업데이트 내용 |
| :--- | :--- |
| [`manifest.json`](file:///d:/Noogs/NextCloud/Projects/WebTranslator/manifest.json) | 버전을 `2.3.0`으로 상향 |
| [`api.js`](file:///d:/Noogs/NextCloud/Projects/WebTranslator/api.js) | `fetchAvailableOpenAIModels`, `getValidGeminiModel` 추가 및 사전 조회 단일 fetch 구조 리팩토링 |
| [`content.js`](file:///d:/Noogs/NextCloud/Projects/WebTranslator/content.js) | 사전 조회 시 `libreUrl` 전달 보장 및 스피너 로직 최적화 |
| [`options.html`](file:///d:/Noogs/NextCloud/Projects/WebTranslator/options.html) | ChatGPT 가용 모델 조회 버튼 및 Gemini `gemini-flash-lite-latest` 추천 추가 |
| [`options.js`](file:///d:/Noogs/NextCloud/Projects/WebTranslator/options.js) | OpenAI 가용 모델 조회 바인딩, alert 팝업 제거, 설정 저장 기능 오류 수정 |

---

## 4. Verification Checklist
- [x] manifest.json 버전 2.3.0 반영 확인
- [x] OpenAI(ChatGPT) 가용 모델 조회 버튼 및 API 실시간 호출 확인
- [x] Gemini `gemini-flash-lite-latest` 기본 선택 및 페이지/사전 번역 모델 동기화 확인
- [x] 단어 드래그 시 1초 내외 빠른 사전 팝업 렌더링 확인 (무한 로딩 제거)
- [x] LibreTranslate 모드 선택 시 사전 조회 정상 동작 확인
- [x] 옵션 페이지 [설정 저장] 버튼 정상 동작 및 alert 제거 확인
