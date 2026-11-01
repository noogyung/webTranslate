# Changelog

모든 주요 변경 사항은 이 파일에 기록됩니다.
이 프로젝트는 [Semantic Versioning](https://semver.org/lang/ko/)을 준수합니다.

## [2.0.0-dev] - In Progress

### Added
- **이미지 번역 전담 모듈 구조화**: `src/content/image/` (호버 감지, 캔버스 오버레이 렌더러, 다이얼로그)
- **PP-OCRv6 로컬 WASM OCR 엔진 (`free`)**: Offscreen Document 기반 DBNet 텍스트 검출 + 50개 언어 통합 CTC 인식 + 인접 말풍선/행 그룹화 (`src/offscreen/ocrWorker.js`)
- **고급 하이브리드 이미지 합성 파이프라인 (`annotated` / `clean`)**: PP-OCRv6 검출 + 텍스트 번역 후 1024×1024 슬라이스 기반 AI 이미지 합성 (`src/background/imageSliceManager.js`, `src/api/image/synthesis.js`)
- **Pixiv(`pximg.net`) 직접 탐색 및 다운로드 호환**: `declarativeNetRequest` 세션 규칙(ID 9998)을 통한 상시 `Referer: https://www.pixiv.net/` 주입 및 단독 이미지 탭 번역 지원 (`src/background/index.js`, `src/content/image/index.js`)
- **개인 개발용 3계층 Git 브랜치 전략 및 가드레일 적용**: `main`(배포 전용) + `v2.0-dev`(버전 통합) + `feat/*`, `fix/*`, `exp/*`(격리/Squash Merge) 구조 확립 및 `main` 직접 커밋 차단/강제 브랜치 전환 제거 (`.agents/AGENTS.md`, `scripts/git-sync.ps1`)

### Fixed
- **인라인 배너 레이아웃 깨짐 및 링크 오작동 방지**: `.wt-img-wrapper` 생성 시 원본 크기/정렬/마진 보존 및 `<a href>` 내부 토글 버튼 클릭 시 페이지 이동 차단 (`src/content/image/overlayManager.js`)
- **OpenAI Vision (`gpt-5.6-luna`) 빈 응답 및 좌표 쏠림 해결**: 추론 모델 토큰 예산 확대(`max_completion_tokens: 8192`, `reasoning_effort: "low"`), `{"blocks":[...]}` JSON 스키마 일치, 해상도별 픽셀/정규화 좌표 분기 및 말풍선 단위 그룹화 (`src/api/image/vision.js`)
- **OCR 블록 그룹화 정밀도 개선**: 가로/세로 텍스트 이종 병합 차단, 가로 텍스트 상→하 읽기 순서 정렬, 만화 세로 말풍선 인접 오병합 방지 (`src/offscreen/ocrWorker.js`)
- **캔버스 오버레이 가독성 및 사용자 사전 연동**: 배경색 샘플링 실패 시 불투명 백색 라운드 박스 폴백으로 원문 비침 제거 및 `applyLocalDictionary` 적용 (`src/content/image/canvasRenderer.js`, `src/background/imageService.js`, `manifest.json`)
- **번역 배열 인덱스 밀림 및 압축 역효과 방지**: 구두점 전용 블록 필터링 시 인덱스 매핑 보정 및 JPEG 재인코딩 시 원본보다 용량이 커지는 경우 원본 유지 (`src/background/imageService.js`, `src/content/image/index.js`)

---

## [1.0.0] - 2026-08-31

### Added
- **인라인 전체 페이지 번역**: 원본 레이아웃 및 스타일을 보존하는 `Alt + A` 텍스트 번역 엔진
- **선택 영역 사전 팝업**: 텍스트 드래그 시 1초 내외 발음기호, 품사, 핵심 뜻 3개 및 예문 제공
- **다중 번역 및 LLM 엔진**: Google Translate, Google Gemini, OpenAI, Claude, Ollama, LibreTranslate
- **적응형 다크모드**: 웹페이지 배경 휘도 실시간 계산 및 보색/명도 대비 최적화 색상 렌더링
- **툴바 팝업(`Popup`)**: 빠른 엔진/언어 전환 및 실시간 테마 미리보기
- **사용자 사전 & CSV 관리**: 고유명사/전문용어 사전 CRUD 및 CSV 내보내기/가져오기
- **후원 채널 연동**: GitHub Sponsors, Buy Me a Coffee, PayPal 후원 채널 연동

### Documentation & Infrastructure
- v1.0.0 공식 통합 기술 명세서 (`docs/SPECIFICATION.md`)
- v2.0 이미지 번역 단일 집중 로드맵 (`docs/WEBTRANSLATOR_2.0_ROADMAP.md`)
- 프로젝트 `README.md` 및 후원 안내 수립
- Chrome Manifest V3 최소 권한 기반 패키징 스크립트 (`scripts/package.js`)
