# Web Translator v1.0.0 — 공식 통합 기술 명세서 (Specification)

> **버전**: `v1.0.0` (Chrome Web Store 정식 배포 버전)  
> **기준 지식베이스**: [Blog_Core-Archive Knowledge (21편)](file:///d:/Noogs/NextCloud/Projects/Blog_Core-Archive/Knowledge)  
> **최종 수정일**: 2026-08-23

---

## 1. 프로젝트 개요 (Overview)

[Web Translator](file:///d:/Noogs/NextCloud/Projects/WebTranslator)는 웹 서핑 중 외국어 문서를 읽을 때 브라우저 기본 번역의 레이아웃 파괴 문제를 극복하고, 원본 웹페이지의 디자인과 텍스트를 보존하면서 인라인 번역문과 단어 사전을 제공하는 Chrome Manifest V3(MV3) 기반 확장 프로그램입니다.

* **핵심 기능**:
  1. **페이지 전체 인라인 번역 (`Alt+A`)**: 원본 레이아웃을 보존하며 `원문(번역문)` 형태로 직관적 렌더링.
  2. **선택 영역(드래그) 단어 & 문장 사전 팝업**: 1초 내외 빠른 응답으로 발음기호, 품사, 핵심 뜻 3개, 실생활 예문 제공.
  3. **다중 LLM 및 번역 엔진 지원**: Google 번역(무료 기본), Gemini AI, OpenAI(ChatGPT), Claude, Ollama(로컬 LLM), LibreTranslate.
  4. **적응형 다크모드 & 테마 커스터마이징**: 웹사이트 배경색에 따라 명도를 자동 보정하는 인라인 가독성 엔진.
  5. **툴바 빠른 설정 팝업 (`optionPopup`)**: 브라우저 액션 클릭으로 즉시 번역 엔진 및 목표 언어 변경.
  6. **사용자 사전 및 CSV 관리**: 옵션 페이지를 통한 CSV 단어장 내보내기/가져오기 완비.

---

## 2. 시스템 아키텍처 및 디렉토리 구조

Chrome MV3의 엄격한 보안 모델(CSP)과 성능 최적화를 위해 번들러 없는 **순수 네이티브 ES 모듈(Native ESM)** 구조로 설계되었습니다.

```
WebTranslator/
├── manifest.json                        # MV3 설정 (version: 1.0.0, storage 최소 권한)
├── _locales/ (ko, en)                   # 다국어 메시지 리소스
├── icons/ (16, 48, 128px)               # 단일 목적 지구본 아이콘 에셋
├── assets/
│   └── store/                           # 크롬 웹스토어 등록용 스크린샷 에셋
├── scripts/                             # 패키징 및 스크린샷 헬퍼 스크립트
├── Build/                               # 빌드 및 배포 Zip 아카이브 (Build/{version}/)
└── src/                                 # 네이티브 ES 모듈 및 UI 소스 코드
    ├── background/                      # Service Worker (네트워크 통신 전담)
    │   ├── index.js                     # SW 진입점 (ESM)
    │   ├── messageHandler.js            # Content/Popup 메시지 디스패처
    │   ├── translationService.js        # 번역 API 라우터
    │   ├── imageService.js              # Referer 변조 및 Base64 이미지 변환
    │   ├── keyboard.js                  # 단축키(Alt+A) 리스너
    │   └── install.js                   # 초기 설치 및 컨텍스트 초기화
    ├── content/                         # Content Script (DOM 파싱 및 렌더링)
    │   ├── boot.js                      # 동적 import() 부트로더
    │   ├── index.js                     # Content Script 메인 오케스트레이터
    │   ├── content.css                  # 번역문, 툴팁, 사전 팝업, 다크모드 적응형 스타일
    │   ├── dom.js                       # DOM 트리 순회, 텍스트 수집, 고아 노드 래핑
    │   ├── translation.js               # 비파괴 듀얼 렌더러 (wt-inline, wt-block)
    │   ├── dictionary.js                # 드래그 감지, 사전 팝업 UI 렌더링
    │   ├── image/                       # v2.0 이미지 번역 전담 모듈 (예정)
    │   ├── observer.js                  # MutationObserver 300ms 디바운스 배치 큐
    │   ├── state.js                     # 3단계 상태 머신 (idle, translating, translated)
    │   ├── ui.js                        # 상태 표시기 및 프로그레스 바
    │   ├── utils.js                     # 10% 한글 임계값 및 CJK 유니코드 필터
    │   └── api.js                       # Background SW 메시지 통신 래퍼
    ├── api/                             # 번역 엔진 API 클라이언트 레이어
    │   ├── index.js                     # API 통합 인터페이스 & cleanJsonResponse
    │   ├── constants.js                 # 기본 엔드포인트 및 모델 상수
    │   ├── dictionary.js                # 단일 LLM 사전 파이프라인
    │   ├── prompts.js                   # 공통 4대 번역 철칙 & 중앙 프롬프트 빌더
    │   ├── vision.js                    # Gemini Multimodal 기반 비전 처리 API
    │   └── engines/                     # 개별 번역 엔진 구현체
    │       ├── google.js                # Google 비공식 API
    │       ├── gemini.js                # Gemini API (배치 전송 및 지수 백오프)
    │       ├── openai.js                # OpenAI API (가용 모델 조회 포함)
    │       ├── claude.js                # Anthropic Claude API
    │       ├── ollama.js                # 로컬 Ollama API (커스텀 프롬프트 지원)
    │       └── libre.js                 # LibreTranslate 자체 호스팅 API
    ├── options/                         # 메인 옵션 페이지
    │   ├── options.html                 # 설정 UI 뷰
    │   ├── options.css                  # 설정 페이지 스타일
    │   ├── index.js                     # 설정 UI 이벤트 및 가용 모델 인스펙터
    │   ├── storage.js                   # chrome.storage.sync 래퍼
    │   ├── dictionary.js                # 사용자 사전 CRUD 및 CSV Import/Export
    │   └── ui.js                        # 테마 실시간 미리보기 및 탭 제어
    └── popup/                           # 툴바 빠른 설정 팝업
        ├── popup.html                   # 팝업 UI 뷰
        ├── popup.css                    # 팝업 스타일
        └── index.js                     # 실시간 스타일 프리뷰 및 빠른 엔진 변경
```

---

## 3. 핵심 기술 메커니즘 (21편 지식베이스 기반)

### 3.1 MV3 보안 격리 및 Background 중계 파이프라인 (#01)
* Content Script는 방문 웹사이트의 CSP(Content Security Policy) 제약을 받아 외부 API 직접 호출이 차단됨.
* Background Service Worker가 네트워크 통신을 전담하며, Content Script는 `chrome.runtime.sendMessage`를 통해 비동기로 데이터를 수신함.

### 3.2 비동기 취소(`AbortController`) 및 3단계 상태 머신 (#02)
* 단축키(`Alt+A`) 연타 시 발생하는 레이스 컨디션을 방지하기 위해 `AbortController.abort()`로 브라우저 네트워크 요청을 물리적으로 즉시 중단.
* `document.body.dataset.wtStatus`에 `idle`, `translating`, `translated` 3단계 상태를 부여하여 중복 실행 방지.
* `chrome.storage.sync`(100KB 설정)와 `chrome.storage.local`(대용량 번역 캐시)을 물리적으로 분리.

### 3.3 사후 사전 치환(`applyLocalDictionary`) 및 자가 오염 방지 (`isOurElement`) (#03)
* 원문을 사전 단어로 선치환하면 번역 문맥이 파괴되므로, API에는 온전한 원문을 보내고 번역 결과 수신 후 사전을 덧씌우는 **사후 치환 파이프라인** 적용.
* 확장 프로그램이 삽입한 번역 노드(`.wt-translation`)를 텍스트 파서가 재수집하지 않도록 `isOurElement` 가드로 무한 중첩 증식 차단.

### 3.4 `display: contents` 가상 래퍼 및 1:1 색상 보존 (#04)
* Flex/Grid 부모 하위의 고아 텍스트 노드(TextNode)를 일반 태그로 감싸면 레이아웃이 붕괴되므로, 박스 모델이 생략되는 `display: contents` 기반의 `.wt-text-wrapper` 가상 래퍼 적용.
* 상위 `<a>` 태그의 색상 오상속을 방지하기 위해 직속 `parentElement`의 `computedStyle` 색상만 1:1로 추출하여 적용.

### 3.5 비파괴 듀얼 렌더러 (Inline vs Block) (#05)
* 서식 컨텍스트 불일치로 인한 버튼 깨짐을 방지하기 위해, 버튼/태그 등 인라인 요소는 `wt-inline`(`원문(번역)`), 문단(p, div)은 `wt-block`으로 자동 분기.
* `innerHTML` 덮어쓰기 대신 독립 `<span>` 노드를 덧붙이는 **비파괴적 노드 추가(Non-destructive Append)**로 SVG 아이콘과 이벤트 리스너 보존.

### 3.6 순수 문자열 기반 선택 영역 파서 (#06)
* `window.getSelection()` 순회 시 부모 DOM 오염 여부와 무관하게 사용자가 드래그한 순수 문자열(`rawText.length > 0`)만 검증하여 번역.
* 불필요한 브라우저 `alert()`를 전면 배제하고, 짧은 단어는 미니 툴팁, 긴 문단(50자 초과)은 플로팅 카드로 분기 표출.

### 3.7 LLM 다단계 JSON 정제 파이프라인 (`cleanJsonResponse`) (#07)
* LLM이 반환하는 마크다운 코드블록(````json ... ````), 서문 텍스트, 제어 문자(`\n`, `\r`, `\t`)를 정규식으로 안전하게 추출 및 복구하여 `JSON.parse` 실패율 최소화.

### 3.8 단어 사전 전용 LLM 파이프라인 (#08, #14)
* 일반 문장 번역과 단어 조회를 완전히 분리.
* 외부 무료 사전 API(Kaikki 등)의 CJK 404 및 지연을 극복하기 위해, **단 1회의 LLM 호출**로 발음기호, 품사, 핵심 뜻 상위 3개, 실생활 예문 1:1 번역을 정형화하여 1초 내 반환.

### 3.9 선행 소탕(Cleanup-First) 및 상태 격리 (#09)
* 전체 번역(`Alt+A`) 시작 직전 `closeAllPopups()`를 동기 실행하여 화면의 모든 플로팅 요소를 제거한 뒤 깨끗한 DOM만 수집.
* 전체 번역 중에도 개별 단어 드래그 사전 팝업이 부드럽게 공존하도록 독립 라이프사이클 유지.

### 3.10 MutationObserver 300ms 디바운스 배치 큐 & 프롬프트 빌더 (#10)
* 동적 SPA 페이지(YouTube, X 등)에서 요청 폭주(429)를 방지하기 위해 300ms 디바운스 및 배치 큐(`dynamicQueue`)로 20~30개 단위 일괄 전송.
* 중앙 프롬프트 빌더([`src/api/prompts.js`](file:///d:/Noogs/NextCloud/Projects/WebTranslator/src/api/prompts.js))에 공통 4대 번역 철칙(1:1 매칭, 원문 언어 무관 번역, 태그 원형 보존, 순수 JSON) 일원화.

### 3.11 가용 모델 인스펙터 도구 (#11)
* 런타임 자동 탐색 시 발생하는 쿼터 고갈 및 유료 과금 위험을 방지하기 위해, 런타임 자동 탐색을 폐기하고 옵션 페이지 내 수동 [가용 모델 조회] 도구로 분리.

### 3.12 실패 배치 스킵 기반 장애 격리 (Fault Isolation) (#12)
* 지수 백오프(1초 $\rightarrow$ 2초) 기반 차등 지연 재시도 큐(최대 3회) 운영.
* 최종 실패한 특정 배치만 원본으로 건너뛰고(Skip), 나머지 전체 페이지 번역을 중단 없이 완주.

### 3.13 네이티브 ESM 및 `boot.js` 동적 로더 (#13)
* Content Script의 `type: module` 미지원 제약을 해결하기 위해 7줄짜리 [`src/content/boot.js`](file:///d:/Noogs/NextCloud/Projects/WebTranslator/src/content/boot.js)에서 `import(chrome.runtime.getURL('src/content/index.js'))`로 동적 로드.
* 번들러 없는 무빌드(No-Build) 개발 환경 구축.

### 3.14 적응형 테마 엔진 (`getEffectiveBackgroundColor`) (#15)
* 상위 DOM을 재귀 탐색하여 투명 배경을 뚫고 실제 시각적 배경색을 산출.
* 배경 명도(Luminance)에 따라 글자색, 테두리, 하이라이트 투명도를 자동 반전하는 CSS 변수 시스템(`--wt-trans-bg`, `--wt-trans-border`) 구축.
* 4종 인라인 가독성 커스텀(강조 색상, 크기, 이탤릭, 테마 모드) 지원.

### 3.15 툴바 팝업 실시간 메시징 및 이벤트 분리 (#16)
* `optionPopup` 조작 시 웹페이지 번역문에 즉시 반영되는 `updateStylePreview` 실시간 메시징 지원.
* 스토리지 쓰기 쿼터(120회/분) 초과 방지를 위해 슬라이더 조작 시 `input`(실시간 프리뷰)과 `change`(스토리지 저장) 이벤트 분리.

### 3.16 스마트 드래그 필터링 (10% 한글 임계값 & CJK 보정) (#19)
* 한국어 텍스트 복사 시 사전 팝업 방해를 제거하기 위해 한글 유니코드 비율이 10%를 초과하면 사전 조회를 즉시 스킵 (`isAlreadyTargetLang`).
* 일본어/중국어 등 CJK 외국어는 유니코드 속성(`\p{L}`) 정규식으로 유효 단어 정밀 판별 (`isValidDictWord`).

### 3.17 최소 권한 원칙 (Principle of Least Privilege) 및 배포 (#20, #21)
* 스토어 심사 통과를 위해 불필요한 권한(`contextMenus`, `scripting`, `activeTab`)을 전면 삭제하고 오직 **`permissions: ["storage"]`** 단일 권한만 유지.
* 화이트리스트 기반 무의존성 자동 패키징 스크립트([`scripts/package.js`](file:///d:/Noogs/NextCloud/Projects/WebTranslator/scripts/package.js)) 구축.

---

## 4. 버전별 기능 매트릭스 및 현황

| 기능 영역 | v1.0.0 (현재 배포판) | v2.0 (차기 목표) | v3.0 (미래 목표) |
| :--- | :---: | :---: | :---: |
| 웹페이지 인라인 텍스트 번역 (`Alt+A`) | ✅ 지원 | ✅ 지원 | ✅ 지원 |
| 드래그 단어/문장 사전 팝업 | ✅ 지원 | ✅ 지원 | ✅ 지원 |
| 다중 LLM 엔진 (Gemini/GPT/Claude/Ollama) | ✅ 지원 | ✅ 지원 | ✅ 지원 |
| 다크모드 적응형 테마 엔진 | ✅ 지원 | ✅ 지원 | ✅ 지원 |
| 툴바 빠른 설정 팝업 (`optionPopup`) | ✅ 지원 | ✅ 지원 | ✅ 지원 |
| 옵션창 CSV 단어장 Import/Export | ✅ 지원 | ✅ 지원 | ✅ 지원 |
| **마우스 호버 기반 이미지 번역 (Vision AI)** | ❌ 미지원 (2.0 전용) | 🚀 **단일 100% 집중 개발** | ✅ 지원 |
| **PDF 문서 인라인 번역** | ❌ 미지원 | ❌ 미지원 | 🚀 **3.0 개발 목표** |
| 웹페이지 내 인라인 단어 직접 수정 | ⏳ 백로그 (버전 미정) | ⏳ 백로그 | ⏳ 백로그 |
