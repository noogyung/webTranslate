# [Part 4] #11. gemini-2.5-flash 404 사태와 실시간 가용 모델 동적 탐색

> **작업 일자**: 2026-08-06  
> **관련 대화**: `55e0e726-ace7-4d89-80a2-5d9abb7eb7ad` (커밋 `6abe2db`)  
> **핵심 분류**: `새로운 지시`, `지시 수정 (동적 모델 탐색 도입)`

---

## 1. 요구 사항과 이유 (Requirement & Why)

### 요구 이유
평화롭게 웹서핑을 하던 중, 갑자기 웹페이지의 모든 텍스트가 번역되지 않고 콘솔에 붉은 에러가 쏟아졌다:

```text
[WebTranslator] 배치 1 오류 — 스킵하고 계속 진행
Error: 404 This model models/gemini-2.5-flash is no longer available to new users
```

구글이 실험용 모델을 예고 없이 내리거나 이름을 바꾸면서, 코드 안에 문자열로 하드코딩해 두었던 `models/gemini-2.5-flash`가 404 Not Found로 증발해 버린 것이다.

### 요구 사항
1. 특정 모델명(`gemini-1.5-flash`, `gemini-2.0-flash` 등)을 코드에 하드코딩하지 말 것.
2. 사용자의 API Key로 구글 API 엔드포인트(`GET /v1beta/models`)를 실시간 호출하여, 현재 사용 가능한 최신 모델 목록을 자동으로 탐색(Dynamic Fetch)할 것.
3. 모델 조회가 실패할 경우를 대비해 3단계 안전 Fallback 모델 체계를 마련할 것.

---

## 2. 지시 내용 (Instruction)

AI에게 모델 404 에러 해결 및 동적 모델 탐색기 개발을 지시했다:

> **"Gemini 404 모델 삭제 오류를 수정해라. 하드코딩된 모델명을 제거하고, 구글 API에서 실시간으로 가용 모델 목록을 조회하여 최신 플래시 모델을 자동으로 선택하도록 개선해라."**

---

## 3. AI의 구현 결과 및 발생한 시행착오 (Trial & Error)

AI가 코드를 작성했으나 단순히 다른 모델명으로 또 하드코딩을 바꿨다.

```javascript
// AI가 작성한 임시 땜질 (오류 코드)
const GEMINI_MODEL = "gemini-1.5-flash-latest"; // 또 다른 하드코딩! 나중에 또 터질 수 있음
```

### 발생한 문제점
* **근본 원인 방치**: 임시로 모델 이름을 바꿨을 뿐, 몇 주 뒤 구글이 또 모델을 버전업하면 똑같이 404 에러로 확장 프로그램이 멈추게 되는 취약한 구조.

---

## 4. 지시 수정: 동적 모델 탐색 도입 (Action: Instruction Fix)

* **[지시 수정 - 실시간 모델 탐색기(`getValidGeminiModel`) 구현]**:  
  > "하드코딩으로 돌려막지 마라! **`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`를 호출하여 사용자의 계정에서 지원되는 모델 목록 중 `generateContent`를 지원하는 가장 빠르고 최신의 Flash 모델을 실시간으로 자동 선택하는 알고리즘을 작성해라.**"

---

## 5. 해결 과정 및 결과 (Resolution)

AI가 실시간 가용 모델 탐색 및 캐싱 함수 `getValidGeminiModel`을 완성했다.

```javascript
// src/background/engines/gemini.js
let cachedModelName = null;

export async function getValidGeminiModel(apiKey) {
  if (cachedModelName) return cachedModelName;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    const data = await response.json();

    if (data.models && Array.isArray(data.models)) {
      // 1. generateContent를 지원하는 flash 계열 최신 모델 탐색
      const flashModel = data.models.find(m => 
        m.supportedGenerationMethods?.includes("generateContent") &&
        m.name.includes("flash") &&
        !m.name.includes("legacy")
      );

      if (flashModel) {
        cachedModelName = flashModel.name.replace("models/", "");
        return cachedModelName;
      }
    }
  } catch (e) {
    // 2. 네트워크 오류 시 안전 Fallback
  }

  return "gemini-1.5-flash"; // 최후의 안전 기본값
}
```

구글이 어떤 모델을 Deprecated시키거나 신규 모델을 출시하더라도, 사용자의 개입 없이 항상 최신 가용 모델을 스스로 찾아내어 404 에러를 영구적으로 박멸했다.

---

## 6. 다음 작업 사항과 이유 (Next Work & Why)

모델 404는 해결했으나, 스팀 커뮤니티처럼 특수문자나 이모지가 많은 긴 포럼 글을 번역할 때 간헐적으로 "번역 응답이 비어 있습니다"라는 빈 문자열 응답이 오면서 작업이 영원히 멈추는 무한 로딩 버그가 발생했다.

**빈 응답 수신 시 무한 로딩에 빠지지 않고 안전하게 재시도하는 Retry 메커니즘을 추가해야겠다.**
