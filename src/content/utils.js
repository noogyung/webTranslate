  /* ────────────────────────────────────────────
   * 날짜/시간 정규화 및 원격 번역 필요 여부 판단
   * ──────────────────────────────────────────── */

  // 월 이름 목록 (needsRemoteTranslation 날짜 필터용)
  var MONTH_NAMES =
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
    var temp = text;

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
    var letters = temp.match(/\p{L}/gu);
    return letters !== null && letters.length >= 2;
  }

\n  /* ────────────────────────────────────────────
   * 헬퍼 함수 (필터링 로직)
   * ──────────────────────────────────────────── */

  function isAlreadyTargetLang(text, targetLang, isSelection = false) {
    if (!text || !targetLang) return false;
    var clean = text.trim();
    if (!clean) return false;

    var allLetters = clean.match(/\p{L}/gu);
    if (!allLetters || allLetters.length === 0) return false;

    var targetCount = 0;
    if (targetLang === "ko") {
      var matches = clean.match(/[\uAC00-\uD7A3]/g);
      targetCount = matches ? matches.length : 0;
    } else if (targetLang === "en") {
      var matches = clean.match(/[a-zA-Z]/g);
      targetCount = matches ? matches.length : 0;
    } else if (targetLang === "ja") {
      var matches = clean.match(/[\u3040-\u309F\u30A0-\u30FF]/g);
      targetCount = matches ? matches.length : 0;
    } else if (targetLang === "zh-CN" || targetLang === "zh-TW") {
      var matches = clean.match(/[\u4E00-\u9FFF]/g);
      var jaKana = clean.match(/[\u3040-\u309F\u30A0-\u30FF]/g);
      if (jaKana && jaKana.length > 0) return false;
      targetCount = matches ? matches.length : 0;
    } else if (targetLang === "ru" || targetLang === "uk") {
      var matches = clean.match(/[\u0400-\u04FF]/g);
      targetCount = matches ? matches.length : 0;
    } else if (targetLang === "ar" || targetLang === "he") {
      var matches = clean.match(/[\u0600-\u06FF\u0590-\u05FF]/g);
      targetCount = matches ? matches.length : 0;
    } else if (targetLang === "hi") {
      var matches = clean.match(/[\u0900-\u097F]/g);
      targetCount = matches ? matches.length : 0;
    } else if (targetLang === "th") {
      var matches = clean.match(/[\u0E00-\u0E7F]/g);
      targetCount = matches ? matches.length : 0;
    } else if (targetLang === "el") {
      var matches = clean.match(/[\u0370-\u03FF]/g);
      targetCount = matches ? matches.length : 0;
    } else {
      return false;
    }

    var threshold = isSelection ? 0.85 : 0.6;
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
    var cleanLetters = text.replace(/[\uE000-\uF8FF\u2000-\u2BFF\s\d\p{P}\p{S}]/gu, "");
    if (cleanLetters.length === 0) return false;

    // 언어 기반 스킵 (단순 포함이 아닌 목표 언어 문자 비율 60%/85% 기준)
    if (isAlreadyTargetLang(text, targetLang, isSelection)) {
      return false;
    }

    var dict = cachedSettings ? cachedSettings.customDict : [];

    // 로컬 사전에 의해 변환될 내용이 있으면 무조건 수집 대상
    var localTranslated = applyLocalDictionary(text, dict);
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
      var style = window.getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") return true;
    } catch {}

    return false;
  }

  function isSliderDot(element, text) {
    if (!element) return false;
    var sliderContainer = element.closest?.('[class*="dot" i], [class*="pagination" i], [class*="slider" i], [class*="carousel" i], [class*="paddles" i]');
    if (!sliderContainer) return false;

    var trimmed = text.trim();
    if (/^(item|slide|page|품목|페이지)?\s*\d+$/i.test(trimmed) || /^[\u2022\u25CF\u25CB\u25A0\u25A1\.\s]+$/.test(trimmed)) {
      return true;
    }
    return false;
  }

  function getTranslatableText(element) {
    var parts = [];
    var walker = document.createTreeWalker(
      element, NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          var parent = node.parentElement;
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
    var tag = element.tagName;
    if (tag === "BUTTON") return true;
    var cls = (element.className || "").toString().toLowerCase();
    // "btn", "btn_darkblue..." (Steam 스타일), "button" 등 버튼 관련 클래스 감지
    if (/btn[_-]|\bbtn\b|\bbutton\b/.test(cls)) return true;
    if (element.getAttribute("role") === "button") return true;
    return false;
  }

