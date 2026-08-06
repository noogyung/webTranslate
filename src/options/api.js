  if (loadModelsBtn) {
    loadModelsBtn.addEventListener("click", async () => {
      var apiKey = geminiApiKeyInput.value.trim();
      if (!apiKey) {
        alert("Gemini API Key를 먼저 입력해 주세요.");
        return;
      }
      loadModelsBtn.disabled = true;
      loadModelsBtn.textContent = "조회 중...";
      try {
        var url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
        var resp = await fetch(url);
        if (!resp.ok) {
          var errData = await resp.json().catch(() => ({}));
          throw new Error(errData.error?.message || `HTTP ${resp.status}`);
        }
        var data = await resp.json();
        var validModels = (data.models || [])
          .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
          .map((m) => m.name.replace(/^models\//, ""));

        if (validModels.length > 0) {
          geminiModelList.innerHTML = "";
          validModels.forEach((m) => {
            var opt = document.createElement("option");
            opt.value = m;
            geminiModelList.appendChild(opt);
          });
          if (!geminiModelInput.value || !validModels.includes(geminiModelInput.value)) {
            var pref = validModels.find(m => m.includes("flash-lite-latest")) ||
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

\n  if (loadOpenAIModelsBtn) {
    loadOpenAIModelsBtn.addEventListener("click", async () => {
      var apiKey = openaiApiKeyInput.value.trim();
      if (!apiKey) {
        showSaveStatus("OpenAI API Key를 먼저 입력해 주세요.", "error");
        openaiApiKeyInput.focus();
        return;
      }
      loadOpenAIModelsBtn.disabled = true;
      loadOpenAIModelsBtn.textContent = "조회 중...";
      try {
        var response = await fetch("https://api.openai.com/v1/models", {
          headers: { Authorization: `Bearer ${apiKey}` }
        });
        if (!response.ok) {
          var errData = await response.json().catch(() => ({}));
          throw new Error(errData.error?.message || `HTTP ${response.status}`);
        }
        var data = await response.json();
        var validModels = (data.data || [])
          .map((m) => m.id)
          .filter((id) => {
            var lid = id.toLowerCase();
            return lid.startsWith("gpt-") && !lid.includes("audio") && !lid.includes("realtime") && !lid.includes("embedding") && !lid.includes("instruct") && !lid.includes("tts") && !lid.includes("whisper") && !lid.includes("dall-e");
          })
          .sort();

        if (validModels.length > 0) {
          if (openaiModelList) {
            openaiModelList.innerHTML = "";
            validModels.forEach((m) => {
              var opt = document.createElement("option");
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

