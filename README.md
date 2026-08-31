# Web Translator 🌐

> 웹페이지의 원본 레이아웃을 해치지 않고 직관적인 인라인 번역과 단어/문장 사전을 제공하는 Chrome 확장 프로그램 (Manifest V3)

---

## 📌 주요 기능 (Key Features)

1. **페이지 전체 인라인 번역 (`Alt + A`)**
   - 웹페이지 구조를 파괴하지 않고 `원문(번역문)` 형태로 직관적인 인라인 렌더링을 제공합니다.
   - `display: contents` 기반 가상 래퍼로 텍스트 정렬 및 스타일을 100% 보존합니다.

2. **드래그 단어 & 문장 사전 팝업**
   - 텍스트 선택 시 1초 내외로 빠른 발음기호, 품사, 핵심 뜻 3가지 및 실생활 예문을 제공합니다.
   - 10% 미만 한글 포함/CJK 자동 감지 및 스마트 필터링을 지원합니다.

3. **다양한 번역 및 LLM 엔진 지원**
   - **무료 기본**: Google 번역 (API Key 불필요)
   - **최신 AI 모델**: Google Gemini, OpenAI (ChatGPT), Anthropic Claude, LibreTranslate
   - **로컬 LLM**: Ollama (오프라인/자체 호스팅)
   - **커스텀 엔드포인트**: 사용자 지정 프록시 및 API 연동 지원

4. **적응형 다크모드 & 테마 커스터마이징**
   - 웹사이트 배경색의 휘도(Luminance)를 실시간 계산하여 다크모드/라이트모드에 최적화된 번역문 가독성 제공.
   - 글자 크기, 색상, 투명도 실시간 조절 가능.

5. **툴바 빠른 설정 팝업 (`Popup`)**
   - 브라우저 상단 툴바 클릭으로 번역 엔진, 목표 언어, 테마 스타일을 즉시 변경 및 실시간 미리보기.

6. **사용자 사전 및 CSV 관리**
   - 고유명사, 전문 용어 치환을 위한 사용자 사전 CRUD 및 CSV 내보내기/가져오기 완비.

---

## 🛠️ 지원 번역 엔진

| 엔진 | 인증 방식 | 주요 특징 |
| :--- | :--- | :--- |
| **Google Translate** | 무료 (인증 불필요) | 설정 없이 즉시 사용 가능한 기본 엔진 |
| **Google Gemini** | API Key | Gemini 2.0 Flash / Pro 지원, 초고속 AI 번역 |
| **OpenAI** | API Key | GPT-4o / GPT-4o-mini 등 공식 모델 선택 지원 |
| **Anthropic Claude** | API Key | Claude 3.5 Sonnet / Haiku 등 고품질 자연어 번역 |
| **Ollama** | 로컬 엔드포인트 | 개인정보 보호 및 오프라인 로컬 LLM 번역 지원 |
| **LibreTranslate** | URL / API Key | 자체 호스팅 오픈소스 번역 엔진 연동 |
| **Custom Engine** | 커스텀 엔드포인트 | 사용자 정의 API 규격 연동 |

---

## ⌨️ 기본 단축키

* **전체 페이지 번역 / 원문 토글**: `Alt + A`
* **단어 및 문장 사전 조회**: 텍스트 드래그(선택) 시 자동 팝업

---

## 📂 프로젝트 구조

```
WebTranslator/
├── manifest.json            # Chrome Manifest V3 설정 파일
├── _locales/                # 다국어 리소스 (ko, en)
├── icons/                   # 확장 프로그램 아이콘
├── assets/                  # 웹스토어 에셋 및 리소스
├── docs/                    # 기술 명세서 및 개발 로드맵
│   ├── SPECIFICATION.md     # v1.0.0 공식 통합 기술 명세서
│   └── WEBTRANSLATOR_2.0_ROADMAP.md # v2.0 로드맵
├── scripts/                 # 빌드 및 패키징 스크립트
└── src/                     # 네이티브 ES 모듈 (ESM) 소스 코드
    ├── background/          # Background Service Worker (API 통신 전담)
    ├── content/             # Content Scripts (DOM 파싱 및 인라인 렌더링)
    ├── api/                 # 번역 엔진 API 클라이언트 레이어
    ├── options/             # 설정 페이지 UI 및 스토리지 제어
    └── popup/               # 툴바 빠른 설정 팝업
```

---

## 🚀 설치 및 개발 가이드

### 개발자 모드로 로드하기

1. 본 저장소를 클론하거나 다운로드합니다.
   ```bash
   git clone https://github.com/noogyung/webTranslate.git
   ```
2. Chrome 브라우저에서 `chrome://extensions/`로 이동합니다.
3. 우측 상단의 **'개발자 모드'**를 활성화합니다.
4. **'압축해제된 확장 프로그램을 로드합니다'** 버튼을 클릭한 후 프로젝트 루트 폴더를 선택합니다.

### 패키징 (ZIP 배포)
```bash
npm run package
```
* `Build/WebTranslator_v{version}.zip` 파일이 생성됩니다.

---

## 💖 후원 (Donation)

Web Translator는 사용자의 쾌적한 다국어 웹서핑을 위해 전면 무료 및 오픈소스로 제공됩니다.

* 확장 프로그램이 유용하셨다면 개발자에게 따뜻한 밥 한 끼나 커피 한 잔 사주시는 마음으로 응원해주시면 큰 힘이 됩니다.
* 별도의 후원자 전용 혜택이나 기능 차등은 없으며, 순수한 응원과 격려로 감사히 받겠습니다.

---

## 📄 라이선스 (License)

본 프로젝트는 [MIT License](LICENSE)에 따라 자유롭게 사용 및 기여할 수 있습니다.
