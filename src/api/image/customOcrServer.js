/**
 * src/api/image/customOcrServer.js
 * 사설 OCR 서버 통신 모듈 (imageStdOtherType === "ocr_server")
 * - PaddleOCR REST API / 로컬 OCR 서버에 이미지 전송 후 { text, bbox } 배열 수신
 * - imageService.js의 handleStandardTranslation()에서 호출
 */

/**
 * 사설 OCR 서버에 이미지를 전송하여 텍스트 블록 배열을 수신.
 *
 * 기대하는 서버 응답 형식 (PaddleOCR REST 규격 또는 호환):
 * [
 *   { "text": "원문", "bbox": [[x1,y1],[x2,y1],[x2,y2],[x1,y2]] },  // 쿼드 배열
 *   { "text": "원문", "bbox": [x, y, width, height] },               // xywh 배열
 * ]
 * 또는 래퍼 형식:
 * { "data": [...], "result": [...], "texts": [...] }
 *
 * @param {Object} params
 * @param {string} params.base64DataUrl - data:image/...;base64,... 형식
 * @param {string} params.serverUrl - OCR 서버 엔드포인트 URL
 * @param {string} [params.apiKey] - Bearer 인증 키 (없으면 생략)
 * @param {number} [params.naturalWidth] - 원본 이미지 폭 (압축 시 스케일 보정용)
 * @param {number} [params.naturalHeight] - 원본 이미지 높이 (압축 시 스케일 보정용)
 * @param {number} [params.compressedWidth] - 압축 후 폭 (스케일 팩터 계산용)
 * @param {number} [params.compressedHeight] - 압축 후 높이 (스케일 팩터 계산용)
 * @returns {Promise<Array<{text:string, bbox:{x,y,width,height}}>>}
 */
export async function runCustomOcrServer({
  base64DataUrl,
  serverUrl,
  apiKey = "",
  naturalWidth = 0,
  naturalHeight = 0,
  compressedWidth = 0,
  compressedHeight = 0,
}) {
  if (!serverUrl) throw new Error("OCR 서버 URL이 설정되지 않았습니다.");
  if (!base64DataUrl) throw new Error("이미지 데이터가 없습니다.");

  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  const response = await fetch(serverUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({ image: base64DataUrl }),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`OCR 서버 오류 (HTTP ${response.status}): ${errText.substring(0, 120)}`);
  }

  const raw = await response.json();

  // 다양한 서버 응답 형식 정규화
  const rawBlocks = Array.isArray(raw)
    ? raw
    : Array.isArray(raw.data) ? raw.data
    : Array.isArray(raw.result) ? raw.result
    : Array.isArray(raw.texts) ? raw.texts
    : [];

  if (rawBlocks.length === 0) {
    console.warn("[WT OCR Server] 감지된 텍스트 블록 없음");
    return [];
  }

  // 압축 시 좌표 스케일 팩터
  const scaleX = (naturalWidth && compressedWidth) ? naturalWidth / compressedWidth : 1;
  const scaleY = (naturalHeight && compressedHeight) ? naturalHeight / compressedHeight : 1;

  return rawBlocks
    .filter(b => b.text && b.text.trim())
    .map(b => ({
      text: b.text.trim(),
      bbox: normalizeBboxFromServer(b.bbox, scaleX, scaleY),
    }))
    .filter(b => b.bbox !== null);
}

/**
 * 서버 반환 bbox를 { x, y, width, height } 형식으로 정규화.
 * - 쿼드 배열 [[x1,y1],[x2,y1],[x2,y2],[x1,y2]] → 외접 직사각형
 * - [x, y, width, height] → 그대로 사용
 * - [ymin, xmin, ymax, xmax] → 변환
 */
function normalizeBboxFromServer(bbox, scaleX = 1, scaleY = 1) {
  if (!bbox) return null;

  let x, y, width, height;

  if (Array.isArray(bbox) && Array.isArray(bbox[0])) {
    // 쿼드 배열: [[x1,y1],[x2,y1],[x2,y2],[x1,y2]]
    const xs = bbox.map(p => p[0]);
    const ys = bbox.map(p => p[1]);
    x = Math.min(...xs);
    y = Math.min(...ys);
    width = Math.max(...xs) - x;
    height = Math.max(...ys) - y;
  } else if (Array.isArray(bbox) && bbox.length === 4) {
    if (bbox[2] > bbox[0] && bbox[3] > bbox[1] && bbox[2] < 2 && bbox[3] < 2) {
      // 0~1 정규화 비율 좌표는 지원 안 함 (서버가 픽셀 좌표를 반환해야 함)
      return null;
    }
    // [x, y, w, h] 또는 [ymin, xmin, ymax, xmax] 자동 감지
    // width/height가 양수면 xywh 형식으로 해석
    if (bbox[2] > 0 && bbox[3] > 0 && bbox[2] < 5000 && bbox[3] < 5000) {
      [x, y, width, height] = bbox;
    } else {
      const [ymin, xmin, ymax, xmax] = bbox;
      x = xmin; y = ymin; width = xmax - xmin; height = ymax - ymin;
    }
  } else {
    return null;
  }

  // 스케일 팩터 적용 (압축된 이미지 좌표 → 원본 이미지 좌표)
  return {
    x: Math.round(x * scaleX),
    y: Math.round(y * scaleY),
    width: Math.round(width * scaleX),
    height: Math.round(height * scaleY),
  };
}
