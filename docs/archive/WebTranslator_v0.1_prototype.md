# WebTranslator v0.1 — 현황 문서

> 작성일: 2026-07-23  
> 상태: **v0.1 스냅샷** — 이후 작업은 이 문서를 기준으로 진행

---

## 1. 프로젝트 개요

Chrome MV3 기반 확장 프로그램. 웹 페이지의 텍스트를 선택한 번역 엔진으로 번역하며,
원본 텍스트는 보존하고 번역 결과를 별도 `<span>`으로 표시한다.

**단축키**: `Alt+A` — 번역 토글 (재실행 시 원본 복원)  
**설정 접근**: 아이콘 클릭 → 옵션 페이지

---

## 2. 파일 구조

```
WebTranslator/
├── manifest.json      MV3 매니페스트
├── background.js      Service Worker: 단축키·메시지 중계·캐시
├── content.js         Content Script: DOM 분석·번역 적용
├── content.css        번역 결과 스타일
├── api.js             번역 엔진 API 래퍼 (Google / Gemini / LibreTranslate)
├── options.html       설정 페이지 UI
├── options.js         설정 페이지 로직
├── options.css        설정 페이지 스타일
├── _locales/          i18n 로케일
└── icons/             아이콘 (16·48·128px)
```

---

## 3. 아키텍처

```
[Alt+A] → background.js
              │
              ├─ getSettings (chrome.storage.sync)
              ├─ getCache (chrome.storage.local)
              │
              └─ content.js
                    │
                    ├─ collectTextBlocks(document.body)
                    │     └─ walk() → DOM 트리 분석
                    │         ├─ wrapTextRuns() → 고아 텍스트 래핑
                    │         └─ getDirectTextRuns() → 런 수집
                    │
                    ├─ translateBlocks()
                    │     ├─ needsRemoteTranslation() → 필터링
                    │     ├─ applyLocalDictionary() → 사전 치환
                    │     ├─ 캐시 적중 → applyTranslation()
                    │     └─ API 배치 → background.js → api.js
                    │
                    └─ applyTranslation()
                          ├─ dual-inline → <span class="wt-translation wt-inline">(번역)</span>
                          └─ dual-block  → <span class="wt-translation wt-block">번역</span>
```

---

## 4. 주요 기능

### 4-1. 번역 엔진 (api.js)

| 엔진 | 설명 | 비용 |
|---|---|---|
| Google Translate (기본) | translate.googleapis.com 비공식 API | 무료 (제한 있음) |
| LibreTranslate | 로컬 서버 자체 호스팅 | 무료 |
| Gemini API | Google Gemini 모델 | 유료 (API 키 필요) |

### 4-2. 표시 모드

| 모드 | 동작 |
|---|---|
| Dual (기본) | 원문 보존 + 번역 span 추가 |
| Replace | 원문을 번역문으로 교체 |

Dual 모드는 요소 유형에 따라 자동 분기:
- **Inline** (버튼, 짧은 텍스트, SPAN 등): `원문(번역)` 형태로 같은 줄에
- **Block** (단락, DIV 등): 원문 아래 별도 블록으로

### 4-3. 스마트 필터링 (needsRemoteTranslation)

번역 API 요청 전 아래 패턴 제거 후 의미 있는 문자가 2개 이상 남는지 확인:

- 단위: MB, KB, GB, TB, px, em, %, am, pm
- 시간: 6:08am, 7:51 PM
- 날짜 (일 월 [연]): 16 Jul, 2025 / 27 Jun
- 날짜 (월 일 연): July 22, 2026
- 시간대: AM, PM, ET, UTC, JST, KST, PST, EST
- 기호: @, 콤마, 순수 숫자

### 4-4. 사용자 사전 (customDict)

- 옵션 페이지에서 `원문 → 번역` 쌍을 테이블로 관리
- chrome.storage.sync에 customDict: [{original, translated}] 형태로 저장
- **현재 동작 방식**: needsRemoteTranslation()에서 사전 단어를 제거 후 잔여 텍스트로 원격 필요 여부 판단. 원격 불필요 시에만 applyLocalDictionary()로 치환.

### 4-5. 캐시

- **메모리 캐시** (localCache): 세션 중 중복 API 호출 방지
- **영구 캐시** (chrome.storage.local): 언어별 wt_cache_ko 키로 저장
- **캐시 초기화**: 옵션 페이지 → "캐시 초기화" 버튼

### 4-6. Lazy Translation

- 뷰포트 밖 요소는 IntersectionObserver로 스크롤 시점에 지연 번역
- 옵션에서 ON/OFF 가능

### 4-7. MutationObserver

- 번역 완료 후 동적으로 추가된 DOM 요소를 감지하여 자동 번역

---

## 5. CSS 클래스 체계

| 클래스 | 역할 |
|---|---|
| .wt-text-wrapper | 고아 텍스트 런 래퍼 (display: contents) |
| .wt-translation.wt-inline | 인라인 번역 span (white-space: nowrap) |
| .wt-translation.wt-block | 블록 번역 span (아래 줄, 보라색 배경) |
| .wt-dual-inline | (하위 호환) 구 인라인 클래스 |
| .wt-dual-block | (하위 호환) 구 블록 클래스 |
| .wt-status-indicator | 우상단 번역 진행 상태 표시기 |
| .wt-spinner | 로딩 스피너 |

**data 속성**:
- data-wt-original — 번역 전 innerHTML 백업 (복원용)
- data-wt-translated — dual-inline / dual-block / replaced / local

---

## 6. 알려진 버그 및 현재 미흡한 점

### [P0 버그] 사용자 사전이 대부분의 경우 적용되지 않음

**재현**: 옵션에서 `Change Notes → 변경 노트` 등록 후 번역 시 반영 안 됨.

**원인 분석**:

translateBlocks() 흐름:

```
1. needsRemoteTranslation(text, dict)
   → 사전 단어 제거 후 잔여 문자 2개 이상? YES → true (원격 필요)
   → 사전 단어만 있어도 영어 단어이므로 잔여 문자 충분 → 계속 true

2. needsRemote === true 이므로 로컬 처리 분기 건너뜀

3. localCache 없으면 → unCachedBlocks → API 전송

결과: applyLocalDictionary()가 !needsRemote 분기에만 있어서
      영어 텍스트는 항상 needsRemote=true → 사전 적용 불가
```

**수정 방향**:
```js
// API 결과 수신 후 사전을 덧씌우는 방식
let transText = result.translations[idx];
transText = applyLocalDictionary(transText, dict);
// 또는 applyLocalDictionary를 원문에 먼저 적용 후 나머지만 API로 전송
```

---

### [P0 버그] isOurElement()가 새 클래스를 인식 못함

**원인**: MutationObserver의 isOurElement()가 wt-dual-inline, wt-dual-block만 체크.
새 클래스 wt-translation은 미포함 → 번역 결과 span이 다시 번역 대상으로 인식될 위험.

**수정 방향**: `cl.contains("wt-translation")` 추가.

---

### [P0 버그] 로컬 번역 경로가 새 span 방식을 우회함

!needsRemote 분기에서 로컬 사전 치환 결과를 `element.textContent = localTranslated`로 직접 덮어씀.
applyTranslation()을 거치지 않아 data-wt-original 백업 없고 복원 불가 + 스타일 없음.

**수정 방향**: 로컬 번역도 applyTranslation()을 경유하도록 통일.

---

### [P1 미흡] needsRemoteTranslation 날짜 패턴 오탐 가능성

`\b[a-z]{3,9}\s+\d{1,2},?\s+\d{4}\b` 패턴이 영어 단어 + 숫자 조합인 일반 문장도 일부 걸러낼 수 있음.
예: "about 10 items 2024" 등 엣지 케이스 검토 필요.

---

### [P1 미흡] wt-text-wrapper 내 단락 전체 번역 품질

단락(p)에 링크(a)가 섞인 경우:
- wt-text-wrapper로 묶어 전체를 번역 → API에 링크 텍스트 포함해 전송
- 링크 href는 보존되나 표시 텍스트가 번역됨

---

### [P2 미흡] LibreTranslate 번역 품질

Favorite, Share, Posted 등 짧고 문맥 없는 단어를 엉뚱하게 번역.
현실적 해결책: 사용자 사전에 직접 등록 (P0 사전 버그 수정 후 활용 가능).
근본 해결책: Gemini 엔진 사용.

---

### [P2 미흡] 번역 후 복원 시 wt-text-wrapper 잔존 가능성

revertTranslation()에서 innerHTML 복원과 래퍼 span 해제가 별도로 동작해
타이밍 이슈로 래퍼가 잔존할 수 있음.

---

### [정상 작동] 핵심 기능 목록

- Alt+A 단축키 번역 ON/OFF 토글
- 버튼/링크/단락 분리 번역 (병합 없음)
- 날짜 27 Jun @ 7:51am, July 22, 2026 스킵
- MB, GB 등 단위 번역 스킵
- 번역 결과 span 분리 (white-space: nowrap 줄 중간 끊김 없음)
- 뷰포트 우선 번역 (Lazy)
- 영구 캐시 (언어별)
- 캐시 초기화 버튼
- 원본 복원 기능
- MutationObserver 동적 콘텐츠 감지

---

## 7. v0.2 우선 작업 목록

| 우선순위 | 항목 | 난이도 |
|---|---|---|
| P0 (필수) | 사용자 사전 적용 로직 재설계 (API 결과에 사전 덧씌우기) | 낮음 |
| P0 (필수) | isOurElement()에 wt-translation 클래스 추가 | 매우 낮음 |
| P0 (필수) | 로컬 번역 경로도 applyTranslation() 경유하도록 통일 | 낮음 |
| P1 (중요) | 사용자 사전에 정규식 지원 추가 | 중간 |
| P1 (중요) | 번역 결과 품질 피드백 UI (엄지 UP/DOWN) | 중간 |
| P2 (개선) | 사이트별 번역 설정 저장 (도메인 단위 ON/OFF) | 높음 |
| P2 (개선) | 단어 단위 hover 번역 (마우스 올리면 팝업) | 높음 |
| P3 (옵션) | 번역 결과 색상/폰트 크기 사용자 커스터마이징 | 낮음 |
