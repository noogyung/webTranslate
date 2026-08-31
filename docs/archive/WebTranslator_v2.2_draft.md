# WebTranslator v2.2 — Specification & Release Notes

## 1. Overview
WebTranslator v2.2는 **단어 호버 사전 팝업**, **통합 테마 커스터마이징**, 그리고 **다중 LLM 번역 엔진(ChatGPT, Claude, Ollama 로컬 LLM)** 지원을 추가한 최신 버전입니다.

---

## 2. Main Features & Key Updates

### 2.1 단어 호버 사전 팝업 (`.wt-dictionary-popup`)
- **자동 감지**: 단어 드래그 시 마우스 위치 상단/하단에 차분한 유동 팝업 카드 렌더링
- **다국어 지원**: 유니코드 범위(`\p{L}`) 적용으로 영어, 한자(Chinese), 히라가나/가타카나(Japanese), 한글, Cyrillic 등 전 지원 언어 적용
- **사전 항목 구성**:
  - 발음기호 및 병음/로마지 표기 (`pronunciation`)
  - 어휘 활용 및 품사 정보 (`pos`)
  - **자주 사용되는 상위 3개 핵심 뜻 제한**
  - **실시간 번역된 원문 예문 + 목표 언어 번역 예문** 제공
- **지능형 스마트 필터링 (`isValidDictWord`)**:
  - 순수 숫자/소수점/날짜/통화(`0.00`, `5060`, `$12.99`, `100%`) 검색 팝업 완전 차단
  - API Key, Token, Hash 키(`sk-proj-...`, `AIzaSy...`, `ghp_...`, `bearer ...`) 검색 대상에서 스킵
  - **목표 언어 차단**: 이미 목표 언어(예: 한국어가 목표일 때 한국어 단어)로 되어 있는 드래그는 사전 팝업 자동 스킵

### 2.2 번역문 통합 테마 커스터마이징
- **테마 디자인 시스템**:
  - `--wt-theme-color`: 메인 강조 색상 (기본값: `#818cf8`)
  - `--wt-trans-bg`: 헥스 코드를 자동 계산한 RGBA 12% 투명도 배경색
  - `--wt-trans-border`: 헥스 코드를 자동 계산한 RGBA 45% 테두리/림 글로우
- **설정 항목**:
  - 테마 강조 색상 (Color Picker)
  - 글자 크기 (`85%` ~ `120%`)
  - 기울임꼴 (Italic) 적용 여부
  - **[스타일 초기화]** 버튼으로 원터치 기본값 복원
- **실시간 미리보기**: 옵션 페이지 내 실시간 테마 미리보기 카드 박스 탑재

### 2.3 다중 LLM 번역 엔진 파이프라인
1. **Google Translate (기본 / 무료)**:
   - 빠른 속도, 태그 기반 1:1 블록 번역
2. **Gemini AI (Google)**:
   - Google AI Studio 무료 API Key 연동 (`gemini-2.0-flash`, `gemini-3.6-flash`)
   - 가용 모델 자동 조회 버튼 지원
3. **ChatGPT API (OpenAI)**:
   - `gpt-4o-mini`, `gpt-4o` 고품질 문맥 번역 및 JSON Schema 검증
4. **Claude API (Anthropic)**:
   - `claude-3-5-haiku`, `claude-3-5-sonnet` 품격 높은 문맥 번역
5. **Ollama (로컬 LLM — 100% 무료 무제한)**:
   - 컴퓨터 로컬 서버(`http://localhost:11434`)에서 `qwen2.5`, `llama3`, `gemma2` 등을 비용 없이 무제한 사용
6. **LibreTranslate (개인 서버)**:
   - 자체 호스팅 번역 서버 연동

---

## 3. Architecture & File Matrix

| 파일 | 주요 역할 및 업데이트 내용 |
| :--- | :--- |
| [`manifest.json`](file:///d:/Noogs/NextCloud/Projects/WebTranslator/manifest.json) | MV3 권한 (`contextMenus`, `storage`) 및 백그라운드 SW 등록 |
| [`background.js`](file:///d:/Noogs/NextCloud/Projects/WebTranslator/background.js) | Alt+A 단축키, contextMenu(`WT로 번역`), 다중 엔진 라우팅, 사전 파이프라인 |
| [`api.js`](file:///d:/Noogs/NextCloud/Projects/WebTranslator/api.js) | Google, Gemini, OpenAI, Claude, Ollama, LibreTranslate 호출 및 사전 생성 로직 |
| [`content.js`](file:///d:/Noogs/NextCloud/Projects/WebTranslator/content.js) | 1:1 블록/인라인 DOM 번역, 스마트 사전 필터(`isValidDictWord`), 테마 동적 변수 적용 |
| [`content.css`](file:///d:/Noogs/NextCloud/Projects/WebTranslator/content.css) | 테마 변수 체계(`--wt-theme-color`), 사전 팝업 카드, 스피너, 프로그레스 바 스타일 |
| [`options.html`](file:///d:/Noogs/NextCloud/Projects/WebTranslator/options.html) | 모드 카드, API 입력 필드, 테마 설정 및 실시간 미리보기 샘플 상자 UI |
| [`options.js`](file:///d:/Noogs/NextCloud/Projects/WebTranslator/options.js) | 설정 저장/불러오기, UI 섹션 전환(`updateUI`), 실시간 테마 미리보기 연동 |

---

## 4. Verification Checklist
- [x] Alt+A 페이지 번역 및 우클릭 영역 번역 1:1 레이아웃 보존 확인
- [x] 단어 호버 사전 팝업 렌더링 및 CJK 다국어 정상 동작 확인
- [x] 숫자(`0.00`), API Key(`sk-...`) 드래그 시 사전 스킵 확인
- [x] 이미 목표 언어인 단어 드래그 시 사전 스킵 확인
- [x] 테마 강조 색상 변경 시 번역문 & 사전 팝업 일괄 연동 확인
- [x] ChatGPT, Claude, Ollama, Gemini, Google multi-engine 설정 및 동작 검증 완료
