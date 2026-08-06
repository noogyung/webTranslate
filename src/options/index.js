/**
 * options.js — 옵션 페이지 로직
 *
 * Chrome Storage API를 사용하여 설정을 저장/불러옵니다.
 */

  let currentCustomDict = [];

  /* ── DOM 요소 참조 ──────────────────────────────────────────── */

  const modeRadios = document.querySelectorAll('input[name="translationMode"]');
  const displayRadios = document.querySelectorAll('input[name="displayMode"]');
  const apiKeySection = document.getElementById("apiKeySection");
  const geminiApiKeyInput = document.getElementById("geminiApiKey");
  const geminiModelInput = document.getElementById("geminiModel");
  const apiModelSection = document.getElementById("apiModelSection");
  const libreUrlSection = document.getElementById("libreUrlSection");
  const libreUrlInput = document.getElementById("libreUrl");
  const toggleKeyBtn = document.getElementById("toggleKeyVisibility");
  const targetLangSelect = document.getElementById("targetLang");
  const customShortcutInput = document.getElementById("customShortcut");
  const saveBtn = document.getElementById("saveBtn");
  const saveStatus = document.getElementById("saveStatus");
  const lazyTranslateInput = document.getElementById("lazyTranslate");
  const loadModelsBtn = document.getElementById("loadModelsBtn");
  const loadModelsHint = document.getElementById("loadModelsHint");
  const geminiModelList = document.getElementById("geminiModelList");
  
  const showPhoneticsInput = document.getElementById("showPhonetics");
  // Custom Dictionary DOM
  const addDictBtn = document.getElementById("addDictBtn");
  const dictTableBody = document.getElementById("dictTableBody");

  function createDictRow(orig = "", trans = "") {
    const tr = document.createElement("tr");
    
    const tdOrig = document.createElement("td");
    const inputOrig = document.createElement("input");
    inputOrig.type = "text";
    inputOrig.className = "dict-input orig-input";
    inputOrig.value = orig;
    inputOrig.placeholder = "예: Change Notes";
    inputOrig.spellcheck = false;
    tdOrig.appendChild(inputOrig);
    
    const tdTrans = document.createElement("td");
    const inputTrans = document.createElement("input");
    inputTrans.type = "text";
    inputTrans.className = "dict-input trans-input";
    inputTrans.value = trans;
    inputTrans.placeholder = "예: 변경 노트";
    inputTrans.spellcheck = false;
    tdTrans.appendChild(inputTrans);
    
    const tdDel = document.createElement("td");
    tdDel.style.textAlign = "center";
    const delBtn = document.createElement("button");
    delBtn.className = "dict-del-btn";
    delBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
    delBtn.addEventListener("click", () => tr.remove());
    tdDel.appendChild(delBtn);
    
    tr.appendChild(tdOrig);
    tr.appendChild(tdTrans);
    tr.appendChild(tdDel);
    dictTableBody.appendChild(tr);
  }

  if (addDictBtn) {
    addDictBtn.addEventListener("click", () => createDictRow());
  }

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
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
        const resp = await fetch(url);
        if (!resp.ok) {
          const errData = await resp.json().catch(() => ({}));
          throw new Error(errData.error?.message || `HTTP ${resp.status}`);
        }
        const data = await resp.json();
        const validModels = (data.models || [])
          .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
          .map((m) => m.name.replace(/^models\//, ""));

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
            loadModelsHint.textContent = `✅ 총 ${validModels.length}개의 가용 모델을 불러왔습니다: ${validModels.slice(0, 4).join(", ")} 등`;
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

  const openaiSection = document.getElementById("openaiSection");
  const openaiApiKeyInput = document.getElementById("openaiApiKey");
  const openaiModelInput = document.getElementById("openaiModel");
  const loadOpenAIModelsBtn = document.getElementById("loadOpenAIModelsBtn");
  const openaiModelList = document.getElementById("openaiModelList");

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
        const response = await fetch("https://api.openai.com/v1/models", {
          headers: { Authorization: `Bearer ${apiKey}` }
        });
        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error?.message || `HTTP ${response.status}`);
        }
        const data = await response.json();
        const validModels = (data.data || [])
          .map((m) => m.id)
          .filter((id) => {
            const lid = id.toLowerCase();
            return lid.startsWith("gpt-") && !lid.includes("audio") && !lid.includes("realtime") && !lid.includes("embedding") && !lid.includes("instruct") && !lid.includes("tts") && !lid.includes("whisper") && !lid.includes("dall-e");
          })
          .sort();

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
        showSaveStatus(`OpenAI 모델 목록 조회 실패: ${err.message}`, "error");
      } finally {
        loadOpenAIModelsBtn.disabled = false;
        loadOpenAIModelsBtn.textContent = "가용 모델 조회";
      }
    });
  }

  const claudeSection = document.getElementById("claudeSection");
  const claudeApiKeyInput = document.getElementById("claudeApiKey");
  const claudeModelSelect = document.getElementById("claudeModel");

  const ollamaSection = document.getElementById("ollamaSection");
  const ollamaUrlInput = document.getElementById("ollamaUrl");
  const ollamaModelInput = document.getElementById("ollamaModel");
  const ollamaCustomPromptInput = document.getElementById("ollamaCustomPrompt");

  function updateUI(mode) {
    const isGemini = mode === "gemini";
    const isOpenAI = mode === "openai";
    const isClaude = mode === "claude";
    const isOllama = mode === "ollama";
    const isLibre = mode === "libre";

    if (apiKeySection) apiKeySection.style.display = isGemini ? "block" : "none";
    if (apiModelSection) apiModelSection.style.display = isGemini ? "block" : "none";
    if (openaiSection) openaiSection.style.display = isOpenAI ? "block" : "none";
    if (claudeSection) claudeSection.style.display = isClaude ? "block" : "none";
    if (ollamaSection) ollamaSection.style.display = isOllama ? "block" : "none";
    if (libreUrlSection) libreUrlSection.style.display = isLibre ? "block" : "none";
  }

  // Style DOM References
  const transColorInput = document.getElementById("transColor");
  const transFontSizeSelect = document.getElementById("transFontSize");
  const transItalicInput = document.getElementById("transItalic");
  const transBgAlphaInput = document.getElementById("transBgAlpha");

  /* ── 초기화: 저장된 설정 불러오기 ───────────────────────────── */

  chrome.storage.sync.get(
    {
      translationMode: "google",
      geminiApiKey: "",
      targetLang: "ko",
      displayMode: "dual",
      geminiModel: "gemini-flash-lite-latest",
      openaiApiKey: "",
      openaiModel: "gpt-4o-mini",
      claudeApiKey: "",
      claudeModel: "claude-3-5-haiku-20241022",
      ollamaUrl: "http://localhost:11434",
      ollamaModel: "qwen2.5",
      ollamaCustomPrompt: "",
      libreUrl: "http://localhost:5000",
      lazyTranslate: true,
      customDict: [],
      transColor: "#818cf8",
      transFontSize: "100%",
      transItalic: false,
      transBgAlpha: 0.12,
      showPhonetics: true,
    },
    (settings) => {
      // 번역 모드
      const modeRadio = document.querySelector(
        `input[name="translationMode"][value="${settings.translationMode}"]`
      );
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
      targetLangSelect.value = settings.targetLang;
      if (customShortcutInput) customShortcutInput.value = settings.customShortcut || "Alt+A";

      // 지연 번역
      if (lazyTranslateInput) lazyTranslateInput.checked = settings.lazyTranslate;

      // 번역 스타일 설정
      if (transColorInput) transColorInput.value = settings.transColor || "#818cf8";
      if (transFontSizeSelect) transFontSizeSelect.value = settings.transFontSize || "100%";
      if (transItalicInput) transItalicInput.checked = settings.transItalic || false;
      if (transBgAlphaInput) transBgAlphaInput.value = settings.transBgAlpha !== undefined ? settings.transBgAlpha : 0.12;
      updateStylePreview();
      
      // 사용자 사전
      currentCustomDict = settings.customDict || [];
      updateDictSummary(currentCustomDict.length);

      // 음절 표시
      if (showPhoneticsInput) showPhoneticsInput.checked = settings.showPhonetics;
    }
  );

  /* ── 엑셀 스타일 사용자 사전 모달 로직 ──────────────────────────────── */

  const openDictModalBtn = document.getElementById("openDictModalBtn");
  const closeDictModalBtn = document.getElementById("closeDictModalBtn");
  const cancelDictModalBtn = document.getElementById("cancelDictModalBtn");
  const saveDictModalBtn = document.getElementById("saveDictModalBtn");
  const dictModal = document.getElementById("dictModal");
  const dictModalTableBody = document.getElementById("dictModalTableBody");
  const modalRowCount = document.getElementById("modalRowCount");
  const dictSummaryCount = document.getElementById("dictSummaryCount");
  const addDictRowBtn = document.getElementById("addDictRowBtn");
  const importCsvBtn = document.getElementById("importCsvBtn");
  const exportCsvBtn = document.getElementById("exportCsvBtn");
  const clearDictBtn = document.getElementById("clearDictBtn");
  const csvFileInput = document.getElementById("csvFileInput");

  function updateDictSummary(count) {
    if (dictSummaryCount) {
      dictSummaryCount.textContent = `등록된 단어: ${count}개`;
    }
  }

  function createModalRow(orig = "", trans = "") {
    const tr = document.createElement("tr");
    
    // index
    const tdIdx = document.createElement("td");
    tdIdx.style.textAlign = "center";
    tdIdx.style.color = "#64748b";
    tdIdx.style.fontSize = "12px";
    tdIdx.textContent = dictModalTableBody.children.length + 1;
    
    // orig
    const tdOrig = document.createElement("td");
    const inputOrig = document.createElement("input");
    inputOrig.type = "text";
    inputOrig.className = "excel-grid-input orig-input";
    inputOrig.value = orig;
    inputOrig.placeholder = "원문 입력...";
    inputOrig.spellcheck = false;
    tdOrig.appendChild(inputOrig);
    
    // trans
    const tdTrans = document.createElement("td");
    const inputTrans = document.createElement("input");
    inputTrans.type = "text";
    inputTrans.className = "excel-grid-input trans-input";
    inputTrans.value = trans;
    inputTrans.placeholder = "번역문 입력...";
    inputTrans.spellcheck = false;
    tdTrans.appendChild(inputTrans);

    // paste event on input
    inputOrig.addEventListener("paste", handlePaste);
    inputTrans.addEventListener("paste", handlePaste);
    
    // del
    const tdDel = document.createElement("td");
    tdDel.style.textAlign = "center";
    const delBtn = document.createElement("button");
    delBtn.className = "icon-btn";
    delBtn.style.width = "28px";
    delBtn.style.height = "28px";
    delBtn.style.margin = "0 auto";
    delBtn.style.border = "none";
    delBtn.style.color = "#ef4444";
    delBtn.innerHTML = "✕";
    delBtn.addEventListener("click", () => {
      tr.remove();
      reindexModalTable();
    });
    tdDel.appendChild(delBtn);
    
    tr.appendChild(tdIdx);
    tr.appendChild(tdOrig);
    tr.appendChild(tdTrans);
    tr.appendChild(tdDel);
    dictModalTableBody.appendChild(tr);

    reindexModalTable();
  }

  function reindexModalTable() {
    const rows = dictModalTableBody.querySelectorAll("tr");
    rows.forEach((tr, i) => {
      tr.children[0].textContent = i + 1;
    });
    if (modalRowCount) {
      modalRowCount.textContent = `총 ${rows.length}개 항목`;
    }
  }

  function renderModalRows(list) {
    dictModalTableBody.innerHTML = "";
    if (list && list.length > 0) {
      list.forEach(item => createModalRow(item.original, item.translated));
    } else {
      createModalRow("", "");
    }
  }

  // 엑셀 붙여넣기(Paste) 핸들러
  function handlePaste(e) {
    const clipboardData = e.clipboardData || window.clipboardData;
    if (!clipboardData) return;
    const pastedText = clipboardData.getData("text");
    if (!pastedText || (!pastedText.includes("\t") && !pastedText.includes("\n"))) return;

    e.preventDefault();
    const lines = pastedText.split(/\r?\n/);
    lines.forEach(line => {
      if (!line.trim()) return;
      let parts = line.split("\t");
      if (parts.length < 2) {
        parts = line.split(",");
      }
      const orig = (parts[0] || "").trim();
      const trans = (parts[1] || "").trim();
      if (orig || trans) {
        createModalRow(orig, trans);
      }
    });
  }

  if (openDictModalBtn) {
    openDictModalBtn.addEventListener("click", () => {
      renderModalRows(currentCustomDict);
      dictModal.style.display = "flex";
    });
  }

  function closeDictModal() {
    dictModal.style.display = "none";
  }

  if (closeDictModalBtn) closeDictModalBtn.addEventListener("click", closeDictModal);
  if (cancelDictModalBtn) cancelDictModalBtn.addEventListener("click", closeDictModal);

  if (addDictRowBtn) {
    addDictRowBtn.addEventListener("click", () => createModalRow());
  }

  if (clearDictBtn) {
    clearDictBtn.addEventListener("click", () => {
      if (confirm("사전 목록을 모두 삭제하시겠습니까?")) {
        dictModalTableBody.innerHTML = "";
        createModalRow();
      }
    });
  }

  // CSV/엑셀 가져오기 (Import)
  if (importCsvBtn && csvFileInput) {
    importCsvBtn.addEventListener("click", () => csvFileInput.click());
    csvFileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target.result;
        parseAndAppendCsv(text);
        csvFileInput.value = "";
      };
      reader.readAsText(file, "UTF-8");
    });
  }

  function parseAndAppendCsv(text) {
    const cleanText = text.replace(/^\uFEFF/, ""); // BOM 제거
    const lines = cleanText.split(/\r?\n/);
    let addedCount = 0;

    lines.forEach(line => {
      if (!line.trim()) return;
      let parts = line.split("\t");
      if (parts.length < 2) {
        parts = line.split(",");
      }
      const orig = (parts[0] || "").replace(/^"|"$/g, "").trim();
      const trans = (parts[1] || "").replace(/^"|"$/g, "").trim();

      if (orig && trans && orig !== "Original" && orig !== "원문") {
        createModalRow(orig, trans);
        addedCount++;
      }
    });
    alert(`✓ ${addedCount}개의 사전 항목을 불러왔습니다.`);
  }

  // CSV 내보내기 (Export)
  if (exportCsvBtn) {
    exportCsvBtn.addEventListener("click", () => {
      const rows = dictModalTableBody.querySelectorAll("tr");
      const list = [];
      rows.forEach(tr => {
        const orig = tr.querySelector(".orig-input").value.trim();
        const trans = tr.querySelector(".trans-input").value.trim();
        if (orig && trans) {
          list.push({ original: orig, translated: trans });
        }
      });

      if (list.length === 0) {
        alert("내보낼 사전 항목이 없습니다.");
        return;
      }

      // UTF-8 BOM 추가 (Excel 깨짐 방지)
      let csvContent = "\uFEFF원문,번역문\n";
      list.forEach(item => {
        const safeOrig = `"${item.original.replace(/"/g, '""')}"`;
        const safeTrans = `"${item.translated.replace(/"/g, '""')}"`;
        csvContent += `${safeOrig},${safeTrans}\n`;
      });

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `WebTranslator_CustomDict_${new Date().toISOString().slice(0,10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  }

  // 모달 저장 및 적용
  if (saveDictModalBtn) {
    saveDictModalBtn.addEventListener("click", () => {
      const rows = dictModalTableBody.querySelectorAll("tr");
      const list = [];
      rows.forEach(tr => {
        const orig = tr.querySelector(".orig-input").value.trim();
        const trans = tr.querySelector(".trans-input").value.trim();
        if (orig && trans) {
          list.push({ original: orig, translated: trans });
        }
      });

      currentCustomDict = list;
      updateDictSummary(currentCustomDict.length);

      chrome.storage.sync.set({ customDict: currentCustomDict }, () => {
        showSaveStatus("✓ 사용자 사전이 저장 및 적용되었습니다.", "success");
        closeDictModal();
      });
    });
  }

  /* ── 번역 스타일 실시간 미리보기 ──────────────────────────────────── */

  function hexToRgba(hex, alpha) {
    if (!hex || typeof hex !== "string") return `rgba(129, 140, 248, ${alpha})`;
    let cleanHex = hex.replace("#", "");
    if (cleanHex.length === 3) {
      cleanHex = cleanHex.split("").map((c) => c + c).join("");
    }
    const num = parseInt(cleanHex, 16);
    if (isNaN(num)) return `rgba(129, 140, 248, ${alpha})`;
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function getAutoTextColor(hex) {
    if (!hex || typeof hex !== "string") return "#818cf8";
    let cleanHex = hex.replace("#", "");
    if (cleanHex.length === 3) cleanHex = cleanHex.split("").map((c) => c + c).join("");
    const r = parseInt(cleanHex.substring(0, 2), 16);
    const g = parseInt(cleanHex.substring(2, 4), 16);
    const b = parseInt(cleanHex.substring(4, 6), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return "#818cf8";

    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    if (yiq > 200) return "#1e293b"; // 아주 밝은 색(흰색 등)일 경우 어두운 글자
    if (yiq < 60) return "#f8fafc";  // 아주 어두운 색(검은색 등)일 경우 밝은 글자
    return hex; // 중간 밝기는 테마색과 동일하게 (예: #818cf8)
  }

  function updateStylePreview() {
    const color = transColorInput ? transColorInput.value : "#818cf8";
    const textColor = getAutoTextColor(color);
    const size = transFontSizeSelect ? transFontSizeSelect.value : "100%";
    const fontStyle = transItalicInput && transItalicInput.checked ? "italic" : "normal";
    const bgAlpha = transBgAlphaInput ? parseFloat(transBgAlphaInput.value) : 0.12;

    const inlineEl = document.getElementById("previewInline");
    const blockEl = document.getElementById("previewBlock");

    if (inlineEl) {
      inlineEl.style.color = textColor;
      inlineEl.style.fontSize = size;
      inlineEl.style.fontStyle = fontStyle;
    }
    if (blockEl) {
      blockEl.style.color = textColor;
      blockEl.style.background = hexToRgba(color, bgAlpha);
      blockEl.style.borderLeftColor = color;
      blockEl.style.fontSize = size;
      blockEl.style.fontStyle = fontStyle;
    }
  }

  if (transColorInput) transColorInput.addEventListener("input", updateStylePreview);
  if (transFontSizeSelect) transFontSizeSelect.addEventListener("change", updateStylePreview);
  if (transItalicInput) transItalicInput.addEventListener("change", updateStylePreview);
  if (transBgAlphaInput) transBgAlphaInput.addEventListener("input", updateStylePreview);

  /* ── 번역 모드 변경 시 섹션 토글 ────────────────────── */

  const resetShortcutBtn = document.getElementById("resetShortcutBtn");
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

  modeRadios.forEach((radio) => {
    radio.addEventListener("change", (e) => {
      updateUI(e.target.value);
    });
  });

  /* ── API Key 보기/숨기기 토글 ───────────────────────────────── */

  toggleKeyBtn.addEventListener("click", () => {
    const isPassword = geminiApiKeyInput.type === "password";
    geminiApiKeyInput.type = isPassword ? "text" : "password";
    toggleKeyBtn.title = isPassword ? "키 숨기기" : "키 보기";
  });

  /* ── 설정 저장 ──────────────────────────────────────────────── */

  saveBtn.addEventListener("click", () => {
    const mode = document.querySelector(
      'input[name="translationMode"]:checked'
    )?.value;
    const display = document.querySelector(
      'input[name="displayMode"]:checked'
    )?.value;

    if (!mode || !display) return;

    // 검증
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
      targetLang: targetLangSelect.value,
      customShortcut: customShortcutInput ? customShortcutInput.value : "Alt+A",
      displayMode: display,
      lazyTranslate: lazyTranslateInput ? lazyTranslateInput.checked : true,
      customDict: currentCustomDict,
      transColor: transColorInput ? transColorInput.value : "#818cf8",
      transFontSize: transFontSizeSelect ? transFontSizeSelect.value : "100%",
      transItalic: transItalicInput ? transItalicInput.checked : false,
      transBgAlpha: transBgAlphaInput ? parseFloat(transBgAlphaInput.value) : 0.12,
      showPhonetics: showPhoneticsInput ? showPhoneticsInput.checked : true,
    };

    chrome.storage.sync.set(settings, () => {
      if (chrome.runtime.lastError) {
        showSaveStatus("저장 실패: " + chrome.runtime.lastError.message, "error");
      } else {
        showSaveStatus("✓ 설정이 저장되었습니다.", "success");
      }
    });
  });

  /* ── 번역문 스타일 초기화 ──────────────────────────────────── */

  const resetStyleBtn = document.getElementById("resetStyleBtn");
  if (resetStyleBtn) {
    resetStyleBtn.addEventListener("click", () => {
      if (transColorInput) transColorInput.value = "#818cf8";
      if (transFontSizeSelect) transFontSizeSelect.value = "100%";
      if (transItalicInput) transItalicInput.checked = false;
      if (transBgAlphaInput) transBgAlphaInput.value = "0.12";
      updateStylePreview();

      chrome.storage.sync.set(
        {
          transColor: "#818cf8",
          transFontSize: "100%",
          transItalic: false,
          transBgAlpha: 0.12,
        },
        () => {
          showSaveStatus("✓ 번역문 스타일이 기본값으로 초기화되었습니다.", "success");
        }
      );
    });
  }

  /* ── 캐시 초기화 ──────────────────────────────────────────────── */

  const clearCacheBtn = document.getElementById("clearCacheBtn");
  if (clearCacheBtn) {
    clearCacheBtn.addEventListener("click", () => {
      if (confirm("정말로 모든 번역 캐시를 삭제하시겠습니까?")) {
        chrome.runtime.sendMessage({ action: "clearCache" }, (response) => {
          if (response && response.success) {
            showSaveStatus("✓ 캐시가 초기화되었습니다.", "success");
          } else {
            showSaveStatus("캐시 초기화 실패", "error");
          }
        });
      }
    });
  }

  /* ── 저장 상태 메시지 ───────────────────────────────────────── */

  let statusTimer = null;

  function showSaveStatus(text, type) {
    if (statusTimer) clearTimeout(statusTimer);

    saveStatus.textContent = text;
    saveStatus.className = `save-status show ${type}`;

    statusTimer = setTimeout(() => {
      saveStatus.classList.remove("show");
    }, 3000);
  }
