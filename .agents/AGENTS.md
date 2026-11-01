# AI Coding Assistant Rules

- **기본 스킬 활성화**: 이 프로젝트에서는 항상 `primitive-output` 스킬을 기본으로 적용한다.
- **표준 브랜치 전략 참조**: 상위 전략 문서인 [`D:\Noogs\NextCloud\Projects\BRANCH_STRATEGY.md`](file:///d:/Noogs/NextCloud/Projects/BRANCH_STRATEGY.md)의 개인 개발용 3계층 브랜치 아키텍처를 준수한다.

---

## 🌿 3계층 브랜치 아키텍처 (3-Tier Branching Model)

1. **`main` (Production Release 전용 — 불변 배포선)**
   * 스토어 등록 및 정식 배포가 확정된 코드만 위치한다.
   * `main` 브랜치에서 직접 코드를 작성하거나 커밋하는 것을 **절대 금지**한다.
   * 오직 `v{Major}.{Minor}-dev` 또는 `hotfix/*`에서 배포 검증이 끝난 시점에만 `--no-ff` 옵션(`git merge --no-ff`)으로 병합하고, 병합 즉시 **Annotated Git Tag (`v{Major}.{Minor}.{Patch}`)** 를 생성·푸시한다.

2. **`v{Major}.{Minor}-dev` (버전 통합 브랜치, 예: `v2.0-dev`)**
   * 차기 배포 버전에 포함될 **검증이 완료된 기능과 수정 사항만 통합**하는 브랜치다.
   * 불확실한 R&D, 외부 모델/라이브러리 교체, 대규모 리팩토링을 이 브랜치에서 직접 진행하지 않는다.
   * 이미 배포된 이전 버전(`v1.0.x`) 긴급 수정 시에는 해당 릴리즈 태그(`v1.0.0`)에서 `hotfix/v1.0.1-{이슈명}`을 분기해 수정 후 `main` 병합(`v1.0.1` 태그) 및 `v{Major}.{Minor}-dev`에 `cherry-pick`/병합한다.

3. **`feat/*`, `fix/*`, `exp/*` (AI 작업 및 실험 격리 브랜치)**
   * **`feat/{기능명}` / `fix/{이슈명}`**: 설계가 확정된 단일 기능 개발 및 명확한 버그 수정 브랜치. 검증 완료 후 `v{Major}.{Minor}-dev`로 병합 후 삭제한다.
   * **`exp/{실험명}`**: AI 에이전트 R&D 및 프로토타이핑 전용 샌드박스.
     * 실험 중에는 자유로운 중간 커밋(`wip`, `debug`, `test`)을 허용한다.
     * **실험 성공 시**: `git merge --squash exp/{실험명}`으로 **단 1개의 규격화된 커밋**으로 압축 병합하고 즉시 `git branch -D exp/{실험명}`으로 삭제한다.
     * **실험 실패/폐기 시**: 통합 브랜치에 `revert` 커밋을 남기지 않고 `v{Major}.{Minor}-dev` 복귀 후 `git branch -D exp/{실험명}`으로 즉시 폐기한다.

---

## 🚀 Git 자동 동기화 & 가드레일 워크플로우 규칙

사용자의 단일 요청(턴)에 대한 코드 및 문서 수정 작업이 완료되면, 반드시 아래 5단계 가드레일 프로세스를 순차적으로 수행하여 커밋 및 원격 푸시를 완료한다. (단, 단순 질문/조회 턴은 제외)

### 1. 브랜치 가드 및 버전 일관성 확인
* **강제 브랜치 전환 금지**: `manifest.json`이나 `package.json`의 `version` 값을 읽어 브랜치를 강제로 `checkout`하지 않으며, **현재 체크아웃된 작업 브랜치(`feat/*`, `fix/*`, `exp/*`, `vX.Y-dev`)** 를 그대로 유지한다.
* **`main` 직접 커밋 차단**: 현재 브랜치가 `main`인 상태에서는 일반 작업 커밋을 수행하지 않는다.
* `manifest.json`과 `package.json`의 `version` 필드는 항상 동일하게 동기화되어야 한다.

### 2. 문서 실시간 동기화 및 혼합 스테이징 금지
* **`README.md` / `CHANGELOG.md`**: 신규 기능, UI 변경, 지원 엔진, 단축키 변경 또는 주요 버그 수정 시 최신 사양으로 갱신한다.
* **성격이 다른 변경사항 분리**: 커밋 전 `git status --short`를 확인하여 순수 문서(`docs:`) 커밋에 미완성 기능 코드(`src/`)나 의도치 않은 버전/권한 변경(`manifest.json`)이 섞여 들어가지 않도록 분리한다.

### 3. 무결성 및 패키징 빌드 검증 (Safety Guard)
* 커밋 전 NextCloud 동기화 락(`.git/index.lock`) 존재 여부를 확인하고 대기/제거한다.
* `npm.cmd run package` (또는 `node scripts/package.js`)를 실행하여 크롬 확장 프로그램 패키징 및 문법 오류가 없는지 검증한다. 실패 시 커밋을 중단하고 즉시 수정한다.
* `.gitignore`에 등록된 비밀 파일(`*.env*`, `*.local.*`)이 스테이징되지 않도록 보장한다.

### 4. 규격화된 커밋 메시지 작성 (Conventional Commits)
* 반드시 작업 영역과 내용을 명확히 드러내는 구조화된 메시지를 작성한다:
  * 형식: `type(scope): 상세 작업 설명`
  * 예시: `feat(image): 이미지 호버 캔버스 오버레이 렌더러 추가`, `fix(api): Gemini API 레이트 리밋 지수 백오프 적용`

### 5. 현재 작업 브랜치 즉시 원격 푸시 (Immediate Push)
* 커밋 완료 즉시 현재 작업 브랜치로 원격 푸시를 실행한다 (`git push origin <current-branch>`).
* 인증 또는 네트워크 예외로 인해 백그라운드 푸시가 지연/실패할 경우, 무한 대기하지 않고 사용자에게 터미널 실행 명령어를 안내한다.
