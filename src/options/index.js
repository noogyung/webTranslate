import { getSettings, saveSettings, clearTranslationCache } from "./storage.js";
import { fetchGeminiModels, fetchOpenAIModels } from "./api.js";
import { updateUI, updateStylePreview, showSaveStatus } from "./ui.js";
import { initDictionaryModal, setCustomDict, getCustomDict } from "./dictionary.js";

/* ── DOM 요소 참조 ──────────────────────────────────────────── */
const modeRadios = document.querySelectorAll('input[name="translationMode"]');
const displayRadios = document.querySelectorAll('input[name="displayMode"]');
const geminiApiKeyInput = document.getElementById("geminiApiKey");
const geminiModelInput = document.getElementById("geminiModel");
const libreUrlInput = document.getElementById("libreUrl");
const toggleKeyBtn = document.getElementById("toggleKeyVisibility");
const targetLangSelect = document.getElementById("targetLang");
const customShortcutInput = document.getElementById("customShortcut");
const saveBtn = document.getElementById("saveBtn");
const lazyTranslateInput = document.getElementById("lazyTranslate");
const inlineShadowInput = document.getElementById("inlineShadow");
const inlineHighlightInput = document.getElementById("inlineHighlight");
const inlineAdaptiveColorInput = document.getElementById("inlineAdaptiveColor");
const inlineInheritColorInput = document.getElementById("inlineInheritColor");
const inlineOptionsToggle = document.getElementById("inlineOptionsToggle");
const inlineOptionsMenu = document.getElementById("inlineOptionsMenu");
const inlineOptionsLabel = document.getElementById("inlineOptionsLabel");

function updateInlineOptionsLabel() {
  if (!inlineOptionsLabel) return;
  let count = 0;
  if (inlineShadowInput && inlineShadowInput.checked) count++;
  if (inlineHighlightInput && inlineHighlightInput.checked) count++;
  if (inlineAdaptiveColorInput && inlineAdaptiveColorInput.checked) count++;
  if (inlineInheritColorInput && inlineInheritColorInput.checked) count++;
  
  if (count === 0) inlineOptionsLabel.textContent = "선택 없음";
  else inlineOptionsLabel.textContent = `선택된 옵션 (${count})`;
}

const loadModelsBtn = document.getElementById("loadModelsBtn");
const loadModelsHint = document.getElementById("loadModelsHint");
const geminiModelList = document.getElementById("geminiModelList");

const openaiApiKeyInput = document.getElementById("openaiApiKey");
const openaiModelInput = document.getElementById("openaiModel");
const loadOpenAIModelsBtn = document.getElementById("loadOpenAIModelsBtn");
const openaiModelList = document.getElementById("openaiModelList");

const claudeApiKeyInput = document.getElementById("claudeApiKey");
const claudeModelSelect = document.getElementById("claudeModel");

const ollamaUrlInput = document.getElementById("ollamaUrl");
const ollamaModelInput = document.getElementById("ollamaModel");
const ollamaCustomPromptInput = document.getElementById("ollamaCustomPrompt");

const transColorInput = document.getElementById("transColor");
const transFontSizeSelect = document.getElementById("transFontSize");
const transItalicInput = document.getElementById("transItalic");
const transBgAlphaInput = document.getElementById("transBgAlpha");
const resetStyleBtn = document.getElementById("resetStyleBtn");
const clearCacheBtn = document.getElementById("clearCacheBtn");
const resetShortcutBtn = document.getElementById("resetShortcutBtn");

/* ── 초기화 ──────────────────────────────────────────────── */
async function initialize() {
  const settings = await getSettings();

  // 번역 모드
  const modeRadio = document.querySelector(`input[name="translationMode"][value="${settings.translationMode}"]`);
  if (modeRadio) modeRadio.checked = true;

  // API Key & Models
  if (geminiApiKeyInput) geminiApiKeyInput.value = settings.geminiApiKey || "";
  if (geminiModelInput) geminiModelInput.value = settings.geminiModel || "gemini-flash-lite-latest";
  if (openaiApiKeyInput) openaiApiKeyInput.value = settings.openaiApiKey || "";
  if (openaiModelInput) openaiModelInput.value = settings.openaiModel || "gpt-4o-mini";
  if (claudeApiKeyInput) claudeApiKeyInput.value = settings.claudeApiKey || "";
  if (claudeModelSelect) claudeModelSelect.value = settings.claudeModel || "claude-3-5-haiku-20241022";
  if (ollamaUrlInput) ollamaUrlInput.value = settings.ollamaUrl || "http://localhost:11434";
  if (ollamaModelInput) ollamaModelInput.value = settings.ollamaModel || "qwen2.5";
  if (ollamaCustomPromptInput) ollamaCustomPromptInput.value = settings.ollamaCustomPrompt || "";
  if (libreUrlInput) libreUrlInput.value = settings.libreUrl || "http://localhost:5000";

  // UI 업데이트
  updateUI(settings.translationMode);

  // 표시 모드
  const selectedDisplay = document.querySelector(`input[name="displayMode"][value="${settings.displayMode}"]`);
  if (selectedDisplay) selectedDisplay.checked = true;

  // 목표 언어
  if (targetLangSelect) targetLangSelect.value = settings.targetLang;
  if (customShortcutInput) customShortcutInput.value = settings.customShortcut || "Alt+A";

  // 지연 번역 및 인라인 가독성 옵션
  if (lazyTranslateInput) lazyTranslateInput.checked = settings.lazyTranslate;
  if (inlineShadowInput) inlineShadowInput.checked = settings.inlineShadow || false;
  if (inlineHighlightInput) inlineHighlightInput.checked = settings.inlineHighlight || false;
  if (inlineAdaptiveColorInput) inlineAdaptiveColorInput.checked = settings.inlineAdaptiveColor || false;
  if (inlineInheritColorInput) inlineInheritColorInput.checked = settings.inlineInheritColor || false;

  // 번역 스타일 설정
  if (transColorInput) transColorInput.value = settings.transColor || "#818cf8";
  if (transFontSizeSelect) transFontSizeSelect.value = settings.transFontSize || "100%";
  if (transItalicInput) transItalicInput.checked = settings.transItalic || false;
  if (transBgAlphaInput) transBgAlphaInput.value = settings.transBgAlpha !== undefined ? settings.transBgAlpha : 0.12;
  updateStylePreview();
  updateInlineOptionsLabel();
  
  // 사용자 사전
  setCustomDict(settings.customDict || []);

  // 사전 모달 이벤트 위임
  initDictionaryModal(async (newDict) => {
    await saveSettings({ customDict: newDict });
  });
}

document.addEventListener("DOMContentLoaded", initialize);

/* ── 이벤트 리스너 등록 ────────────────────────────────────── */

if (loadModelsBtn) {
  loadModelsBtn.addEventListener("click", async () => {
    const apiKey = geminiApiKeyInput.value.trim();
    if (!apiKey) {
      alert("Gemini API Key를 먼저 입력해 주세요.");
      return;
    }
    loadModelsBtn.disabled = true;
    loadModelsBtn.textContent = "조회 중...";
    try {
      const validModels = await fetchGeminiModels(apiKey);
      if (validModels.length > 0) {
        geminiModelList.innerHTML = "";
        validModels.forEach((m) => {
          const opt = document.createElement("option");
          opt.value = m;
          geminiModelList.appendChild(opt);
        });
        if (!geminiModelInput.value || !validModels.includes(geminiModelInput.value)) {
          const pref = validModels.find(m => m.includes("flash-lite-latest")) ||
                       validModels.find(m => m.includes("flash-latest")) ||
                       validModels.find(m => m.includes("2.5") && m.includes("flash")) ||
                       validModels.find(m => m.includes("2.0") && m.includes("flash")) ||
                       validModels[0];
          geminiModelInput.value = pref;
        }
        if (loadModelsHint) {
          loadModelsHint.textContent = `✅ 총 ${validModels.length}개의 가용 모델을 불러왔습니다.`;
          loadModelsHint.style.color = "#4ade80";
        }
      } else {
        alert("가용한 모델을 찾지 못했습니다.");
      }
    } catch (err) {
      alert(`모델 목록 조회 실패: ${err.message}`);
    } finally {
      loadModelsBtn.disabled = false;
      loadModelsBtn.textContent = "가용 모델 조회";
    }
  });
}

if (loadOpenAIModelsBtn) {
  loadOpenAIModelsBtn.addEventListener("click", async () => {
    const apiKey = openaiApiKeyInput.value.trim();
    if (!apiKey) {
      showSaveStatus("OpenAI API Key를 먼저 입력해 주세요.", "error");
      openaiApiKeyInput.focus();
      return;
    }
    loadOpenAIModelsBtn.disabled = true;
    loadOpenAIModelsBtn.textContent = "조회 중...";
    try {
      const validModels = await fetchOpenAIModels(apiKey);
      if (validModels.length > 0) {
        if (openaiModelList) {
          openaiModelList.innerHTML = "";
          validModels.forEach((m) => {
            const opt = document.createElement("option");
            opt.value = m;
            openaiModelList.appendChild(opt);
          });
        }
        if (!openaiModelInput.value || !validModels.includes(openaiModelInput.value)) {
          openaiModelInput.value = validModels.find(m => m.includes("4o-mini")) || validModels[0];
        }
        showSaveStatus(`✓ 총 ${validModels.length}개의 OpenAI 가용 모델을 불러왔습니다.`, "success");
      } else {
        showSaveStatus("가용한 OpenAI 모델을 찾지 못했습니다.", "error");
      }
    } catch (err) {
      showSaveStatus(`OpenAI 모델 조회 실패: ${err.message}`, "error");
    } finally {
      loadOpenAIModelsBtn.disabled = false;
      loadOpenAIModelsBtn.textContent = "가용 모델 조회";
    }
  });
}

if (transColorInput) transColorInput.addEventListener("input", updateStylePreview);
if (transFontSizeSelect) transFontSizeSelect.addEventListener("change", updateStylePreview);
if (transItalicInput) transItalicInput.addEventListener("change", updateStylePreview);
if (transBgAlphaInput) transBgAlphaInput.addEventListener("input", updateStylePreview);

if (inlineOptionsToggle && inlineOptionsMenu) {
  inlineOptionsToggle.addEventListener("click", (e) => {
    e.stopPropagation();
    const isVisible = inlineOptionsMenu.style.display === "block";
    inlineOptionsMenu.style.display = isVisible ? "none" : "block";
  });
  
  document.addEventListener("click", (e) => {
    if (!inlineOptionsToggle.contains(e.target) && !inlineOptionsMenu.contains(e.target)) {
      inlineOptionsMenu.style.display = "none";
    }
  });
}

const handleInlineChange = () => { updateStylePreview(); updateInlineOptionsLabel(); };
if (inlineShadowInput) inlineShadowInput.addEventListener("change", handleInlineChange);
if (inlineHighlightInput) inlineHighlightInput.addEventListener("change", handleInlineChange);
if (inlineAdaptiveColorInput) inlineAdaptiveColorInput.addEventListener("change", handleInlineChange);
if (inlineInheritColorInput) inlineInheritColorInput.addEventListener("change", handleInlineChange);

modeRadios.forEach((radio) => {
  radio.addEventListener("change", (e) => {
    updateUI(e.target.value);
  });
});

if (toggleKeyBtn) {
  toggleKeyBtn.addEventListener("click", () => {
    const isPassword = geminiApiKeyInput.type === "password";
    geminiApiKeyInput.type = isPassword ? "text" : "password";
    toggleKeyBtn.title = isPassword ? "키 숨기기" : "키 보기";
  });
}

if (resetShortcutBtn) {
  resetShortcutBtn.addEventListener("click", () => {
    if (customShortcutInput) customShortcutInput.value = "Alt+A";
  });
}

if (customShortcutInput) {
  customShortcutInput.addEventListener("keydown", (e) => {
    e.preventDefault();
    if (e.key === "Tab" || e.key === "Shift" || e.key === "Control" || e.key === "Alt" || e.key === "Meta") {
      return;
    }
    let keys = [];
    if (e.ctrlKey) keys.push("Ctrl");
    if (e.altKey) keys.push("Alt");
    if (e.shiftKey) keys.push("Shift");
    keys.push(e.key.toUpperCase());
    customShortcutInput.value = keys.join("+");
  });
}

if (resetStyleBtn) {
  resetStyleBtn.addEventListener("click", async () => {
    if (transColorInput) transColorInput.value = "#818cf8";
    if (transFontSizeSelect) transFontSizeSelect.value = "100%";
    if (transItalicInput) transItalicInput.checked = false;
    if (transBgAlphaInput) transBgAlphaInput.value = "0.12";
    if (inlineShadowInput) inlineShadowInput.checked = false;
    if (inlineHighlightInput) inlineHighlightInput.checked = false;
    if (inlineAdaptiveColorInput) inlineAdaptiveColorInput.checked = false;
    if (inlineInheritColorInput) inlineInheritColorInput.checked = true;
    updateStylePreview();
    updateInlineOptionsLabel();

    try {
      await saveSettings({
        transColor: "#818cf8",
        transFontSize: "100%",
        transItalic: false,
        transBgAlpha: 0.12,
        inlineShadow: false,
        inlineHighlight: false,
        inlineAdaptiveColor: false,
        inlineInheritColor: true,
      });
      showSaveStatus("✓ 번역문 스타일이 기본값으로 초기화되었습니다.", "success");
    } catch(err) {
      showSaveStatus("초기화 저장 실패", "error");
    }
  });
}

if (clearCacheBtn) {
  clearCacheBtn.addEventListener("click", async () => {
    if (confirm("정말로 모든 번역 캐시를 삭제하시겠습니까?")) {
      try {
        await clearTranslationCache();
        showSaveStatus("✓ 캐시가 초기화되었습니다.", "success");
      } catch(err) {
        showSaveStatus("캐시 초기화 실패", "error");
      }
    }
  });
}

if (saveBtn) {
  saveBtn.addEventListener("click", async () => {
    const mode = document.querySelector('input[name="translationMode"]:checked')?.value;
    const display = document.querySelector('input[name="displayMode"]:checked')?.value;
    if (!mode || !display) return;

    if (mode === "gemini" && !geminiApiKeyInput.value.trim()) {
      showSaveStatus("Gemini API 키를 입력해 주세요.", "error");
      geminiApiKeyInput.focus();
      return;
    }
    if (mode === "openai" && !openaiApiKeyInput.value.trim()) {
      showSaveStatus("OpenAI API 키를 입력해 주세요.", "error");
      openaiApiKeyInput.focus();
      return;
    }
    if (mode === "claude" && !claudeApiKeyInput.value.trim()) {
      showSaveStatus("Claude API 키를 입력해 주세요.", "error");
      claudeApiKeyInput.focus();
      return;
    }
    if (mode === "libre" && !libreUrlInput.value.trim()) {
      showSaveStatus("LibreTranslate 서버 주소를 입력해 주세요.", "error");
      libreUrlInput.focus();
      return;
    }

    const settings = {
      translationMode: mode,
      geminiApiKey: geminiApiKeyInput.value.trim(),
      geminiModel: geminiModelInput.value.trim() || "gemini-flash-lite-latest",
      openaiApiKey: openaiApiKeyInput ? openaiApiKeyInput.value.trim() : "",
      openaiModel: openaiModelInput ? openaiModelInput.value.trim() : "gpt-4o-mini",
      claudeApiKey: claudeApiKeyInput ? claudeApiKeyInput.value.trim() : "",
      claudeModel: claudeModelSelect ? claudeModelSelect.value : "claude-3-5-haiku-20241022",
      ollamaUrl: ollamaUrlInput ? ollamaUrlInput.value.trim() : "http://localhost:11434",
      ollamaModel: ollamaModelInput ? ollamaModelInput.value.trim() : "qwen2.5",
      ollamaCustomPrompt: ollamaCustomPromptInput ? ollamaCustomPromptInput.value.trim() : "",
      libreUrl: libreUrlInput.value.trim() || "http://localhost:5000",
      targetLang: targetLangSelect ? targetLangSelect.value : "ko",
      customShortcut: customShortcutInput ? customShortcutInput.value : "Alt+A",
      displayMode: display,
      lazyTranslate: lazyTranslateInput ? lazyTranslateInput.checked : true,
      inlineShadow: inlineShadowInput ? inlineShadowInput.checked : false,
      inlineHighlight: inlineHighlightInput ? inlineHighlightInput.checked : false,
      inlineAdaptiveColor: inlineAdaptiveColorInput ? inlineAdaptiveColorInput.checked : false,
      inlineInheritColor: inlineInheritColorInput ? inlineInheritColorInput.checked : false,
      customDict: getCustomDict(),
      transColor: transColorInput ? transColorInput.value : "#818cf8",
      transFontSize: transFontSizeSelect ? transFontSizeSelect.value : "100%",
      transItalic: transItalicInput ? transItalicInput.checked : false,
      transBgAlpha: transBgAlphaInput ? parseFloat(transBgAlphaInput.value) : 0.12,
    };

    try {
      await saveSettings(settings);
      showSaveStatus("✓ 설정이 저장되었습니다.", "success");
    } catch(err) {
      showSaveStatus("저장 실패: " + err.message, "error");
    }
  });
}
