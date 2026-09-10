# Changelog

모든 주요 변경 사항은 이 파일에 기록됩니다.
이 프로젝트는 [Semantic Versioning](https://semver.org/lang/ko/)을 준수합니다.

## [2.0.0-dev] - In Progress

### Added — 이미지 합성 진단
- 옵션에서 진단 페이지 열기: OCR 원시 좌표·전달 bbox·크롭·스프라이트 및 왕복 결과 비교.
- 동일 OCR/스프라이트 재사용 합성, 저장된 응답의 API 없는 재분할, 진단 JSON 저장·가져오기.
- 박스 중첩·축소·구분선 침범 점검. 진단 준비 단계에서는 유료 이미지 합성 폴백을 호출하지 않음.
- 기존 OCR 요청·좌표 변환·스프라이트 패킹/분할 알고리즘 유지.

### Added
- **이미지 번역 전담 모듈 구조화**: `src/content/image/` (호버 감지, 캔버스 오버레이 렌더러, 다이얼로그)
- **Git 자동 동기화 워크플로우**: 버전 기반 브랜칭 및 커밋/푸시 규칙 체계화 (`.agents/AGENTS.md`, `scripts/git-sync.ps1`)

---

## [1.0.0] - 2026-08-31

### Added
- **인라인 전체 페이지 번역**: 원본 레이아웃 및 스타일을 보존하는 `Alt + A` 텍스트 번역 엔진
- **선택 영역 사전 팝업**: 텍스트 드래그 시 1초 내외 발음기호, 품사, 핵심 뜻 3개 및 예문 제공
- **다중 번역 및 LLM 엔진**: Google Translate, Google Gemini, OpenAI, Claude, Ollama, LibreTranslate, Custom API
- **적응형 다크모드**: 웹페이지 배경 휘도 실시간 계산 및 보색/명도 대비 최적화 색상 렌더링
- **툴바 팝업(`Popup`)**: 빠른 엔진/언어 전환 및 실시간 테마 미리보기
- **사용자 사전 & CSV 관리**: 고유명사/전문용어 사전 CRUD 및 CSV 내보내기/가져오기
- **후원 채널 연동**: GitHub Sponsors, Buy Me a Coffee, PayPal 후원 채널 연동

### Documentation & Infrastructure
- v1.0.0 공식 통합 기술 명세서 (`docs/SPECIFICATION.md`)
- v2.0 이미지 번역 단일 집중 로드맵 (`docs/WEBTRANSLATOR_2.0_ROADMAP.md`)
- 프로젝트 `README.md` 및 후원 안내 수립
- Chrome Manifest V3 최소 권한 기반 패키징 스크립트 (`scripts/package.js`)
