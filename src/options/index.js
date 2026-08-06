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
      var modeRadio = document.querySelector(
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
      var selectedDisplay = document.querySelector(`input[name="displayMode"][value="${settings.displayMode}"]`);
      if (selectedDisplay) selectedDisplay.checked = true;

      // 목표 언어
      targetLangSelect.value = settings.targetLang;

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
\n  if (transColorInput) transColorInput.addEventListener("input", updateStylePreview);
  if (transFontSizeSelect) transFontSizeSelect.addEventListener("change", updateStylePreview);
  if (transItalicInput) transItalicInput.addEventListener("change", updateStylePreview);
  if (transBgAlphaInput) transBgAlphaInput.addEventListener("input", updateStylePreview);

  /* ── 번역 모드 변경 시 섹션 토글 ────────────────────── */

  modeRadios.forEach((radio) => {
    radio.addEventListener("change", (e) => {
      updateUI(e.target.value);
    });
  });

  /* ── API Key 보기/숨기기 토글 ───────────────────────────────── */

  toggleKeyBtn.addEventListener("click", () => {
    var isPassword = geminiApiKeyInput.type === "password";
    geminiApiKeyInput.type = isPassword ? "text" : "password";
    toggleKeyBtn.title = isPassword ? "키 숨기기" : "키 보기";
  });

\n  /* ── 설정 저장 ──────────────────────────────────────────────── */

  saveBtn.addEventListener("click", () => {
    var mode = document.querySelector(
      'input[name="translationMode"]:checked'
    )?.value;
    var display = document.querySelector(
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

    var settings = {
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

\n    resetStyleBtn.addEventListener("click", () => {
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
\n    clearCacheBtn.addEventListener("click", () => {
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

