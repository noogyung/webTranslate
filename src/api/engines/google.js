export const GT_BASE = "https://translate.googleapis.com/translate_a/single";
const GT_MAX_CHUNK = 2500;
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 2000;

function escapeXml(str) {
  return (str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function unescapeXml(str) {
  return (str || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function buildTagPayload(texts) {
  return texts.map((t, idx) => `<block id="${idx}">${escapeXml(t)}</block>`).join("\n");
}

function parseTagPayload(translatedHtml, count) {
  const results = new Array(count).fill("");
  const regex = /<block\s+id=["']?(\d+)["']?>([\s\S]*?)<\/block>/gi;
  let match;
  let foundCount = 0;
  while ((match = regex.exec(translatedHtml)) !== null) {
    const idx = parseInt(match[1], 10);
    if (idx >= 0 && idx < count) {
      results[idx] = unescapeXml(match[2].trim());
      foundCount++;
    }
  }
  return { results, foundCount };
}

export async function translateWithGoogle(texts, targetLang, options = {}) {
  const cleaned = texts.map((t) => (t || "").trim());

  const chunks = [];
  let curTexts = [], curIndices = [], curSize = 0;

  cleaned.forEach((text, i) => {
    if (!text) return;
    const tagLen = `<block id="${i}">${text}</block>\n`.length;
    if (curSize + tagLen > GT_MAX_CHUNK && curTexts.length > 0) {
      chunks.push({ texts: curTexts.slice(), indices: curIndices.slice() });
      curTexts = []; curIndices = []; curSize = 0;
    }
    curTexts.push(text);
    curIndices.push(i);
    curSize += tagLen;
  });
  if (curTexts.length > 0) chunks.push({ texts: curTexts, indices: curIndices });

  if (chunks.length === 0) return new Array(texts.length).fill("");

  const results = new Array(texts.length).fill("");
  const CONCURRENCY = 4;
  let idx = 0;

  async function chunkWorker() {
    while (idx < chunks.length) {
      const chunk = chunks[idx++];
      await _translateGoogleChunk(chunk, targetLang, results);
    }
  }

  const workers = [];
  for (let i = 0; i < Math.min(CONCURRENCY, chunks.length); i++) {
    workers.push(chunkWorker());
  }
  await Promise.all(workers);

  return results;
}

async function _translateGoogleChunk(chunk, targetLang, results, attempt = 0) {
  const combined = buildTagPayload(chunk.texts);
  const url = `${GT_BASE}?client=gtx&sl=auto&tl=${encodeURIComponent(targetLang)}&dt=t`;

  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `q=${encodeURIComponent(combined)}`,
      signal: AbortSignal.timeout(6000),
    });
  } catch (err) {
    throw new Error(`Google 번역 네트워크 오류: ${err.message}`);
  }

  if (response.status === 429) {
    if (attempt < 1) {
      await new Promise((r) => setTimeout(r, 1000));
      return _translateGoogleChunk(chunk, targetLang, results, attempt + 1);
    }
    throw new Error("Google 번역 API 요청 한도 초과 (429)");
  }
  if (!response.ok) {
    throw new Error(`Google 번역 HTTP 오류: ${response.status}`);
  }

  const data = await response.json().catch(() => null);
  if (!data?.[0]) throw new Error("Google 번역 응답이 비어 있습니다.");

  const fullTranslation = data[0].map((seg) => seg?.[0] || "").join("");
  const { results: parsed, foundCount } = parseTagPayload(fullTranslation, chunk.texts.length);

  if (foundCount === chunk.texts.length) {
    chunk.indices.forEach((origIdx, j) => {
      results[origIdx] = parsed[j] || chunk.texts[j];
    });
  } else {
    console.warn(`[WebTranslator] Google 태그 분리 미완료 (${foundCount}/${chunk.texts.length}), 개별 번역 진행`);
    await _fallbackIndividual(chunk, targetLang, results);
  }
}

async function _fallbackIndividual(chunk, targetLang, results) {
  const CONCURRENCY = 2;
  let failCount = 0;

  async function worker() {
    for (let i = 0; i < chunk.texts.length; i++) {
      const text = chunk.texts[i];
      if (!text) continue;

      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const url = `${GT_BASE}?client=gtx&sl=auto&tl=${encodeURIComponent(targetLang)}&dt=t`;
          const resp = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: `q=${encodeURIComponent(text)}`,
          });

          if (resp.status === 429) {
            if (attempt < 2) {
              await new Promise((r) => setTimeout(r, BASE_DELAY_MS * Math.pow(2, attempt)));
              continue;
            }
            failCount++;
            break;
          }
          if (!resp.ok) { failCount++; break; }

          const data = await resp.json().catch(() => null);
          if (data?.[0]) {
            results[chunk.indices[i]] = data[0].map((s) => s?.[0] || "").join("");
          }
          break;
        } catch {
          if (attempt === 2) failCount++;
        }
      }
    }
  }

  const workers = [];
  for (let i = 0; i < Math.min(CONCURRENCY, chunk.texts.length); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  if (failCount > chunk.texts.length * 0.8) {
    throw new Error("Google 번역 API 접근이 차단되었습니다. 잠시 후 다시 시도하세요.");
  }
}

export async function fetchGoogleDictionary(word, targetLang) {
  const url = `${GT_BASE}?client=gtx&sl=auto&tl=${encodeURIComponent(targetLang)}&hl=${encodeURIComponent(targetLang)}&dt=t&dt=bd&dt=rm&q=${encodeURIComponent(word)}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Google 사전 HTTP ${resp.status}`);
  const data = await resp.json();

  const primaryTrans = data[0]?.map((s) => s[0]).join("") || word;
  const phonetic = data[0]?.[1]?.[3] || data[0]?.[1]?.[2] || "";

  const definitions = [];
  if (Array.isArray(data[1])) {
    data[1].slice(0, 3).forEach((item) => {
      const pos = item[0] || "뜻";
      const meaningStr = Array.isArray(item[1]) ? item[1].slice(0, 3).join(", ") : primaryTrans;
      definitions.push({
        pos,
        meaning: meaningStr,
        example: null,
      });
    });
  } else {
    definitions.push({
      pos: "뜻",
      meaning: primaryTrans,
      example: null,
    });
  }

  return {
    word: word,
    pronunciation: phonetic ? `[${phonetic}]` : "",
    inflections: "",
    definitions: definitions.slice(0, 3),
  };
}
