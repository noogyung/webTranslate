import { state } from "./state.js";
import { sendToBackground } from "./api.js";
import { applyTranslation, collectTextBlocks } from "./dom.js";
import { startObserver, setupLazyObserver, stopObserver } from "./observer.js";
import { updateStatus, updateCustomStyles, showStatus } from "./ui.js";
import { normalizeDateTimes, needsRemoteTranslation } from "./utils.js";

/* ────────────────────────────────────────────
   * 번역 시작
   * ──────────────────────────────────────────── */

  export async function startTranslation() {
    state.isTranslating = true;

    var settings = await sendToBackground({ action: "getSettings" });
    if (!settings) {
      showStatus("설정을 불러올 수 없습니다.", "error", 3000);
      state.isTranslating = false;
      return;
    }
    state.cachedSettings = settings;
    updateCustomStyles(settings);

    // 캐시 불러오기
    var cacheResult = await sendToBackground({ action: "getCache", targetLang: settings.targetLang });
    state.localCache = cacheResult?.cache || {};

    showStatus("페이지 분석 중…", "loading");

    // 블록 수집 (필터링 통과한 것들만)
    var textBlocks = collectTextBlocks(document.body, settings.targetLang);

    if (textBlocks.length === 0) {
      showStatus("번역할 텍스트가 없습니다.", "done", 2500);
      state.isTranslating = false;
      return;
    }

    // 최우선순위(보이는 부분)와 차순위(안보이는 부분) 분리
    var visibleBlocks = [];
    var hiddenBlocks = [];
    for (const b of textBlocks) {
      if (b.isVisible) visibleBlocks.push(b);
      else hiddenBlocks.push(b);
    }

    var total = textBlocks.length;
    var completed = 0;
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

      state.isTranslated = true;
      showStatus("번역 완료!", "done", 2500);

      // 동적 콘텐츠 감시 시작
      startObserver();
    } catch (err) {
      showStatus(`오류: ${err.message}`, "error", 5000);
    } finally {
      state.isTranslating = false;
    }
  }

  export function getBatchConfig(mode) {
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

  export async function translateBlocks(textBlocks, settings, onProgress) {
    var unCachedBlocks = [];
    var completed = 0;
    var dict = settings.customDict || [];

    // 1. 캐시 적중 처리 및 로컬 번역 단독 처리
    for (const block of textBlocks) {
      var original = block.text;
      var needsRemote = needsRemoteTranslation(original, dict);

      if (!needsRemote) {
        // 로컬 전용 경로: 사전 치환만으로 번역 완료
        var localTranslated = applyLocalDictionary(original, dict);
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
      else if (state.localCache[original]) {
        // [P0 FIX #1] 캐시된 순수 API 결과에 현재 사전을 동적으로 적용
        var transText = applyLocalDictionary(state.localCache[original], dict);
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
    var { batchSize, concurrency } = getBatchConfig(settings.translationMode);

    var batches = [];
    for (let i = 0; i < unCachedBlocks.length; i += batchSize) {
      batches.push(unCachedBlocks.slice(i, i + batchSize));
    }

    var currentIndex = 0;

    async function worker() {
      while (currentIndex < batches.length) {
        var batchIdx = currentIndex++;
        var batch = batches[batchIdx];
        // [P1 FIX #8] 최소 개입: 구조적 오류(연도+시각 붙음)만 분리
        var texts = batch.map((b) => normalizeDateTimes(b.text));

        try {
          var result = await sendToBackground({
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

          var newCacheEntries = {};

          batch.forEach((block, idx) => {
            if (idx < result.translations.length && result.translations[idx]) {
              var rawTranslation = result.translations[idx];
              // [P0 FIX #1] 화면에는 사전 적용 결과 표시
              var transText = applyLocalDictionary(rawTranslation, dict);
              // [P0 FIX #3] 동기적 DOM 업데이트
              applyTranslation(
                block.element, block.originalHTML, transText,
                settings.displayMode, block.isPure, block.isWrapper || false,
                result?.engine || settings.translationMode
              );
              // [P0 FIX #1] 캐시에는 순수 API 결과만 저장 (사전 변경 시에도 안전)
              newCacheEntries[block.text] = rawTranslation;
              state.localCache[block.text] = rawTranslation;
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
          var isTimeout = err.name === "AbortError" || err.message?.includes("timed out") || err.message?.includes("timeout");
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

    var workers = [];
    for (let i = 0; i < Math.min(concurrency, batches.length); i++) {
      workers.push(worker());
    }

    await Promise.all(workers);
  }

  /* ────────────────────────────────────────────
   * 사용자 사전 매칭 유틸리티
   * ──────────────────────────────────────────── */

  export function buildDictRegex(original) {
    var escaped = original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var isAscii = /^[\x00-\x7F]+$/.test(original);
    return isAscii
      ? new RegExp(`\\b${escaped}\\b`, 'gi')
      : new RegExp(escaped, 'gi');
  }

  export function applyLocalDictionary(text, customDict) {
    if (!customDict || !Array.isArray(customDict) || customDict.length === 0) return text;
    var result = text;
    for (const item of customDict) {
      if (!item.original || !item.translated) continue;
      result = result.replace(buildDictRegex(item.original), item.translated);
    }
    return result;
  }

  /* ────────────────────────────────────────────
   * 원본 복원
   * ──────────────────────────────────────────── */

  export function revertTranslation() {
    // 모든 옵저버 중지
    stopObserver();

    // [P2 FIX #11] 모든 대기 타이머 즉시 취소
    clearTimeout(state.lazyObserverTimer);
    state.lazyObserverTimer = null;

    if (state.lazyObserver) {
      state.lazyObserver.disconnect();
      state.lazyObserver = null;
    }
    state.pendingLazyBlocks.clear();
    state.elementToBlockMap = new WeakMap(); // 참조 맵 초기화

    // 1단계: state.translatedElements 복원
    // wt-text-wrapper는 innerHTML 복원 직후 즉시 unwrap
    state.translatedElements.forEach((el) => {
      var original = el.getAttribute("data-wt-original");
      if (original !== null) el.innerHTML = original;
      el.removeAttribute("data-wt-translated");
      el.removeAttribute("data-wt-original");

      if (el.classList?.contains("wt-text-wrapper")) {
        var parent = el.parentNode;
        if (parent) {
          while (el.firstChild) parent.insertBefore(el.firstChild, el);
          parent.removeChild(el);
        }
      }
    });

    // 2단계: translatedElements에 없던 잔존 wt-text-wrapper 최종 청소
    document.querySelectorAll(".wt-text-wrapper").forEach((wrapper) => {
      var parent = wrapper.parentNode;
      if (parent) {
        while (wrapper.firstChild) parent.insertBefore(wrapper.firstChild, wrapper);
        parent.removeChild(wrapper);
      }
    });

    // [Fix E] overflow 복원
    document.querySelectorAll("[data-wt-overflow-original]").forEach((el) => {
      var parts = el.getAttribute("data-wt-overflow-original").split("|");
      el.style.overflow    = parts[0] || "";
      el.style.overflowY   = parts[1] || "";
      el.style.maxHeight   = parts[2] || "";
      el.removeAttribute("data-wt-overflow-original");
    });

    // [P0 FIX #2] Set 초기화
    state.translatedElements.clear();
    state.isTranslated = false;
    // [P1 FIX #6] 설정 초기화 → MutationObserver가 구버전 설정으로 동적 번역하는 것 방지
    state.cachedSettings = null;
    showStatus("원본으로 복원됨", "done", 2000);
  }

