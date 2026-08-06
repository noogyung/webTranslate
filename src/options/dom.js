  var modeRadios = document.querySelectorAll('input[name="translationMode"]');
  var displayRadios = document.querySelectorAll('input[name="displayMode"]');
  var apiKeySection = document.getElementById("apiKeySection");
  var geminiApiKeyInput = document.getElementById("geminiApiKey");
  var geminiModelInput = document.getElementById("geminiModel");
  var apiModelSection = document.getElementById("apiModelSection");
  var libreUrlSection = document.getElementById("libreUrlSection");
  var libreUrlInput = document.getElementById("libreUrl");
  var toggleKeyBtn = document.getElementById("toggleKeyVisibility");
  var targetLangSelect = document.getElementById("targetLang");
  var saveBtn = document.getElementById("saveBtn");
  var saveStatus = document.getElementById("saveStatus");
  var lazyTranslateInput = document.getElementById("lazyTranslate");
  var loadModelsBtn = document.getElementById("loadModelsBtn");
  var loadModelsHint = document.getElementById("loadModelsHint");
  var geminiModelList = document.getElementById("geminiModelList");
  
  var showPhoneticsInput = document.getElementById("showPhonetics");
  // Custom Dictionary DOM
  var addDictBtn = document.getElementById("addDictBtn");
  var dictTableBody = document.getElementById("dictTableBody");

\n  const openaiSection = document.getElementById("openaiSection");
  var openaiApiKeyInput = document.getElementById("openaiApiKey");
  var openaiModelInput = document.getElementById("openaiModel");
  var loadOpenAIModelsBtn = document.getElementById("loadOpenAIModelsBtn");
  var openaiModelList = document.getElementById("openaiModelList");
\n  const claudeSection = document.getElementById("claudeSection");
  var claudeApiKeyInput = document.getElementById("claudeApiKey");
  var claudeModelSelect = document.getElementById("claudeModel");

  var ollamaSection = document.getElementById("ollamaSection");
  var ollamaUrlInput = document.getElementById("ollamaUrl");
  var ollamaModelInput = document.getElementById("ollamaModel");
  var ollamaCustomPromptInput = document.getElementById("ollamaCustomPrompt");

\n  const transColorInput = document.getElementById("transColor");
  var transFontSizeSelect = document.getElementById("transFontSize");
  var transItalicInput = document.getElementById("transItalic");
  var transBgAlphaInput = document.getElementById("transBgAlpha");

\n  let currentCustomDict = [];

  var openDictModalBtn = document.getElementById("openDictModalBtn");
  var closeDictModalBtn = document.getElementById("closeDictModalBtn");
  var cancelDictModalBtn = document.getElementById("cancelDictModalBtn");
  var saveDictModalBtn = document.getElementById("saveDictModalBtn");
  var dictModal = document.getElementById("dictModal");
  var dictModalTableBody = document.getElementById("dictModalTableBody");
  var modalRowCount = document.getElementById("modalRowCount");
  var dictSummaryCount = document.getElementById("dictSummaryCount");
  var addDictRowBtn = document.getElementById("addDictRowBtn");
  var importCsvBtn = document.getElementById("importCsvBtn");
  var exportCsvBtn = document.getElementById("exportCsvBtn");
  var clearDictBtn = document.getElementById("clearDictBtn");
  var csvFileInput = document.getElementById("csvFileInput");

\n  const resetStyleBtn = document.getElementById("resetStyleBtn");
  if (resetStyleBtn) {
\n  const clearCacheBtn = document.getElementById("clearCacheBtn");
  if (clearCacheBtn) {
