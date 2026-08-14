# [Part 1] #03. v0.1 스냅샷과 사용자 사전 적용 순서 버그

> **작업 일자**: 2026-07-23  
> **관련 대화**: `0e7353fc-0a92-4f5c-b737-ac6a59afcf92`, `79b65bfd-007d-47e0-92d4-e86b96f3239c`  
> **핵심 분류**: `새로운 지시`, `지시 수정 (파이프라인 역전 바로잡기)`

---

## 1. 요구 사항과 이유 (Requirement & Why)

### 요구 이유
게임이나 개발 문서에는 'Mod', 'Loadout', 'Branch' 같은 고유명사나 특정 번역을 유지해야 하는 전문 용어가 많다. 사용자가 옵션에서 `Mod -> 모드`, `Issue -> 이슈`라고 지정해 두었는데, 번역기를 돌리면 `Mod -> 수정`, `Issue -> 발행`처럼 AI 번역기가 멋대로 엉뚱한 단어로 뭉개버렸다.

### 요구 사항
1. 사용자가 등록한 단어 사전(Custom Dictionary)이 최종 번역 결과에 100% 무조건 반영될 것.
2. 현재까지의 v0.1 기본 기능을 스냅샷 문서([`WebTranslator_v0.1.md`](file:///d:/Noogs/NextCloud/Projects/WebTranslator/docs/WebTranslator_v0.1.md))로 명확히 정리할 것.

---

## 2. 지시 내용 (Instruction)

AI에게 v0.1 상태 정리 및 사전 기능 수정을 지시했다:

> **"현재 프로젝트 상태를 점검해 문서로 정리하고, 사용자가 입력한 커스텀 사전이 번역문에 강제 적용되도록 로직을 수정해라."**

---

## 3. AI의 구현 결과 및 발생한 시행착오 (Trial & Error)

AI가 코드를 고쳐왔으나 여전히 사전 단어가 엉뚱하게 번역되었다.

```javascript
// AI가 작성한 사전 적용 순서 (오류 코드)
function prepareTextForTranslation(rawText, userDict) {
  let preprocessed = rawText;
  // 1. 원문을 번역 API로 보내기 전에 사전을 먼저 치환!
  for (const [key, val] of Object.entries(userDict)) {
    preprocessed = preprocessed.replaceAll(key, val); // 'Mod' -> '모드'
  }
  // 2. 이미 한글로 바뀐 문장을 번역 API로 전송
  return sendToTranslateAPI(preprocessed); // 번역기가 한글 '모드'를 다시 'fashion'이나 'mode'로 오역
}
```

### 발생한 문제점
* **사전 치환의 역효과**: 원문 영어를 번역기로 보내기 '전'에 사전 단어를 한글로 바꿔치기하니, 번역 엔진(Google/Gemini)이 한영 혼용 문장을 보고 문맥을 오해하여 한글 단어를 다시 영어로 번역하거나 엉뚱한 조사를 붙여 문장을 파괴함.

---

## 4. 지시 수정: 파이프라인 역전 바로잡기 (Action: Instruction Fix)

내가 원문에 억지로 치환하라고 지시한 적이 없음에도 AI가 파이프라인 순서를 거꾸로 배치했으므로, 올바른 시점을 강제했다.

* **[지시 수정 - 번역 API 응답 '사후 덧씌우기(Post-replacement)' 전환]**:  
  > "원문을 건드려서 번역기로 보내지 마라. **번역 API에는 깨끗한 원문 전체를 온전히 보내서 문맥 번역을 받아오고, 도착한 최종 번역 결과물에 사용자의 사전을 정규식 단어 경계(`\b`)로 덧씌우는(Post-process) 방식으로 순서를 완전히 바꿔라.**"
* **[지시 보완 - `isOurElement` 방어막 추가]**:  
  > "우리가 삽입한 `.wt-translation` 태그를 파서가 다시 긁어가서 재번역하지 않도록 요소 판별기에 자체 클래스를 필수 등록해라."

---

## 5. 해결 과정 및 결과 (Resolution)

AI가 사후 덧씌우기 함수 `applyLocalDictionary`를 구현했다.

```javascript
// src/content/filter.js
export function applyLocalDictionary(translatedText, userDict) {
  if (!userDict || userDict.length === 0) return translatedText;
  let result = translatedText;

  for (const item of userDict) {
    if (!item.original || !item.translated) continue;
    // 사후 치환: 정규식 특수문자 이스케이프 후 대소문자 무시 치환
    const escaped = item.original.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escaped, "gi");
    result = result.replace(regex, item.translated);
  }

  return result;
}
```

번역 API가 문맥을 해치지 않고 전체 문장을 번역한 뒤, 사용자가 원한 전문 용어만 정확히 지정 단어로 덮어씌워졌다.

---

## 6. 다음 작업 사항과 이유 (Next Work & Why)

사전 버그를 잡고 스팀(Steam) 상점 페이지를 테스트하던 중, `<a>` 링크 태그 내부의 글자 색상이 페이지 전체의 다른 텍스트 번역문으로 잘못 상속되어 글자가 안 보이거나, 태그 없이 둥둥 떠 있는 고아 텍스트 노드로 인해 링크 클릭 이벤트가 통째로 날아가는 DOM 수집 결함이 발견되었다.

**DOM 트리를 재귀 순회하며 고아 텍스트 노드를 안전하게 감싸고 원본 색상을 유지하는 전용 수집기를 만들어야겠다.**
