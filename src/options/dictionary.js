import { showSaveStatus } from "./ui.js";

let currentCustomDict = [];

export function getCustomDict() {
  return currentCustomDict;
}

export function setCustomDict(dict) {
  currentCustomDict = dict || [];
  updateDictSummary(currentCustomDict.length);
}

function updateDictSummary(count) {
  const dictSummaryCount = document.getElementById("dictSummaryCount");
  if (dictSummaryCount) {
    dictSummaryCount.textContent = `등록된 단어: ${count}개`;
  }
}

export function initDictionaryModal(onSave) {
  const dictModalTableBody = document.getElementById("dictModalTableBody");
  const modalRowCount = document.getElementById("modalRowCount");
  const dictTableBody = document.getElementById("dictTableBody");

  // 메인 페이지의 빠른 추가 버튼용 로직
  const addDictBtn = document.getElementById("addDictBtn");
  if (addDictBtn) {
    addDictBtn.addEventListener("click", () => {
      const tr = document.createElement("tr");
      
      const tdOrig = document.createElement("td");
      const inputOrig = document.createElement("input");
      inputOrig.type = "text";
      inputOrig.className = "dict-input orig-input";
      inputOrig.placeholder = "예: Change Notes";
      inputOrig.spellcheck = false;
      tdOrig.appendChild(inputOrig);
      
      const tdTrans = document.createElement("td");
      const inputTrans = document.createElement("input");
      inputTrans.type = "text";
      inputTrans.className = "dict-input trans-input";
      inputTrans.placeholder = "예: 변경 노트";
      inputTrans.spellcheck = false;
      tdTrans.appendChild(inputTrans);
      
      const tdDel = document.createElement("td");
      tdDel.style.textAlign = "center";
      const delBtn = document.createElement("button");
      delBtn.className = "dict-del-btn";
      delBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
      delBtn.addEventListener("click", () => tr.remove());
      tdDel.appendChild(delBtn);
      
      tr.appendChild(tdOrig);
      tr.appendChild(tdTrans);
      tr.appendChild(tdDel);
      if (dictTableBody) dictTableBody.appendChild(tr);
    });
  }

  function createModalRow(orig = "", trans = "") {
    const tr = document.createElement("tr");
    
    // index
    const tdIdx = document.createElement("td");
    tdIdx.style.textAlign = "center";
    tdIdx.style.color = "#64748b";
    tdIdx.style.fontSize = "12px";
    tdIdx.textContent = dictModalTableBody.children.length + 1;
    
    // orig
    const tdOrig = document.createElement("td");
    const inputOrig = document.createElement("input");
    inputOrig.type = "text";
    inputOrig.className = "excel-grid-input orig-input";
    inputOrig.value = orig;
    inputOrig.placeholder = "원문 입력...";
    inputOrig.spellcheck = false;
    tdOrig.appendChild(inputOrig);
    
    // trans
    const tdTrans = document.createElement("td");
    const inputTrans = document.createElement("input");
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
    const tdDel = document.createElement("td");
    tdDel.style.textAlign = "center";
    const delBtn = document.createElement("button");
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
    const rows = dictModalTableBody.querySelectorAll("tr");
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

  function handlePaste(e) {
    const clipboardData = e.clipboardData || window.clipboardData;
    if (!clipboardData) return;
    const pastedText = clipboardData.getData("text");
    if (!pastedText || (!pastedText.includes("\t") && !pastedText.includes("\n"))) return;

    e.preventDefault();
    const lines = pastedText.split(/\r?\n/);
    lines.forEach(line => {
      if (!line.trim()) return;
      let parts = line.split("\t");
      if (parts.length < 2) {
        parts = line.split(",");
      }
      const orig = (parts[0] || "").trim();
      const trans = (parts[1] || "").trim();
      if (orig || trans) {
        createModalRow(orig, trans);
      }
    });
  }

  const openDictModalBtn = document.getElementById("openDictModalBtn");
  const closeDictModalBtn = document.getElementById("closeDictModalBtn");
  const cancelDictModalBtn = document.getElementById("cancelDictModalBtn");
  const saveDictModalBtn = document.getElementById("saveDictModalBtn");
  const dictModal = document.getElementById("dictModal");
  const addDictRowBtn = document.getElementById("addDictRowBtn");
  const clearDictBtn = document.getElementById("clearDictBtn");
  const importCsvBtn = document.getElementById("importCsvBtn");
  const exportCsvBtn = document.getElementById("exportCsvBtn");
  const csvFileInput = document.getElementById("csvFileInput");

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

  if (importCsvBtn && csvFileInput) {
    importCsvBtn.addEventListener("click", () => csvFileInput.click());
    csvFileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target.result;
        parseAndAppendCsv(text);
        csvFileInput.value = "";
      };
      reader.readAsText(file, "UTF-8");
    });
  }

  function parseAndAppendCsv(text) {
    const cleanText = text.replace(/^\uFEFF/, ""); 
    const lines = cleanText.split(/\r?\n/);
    let addedCount = 0;

    lines.forEach(line => {
      if (!line.trim()) return;
      let parts = line.split("\t");
      if (parts.length < 2) {
        parts = line.split(",");
      }
      const orig = (parts[0] || "").replace(/^"|"$/g, "").trim();
      const trans = (parts[1] || "").replace(/^"|"$/g, "").trim();

      if (orig && trans && orig !== "Original" && orig !== "원문") {
        createModalRow(orig, trans);
        addedCount++;
      }
    });
    alert(`✓ ${addedCount}개의 사전 항목을 불러왔습니다.`);
  }

  if (exportCsvBtn) {
    exportCsvBtn.addEventListener("click", () => {
      const rows = dictModalTableBody.querySelectorAll("tr");
      const list = [];
      rows.forEach(tr => {
        const orig = tr.querySelector(".orig-input").value.trim();
        const trans = tr.querySelector(".trans-input").value.trim();
        if (orig && trans) {
          list.push({ original: orig, translated: trans });
        }
      });

      if (list.length === 0) {
        alert("내보낼 사전 항목이 없습니다.");
        return;
      }

      let csvContent = "\uFEFF원문,번역문\n";
      list.forEach(item => {
        const safeOrig = `"${item.original.replace(/"/g, '""')}"`;
        const safeTrans = `"${item.translated.replace(/"/g, '""')}"`;
        csvContent += `${safeOrig},${safeTrans}\n`;
      });

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `WebTranslator_CustomDict_${new Date().toISOString().slice(0,10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  }

  if (saveDictModalBtn) {
    saveDictModalBtn.addEventListener("click", () => {
      const rows = dictModalTableBody.querySelectorAll("tr");
      const list = [];
      rows.forEach(tr => {
        const orig = tr.querySelector(".orig-input").value.trim();
        const trans = tr.querySelector(".trans-input").value.trim();
        if (orig && trans) {
          list.push({ original: orig, translated: trans });
        }
      });

      setCustomDict(list);

      // Invoke the callback passed by main script to save the changes
      if (onSave) {
        onSave(currentCustomDict).then(() => {
          showSaveStatus("✓ 사용자 사전이 저장 및 적용되었습니다.", "success");
          closeDictModal();
        });
      }
    });
  }
}
