const LIBRE_CONCURRENCY = 6;

export async function translateWithLibre(texts, targetLang, serverUrl, options = {}) {
  if (!serverUrl) {
    throw new Error("LibreTranslate 서버 주소가 설정되지 않았습니다.");
  }

  const baseUrl = serverUrl.replace(/\/$/, "");
  const endpoint = `${baseUrl}/translate`;

  const results = new Array(texts.length).fill("");
  let idx = 0;

  async function worker() {
    while (idx < texts.length) {
      const curIdx = idx++;
      const origText = (texts[curIdx] || "").trim();
      if (!origText) continue;

      let queryText = origText;
      if (/^[A-Z0-9\s\W_]+$/.test(origText) && /[A-Z]/.test(origText) && origText.length <= 40) {
        queryText = origText.toLowerCase().replace(/(?:^|\s|-)\S/g, (c) => c.toUpperCase());
      }

      results[curIdx] = await _libreSingle(queryText, targetLang, endpoint);
    }
  }

  const workers = [];
  for (let i = 0; i < Math.min(LIBRE_CONCURRENCY, texts.length); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  return results;
}

async function _libreSingle(text, targetLang, endpoint) {
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        q: text,
        source: "auto",
        target: targetLang,
        format: "text"
      }),
    });

    if (!response.ok) return text;
    const data = await response.json();
    const trans = typeof data.translatedText === "string" ? data.translatedText.trim() : text;
    return trans || text;
  } catch {
    return text;
  }
}

export async function fetchLibreDictionary(word, targetLang, serverUrl) {
  if (!serverUrl) {
    throw new Error("LibreTranslate 서버 주소가 설정되지 않았습니다.");
  }
  const baseUrl = serverUrl.replace(/\/$/, "");
  const endpoint = `${baseUrl}/translate`;

  const translatedText = await _libreSingle(word, targetLang, endpoint);

  return {
    word: word,
    pronunciation: "",
    inflections: "",
    definitions: [
      {
        pos: "번역",
        meaning: translatedText || word,
        example: null,
      },
    ],
  };
}
