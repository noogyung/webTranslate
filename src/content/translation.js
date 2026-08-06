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

      state.isTranslated = true;
      state.isTranslating = false; // 옵저버가 새 요소를 감지할 수 있도록 즉시 해제
      startObserver(); // 동적 콘텐츠 감시 즉시 시작

      // 2. 보이지 않는 부분 후속 번역 (지연 옵션 분기)
      if (hiddenBlocks.length > 0) {
        if (settings.lazyTranslate) {
          setupLazyObserver(hiddenBlocks);
          showStatus("번역 완료!", "done", 2500);
        } else {
          // 전체 번역 모드일 경우 백그라운드에서 비동기로 이어서 번역 (무한 스크롤 등 동적 콘텐츠 감지와 병렬 처리)
          translateBlocks(hiddenBlocks, settings, (done) => {
            var curr = visibleBlocks.length + done;
            updateStatus(`전체 번역 중… (${curr}/${total})`, curr / total);
          }).then(() => {
            if (state.isTranslated) showStatus("번역 완료!", "done", 2500);
          }).catch(err => {
            console.warn("[WebTranslator] 백그라운드 번역 오류", err);
          });
        }
      } else {
        showStatus("번역 완료!", "done", 2500);
      }
    } catch (err) {
      state.isTranslating = false;
      showStatus(`오류: ${err.message}`, "error", 5000);
    }
  }

  export function getBatchConfig(mode, isBatchMode = false) {
    if (isBatchMode) {
      // 일괄 번역: 한 번에 너무 많이 보내면(150개) Gemini가 번역을 누락하거나 빈 문자열을 반환하는 품질 저하가 발생함.
      // 번역 퀄리티가 유지되는 최대 안전선(40개)으로 줄이고, 직렬로 전송.
      return { batchSize: 40, concurrency: 1 };
    }

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
    // 지연 번역을 껐을 때 대량의 요소가 들어오면 일괄 번역 모드로 처리하여 API 다중 호출을 방지함
    var isBatchMode = !settings.lazyTranslate && unCachedBlocks.length > 30;
    var { batchSize, concurrency } = getBatchConfig(settings.translationMode, isBatchMode);

    var batchesQueue = [];
    var batchIdCounter = 0;
    for (let i = 0; i < unCachedBlocks.length; i += batchSize) {
      batchesQueue.push({ 
        id: batchIdCounter++, 
        batch: unCachedBlocks.slice(i, i + batchSize), 
        availableAt: 0, 
        retryCount: 0 
      });
    }

    var pendingBatches = batchesQueue.length;

    async function worker() {
      while (pendingBatches > 0) {
        if (!state.isTranslated && !state.isTranslating) break;

        var readyIdx = batchesQueue.findIndex(b => Date.now() >= b.availableAt);
        if (readyIdx === -1) {
          // 대기 중인 배치는 있으나 10초 쿨타임이 안 끝난 경우 잠시 대기
          await new Promise(r => setTimeout(r, 500));
          continue;
        }

        var item = batchesQueue.splice(readyIdx, 1)[0];
        var batch = item.batch;

        // API Rate Limit 방지를 위한 딜레이 (일괄 번역 모드 시 첫 시도에만)
        if (isBatchMode && item.id > 0 && item.retryCount === 0) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }

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
              var transText = applyLocalDictionary(rawTranslation, dict);
              applyTranslation(
                block.element, block.originalHTML, transText,
                settings.displayMode, block.isPure, block.isWrapper || false,
                result?.engine || settings.translationMode
              );
              newCacheEntries[block.text] = rawTranslation;
              state.localCache[block.text] = rawTranslation;
            }
          });

          if (Object.keys(newCacheEntries).length > 0) {
            try {
              chrome.runtime.sendMessage({
                action: "setCache",
                targetLang: settings.targetLang,
                dictionary: newCacheEntries,
              });
            } catch { /* fire-and-forget */ }
          }

          completed += batch.length;
          if (onProgress) onProgress(completed);
          pendingBatches--;

        } catch (err) {
          var errMsg = err.message || "";
          
          if (errMsg.includes("Extension context invalidated")) {
            console.error(`[WebTranslator] 확장 프로그램이 업데이트되었거나 재시작되었습니다. 페이지를 새로고침해주세요.`);
            // 새로고침 필요하므로 전체 진행 중단
            pendingBatches = 0;
            break;
          }

          var isRateLimit = errMsg.includes("429") || errMsg.includes("503") || errMsg.includes("한도 초과") || errMsg.includes("과부하") || errMsg.includes("RESOURCE_EXHAUSTED");
          var isCommunicationError = errMsg.includes("message port closed") || errMsg.includes("Background script returned undefined") || errMsg.includes("Failed to send message") || errMsg.includes("비어 있습니다");

          if ((isRateLimit || isCommunicationError) && item.retryCount < 3) {
            item.retryCount++;
            item.availableAt = Date.now() + (isRateLimit ? 10000 : 3000); // 통신 오류는 3초, 한도 초과는 10초 대기
            batchesQueue.push(item);
            console.warn(`[WebTranslator] 배치 ${item.id} 일시적 오류("${errMsg}"). 재시도 큐에 추가됨 (재시도 ${item.retryCount}/3 회차)`);
          } else {
            var isTimeout = err.name === "AbortError" || errMsg.includes("timed out") || errMsg.includes("timeout");
            if (isTimeout) {
              console.warn(`[WebTranslator] 배치 ${item.id} 시간초과 — 스킵하고 계속 진행`, err);
            } else {
              console.warn(`[WebTranslator] 배치 ${item.id} 오류 — 스킵하고 계속 진행 (재시도 초과 또는 치명적 오류)`, err);
            }
            
            // 다른 에러의 경우 스킵 처리하되 완료 카운트는 올려서 프로그레스 바 갱신
            completed += batch.length;
            if (onProgress) onProgress(completed);
            pendingBatches--;
          }
        }
      }
    }

    var workers = [];
    var activeWorkerCount = Math.min(concurrency, pendingBatches);
    for (let i = 0; i < activeWorkerCount; i++) {
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

