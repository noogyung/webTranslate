# WebTranslator Git Sync Helper Script
# Usage: powershell -ExecutionPolicy Bypass -File scripts/git-sync.ps1 -Message "feat(scope): commit message"

param (
    [Parameter(Mandatory = $true)]
    [string]$Message
)

$ErrorActionPreference = "Stop"

# 1. NextCloud 동기화 index.lock 해제 대기
$lockFile = Join-Path $PSScriptRoot "..\.git\index.lock"
if (Test-Path $lockFile) {
    Write-Warning "[Lock] .git/index.lock 파일이 존재합니다. 1초 대기 후 해제합니다..."
    Start-Sleep -Seconds 1
    if (Test-Path $lockFile) { Remove-Item -Force $lockFile }
}

# 2. 현재 브랜치 확인 및 main 직접 커밋 차단 (강제 브랜치 전환 금지)
$currentBranch = (git branch --show-current).Trim()
if (-not $currentBranch) {
    Write-Error "[Guard] Detached HEAD 상태에서는 동기화할 수 없습니다."
    exit 1
}
if ($currentBranch -eq "main") {
    Write-Error "[Guard] 'main' 브랜치에는 직접 커밋할 수 없습니다. 'vX.Y-dev', 'feat/*', 'fix/*', 'exp/*' 브랜치로 전환하세요."
    exit 1
}

Write-Host "[Git Sync] 현재 작업 브랜치: $currentBranch" -ForegroundColor Cyan

# 3. 빌드/패키징 무결성 검증
$packageScript = Join-Path $PSScriptRoot "package.js"
if (Test-Path $packageScript) {
    Write-Host "[Git Sync] 배포 패키징 빌드 검증 중..." -ForegroundColor Cyan
    node $packageScript
    if ($LASTEXITCODE -ne 0) {
        Write-Error "[Error] 패키징 검증 실패로 커밋을 중단합니다."
        exit 1
    }
}

# 4. 변경사항 확인
$status = git status --porcelain
if (-not $status) {
    Write-Host "[Git Sync] 커밋할 변경사항이 없습니다." -ForegroundColor Green
    exit 0
}

Write-Host "[Git Sync] 스테이징 대상 파일:" -ForegroundColor Yellow
git status --short

# 5. 커밋 및 현재 브랜치 원격 푸시
git add -A
git commit -m $Message
git push origin $currentBranch

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n[성공] '$currentBranch' 브랜치 커밋 및 원격 푸시가 완료되었습니다!" -ForegroundColor Green
} else {
    Write-Warning "`n[경고] 자동 푸시에 실패했습니다. 터미널에서 'git push origin $currentBranch'를 직접 실행해주세요."
}
