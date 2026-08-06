export function buildTranslationPrompt(langName, engineType, customPrompt = "", options = {}) {
  if (engineType === "ollama") {
    let prompt = `You are a translator into ${langName}.\n` +
                 `Translate each text item in the input into ${langName}.\n`;
    if (customPrompt && customPrompt.trim() !== "") {
      prompt += `ADDITIONAL INSTRUCTIONS:\n${customPrompt.trim()}\n\n`;
    }
    prompt += `CRITICAL: Return ONLY a JSON object formatted exactly as: {"translations": ["translated_1", "translated_2"]}`;
    return prompt;
  }

  let baseRules = 
    `You are a professional comic, manga, and website translator into natural, fluent ${langName}.\n` +
    `CRITICAL TRANSLATION RULES:\n` +
    `- Translate all dialogue, narration, and text accurately and naturally into fluent ${langName}.\n` +
    `- The input array may contain a mix of different source languages (e.g., English, Chinese, Japanese, Russian). You MUST detect the source language of EACH item individually and translate ALL of them into ${langName}.\n` +
    `- NEVER skip any item. Every single string in the input array MUST be translated. Do NOT return empty strings or copy the original text verbatim unless it is a proper noun.\n` +
    `- Transliterate character names and surnames accurately according to standard pronunciation in ${langName}.\n` +
    `- Maintain consistent terminology, dialogue relationships, and natural spoken tone appropriate for the context.\n` +
    `- Preserve original punctuation, whitespace, and numbers.\n`;

  if (options.pageContext) {
    baseRules += `- PAGE-WIDE CONTEXT: The texts below all belong to the SAME image/page. Read ALL texts together to understand character names, dialogue relationships, and tone consistency before translating each line.\n`;
  }

  let formatRules = "";
  
  if (engineType === "gemini") {
    formatRules = `- Return ONLY a JSON array of strings (same length as input). No markdown wrapper, no explanation.`;
  } else if (engineType === "openai") {
    formatRules = `- Maintain EXACT 1-to-1 array order and length.\n` +
                  `- Return ONLY a valid JSON object with the key "translations" mapped to an array of translated strings. Do NOT add explanation, markdown formatting, or notes.`;
  } else if (engineType === "claude") {
    formatRules = `- Return ONLY a JSON object with key "translations" containing an array of strings in exact order. No markdown wrapper, no conversational text.\n` +
                  `Example: {"translations": ["번역문1", "번역문2"]}`;
  }

  return baseRules + formatRules;
}

export function buildDictionaryPrompt(word, langName) {
  return `Provide a concise dictionary entry for the input text "${word}" translated into ${langName}.\n` +
    `CRITICAL INSTRUCTIONS:\n` +
    `1. If the input is a single word: Provide AT MOST THE TOP 3 MOST COMMON definitions.\n` +
    `   - Each definition MUST have a short, concise ${langName} meaning (2 to 5 words only).\n` +
    `   - Provide a realistic example sentence matching the definition.\n` +
    `2. If the input is a PHRASE or FULL SENTENCE (not a single word):\n` +
    `   - Set "pos" to "구" (Phrase) or "문장" (Sentence).\n` +
    `   - Provide the direct, natural translation of the entire phrase/sentence in the "meaning" field.\n` +
    `   - DO NOT generate or invent an "example". Set the "example" field to null.\n` +
    `3. "pronunciation": Provide the phonetic pronunciation of the ORIGINAL SOURCE TEXT, transliterated into the characters of the target language (${langName}). For example, if the source is Japanese and the target is Korean, write the Japanese pronunciation using Korean Hangul. DO NOT translate the text in this field.\n` +
    `4. Return ONLY a valid JSON object matching this schema:\n` +
    `{"word":"${word}","pronunciation":"[Phonetic characters in ${langName}]","definitions":[{"pos":"Part of speech","meaning":"Meaning or Translation","example":{"source":"Original example sentence","target":"Translated example sentence"}}]}`;
}
