/**
 * src/api/image/vision.js
 * Vision AI 1-Pass OCR+번역 모듈 (Gemini / OpenAI / Other Vision API)
 * - 하드코딩 모델명 완전 제거: 호출측에서 모델명을 반드시 전달
 * - 5개 핵심 필드 경량 프롬프트: eraseBox, originalText, translatedText, orientation, textColor
 * - Gemini: 0~1000 정규화 좌표 반환 / OpenAI(GPT): 픽셀 좌표 반환 → 분기 처리
 * - Other [Vision API 방식] (Ollama/Qwen 등 OpenAI 규격 호환 서버) 라우팅 추가
 */

import { getLanguageName } from '../constants.js';

export async function translateImageWithVision({
  base64DataUrl,
  naturalWidth,
  naturalHeight,
  mode = "gemini",
  apiKey = "",
  geminiModel = "",
  openaiApiKey = "",
  openaiModel = "",
  otherVisionUrl = "",
  otherVisionKey = "",
  otherVisionModel = "",
  targetLang = "ko"
}) {
  const langName = getLanguageName(targetLang);

  const match = base64DataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
  if (!match) throw new Error("올바르지 않은 이미지 Base64 포맷입니다.");
  const mimeType = match[1];
  const base64Data = match[2];

  const dimNote = (naturalWidth && naturalHeight)
    ? `Image size: ${naturalWidth}x${naturalHeight}px.\n`
    : "";

  // 모든 모드 통일: [ymin,xmin,ymax,xmax] 0~1000 정규화 좌표
  // Gemini는 이 형식을 명시적으로 학습. GPT/Other도 동일 형식으로 요청.
  const prompt =
    `You are a high-precision OCR translator for image translation.\n\n` +
    dimNote +
    `Detect every visible text block. Return ONLY these 5 fields per block in JSON.\n` +
    `- eraseBox: [ymin,xmin,ymax,xmax] normalized 0-1000 scale (0=top/left, 1000=bottom/right).\n` +
    `  Example: text in upper-right → [50,700,200,980]; center → [400,300,600,700]\n` +
    `- originalText: exact extracted text, line breaks as \\n.\n` +
    `- translatedText: ${langName} translation preserving line breaks.\n` +
    `- orientation: "horizontal" | "vertical".\n` +
    `- textColor: dominant text color as #RRGGBB.\n` +
    `Return valid JSON array only. No markdown.\n\n` +
    `[{"eraseBox":[y1,x1,y2,x2],"originalText":"...","translatedText":"...","orientation":"horizontal","textColor":"#000000"}]`;

  let rawContent = "";

  if (mode === "openai") {
    const key = openaiApiKey || apiKey;
    if (!key) throw new Error("OpenAI API Key가 설정되지 않았습니다.");
    if (!openaiModel) throw new Error("OpenAI Vision 모델명이 설정되지 않았습니다.");

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: openaiModel,
        messages: [{ role: "user", content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: base64DataUrl, detail: "high" } }
        ]}],
        max_completion_tokens: 2048,
        temperature: 0.0,
      }),
    });
    if (!res.ok) throw new Error(`OpenAI Vision HTTP ${res.status}: ${await res.text()}`);
    rawContent = (await res.json()).choices?.[0]?.message?.content || "";

  } else if (mode === "other_vision") {
    // OpenAI 호환 Vision API (Ollama, vLLM, Qwen 등)
    if (!otherVisionUrl) throw new Error("Other Vision 서버 URL이 설정되지 않았습니다.");
    const headers = { "Content-Type": "application/json" };
    if (otherVisionKey) headers["Authorization"] = `Bearer ${otherVisionKey}`;

    const res = await fetch(`${otherVisionUrl.replace(/\/$/, "")}/v1/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: otherVisionModel || "qwen2.5-vl",
        messages: [{ role: "user", content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: base64DataUrl } }
        ]}],
        max_tokens: 2048,
        temperature: 0.0,
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`Other Vision 서버 HTTP ${res.status}: ${await res.text()}`);
    rawContent = (await res.json()).choices?.[0]?.message?.content || "";

  } else {
    // Gemini (기본)
    const key = apiKey || openaiApiKey;
    if (!key) throw new Error("Gemini API Key가 설정되지 않았습니다.");
    if (!geminiModel) throw new Error("Gemini Vision 모델명이 설정되지 않았습니다.");

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent?key=${encodeURIComponent(key)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [
          { text: prompt },
          { inline_data: { mime_type: mimeType, data: base64Data } }
        ]}],
        generationConfig: { temperature: 0.0, response_mime_type: "application/json" }
      }),
    });
    if (!res.ok) throw new Error(`Gemini Vision HTTP ${res.status}: ${await res.text()}`);
    rawContent = (await res.json()).candidates?.[0]?.content?.parts?.[0]?.text || "";
  }

  const ocrBlocks = parseVisionJsonResponse(rawContent);
  if (!Array.isArray(ocrBlocks) || ocrBlocks.length === 0) {
    console.warn("[WT Vision] OCR 감지 텍스트 없음");
    return [];
  }

  // 모든 모드 동일: normalizeBox가 0~1000 자동 감지 후 역정규화
  const finalBlocks = ocrBlocks.map((block) => ({
    ...block,
    translatedText: block.translatedText?.trim() || block.originalText || "",
    eraseBox: normalizeBox(block.eraseBox, naturalWidth, naturalHeight),
    glyphBox: block.glyphBox ? normalizeBox(block.glyphBox, naturalWidth, naturalHeight) : null,
    containerBox: block.containerBox ? normalizeBox(block.containerBox, naturalWidth, naturalHeight) : null,
  })).filter(b => b.eraseBox !== null);

  console.log(`[WT Vision] 1-Pass 완료 — ${finalBlocks.length}블록 (mode=${mode})`);
  return finalBlocks;
}

export async function locateBoundingBoxesWithVision({
  base64DataUrl, naturalWidth, naturalHeight,
  mode = "gemini", apiKey = "", geminiModel = "",
  openaiApiKey = "", openaiModel = "",
}) {
  const blocks = await translateImageWithVision({
    base64DataUrl, naturalWidth, naturalHeight,
    mode, apiKey, geminiModel, openaiApiKey, openaiModel, targetLang: "ko",
  });
  if (!Array.isArray(blocks)) return [];
  return blocks
    .map(b => ({ box: b.glyphBox || b.eraseBox || b.containerBox, text: b.originalText || "" }))
    .filter(item => item.box && item.box.length === 4);
}

function parseVisionJsonResponse(rawText) {
  if (!rawText?.trim()) return [];
  const clean = rawText
    .replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "").trim();
  try {
    const parsed = JSON.parse(clean);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed.textBlocks)) return parsed.textBlocks;
    if (Array.isArray(parsed.data)) return parsed.data;
    return [];
  } catch (err) {
    console.error("[WT Vision] JSON 파싱 오류:", err);
    return [];
  }
}

/**
 * [ymin, xmin, ymax, xmax] → { x, y, width, height }
 * @param {boolean} forcePixel - true면 정규화 판정 없이 픽셀 직접 사용 (GPT Vision용)
 */
export function normalizeBox(rawBox, naturalWidth, naturalHeight, forcePixel = false) {
  if (!rawBox || !Array.isArray(rawBox) || rawBox.length !== 4) return null;

  // [ymin, xmin, ymax, xmax] 0~1000 정규화 좌표 자동 감지
  const [ymin, xmin, ymax, xmax] = rawBox;
  const maxCoord = Math.max(ymin, xmin, ymax, xmax);
  const isNorm = maxCoord <= 1000 && (naturalWidth > 1000 || naturalHeight > 1000);

  const px_x1 = isNorm ? (xmin / 1000) * naturalWidth : xmin;
  const px_y1 = isNorm ? (ymin / 1000) * naturalHeight : ymin;
  const px_x2 = isNorm ? (xmax / 1000) * naturalWidth : xmax;
  const px_y2 = isNorm ? (ymax / 1000) * naturalHeight : ymax;

  const PAD = 2;
  const x = Math.max(0, Math.round(px_x1) - PAD);
  const y = Math.max(0, Math.round(px_y1) - PAD);
  const x2 = Math.min(naturalWidth || Infinity, Math.round(px_x2) + PAD);
  const y2 = Math.min(naturalHeight || Infinity, Math.round(px_y2) + PAD);
  const w = x2 - x, h = y2 - y;
  if (w <= 0 || h <= 0) return null;
  return { x, y, width: w, height: h, _wasNormalized: isNorm };
}
