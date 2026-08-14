# [Part 5] #14. Kaikki/외부 사전 R&D 실패와 단일 LLM 0.8초 전환

> **작업 일자**: 2026-08-06 ~ 2026-08-07  
> **관련 대화**: `a4e4cbae-5715-4ef8-aa88-975da2b8c841`, `328191c9-d828-48e8-b769-610b89615a4d` (커밋 `9c9c63b`)  
> **핵심 분류**: `새로운 지시`, `지시 번복 (외부 사전 폐기 & 모드 분리 취소)`

---

## 1. 요구 사항과 이유 (Requirement & Why)

### 요구 이유
단어를 마우스로 드래그할 때마다 LLM API를 호출하면 비용이 들기 때문에, 무료 오픈소스 사전 데이터베이스(Kaikki / Free Dictionary API)를 붙여 비용을 0원으로 줄이려는 R&D를 시도했다.

하지만 실제 테스트 결과는 처참했다:
1. 일본어, 중국어(CJK), 유럽어 단어를 드래그하면 외부 사전 API가 `404 Not Found`를 뱉으며 뻗어버림.
2. `외부 영영사전 조회 ➔ 영문 정의를 구글 번역기로 재번역 ➔ 예문 파싱` 3단 연쇄를 거치느라 팝업 하나 뜨는데 **3~5초 이상 지연**되어 웹서핑 흐름이 완전히 끊김.

### 요구 사항
1. 다국어 지원이 부실하고 느린 외부 무료 사전 API 연쇄 호출을 전면 폐기할 것.
2. 단일 LLM 프롬프트 1회 호출로 발음, 품사, 핵심 뜻 3개, 예문/번역을 **0.8초 만에 한 방에 반환**하는 고속 파이프라인을 구축할 것.
3. 드래그 대상에 따라 단어 모드와 문장 모드로 분리했던 복잡한 UI를 하나의 일관된 플로팅 카드로 통합할 것.

---

## 2. 지시 내용 (Instruction)

AI에게 외부 사전 연동 테스트 및 사전 구조 개편을 지시했다:

> **"Kaikki 등 외부 사전 API를 검토해보고, 연쇄 호출로 인한 딜레이와 404 에러가 심하다면 외부 사전을 폐기하고 단일 LLM JSON 파이프라인으로 전환해라."**

---

## 3. AI의 구현 결과 및 발생한 시행착오 (Trial & Error)

외부 무료 사전을 붙여본 결과, 영어가 아닌 다국어 환경에서 시스템이 무너졌다.

```
[외부 무료 사전 3단 연쇄의 붕괴]
[드래그] ──► [Free Dictionary API] ──(404 에러! CJK 미지원)──► [실패]
                                    ──(영어는 2.5초 지연)────► [구글 번역 2차 호출] ──► [예문 파싱 3차] (총 4.5초 소요!)
```

### 발생한 문제점
* **극심한 반응 지연과 404 속출**: 팝업창에 '검색 중...' 스피너가 4초 동안 돌다가 결국 에러가 뜨거나, 일본어 한자를 드래그했을 때 아무것도 못 찾는 치명적 한계 노출.

---

## 4. 지시 번복: 아키텍처 및 UX 전면 수정 (Action: Instruction Reversal)

외부 무료 사전의 명백한 한계를 확인하고 2건의 지시를 번복했다.

* **[지시 번복 1 - 외부 사전 연쇄 폐기 및 단일 LLM 전환]**:  
  > "무료 외부 사전 쓰자는 계획 전부 취소한다. **외부 사전 다 갖다 버리고, Gemini Flash / GPT-4o-mini에게 프롬프트 1번 던져서 0.8초 만에 JSON 한 방으로 모든 사전 데이터를 가져오게 다시 짜라.**"
* **[지시 번복 2 - 단어 모드 / 문장 모드 분리 취소]**:  
  > "단어 모드와 문장 모드를 굳이 나눠서 팝업을 다르게 띄우자는 이전 지시도 취소한다. **선택 영역 번역 하나로 통일하고, 단어든 문장이든 깔끔한 1개의 사전 카드(`.wt-dictionary-popup`)에서 일관되게 보여줘라.**"

---

## 5. 해결 과정 및 결과 (Resolution)

AI가 단일 LLM 기반의 고속 사전 파이프라인을 완성했다 (`commit: 9c9c63b`).

```javascript
// src/background/prompt_builder.js
export function buildDictionaryPrompt(word, targetLang = "Korean") {
  return `Analyze the word/phrase "${word}" and provide a concise dictionary definition in ${targetLang}.
Respond with raw JSON only (no markdown, no backticks):
{
  "word": "${word}",
  "pronunciation": "IPA or phonetic transcription",
  "pos": "part of speech (noun/verb/adj/etc.)",
  "definitions": ["top 1 meaning", "top 2 meaning", "top 3 meaning"],
  "examples": [
    {
      "original": "concise real-world example sentence",
      "translated": "natural translation in ${targetLang}"
    }
  ]
}`;
}
```

0.8초 만에 어떤 언어의 단어를 드래그하든 발음, 품사, 핵심 뜻 3개, 예문이 담긴 유려한 팝업 카드가 번개처럼 뜨는 극상의 사용자 경험을 확보했다.

---

## 6. 다음 작업 사항과 이유 (Next Work & Why)

단어 사전과 번역문이 완벽해졌으나, 스팀 커뮤니티나 깃허브 다크모드 같은 어두운 웹사이트에 들어가면 번역된 글자 색상이 검은 배경에 묻혀 전혀 보이지 않거나, 반대로 흰색으로 고정하면 밝은 웹페이지에서 글자가 사라지는 다크모드 가독성 붕괴가 발견되었다.

**웹사이트의 상위 DOM 배경색을 역추적하여 최적의 보색 글자색을 100% 자동 계산하는 환경 적응 가독성 엔진을 구축해야겠다.**
