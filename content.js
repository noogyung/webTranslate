/**
 * content.js — Content Script  (v2.3)
 *
 * v2.3 변경사항:
 *  - 사전 조회 메시지(lookupWord) 수신 시 libreUrl 및 선택 모델 정보 완벽 전달
 *  - 단어 사전 조회 무한 로딩(검색중...) 방지 타임아웃 및 스피너 로직 최적화
 *  - [P0] 캐시 오염 수정: 순수 API 결과만 캐시, 표시 시 사전 동적 적용
 *  - [P0] translatedElements 중복 등록 방지 (Set 사용 + 진입 가드)
 */

(function () {
  "use strict";

  /* ── 상태 ─────────────────────────────────────────────────── */

  let isTranslated = false;
  let isTranslating = false;
  let isObserverBusy = false;
  const translatedElements = new Set();   // [P0 FIX #2] Set으로 중복 방지
  let statusEl = null;
  let hideTimer = null;

  /** MutationObserver 관련 */
  let observer = null;
  let pendingNodes = new Set();
  let observerTimer = null;
  let cachedSettings = null;
  let localCache = {}; // 번역 캐시 { 원문: 순수 API 번역문 }

  /** Lazy Translation (IntersectionObserver) 관련 */
  let lazyObserver = null;
  let lazyObserverTimer = null;
  const pendingLazyBlocks = new Set();
  let elementToBlockMap = new WeakMap(); // [P2 FIX #11] let으로 변경하여 revert 시 초기화 가능

  /* ── 태그 및 번역 엔진 분류 (Strategy Pattern) ──────────── */

  const LLM_ENGINES = new Set(["gemini", "chatgpt", "openai", "claude", "ollama"]);

  function isLLMEngine(mode) {
    return LLM_ENGINES.has((mode || "").toLowerCase());
  }

  function getBatchConfig(mode) {
    if (isLLMEngine(mode)) {
      // AI/LLM 엔진: 대용량 단일 페이로드 번들링 (Rate Limit 429 방지 & 문맥 극대화)
      return { batchSize: 200, concurrency: 1 };
    }
    // NMT 엔진 (Google, LibreTranslate, DeepL): 소규모 동시 병렬 요청
    return { batchSize: 15, concurrency: 8 };
  }

  const SKIP_TAGS = new Set([
    "SCRIPT", "STYLE", "NOSCRIPT", "SVG", "MATH",
    "CODE", "PRE", "TEXTAREA", "INPUT", "SELECT",
    "IFRAME", "CANVAS", "VIDEO", "AUDIO",
    "BR", "HR", "META", "LINK", "HEAD", "TEMPLATE",
    "RT", "RP",
  ]);

  const INLINE_TAGS = new Set([
    "ABBR", "B", "BDO", "BIG", "CITE", "DFN",
    "EM", "I", "KBD", "MARK", "Q", "S", "SAMP",
    "SMALL", "STRONG", "SUB", "SUP", "U", "VAR",
    "WBR", "TIME", "DATA", "SPAN", "FONT", "RUBY",
  ]);

  const COMPLEX_ANCESTOR_SEL =
    "svg, canvas, video, audio, iframe, picture, object, embed, select, textarea, input, noscript";

  const COMPLEX_CHILD_SEL =
    "img, svg, canvas, video, audio, picture, source, iframe, object, embed, input, select, textarea";

  const HIDDEN_ANCESTOR_SEL =
    '[class*="sr-only" i], [class*="srOnly" i], ' +
    '[class*="visually-hidden" i], [class*="visuallyHidden" i], ' +
    '[class*="screen-reader" i], [class*="screenreader" i], ' +
    '[class*="offscreen" i], [class*="clip-hide" i], ' +
    '[class*="globalnav-link-text" i], ' +
    '[aria-hidden="true"], [hidden]';

  const BATCH_SIZE = 8;

  /* ────────────────────────────────────────────
   * 사용자 번역 테마 스타일 동적 적용 유틸리티
   * ──────────────────────────────────────────── */

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
    if (yiq > 200) return "#1e293b"; // 아주 밝은 색일 경우 어두운 글자
    if (yiq < 60) return "#f8fafc";  // 아주 어두운 색일 경우 밝은 글자
    return hex; // 중간 밝기는 테마색 유지
  }

  function updateCustomStyles(settings) {
    if (!settings) return;
    const root = document.documentElement;
    const themeColor = settings.transColor || "#818cf8";
    const textColor = getAutoTextColor(themeColor);
    const bgAlpha = settings.transBgAlpha !== undefined ? settings.transBgAlpha : 0.12;

    root.style.setProperty("--wt-theme-color", themeColor);
    root.style.setProperty("--wt-text-color", textColor);
    root.style.setProperty("--wt-trans-bg", hexToRgba(themeColor, bgAlpha));
    root.style.setProperty("--wt-trans-border", hexToRgba(themeColor, 0.45));

    if (settings.transFontSize) {
      root.style.setProperty("--wt-trans-font-size", settings.transFontSize);
    }
    if (settings.transItalic !== undefined) {
      root.style.setProperty("--wt-trans-font-style", settings.transItalic ? "italic" : "normal");
    }
  }

  /* ────────────────────────────────────────────
   * 메시지 리스너
   * ──────────────────────────────────────────── */

  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "toggleTranslation") {
      if (isTranslating) return;
      if (isTranslated) revertTranslation();
      else startTranslation();
    }
  });

  /* ────────────────────────────────────────────
   * 단어 호버 사전 팝업 (v2.2)
   * ──────────────────────────────────────────── */

  let activeDictPopup = null;
  // 단어 조회 결과 캐시 (페이지 세션 내 중복 API 호출 방지)
  const dictCache = new Map();
  // 429 후 다음 요청 가능 시간 (ms)
  let dictRateLimitUntil = 0;

  function removeDictPopup() {
    if (activeDictPopup) {
      activeDictPopup.remove();
      activeDictPopup = null;
    }
  }

  document.addEventListener("mousedown", (e) => {
    if (activeDictPopup && !activeDictPopup.contains(e.target)) {
      removeDictPopup();
    }
  });

  /* ── 사전 조회 대상 유효성 검증 ──────────────────────────── */

  function isValidDictWord(text) {
    if (!text || typeof text !== "string") return false;
    const clean = text.trim();
    if (clean.length < 1 || clean.length > 35) return false;

    // 1. 숫자/소수점/날짜/통화 패턴 스킵 ("0.00", "5060", "$12.99", "100%", "2026.08.05")
    if (/^[$\u20A0-\u20BA]?\d+(?:[.,]\d+)*[%s]?$/i.test(clean)) return false;
    if (/^\d{1,4}[-./]\d{1,2}[-./]\d{1,4}$/.test(clean)) return false;

    // 2. API Key / Token / Hash / 코드 변수 패턴 스킵 ("sk-proj-...", "AIzaSy...", "ghp_...", "eyJ...")
    if (/^(sk-|AIza|ghp_|eyJ|bearer\s)/i.test(clean)) return false;
    if (clean.length >= 16 && /[A-Za-z0-9_-]{16,}/.test(clean) && /\d/.test(clean) && /[A-Z]/.test(clean)) return false;

    // 3. 유효 언어 문자(\p{L}) 최소 개수 검증
    const lettersOnly = clean.replace(/[^\p{L}]/gu, "");
    if (lettersOnly.length === 0) return false;

    // 알파벳/영문 기반은 최소 2글자 이상 (단, CJK 한자/가나/한글 등 1글자 의미 문자는 허용)
    const isCJK = /[\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7A3]/u.test(clean);
    if (!isCJK && lettersOnly.length < 2) return false;

    // 4. 숫자가 문자보다 많거나 같은 비율인 경우 (예: "32a", "v1.0.0.123")
    const digits = (clean.match(/\d/g) || []).length;
    if (digits > 0 && digits >= lettersOnly.length) return false;

    return true;
  }

  document.addEventListener("mouseup", async (e) => {
    if (e.button === 2) return;
    if (activeDictPopup && activeDictPopup.contains(e.target)) return;

    setTimeout(async () => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;

      const selectedText = selection.toString().trim();
      if (!selectedText) return;

      // 유니코드 유효 단어 추출
      const cleanWord = selectedText.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
      const isSingleWord = isValidDictWord(cleanWord);
      
      if (!isSingleWord && selectedText.length > 3000) return; // 너무 긴 텍스트는 드래그 번역 무시
      if (!isSingleWord && cleanWord.length === 0) return;
      if (/\s{3,}/.test(selectedText) && isSingleWord) return;

      const settings = cachedSettings || (await sendToBackground({ action: "getSettings" }));
      if (!settings) return;
      cachedSettings = settings;

      const mode = detectTranslationMode(selectedText, cleanWord);
      // 이미 사용자가 설정한 목표 언어로 되어 있는 경우 팝업 즉시 스킵 (단어인 경우만)
      if (mode === "dict" && isAlreadyTargetLang(cleanWord, settings.targetLang)) return;

      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      executePopupTranslation(selectedText, cleanWord, rect, settings, mode);
    }, 150);
  });

  function detectTranslationMode(selectedText, cleanWord) {
    if (!isValidDictWord(cleanWord)) return "sentence";
    if (/\s{3,}/.test(selectedText)) return "sentence";
    
    const tokens = selectedText.trim().split(/\s+/);
    if (tokens.length >= 3) return "sentence";

    if (/[.!？。！\n]/.test(selectedText)) {
      if (!/^(Mr\.|Ms\.|Dr\.|e\.g\.|i\.e\.|etc\.)$/i.test(selectedText.trim())) {
        return "sentence";
      }
    }

    const cjkMatched = selectedText.match(/[\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF]/g);
    if (cjkMatched && selectedText.trim().length >= 5) return "sentence";

    return "dict";
  }

  let currentPopupContext = null;

  async function executePopupTranslation(selectedText, cleanWord, rect, settings, forceMode) {
    currentPopupContext = { selectedText, cleanWord, rect, settings, mode: forceMode };
    removeDictPopup();

    if (forceMode === "dict") {
      if (Date.now() < dictRateLimitUntil) {
        showDictPopupError(cleanWord, "잠시 후 다시 시도하세요 (API 한도 초과)", rect);
        return;
      }

      const cacheKey = `${cleanWord}::${settings.targetLang}::${settings.translationMode}`;
      if (dictCache.has(cacheKey)) {
        const cached = dictCache.get(cacheKey);
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
        const response = await sendToBackground({
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
            dictRateLimitUntil = Date.now() + 60000;
            showDictPopupError(cleanWord, "API 한도 초과 — 잠시 후 자동으로 해제됩니다", rect);
          } else {
            dictCache.set(cacheKey, { error: response.error });
            showDictPopupError(cleanWord, response.error, rect);
          }
        } else if (response?.data) {
          dictCache.set(cacheKey, { data: response.data });
          renderDictPopup(response.data, rect);
        }
      } catch (err) {
        const msg = err.message || "";
        if (msg.includes("429") || msg.toLowerCase().includes("quota") || msg.toLowerCase().includes("rate")) {
          dictRateLimitUntil = Date.now() + 60000;
          showDictPopupError(cleanWord, "API 한도 초과 — 잠시 후 자동으로 해제됩니다", rect);
        } else {
          showDictPopupError(cleanWord, msg, rect);
        }
      }
    } else {
      showDictPopupLoading("번역 중...", rect);
      try {
        const result = await sendToBackground({
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
          showPhonetics: settings.showPhonetics !== false,
          phoneticLanguage: settings.phoneticLanguage || "IPA",
        });
        const translated = result?.translations?.[0];
        const phonetic = result?.phonetics?.[0];
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

  function attachToggleButton() {
    if (!activeDictPopup || !currentPopupContext) return;
    const btn = activeDictPopup.querySelector(".wt-mode-toggle");
    if (btn) {
      btn.addEventListener("mousedown", (e) => {
        e.stopPropagation();
        e.preventDefault();
        const nextMode = currentPopupContext.mode === "dict" ? "sentence" : "dict";
        executePopupTranslation(
          currentPopupContext.selectedText,
          currentPopupContext.cleanWord,
          currentPopupContext.rect,
          currentPopupContext.settings,
          nextMode
        );
      });
    }
  }

  function renderTranslationPopup(originalText, translatedText, phoneticText, rect) {
    if (!activeDictPopup) return;

    let html = `
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

    activeDictPopup.innerHTML = html;
    positionPopup(activeDictPopup, rect);
    attachToggleButton();
  }

  function positionPopup(popup, rect) {
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

    let top = rect.bottom + scrollTop + 8;
    let left = rect.left + scrollLeft;

    popup.style.top = `${top}px`;
    popup.style.left = `${left}px`;
  }

  function showDictPopupLoading(word, rect) {
    removeDictPopup();
    const popup = document.createElement("div");
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
    activeDictPopup = popup;
  }

  function showDictPopupError(word, errorMsg, rect) {
    if (!activeDictPopup) return;
    activeDictPopup.innerHTML = `
      <div class="wt-dict-header">
        <span class="wt-dict-word">${word}</span>
      </div>
      <div style="font-size:12px;color:#f87171;">사전 조회 실패: ${errorMsg}</div>
    `;
    positionPopup(activeDictPopup, rect);
  }

  function renderDictPopup(data, rect) {
    if (!activeDictPopup) return;
    const { word, pronunciation, inflections, definitions } = data;

    let html = `
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
      const topDefs = definitions.slice(0, 3);
      const posMap = new Map();
      topDefs.forEach((def) => {
        const posKey = (def.pos || "기타").trim();
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
          const meaningText = def.meaning || (Array.isArray(def.meanings) ? def.meanings.join(", ") : "");
          html += `<span class="wt-dict-meaning">${idx + 1}. ${meaningText}</span>`;

          // 대표 예문
          if (def.example && def.example.en) {
            const transExample = def.example.ko || def.example.target || (typeof def.example === "object" ? Object.values(def.example)[1] : "");
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

    activeDictPopup.innerHTML = html;
    positionPopup(activeDictPopup, rect);
    attachToggleButton();
  }


  /* ────────────────────────────────────────────
   * 번역 시작
   * ──────────────────────────────────────────── */

  async function startTranslation() {
    isTranslating = true;

    const settings = await sendToBackground({ action: "getSettings" });
    if (!settings) {
      showStatus("설정을 불러올 수 없습니다.", "error", 3000);
      isTranslating = false;
      return;
    }
    cachedSettings = settings;
    updateCustomStyles(settings);

    // 캐시 불러오기
    const cacheResult = await sendToBackground({ action: "getCache", targetLang: settings.targetLang });
    localCache = cacheResult?.cache || {};

    showStatus("페이지 분석 중…", "loading");

    // 블록 수집 (필터링 통과한 것들만)
    const textBlocks = collectTextBlocks(document.body, settings.targetLang);

    if (textBlocks.length === 0) {
      showStatus("번역할 텍스트가 없습니다.", "done", 2500);
      isTranslating = false;
      return;
    }

    // 최우선순위(보이는 부분)와 차순위(안보이는 부분) 분리
    const visibleBlocks = [];
    const hiddenBlocks = [];
    for (const b of textBlocks) {
      if (b.isVisible) visibleBlocks.push(b);
      else hiddenBlocks.push(b);
    }

    const total = textBlocks.length;
    let completed = 0;
    updateStatus(`번역 중… (0/${total})`, 0);

    try {
      // 1. 보이는 부분 먼저 번역 (빠른 체감)
      if (visibleBlocks.length > 0) {
        await translateBlocks(visibleBlocks, settings, (done) => {
          completed = done;
          updateStatus(`번역 중… (${completed}/${total})`, completed / total);
        });
      }

      // 2. 보이지 않는 부분 후속 번역 (지연 옵션 분기)
      if (hiddenBlocks.length > 0) {
        if (settings.lazyTranslate) {
          setupLazyObserver(hiddenBlocks);
        } else {
          await translateBlocks(hiddenBlocks, settings, (done) => {
            completed = visibleBlocks.length + done;
            updateStatus(`번역 중… (${completed}/${total})`, completed / total);
          });
        }
      }

      isTranslated = true;
      showStatus("번역 완료!", "done", 2500);

      // 동적 콘텐츠 감시 시작
      startObserver();
    } catch (err) {
      showStatus(`오류: ${err.message}`, "error", 5000);
    } finally {
      isTranslating = false;
    }
  }

  function getBatchConfig(mode) {
    if (mode === "gemini" || mode === "openai" || mode === "claude") {
      return { batchSize: 12, concurrency: 3 };
    }
    if (mode === "ollama") {
      return { batchSize: 6, concurrency: 2 };
    }
    if (mode === "libre") {
      return { batchSize: 1, concurrency: 4 };
    }
    return { batchSize: 8, concurrency: 4 };
  }

  /* ────────────────────────────────────────────
   * 캐시 기반 필터링 및 배치 전송
   * ──────────────────────────────────────────── */

  async function translateBlocks(textBlocks, settings, onProgress) {
    const unCachedBlocks = [];
    let completed = 0;
    const dict = settings.customDict || [];

    // 1. 캐시 적중 처리 및 로컬 번역 단독 처리
    for (const block of textBlocks) {
      const original = block.text;
      const needsRemote = needsRemoteTranslation(original, dict);

      if (!needsRemote) {
        // 로컬 전용 경로: 사전 치환만으로 번역 완료
        const localTranslated = applyLocalDictionary(original, dict);
        if (localTranslated !== original) {
          // [P0 FIX #3] 동기적 DOM 업데이트 (RAF 큐 제거)
          applyTranslation(
            block.element, block.originalHTML, localTranslated,
            settings.displayMode, block.isPure, block.isWrapper || false
          );
          // data-wt-translated 값만 "local"로 덮어써서 캐시와 구분
          block.element.setAttribute("data-wt-translated", "local");
        }
        completed++;
      }
      else if (localCache[original]) {
        // [P0 FIX #1] 캐시된 순수 API 결과에 현재 사전을 동적으로 적용
        const transText = applyLocalDictionary(localCache[original], dict);
        applyTranslation(
          block.element, block.originalHTML, transText,
          settings.displayMode, block.isPure, block.isWrapper || false,
          "LOCAL_CACHE"
        );
        completed++;
      } else {
        unCachedBlocks.push(block);
      }
    }

    if (onProgress) onProgress(completed);
    if (unCachedBlocks.length === 0) return;

    // 2. 캐시 미적중 분량 API 요청 (엔진별 전략 적용)
    const { batchSize, concurrency } = getBatchConfig(settings.translationMode);

    const batches = [];
    for (let i = 0; i < unCachedBlocks.length; i += batchSize) {
      batches.push(unCachedBlocks.slice(i, i + batchSize));
    }

    let currentIndex = 0;

    async function worker() {
      while (currentIndex < batches.length) {
        const batchIdx = currentIndex++;
        const batch = batches[batchIdx];
        // [P1 FIX #8] 최소 개입: 구조적 오류(연도+시각 붙음)만 분리
        const texts = batch.map((b) => normalizeDateTimes(b.text));

        try {
          const result = await sendToBackground({
            action: "translate",
            texts,
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
          });

          if (result?.error) throw new Error(result.error);
          if (!result?.translations) throw new Error("번역 응답이 비어 있습니다.");

          const newCacheEntries = {};

          batch.forEach((block, idx) => {
            if (idx < result.translations.length && result.translations[idx]) {
              const rawTranslation = result.translations[idx];
              // [P0 FIX #1] 화면에는 사전 적용 결과 표시
              const transText = applyLocalDictionary(rawTranslation, dict);
              // [P0 FIX #3] 동기적 DOM 업데이트
              applyTranslation(
                block.element, block.originalHTML, transText,
                settings.displayMode, block.isPure, block.isWrapper || false,
                result?.engine || settings.translationMode
              );
              // [P0 FIX #1] 캐시에는 순수 API 결과만 저장 (사전 변경 시에도 안전)
              newCacheEntries[block.text] = rawTranslation;
              localCache[block.text] = rawTranslation;
            }
          });

          // [P1 FIX #10] 새 캐시 fire-and-forget (응답 대기 없음)
          if (Object.keys(newCacheEntries).length > 0) {
            try {
              chrome.runtime.sendMessage({
                action: "setCache",
                targetLang: settings.targetLang,
                dictionary: newCacheEntries,
              });
            } catch { /* fire-and-forget */ }
          }

        } catch (err) {
          // 시간초과(AbortError) 또는 배치 오류는 해당 배치만 스킵, 전체 중단 방지
          const isTimeout = err.name === "AbortError" || err.message?.includes("timed out") || err.message?.includes("timeout");
          if (isTimeout) {
            console.warn(`[WebTranslator] 배치 ${batchIdx} 시간초과 — 스킵하고 계속 진행`, err);
          } else {
            console.warn(`[WebTranslator] 배치 ${batchIdx} 오류 — 스킵하고 계속 진행`, err);
          }
          // globalError를 설정하지 않아 다음 배치가 계속 진행됨
        }

        completed += batch.length;
        if (onProgress) onProgress(completed);
      }
    }

    const workers = [];
    for (let i = 0; i < Math.min(concurrency, batches.length); i++) {
      workers.push(worker());
    }

    await Promise.all(workers);
  }

  /* ────────────────────────────────────────────
   * 동적 콘텐츠 감시 (MutationObserver)
   * ──────────────────────────────────────────── */

  function startObserver() {
    if (observer) observer.disconnect();

    observer = new MutationObserver((mutations) => {
      if (isTranslating || isObserverBusy || !isTranslated) return;

      for (const mutation of mutations) {
        if (mutation.type !== "childList") continue;
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          if (isOurElement(node) || node.closest(".wt-dictionary-popup")) continue;
          if (node.closest("[data-wt-translated]")) continue;
          if (node.getAttribute("data-wt-translated")) continue;
          pendingNodes.add(node);
        }
      }

      if (pendingNodes.size === 0) return;

      clearTimeout(observerTimer);
      observerTimer = setTimeout(() => {
        const nodes = [...pendingNodes];
        pendingNodes.clear();
        translateNewNodes(nodes);
      }, 500);
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  function stopObserver() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    clearTimeout(observerTimer);
    observerTimer = null;
    pendingNodes.clear();
  }

  function isOurElement(node) {
    const cl = node.classList;
    if (!cl) return false;
    return (
      cl.contains("wt-status-indicator") ||
      cl.contains("wt-translation") ||
      cl.contains("wt-dual-inline") ||
      cl.contains("wt-dual-block") ||
      cl.contains("wt-text-wrapper") ||
      cl.contains("wt-dual-br") ||
      cl.contains("wt-dictionary-popup")
    );
  }

  async function translateNewNodes(nodes) {
    if (!cachedSettings || isObserverBusy) return;

    const allBlocks = [];
    for (const node of nodes) {
      if (!document.body.contains(node)) continue;
      if (node.getAttribute("data-wt-translated")) continue;
      const blocks = collectTextBlocks(node, cachedSettings.targetLang);
      allBlocks.push(...blocks);
    }

    if (allBlocks.length > 0) {
      const visibleBlocks = [];
      const hiddenBlocks = [];
      for (const b of allBlocks) {
        if (b.isVisible) visibleBlocks.push(b);
        else hiddenBlocks.push(b);
      }

      // 1. 가시 영역 블록 → 즉시 번역
      if (visibleBlocks.length > 0) {
        isObserverBusy = true;
        if (observer) observer.disconnect();
        showStatus("새로운 텍스트 번역 중…", "loading");

        try {
          await translateBlocks(visibleBlocks, cachedSettings);
          showStatus("번역 업데이트 완료", "done", 2000);
        } catch (err) {
          console.warn("[WebTranslator] 동적 번역 오류:", err);
          showStatus("동적 번역 오류", "error", 3000);
        } finally {
          isObserverBusy = false;
          if (isTranslated && observer) {
            observer.observe(document.body, { childList: true, subtree: true });
          }
        }
      }

      // 2. 비가시 영역 블록 → 지연 또는 즉시
      if (hiddenBlocks.length > 0) {
        if (cachedSettings.lazyTranslate) {
          setupLazyObserver(hiddenBlocks);
        } else {
          isObserverBusy = true;
          if (observer) observer.disconnect();
          showStatus("보이지 않는 영역 동적 번역 중…", "loading");

          try {
            await translateBlocks(hiddenBlocks, cachedSettings);
            showStatus("번역 업데이트 완료", "done", 2000);
          } catch (err) {
            console.warn("[WebTranslator] 동적 지연 번역 오류:", err);
            showStatus("동적 번역 오류", "error", 3000);
          } finally {
            isObserverBusy = false;
            if (isTranslated && observer) {
              observer.observe(document.body, { childList: true, subtree: true });
            }
          }
        }
      }
    }
  }

  /* ────────────────────────────────────────────
   * 스크롤 기반 지연 번역 (Lazy Translation)
   * ──────────────────────────────────────────── */

  function setupLazyObserver(blocks) {
    if (!lazyObserver) {
      lazyObserver = new IntersectionObserver((entries) => {
        // 초기 번역 렌더링 중이거나 원상복구 상태면 무시
        if (isTranslating || !isTranslated) return;

        let hasNew = false;
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const block = elementToBlockMap.get(entry.target);
            if (block && !entry.target.getAttribute("data-wt-translated")) {
              pendingLazyBlocks.add(block);
              hasNew = true;
            }
            lazyObserver.unobserve(entry.target);
          }
        });

        if (hasNew) {
          clearTimeout(lazyObserverTimer);
          lazyObserverTimer = setTimeout(async () => {
            const blocksToTranslate = [...pendingLazyBlocks];
            pendingLazyBlocks.clear();
            if (blocksToTranslate.length > 0) {
              showStatus("지연 영역 번역 중…", "loading");
              try {
                await translateBlocks(blocksToTranslate, cachedSettings);
                showStatus("업데이트 완료", "done", 1500);
              } catch (err) {
                console.warn("[WebTranslator] 지연 번역 오류:", err);
                showStatus("지연 번역 오류", "error", 3000);
              }
            }
          }, 300);
        }
      }, { rootMargin: "600px" }); // 위아래 600px 여유 공간에서 감지
    }

    blocks.forEach((b) => {
      elementToBlockMap.set(b.element, b);
      lazyObserver.observe(b.element);
    });
  }

  /* ────────────────────────────────────────────
   * 텍스트 블록 수집 (필터링 및 가시성 판단)
   * ──────────────────────────────────────────── */

  function collectTextBlocks(root, targetLang, isSelection = false) {
    const blocks = [];
    const visited = new WeakSet();
    const vh = window.innerHeight || document.documentElement.clientHeight;

    function walk(element) {
      if (!element?.tagName) return;
      if (SKIP_TAGS.has(element.tagName)) return;
      if (element.getAttribute("data-wt-translated")) return;
      if (element.classList?.contains("wt-status-indicator")) return;
      if (element.classList?.contains("wt-translation")) return;
      if (element.classList?.contains("wt-dictionary-popup")) return;
      if (element.closest?.(".wt-translation")) return;
      if (element.closest?.(".wt-dictionary-popup")) return;
      if (visited.has(element)) return;
      visited.add(element);

      if (isVisuallyHidden(element)) return;
      if (element.closest?.(COMPLEX_ANCESTOR_SEL)) return;

      let interactiveChildCount = 0;
      let hasBlockChild = false;
      let hasButtonChild = false;
      for (const child of element.children) {
        if (child.tagName === "BR") { hasBlockChild = true; break; }
        if (SKIP_TAGS.has(child.tagName)) continue;
        if (isButtonLike(child) || child.tagName === "A" || child.tagName === "BUTTON" || child.tagName === "LI") {
          interactiveChildCount++;
          if (isButtonLike(child)) hasButtonChild = true;
        }
        // [P1 FIX #7] <a>, <label>, <span> 등 인라인 태그라도 내부에 <p>, <div> 등 블록 요소나 <br>이 있으면 블록으로 간주
        if (INLINE_TAGS.has(child.tagName) || child.tagName === "A" || child.tagName === "LABEL") {
          if (child.querySelector("p, div, article, section, li, ul, ol, table, h1, h2, h3, h4, h5, h6, blockquote, br")) {
            hasBlockChild = true;
          } else {
            // 인라인 태그 내부에 <a>가 2개 이상이고 직접 텍스트가 거의 없으면 네비게이션/링크 그룹
            // 예: <span class="header_links"><a>About</a><a>Prefs</a></span>
            const linkCount = child.querySelectorAll("a").length;
            if (linkCount > 1) {
              const directText = [...child.childNodes]
                .filter((n) => n.nodeType === Node.TEXT_NODE)
                .map((n) => n.textContent.trim())
                .join("");
              if (directText.length < 5) {
                hasBlockChild = true;
              } else {
                continue;
              }
            } else {
              continue;
            }
          }
        } else {
          // 블록 레벨 태그(<div>, <p> 등)라도 computed display가 인라인이면 인라인으로 처리
          // 예: Steam의 <div class="Focusable">처럼 CSS로 인라인 배치된 <div>
          const disp = window.getComputedStyle(child).display;
          if (disp.startsWith("inline") || disp === "contents") {
            // 단, 인라인 컨테이너라도 내부에 다른 블록이나 버튼 요소가 있으면 분리
            if (child.querySelector("p, div, article, section, li, ul, ol, table, blockquote, br, button, [role='button'], .btn, .btn_addtocart, .btn_green_steamui, .btn_blue_steamui")) {
              hasBlockChild = true;
            } else {
              continue; // 단순 텍스트/인라인만 포함한 시각적 인라인 컨테이너
            }
          } else {
            hasBlockChild = true;
          }
        }
      }

      // interactiveChildCount > 1 처리:
      // - 단순 <a> 링크만 여럿인 경우라도 부모에 직접 텍스트가 없으면 네비게이션 그룹
      //   예: 탭바 <a>All</a><a>Discussions</a>... → 각각 번역
      // - 부모에 직접 텍스트가 있으면 문장 속 하이퍼링크 → 하나로 수집
      //   예: "Showing 115 reviews ( <a>Very Positive</a> )" → 전체 수집
      const hasOnlyLinkInteractive = interactiveChildCount > 1 &&
        [...element.children].every(
          (c) => SKIP_TAGS.has(c.tagName) ||
                 INLINE_TAGS.has(c.tagName) ||
                 c.tagName === "A" || c.tagName === "LABEL"
        );
      const directText = [...element.childNodes]
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent.trim())
        .join("");
      const hasTextWithLinks = hasOnlyLinkInteractive && directText.length > 5;
      if (interactiveChildCount > 1 && !hasTextWithLinks) {
        hasBlockChild = true;
      }


      if (!hasBlockChild && !hasButtonChild) {
        // 순수 인라인 텍스트만 있는 경우 — 현재 element를 통째로 번역
        const hasRuby = !!element.querySelector("rt, rp, ruby");
        const isPure = checkIsPureText(element) && !hasRuby;
        const text = isPure ? element.innerText?.trim() : getTranslatableText(element);

        if (text && shouldTranslateText(text, targetLang, element, isSelection)) {
          // [Fix A] 자식 전체를 visited에 등록 → 어떤 경로로도 이중 수집 방지
          element.querySelectorAll("*").forEach((child) => visited.add(child));
          const rect = element.getBoundingClientRect();
          const isVisible = rect.bottom > -500 && rect.top < vh + 500;
          blocks.push({ element, text, originalHTML: element.innerHTML, isPure, isVisible });
        }
      } else if (hasButtonChild) {
        // 버튼 형태 자식이 있으면 절대 하나로 묶지 않고 각 자식으로 내려감
        const childSnapshot = [...element.children];
        for (const child of childSnapshot) {
          if (child.parentElement === element) walk(child);
        }
      } else {
        // 블록 레벨 자식 혼합 — 고아 텍스트런 래핑 후 자식 순회
        const childSnapshot = [...element.children];
        const wrappers = wrapTextRuns(element);

        for (const wrapper of wrappers) {
          const text = getTranslatableText(wrapper);
          if (text && shouldTranslateText(text, targetLang, wrapper, isSelection)) {
            // [Fix A] wrapper 내부 자식도 visited 등록 → 이후 walk loop에서 이중 수집 방지
            wrapper.querySelectorAll("*").forEach((child) => visited.add(child));
            const rect = wrapper.getBoundingClientRect();
            const isVisible = rect.bottom > -500 && rect.top < vh + 500;
            blocks.push({ element: wrapper, text, originalHTML: wrapper.innerHTML, isPure: true, isWrapper: true, isVisible });
          }
        }

        for (const child of childSnapshot) {
          if (child.parentElement === element) walk(child);
        }
      }
    }

    walk(root);
    return blocks;
  }

  /* ────────────────────────────────────────────
   * 고아 텍스트 런 수집 및 래핑
   * ──────────────────────────────────────────── */

  function getDirectTextRuns(container) {
    const runs = [];
    let curNodes = [];
    let curText = "";

    function flush() {
      if (curText.trim() && shouldTranslateText(curText.trim(), "any", container)) {
        const hasDirectText = curNodes.some(
          (n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim().length > 1
        );
        if (hasDirectText) runs.push({ nodes: curNodes.slice() });
      }
      curNodes = [];
      curText = "";
    }

    for (const child of container.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        curNodes.push(child);
        curText += child.textContent;
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const tag = child.tagName;
        if (tag === "BR") { flush(); continue; }
        if (SKIP_TAGS.has(tag)) continue;
        if (isButtonLike(child)) {
          flush();
        // [P1 FIX #7] <a>, <label> 모두 인라인 텍스트런에 통합 (파편화 방지)
        } else if (INLINE_TAGS.has(tag) || tag === "A" || tag === "LABEL") {
          // 인라인 태그 내부에 <a> 2개 이상 + 직접 텍스트 거의 없으면 네비게이션 그룹 → flush
          const linkCount = child.querySelectorAll("a").length;
          if (linkCount > 1) {
            const directText = [...child.childNodes]
              .filter((n) => n.nodeType === Node.TEXT_NODE)
              .map((n) => n.textContent.trim())
              .join("");
            if (directText.length < 5) {
              flush();
            } else {
              curNodes.push(child);
              curText += getTranslatableText(child);
            }
          } else {
            curNodes.push(child);
            curText += getTranslatableText(child);
          }
        } else {
          // 블록 레벨 태그라도 computed display가 인라인이면 텍스트런에 포함
          const disp = window.getComputedStyle(child).display;
          if (disp.startsWith("inline") || disp === "contents") {
            if (child.querySelector("p, div, article, section, li, ul, ol, table, blockquote, br, button, [role='button'], .btn, .btn_addtocart, .btn_green_steamui, .btn_blue_steamui")) {
              flush();
            } else {
              curNodes.push(child);
              curText += getTranslatableText(child);
            }
          } else {
            flush();
          }
        }
      }
    }
    flush();
    return runs;
  }

  function wrapTextRuns(container) {
    const runs = getDirectTextRuns(container);
    const wrappers = [];
    for (const run of runs) {
      const wrapper = document.createElement("span");
      wrapper.className = "wt-text-wrapper";
      const first = run.nodes[0];
      first.parentNode.insertBefore(wrapper, first);
      for (const node of run.nodes) {
        wrapper.appendChild(node);
      }
      wrappers.push(wrapper);
    }
    return wrappers;
  }

  /* ────────────────────────────────────────────
   * 사용자 사전 매칭 유틸리티
   * ──────────────────────────────────────────── */

  function buildDictRegex(original) {
    const escaped = original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const isAscii = /^[\x00-\x7F]+$/.test(original);
    return isAscii
      ? new RegExp(`\\b${escaped}\\b`, 'gi')
      : new RegExp(escaped, 'gi');
  }

  function applyLocalDictionary(text, customDict) {
    if (!customDict || !Array.isArray(customDict) || customDict.length === 0) return text;
    let result = text;
    for (const item of customDict) {
      if (!item.original || !item.translated) continue;
      result = result.replace(buildDictRegex(item.original), item.translated);
    }
    return result;
  }

  /* ────────────────────────────────────────────
   * 날짜/시간 정규화 및 원격 번역 필요 여부 판단
   * ──────────────────────────────────────────── */

  // 월 이름 목록 (needsRemoteTranslation 날짜 필터용)
  const MONTH_NAMES =
    "jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|" +
    "january|february|march|april|june|july|august|september|october|november|december";

  /**
   * [P1 FIX #8] 날짜/시간 표기의 구조적 오류만 최소한으로 수정합니다.
   * API 전송 전에 한국어 문자열을 삽입하지 않아 번역 문맥을 보존합니다.
   * 수정 대상: 연도와 시각이 붙어있는 경우만 ("202611:32" → "2026 11:32")
   */
  function normalizeDateTimes(text) {
    if (!text || typeof text !== "string") return text;
    return text.replace(/(\b\d{4})(\d{1,2}:\d{2})\b/g, "$1 $2");
  }

  function needsRemoteTranslation(text, customDict) {
    let temp = text;

    // 1. 사용자 사전 단어 제거
    if (customDict && Array.isArray(customDict)) {
      for (const item of customDict) {
        if (!item.original) continue;
        temp = temp.replace(buildDictRegex(item.original), ' ');
      }
    }

    // 2. 단위 제거
    temp = temp.replace(/\b\d+(?:\.\d+)?\s*(MB|KB|GB|TB|Byte|px|em|rem|%|am|pm)\b/gi, ' ');

    // 3. 시간 제거: "6:08am", "7:51 PM"
    temp = temp.replace(/\b\d{1,2}:\d{2}(?:\s*[ap]m)?\b/gi, ' ');

    // 4. 날짜 제거 — 월 이름을 명시적으로 고정해 오탐 방지
    //    "16 Jul, 2025" / "16 Jul 2025"
    temp = temp.replace(
      new RegExp(`\\b\\d{1,2}\\s+(${MONTH_NAMES}),?\\s+\\d{4}\\b`, "gi"), " "
    );
    //    "27 Jun" (연도 없는 단기 형식)
    temp = temp.replace(
      new RegExp(`\\b\\d{1,2}\\s+(${MONTH_NAMES})\\b`, "gi"), " "
    );
    //    "July 22, 2026" / "Jul 22 2026"
    temp = temp.replace(
      new RegExp(`\\b(${MONTH_NAMES})\\s+\\d{1,2},?\\s+\\d{4}\\b`, "gi"), " "
    );
    //    "July 2026" (일 없는 형식)
    temp = temp.replace(
      new RegExp(`\\b(${MONTH_NAMES})\\s+\\d{4}\\b`, "gi"), " "
    );

    // 5. 시간대/오전오후 약어 제거
    temp = temp.replace(/\b(AM|PM|ET|UTC|JST|KST|PST|EST|GMT)\b/gi, ' ');

    // 6. 남은 기호(@, ,) 및 순수 숫자 제거
    temp = temp.replace(/[@,]/g, ' ');
    temp = temp.replace(/\d+/g, ' ');

    // 7. 남은 글자수 확인 (유니코드 문자 2자 이상이면 번역 필요)
    const letters = temp.match(/\p{L}/gu);
    return letters !== null && letters.length >= 2;
  }

  /* ────────────────────────────────────────────
   * 헬퍼 함수 (필터링 로직)
   * ──────────────────────────────────────────── */

  function isAlreadyTargetLang(text, targetLang, isSelection = false) {
    if (!text || !targetLang) return false;
    const clean = text.trim();
    if (!clean) return false;

    const allLetters = clean.match(/\p{L}/gu);
    if (!allLetters || allLetters.length === 0) return false;

    let targetCount = 0;
    if (targetLang === "ko") {
      const matches = clean.match(/[\uAC00-\uD7A3]/g);
      targetCount = matches ? matches.length : 0;
    } else if (targetLang === "en") {
      const matches = clean.match(/[a-zA-Z]/g);
      targetCount = matches ? matches.length : 0;
    } else if (targetLang === "ja") {
      const matches = clean.match(/[\u3040-\u309F\u30A0-\u30FF]/g);
      targetCount = matches ? matches.length : 0;
    } else if (targetLang === "zh-CN" || targetLang === "zh-TW") {
      const matches = clean.match(/[\u4E00-\u9FFF]/g);
      const jaKana = clean.match(/[\u3040-\u309F\u30A0-\u30FF]/g);
      if (jaKana && jaKana.length > 0) return false;
      targetCount = matches ? matches.length : 0;
    } else if (targetLang === "ru" || targetLang === "uk") {
      const matches = clean.match(/[\u0400-\u04FF]/g);
      targetCount = matches ? matches.length : 0;
    } else if (targetLang === "ar" || targetLang === "he") {
      const matches = clean.match(/[\u0600-\u06FF\u0590-\u05FF]/g);
      targetCount = matches ? matches.length : 0;
    } else if (targetLang === "hi") {
      const matches = clean.match(/[\u0900-\u097F]/g);
      targetCount = matches ? matches.length : 0;
    } else if (targetLang === "th") {
      const matches = clean.match(/[\u0E00-\u0E7F]/g);
      targetCount = matches ? matches.length : 0;
    } else if (targetLang === "el") {
      const matches = clean.match(/[\u0370-\u03FF]/g);
      targetCount = matches ? matches.length : 0;
    } else {
      return false;
    }

    const threshold = isSelection ? 0.85 : 0.6;
    return (targetCount / allLetters.length) >= threshold;
  }

  function shouldTranslateText(text, targetLang, element = null, isSelection = false) {
    if (!text || text.length < 2) return false;

    // 단순 URL이나 이메일 주소만 있는 경우 스킵
    if (/^(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})$/.test(text.trim())) return false;

    // 시각적으로 숨겨진 접근성 요구나 아이콘 폰트 스킵
    if (isVisuallyHidden(element)) return false;

    // 슬라이더 / 페이지네이션 Dot 스킵
    if (isSliderDot(element, text)) return false;

    // 아이콘 폰트 / 특수기호 / PUA 영역 단독 문자 스킵
    const cleanLetters = text.replace(/[\uE000-\uF8FF\u2000-\u2BFF\s\d\p{P}\p{S}]/gu, "");
    if (cleanLetters.length === 0) return false;

    // 언어 기반 스킵 (단순 포함이 아닌 목표 언어 문자 비율 60%/85% 기준)
    if (isAlreadyTargetLang(text, targetLang, isSelection)) {
      return false;
    }

    const dict = cachedSettings ? cachedSettings.customDict : [];

    // 로컬 사전에 의해 변환될 내용이 있으면 무조건 수집 대상
    const localTranslated = applyLocalDictionary(text, dict);
    if (localTranslated !== text) return true;

    // 선택 영역 번역의 경우 명시적 사용자 지정 영역이므로 수집 허용
    if (isSelection) return true;

    // 그 외에는 원격 번역이 필요한지 여부로 판단
    return needsRemoteTranslation(text, dict);
  }

  function checkIsPureText(element) {
    return !element.querySelector(COMPLEX_CHILD_SEL);
  }

  function isVisuallyHidden(element) {
    if (!element) return false;
    if (element.hidden || element.getAttribute("aria-hidden") === "true") return true;
    if (element.closest?.(HIDDEN_ANCESTOR_SEL)) return true;

    try {
      const style = window.getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") return true;
    } catch {}

    return false;
  }

  function isSliderDot(element, text) {
    if (!element) return false;
    const sliderContainer = element.closest?.('[class*="dot" i], [class*="pagination" i], [class*="slider" i], [class*="carousel" i], [class*="paddles" i]');
    if (!sliderContainer) return false;

    const trimmed = text.trim();
    if (/^(item|slide|page|품목|페이지)?\s*\d+$/i.test(trimmed) || /^[\u2022\u25CF\u25CB\u25A0\u25A1\.\s]+$/.test(trimmed)) {
      return true;
    }
    return false;
  }

  function getTranslatableText(element) {
    const parts = [];
    const walker = document.createTreeWalker(
      element, NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_SKIP;
          if (parent.tagName === "RT" || parent.tagName === "RP" || parent.closest("rt, rp"))
            return NodeFilter.FILTER_REJECT;
          if (parent.closest(COMPLEX_ANCESTOR_SEL) || parent.closest(HIDDEN_ANCESTOR_SEL))
            return NodeFilter.FILTER_REJECT;
          if (node.textContent.trim()) return NodeFilter.FILTER_ACCEPT;
          return NodeFilter.FILTER_SKIP;
        },
      }
    );
    while (walker.nextNode()) parts.push(walker.currentNode.textContent.trim());
    return parts.join(" ");
  }

  function normalizeWS(s) {
    return (s || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function isButtonLike(element) {
    const tag = element.tagName;
    if (tag === "BUTTON") return true;
    const cls = (element.className || "").toString().toLowerCase();
    // "btn", "btn_darkblue..." (Steam 스타일), "button" 등 버튼 관련 클래스 감지
    if (/btn[_-]|\bbtn\b|\bbutton\b/.test(cls)) return true;
    if (element.getAttribute("role") === "button") return true;
    return false;
  }

  /* ────────────────────────────────────────────
   * overflow:hidden 해제 / 복원 (Fix E)
   * ──────────────────────────────────────────── */

  function unlockOverflowAncestors(element) {
    let el = element.parentElement;
    let depth = 0;
    while (el && el !== document.body && depth < 6) {
      const style = window.getComputedStyle(el);
      const hasClip =
        style.overflow === "hidden" || style.overflowY === "hidden" ||
        style.overflow === "clip"   || style.overflowY === "clip";
      const hasMaxH = style.maxHeight && style.maxHeight !== "none" && style.maxHeight !== "0px";
      if (hasClip && hasMaxH && !el.hasAttribute("data-wt-overflow-original")) {
        el.setAttribute("data-wt-overflow-original",
          `${el.style.overflow}|${el.style.overflowY}|${el.style.maxHeight}`);
        el.style.overflowY = "visible";
        el.style.maxHeight = "none";
      }
      el = el.parentElement;
      depth++;
    }
  }

  /* ────────────────────────────────────────────
   * 번역 적용
   * ──────────────────────────────────────────── */

  function applyTranslation(element, originalHTML, translatedText, displayMode, isPure, isWrapper, engine) {
    // [P0 FIX #2] 이미 번역된 요소는 중복 적용 방지
    if (element.hasAttribute("data-wt-translated")) return;

    const originalText = element.innerText?.trim() || "";
    if (normalizeWS(translatedText) === normalizeWS(originalText)) return;

    // [P1 FIX #5] 이미 백업된 원본은 덮어쓰지 않음 (변형된 상태 저장 방지)
    if (!element.hasAttribute("data-wt-original")) {
      element.setAttribute("data-wt-original", originalHTML);
    }

    // [FIX] 인라인/블록 판단은 실제 번역 대상 텍스트(originalText) 기준
    // element.innerText는 타임스탬프, 툴팁 등 번역 외 텍스트를 포함할 수 있음
    const selfText = (originalText?.trim() || element.innerText?.trim() || "");

    // [Fix B] CJK 텍스트는 글자 하나하나가 단어 — 공백 분리 wordCount 대신 CJK 글자수를 단어 수로 사용
    const cjkChars = (selfText.match(/[\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7A3\u0400-\u04FF]/gu) || []).length;
    const rawWordCount = selfText.split(/\s+/).filter((w) => w.length > 0).length;
    // CJK: 각 글자가 단어이몀 cjkChars 자체를 wordCount로 (스페이스 분리와 max)
    const wordCount = cjkChars > 0 ? Math.max(rawWordCount, cjkChars) : rawWordCount;

    // [Fix B] 비라틴 문자포함 여부
    const hasNonLatin = cjkChars > 0;
    // CJK 8글자 = 영어 45자에 해당하는 정보량
    const charThreshold = hasNonLatin ? 8  : 45;
    const wordThreshold = hasNonLatin ? 3  : 7;

    // 긴 문단/다중 문장 판단
    const isLongParagraph =
      selfText.length > charThreshold ||
      wordCount > wordThreshold ||
      /\w{3,}[.!?！？。](\s|$)/.test(selfText);


    let isInline = false;
    if (isLongParagraph) {
      // 긴 문단은 UI 컨텍스트(header, nav 등)나 인라인 태그(span 등) 내부이더라도 무조건 블록(dual-block)으로 처리
      // 예외1: 명확한 버튼 요소이면서 40자 이하 & 6단어 이하인 라벨
      // 예외2: 단일 링크 컨테이너 — <a> 하나만 자식으로 갖고 직접 텍스트 없음
      //        예: <div class="flex_row"><a><bdi>닉네임</bdi></a></div>
      //        닉네임이 중국어 문장형이어도 인라인으로 표시
      const isOnlyLinkContainer = (
        element.tagName === "A" ||
        (element.children.length === 1 &&
         element.children[0].tagName === "A" &&
         [...element.childNodes]
           .filter((n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim().length > 0)
           .length === 0)
      );
      // 버튼 요소이면서 길이가 40자 이하이면 단어 수(CJK 글자 수)와 무관하게 인라인 허용
      if (isOnlyLinkContainer || (isButtonLike(element) && selfText.length <= 40)) {
        isInline = true;
      } else {
        isInline = false;
      }
    } else {
      const isUIContext = !!element.closest("nav, header, [role='navigation'], [role='menuitem'], [role='tab'], [role='button']");
      // [Fix B] CJK의 경우 wordCount가 글자수이므로 15글자까지 허용
      const maxShortWords = hasNonLatin ? 15 : 5;
      const isShortWord = wordCount > 0 && wordCount <= maxShortWords && selfText.length <= 35;
      const forceInline = isButtonLike(element) || isUIContext;

      isInline = forceInline || isShortWord ||
        (!isWrapper && (INLINE_TAGS.has(element.tagName) ||
          element.tagName === "A" || element.tagName === "BUTTON" || element.tagName === "LABEL"));
    }

    // [Fix A/G] wrapTextRuns에 의해 생성된 wrapper는 버튼/인터랙티브 컨텍스트 제외하고 블록 강제
    // 단, 짧은 wrapper (5단어/35자 이하)는 UI 레이블 가능성 → 인라인 허용
    // 예: 버튼 레이블(Browse), 사용자명(Mr. Tabasco) 등
    if (isWrapper) {
      const isInButtonCtx = !!element.closest('button, [role="button"]');
      const maxWrapperWords = hasNonLatin ? 15 : 5;
      const isShortWrapper = wordCount <= maxWrapperWords && selfText.length <= 35;
      if (!isInButtonCtx && !isShortWrapper) isInline = false;
    }

    // [Fix C] 리스트(li, ul, ol 등) 내부는 길이 차이로 인해 인라인/블록이 뒤섞이지 않도록 블록으로 일관성 유지
    // (단, 네비게이션 탭이나 버튼 같은 명확한 UI 컨텍스트는 인라인 허용)
    if (isInline) {
      const isInListCtx = !!element.closest("li, ul, ol, dl, dt, dd");
      if (isInListCtx) {
        const isUIContext = !!element.closest("nav, header, [role='navigation'], [role='menuitem'], [role='tab'], [role='button']");
        if (!isButtonLike(element) && !isUIContext) {
          isInline = false;
        }
      }
    }
    const engineLabel = (engine || (cachedSettings ? cachedSettings.translationMode : "UNKNOWN")).toUpperCase();
    console.log(
      `[WebTranslator DOM] [Engine: ${engineLabel}] [${isInline ? 'INLINE' : 'BLOCK'}] "${originalText.slice(0, 35)}..." ➔ "${translatedText.slice(0, 35)}..."`,
      element
    );
    if (displayMode === "replace") {
      // 교체 모드: 원본을 번역문으로 교체
      element.setAttribute("data-wt-translated", "replaced");
      if (isPure) {
        element.textContent = translatedText;
      } else {
        replaceVisibleTextNodes(element, translatedText);
      }
    } else {
      // Dual 모드: 원문 보존 + 번역 span 추가
      element.setAttribute("data-wt-translated", isInline ? "dual-inline" : "dual-block");

      const span = document.createElement("span");
      span.className = isInline
        ? "wt-translation wt-inline"
        : "wt-translation wt-block";

      if (isInline) {
        // [Fix G] 번역 결과 앞뒤 괄호 정규화 → )) 이중 괄호 방지
        const cleanTranslated = translatedText
          .replace(/^[\s(（]+/, "")
          .replace(/[\s)）]+$/, "");
        span.textContent = `(${cleanTranslated})`;
      } else {
        // 블록: 번역문을 원문 아래에 표시
        span.textContent = translatedText;
      }

      // 인라인 위치 이탈 수정: <a>/<button>/<label>은 블록 span을 내부 삽입 시
      // 링크/버튼 안으로 들어가 위치 이탈 → 부모의 다음 형제로 삽입
      const isLinkLike = element.tagName === "A" || element.tagName === "BUTTON" || element.tagName === "LABEL";
      if (isLinkLike && !isInline && element.parentNode) {
        element.parentNode.insertBefore(span, element.nextSibling);
      } else {
        element.appendChild(span);
      }
    }


    // [P0 FIX #2] Set에 추가 (자동 중복 방지)
    translatedElements.add(element);
  }

  function replaceVisibleTextNodes(element, translatedText) {
    const textNodes = [];
    const walker = document.createTreeWalker(
      element, NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_SKIP;
          if (parent.closest(COMPLEX_ANCESTOR_SEL) || parent.closest(HIDDEN_ANCESTOR_SEL))
            return NodeFilter.FILTER_REJECT;
          if (node.textContent.trim()) return NodeFilter.FILTER_ACCEPT;
          return NodeFilter.FILTER_SKIP;
        },
      }
    );
    while (walker.nextNode()) textNodes.push(walker.currentNode);
    if (textNodes.length === 0) return;
    textNodes[0].nodeValue = translatedText;
    for (let i = 1; i < textNodes.length; i++) textNodes[i].nodeValue = "";
  }

  /* ────────────────────────────────────────────
   * 원본 복원
   * ──────────────────────────────────────────── */

  function revertTranslation() {
    // 모든 옵저버 중지
    stopObserver();

    // [P2 FIX #11] 모든 대기 타이머 즉시 취소
    clearTimeout(lazyObserverTimer);
    lazyObserverTimer = null;

    if (lazyObserver) {
      lazyObserver.disconnect();
      lazyObserver = null;
    }
    pendingLazyBlocks.clear();
    elementToBlockMap = new WeakMap(); // 참조 맵 초기화

    // 1단계: translatedElements 복원
    // wt-text-wrapper는 innerHTML 복원 직후 즉시 unwrap
    translatedElements.forEach((el) => {
      const original = el.getAttribute("data-wt-original");
      if (original !== null) el.innerHTML = original;
      el.removeAttribute("data-wt-translated");
      el.removeAttribute("data-wt-original");

      if (el.classList?.contains("wt-text-wrapper")) {
        const parent = el.parentNode;
        if (parent) {
          while (el.firstChild) parent.insertBefore(el.firstChild, el);
          parent.removeChild(el);
        }
      }
    });

    // 2단계: translatedElements에 없던 잔존 wt-text-wrapper 최종 청소
    document.querySelectorAll(".wt-text-wrapper").forEach((wrapper) => {
      const parent = wrapper.parentNode;
      if (parent) {
        while (wrapper.firstChild) parent.insertBefore(wrapper.firstChild, wrapper);
        parent.removeChild(wrapper);
      }
    });

    // [Fix E] overflow 복원
    document.querySelectorAll("[data-wt-overflow-original]").forEach((el) => {
      const parts = el.getAttribute("data-wt-overflow-original").split("|");
      el.style.overflow    = parts[0] || "";
      el.style.overflowY   = parts[1] || "";
      el.style.maxHeight   = parts[2] || "";
      el.removeAttribute("data-wt-overflow-original");
    });

    // [P0 FIX #2] Set 초기화
    translatedElements.clear();
    isTranslated = false;
    // [P1 FIX #6] 설정 초기화 → MutationObserver가 구버전 설정으로 동적 번역하는 것 방지
    cachedSettings = null;
    showStatus("원본으로 복원됨", "done", 2000);
  }

  /* ────────────────────────────────────────────
   * Background 메시지 유틸
   * ──────────────────────────────────────────── */

  function sendToBackground(message) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) resolve(null);
          else resolve(response);
        });
      } catch {
        resolve(null);
      }
    });
  }

  /* ────────────────────────────────────────────
   * 상태 표시기
   * ──────────────────────────────────────────── */

  function createStatusElement() {
    if (statusEl) return statusEl;
    statusEl = document.createElement("div");
    statusEl.className = "wt-status-indicator";
    document.body.appendChild(statusEl);
    return statusEl;
  }

  function showStatus(text, type = "loading", autoHideMs = 0) {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }

    const el = createStatusElement();
    el.classList.remove("wt-hiding");
    el.innerHTML = "";

    if (type === "loading") {
      const spinner = document.createElement("div");
      spinner.className = "wt-spinner";
      el.appendChild(spinner);
    } else if (type === "done") {
      const icon = document.createElement("span");
      icon.className = "wt-icon-done";
      icon.innerHTML =
        '<svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>';
      el.appendChild(icon);
    } else if (type === "error") {
      const icon = document.createElement("span");
      icon.className = "wt-icon-error";
      icon.innerHTML =
        '<svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>';
      el.appendChild(icon);
    }

    const span = document.createElement("span");
    span.textContent = text;
    el.appendChild(span);

    if (type === "loading") {
      const bar = document.createElement("div");
      bar.className = "wt-progress-bar";
      bar.style.width = "0%";
      el.appendChild(bar);
    }

    if (autoHideMs > 0) {
      hideTimer = setTimeout(() => hideStatus(), autoHideMs);
    }
  }

  function updateStatus(text, progress = 0) {
    if (!statusEl) return;
    const span = statusEl.querySelector("span:not([class])");
    if (span) span.textContent = text;
    const bar = statusEl.querySelector(".wt-progress-bar");
    if (bar) bar.style.width = `${Math.round(progress * 100)}%`;
  }

  function hideStatus() {
    if (!statusEl) return;
    statusEl.classList.add("wt-hiding");
    setTimeout(() => {
      if (statusEl?.parentNode) {
        statusEl.parentNode.removeChild(statusEl);
        statusEl = null;
      }
    }, 300);
  }

  /* ────────────────────────────────────────────
   * v3.0 이미지 번역 호버 버튼 초기화
   * ──────────────────────────────────────────── */
  import(chrome.runtime.getURL("modules/image_translator/hover_button_manager.js"))
    .then((mod) => mod.initHoverButtonManager())
    .catch((err) => console.error("[WebTranslator] v3.0 HoverManager 로드 실패:", err));
})();

