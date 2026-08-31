# WebTranslator Git Sync Helper Script
# Usage: powershell -ExecutionPolicy Bypass -File scripts/git-sync.ps1 [-Message "commit message"]

param (
    [string]$Message = ""
)

$ErrorActionPreference = "Stop"

# 1. NextCloud index.lock 체크
$lockFile = Join-Path $PSScriptRoot "..\.git\index.lock"
if (Test-Path $lockFile) {
    Write-Warning "[Lock] .git/index.lock 파일이 존재합니다. NextCloud 동기화 완료 대기 후 1초 뒤 재시도합니다..."
    Start-Sleep -Seconds 1
    if (Test-Path $lockFile) {
        Remove-Item -Force $lockFile
    }
}

# 2. manifest.json 버전 확인
$manifestPath = Join-Path $PSScriptRoot "..\manifest.json"
$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
$version = $manifest.version

# 대상 브랜치 결정
$targetBranch = "main"
if ($version -notmatch "^1\.0\.") {
    $majorMinor = ($version -split '\.')[0..1] -join '.'
    $targetBranch = "v$majorMinor-dev"
}

# 현재 브랜치 확인
$currentBranch = (git branch --show-current).Trim()
Write-Host "[Git Sync] 버전: v$version | 대상 브랜치: $targetBranch | 현재 브랜치: $currentBranch" -ForegroundColor Cyan

# 브랜치 전환 필요 여부 체크
if ($currentBranch -ne $targetBranch) {
    Write-Host "[Git Sync] $targetBranch 브랜치로 전환합니다..." -ForegroundColor Yellow
    $branchExists = git branch --list $targetBranch
    if (-not $branchExists) {
        git checkout -b $targetBranch
    } else {
        git checkout $targetBranch
    }
}

# 3. 패키징 빌드 검증
Write-Host "[Git Sync] 배포 패키징 빌드 검증 중..." -ForegroundColor Cyan
node (Join-Path $PSScriptRoot "package.js")
if ($LASTEXITCODE -ne 0) {
    Write-Error "[Error] 패키징 빌드 실패로 인해 커밋/푸시를 중단합니다."
    exit 1
}

# 4. Git 변경사항 확인
$status = git status --porcelain
if (-not $status) {
    Write-Host "[Git Sync] 변경된 파일이 없습니다. 최신 상태입니다." -ForegroundColor Green
    exit 0
}

# 5. 커밋 메시지 입력 확인
if (-not $Message) {
    $Message = Read-Host "커밋 메시지를 입력하세요 (예: feat(image): 호버 번역 추가)"
}

if (-not $Message) {
    Write-Error "[Error] 커밋 메시지가 입력되지 않아 작업을 취소합니다."
    exit 1
}

# 6. Git Add, Commit & Push
Write-Host "[Git Sync] 변경사항 커밋 중..." -ForegroundColor Cyan
git add -A
git commit -m $Message

Write-Host "[Git Sync] 원격 저장소($targetBranch)로 푸시 중..." -ForegroundColor Cyan
git push origin $targetBranch

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n[성공] Git 커밋 및 푸시가 완료되었습니다!" -ForegroundColor Green
} else {
    Write-Warning "`n[경고] 자동 푸시에 실패했습니다. 터미널에서 'git push origin $targetBranch'를 직접 실행해주세요."
}
