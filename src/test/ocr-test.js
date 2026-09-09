/* src/test/ocr-test.js — PP-OCR 테스트 페이지 로직 */
/* global ort */

let detSession = null, recSession = null, currentRecLang = null, charDict = null;
let loadedImage = null, ortInitialized = false;
let currentDetVersion = null; // "v4" or "v6"

const REC_MODELS = {
  v6: { det: "PP-OCRv6_small_det.onnx", model: "PP-OCRv6_small_rec.onnx", dict: "ppocrv6_dict.txt" },
  ko: { det: "ch_PP-OCRv4_det_infer.onnx", model: "korean_PP-OCRv3_rec_infer.onnx", dict: "korean_dict.txt" },
  ja: { det: "ch_PP-OCRv4_det_infer.onnx", model: "japan_PP-OCRv3_rec_infer.onnx", dict: "japan_dict.txt" },
  zh: { det: "ch_PP-OCRv4_det_infer.onnx", model: "ch_PP-OCRv4_rec_infer.onnx", dict: "ppocr_keys_v1.txt" },
  en: { det: "ch_PP-OCRv4_det_infer.onnx", model: "en_PP-OCRv3_rec_infer.onnx", dict: "en_dict.txt" },
};

const $ = (id) => document.getElementById(id);
const log = (msg) => { $("log").textContent += msg + "\n"; $("log").scrollTop = $("log").scrollHeight; };
const setStatus = (s) => { $("status").textContent = s; };
const modelBase = () => location.href.replace(/\/[^/]*$/, "/../models/");

// ── ORT 초기화 ──
function initOrt() {
  if (ortInitialized) return;
  ort.env.wasm.wasmPaths = modelBase();
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.simd = true;
  ortInitialized = true;
  log("[ORT] wasmPaths=" + modelBase());
}

async function loadModel(type, url) {
  var t0 = performance.now();
  var res = await fetch(url);
  if (!res.ok) throw new Error("HTTP " + res.status + ": " + url);
  var buf = await res.arrayBuffer();
  var session = await ort.InferenceSession.create(buf, { executionProviders: ["wasm"] });
  log("[" + type + "] 로드: " + (buf.byteLength / 1024 / 1024).toFixed(1) + "MB, " + Math.round(performance.now() - t0) + "ms");
  return session;
}

async function ensureDet(lang) {
  var cfg = REC_MODELS[lang] || REC_MODELS.v6;
  var detFile = cfg.det;
  var detVer = lang === "v6" ? "v6" : "v4";
  if (detSession && currentDetVersion === detVer) return;
  if (detSession) { detSession.release(); detSession = null; }
  initOrt();
  setStatus("Det 모델 로딩 (" + detVer + ")...");
  detSession = await loadModel("Det", modelBase() + detFile);
  currentDetVersion = detVer;
}

async function ensureRec(lang) {
  if (recSession && currentRecLang === lang) return;
  if (recSession) { recSession.release(); recSession = null; charDict = null; }
  initOrt();
  var cfg = REC_MODELS[lang] || REC_MODELS.v6;
  setStatus("Rec 모델 로딩 (" + lang + ")...");
  recSession = await loadModel("Rec", modelBase() + cfg.model);
  var dictRes = await fetch(modelBase() + cfg.dict);
  var dictText = await dictRes.text();
  // 공백 문자도 유효 사전 항목이므로 trim/filter 금지 — trailing empty line만 제거
  charDict = dictText.split("\n").map(function (l) { return l.replace(/\r$/, ""); });
  while (charDict.length > 0 && charDict[charDict.length - 1] === "") charDict.pop();
  currentRecLang = lang;
  log("[Rec] 사전: " + charDict.length + "자");
}

// ── 전처리 ──
function preprocessDet(img, maxSide) {
  maxSide = maxSide || 960;
  var oW = img.width, oH = img.height;
  var s = 1;
  if (Math.max(oW, oH) > maxSide) s = maxSide / Math.max(oW, oH);
  var nW = Math.ceil(Math.round(oW * s) / 32) * 32;
  var nH = Math.ceil(Math.round(oH * s) / 32) * 32;
  var c = new OffscreenCanvas(nW, nH);
  c.getContext("2d").drawImage(img, 0, 0, nW, nH);
  var d = c.getContext("2d").getImageData(0, 0, nW, nH);
  var mean = [0.485, 0.456, 0.406], std = [0.229, 0.224, 0.225], chw = nW * nH;
  var t = new Float32Array(3 * chw);
  for (var i = 0; i < chw; i++) {
    t[i] = (d.data[i * 4] / 255 - mean[0]) / std[0];
    t[chw + i] = (d.data[i * 4 + 1] / 255 - mean[1]) / std[1];
    t[2 * chw + i] = (d.data[i * 4 + 2] / 255 - mean[2]) / std[2];
  }
  return { tensor: t, width: nW, height: nH, origW: oW, origH: oH };
}

function preprocessRec(img, box, recH) {
  recH = recH || 48;
  var cc = new OffscreenCanvas(box.width, box.height);
  cc.getContext("2d").drawImage(img, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height);
  var src = cc, sW = box.width, sH = box.height;
  var isV = box.height > box.width * 1.5;
  if (isV) {
    var rc = new OffscreenCanvas(box.height, box.width);
    var rx = rc.getContext("2d");
    rx.translate(0, box.width);
    rx.rotate(-Math.PI / 2);
    rx.drawImage(cc, 0, 0);
    src = rc; sW = box.height; sH = box.width;
  }
  var ratio = recH / sH, rW = Math.max(1, Math.round(sW * ratio));
  var rc2 = new OffscreenCanvas(rW, recH);
  rc2.getContext("2d").drawImage(src, 0, 0, rW, recH);
  var d = rc2.getContext("2d").getImageData(0, 0, rW, recH);
  var chw = rW * recH, t = new Float32Array(3 * chw);
  for (var i = 0; i < chw; i++) {
    t[i] = (d.data[i * 4] / 255 - 0.5) / 0.5;
    t[chw + i] = (d.data[i * 4 + 1] / 255 - 0.5) / 0.5;
    t[2 * chw + i] = (d.data[i * 4 + 2] / 255 - 0.5) / 0.5;
  }
  return { tensor: t, width: rW, height: recH, isVertical: isV };
}

// ── DBNet 후처리 ──
function dbnetPost(probMap, mW, mH, oW, oH, thresh, boxThresh, unclipRatio) {
  var bm = new Uint8Array(mW * mH);
  var maxP = 0, sumP = 0, abv = 0;
  for (var i = 0; i < mW * mH; i++) {
    var v = probMap[i];
    if (v > maxP) maxP = v;
    sumP += v;
    if (v > thresh) { bm[i] = 1; abv++; }
  }
  log("[ProbMap] " + mW + "×" + mH + " max=" + maxP.toFixed(3) + " avg=" + (sumP / (mW * mH)).toFixed(4) + " >" + thresh + ": " + abv + "px (" + (abv / (mW * mH) * 100).toFixed(1) + "%)");

  var comps = findCC(bm, mW, mH);
  log("[CC] " + comps.length + "개 컴포넌트");
  var boxes = [], sx = oW / mW, sy = oH / mH;

  for (var ci = 0; ci < comps.length; ci++) {
    var px = comps[ci];
    if (px.length < 9) continue;
    var x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (var pi = 0; pi < px.length; pi++) {
      if (px[pi][0] < x1) x1 = px[pi][0];
      if (px[pi][1] < y1) y1 = px[pi][1];
      if (px[pi][0] > x2) x2 = px[pi][0];
      if (px[pi][1] > y2) y2 = px[pi][1];
    }
    var bw = x2 - x1 + 1, bh = y2 - y1 + 1;
    if (bw < 3 || bh < 3) continue;
    var s = 0;
    for (var pi2 = 0; pi2 < px.length; pi2++) s += probMap[px[pi2][1] * mW + px[pi2][0]];
    var sc = s / px.length;
    if (sc < boxThresh) continue;
    var dd = bw * bh * unclipRatio / (2 * (bw + bh));
    var fx = Math.max(0, Math.round((x1 - dd) * sx));
    var fy = Math.max(0, Math.round((y1 - dd) * sy));
    var fx2 = Math.min(oW, Math.round((x2 + dd + 1) * sx));
    var fy2 = Math.min(oH, Math.round((y2 + dd + 1) * sy));
    if (fx2 - fx < 3 || fy2 - fy < 3) continue;
    boxes.push({ x: fx, y: fy, width: fx2 - fx, height: fy2 - fy, score: sc });
  }

  var merged = nms(boxes, 0.3);
  log("[NMS] " + boxes.length + " → " + merged.length + "개");
  merged.sort(function (a, b) { return a.y - b.y || a.x - b.x; });
  return merged;
}

function findCC(bm, w, h) {
  var lb = new Int32Array(w * h), id = 0, cs = [];
  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      var idx = y * w + x;
      if (!bm[idx] || lb[idx]) continue;
      id++;
      var st = [[x, y]], px = [];
      lb[idx] = id;
      while (st.length) {
        var cur = st.pop(), cx = cur[0], cy = cur[1];
        px.push([cx, cy]);
        for (var dy = -1; dy <= 1; dy++) {
          for (var dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            var nx = cx + dx, ny = cy + dy;
            if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
            var ni = ny * w + nx;
            if (bm[ni] && !lb[ni]) { lb[ni] = id; st.push([nx, ny]); }
          }
        }
      }
      if (px.length >= 9) cs.push(px);
    }
  }
  return cs;
}

function nms(boxes, t) {
  if (boxes.length <= 1) return boxes;
  var s = boxes.slice().sort(function (a, b) { return b.score - a.score; });
  var u = new Array(s.length).fill(false), r = [];
  for (var i = 0; i < s.length; i++) {
    if (u[i]) continue;
    var m = Object.assign({}, s[i]);
    u[i] = true;
    for (var j = i + 1; j < s.length; j++) {
      if (u[j]) continue;
      var ix1 = Math.max(m.x, s[j].x), iy1 = Math.max(m.y, s[j].y);
      var ix2 = Math.min(m.x + m.width, s[j].x + s[j].width);
      var iy2 = Math.min(m.y + m.height, s[j].y + s[j].height);
      if (ix2 > ix1 && iy2 > iy1) {
        var inter = (ix2 - ix1) * (iy2 - iy1);
        var iou = inter / (m.width * m.height + s[j].width * s[j].height - inter);
        if (iou > t) {
          var nx1 = Math.min(m.x, s[j].x), ny1 = Math.min(m.y, s[j].y);
          var nx2 = Math.max(m.x + m.width, s[j].x + s[j].width);
          var ny2 = Math.max(m.y + m.height, s[j].y + s[j].height);
          m = { x: nx1, y: ny1, width: nx2 - nx1, height: ny2 - ny1, score: Math.max(m.score, s[j].score) };
          u[j] = true;
        }
      }
    }
    r.push(m);
  }
  return r;
}

// ── CTC Decoder ──
function ctcDecode(logits, T, C) {
  var last = 0, txt = "", ts = 0, cnt = 0;
  for (var t = 0; t < T; t++) {
    var mi = 0, mv = -Infinity, o = t * C;
    for (var c = 0; c < C; c++) { if (logits[o + c] > mv) { mv = logits[o + c]; mi = c; } }
    if (mi > 0 && mi !== last) {
      var ch = charDict[mi - 1];
      if (ch !== undefined) { txt += ch; ts += mv; cnt++; }
    }
    last = mi;
  }
  return { text: txt, confidence: cnt > 0 ? ts / cnt : 0 };
}

// ── 메인 OCR ──
async function runOcr() {
  if (!loadedImage) return;
  var lang = $("lang-select").value;
  var thresh = parseFloat($("det-thresh").value);
  var boxThresh = parseFloat($("box-thresh").value);
  var unclipRatio = parseFloat($("unclip-ratio").value);

  $("run-btn").disabled = true;
  $("log").textContent = "";
  setStatus("OCR 실행 중...");
  var t0 = performance.now();

  try {
    await ensureDet(lang);
    await ensureRec(lang);
    log("[모델] 로드 완료: " + Math.round(performance.now() - t0) + "ms");

    var img = loadedImage;
    log("[이미지] " + img.width + "×" + img.height);

    var det = preprocessDet(img);
    log("[Det 전처리] " + det.width + "×" + det.height + " (원본 " + det.origW + "×" + det.origH + ")");
    var dIn = new ort.Tensor("float32", det.tensor, [1, 3, det.height, det.width]);
    var dR = await detSession.run(Object.fromEntries([[detSession.inputNames[0], dIn]]));
    var pm = dR[detSession.outputNames[0]].data;
    log("[Det 추론] " + Math.round(performance.now() - t0) + "ms");

    var boxes = dbnetPost(pm, det.width, det.height, det.origW, det.origH, thresh, boxThresh, unclipRatio);

    var results = [];
    for (var i = 0; i < boxes.length; i++) {
      var box = boxes[i];
      var rec = preprocessRec(img, box);
      var rIn = new ort.Tensor("float32", rec.tensor, [1, 3, rec.height, rec.width]);
      var rR = await recSession.run(Object.fromEntries([[recSession.inputNames[0], rIn]]));
      var lo = rR[recSession.outputNames[0]];
      var decoded = ctcDecode(lo.data, lo.dims[1], lo.dims[2]);
      results.push({ x: box.x, y: box.y, width: box.width, height: box.height, score: box.score, text: decoded.text, conf: decoded.confidence, isVertical: rec.isVertical });
      log("[Rec#" + i + "] " + box.x + "," + box.y + " " + box.width + "×" + box.height + (rec.isVertical ? " [V→H]" : "") + " → \"" + decoded.text + "\" (" + decoded.confidence.toFixed(2) + ")");
    }

    var elapsed = Math.round(performance.now() - t0);
    setStatus("✅ 완료 — " + results.length + "개 블록, " + elapsed + "ms");
    drawResults(img, results);
  } catch (e) {
    setStatus("❌ 오류: " + e.message);
    log("[ERROR] " + e.stack);
  }
  $("run-btn").disabled = false;
}

// ── 시각화 ──
function drawResults(img, results) {
  var cv = $("canvas");
  var scale = Math.min(1, 800 / Math.max(img.width, img.height));
  cv.width = Math.round(img.width * scale);
  cv.height = Math.round(img.height * scale);
  var ctx = cv.getContext("2d");
  ctx.drawImage(img, 0, 0, cv.width, cv.height);
  var colors = ["#ff6b6b", "#ffd93d", "#6bff6b", "#6bcaff", "#d96bff", "#ff6bc8", "#6bffd9", "#ffb86b", "#6b8cff"];

  for (var i = 0; i < results.length; i++) {
    var r = results[i], color = colors[i % colors.length];
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(r.x * scale, r.y * scale, r.width * scale, r.height * scale);
    ctx.fillStyle = color + "44";
    ctx.fillRect(r.x * scale, r.y * scale, r.width * scale, r.height * scale);
    ctx.font = "bold 12px monospace";
    var label = "#" + i;
    var tw = ctx.measureText(label).width;
    ctx.fillStyle = "#000c";
    ctx.fillRect(r.x * scale, r.y * scale - 16, tw + 6, 16);
    ctx.fillStyle = color;
    ctx.fillText(label, r.x * scale + 3, r.y * scale - 4);
  }

  var panel = $("text-panel");
  panel.style.display = "block";
  var html = "";
  for (var i2 = 0; i2 < results.length; i2++) {
    var r2 = results[i2], c2 = colors[i2 % colors.length];
    var confClass = r2.conf >= 0.5 ? "conf-high" : r2.conf >= 0.3 ? "conf-mid" : "conf-low";
    html += '<div class="block-row">' +
      '<span class="block-idx" style="color:' + c2 + '">#' + i2 + '</span>' +
      '<span class="block-text">' + (r2.text || "(빈 텍스트)") + '</span>' +
      '<span class="block-conf ' + confClass + '">' + (r2.conf * 100).toFixed(0) + '%</span>' +
      '<span class="block-meta">' + r2.x + ',' + r2.y + ' ' + r2.width + '×' + r2.height + (r2.isVertical ? " ↕" : "") + '</span>' +
      '</div>';
  }
  panel.innerHTML = html;
}

// ── 이벤트 ──
async function handleFile(file) {
  if (!file || !file.type.startsWith("image/")) return;
  var url = URL.createObjectURL(file);
  var res = await fetch(url);
  var blob = await res.blob();
  loadedImage = await createImageBitmap(blob);
  URL.revokeObjectURL(url);

  var cv = $("canvas");
  var scale = Math.min(1, 800 / Math.max(loadedImage.width, loadedImage.height));
  cv.width = Math.round(loadedImage.width * scale);
  cv.height = Math.round(loadedImage.height * scale);
  cv.getContext("2d").drawImage(loadedImage, 0, 0, cv.width, cv.height);

  $("text-panel").style.display = "none";
  setStatus("이미지 로드: " + loadedImage.width + "×" + loadedImage.height + " — ▶ 버튼을 클릭하세요");
  $("run-btn").disabled = false;
  $("drop-zone").querySelector("p").textContent = "✅ " + file.name + " (" + loadedImage.width + "×" + loadedImage.height + ")";
}

var dz = $("drop-zone");
var fi = $("file-input");

dz.addEventListener("click", function () { fi.click(); });
dz.addEventListener("dragover", function (e) { e.preventDefault(); dz.classList.add("dragover"); });
dz.addEventListener("dragleave", function () { dz.classList.remove("dragover"); });
dz.addEventListener("drop", function (e) { e.preventDefault(); dz.classList.remove("dragover"); handleFile(e.dataTransfer.files[0]); });
fi.addEventListener("change", function (e) { if (e.target.files[0]) handleFile(e.target.files[0]); });
$("run-btn").addEventListener("click", runOcr);
