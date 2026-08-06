  function createDictRow(orig = "", trans = "") {
    var tr = document.createElement("tr");
    
    var tdOrig = document.createElement("td");
    var inputOrig = document.createElement("input");
    inputOrig.type = "text";
    inputOrig.className = "dict-input orig-input";
    inputOrig.value = orig;
    inputOrig.placeholder = "예: Change Notes";
    inputOrig.spellcheck = false;
    tdOrig.appendChild(inputOrig);
    
    var tdTrans = document.createElement("td");
    var inputTrans = document.createElement("input");
    inputTrans.type = "text";
    inputTrans.className = "dict-input trans-input";
    inputTrans.value = trans;
    inputTrans.placeholder = "예: 변경 노트";
    inputTrans.spellcheck = false;
    tdTrans.appendChild(inputTrans);
    
    var tdDel = document.createElement("td");
    tdDel.style.textAlign = "center";
    var delBtn = document.createElement("button");
    delBtn.className = "dict-del-btn";
    delBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
    delBtn.addEventListener("click", () => tr.remove());
    tdDel.appendChild(delBtn);
    
    tr.appendChild(tdOrig);
    tr.appendChild(tdTrans);
    tr.appendChild(tdDel);
    dictTableBody.appendChild(tr);
  }

  if (addDictBtn) {
    addDictBtn.addEventListener("click", () => createDictRow());
  }
\n  function updateDictSummary(count) {
    if (dictSummaryCount) {
      dictSummaryCount.textContent = `등록된 단어: ${count}개`;
    }
  }

  function createModalRow(orig = "", trans = "") {
    var tr = document.createElement("tr");
    
    // index
    var tdIdx = document.createElement("td");
    tdIdx.style.textAlign = "center";
    tdIdx.style.color = "#64748b";
    tdIdx.style.fontSize = "12px";
    tdIdx.textContent = dictModalTableBody.children.length + 1;
    
    // orig
    var tdOrig = document.createElement("td");
    var inputOrig = document.createElement("input");
    inputOrig.type = "text";
    inputOrig.className = "excel-grid-input orig-input";
    inputOrig.value = orig;
    inputOrig.placeholder = "원문 입력...";
    inputOrig.spellcheck = false;
    tdOrig.appendChild(inputOrig);
    
    // trans
    var tdTrans = document.createElement("td");
    var inputTrans = document.createElement("input");
    inputTrans.type = "text";
    inputTrans.className = "excel-grid-input trans-input";
    inputTrans.value = trans;
    inputTrans.placeholder = "번역문 입력...";
    inputTrans.spellcheck = false;
    tdTrans.appendChild(inputTrans);

    // paste event on input
    inputOrig.addEventListener("paste", handlePaste);
    inputTrans.addEventListener("paste", handlePaste);
    
    // del
    var tdDel = document.createElement("td");
    tdDel.style.textAlign = "center";
    var delBtn = document.createElement("button");
    delBtn.className = "icon-btn";
    delBtn.style.width = "28px";
    delBtn.style.height = "28px";
    delBtn.style.margin = "0 auto";
    delBtn.style.border = "none";
    delBtn.style.color = "#ef4444";
    delBtn.innerHTML = "✕";
    delBtn.addEventListener("click", () => {
      tr.remove();
      reindexModalTable();
    });
    tdDel.appendChild(delBtn);
    
    tr.appendChild(tdIdx);
    tr.appendChild(tdOrig);
    tr.appendChild(tdTrans);
    tr.appendChild(tdDel);
    dictModalTableBody.appendChild(tr);

    reindexModalTable();
  }

  function reindexModalTable() {
    var rows = dictModalTableBody.querySelectorAll("tr");
    rows.forEach((tr, i) => {
      tr.children[0].textContent = i + 1;
    });
    if (modalRowCount) {
      modalRowCount.textContent = `총 ${rows.length}개 항목`;
    }
  }

  function renderModalRows(list) {
    dictModalTableBody.innerHTML = "";
    if (list && list.length > 0) {
      list.forEach(item => createModalRow(item.original, item.translated));
    } else {
      createModalRow("", "");
    }
  }

  // 엑셀 붙여넣기(Paste) 핸들러
  function handlePaste(e) {
    var clipboardData = e.clipboardData || window.clipboardData;
    if (!clipboardData) return;
    var pastedText = clipboardData.getData("text");
    if (!pastedText || (!pastedText.includes("\t") && !pastedText.includes("\n"))) return;

    e.preventDefault();
    var lines = pastedText.split(/\r?\n/);
    lines.forEach(line => {
      if (!line.trim()) return;
      var parts = line.split("\t");
      if (parts.length < 2) {
        parts = line.split(",");
      }
      var orig = (parts[0] || "").trim();
      var trans = (parts[1] || "").trim();
      if (orig || trans) {
        createModalRow(orig, trans);
      }
    });
  }

  if (openDictModalBtn) {
    openDictModalBtn.addEventListener("click", () => {
      renderModalRows(currentCustomDict);
      dictModal.style.display = "flex";
    });
  }

  function closeDictModal() {
    dictModal.style.display = "none";
  }

  if (closeDictModalBtn) closeDictModalBtn.addEventListener("click", closeDictModal);
  if (cancelDictModalBtn) cancelDictModalBtn.addEventListener("click", closeDictModal);

  if (addDictRowBtn) {
    addDictRowBtn.addEventListener("click", () => createModalRow());
  }

  if (clearDictBtn) {
    clearDictBtn.addEventListener("click", () => {
      if (confirm("사전 목록을 모두 삭제하시겠습니까?")) {
        dictModalTableBody.innerHTML = "";
        createModalRow();
      }
    });
  }

  // CSV/엑셀 가져오기 (Import)
  if (importCsvBtn && csvFileInput) {
    importCsvBtn.addEventListener("click", () => csvFileInput.click());
    csvFileInput.addEventListener("change", (e) => {
      var file = e.target.files[0];
      if (!file) return;

      var reader = new FileReader();
      reader.onload = (event) => {
        var text = event.target.result;
        parseAndAppendCsv(text);
        csvFileInput.value = "";
      };
      reader.readAsText(file, "UTF-8");
    });
  }

  function parseAndAppendCsv(text) {
    var cleanText = text.replace(/^\uFEFF/, ""); // BOM 제거
    var lines = cleanText.split(/\r?\n/);
    var addedCount = 0;

    lines.forEach(line => {
      if (!line.trim()) return;
      var parts = line.split("\t");
      if (parts.length < 2) {
        parts = line.split(",");
      }
      var orig = (parts[0] || "").replace(/^"|"$/g, "").trim();
      var trans = (parts[1] || "").replace(/^"|"$/g, "").trim();

      if (orig && trans && orig !== "Original" && orig !== "원문") {
        createModalRow(orig, trans);
        addedCount++;
      }
    });
    alert(`✓ ${addedCount}개의 사전 항목을 불러왔습니다.`);
  }

  // CSV 내보내기 (Export)
  if (exportCsvBtn) {
    exportCsvBtn.addEventListener("click", () => {
      var rows = dictModalTableBody.querySelectorAll("tr");
      var list = [];
      rows.forEach(tr => {
        var orig = tr.querySelector(".orig-input").value.trim();
        var trans = tr.querySelector(".trans-input").value.trim();
        if (orig && trans) {
          list.push({ original: orig, translated: trans });
        }
      });

      if (list.length === 0) {
        alert("내보낼 사전 항목이 없습니다.");
        return;
      }

      // UTF-8 BOM 추가 (Excel 깨짐 방지)
      var csvContent = "\uFEFF원문,번역문\n";
      list.forEach(item => {
        var safeOrig = `"${item.original.replace(/"/g, '""')}"`;
        var safeTrans = `"${item.translated.replace(/"/g, '""')}"`;
        csvContent += `${safeOrig},${safeTrans}\n`;
      });

      var blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      var url = URL.createObjectURL(blob);
      var link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `WebTranslator_CustomDict_${new Date().toISOString().slice(0,10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  }

  // 모달 저장 및 적용
  if (saveDictModalBtn) {
    saveDictModalBtn.addEventListener("click", () => {
      var rows = dictModalTableBody.querySelectorAll("tr");
      var list = [];
      rows.forEach(tr => {
        var orig = tr.querySelector(".orig-input").value.trim();
        var trans = tr.querySelector(".trans-input").value.trim();
        if (orig && trans) {
          list.push({ original: orig, translated: trans });
        }
      });

      currentCustomDict = list;
      updateDictSummary(currentCustomDict.length);

      chrome.storage.sync.set({ customDict: currentCustomDict }, () => {
        showSaveStatus("✓ 사용자 사전이 저장 및 적용되었습니다.", "success");
        closeDictModal();
      });
    });
  }

