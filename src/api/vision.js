import { getLanguageName } from './constants.js';
import { translateWithOpenAI } from './engines/openai.js';
import { translateWithGemini } from './engines/gemini.js';

export async function translateImageWithVision({
  base64DataUrl,
  naturalWidth,
  naturalHeight,
  mode = "gemini",
  apiKey = "",
  geminiModel = "gemini-3.6-flash",
  openaiApiKey = "",
  openaiModel = "gpt-4o-mini",
  userSpecifiedModel = "",
  targetLang = "ko"
}) {
  const langName = getLanguageName(targetLang);

  const match = base64DataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
  if (!match) {
    throw new Error("올바르지 않은 이미지 Base64 포맷입니다.");
  }
  const mimeType = match[1];
  const base64Data = match[2];

  const imageDimNotice = (naturalWidth && naturalHeight)
    ? `The image dimensions are ${naturalWidth} pixels wide by ${naturalHeight} pixels high.\n`
    : "";

  const ocrSystemInstruction =
    `You are a high-precision OCR Layout Analyzer and Translator for image translation.\n\n` +
    imageDimNotice +
    `Detect every visible text block in the image, extract its layout, and provide the ${langName} translation.\n\n` +
    `Rules:\n` +
    `- Detect all text regardless of language.\n` +
    `- Treat each independent text region as a separate object.\n` +
    `- Never merge unrelated text.\n` +
    `- Classify each block as one of: container, text, sfx, ui, caption.\n` +
    `- Preserve original text exactly, including punctuation and line breaks.\n` +
    `- Split every visual line into the "lines" array.\n` +
    `- Return actual image pixel coordinates [ymin, xmin, ymax, xmax] matching the original image dimensions.\n` +
    `- glyphBox must tightly enclose only visible glyph pixels in actual pixel coordinates.\n` +
    `- eraseBox must fully cover the text for clean removal in actual pixel coordinates.\n` +
    `- containerBox is the drawable region for translated text in actual pixel coordinates, or null if unavailable.\n` +
    `- Detect orientation: horizontal, vertical or rotated.\n` +
    `- Estimate textColor, backgroundColor and strokeColor when visible.\n` +
    `- For "translatedText": translate the originalText to ${langName}. Preserve line breaks (\\n). Maintain natural, context-aware ${langName} phrasing.\n` +
    `- Return only valid JSON without markdown or explanation.\n\n` +
    `Output format:\n` +
    `[\n` +
    `  {\n` +
    `    "type":"container",\n` +
    `    "glyphBox":[ymin,xmin,ymax,xmax],\n` +
    `    "eraseBox":[ymin,xmin,ymax,xmax],\n` +
    `    "containerBox":[ymin,xmin,ymax,xmax] | null,\n` +
    `    "lines":[\n` +
    `      {\n` +
    `        "glyphBox":[ymin,xmin,ymax,xmax],\n` +
    `        "eraseBox":[ymin,xmin,ymax,xmax]\n` +
    `      }\n` +
    `    ],\n` +
    `    "orientation":"horizontal|vertical|rotated",\n` +
    `    "originalText":"...",\n` +
    `    "translatedText":"...(${langName} translation)...",\n` +
    `    "textColor":"#000000",\n` +
    `    "backgroundColor":"#FFFFFF",\n` +
    `    "strokeColor":"#000000"\n` +
    `  }\n` +
    `]`;

  let rawContent = "";

  if (mode === "openai") {
    const key = openaiApiKey || apiKey;
    if (!key) throw new Error("OpenAI API Key가 설정되지 않았습니다.");
    const model = openaiModel || "gpt-4o-mini";

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: ocrSystemInstruction },
              { type: "image_url", image_url: { url: base64DataUrl, detail: "high" } }
            ]
          }
        ],
        max_completion_tokens: 2048,
        temperature: 0.0,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI Vision HTTP ${response.status}: ${errText}`);
    }

    const data = await response.json();
    rawContent = data.choices?.[0]?.message?.content || "";
  } else {
    const key = apiKey || openaiApiKey;
    if (!key) throw new Error("Gemini API Key가 설정되지 않았습니다.");
    const model = geminiModel || "gemini-3.6-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: ocrSystemInstruction },
              { inline_data: { mime_type: mimeType, data: base64Data } }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.0,
          response_mime_type: "application/json"
        }
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini Vision HTTP ${response.status}: ${errText}`);
    }

    const data = await response.json();
    rawContent = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  }

  const ocrBlocks = parseVisionJsonResponse(rawContent);
  if (!Array.isArray(ocrBlocks) || ocrBlocks.length === 0) {
    console.warn("[WT Image Debug] OCR 추출 실패: 감지된 텍스트가 없습니다.");
    return [];
  }

  // Step B: 1-Pass — OCR 결과의 translatedText 직접 사용 (2차 번역 API 불필요)
  const finalBlocks = ocrBlocks.map((block) => ({
    ...block,
    translatedText: block.translatedText?.trim() || block.originalText || "",
    eraseBox: normalizeBox(block.eraseBox, naturalWidth, naturalHeight),
    glyphBox: normalizeBox(block.glyphBox, naturalWidth, naturalHeight),
    containerBox: normalizeBox(block.containerBox, naturalWidth, naturalHeight),
  })).filter(b => b.eraseBox !== null);

  console.group(`[WT Step 1-Pass] OCR+번역 완료 — ${finalBlocks.length}개 블록`);
  console.table(
    finalBlocks.map((b, idx) => ({
      Index: `#${idx}`,
      Type: b.type || "container",
      Orientation: b.orientation || "horizontal",
      OriginalText: b.originalText,
      TranslatedText: b.translatedText,
      BBox: JSON.stringify(b.bbox || b.glyphBox || b.eraseBox || b.containerBox)
    }))
  );
  console.groupEnd();

  return finalBlocks;
}

export async function locateBoundingBoxesWithVision({
  base64DataUrl,
  naturalWidth,
  naturalHeight,
  mode = "gemini",
  apiKey = "",
  geminiModel = "gemini-3.6-flash",
  openaiApiKey = "",
  openaiModel = "gpt-4o-mini",
}) {
  const blocks = await translateImageWithVision({
    base64DataUrl,
    naturalWidth,
    naturalHeight,
    mode,
    apiKey,
    geminiModel,
    openaiApiKey,
    openaiModel,
    targetLang: "ko",
  });

  if (!Array.isArray(blocks)) return [];

  return blocks
    .map((b) => ({
      box: b.glyphBox || b.eraseBox || b.containerBox,
      text: b.originalText || "",
    }))
    .filter((item) => item.box && item.box.length === 4);
}

function parseVisionJsonResponse(rawText) {
  if (!rawText || rawText.trim() === "") {
    return [];
  }

  const cleanJsonStr = rawText
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  try {
    const parsed = JSON.parse(cleanJsonStr);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed.textBlocks)) return parsed.textBlocks;
    if (Array.isArray(parsed.data)) return parsed.data;
    return [];
  } catch (err) {
    console.error("[WebTranslator] Vision JSON 파싱 오류:", err, "raw:", rawText);
    return [];
  }
}

/**
 * [ymin, xmin, ymax, xmax] 배열을 { x, y, width, height } 객체로 변환.
 * 좌표가 유효 범위를 벗어나면 클램핑, 면적이 0 이하이면 null 반환.
 */
export function normalizeBox(rawBox, naturalWidth, naturalHeight) {
  if (!rawBox || !Array.isArray(rawBox) || rawBox.length !== 4) return null;
  const [ymin, xmin, ymax, xmax] = rawBox;

  // Gemini Vision은 프롬프트에 "pixel coordinates"를 요청해도
  // 실제로는 0~1000 정규화 좌표를 반환합니다.
  // 좌표가 0~1000 범위인지 픽셀 범위인지 자동 감지:
  // - 모든 좌표값이 0~1000 이내이고
  // - 실제 이미지 크기가 1000보다 크다면 → 정규화 좌표로 판단
  const maxCoord = Math.max(ymin, xmin, ymax, xmax);
  const isNormalized = maxCoord <= 1000 && (naturalWidth > 1000 || naturalHeight > 1000);

  let px_xmin, px_ymin, px_xmax, px_ymax;
  if (isNormalized) {
    px_xmin = (xmin / 1000) * naturalWidth;
    px_ymin = (ymin / 1000) * naturalHeight;
    px_xmax = (xmax / 1000) * naturalWidth;
    px_ymax = (ymax / 1000) * naturalHeight;
  } else {
    px_xmin = xmin;
    px_ymin = ymin;
    px_xmax = xmax;
    px_ymax = ymax;
  }

  const PAD = 2;
  const x = Math.max(0, Math.round(px_xmin) - PAD);
  const y = Math.max(0, Math.round(px_ymin) - PAD);
  const x2 = Math.min(naturalWidth, Math.round(px_xmax) + PAD);
  const y2 = Math.min(naturalHeight, Math.round(px_ymax) + PAD);
  const width = x2 - x;
  const height = y2 - y;

  if (width <= 0 || height <= 0) return null;
  return { x, y, width, height, _wasNormalized: isNormalized };
}

