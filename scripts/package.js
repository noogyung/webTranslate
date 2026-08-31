import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
// 1. manifest.json에서 버전 읽기
const manifestPath = path.resolve(rootDir, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
const version = manifest.version || "1.0.0";

const buildRootDir = path.resolve(rootDir, "Build");
const buildVersionDir = path.resolve(buildRootDir, version);
const zipName = `web-translator-v${version}.zip`;
const zipPath = path.resolve(buildVersionDir, zipName);
const tempBuildDir = path.resolve(buildVersionDir, "temp_build");

console.log(`[Package] Web Translator v${version} 패키징 시작...`);

// 2. Build/{version} 및 temp_build 초기화
if (fs.existsSync(tempBuildDir)) {
  fs.rmSync(tempBuildDir, { recursive: true, force: true });
}
if (!fs.existsSync(buildVersionDir)) {
  fs.mkdirSync(buildVersionDir, { recursive: true });
}
if (fs.existsSync(zipPath)) {
  fs.unlinkSync(zipPath);
}
fs.mkdirSync(tempBuildDir, { recursive: true });

// 3. 포함할 파일 및 디렉토리 정의
const includeItems = [
  "manifest.json",
  "_locales",
  "icons",
  "src"
];

// 복사 시 제외할 패턴
const excludePatterns = [
  "_archive",
  ".DS_Store",
  "Thumbs.db",
  "*.test.js",
  "*.spec.js"
];

function shouldExclude(relativePath) {
  return excludePatterns.some((pattern) => {
    if (pattern.startsWith("*.")) {
      return relativePath.endsWith(pattern.slice(1));
    }
    return relativePath.includes(pattern);
  });
}

function copyRecursive(src, dest, relPath = "") {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    const children = fs.readdirSync(src);
    for (const child of children) {
      const childRelPath = path.join(relPath, child);
      if (shouldExclude(childRelPath)) {
        console.log(`  [제외] ${childRelPath}`);
        continue;
      }
      copyRecursive(path.join(src, child), path.join(dest, child), childRelPath);
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

for (const item of includeItems) {
  const srcPath = path.resolve(rootDir, item);
  const destPath = path.resolve(tempBuildDir, item);
  if (fs.existsSync(srcPath)) {
    console.log(`  [포함] ${item}`);
    copyRecursive(srcPath, destPath, item);
  } else {
    console.warn(`  [경고] 항목을 찾을 수 없음: ${item}`);
  }
}

// 4. Zip 아카이브 생성
console.log(`[Package] Zip 파일 압축 생성 중: ${zipName}`);

try {
  // PowerShell Compress-Archive를 사용하여 압축 (Windows 환경 기본 내장)
  const psCommand = `powershell -Command "Compress-Archive -Path '${tempBuildDir}\\*' -DestinationPath '${zipPath}' -Force"`;
  execSync(psCommand, { stdio: "inherit" });

  const zipStats = fs.statSync(zipPath);
  const zipSizeKB = (zipStats.size / 1024).toFixed(2);

  console.log(`\n[성공] 크롬 웹 스토어 배포 패키지 생성 완료!`);
  console.log(`- 파일 경로: ${zipPath}`);
  console.log(`- 압축 크기: ${zipSizeKB} KB`);
  console.log(`- 버전: v${version}`);
} catch (err) {
  console.error(`[오류] Zip 압축 실패:`, err.message);
  process.exit(1);
} finally {
  // 임시 빌드 폴더 정리
  if (fs.existsSync(tempBuildDir)) {
    fs.rmSync(tempBuildDir, { recursive: true, force: true });
  }
}
