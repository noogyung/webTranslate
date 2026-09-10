import { getSettings } from '../options/storage.js';
import { inspectReport } from './checks.js';
const $ = id => document.getElementById(id);
let report, busy=false;
function controls() {
  $('generate').disabled=busy || !report || !$('reviewed').checked;
  $('replay').disabled=busy || !report?.translatedSpriteUrl;
  $('export').disabled=busy || !report;
  for (const id of ['prepare','source','import','clear','reviewed']) $(id).disabled=busy;
}
async function task(fn) {
  if(busy)return;busy=true;controls();
  try { await fn(); } catch(e) { $('status').textContent='실패: '+e.message; }
  finally { busy=false;controls(); }
}
async function send(message) {
  const res=await chrome.runtime.sendMessage(message);
  if(!res?.success)throw new Error(res?.error || '응답 없음');
  return res.report;
}
const loadImage = src => new Promise((resolve,reject)=>{
  if(!/^data:image\//.test(src)) { reject(new Error('진단 이미지 형식 오류'));return; }
  const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('이미지 로딩 실패'));img.src=src;
});
const dataURL = file => new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});
function canvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
function group(title){const section=document.createElement('section');const h=document.createElement('h2');h.textContent=title;section.append(h);const grid=document.createElement('div');grid.className='grid';section.append(grid);$('results').append(section);return grid;}
function figure(parent,title,visual){const f=document.createElement('figure');const label=document.createElement('figcaption');label.textContent=title;f.append(label,visual);parent.append(f);}
function annotated(img,boxes,color){const c=canvas(img.width,img.height),ctx=c.getContext('2d');ctx.drawImage(img,0,0);ctx.lineWidth=2;ctx.font='bold 18px sans-serif';boxes.forEach((b,i)=>{if(!b)return;ctx.strokeStyle=color;ctx.strokeRect(b.x,b.y,b.width,b.height);ctx.fillStyle='#111';ctx.fillRect(b.x,b.y,38,24);ctx.fillStyle=color;ctx.fillText('#'+(i+1),b.x+2,b.y+19);});return c;}
function crop(img,b){const c=canvas(Math.max(1,Math.round(b.width)),Math.max(1,Math.round(b.height)));c.getContext('2d').drawImage(img,b.x,b.y,b.width,b.height,0,0,c.width,c.height);return c;}
async function render(){
  $('results').replaceChildren();$('warnings').replaceChildren();
  const r=report;
  $('metadata').textContent=JSON.stringify({id:r.id,createdAt:r.createdAt,ocrEngine:r.ocrEngine,ocrModel:r.ocrModel,synthEngine:r.synthEngine,synthModel:r.synthModel,input:[r.inputWidth,r.inputHeight],original:[r.naturalWidth,r.naturalHeight],sprite:r.sprite.apiSize,blocks:r.translationPairs.length,timings:r.timings},null,2);
  for(const warning of inspectReport(r)){const li=document.createElement('li');li.textContent=warning;$('warnings').append(li);}
  const original=await loadImage(r.originalDataUrl),sprite=await loadImage(r.sprite.dataUrl);
  const a=group('① OCR 좌표와 실제 크롭 범위');
  const rawBoxes=(r.diagnosticOcr?.rawBlocks || []).map(b=>{
    if(r.ocrEngine==='free')return b.bbox;
    if(!Array.isArray(b.eraseBox)||b.eraseBox.length!==4)return null;
    const [v0,v1,v2,v3]=b.eraseBox;
    const [x1,y1,x2,y2]=r.ocrEngine==='gemini'?[v1,v0,v3,v2]:[v0,v1,v2,v3];
    return {x:x1*original.width/1000,y:y1*original.height/1000,width:(x2-x1)*original.width/1000,height:(y2-y1)*original.height/1000};
  });
  figure(a,'OCR 원시 좌표 — Vision은 0~1000 계약으로 표시, 패딩 없음',annotated(original,rawBoxes,'#ff92e7'));
  figure(a,'OCR 입력 위 전달 bbox (노랑)',annotated(original,r.translationPairs.map(p=>p.bbox),'#ffe24a'));
  figure(a,'여백이 포함된 실제 크롭 (청록)',annotated(original,r.sprite.cropBboxes,'#00e7cf'));
  const d=document.createElement('details'),summary=document.createElement('summary'),pre=document.createElement('pre');summary.textContent='OCR 원시 좌표·원문·번역·전달 좌표';pre.textContent=JSON.stringify({ocr:r.diagnosticOcr,pairs:r.translationPairs},null,2);d.append(summary,pre);$('results').append(d);
  const b=group('② GPT 입력 크롭·스프라이트');
  figure(b,'전송 스프라이트 원본 (표시용 번호는 전송하지 않음)',sprite);
  const regions=r.sprite.layout.regions.map(x=>({x:0,y:x.y,width:x.width,height:x.height}));
  figure(b,'스프라이트 분할 경계',annotated(sprite,regions,'#00e7cf'));
  r.sprite.cropBboxes.forEach((box,i)=>figure(b,`#${i+1} ${r.translationPairs[i]?.original} → ${r.translationPairs[i]?.translated}`,crop(original,box)));
  const c=group('③ GPT 없는 왕복 — 위치·잘림 비교 (축소/JPEG 손실은 발생 가능)');
  figure(c,'OCR 입력',await loadImage(r.originalDataUrl));figure(c,'기존 분할·합성 함수로 복원',await loadImage(r.roundtripDataUrl));
  if(r.translatedSpriteUrl){
    const output=await loadImage(r.translatedSpriteUrl),sx=output.width/sprite.width,sy=output.height/sprite.height;
    if(sx!==1||sy!==1){const li=document.createElement('li');li.textContent=`GPT 반환 크기가 입력과 다릅니다: ${sprite.width}×${sprite.height} → ${output.width}×${output.height}`;$('warnings').append(li);}
    const out=group(`④ GPT 반환 스프라이트 — ${output.width}×${output.height}, 배율 ${sx.toFixed(3)} / ${sy.toFixed(3)}`);
    figure(out,'입력',await loadImage(r.sprite.dataUrl));figure(out,'반환본',output);
    const cuts=regions.map(x=>({x:0,y:Math.round(x.y*sy),width:Math.round(x.width*sx),height:Math.round(x.height*sy)}));
    figure(out,'실제 분할 경계',annotated(output,cuts,'#ffcc00'));
    cuts.forEach((box,i)=>figure(out,`반환 크롭 #${i+1}`,crop(output,box)));
    if(r.finalDataUrl)figure(group('⑤ 최종 합성'), '결과',await loadImage(r.finalDataUrl));
  }
}
$('reviewed').onchange=controls;
$('prepare').onclick=()=>task(async()=>{
  const file=$('source').files[0];if(!file)throw new Error('원본 이미지를 선택하세요.');
  $('status').textContent='OCR 및 GPT 없는 왕복 검사 중…';
  const source=await dataURL(file),img=await loadImage(source),scale=Math.min(1,1024/Math.max(img.width,img.height));
  const w=Math.round(img.width*scale),h=Math.round(img.height*scale);let input=source;
  if(scale<1){const c=canvas(w,h);c.getContext('2d').drawImage(img,0,0,w,h);input=c.toDataURL('image/jpeg',.92);}
  const s=await getSettings();
  if(!['free','gemini','openai'].includes(s.imageStdEngine) || !['gemini','openai'].includes(s.imagePremEngine))throw new Error('이번 진단은 PP-OCR/Gemini/GPT OCR과 Gemini/GPT 합성을 지원합니다.');
  report=await send({action:'prepareImageDiagnostic',imageUrl:input,naturalWidth:img.width,naturalHeight:img.height,compressedWidth:w,compressedHeight:h,targetLang:s.targetLang,imageStdEngine:s.imageStdEngine,imagePremSynthEngine:s.imagePremEngine,imageStdGeminiModel:s.imageStdGeminiModel,imageStdOpenAIModel:s.imageStdOpenAIModel,imagePremGeminiSynthModel:s.imagePremGeminiSynthModel,imagePremOpenAISynthModel:s.imagePremOpenAISynthModel,apiKey:s.geminiApiKey,openaiApiKey:s.openaiApiKey});
  $('reviewed').checked=false;await render();$('status').textContent='왕복 검사 완료. ①~③을 확인한 후 필요할 때 AI 합성을 실행하세요.';
});
async function replay(generate){
  $('status').textContent=generate?'고정된 스프라이트로 AI 합성 중…':'저장된 반환본 분할 중…';
  const result=await send({action:'replayImageDiagnostic',report,generate});
  report={...report,...result,timings:{...report.timings,...(generate?{generation:result.generationMs}:{})}};
  await render();$('status').textContent=result.compositeError?'반환 스프라이트 확보, 분할 실패: '+result.compositeError:'완료. 진단 묶음을 저장할 수 있습니다.';
}
$('generate').onclick=()=>task(()=>replay(true));$('replay').onclick=()=>task(()=>replay(false));
$('export').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(report)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`wt-diagnostic-${report.id}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('import').onchange=()=>task(async()=>{const file=$('import').files[0];if(!file)return;const r=JSON.parse(await file.text());if(r.version!==1||!r.sprite?.layout||!Array.isArray(r.translationPairs))throw new Error('진단 파일 형식 오류');report=r;$('reviewed').checked=false;await render();$('status').textContent='저장된 진단을 열었습니다. API는 호출하지 않았습니다.';});
$('clear').onclick=()=>{report=null;$('results').replaceChildren();$('warnings').replaceChildren();$('metadata').textContent='';$('source').value='';$('import').value='';$('reviewed').checked=false;$('status').textContent='자료를 지웠습니다.';controls();};
controls();
