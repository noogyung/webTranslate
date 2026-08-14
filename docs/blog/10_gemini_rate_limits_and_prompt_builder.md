# [Part 4] #10. Gemini 429 쿼터 초과와 통합 프롬프트 빌더

> **작업 일자**: 2026-08-05 ~ 2026-08-06  
> **관련 대화**: `11c2dea2-1654-4f62-b273-a4c370abe2b7`, `37bafb78-0ac0-4e1a-af49-e3230b742da0`  
> **핵심 분류**: `새로운 지시`, `지시 수정 (프롬프트 중앙화 & 쿼터 제어)`

---

## 1. 요구 사항과 이유 (Requirement & Why)

### 요구 이유
Gemini 무료 API 키를 이용해 수백 줄의 긴 기술 문서를 번역할 때 심각한 문제 2가지가 발생했다:
1. 문단 50개를 5개씩 10번 연속 호출하다가 분당 요청 제한(15 RPM)에 걸려 `429 Resource Exhausted` 에러가 발생하며 페이지 절반이 번역되지 않고 멈춤.
2. Gemini, GPT, Claude, Ollama마다 프롬프트 작성 코드가 파일 곳곳에 중복으로 산재되어 있어, 번역 규칙(1-to-1 매칭, 원문 언어 무관 번역 등)을 하나 수정하려면 4개 파일을 전부 뒤져야 했음.

### 요구 사항
1. 배치 크기를 최적화하고 429 감지 시 지수 백오프(Exponential Backoff)로 자동 대기 후 재요청할 것.
2. 모든 AI 엔진이 공유하는 표준 번역 규칙과 사전 규칙을 단일 프롬프트 모듈(`prompt_builder.js`)로 중앙 집중화할 것.

---

## 2. 지시 내용 (Instruction)

AI에게 프롬프트 조회 및 중앙 통합 리팩토링을 지시했다:

> **"현재 각 AI 모델에게 보내는 프롬프트를 보여주고, 모델마다 중복된 프롬프트 코드를 `buildTranslationPrompt` 단일 함수로 통일해라. 또한 Gemini 429 한도 초과 방어 로직을 추가해라."**

---

## 3. AI의 구현 결과 및 발생한 시행착오 (Trial & Error)

AI가 코드를 가져왔으나 모델별로 규칙이 쪼개져 있었다.

```javascript
// AI가 작성한 프롬프트 (오류 코드: 모델마다 따로따로 작성)
function getGeminiPrompt(texts) { return "Translate array to Korean: " + texts; }
function getOpenAIPrompt(texts) { return "You are translator. Output JSON array: " + texts; }
function getClaudePrompt(texts) { return "Translate strictly: " + texts; }
```

### 발생한 문제점
* **프롬프트 파편화 및 불일치**: OpenAI는 배열로 잘 뱉는데 Claude는 번호 매기기를 하고, Gemini는 존댓말/반말이 섞이는 등 엔진마다 번역 톤앤매너와 JSON 준수율이 엉망으로 갈라짐.

---

## 4. 지시 수정: 프롬프트 중앙화 (Action: Instruction Fix)

* **[지시 수정 - 공통 프롬프트 빌더(`prompt_builder.js`) 단일화]**:  
  > "내가 모델마다 따로따로 프롬프트를 짜라고 한 적 없다! **공통 기본 규칙(1:1 매칭, 뉘앙스 보존, 원본 언어 자동 인식)을 단일 베이스 문자열로 정의하고, 각 엔진의 JSON 요구사항만 덧붙여 반환하는 `buildTranslationPrompt`로 완전히 일원화해라.**"

---

## 5. 해결 과정 및 결과 (Resolution)

AI가 429 방어 로직과 통합 프롬프트 빌더를 완성했다.

```javascript
// src/background/prompt_builder.js
export function buildTranslationPrompt(targetLang, engineType, customPrompt = "") {
  const baseRules = [
    `You are an expert translator. Translate the given JSON array of strings into ${targetLang}.`,
    "Strict Rules:",
    "1. Maintain exact 1-to-1 array element correspondence.",
    "2. Translate 100% of non-target text regardless of original language.",
    "3. Keep code names, variables, HTML tags, and technical terms intact.",
    "4. Return ONLY valid JSON array with NO markdown backticks or commentary."
  ];

  if (customPrompt.trim()) {
    baseRules.push(`User Custom Instructions: ${customPrompt.trim()}`);
  }

  return baseRules.join("\n");
}
```

어떤 모델을 선택하더라도 균일하고 정제된 고품질 JSON 번역 결과를 얻게 되었고, 429 쿼터 에러 시 자동으로 1초 대기 후 재요청하여 안정적인 완료를 보장했다.

---

## 6. 다음 작업 사항과 이유 (Next Work & Why)

프롬프트를 통일하고 잘 쓰던 중, 갑자기 모든 Gemini 번역이 `404 This model models/gemini-2.5-flash is no longer available` 에러를 뿜으며 전면 중단되는 구글의 모델 Deprecated 사태가 터졌다.

**하드코딩된 모델명을 없애고, 구글 API에서 현재 사용 가능한 최신 모델을 실시간으로 긁어오는 동적 탐색 시스템을 도입해야겠다.**
