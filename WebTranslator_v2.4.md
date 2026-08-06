# WebTranslator v2.4.0 업데이트 노트

## 1. 개요
이번 v2.4.0 릴리스에서는 유지보수성과 확장성을 극대화하기 위해 코드베이스 내에 산재되어 있던 AI 모델별 프롬프트를 공통 모듈로 완벽히 통합(Consolidation)했습니다. 또한, 로컬 AI 모델(Ollama) 사용자를 위해 옵션 페이지에서 직접 프롬프트를 주입할 수 있는 커스텀 설정 기능이 추가되었습니다.

## 2. 주요 변경 사항

### 2.1. AI 프롬프트 중앙화 및 공통화 (Prompt Consolidation)
- **`buildTranslationPrompt(langName, engineType, customPrompt)` 도입**:
  모든 번역 모델(Gemini, OpenAI, Claude)이 공통된 번역 규칙(1-to-1 매칭, 원본 언어 상관없는 100% 번역, 용어 일관성 등)을 공유하도록 리팩토링했습니다.
  각 엔진의 JSON 제약사항(배열 응답, 객체 응답, 마크다운 방지 등)만 동적으로 덧붙여 코드의 중복을 획기적으로 줄였습니다.
- **`buildDictionaryPrompt(word, langName)` 도입**:
  사전 조회 시 사용되는 지시문(최상위 뜻 3개, 간결한 번역, 예문 첨부 등)을 완전히 단일 함수로 통일하여 향후 새로운 모델 추가 시 쉽게 재사용할 수 있도록 변경했습니다.

### 2.2. Ollama 사용자 정의(Custom) 프롬프트 추가 기능
- **간결한 기본 규칙 유지**: 작은 파라미터를 가진 로컬 모델의 특성을 고려하여 필수 지시사항만 남기고 불필요한 공통 규칙을 제거했습니다.
- **옵션 페이지 UI 개선**: 확장 프로그램 옵션(`options.html`)에 Ollama 전용 '커스텀 번역 프롬프트' 텍스트 영역을 신설했습니다.
- **동적 프롬프트 병합**: 사용자가 옵션에서 저장한 지시사항이 Ollama API 호출 시 자동으로 반영되도록 통신 로직(`background.js`, `api.js`)을 확장했습니다.

## 3. 관련 파일 변경 내역
- `manifest.json`: 익스텐션 버전을 2.4.0으로 판올림.
- `api.js`: 공통 프롬프트 생성기(`buildTranslationPrompt`, `buildDictionaryPrompt`) 구현 및 모델 호출부 전면 교체.
- `background.js`: 확장 프로그램 설정 조회 시 커스텀 프롬프트 속성을 포함하여 `translateWithOllama` 함수로 전달.
- `options.html` / `options.js`: 커스텀 프롬프트 텍스트 에어리어 DOM 및 동기화(storage) 로직 추가.
