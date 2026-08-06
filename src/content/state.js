
  var isTranslated = false;
  var isTranslating = false;
  var isObserverBusy = false;
  var translatedElements = new Set();
  var statusEl = null;
  var hideTimer = null;
  var observer = null;
  var pendingNodes = new Set();
  var observerTimer = null;
  var cachedSettings = null;
  var localCache = {};
  var lazyObserver = null;
  var lazyObserverTimer = null;
  var pendingLazyBlocks = new Set();
  var elementToBlockMap = new WeakMap();

  var LLM_ENGINES = new Set(["gemini", "chatgpt", "openai", "claude", "ollama"]);
  function isLLMEngine(mode) { return LLM_ENGINES.has((mode || "").toLowerCase()); }

  var SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "SVG", "MATH", "CODE", "PRE", "TEXTAREA", "INPUT", "SELECT", "IFRAME", "CANVAS", "VIDEO", "AUDIO", "BR", "HR", "META", "LINK", "HEAD", "TEMPLATE", "RT", "RP"]);
  var INLINE_TAGS = new Set(["ABBR", "B", "BDO", "BIG", "CITE", "DFN", "EM", "I", "KBD", "MARK", "Q", "S", "SAMP", "SMALL", "STRONG", "SUB", "SUP", "U", "VAR", "WBR", "TIME", "DATA", "SPAN", "FONT", "RUBY"]);
  var COMPLEX_ANCESTOR_SEL = "svg, canvas, video, audio, iframe, picture, object, embed, select, textarea, input, noscript";
  var COMPLEX_CHILD_SEL = "img, svg, canvas, video, audio, picture, source, iframe, object, embed, input, select, textarea";
  var HIDDEN_ANCESTOR_SEL = "[class*=\"sr-only\" i], [class*=\"visually-hidden\" i], [aria-hidden=\"true\"], [hidden]";
  var BATCH_SIZE = 8;
  
  var activeDictPopup = null;
  var dictCache = new Map();
  var dictRateLimitUntil = 0;
  var currentPopupContext = null;

