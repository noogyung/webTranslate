import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {inspectReport} from '../src/diagnostics/checks.js';
import { cleanOcrTextForTranslation } from '../src/utils/cleaner.js';

const bbox = { x: 20, y: 30, width: 60, height: 80 };
const message = {
  imageUrl: 'data:image/png;base64,AA==', targetLang: 'ko',
  naturalWidth: 1000, naturalHeight: 1600,
  compressedWidth: 500, compressedHeight: 800,
  imagePremEngine: 'openai', imageStdGeminiModel: 'selected-gemini',
  imageStdOpenAIModel: 'selected-openai', imagePremOpenAIOcrModel: 'obsolete-model',
  imageStdOtherUrl: 'http://localhost:8000', imageStdOtherKey: 'test-key',
  imageStdOtherModel: 'selected-other',
};

async function harness({ blocks = [{ text: '日本語', bbox }], visionError, translateError, failCreate = false } = {}) {
  const calls = [];
  let ready = false;
  let creations = 0;
  const context = vm.createContext({ crypto:webcrypto, console: { log() {}, warn() {} }, chrome: {
    runtime: {
      getURL: path => path,
      getContexts: async () => ready ? [{}] : [],
      sendMessage: async args => {
        calls.push(args);
        assert.ok(ready, 'Offscreen must exist before image processing');
        if (args.action === 'runFreeOcr') return { success: true, blocks };
        if (args.action === 'cropAndBuildSprite') {
          assert.ok(args.boxes.every(b => b?.width > 0 && b?.height > 0));
          return { success: true, dataUrl: 'sprite', layout: { spriteWidth: 1024, spriteHeight: 1024 }, cropBboxes: args.boxes };
        }
        if (args.action === 'splitAndComposite') return { success: true, dataUrl: 'composited' };
        throw new Error(`Unexpected action ${args.action}`);
      },
    },
    offscreen: { createDocument: async () => {
      creations++;
      if (failCreate && creations === 1) throw new Error('creation failed');
      ready = true;
    } },
  } });
  const synth = async args => { calls.push({ action: 'synth', ...args }); return 'translated-sprite'; };
  const mocks = {
    '../api/image/vision.js': {
      translateImageWithVision: async args => {
        calls.push({ action: 'vision', ...args });
        args.onDiagnostic?.({rawBlocks:[{eraseBox:[1,2,3,4]}],mode:args.mode});
        if (visionError) throw new Error(visionError);
        return [{ originalText: '日本語', translatedText: '일본어', eraseBox: bbox }];
      },
      locateBoundingBoxesWithVision: async () => [],
    },
    '../api/image/imageTranslate.js': {
      translatePremiumGemini: synth, translatePremiumOpenAI: synth,
      translateCropGemini: synth, translateCropOpenAI: synth,
      translateSpriteGemini: synth, translateSpriteOpenAI: synth,
      incrementImageCount: async mode => calls.push({ action: 'count', mode }),
    },
    '../api/image/customOcrServer.js': { runCustomOcrServer: async args => {
      calls.push({ action: 'customOcr', ...args }); return blocks;
    } },
    './translationService.js': { translateTextArray: async (texts, settings) => {
      calls.push({ action: 'translate', texts, settings });
      if (translateError) throw new Error(translateError);
      return texts.map(text => `번역:${text}`);
    } },
    '../utils/cleaner.js': { cleanOcrTextForTranslation },
    '../options/storage.js': { getSettings: async () => ({ targetLang: 'en',openaiApiKey:'secret-key',geminiApiKey:'secret-key' }) },
  };
  const source = await readFile(new URL('../src/background/imageService.js', import.meta.url), 'utf8');
  const mod = new vm.SourceTextModule(source, { context });
  await mod.link(specifier => {
    const values = mocks[specifier];
    assert.ok(values, `Unexpected dependency ${specifier}`);
    return new vm.SyntheticModule(Object.keys(values), function () {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value);
    }, { context });
  });
  await mod.evaluate();
  return { service: mod.namespace, calls, creations: () => creations };
}


for(const engine of ['free','gemini','openai'])test(engine+' diagnostic preparation never calls synthesis',async()=>{
 const {service,calls}=await harness();
 const r=await service.handlePremiumTranslation({...message,imageStdEngine:engine,apiKey:'secret-key',diagnostic:true});
 assert.equal(r.version,1);assert.ok(r.diagnosticOcr.rawBlocks.length);assert.equal(r.roundtripDataUrl,'composited');
 assert.equal(calls.filter(c=>c.action==='synth').length,0);assert.equal(calls.filter(c=>c.action==='count').length,0);
 assert.equal(calls.filter(c=>c.action==='splitAndComposite').length,1);
 assert.ok(!JSON.stringify(r).includes('secret-key'));
});
test('saved input generates without repeating OCR or packing; replay is local',async()=>{
 const {service,calls}=await harness();
 const r=await service.handlePremiumTranslation({...message,imageStdEngine:'gemini',diagnostic:true});
 calls.length=0;const generated=await service.replayImageDiagnostic({report:r,generate:true});
 assert.equal(generated.finalDataUrl,'composited');assert.deepEqual(calls.map(c=>c.action),['synth','splitAndComposite']);
 assert.equal(calls[0].apiKey,'secret-key');calls.length=0;
 await service.replayImageDiagnostic({report:{...r,...generated},generate:false});
 assert.deepEqual(calls.map(c=>c.action),['splitAndComposite']);
});
test('normal premium path still generates and counts once',async()=>{
 const {service,calls}=await harness();assert.equal(await service.handlePremiumTranslation({...message,imageStdEngine:'gemini'}),'composited');
 assert.equal(calls.filter(c=>c.action==='synth').length,1);assert.equal(calls.filter(c=>c.action==='count').length,1);
});
test('diagnostic OCR error never triggers paid fallback',async()=>{
 const {service,calls}=await harness({visionError:'OCR failed'});
 await assert.rejects(service.handlePremiumTranslation({...message,imageStdEngine:'gemini',diagnostic:true}),/OCR failed/);
 assert.equal(calls.filter(c=>c.action==='synth').length,0);
});
test('geometry checks identify overlap, shrinkage and separator intrusion',()=>{
 const r={inputWidth:100,inputHeight:100,translationPairs:[{},{}],sprite:{cropBboxes:[{x:0,y:0,width:50,height:50},{x:20,y:20,width:50,height:50}],layout:{gap:4,regions:[{y:0,width:25,height:25},{y:27,width:25,height:25}]}}};
 const warnings=inspectReport(r).join(' ');assert.match(warnings,/중첩/);assert.match(warnings,/축소/);assert.match(warnings,/구분선/);
});
