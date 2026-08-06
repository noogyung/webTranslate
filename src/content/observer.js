import { state } from "./state.js";
import { collectTextBlocks } from "./dom.js";
import { translateBlocks } from "./translation.js";
import { showStatus } from "./ui.js";

/* ────────────────────────────────────────────
   * 동적 콘텐츠 감시 (MutationObserver)
   * ──────────────────────────────────────────── */

  export function startObserver() {
    if (state.observer) state.observer.disconnect();

    state.observer = new MutationObserver((mutations) => {
      if (state.isTranslating || state.isObserverBusy || !state.isTranslated) return;

      for (const mutation of mutations) {
        if (mutation.type !== "childList") continue;
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          if (isOurElement(node) || node.closest(".wt-dictionary-popup")) continue;
          if (node.closest("[data-wt-translated]")) continue;
          if (node.getAttribute("data-wt-translated")) continue;
          state.pendingNodes.add(node);
        }
      }

      if (state.pendingNodes.size === 0) return;

      clearTimeout(state.observerTimer);
      state.observerTimer = setTimeout(() => {
        var nodes = [...state.pendingNodes];
        state.pendingNodes.clear();
        translateNewNodes(nodes);
      }, 500);
    });

    state.observer.observe(document.body, { childList: true, subtree: true });
  }

  export function stopObserver() {
    if (state.observer) {
      state.observer.disconnect();
      state.observer = null;
    }
    clearTimeout(state.observerTimer);
    state.observerTimer = null;
    state.pendingNodes.clear();
  }

  export function isOurElement(node) {
    var cl = node.classList;
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

  export async function translateNewNodes(nodes) {
    if (!state.cachedSettings || state.isObserverBusy) return;

    var allBlocks = [];
    for (const node of nodes) {
      if (!document.body.contains(node)) continue;
      if (node.getAttribute("data-wt-translated")) continue;
      var blocks = collectTextBlocks(node, state.cachedSettings.targetLang);
      allBlocks.push(...blocks);
    }

    if (allBlocks.length > 0) {
      var visibleBlocks = [];
      var hiddenBlocks = [];
      for (const b of allBlocks) {
        if (b.isVisible) visibleBlocks.push(b);
        else hiddenBlocks.push(b);
      }

      // 1. 가시 영역 블록 → 즉시 번역
      if (visibleBlocks.length > 0) {
        state.isObserverBusy = true;
        if (state.observer) state.observer.disconnect();
        showStatus("새로운 텍스트 번역 중…", "loading");

        try {
          await translateBlocks(visibleBlocks, state.cachedSettings);
          showStatus("번역 업데이트 완료", "done", 2000);
        } catch (err) {
          console.warn("[WebTranslator] 동적 번역 오류:", err);
          showStatus("동적 번역 오류", "error", 3000);
        } finally {
          state.isObserverBusy = false;
          if (state.isTranslated && state.observer) {
            state.observer.observe(document.body, { childList: true, subtree: true });
          }
        }
      }

      // 2. 비가시 영역 블록 → 지연 또는 즉시
      if (hiddenBlocks.length > 0) {
        if (state.cachedSettings.lazyTranslate) {
          setupLazyObserver(hiddenBlocks);
        } else {
          state.isObserverBusy = true;
          if (state.observer) state.observer.disconnect();
          showStatus("보이지 않는 영역 동적 번역 중…", "loading");

          try {
            await translateBlocks(hiddenBlocks, state.cachedSettings);
            showStatus("번역 업데이트 완료", "done", 2000);
          } catch (err) {
            console.warn("[WebTranslator] 동적 지연 번역 오류:", err);
            showStatus("동적 번역 오류", "error", 3000);
          } finally {
            state.isObserverBusy = false;
            if (state.isTranslated && state.observer) {
              state.observer.observe(document.body, { childList: true, subtree: true });
            }
          }
        }
      }
    }
  }

  /* ────────────────────────────────────────────
   * 스크롤 기반 지연 번역 (Lazy Translation)
   * ──────────────────────────────────────────── */

  export function setupLazyObserver(blocks) {
    if (!state.lazyObserver) {
      state.lazyObserver = new IntersectionObserver((entries) => {
        // 초기 번역 렌더링 중이거나 원상복구 상태면 무시
        if (state.isTranslating || !state.isTranslated) return;

        var hasNew = false;
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            var block = state.elementToBlockMap.get(entry.target);
            if (block && !entry.target.getAttribute("data-wt-translated")) {
              state.pendingLazyBlocks.add(block);
              hasNew = true;
            }
            state.lazyObserver.unobserve(entry.target);
          }
        });

        if (hasNew) {
          clearTimeout(state.lazyObserverTimer);
          state.lazyObserverTimer = setTimeout(async () => {
            var blocksToTranslate = [...state.pendingLazyBlocks];
            state.pendingLazyBlocks.clear();
            if (blocksToTranslate.length > 0) {
              showStatus("지연 영역 번역 중…", "loading");
              try {
                await translateBlocks(blocksToTranslate, state.cachedSettings);
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
      state.elementToBlockMap.set(b.element, b);
      state.lazyObserver.observe(b.element);
    });
  }

