/**
 * src/api/image/vision.js
 * Vision AI 1-Pass OCR+번역 모듈 (Gemini / OpenAI / Other Vision API)
 * - Gemini: [ymin,xmin,ymax,xmax] 0~1000 정규화 좌표 (모델 학습 형식)
 * - GPT/Other: [xmin,ymin,xmax,ymax] 0~1000 정규화 좌표 (표준 이미지 좌표계)
 * - Other [Vision API 방식] (Ollama/Qwen 등 OpenAI 규격 호환 서버) 라우팅
 */

import { getLanguageName } from '../constants.js';

/** temperature 미지원 모델 판별 (o1/o3 reasoning, GPT-5.x 계열 등) */
function isReasoningModel(model) {
  if (!model) return false;
  const m = model.toLowerCase();
  return /^(o[13])/.test(m) || /^gpt-5/.test(m);
}

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

  const isGemini = (mode === "gemini");

  // ── 프롬프트 분기 ────────────────────────────────────────────
  let prompt;
  if (isGemini) {
    // Gemini: [ymin,xmin,ymax,xmax] 0~1000 정규화 (모델 자체 학습 형식)
    prompt =
      `You are a high-precision OCR translator for image translation.\n\n` +
      dimNote +
      `Detect every visible text block. Return ONLY these 5 fields per block in JSON.\n` +
      `- eraseBox: [ymin,xmin,ymax,xmax] fully covers text for clean removal.\n` +
      `- originalText: exact extracted text, line breaks as \\n.\n` +
      `- translatedText: ${langName} translation preserving line breaks.\n` +
      `- orientation: "horizontal" | "vertical" | "rotated".\n` +
      `- textColor: dominant text color as #RRGGBB.\n` +
      `Coordinates: 0-1000 normalized scale (e.g. x=500 means 50% from left).\n` +
      `Return valid JSON array only. No markdown.\n\n` +
      `[{"eraseBox":[y,x,y,x],"originalText":"...","translatedText":"...(${langName})...","orientation":"horizontal","textColor":"#000000"}]`;
  } else {
    // GPT / Other Vision: [xmin,ymin,xmax,ymax] 0~1000 정규화 (표준 이미지 좌표계)
    prompt =
      `You are a manga/comic OCR translator. Scan the ENTIRE image from top to bottom.\n\n` +
      dimNote +
      `Detect every visible text block. Treat each speech bubble, thought bubble, caption, and sound effect as a SEPARATE block.\n\n` +
      `Return ONLY these 5 fields per block in JSON:\n` +
      `- eraseBox: [xmin,ymin,xmax,ymax] in normalized 0-1000 scale. Imagine the image as a 1000×1000 grid (0=left/top, 1000=right/bottom).\n` +
      `  Example: text at upper-right corner → [700,50,980,300]; text at center → [300,400,700,600]\n` +
      `- originalText: exact text extracted, line breaks as \\n.\n` +
      `- translatedText: ${langName} translation. Preserve line breaks.\n` +
      `- orientation: "horizontal" | "vertical" (vertical = text runs top-to-bottom).\n` +
      `- textColor: text color as #RRGGBB.\n` +
      `Return valid JSON array only. No markdown fences.\n\n` +
      `[{"eraseBox":[x1,y1,x2,y2],"originalText":"...","translatedText":"...","orientation":"horizontal","textColor":"#000000"}]`;
  }

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
        ...(!isReasoningModel(openaiModel) && { temperature: 0.0 }),
        response_format: { type: "json_object" },
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

  // Gemini: [ymin,xmin,ymax,xmax] / GPT,Other: [xmin,ymin,xmax,ymax]
  const finalBlocks = ocrBlocks.map((block) => ({
    ...block,
    translatedText: block.translatedText?.trim() || block.originalText || "",
    eraseBox: normalizeBox(block.eraseBox, naturalWidth, naturalHeight, isGemini),
    glyphBox: block.glyphBox ? normalizeBox(block.glyphBox, naturalWidth, naturalHeight, isGemini) : null,
    containerBox: block.containerBox ? normalizeBox(block.containerBox, naturalWidth, naturalHeight, isGemini) : null,
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
    if (Array.isArray(parsed.blocks)) return parsed.blocks;
    if (Array.isArray(parsed.results)) return parsed.results;
    // GPT가 response_format: json_object로 래핑할 때 1-depth 배열 탐색
    const vals = Object.values(parsed);
    for (const v of vals) {
      if (Array.isArray(v) && v.length > 0 && v[0].eraseBox) return v;
    }
    return [];
  } catch (err) {
    console.error("[WT Vision] JSON 파싱 오류:", err);
    return [];
  }
}

/**
 * 바운딩박스 좌표를 { x, y, width, height } 픽셀 값으로 변환.
 * @param {boolean} isGeminiOrder - true: [ymin,xmin,ymax,xmax], false: [xmin,ymin,xmax,ymax]
 */
export function normalizeBox(rawBox, naturalWidth, naturalHeight, isGeminiOrder = true) {
  if (!rawBox || !Array.isArray(rawBox) || rawBox.length !== 4) return null;
  if (!rawBox.every(Number.isFinite)) return null;
  if (!(naturalWidth > 0) || !(naturalHeight > 0)) return null;

  let c_xmin, c_ymin, c_xmax, c_ymax;
  if (isGeminiOrder) {
    // Gemini: [ymin, xmin, ymax, xmax]
    [c_ymin, c_xmin, c_ymax, c_xmax] = rawBox;
  } else {
    // GPT/Other: [xmin, ymin, xmax, ymax]
    [c_xmin, c_ymin, c_xmax, c_ymax] = rawBox;
  }

  // 모든 Vision 프롬프트의 좌표 계약은 이미지 크기와 무관하게 0~1000이다.
  if (c_xmax <= c_xmin || c_ymax <= c_ymin) return null;
  const px_x1 = (c_xmin / 1000) * naturalWidth;
  const px_y1 = (c_ymin / 1000) * naturalHeight;
  const px_x2 = (c_xmax / 1000) * naturalWidth;
  const px_y2 = (c_ymax / 1000) * naturalHeight;

  const PAD = 2;
  const x = Math.max(0, Math.round(px_x1) - PAD);
  const y = Math.max(0, Math.round(px_y1) - PAD);
  const x2 = Math.min(naturalWidth || Infinity, Math.round(px_x2) + PAD);
  const y2 = Math.min(naturalHeight || Infinity, Math.round(px_y2) + PAD);
  const w = x2 - x, h = y2 - y;
  if (w <= 0 || h <= 0) return null;
  return { x, y, width: w, height: h, _wasNormalized: true };
}
