# 고급 이미지 번역: PP-OCR 하이브리드 파이프라인 구현 계획

> **상태**: 사용자 승인 대기 | **대상 브랜치**: `v2.0-dev`

---

## 1. 배경 및 목표

### 현재 고급 모드 (2단계 파이프라인)

```
[전체 이미지 1247×1757 = 219만 px]
    ↓ Step 1: Vision API (OCR + 번역)
[translationPairs 확보]
    ↓ Step 2: Image Generation API (전체 이미지 + 번역 쌍)
[번역된 전체 이미지 반환]
```

- **문제**: 두 단계 모두 전체 이미지(219만 px)를 API에 전송 → 느리고 비쌈 (56초)

### 제안하는 하이브리드 파이프라인

```
[전체 이미지]
    ↓ PP-OCR Det+Rec (로컬 WASM, ~2초)
[텍스트 박스 위치 + 원문 인식]
    ↓ LLM 텍스트 번역 (Gemini/GPT, 텍스트 전용)
[번역 쌍 확보]
    ↓ 박스별 크롭 생성 (~5~20만 px, 원본의 10~20%)
    ↓ 크롭 + 번역 텍스트 → Vision API (박스 단위)
[번역된 크롭 반환]
    ↓ 원본 이미지 위에 Canvas 합성
[최종 번역 이미지]
```

### 성능 비교 예상

| | 현재 | 하이브리드 |
|---|---|---|
| **Step 1** | Vision API 전체 이미지 | PP-OCR 로컬 (~2초) + LLM 텍스트 (~3초) |
| **Step 2** | Image Gen 전체 이미지 (56초) | Image Gen 크롭 × N (병렬, ~5~10초) |
| **총 시간** | ~56초 | **~8~15초** (예상) |
| **API 비용** | Vision 토큰 + Image 토큰 (전체) | **텍스트 토큰 + 소형 Image 토큰** |
| **좌표 정밀도** | AI 추정 (0~1000 정규화) | **PP-OCR pixel 좌표 (정밀)** |

---

## 2. 상세 구현 계획

### 2.1 imageService.js — handlePremiumTranslation 수정

**파일**: `src/background/imageService.js` L252~337

#### Step 1 교체 (Vision API → PP-OCR + LLM 텍스트 번역)

```
기존: translateImageWithVision(전체 이미지) → translationPairs
변경: ensureOffscreenDocument() → PP-OCR 실행 → 원문 블록 추출
      → translateWithEngine(원문 텍스트 배열) → 번역 텍스트 확보
      → translationPairs + bbox 정보 함께 보존
```

- PP-OCR 결과에서 `{ text, bbox, confidence }` 추출
- 원문 텍스트 배열을 기존 텍스트 번역 엔진(Gemini/GPT/Claude)으로 번역
- `translationPairs = [{ original, translated, bbox }]` 형태로 확장

#### Step 2 교체 (전체 이미지 → 박스별 크롭)

```
기존: translatePremiumGemini({ base64DataUrl: 전체이미지, translationPairs })
변경: for each translationPair:
        crop = cropBox(전체이미지, pair.bbox)  // 박스 영역만 크롭
        translated = translatePremiumGemini({ base64DataUrl: crop, ... })
      compositeAll(전체이미지, translatedCrops)  // 합성
```

---

### 2.2 크롭/합성 유틸리티 (신규 파일)

**파일**: `src/api/image/cropComposite.js` [NEW]

#### 함수 목록

```javascript
/**
 * 원본 이미지에서 bbox 영역을 크롭하여 base64 dataUrl 반환.
 * padding: 주변 컨텍스트를 위해 bbox보다 약간 넓게 크롭 (기본 10px)
 */
cropBoxFromImage(base64DataUrl, bbox, padding = 10) → Promise<string>

/**
 * 번역된 크롭들을 원본 이미지 위에 합성하여 최종 이미지 반환.
 */
compositeTranslatedCrops(originalDataUrl, crops) → Promise<string>
// crops = [{ bbox, translatedDataUrl }]

/**
 * 크롭 전용 프롬프트 (전체 이미지용보다 간소화).
 * - 단일 텍스트 블록만 교체 요청
 * - 배경 보존 강조
 */
buildCropPrompt(original, translated, targetLang) → string
```

#### 기술 고려사항

- **크롭/합성 위치**: Offscreen Document의 `OffscreenCanvas` 사용 (Background SW에는 DOM 없음)
- **패딩**: bbox 주변 10~20px 여유 (AI가 배경 컨텍스트를 볼 수 있도록)
- **포맷**: 크롭은 PNG (투명도 보존), 합성 결과는 JPEG (크기 절감)

---

### 2.3 imageTranslate.js 수정

**파일**: `src/api/image/imageTranslate.js`

- `buildWebtoonPrompt` → 크롭 전용 간소화 프롬프트 추가
  - 기존: "이미지 내 모든 텍스트를 번역하라"
  - 크롭: "이 작은 이미지 영역의 텍스트 `{원문}`을 `{번역}`으로 교체하라"
- `translatePremiumGemini` / `translatePremiumOpenAI` → 소형 이미지 입력 대응 검증

---

### 2.4 병렬 처리 전략

```javascript
// 세마포어 기반 동시 실행 제한 (기본 3개)
async function runWithConcurrency(tasks, limit = 3) {
  const results = [];
  const executing = [];
  for (const task of tasks) {
    const p = task().then(r => { executing.splice(executing.indexOf(p), 1); return r; });
    executing.push(p);
    results.push(p);
    if (executing.length >= limit) await Promise.race(executing);
  }
  return Promise.all(results);
}
```

- 최대 3개 동시 API 호출 (rate limit 안전 범위)
- Gemini: 분당 60 요청 여유 → 3 동시 안전
- OpenAI: 분당 제한 모델별 상이 → 3 동시가 보수적 안전선

---

### 2.5 폴백 전략

| 상황 | 처리 |
|---|---|
| PP-OCR 텍스트 미검출 (0블록) | 기존 Vision API 전체 이미지 방식으로 폴백 |
| 개별 크롭 합성 실패 | 해당 박스만 Canvas 오버레이 방식(일반 모드)으로 대체 |
| 전체 API 오류 (인증/네트워크) | 즉시 에러 전파 (기존 동작 유지) |

---

## 3. 파일 변경 요약

| 파일 | 변경 유형 | 설명 |
|---|---|---|
| `src/background/imageService.js` | MODIFY | Step 1: PP-OCR + LLM 텍스트, Step 2: 크롭 기반 |
| `src/api/image/cropComposite.js` | **NEW** | 크롭 생성 + 합성 + 크롭 프롬프트 |
| `src/api/image/imageTranslate.js` | MODIFY | 크롭 전용 프롬프트 추가 |
| `src/offscreen/ocrWorker.js` | MODIFY (optional) | 크롭 기능을 Offscreen에서 수행할 경우 |

---

## 4. 검증 계획

### 자동 검증
- `npm run package` 빌드 통과

### 수동 검증
1. 동일 만화 이미지로 기존 고급 모드 vs 하이브리드 모드 비교
2. 속도: 56초 → 15초 이하 달성 여부
3. 품질: 텍스트 위치/폰트/스타일 보존 여부
4. 에지 케이스: 텍스트 없는 이미지, 효과음만 있는 이미지, 매우 작은 텍스트

---

## 5. Open Questions (사용자 결정 필요)

1. **병렬 동시 실행 수**: 기본 3개 제안. 더 공격적으로 갈지?
2. **PP-OCR 미검출 시 폴백**: 기존 전체 이미지 Vision API로 돌아갈지, 아니면 에러 반환?
3. **크롭 패딩 크기**: 10px vs 20px vs bbox 비례(10%)? AI가 배경 컨텍스트를 얼마나 봐야 하는지에 따라 달라짐.
