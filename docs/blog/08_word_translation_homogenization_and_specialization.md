# [Part 3] #08. 단어 번역 3사 획일화 문제와 모델별 특화

> **작업 일자**: 2026-08-04 ~ 2026-08-05  
> **관련 대화**: `5ff6d87d-f955-452a-9d83-f748b2756c9f`, `7aedead8-bc6e-48a6-b312-988cd70624f4`  
> **핵심 분류**: `새로운 지시`, `지시 수정 (엔진별 특화 분기)`

---

## 1. 요구 사항과 이유 (Requirement & Why)

### 요구 이유
단어를 마우스로 드래그했을 때 뜨는 사전 팝업에서 이상한 점이 발견되었다. 비싼 API 키를 넣고 Gemini나 GPT를 엔진으로 선택했음에도 불구하고, 무료 구글 번역이나 LibreTranslate를 쓸 때와 똑같이 `game ➔ 경기, 시합`이라는 1줄짜리 단순 번역만 달랑 출력되었다.

LLM의 강점인 **발음기호(IPA), 품사(pos), 빈도순 상위 뜻 3개, 실생활 예문과 한국어 번역**이 전혀 나오지 않고 엔진들이 획일화되어 동작하고 있었다.

### 요구 사항
1. 사용자가 Gemini / OpenAI / Claude 등 LLM을 선택했을 때는 사전 전용 프롬프트를 통해 발음기호, 품사, 핵심 뜻 3개, 예문이 담긴 구조화된 사전 객체(`DictionaryData`)를 생성할 것.
2. Google / LibreTranslate 같은 단순 번역 엔진을 선택했을 때는 가볍고 빠른 기본 뜻 모드로 안정 동작할 것.

---

## 2. 지시 내용 (Instruction)

AI에게 단어 번역 파이프라인의 엔진별 특화 분기를 지시했다:

> **"현재 Gemini, Libre, Google이 단어 번역에서 전부 똑같은 단순 텍스트만 가져오고 있다. LLM 엔진은 발음기호, 품사, 예문이 포함된 풍부한 사전 JSON을 반환하도록 분기해라."**

---

## 3. AI의 구현 결과 및 발생한 시행착오 (Trial & Error)

AI가 코드를 수정했으나 내부 라우팅에서 치명적인 실수를 저질렀다.

```javascript
// AI가 작성한 단어 번역 라우터 (오류 코드)
async function fetchWordDefinition(word, engine) {
  // 엔진 구분 없이 무조건 기존 텍스트 번역 함수로 우회
  const simpleTranslation = await translateSingleText(word, engine);
  return {
    word: word,
    definition: simpleTranslation // 발음기호, 예문, 품사 전부 누락
  };
}
```

### 발생한 문제점
* **단순 텍스트 번역기로의 회귀**: 단어 사전 조회(`lookupWord`) 요청이 들어왔음에도 불구하고, AI가 내부적으로 일반 페이지 번역용 함수(`translateSingleText`)를 그대로 호출하여 단순 번역 텍스트만 채워 넣음.

---

## 4. 지시 수정: 엔진별 특화 분기 (Action: Instruction Fix)

* **[지시 수정 - LLM 전용 사전 빌더(`fetchWordDictionary`) 분리]**:  
  > "단어 조회를 일반 번역기에 던지지 마라. **LLM 엔진(Gemini/GPT/Claude/Ollama)일 때는 `buildDictionaryPrompt(word)`를 통해 구조화된 JSON(`{ pronunciation, pos, definitions, examples }`)을 요청하고, 일반 엔진일 때만 Fallback으로 기본 번역을 제공하도록 파이프라인을 분리해라.**"

---

## 5. 해결 과정 및 결과 (Resolution)

AI가 엔진별 특화 단어 사전 라우팅을 구축했다.

```javascript
// src/background/dictionary.js
export async function lookupWord(word, settings) {
  const { engine, targetLang = "ko" } = settings;

  // 1. LLM 엔진: 고품질 구조화 사전 데이터 생성
  if (["gemini", "openai", "claude", "ollama"].includes(engine)) {
    return await fetchLLMDictionary(word, engine, targetLang, settings);
  }

  // 2. 일반 번역 엔진: 경량 번역 데이터 반환
  const simpleTrans = await translateWithGoogle(word, targetLang);
  return {
    word: word,
    pronunciation: "",
    pos: "단어",
    definitions: [simpleTrans],
    examples: []
  };
}
```

단어를 드래그했을 때 `[ɡeɪm] | 명사 | 1. 경기 2. 게임 / 예문: We won the game (우리는 경기에서 이겼다)` 형태의 완성도 높은 사전 카드가 팝업으로 나타났다.

---

## 6. 다음 작업 사항과 이유 (Next Work & Why)

단어 사전 팝업이 잘 뜨자, 사용자가 단어를 드래그하여 사전 팝업을 띄워둔 상태에서 페이지 전체 번역(`Alt+A`)을 누르면 이전 팝업 레이어가 사라지지 않고 전체 번역 레이어와 겹쳐서 화면이 하얗게 먹통이 되는 상태 충돌 버그가 발생했다.

**선택 영역 번역과 전체 페이지 번역(`Alt+A`) 간의 DOM 상태 충돌을 말끔히 정리해야겠다.**
