import { state } from "./state.js";
import { checkIsPureText, getTranslatableText, normalizeWS, shouldTranslateText, isButtonLike, isVisuallyHidden } from "./utils.js";

/* ────────────────────────────────────────────
   * 텍스트 블록 수집 (필터링 및 가시성 판단)
   * ──────────────────────────────────────────── */

  export function collectTextBlocks(root, targetLang, isSelection = false) {
    var blocks = [];
    var visited = new WeakSet();
    var vh = window.innerHeight || document.documentElement.clientHeight;

    function walk(element) {
      if (!element?.tagName) return;
      if (state.SKIP_TAGS.has(element.tagName)) return;
      if (element.getAttribute("data-wt-translated")) return;
      if (element.classList?.contains("wt-status-indicator")) return;
      if (element.classList?.contains("wt-translation")) return;
      if (element.classList?.contains("wt-dictionary-popup")) return;
      if (element.closest?.(".wt-translation")) return;
      if (element.closest?.(".wt-dictionary-popup")) return;
      if (visited.has(element)) return;
      visited.add(element);

      if (isVisuallyHidden(element)) return;
      if (element.closest?.(state.COMPLEX_ANCESTOR_SEL)) return;

      var interactiveChildCount = 0;
      var hasBlockChild = false;
      var hasButtonChild = false;
      for (const child of element.children) {
        if (child.tagName === "BR") { hasBlockChild = true; break; }
        if (state.SKIP_TAGS.has(child.tagName)) continue;
        if (isButtonLike(child) || child.tagName === "A" || child.tagName === "BUTTON" || child.tagName === "LI") {
          interactiveChildCount++;
          if (isButtonLike(child)) hasButtonChild = true;
        }
        // [P1 FIX #7] <a>, <label>, <span> 등 인라인 태그라도 내부에 <p>, <div> 등 블록 요소나 <br>이 있으면 블록으로 간주
        if (state.INLINE_TAGS.has(child.tagName) || child.tagName === "A" || child.tagName === "LABEL") {
          if (child.querySelector("p, div, article, section, li, ul, ol, table, h1, h2, h3, h4, h5, h6, blockquote, br")) {
            hasBlockChild = true;
          } else {
            // 인라인 태그 내부에 <a>가 2개 이상이고 직접 텍스트가 거의 없으면 네비게이션/링크 그룹
            // 예: <span class="header_links"><a>About</a><a>Prefs</a></span>
            var linkCount = child.querySelectorAll("a").length;
            if (linkCount > 1) {
              var directText = [...child.childNodes]
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
          var disp = window.getComputedStyle(child).display;
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
      var hasOnlyLinkInteractive = interactiveChildCount > 1 &&
        [...element.children].every(
          (c) => state.SKIP_TAGS.has(c.tagName) ||
                 state.INLINE_TAGS.has(c.tagName) ||
                 c.tagName === "A" || c.tagName === "LABEL"
        );
      var directText = [...element.childNodes]
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent.trim())
        .join("");
      var hasTextWithLinks = hasOnlyLinkInteractive && directText.length > 5;
      if (interactiveChildCount > 1 && !hasTextWithLinks) {
        hasBlockChild = true;
      }


      if (!hasBlockChild && !hasButtonChild) {
        // 순수 인라인 텍스트만 있는 경우 — 현재 element를 통째로 번역
        var hasRuby = !!element.querySelector("rt, rp, ruby");
        var isPure = checkIsPureText(element) && !hasRuby;
        var text = isPure ? element.innerText?.trim() : getTranslatableText(element);

        if (text && shouldTranslateText(text, targetLang, element, isSelection)) {
          // [Fix A] 자식 전체를 visited에 등록 → 어떤 경로로도 이중 수집 방지
          element.querySelectorAll("*").forEach((child) => visited.add(child));
          var rect = element.getBoundingClientRect();
          var isVisible = rect.bottom > -500 && rect.top < vh + 500;
          blocks.push({ element, text, originalHTML: element.innerHTML, isPure, isVisible });
        }
      } else if (hasButtonChild) {
        // 버튼 형태 자식이 있으면 절대 하나로 묶지 않고 각 자식으로 내려감
        var childSnapshot = [...element.children];
        for (const child of childSnapshot) {
          if (child.parentElement === element) walk(child);
        }
      } else {
        // 블록 레벨 자식 혼합 — 고아 텍스트런 래핑 후 자식 순회
        var childSnapshot = [...element.children];
        var wrappers = wrapTextRuns(element);

        for (const wrapper of wrappers) {
          var text = getTranslatableText(wrapper);
          if (text && shouldTranslateText(text, targetLang, wrapper, isSelection)) {
            // [Fix A] wrapper 내부 자식도 visited 등록 → 이후 walk loop에서 이중 수집 방지
            wrapper.querySelectorAll("*").forEach((child) => visited.add(child));
            var rect = wrapper.getBoundingClientRect();
            var isVisible = rect.bottom > -500 && rect.top < vh + 500;
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

  export function getDirectTextRuns(container) {
    var runs = [];
    var curNodes = [];
    var curText = "";

    function flush() {
      if (curText.trim() && shouldTranslateText(curText.trim(), "any", container)) {
        var hasDirectText = curNodes.some(
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
        var tag = child.tagName;
        if (tag === "BR") { flush(); continue; }
        if (state.SKIP_TAGS.has(tag)) continue;
        if (isButtonLike(child)) {
          flush();
        // [P1 FIX #7] <a>, <label> 모두 인라인 텍스트런에 통합 (파편화 방지)
        } else if (state.INLINE_TAGS.has(tag) || tag === "A" || tag === "LABEL") {
          // 인라인 태그 내부에 <a> 2개 이상 + 직접 텍스트 거의 없으면 네비게이션 그룹 → flush
          var linkCount = child.querySelectorAll("a").length;
          if (linkCount > 1) {
            var directText = [...child.childNodes]
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
          var disp = window.getComputedStyle(child).display;
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

  export function wrapTextRuns(container) {
    var runs = getDirectTextRuns(container);
    var wrappers = [];
    for (const run of runs) {
      var wrapper = document.createElement("span");
      wrapper.className = "wt-text-wrapper";
      var first = run.nodes[0];
      first.parentNode.insertBefore(wrapper, first);
      for (const node of run.nodes) {
        wrapper.appendChild(node);
      }
      wrappers.push(wrapper);
    }
    return wrappers;
  }

  /* ────────────────────────────────────────────
   * 번역 적용
   * ──────────────────────────────────────────── */

  export function applyTranslation(element, originalHTML, translatedText, displayMode, isPure, isWrapper, engine) {
    // [P0 FIX #2] 이미 번역된 요소는 중복 적용 방지
    if (element.hasAttribute("data-wt-translated")) return;

    var originalText = element.innerText?.trim() || "";
    if (normalizeWS(translatedText) === normalizeWS(originalText)) return;

    // [P1 FIX #5] 이미 백업된 원본은 덮어쓰지 않음 (변형된 상태 저장 방지)
    if (!element.hasAttribute("data-wt-original")) {
      element.setAttribute("data-wt-original", originalHTML);
    }

    // [FIX] 인라인/블록 판단은 실제 번역 대상 텍스트(originalText) 기준
    // element.innerText는 타임스탬프, 툴팁 등 번역 외 텍스트를 포함할 수 있음
    var selfText = (originalText?.trim() || element.innerText?.trim() || "");

    // [Fix B] CJK 텍스트는 글자 하나하나가 단어 — 공백 분리 wordCount 대신 CJK 글자수를 단어 수로 사용
    var cjkChars = (selfText.match(/[\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7A3\u0400-\u04FF]/gu) || []).length;
    var rawWordCount = selfText.split(/\s+/).filter((w) => w.length > 0).length;
    // CJK: 각 글자가 단어이몀 cjkChars 자체를 wordCount로 (스페이스 분리와 max)
    var wordCount = cjkChars > 0 ? Math.max(rawWordCount, cjkChars) : rawWordCount;

    // [Fix B] 비라틴 문자포함 여부
    var hasNonLatin = cjkChars > 0;
    // CJK 8글자 = 영어 45자에 해당하는 정보량
    var charThreshold = hasNonLatin ? 8  : 45;
    var wordThreshold = hasNonLatin ? 3  : 7;

    // 긴 문단/다중 문장 판단
    var isLongParagraph =
      selfText.length > charThreshold ||
      wordCount > wordThreshold ||
      /\w{3,}[.!?！？。](\s|$)/.test(selfText);


    var isInline = false;
    if (isLongParagraph) {
      // 긴 문단은 UI 컨텍스트(header, nav 등)나 인라인 태그(span 등) 내부이더라도 무조건 블록(dual-block)으로 처리
      // 예외1: 명확한 버튼 요소이면서 40자 이하 & 6단어 이하인 라벨
      // 예외2: 단일 링크 컨테이너 — <a> 하나만 자식으로 갖고 직접 텍스트 없음
      //        예: <div class="flex_row"><a><bdi>닉네임</bdi></a></div>
      //        닉네임이 중국어 문장형이어도 인라인으로 표시
      var isOnlyLinkContainer = (
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
      var isUIContext = !!element.closest("nav, header, [role='navigation'], [role='menuitem'], [role='tab'], [role='button']");
      // [Fix B] CJK의 경우 wordCount가 글자수이므로 15글자까지 허용
      var maxShortWords = hasNonLatin ? 15 : 5;
      var isShortWord = wordCount > 0 && wordCount <= maxShortWords && selfText.length <= 35;
      var forceInline = isButtonLike(element) || isUIContext;

      isInline = forceInline || isShortWord ||
        (!isWrapper && (state.INLINE_TAGS.has(element.tagName) ||
          element.tagName === "A" || element.tagName === "BUTTON" || element.tagName === "LABEL"));
    }

    // [Fix A/G] wrapTextRuns에 의해 생성된 wrapper는 버튼/인터랙티브 컨텍스트 제외하고 블록 강제
    // 단, 짧은 wrapper (5단어/35자 이하)는 UI 레이블 가능성 → 인라인 허용
    // 예: 버튼 레이블(Browse), 사용자명(Mr. Tabasco) 등
    if (isWrapper) {
      var isInButtonCtx = !!element.closest('button, [role="button"]');
      var maxWrapperWords = hasNonLatin ? 15 : 5;
      var isShortWrapper = wordCount <= maxWrapperWords && selfText.length <= 35;
      if (!isInButtonCtx && !isShortWrapper) isInline = false;
    }

    // [Fix C] 리스트(li, ul, ol 등) 내부는 길이 차이로 인해 인라인/블록이 뒤섞이지 않도록 블록으로 일관성 유지
    // (단, 네비게이션 탭이나 버튼 같은 명확한 UI 컨텍스트는 인라인 허용)
    if (isInline) {
      var isInListCtx = !!element.closest("li, ul, ol, dl, dt, dd");
      if (isInListCtx) {
        var isUIContext = !!element.closest("nav, header, [role='navigation'], [role='menuitem'], [role='tab'], [role='button']");
        if (!isButtonLike(element) && !isUIContext) {
          isInline = false;
        }
      }
    }
    var engineLabel = (engine || (state.cachedSettings ? state.cachedSettings.translationMode : "UNKNOWN")).toUpperCase();
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

      var span = document.createElement("span");
      span.className = isInline
        ? "wt-translation wt-inline"
        : "wt-translation wt-block";

      if (isInline) {
        // [Fix G] 번역 결과 앞뒤 괄호 정규화 → )) 이중 괄호 방지
        var cleanTranslated = translatedText
          .replace(/^[\s(（]+/, "")
          .replace(/[\s)）]+$/, "");
        span.textContent = `(${cleanTranslated})`;
      } else {
        // 블록: 번역문을 원문 아래에 표시
        span.textContent = translatedText;
      }

      // 원문 글자 색상을 더 정확하게 추출하기 위해 텍스트 노드를 직접 감싸고 있는 요소를 탐색
      // 단, 전체 텍스트 중 일부만 <a> 태그인 경우 <a>의 색상(파란색 등)이 전체 번역문에 적용되는 것을 막기 위해 <a> 내부 텍스트는 우선 제외
      var actualTextElement = element;
      var walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          if (node.textContent.trim().length === 0) return NodeFilter.FILTER_SKIP;
          if (element.tagName !== "A" && node.parentElement && node.parentElement.closest("a")) {
            return NodeFilter.FILTER_SKIP;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      });
      
      var foundTextNode = walker.nextNode();
      if (!foundTextNode) {
        // 모든 텍스트가 <a> 안에만 있는 경우 등에는 조건 없이 첫 텍스트 노드 탐색
        var fallbackWalker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
          acceptNode(node) {
            return node.textContent.trim().length > 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
          }
        });
        foundTextNode = fallbackWalker.nextNode();
      }

      if (foundTextNode) {
        actualTextElement = foundTextNode.parentElement || element;
      }

      // 옵션 4(상속)를 위해 계산된 실제 원문 글자 색상을 CSS 변수로 저장
      try {
        var computedTextColor = window.getComputedStyle(actualTextElement).color;
        span.style.setProperty("--wt-inline-inherit-color", computedTextColor);
      } catch(e) {}

      // 옵션 1: 텍스트 그림자 색상 동적 계산 (실제 원문 글자 색상 기준)
      if (state.cachedSettings?.inlineShadow) {
        try {
          var color = window.getComputedStyle(actualTextElement).color;
          var rgbMatch = color.match(/\d+/g);
          if (rgbMatch && rgbMatch.length >= 3) {
            var r = parseInt(rgbMatch[0]), g = parseInt(rgbMatch[1]), b = parseInt(rgbMatch[2]);
            var yiq = (r * 299 + g * 587 + b * 114) / 1000;
            span.style.setProperty("--wt-inline-glow-color", yiq > 128 ? "rgba(0,0,0,0.85)" : "rgba(255,255,255,0.9)");
          }
        } catch(e) {}
      }

      // 옵션 3: 환경 적응 색상 (실제 투명하지 않은 가장 가까운 시각적 배경색 탐색)
      if (state.cachedSettings?.inlineAdaptiveColor) {
        try {
          var bgNode = actualTextElement;
          var bgColor = null;
          while (bgNode && bgNode.nodeType === Node.ELEMENT_NODE) {
            var bg = window.getComputedStyle(bgNode).backgroundColor;
            var aMatch = bg.match(/rgba\([^,]+,[^,]+,[^,]+,\s*([^)]+)\)/);
            if (!aMatch || parseFloat(aMatch[1]) > 0.1) {
              if (bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") {
                bgColor = bg;
                break;
              }
            }
            bgNode = bgNode.parentElement;
          }
          
          if (!bgColor) {
            var textColor = window.getComputedStyle(actualTextElement).color;
            var tcMatch = textColor.match(/\d+/g);
            if (tcMatch && tcMatch.length >= 3) {
              var tr = parseInt(tcMatch[0]), tg = parseInt(tcMatch[1]), tb = parseInt(tcMatch[2]);
              var tYiq = (tr * 299 + tg * 587 + tb * 114) / 1000;
              bgColor = tYiq > 128 ? "rgb(0, 0, 0)" : "rgb(255, 255, 255)";
            } else {
              bgColor = "rgb(255, 255, 255)";
            }
          }

          var rgbMatch = bgColor.match(/\d+/g);
          if (rgbMatch && rgbMatch.length >= 3) {
            var r = parseInt(rgbMatch[0]), g = parseInt(rgbMatch[1]), b = parseInt(rgbMatch[2]);
            var yiq = (r * 299 + g * 587 + b * 114) / 1000;
            span.style.setProperty("--wt-inline-adaptive-color", yiq > 128 ? "#000000" : "#ffffff");
          }
        } catch(e) {}
      }

      // 인라인 위치 이탈 수정: <a>/<button>/<label>은 블록 span을 내부 삽입 시
      // 링크/버튼 안으로 들어가 위치 이탈 → 부모의 다음 형제로 삽입
      var isLinkLike = element.tagName === "A" || element.tagName === "BUTTON" || element.tagName === "LABEL";
      if (isLinkLike && !isInline && element.parentNode) {
        element.parentNode.insertBefore(span, element.nextSibling);
      } else {
        element.appendChild(span);
      }
    }


    // [P0 FIX #2] Set에 추가 (자동 중복 방지)
    state.translatedElements.add(element);
  }

  export function replaceVisibleTextNodes(element, translatedText) {
    var textNodes = [];
    var walker = document.createTreeWalker(
      element, NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          var parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_SKIP;
          if (parent.closest(state.COMPLEX_ANCESTOR_SEL) || parent.closest(state.HIDDEN_ANCESTOR_SEL))
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

