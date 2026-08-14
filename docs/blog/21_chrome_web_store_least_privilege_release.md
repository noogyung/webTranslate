# [Part 7] #21. MV3 최소 권한 다이어트와 크롬 웹 스토어 v1.0.0 제출

> **작업 일자**: 2026-08-14 ~ 2026-08-15  
> **관련 대화**: `12a59714-c6f5-483b-9049-a4df31cecf2a`  
> **핵심 분류**: `새로운 지시`, `지시 번복 (부가 권한 전면 삭제)`

---

## 1. 요구 사항과 이유 (Requirement & Why)

### 요구 이유
마침내 **WebTranslator v1.0.0**을 크롬 웹 스토어에 정식 등록할 순간이 왔다.
스토어 개발자 대시보드에 zip 파일을 업로드하자, 개인정보 보호 관행 탭에서 온갖 권한에 대한 엄격한 정당화 사유를 요구했다. 권한이 조금이라도 과도하면 심사가 몇 주씩 지연되거나 거절당할 수 있었다.

단 한 번에 심사를 통과하기 위해 **최소 권한의 원칙(Principle of Least Privilege)**을 철저히 지켜야 했다.

### 요구 사항
1. `manifest.json`에서 실제로 쓰지 않는 모든 권한을 삭제하고, 오직 설정 저장을 위한 `permissions: ["storage"]` 단 하나만 남길 것.
2. 방문하는 모든 사이트 번역 및 로컬 LLM(Ollama: `localhost:11434`), 자체 서버(LibreTranslate) 통신을 위한 `<all_urls>` 호스트 권한의 명확한 영문 사유서를 작성할 것.
3. zip 배포 패키지를 빌드하고 스토어 심사에 최종 제출할 것.

---

## 2. 지시 내용 (Instruction)

AI에게 매니페스트 권한 다이어트와 심사 소명서 작성을 지시했다:

> **"`manifest.json`을 검토하여 심사에 걸릴 만한 권한을 전면 삭제하고 `storage`만 남겨라. 그리고 구글 심사관에게 제출할 `<all_urls>` 호스트 권한 사유서를 작성해라."**

---

## 3. AI의 구현 결과 및 발생한 시행착오 (Trial & Error)

AI가 매니페스트를 검토했으나, 개발 초기 편의를 위해 넣어두었던 온갖 권한들이 그대로 방치되어 있었다.

```json
// AI가 정리하기 전 manifest.json (위험한 과다 권한)
"permissions": [
  "storage",
  "activeTab",
  "scripting",
  "contextMenus",
  "declarativeNetRequest"
]
```

### 발생한 문제점
* **심사 반려 위험 100%**: 마우스 드래그 팝업을 쓰기 때문에 우클릭 메뉴(`contextMenus`)나 동적 스크립트 주입(`scripting`)은 전혀 쓰지 않음에도 권한이 그대로 남아있어 "과도한 권한 요청"으로 즉시 반려될 위기.

---

## 4. 지시 번복: 부가 기능 권한 전면 삭제 (Action: Instruction Reversal)

* **[지시 번복 - 개발용 부가 권한 싹 다 취소]**:  
  > "우클릭 메뉴 같은 부가 기능 다 취소다! **불필요한 권한 싹 다 지우고, 오직 `permissions: [\"storage\"]` 단 하나만 남겨라. `activeTab`보다 `<all_urls>`가 필요한 이유(단축키 즉시 감지 및 로컬 Ollama/LibreTranslate 통신)를 심사관에게 명확히 소명해라.**"

---

## 5. 해결 과정 및 결과 (Resolution)

AI가 최소 권한 매니페스트와 심사 소명서를 완성했다.

```json
// 최종 manifest.json
{
  "manifest_version": 3,
  "name": "__MSG_appName__",
  "version": "1.0.0",
  "description": "__MSG_appDescription__",
  "default_locale": "ko",
  "permissions": [
    "storage"
  ],
  "host_permissions": [
    "<all_urls>"
  ],
  "background": {
    "service_worker": "src/background/index.js",
    "type": "module"
  }
}
```

### `<all_urls>` 호스트 권한 영문 소명서 (스토어 제출본)
> **"The extension requires permission to:  
> 1. Translate inline text on any website the user visits upon pressing the shortcut (Alt+A).  
> 2. Connect to user-configured custom/self-hosted translation servers (local Ollama at localhost, self-hosted LibreTranslate, custom API proxies) as well as official cloud APIs (Google, Gemini, OpenAI, Claude)."**

`dist/web-translator-v1.0.0.zip` 패키징을 완료하고, 스토어 개발자 대시보드에 업로드하여 **검토 대기(`In Review`)** 상태로 성공적으로 진입했다.

---

## 6. 회고와 다음 작업 사항 (Retrospective & Next Work)

기획부터 시작해 수많은 DOM 레이아웃 붕괴, API 429 한도 초과, 모델 404 삭제, 3,000줄 단일 파일 모놀리스 리팩토링, 그리고 이미지 번역의 처절한 3연속 실패와 롤백까지...

AI 에이전트와 끊임없이 문답하고 지시를 수정/번복하며 마침내 **WebTranslator v1.0.0**을 세상에 내놓게 되었다.

**크롬 웹 스토어 승인이 완료되면, 앞서 안전하게 격리해 둔 이미지 번역 R&D를 다시 시작하여 v2.0 메이저 업데이트로 도전해야겠다.**
