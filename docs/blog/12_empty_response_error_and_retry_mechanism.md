# [Part 4] #12. 스팀 커뮤니티 빈 응답 오류와 재시도(Retry) 로직

> **작업 일자**: 2026-08-06  
> **관련 대화**: `5ce5ba4b-41e3-43ec-9a16-2bbff9a44a1b` (커밋 `89a31d2`)  
> **핵심 분류**: `새로운 지시`, `지시 수정 (재시도 및 장애 격리)`

---

## 1. 요구 사항과 이유 (Requirement & Why)

### 요구 이유
스팀 창작마당(Steam Workshop)이나 대형 게임 패치 가이드처럼 수백 개의 댓글과 포럼 글이 얽혀 있는 웹페이지를 번역할 때 간헐적으로 치명적인 멈춤 현상이 발생했다:

```text
[WebTranslator] 배치 0 오류 — 스킵하고 계속 진행
Error: 번역 응답이 비어 있습니다. 컨텍스트: https://steamcommunity.com/sharedfiles/...
```

API 서버(Google/LLM)의 일시적인 네트워크 순단이나 프롬프트 안전 필터(Safety Filter) 검열로 인해 빈 문자열(`""`)이나 깨진 JSON이 돌아왔을 때, 해당 배치가 통째로 증발하여 웹페이지 중간중간이 영어로 텅 비어버렸다.

### 요구 사항
1. 빈 응답(`Empty Response`)이나 일시적인 네트워크 에러(HTTP 500/503/429) 수신 시 작업을 즉시 포기하지 말고 지수 백오프(Exponential Backoff)로 최대 3회 자동 재시도할 것.
2. 3회 재시도 후에도 LLM이 응답하지 못할 경우, 사용자가 멈춤 없이 읽을 수 있도록 무료 구글 번역기(Google Fallback)로 우회하여 빈틈없이 채워 넣을 것.

---

## 2. 지시 내용 (Instruction)

AI에게 빈 번역 응답 오류 수정 및 재시도 로직 구현을 지시했다:

> **"스팀 커뮤니티에서 발생하는 '번역 응답이 비어 있습니다' 배치 오류를 해결해라. 빈 응답이나 통신 실패 시 최대 3회 재시도하고, 실패 시 구글 엔진으로 안전하게 우회하도록 만들어라."**

---

## 3. AI의 구현 결과 및 발생한 시행착오 (Trial & Error)

AI가 코드를 작성했으나 무한 루프에 빠지는 취약점이 있었다.

```javascript
// AI가 작성한 재시도 로직 (오류 코드)
async function requestWithRetry(fn) {
  while (true) { // 무한 루프 위험!
    try {
      const res = await fn();
      if (res && res.length > 0) return res;
    } catch (e) {
      // 대기 시간 없이 즉시 무한 재호출 (서버 429 융단폭격 유발)
    }
  }
}
```

### 발생한 문제점
* **서버 폭격 및 무한 블로킹**: 대기 시간(`delay`)도 없고 최대 시도 횟수(`maxRetries`) 제한도 없이 `while(true)`로 즉시 재호출하여 API 서버로부터 영구 차단당하거나 브라우저 탭이 얼어붙음.

---

## 4. 지시 수정: 안전한 재시도 파이프라인 (Action: Instruction Fix)

* **[지시 수정 - 지수 백오프 + 최대 3회 제한 + 엔진 Fallback]**:  
  > "무한 루프 돌리지 마라! **`maxRetries = 3`으로 엄격히 제한하고, `1000ms * (2 ** attempt)` 지수 백오프 대기를 줘라. 3번 다 실패하면 에러를 뿜지 말고 구글 번역으로 부드럽게 Fallback 처리해라.**"

---

## 5. 해결 과정 및 결과 (Resolution)

AI가 견고한 재시도 래퍼 `executeWithRetryAndFallback`을 완성했다 (`commit: 89a31d2`).

```javascript
// src/background/retry_helper.js
export async function executeWithRetryAndFallback(translateFn, texts, targetLang, maxRetries = 3) {
  let lastError = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = await translateFn(texts, targetLang);
      if (Array.isArray(result) && result.length === texts.length && result.every(t => t && t.trim().length > 0)) {
        return result; // 정상 번역 수신
      }
      throw new Error("빈 번역 응답 수신");
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries - 1) {
        const delay = 1000 * Math.pow(2, attempt); // 1초, 2초, 4초 대기
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  // 3회 모두 실패 시 무료 구글 번역으로 안전 우회
  console.warn(`[WebTranslator] 주 엔진 실패(${lastError.message}) -> 구글 엔진으로 긴급 전환`);
  return await translateWithGoogle(texts, targetLang);
}
```

대용량 스팀 창작마당 글에서도 단 하나의 문단 누락 없이 100% 매끄럽게 번역이 완료되었다.

---

## 6. 다음 작업 사항과 이유 (Next Work & Why)

기능이 눈덩이처럼 불어나면서 `content.js`와 `background.js`가 각각 **3,000줄을 돌파하는 초대형 모놀리스 파일**이 되었고, 괄호 오타 하나에 확장 프로그램 전체가 먹통이 되는 유지보수의 한계에 도달했다.

**더 이상 방치할 수 없는 3,000줄 단일 파일을 쪼개기 위한 대규모 모듈화 리팩토링에 착수해야겠다.**
