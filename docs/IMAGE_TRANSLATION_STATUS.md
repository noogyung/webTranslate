# WebTranslator v2.0-dev — 이미지 번역 개발 현황

> **브랜치**: `v2.0-dev` | **최신 커밋**: `47bdfaa` | **날짜**: 2026-09-10

---

## 1. 커밋 히스토리 (이미지 번역 관련)

| 커밋 | 유형 | 설명 |
|---|---|---|
| `47bdfaa` | fix | GPT-5.x/o1/o3 reasoning 모델의 temperature 파라미터 거부 대응 |
| `6e8605d` | feat | PP-OCRv6 통합 모델 전환 + 노이즈 필터(conf<0.5) + Union-Find 인접 블록 그룹화(우→좌 읽기) |
| `5483267` | fix | **사전 로딩 치명적 버그** — 공백 문자(Line 1748)가 trim+filter로 제거되어 16,960자 인덱스 1칸 shift |
| `c547221` | feat | PP-OCRv6 small ONNX 모델 다운로드 및 테스트 페이지 v6 지원 |
| `2b9e751` | fix | 사전 파일 4종 curl 재다운로드 (PowerShell 인코딩 손상) + OCR 테스트 페이지 생성 |
| `a8f8378` | feat | IoU 기반 NMS 박스 병합 |
| `850a6e1` | fix | 세로 텍스트 90° CCW 회전 + 디버그 로그 |
| `3c0c27f` | fix | CSP `wasm-unsafe-eval` 추가 |
| `edbe701` | fix | ONNX Runtime WASM 백엔드 파일 추가 |
| `3856605` | fix | `ort.min.js` 풀 번들로 교체 |
| `1c9bbe8` | feat | **PP-OCR WASM Free 엔진** 초기 구현 (Offscreen Document + DBNet + CTC) |

---

## 2. PP-OCR Free 엔진 아키텍처

```
Content Script → Background SW → Offscreen Document (ocrWorker.js)
                                        │
                                        ├─ PP-OCRv6 Det (9.4MB) → 텍스트 영역 검출
                                        ├─ DBNet 후처리 (이진화 → CC → AABB → Unclip → NMS)
                                        ├─ PP-OCRv6 Rec (20.2MB) → 텍스트 인식 (50개 언어 통합)
                                        ├─ CTC Greedy Decoder (사전 18,708자)
                                        ├─ 노이즈 필터 (confidence < 0.5 제거)
                                        └─ 인접 블록 그룹화 (Union-Find, 우→좌 읽기 순서)
```

### 모델 파일 (`src/models/`)

| 파일 | 버전 | 크기 | 상태 |
|---|---|---|---|
| `PP-OCRv6_small_det.onnx` | v6 Det | 9.4MB | ✅ 현재 사용 |
| `PP-OCRv6_small_rec.onnx` | v6 Rec (50언어 통합) | 20.2MB | ✅ 현재 사용 |
| `ppocrv6_dict.txt` | v6 사전 (18,708자) | 70KB | ✅ 현재 사용 |
| `ort.min.js` | ONNX Runtime UMD | 340KB | ✅ |
| `ort-wasm-simd-threaded.jsep.wasm` | WASM 백엔드 | 22.8MB | ✅ |
| `ch_PP-OCRv4_det_infer.onnx` | v4 Det (레거시) | 4.5MB | 🗂️ 테스트용 유지 |
| `*_PP-OCRv3_rec_infer.onnx` × 4 | v3 Rec (레거시) | 8~10MB 각 | 🗂️ 테스트용 유지 |

### 해결한 핵심 버그

1. **사전 공백 문자 누락** — `.trim().filter(l.length > 0)`이 Line 1748의 공백(유효 사전 항목)을 제거 → 이후 모든 문자 인덱스 1칸 shift → `ス→ズ, タ→ダ` 등 체계적 오인식. 수정: trailing empty line만 제거.
2. **PowerShell 인코딩 손상** — `Invoke-WebRequest`로 UTF-8 텍스트 다운로드 시 멀티바이트 문자 깨짐 (4400줄→233줄). 수정: `cmd /c curl -sL -o` 사용.
3. **ONNX Runtime 로딩** — `ort.wasm.min.js`(래퍼) 대신 `ort.min.js`(풀 UMD 번들) 필요. 동적 import 파일(`.jsep.mjs`+`.jsep.wasm`) 별도 배치 필요.

---

## 3. 엔진별 벤치마크 (동일 만화 이미지 1247×1757px)

### 일반 번역 (Standard Mode)

| 엔진 | OCR 방식 | 블록 수 | 총 시간 | 좌표 | 비고 |
|---|---|---|---|---|---|
| **Free (PP-OCR) + GPT** | PP-OCR 로컬 | 5 (그룹화 후) | **9.4초** | 원본px (정밀) | ✅ 정상 |
| **Free (PP-OCR) + Gemini** | PP-OCR 로컬 | 5 (그룹화 후) | **6.6초** | 원본px (정밀) | ✅ 정상 |
| **Gemini Vision** | Gemini API | 9 | **7.2초** | 0~1000→px (스케일업) | ✅ 정상, 효과음(ドシャ)도 검출 |
| **GPT-5.6-Luna** | OpenAI Vision | — | 24초 | — | ❌ 텍스트 미검출 |
| **GPT-4o** | OpenAI Vision | — | — | — | ❌ 텍스트 미검출 |
| **GPT-4o-mini** | OpenAI Vision | — | — | — | ⚠️ 번역되나 글자 한곳 쏠림 |

### 일반 번역 상세 로그

#### Free (PP-OCR) + GPT — 9.4초
```
설정 로드: 1ms → 이미지 다운로드: 34ms → 압축(1247×1757→727×1024, 17%): 74ms
→ PP-OCR + GPT 번역: 8,110ms → Canvas 렌더링: 21ms
5개 블록 (그룹화 후):
#0 そんなのガキ共の飯\n減らせばいいじゃないの → 그런 건 애들 밥을\n줄이면 되잖아
#1 パカなんだから\n分かんないでしょ → 바보니까\n모르겠지
#2 一見まともなやつも\n所詮は偽善者だと知り\n人を信じなく\nなっていった → 겉보기엔 멀쩡한 놈들도\n결국 위선자라는 걸 알고\n사람을 믿지\n않게 되었다
#3 大人も子どもも\nしょうもなの\n奴らぱっか\n誰も信用に\n値しなる\nこんな世の中\n何 → 어른이고 아이고\n변변찮은\n놈들뿐이야\n누구 하나 믿을\n가치도 없어\n이런 세
#4 そんな時 → 그럴 때
```

#### Free (PP-OCR) + Gemini — 6.6초
```
설정 로드: 2ms → 이미지 다운로드: 33ms → 압축: 81ms
→ PP-OCR + Gemini 번역: 5,300ms → Canvas 렌더링: 25ms
5개 블록 (그룹화 후):
#0 → 그런 건 꼬맹이들 밥\n줄이면 되는 거 아니야
#1 → 바보니까\n모르는 거겠지
#2 → 겉보기엔 멀쩡한 녀석도\n알고 보니 위선자라는 걸 알고는\n사람을 믿지 않게
#3 → 어른도 아이도\n시시한\n녀석들뿐\n누구 하나 신용할\n가치도 없는\n이런 세상
#4 → 그러던 때
```

#### Gemini Vision — 7.2초
```
설정 로드: 2ms → 이미지 다운로드: 31ms → 압축: 68ms
→ Gemini Vision: 6,268ms → Canvas 렌더링: 24ms
9개 블록 (효과음 포함):
#8 ドシャ → 와창 (효과음 검출)
```

### 고급 번역 (Premium Mode)

| 엔진 | 총 시간 | 비고 |
|---|---|---|
| **OpenAI (GPT)** | **56초** | Step1 OCR + Step2 이미지 합성 |
| **Gemini** | 미측정 | — |

```
고급 번역 [openai] (OCR → 이미지 합성): 55,346ms
전체 완료: 56,071ms
```

---

## 4. PP-OCR 인식 정확도

### 문서 이미지 (코미켓 뉴스 페이지, 490×257px)

- **14줄 중 11줄 완벽** (정확도 ~99.5%)
- 오류 3건: `』→」`(유사 괄호 ×2), `一→ー`(유사 획)

### 만화 이미지 (1247×1757px)

- **핵심 텍스트 ~120자 중 오류 3자** (정확도 ~97.5%)
- 오류: `バ→パ`(탁점 혼동), `い→る`, `う→り`(저신뢰 0.48)
- 그룹화: 개별 18블록 → 필터+그룹화 → 5블록

---

## 5. 해결 완료된 주요 이슈 (실사이트 & 만화 검증 완료)

### ✅ P0 해결: GPT Vision (`gpt-5.6-luna`) 일반 번역 빈 응답
- **원인**: 추론 모델이 `reasoning_tokens`로 약 1,400+ 토큰을 소모하여 `max_completion_tokens: 2048` 예산이 고갈되고, `response_format: { type: "json_object" }`와 최상위 배열 프롬프트가 충돌.
- **해결**: `max_completion_tokens: 8192`, `reasoning_effort: "low"` 적용 및 `{"blocks":[...]}` 스키마 프롬프트 + 말풍선 단위 그룹화 지시(`src/api/image/vision.js`).

### ✅ P1 해결: Vision 좌표 쏠림 및 해상도 스케일 오류
- **원인**: `naturalWidth <= 1000` 조건으로 픽셀/정규화 좌표를 오판하여 600×850 만화 및 1080×1350 배너에서 좌표 왜곡 발생.
- **해결**: Gemini는 항상 `0~1000` 정규화 좌표로 변환하고, OpenAI는 실제 픽셀 좌표(해상도 초과 시에만 정규화 폴백)로 처리(`normalizeBox`).

### ✅ P2 해결: 실사용 UI/레이아웃 및 만화 말풍선 그룹화 버그
- **인라인 배너 레이아웃 및 `<a href>` 토글 버그**: `.wt-img-wrapper` 고정 크기/정렬/마진 보존 및 토글 버튼 `preventDefault()` + `stopPropagation()` 적용(`src/content/image/overlayManager.js`).
- **가로 배너 역순 병합 및 만화 인접 말풍선 오병합**: 가로/세로 혼용 병합 차단, 가로 블록 상→하 정렬, 세로 말풍선 `topDiff`/`vOverlap` 임계치 정밀화(`src/offscreen/ocrWorker.js`).
- **Pixiv(`pximg.net`) 403 차단 해소**: `declarativeNetRequest` 상시 세션 규칙(ID 9998)으로 `Referer: https://www.pixiv.net/` 자동 주입(`src/background/index.js`).

---

## 6. 파일 변경 요약

| 파일 | 역할 | 주요 변경 |
|---|---|---|
| `src/offscreen/ocrWorker.js` | Offscreen OCR Worker | v6 통합 모델, 사전 로딩 수정, 그룹화, 노이즈 필터 |
| `src/offscreen/ocr.html` | Offscreen Document | ort.min.js 로드 |
| `src/background/imageService.js` | Background 이미지 서비스 | Free 엔진 Offscreen OCR 분기 |
| `src/api/engines/openai.js` | OpenAI 텍스트 번역 | isReasoningModel 분기, temperature 조건부 |
| `src/api/image/vision.js` | Vision OCR+번역 | isReasoningModel 분기 |
| `src/test/ocr-test.html` | OCR 테스트 페이지 | v6 모델 선택, 드래그앤드롭 |
| `src/test/ocr-test.js` | 테스트 페이지 JS | v6 지원, 사전 수정, 그룹화 |
| `manifest.json` | 확장 매니페스트 | offscreen, CSP, web_accessible_resources |
