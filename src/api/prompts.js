export function buildTranslationPrompt(langName, engineType, customPrompt = "", options = {}) {
  if (engineType === "ollama") {
    let prompt = `You are a translator into ${langName}.\n` +
                 `Translate each text item in the input into ${langName}.\n`;
    if (customPrompt && customPrompt.trim() !== "") {
      prompt += `ADDITIONAL INSTRUCTIONS:\n${customPrompt.trim()}\n\n`;
    }
    if (options.isPopup && options.showPhonetics) {
      let phLang = `How to read the original text in ${langName} pronunciation`;
      prompt += `CRITICAL: Return ONLY a JSON object formatted exactly as: {"translations": ["translated_1", "translated_2"], "phonetics": ["${phLang}"]}`;
    } else {
      prompt += `CRITICAL: Return ONLY a JSON object formatted exactly as: {"translations": ["translated_1", "translated_2"]}`;
    }
    return prompt;
  }

  let baseRules = 
    `You are a professional comic, manga, and website translator into natural, fluent ${langName}.\n` +
    `CRITICAL TRANSLATION RULES:\n` +
    `- Translate all dialogue, narration, and text accurately and naturally into fluent ${langName}.\n` +
    `- Transliterate character names and surnames accurately according to standard pronunciation in ${langName}.\n` +
    `- Maintain consistent terminology, dialogue relationships, and natural spoken tone appropriate for the context.\n` +
    `- Preserve original punctuation, whitespace, and numbers.\n`;

  if (options.pageContext) {
    baseRules += `- PAGE-WIDE CONTEXT: The texts below all belong to the SAME image/page. Read ALL texts together to understand character names, dialogue relationships, and tone consistency before translating each line.\n`;
  }

  let formatRules = "";
  let phoneticRule = "";
  
  if (options.isPopup && options.showPhonetics) {
    let phLang = `How to read the original text using ${langName} characters (transliteration/pronunciation)`;
    phoneticRule = `- Also provide the phonetic reading of the ORIGINAL text. Format it in ${phLang}.\n`;
  }

  if (engineType === "gemini") {
    if (options.isPopup && options.showPhonetics) {
      formatRules = `- Return ONLY a JSON object with "translations" array and "phonetics" array. No markdown wrapper, no explanation.`;
    } else {
      formatRules = `- Return ONLY a JSON array of strings (same length as input). No markdown wrapper, no explanation.`;
    }
  } else if (engineType === "openai") {
    if (options.isPopup && options.showPhonetics) {
      formatRules = `- Maintain EXACT 1-to-1 array order and length.\n` +
                    `- Return ONLY a valid JSON object with the keys "translations" (array of translated strings) and "phonetics" (array of phonetic strings). Do NOT add explanation, markdown formatting, or notes.`;
    } else {
      formatRules = `- Maintain EXACT 1-to-1 array order and length.\n` +
                    `- Return ONLY a valid JSON object with the key "translations" mapped to an array of translated strings. Do NOT add explanation, markdown formatting, or notes.`;
    }
  } else if (engineType === "claude") {
    if (options.isPopup && options.showPhonetics) {
      formatRules = `- Return ONLY a JSON object with keys "translations" and "phonetics" containing arrays of strings in exact order. No markdown wrapper, no conversational text.\n` +
                    `Example: {"translations": ["번역문1"], "phonetics": ["phonetic1"]}`;
    } else {
      formatRules = `- Return ONLY a JSON object with key "translations" containing an array of strings in exact order. No markdown wrapper, no conversational text.\n` +
                    `Example: {"translations": ["번역문1", "번역문2"]}`;
    }
  }

  return baseRules + phoneticRule + formatRules;
}

export function buildDictionaryPrompt(word, langName) {
  return `Provide a concise dictionary entry for "${word}" translated into ${langName}.\n` +
    `CRITICAL INSTRUCTIONS:\n` +
    `1. Provide AT MOST THE TOP 3 MOST COMMON definitions.\n` +
    `2. Each definition MUST have a short, concise ${langName} meaning (2 to 5 words only, e.g. "경기, 놀이" or "(시스템을) 악용하다"). Do NOT write long explanatory sentences!\n` +
    `3. For EVERY definition, provide a realistic example sentence in source language with its natural ${langName} translation that ACCURATELY matches that specific definition.\n` +
    `4. Return ONLY a JSON object: {"word":"${word}","pronunciation":"[How to read the original word in ${langName} characters]","inflections":"","definitions":[{"pos":"Part of speech in ${langName}","meaning":"Short concise meaning","example":{"en":"Example","ko":"Translation"}}]}`;
}
