# [Part 3] #07. 구글·Gemini·Libre 다중 엔진 연동과 응답 정제

> **작업 일자**: 2026-08-04 ~ 2026-08-05  
> **관련 대화**: `6c086416-a404-4efc-8721-e2eaf43c3dc1`, `55808a27-651d-477c-85be-578faa4cdc44`  
> **핵심 분류**: `새로운 지시`, `지시 수정 (응답 정제 파이프라인)`

---

## 1. 요구 사항과 이유 (Requirement & Why)

### 요구 이유
구글 번역은 무료이고 빠르지만 전문적인 문맥을 이해하지 못해 번역투가 심했다. 최신 생성형 AI인 Google Gemini, OpenAI GPT, Anthropic Claude, 그리고 개인 PC에서 100% 무료로 구동되는 로컬 LLM(Ollama)과 오픈소스 LibreTranslate까지 사용자가 원하는 엔진을 자유롭게 골라 쓸 수 있도록 선택권을 넓혀야 했다.

### 요구 사항
1. Google(기본/무료), Gemini, OpenAI(GPT-4o), Claude, Ollama(로컬), LibreTranslate를 통합 지원할 것.
2. 50개 이상의 문장을 한 번에 번역할 때 API 호출 횟수를 아끼기 위해 JSON 배열(`string[]`) 배치 처리를 적용할 것.
3. LLM이 가끔 뱉어내는 마크다운 백틱(```` ```json ````)이나 불필요한 설명 텍스트를 완벽히 정제하여 순수 번역문만 추출할 것.

---

## 2. 지시 내용 (Instruction)

AI에게 다중 번역 엔진 연동을 지시했다:

> **"Google, Gemini, OpenAI, Claude, Ollama, LibreTranslate를 모두 지원하는 다중 엔진 번역 어댑터를 백그라운드에 작성하고, JSON 배열 기반으로 배치 번역을 수행하도록 구현해라."**

---

## 3. AI의 구현 결과 및 발생한 시행착오 (Trial & Error)

AI가 어댑터를 작성했으나, LLM의 자유분방한 출력 포맷 때문에 번역이 줄줄이 깨졌다.

```javascript
// AI가 작성한 응답 파싱 (오류 코드)
async function translateWithGemini(texts, apiKey) {
  const prompt = `Translate this JSON array to Korean: ${JSON.stringify(texts)}`;
  const response = await callGeminiAPI(prompt, apiKey);
  // AI의 응답을 단순 JSON.parse()로 처리
  return JSON.parse(response.text); // SyntaxError: Unexpected token '`', "```json..."
}
```

### 발생한 문제점
* **LLM 특유의 마크다운 잡음**: LLM이 친절하게도 `Here is your translation:\n```json\n["번역문1", "번역문2"]\n```\nHope this helps!` 형태로 응답을 감싸서 보내는 바람에, `JSON.parse`가 폭사하며 번역이 통째로 날아감.

---

## 4. 지시 수정: 응답 정제 파이프라인 (Action: Instruction Fix)

* **[지시 수정 - 다단계 JSON 정제 함수(`parseAndCleanJson`) 도입]**:  
  > "단순 `JSON.parse`로 끝내지 마라. **정규식을 사용하여 ```` ```json ```` 코드 블록을 먼저 벗겨내고, 문자열의 첫 번째 `[`와 마지막 `]` 사이의 내용만 슬라이싱하여 순수한 JSON 배열만 안전하게 복원하는 방어 파이프라인을 작성해라.**"

---

## 5. 해결 과정 및 결과 (Resolution)

AI가 강력한 정제 함수 `parseAndCleanJson`을 작성했다.

```javascript
// src/background/translator.js
export function parseAndCleanJson(rawString) {
  if (!rawString || typeof rawString !== "string") {
    throw new Error("빈 응답 수신");
  }

  let cleaned = rawString.trim();

  // 1. 마크다운 코드 블록 제거
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");

  // 2. 앞뒤 잡담 텍스트 제거 (첫 [ 와 마지막 ] 추출)
  const startIdx = cleaned.indexOf("[");
  const endIdx = cleaned.lastIndexOf("]");

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    cleaned = cleaned.substring(startIdx, endIdx + 1);
  }

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    // 3. 따옴표 및 이스케이프 깨짐 2차 보정
    const sanitized = cleaned.replace(/\\'/g, "'").replace(/[\u0000-\u001F]+/g, "");
    return JSON.parse(sanitized);
  }
}
```

OpenAI, Claude, 로컬 Ollama까지 어떤 모델을 선택해도 마크다운 잡음 없이 완벽한 1:1 매칭 번역 배열을 받아올 수 있게 되었다.

---

## 6. 다음 작업 사항과 이유 (Next Work & Why)

다중 엔진 연동 후 단어 번역 기능을 테스트하던 중, Gemini, Google, LibreTranslate 3사 엔진이 단어를 번역할 때 발음기호나 상세 예문 없이 단순 한글 뜻만 똑같이 반환하는 획일화 버그가 발견되었다.

**각 엔진의 특성을 살려, LLM은 발음기호와 예문까지 풍부하게 뽑아내고 일반 엔진은 가볍게 동작하도록 단어 번역 파이프라인을 특화해야겠다.**
