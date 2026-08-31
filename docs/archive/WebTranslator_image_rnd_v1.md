# WebTranslator v3.0 Specification & Release Notes

## 1. 개요 (Overview)
WebTranslator v3.0은 **마우스 호버 플로팅 버튼 기반 범용 이미지 내 텍스트 번역 (Image Translation)** 기능을 도입하는 대규모 메이저 업데이트입니다.
사용자는 웹페이지 내 이미지에 마우스를 올리고 나타나는 **[번역]** 버튼을 클릭하는 것만으로, 원본 이미지의 레이아웃, 배경, 회전, 글자 색상/외곽선/그림자 스타일을 보존한 체 이미지 내부의 외국어를 한국어로 직접 번역하여 확인할 수 있습니다.

---

## 2. 기존 v2.x 하위 호환성 및 비파괴적 격리 구조 (v2.x Backward Compatibility & Isolation)

v3.0 이미지 번역 기능은 기존 v2.x 텍스트 번역, 단어 사전 팝업, 페이지 전체 번역(`Alt+A`), 옵션 설정 코드를 전혀 수정하지 않고 **신규 독립 모듈 추가(Non-destructive Addition)** 방식으로 개발됩니다.

| 구성 요소 | v2.x 기존 기능 | v3.0 확장 방식 | 하위 호환성 영향 |
| :--- | :--- | :--- | :--- |
| **`api.js`** | `translateWithGemini`, `translateWithGoogle`, `fetchWordDictionary` 등 | 기존 함수 100% 유지, 신규 `translateImageWithVision` 함수 독립 추가 | **영향 0% (완전 호환)** |
| **`background.js`** | `action === "translate"`, `"lookupWord"`, `"getSettings"` 핸들러 | 기존 메시지 처리 유지, 신규 `action === "translateImage"` 핸들러 추가 | **영향 0% (완전 호환)** |
| **`content.js`** | 텍스트 드래그 사전 팝업, `Alt+A` 전체 번역 | 기존 이벤트 유지, 이미지 전용 호버 모듈(`hover_button_manager.js`) 독립 바인딩 | **영향 0% (완전 호환)** |
| **`content.css`** | 텍스트 오버레이, 단어 사전 툴팁 스타일 | `.wt-image-trans-btn`, `.wt-image-canvas` 등 `wt-image-` 고유 접두사 적용 | **충돌 0% (독립 스타일)** |
| **`manifest.json`** | MV3, `activeTab`, `storage`, `scripting` | 기존 권한 유지, `<all_urls>` `host_permissions` 추가 및 버전 `3.0.0` 상향 | **영향 0% (하위 호환)** |

---

## 3. 주요 기능 및 아키텍처 (Key Features & Architecture)

### 3.1 호버 감지 및 플로팅 번역 UI (`hover_button_manager.js`)
- **자동 이미지 감지**: 웹페이지 내 `<img>`, `CSS background-image`, `<canvas>`, `<svg>` 요소 호버 시 동작.
- **예외 필터링**: Width/Height 50px 미만의 웹 UI 아이콘/버튼 등 불필요한 이미지는 호버 버튼 노출에서 자동 제외.
- **플로팅 버튼 UI**: 이미지 우측 상단에 `[번역]` 플로팅 버튼 동적 생성.
- **상태 관리 & 토글**:
  - 대기: `[번역]`
  - 진행 중: 로딩 스피너 애니메이션 표시
  - 완료: `[원본 보기]` / `[번역 보기]` 토글 버튼으로 전환

### 3.2 범용 이미지 추출 & Referer 우회 (`background.js`)
- **범용 Image Loader**: `img.src`, `data:image Base64`, `Blob`, `CSS url()` 추출.
- **Referer & CORS 우회**: Pixiv(`i.pximg.net`) 등 외부 도메인의 이미지 자원에 대해 Service Worker 수준에서 탭 URL 기준 `Referer` 헤더를 포함하여 `fetch` 수행 후 Base64 인코딩.
- **`host_permissions`**: `<all_urls>` 지정으로 웹 전체 이미지 크로스 도메인 다운로드 보장.

### 3.3 Gemini & GPT Vision LLM 파이프라인 (`api.js`)
- **엔진 전용화**: Vision 인지 기능이 탑재된 **Gemini (Gemini 3.6 Flash / Pro)** 및 **OpenAI (GPT-4o / GPT-4o-mini)** Vision 모델 전용 파이프라인.
- **Structured JSON 수신**: 
  - Bounding Box 쿼드 좌표 (0~1000 normalized)
  - Original Text & Translated Korean Text
  - Text Color, Background Color, Font Size Ratio, Rotation, Line Breaks

### 3.4 Canvas Overlay & Advanced Text Renderer (`canvas_renderer.js` / `overlay_manager.js`)
- **Overlay Positioning**: `ResizeObserver` 및 DOM `getBoundingClientRect()` 기반으로 원본 이미지 위에 Absolute Canvas 배치.
- **Background Repair (Dominant Color Fill)**: Bounding Box 위치의 원본 텍스트를 추정 배경색으로 정화(Inpainting Fill)하여 원문 은폐.
- **Canvas Text Rendering**:
  - Bounding Box 경계 이탈 방지 Font Auto-scaling (자동 폰트 축소)
  - 자동 줄바꿈 (Word Wrap) & 가로/세로 쓰기 레이아웃 지원
  - Text Outline (Stroke Color/Width), Shadow, Gradient 보존

---

## 4. 디렉토리 구조 및 파일 매트릭스 (File Matrix)

```
d:\Noogs\NextCloud\Projects\WebTranslator\
├── manifest.json                                # Version 3.0.0, host_permissions, contextMenus/activeTab
├── background.js                                # Image Base64 Conversion, Referer Bypass, Vision Messaging
├── api.js                                       # translateImageWithVision (Gemini/GPT Vision integration)
├── content.js                                   # Main Content Script, Hover Listener Entrypoint
├── content.css                                  # Hover Button & Loading Spinner & Canvas Overlay Styles
├── options.html / options.js                    # Options UI (Vision Engine selection & Key configs)
└── modules/
    └── image_translator/
        ├── hover_button_manager.js              # Mouse Hover Detection & Floating Button UI Manager
        ├── image_loader.js                      # Universal DOM Image Source Extractor
        ├── overlay_manager.js                   # Absolute Canvas Overlay & Toggle State Controller
        ├── layout_analyzer.js                   # Bounding Box & Text Alignment Normalizer
        └── canvas_renderer.js                   # Canvas Auto-fit, Stroke, Fill & Text Renderer
```

---

## 5. 파이프라인 흐름도 (Sequence Diagram)

```
User                     HoverManager             Background(SW)              Vision API (Gemini/GPT)             OverlayManager
  │                           │                         │                                │                                │
  │── Hover Over Image ──────>│                         │                                │                                │
  │                           │── Render [번역] Button ─>│                                │                                │
  │── Click [번역] Button ───>│                         │                                │                                │
  │                           │── (Extract Src/Url) ───>│                                │                                │
  │                           │                         │── fetch(Url, Referer) ────────>│                                │
  │                           │                         │── Base64 Payload ─────────────>│                                │
  │                           │                         │                                │── Analyze Image & Text ───────>│
  │                           │                         │<── Return Structured JSON ─────│                                │
  │                           │<── Send BBox & Translations ───│                                │                                │
  │                           │<── Send Render Data ────│                                │                                │
  │                           │──────────────────────────────────────────────────────────────────────────────────────────>│
  │                                                                                                                       │── Render Canvas Overlay
  │<── Show Translated Overlay ───────────────────────────────────────────────────────────────────────────────────────────│
```

---

## 6. 검증 및 검수 계획 (Verification Checklist)

- [ ] **`manifest.json` 판올림 및 권한 검증**: 버전 3.0.0 반영 및 `<all_urls>` `host_permissions` 확인.
- [ ] **v2.x 기존 기능 회귀 검증**: 텍스트 드래그 사전 팝업, `Alt+A` 전체 번역, 옵션 저장 등 기존 기능 정상 작동 확인.
- [ ] **호버 버튼 노출 및 예외 검증**: 다양한 웹페이지 `<img>`, `background-image`, `canvas` 호버 시 우상단 `[번역]` 버튼 노출 및 소형 아이콘(50px 미만) 예외 처리 확인.
- [ ] **Pixiv 및 CORS 이미지 호버 번역 검증**: Pixiv(`https://www.pixiv.net/artworks/145682618`) 포함 외부 도메인 이미지 클릭 시 403 차단 없이 Base64 수신 및 Vision API 통신 확인.
- [ ] **Canvas 오버레이 렌더링 검증**: 텍스트 배경 정화(Dominant Fill), 자동 폰트 축소, 줄바꿈, 외곽선 및 회전 텍스트가 Bounding Box 내에 자연스럽게 노출되는지 확인.
- [ ] **토글 및 리사이즈 대응 검증**: `[원본 보기]` / `[번역 보기]` 클릭 시 토글 전환 및 브라우저 창 리사이즈 시 오버레이 위치 추적 확인.
