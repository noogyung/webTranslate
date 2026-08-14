# Chrome Web Store 배포 가이드 (v1.0.0)

---

## 1. 배포 패키지

- **패키지 파일**: `dist/web-translator-v1.0.0.zip` (권한 최소화 적용 완료)
- **최소 권한 구성**:
  - `permissions`: `["storage"]`
  - `host_permissions`: `["<all_urls>"]`
  - *(불필요한 `activeTab`, `scripting`, `contextMenus`, `declarativeNetRequest` 완전 제거)*

---

## 2. 개발자 대시보드 필수 입력 정보 (개인정보 보호 관행 탭)

### 1) 단일 목적 설명 (Single Purpose Description)
```text
Web Translator is designed solely to provide inline web page translation and text-selection dictionary lookup using multiple translation engines (Google Translate, Gemini AI, OpenAI, Claude, and local LLMs).
```
*(한국어: 웹 페이지의 외국어 텍스트를 인라인으로 번역하고, 선택한 단어의 사전 뜻을 제공하는 단일 목적의 번역 도구입니다.)*

### 2) 호스트 권한 (`host_permissions: <all_urls>`) 사유
```text
The extension requires `<all_urls>` permission to detect and translate text content across websites the user visits upon pressing the translation shortcut (Alt+A), and to communicate with user-configured translation API endpoints (Google Translate, Gemini API, OpenAI API, Anthropic API, and local Ollama server).
```
*(한국어: 사용자가 방문하는 모든 웹페이지의 텍스트를 감지하여 Alt+A 단축키로 인라인 번역하고, 사용자가 설정한 번역 API 엔드포인트(Google, Gemini, OpenAI, Claude 등)로 번역 요청을 전송하기 위해 필요합니다.)*

### 3) `storage` 권한 사유
```text
Used to save user preferences, custom style options, API keys, and local translation dictionary cache securely in the browser.
```
*(한국어: 사용자의 번역 엔진 선택, API 키, 커스텀 스타일 옵션, 로컬 단어 사전 캐시를 브라우저에 안전하게 저장하기 위해 사용됩니다.)*

### 4) 데이터 사용 인증 및 질문
- **데이터 수집 여부**: `아니요, 사용자 데이터를 수집하거나 사용하지 않습니다` 선택
- **개발자 프로그램 정책 준수 인증**: 하단 체크박스 체크

---

## 3. 계정 설정 (게시자 이메일 인증)

1. 대시보드 좌측 메뉴 **[설정] (Account / Settings)** 클릭
2. **게시자 연락처 이메일(Publisher email)** 입력
3. 수신된 이메일에서 **인증 링크 클릭** 완료

---

## 4. 스토어 등록 정보 (Store Listing)

### [기본 정보]
- **확장 프로그램 이름**: Web Translator — 웹 페이지 및 드래그 텍스트 번역
- **요약 설명**: Alt+A 단축키로 웹 페이지 전체를 인라인 번역하고, 텍스트 드래그 시 사전 및 번역 팝업을 제공합니다. Google 번역, Gemini, OpenAI, Claude 지원.

### [상세 설명 (Detailed Description)]
```markdown
🌐 Web Translator — 스마트한 웹 브라우징을 위한 올인원 번역 확장 프로그램

Web Translator는 웹서핑 중 외국어 문서를 읽을 때 원래의 웹페이지 레이아웃을 해치지 않고 매끄럽게 번역해 주는 강력한 크롬 확장 프로그램입니다.

단축키 한 번으로 페이지 전체를 번역하거나, 궁금한 단어/문장을 드래그하여 즉시 사전 뜻과 예문을 확인할 수 있습니다.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✨ 주요 기능 (Key Features)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. ⚡ 웹 페이지 전체 인라인 번역 (Alt+A)
- 웹페이지의 DOM 구조와 디자인을 유지하면서 텍스트만 자연스러운 한국어로 번역합니다.
- 무한 스크롤 및 동적 콘텐츠(SPA)도 자동으로 감지하여 번역합니다.
- 단축키(Alt+A) 한 번으로 번역문과 원문을 빠르게 토글할 수 있습니다.

2. 📖 선택 영역 단어 & 문장 사전 팝업
- 모르는 단어나 문장을 마우스로 드래그하면 즉시 뜻, 품사, 발음기호, 실생활 예문이 담긴 깔끔한 팝업이 나타납니다.
- 반복 조회되는 단어는 로컬에 캐싱되어 즉각 반응합니다.

3. 🤖 다양한 최신 번역 엔진 지원
- Google 번역 (무료 / 무제한 / 별도 설정 없이 즉시 사용)
- Google Gemini AI (Gemini 2.0 Flash / Pro 등 고품질 문맥 번역)
- OpenAI ChatGPT (GPT-4o-mini / GPT-4o)
- Anthropic Claude (Claude 3.5 Haiku / Sonnet)
- Ollama (내 PC에서 실행하는 100% 무료 로컬 LLM)
- LibreTranslate (오픈소스 자체 번역 서버)

4. 🎨 섬세한 커스텀 스타일 & 설정
- 번역된 텍스트의 글자 색상, 형광펜 하이라이트, 텍스트 그림자, 기울임꼴(이탤릭) 등 가독성에 맞게 자유롭게 커스터마이징할 수 있습니다.
- 웹사이트 배경색에 따라 가독성을 극대화하는 '환경 적응 색상' 모드를 지원합니다.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔒 개인정보 보호 및 안전성
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Web Translator는 사용자의 개인 데이터를 수집하거나 외부 서버에 전송하지 않습니다.
- 사용자가 입력한 API 키는 브라우저의 로컬 보안 스토리지(chrome.storage.sync)에만 안전하게 보관됩니다.
```
