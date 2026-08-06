import { state } from "./state.js";
import { sendToBackground } from "./api.js";
import { isAlreadyTargetLang } from "./utils.js";

/* ────────────────────────────────────────────
   * 단어 호버 사전 팝업 (v2.2)
   * ──────────────────────────────────────────── */

  state.activeDictPopup = null;
  // 단어 조회 결과 캐시 (페이지 세션 내 중복 API 호출 방지)
  state.dictCache = new Map();
  // 429 후 다음 요청 가능 시간 (ms)
  state.dictRateLimitUntil = 0;

  export function removeDictPopup() {
    if (state.activeDictPopup) {
      state.activeDictPopup.remove();
      state.activeDictPopup = null;
    }
  }

  document.addEventListener("mousedown", (e) => {
    if (state.activeDictPopup && !state.activeDictPopup.contains(e.target)) {
      removeDictPopup();
    }
  });

  /* ── 사전 조회 대상 유효성 검증 ──────────────────────────── */

  export function isValidDictWord(text) {
    if (!text || typeof text !== "string") return false;
    var clean = text.trim();
    if (clean.length < 1 || clean.length > 35) return false;

    // 1. 숫자/소수점/날짜/통화 패턴 스킵 ("0.00", "5060", "$12.99", "100%", "2026.08.05")
    if (/^[$\u20A0-\u20BA]?\d+(?:[.,]\d+)*[%s]?$/i.test(clean)) return false;
    if (/^\d{1,4}[-./]\d{1,2}[-./]\d{1,4}$/.test(clean)) return false;

    // 2. API Key / Token / Hash / 코드 변수 패턴 스킵 ("sk-proj-...", "AIzaSy...", "ghp_...", "eyJ...")
    if (/^(sk-|AIza|ghp_|eyJ|bearer\s)/i.test(clean)) return false;
    if (clean.length >= 16 && /[A-Za-z0-9_-]{16,}/.test(clean) && /\d/.test(clean) && /[A-Z]/.test(clean)) return false;

    // 3. 유효 언어 문자(\p{L}) 최소 개수 검증
    var lettersOnly = clean.replace(/[^\p{L}]/gu, "");
    if (lettersOnly.length === 0) return false;

    // 알파벳/영문 기반은 최소 2글자 이상 (단, CJK 한자/가나/한글 등 1글자 의미 문자는 허용)
    var isCJK = /[\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7A3]/u.test(clean);
    if (!isCJK && lettersOnly.length < 2) return false;

    // 4. 숫자가 문자보다 많거나 같은 비율인 경우 (예: "32a", "v1.0.0.123")
    var digits = (clean.match(/\d/g) || []).length;
    if (digits > 0 && digits >= lettersOnly.length) return false;

    return true;
  }

  document.addEventListener("mouseup", async (e) => {
    if (e.button === 2) return;
    if (state.activeDictPopup && state.activeDictPopup.contains(e.target)) return;

    setTimeout(async () => {
      var selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;

      var selectedText = selection.toString().trim();
      if (!selectedText) return;

      // 유니코드 유효 단어 추출
      var cleanWord = selectedText.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
      var isSingleWord = isValidDictWord(cleanWord);
      
      if (!isSingleWord && selectedText.length > 3000) return; // 너무 긴 텍스트는 드래그 번역 무시
      if (!isSingleWord && cleanWord.length === 0) return;
      if (/\s{3,}/.test(selectedText) && isSingleWord) return;

      var settings = state.cachedSettings || (await sendToBackground({ action: "getSettings" }));
      if (!settings) return;
      state.cachedSettings = settings;

      var mode = detectTranslationMode(selectedText, cleanWord);
      // 이미 사용자가 설정한 목표 언어로 되어 있는 경우 팝업 즉시 스킵 (단어인 경우만)
      if (mode === "dict" && isAlreadyTargetLang(cleanWord, settings.targetLang)) return;

      var range = selection.getRangeAt(0);
      var rect = range.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      executePopupTranslation(selectedText, cleanWord, rect, settings, mode);
    }, 150);
  });

  export function detectTranslationMode(selectedText, cleanWord) {
    if (!isValidDictWord(cleanWord)) return "sentence";
    if (/\s{3,}/.test(selectedText)) return "sentence";
    
    var tokens = selectedText.trim().split(/\s+/);
    if (tokens.length >= 3) return "sentence";

    if (/[.!？。！\n]/.test(selectedText)) {
      if (!/^(Mr\.|Ms\.|Dr\.|e\.g\.|i\.e\.|etc\.)$/i.test(selectedText.trim())) {
        return "sentence";
      }
    }

    var cjkMatched = selectedText.match(/[\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF]/g);
    if (cjkMatched && selectedText.trim().length >= 5) return "sentence";

    return "dict";
  }

  state.currentPopupContext = null;

  export async function executePopupTranslation(selectedText, cleanWord, rect, settings, forceMode) {
    state.currentPopupContext = { selectedText, cleanWord, rect, settings, mode: forceMode };
    removeDictPopup();

    if (forceMode === "dict") {
      if (Date.now() < state.dictRateLimitUntil) {
        showDictPopupError(cleanWord, "잠시 후 다시 시도하세요 (API 한도 초과)", rect);
        return;
      }

      var cacheKey = `${cleanWord}::${settings.targetLang}::${settings.translationMode}`;
      if (state.dictCache.has(cacheKey)) {
        var cached = state.dictCache.get(cacheKey);
        showDictPopupLoading(cleanWord, rect);
        if (cached.error) {
          showDictPopupError(cleanWord, cached.error, rect);
        } else {
          renderDictPopup(cached.data, rect);
        }
        return;
      }

      showDictPopupLoading(cleanWord, rect);

      try {
        var response = await sendToBackground({
          action: "lookupWord",
          word: cleanWord,
          targetLang: settings.targetLang,
          mode: settings.translationMode,
          apiKey: settings.geminiApiKey,
          geminiModel: settings.geminiModel,
          openaiApiKey: settings.openaiApiKey,
          openaiModel: settings.openaiModel,
          claudeApiKey: settings.claudeApiKey,
          claudeModel: settings.claudeModel,
          ollamaUrl: settings.ollamaUrl,
          libreUrl: settings.libreUrl,
        });

        if (response?.error) {
          if (response.error.includes("429") || response.error.toLowerCase().includes("quota") || response.error.toLowerCase().includes("rate")) {
            state.dictRateLimitUntil = Date.now() + 60000;
            showDictPopupError(cleanWord, "API 한도 초과 — 잠시 후 자동으로 해제됩니다", rect);
          } else {
            state.dictCache.set(cacheKey, { error: response.error });
            showDictPopupError(cleanWord, response.error, rect);
          }
        } else if (response?.data) {
          state.dictCache.set(cacheKey, { data: response.data });
          renderDictPopup(response.data, rect);
        }
      } catch (err) {
        var msg = err.message || "";
        if (msg.includes("429") || msg.toLowerCase().includes("quota") || msg.toLowerCase().includes("rate")) {
          state.dictRateLimitUntil = Date.now() + 60000;
          showDictPopupError(cleanWord, "API 한도 초과 — 잠시 후 자동으로 해제됩니다", rect);
        } else {
          showDictPopupError(cleanWord, msg, rect);
        }
      }
    } else {
      showDictPopupLoading("번역 중...", rect);
      try {
        var result = await sendToBackground({
          action: "translate",
          texts: [selectedText],
          targetLang: settings.targetLang,
          mode: settings.translationMode,
          apiKey: settings.geminiApiKey,
          geminiModel: settings.geminiModel,
          openaiApiKey: settings.openaiApiKey,
          openaiModel: settings.openaiModel,
          claudeApiKey: settings.claudeApiKey,
          claudeModel: settings.claudeModel,
          ollamaUrl: settings.ollamaUrl,
          ollamaModel: settings.ollamaModel,
          libreUrl: settings.libreUrl,
          isPopup: true,
          phoneticLanguage: settings.phoneticLanguage || "IPA",
        });
        var translated = result?.translations?.[0];
        var phonetic = result?.phonetics?.[0];
        if (translated) {
          renderTranslationPopup(selectedText, translated, phonetic, rect);
        } else {
          showDictPopupError("번역", "번역 결과를 가져올 수 없습니다.", rect);
        }
      } catch (err) {
        showDictPopupError("번역", err.message, rect);
      }
    }
  }

  export function attachToggleButton() {
    if (!state.activeDictPopup || !state.currentPopupContext) return;
    var btn = state.activeDictPopup.querySelector(".wt-mode-toggle");
    if (btn) {
      btn.addEventListener("mousedown", (e) => {
        e.stopPropagation();
        e.preventDefault();
        var nextMode = state.currentPopupContext.mode === "dict" ? "sentence" : "dict";
        executePopupTranslation(
          state.currentPopupContext.selectedText,
          state.currentPopupContext.cleanWord,
          state.currentPopupContext.rect,
          state.currentPopupContext.settings,
          nextMode
        );
      });
    }
  }

  export function renderTranslationPopup(originalText, translatedText, phoneticText, rect) {
    if (!state.activeDictPopup) return;

    var html = `
      <div class="wt-dict-header" style="justify-content:space-between;">
        <div style="display:flex; align-items:baseline; gap:8px; padding-right:75px; flex-wrap:wrap;">
          <span class="wt-dict-word" style="white-space:pre-wrap;word-break:break-word;">${originalText}</span>
          ${phoneticText ? `<span class="wt-dict-phonetic" style="white-space:pre-wrap;word-break:break-word;">${phoneticText}</span>` : ""}
        </div>
        <button class="wt-mode-toggle">단어 사전</button>
      </div>
      <div class="wt-dict-entry" style="margin-top:8px;">
        <span class="wt-dict-meaning" style="font-size:13.5px;line-height:1.55;white-space:pre-wrap;word-break:break-word;display:block;">${translatedText}</span>
      </div>
    `;

    state.activeDictPopup.innerHTML = html;
    positionPopup(state.activeDictPopup, rect);
    attachToggleButton();
  }

  export function positionPopup(popup, rect) {
    var scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    var scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

    var top = rect.bottom + scrollTop + 8;
    var left = rect.left + scrollLeft;

    popup.style.top = `${top}px`;
    popup.style.left = `${left}px`;
  }

  export function showDictPopupLoading(word, rect) {
    removeDictPopup();
    var popup = document.createElement("div");
    popup.className = "wt-dictionary-popup";
    popup.innerHTML = `
      <div class="wt-dict-header">
        <span class="wt-dict-word">${word}</span>
        <div class="wt-spinner" style="width:14px;height:14px;border-width:2px;"></div>
      </div>
      <div style="font-size:12px;color:#94a3b8;">사전 정보 검색 중…</div>
    `;
    document.body.appendChild(popup);
    positionPopup(popup, rect);
    state.activeDictPopup = popup;
  }

  export function showDictPopupError(word, errorMsg, rect) {
    if (!state.activeDictPopup) return;
    state.activeDictPopup.innerHTML = `
      <div class="wt-dict-header">
        <span class="wt-dict-word">${word}</span>
      </div>
      <div style="font-size:12px;color:#f87171;">사전 조회 실패: ${errorMsg}</div>
    `;
    positionPopup(state.activeDictPopup, rect);
  }

  export function renderDictPopup(data, rect) {
    if (!state.activeDictPopup) return;
    var { word, pronunciation, inflections, definitions } = data;

    var html = `
      <div class="wt-dict-header" style="justify-content:space-between;">
        <div style="display:flex; align-items:baseline; gap:8px;">
          <span class="wt-dict-word">${word}</span>
          ${pronunciation ? `<span class="wt-dict-phonetic">${pronunciation}</span>` : ""}
        </div>
        <button class="wt-mode-toggle">문장 번역</button>
      </div>
    `;

    if (inflections) {
      html += `<div class="wt-dict-inflection">${inflections}</div>`;
    }

    if (Array.isArray(definitions) && definitions.length > 0) {
      // 여러 뜻이 있는 경우 상위 최대 3개로 제한 후 품사(POS)별 그룹화
      var topDefs = definitions.slice(0, 3);
      var posMap = new Map();
      topDefs.forEach((def) => {
        var posKey = (def.pos || "기타").trim();
        if (!posMap.has(posKey)) {
          posMap.set(posKey, []);
        }
        posMap.get(posKey).push(def);
      });

      posMap.forEach((items, pos) => {
        html += `<div class="wt-dict-pos-group">`;
        html += `<div class="wt-dict-pos-badge">${pos}</div>`;

        items.forEach((def, idx) => {
          html += `<div class="wt-dict-entry">`;
          var meaningText = def.meaning || (Array.isArray(def.meanings) ? def.meanings.join(", ") : "");
          html += `<span class="wt-dict-meaning">${idx + 1}. ${meaningText}</span>`;

          // 대표 예문
          if (def.example && def.example.en) {
            var transExample = def.example.ko || def.example.target || (typeof def.example === "object" ? Object.values(def.example)[1] : "");
            html += `
              <div class="wt-dict-example">
                <div class="wt-dict-example-en">${def.example.en}</div>
                ${transExample ? `<div class="wt-dict-example-ko">${transExample}</div>` : ""}
              </div>
            `;
          }
          html += `</div>`;
        });

        html += `</div>`;
      });
    }

    state.activeDictPopup.innerHTML = html;
    positionPopup(state.activeDictPopup, rect);
    attachToggleButton();
  }


