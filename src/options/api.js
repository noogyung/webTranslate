export async function fetchGeminiModels(apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    const errData = await resp.json().catch(() => ({}));
    throw new Error(errData.error?.message || `HTTP ${resp.status}`);
  }
  const data = await resp.json();
  return (data.models || [])
    .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
    .map((m) => m.name.replace(/^models\//, ""));
}

export async function fetchOpenAIModels(apiKey) {
  const response = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error?.message || `HTTP ${response.status}`);
  }
  const data = await response.json();
  return (data.data || [])
    .map((m) => m.id)
    .filter((id) => {
      const lid = id.toLowerCase();
      return lid.startsWith("gpt-") && !lid.includes("audio") && !lid.includes("realtime") && !lid.includes("embedding") && !lid.includes("instruct") && !lid.includes("tts") && !lid.includes("whisper") && !lid.includes("dall-e");
    })
    .sort();
}
