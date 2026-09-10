import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { normalizeBox } from '../src/api/image/vision.js';
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
  const context = vm.createContext({ console: { log() {}, warn() {} }, chrome: {
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
    '../options/storage.js': { getSettings: async () => ({ targetLang: 'en' }) },
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

test('normalized boxes scale at 512, 1000, 1024 and original resolutions', () => {
  for (const width of [512, 1000, 1024, 2048]) {
    const height = width / 2;
    const expected = { x: Math.round(width * .2) - 2, y: Math.round(height * .1) - 2,
      width: Math.round(width * .6) - Math.round(width * .2) + 4,
      height: Math.round(height * .5) - Math.round(height * .1) + 4, _wasNormalized: true };
    assert.deepEqual(normalizeBox([200, 100, 600, 500], width, height, false), expected);
    assert.deepEqual(normalizeBox([100, 200, 500, 600], width, height, true), expected);
  }
  assert.equal(normalizeBox([0, 0, NaN, 500], 512, 512), null);
  assert.equal(normalizeBox([500, 500, 100, 100], 512, 512), null);
  assert.equal(normalizeBox([0, 0, 500, 500], 0, 0), null);
});

for (const engine of ['gemini', 'openai', 'other']) {
  test(`premium ${engine} OCR preserves settings and crop coordinates`, async () => {
    const { service, calls, creations } = await harness();
    assert.equal(await service.handlePremiumTranslation({ ...message, imageStdEngine: engine, imageStdOtherType: 'vision_api' }), 'composited');
    const vision = calls.find(c => c.action === 'vision');
    assert.equal(vision.mode, engine === 'other' ? 'other_vision' : engine);
    assert.equal(vision.openaiModel, 'selected-openai');
    assert.equal(vision.geminiModel, 'selected-gemini');
    assert.equal(vision.otherVisionUrl, message.imageStdOtherUrl);
    assert.equal(vision.naturalWidth, 500);
    assert.deepEqual(calls.find(c => c.action === 'cropAndBuildSprite').boxes[0], bbox);
    assert.equal(creations(), 1);
    assert.equal(calls.filter(c => c.action === 'count').length, 1);
  });
}

for (const engine of ['free', 'other']) {
  for (const mode of ['Standard', 'Premium']) {
    test(`${mode} ${engine} removes empty OCR blocks without shifting translations`, async () => {
      const { service, calls } = await harness({ blocks: [
        { text: '───', bbox }, { text: '日本語', bbox },
      ] });
      const result = await service[`handle${mode}Translation`]({ ...message, imageStdEngine: engine, imageStdOtherType: 'ocr_server' });
      const translated = calls.find(c => c.action === 'translate');
      assert.equal(translated.texts.length, 1);
      assert.equal(translated.texts[0], '日本語');
      assert.equal(translated.settings.targetLang, 'ko');
      if (mode === 'Standard') {
        assert.equal(result.length, 1);
        assert.equal(result[0].translatedText, '번역:日本語');
        assert.equal(result[0].eraseBox.x, bbox.x * 2);
      } else {
        assert.equal(calls.find(c => c.action === 'synth').translationPairs[0].translated, '번역:日本語');
      }
      if (engine === 'other') assert.equal(calls.find(c => c.action === 'customOcr').serverUrl, message.imageStdOtherUrl);
    });
  }
}

test('Vision errors propagate without calling another provider or synthesis', async () => {
  const { service, calls } = await harness({ visionError: 'HTTP 401' });
  await assert.rejects(service.handlePremiumTranslation({ ...message, imageStdEngine: 'openai' }), /401/);
  assert.equal(calls.filter(c => c.action === 'vision').length, 1);
  assert.ok(!calls.some(c => c.action === 'synth'));
});

test('text translation failure does not trigger paid synthesis', async () => {
  const { service, calls } = await harness({ translateError: 'HTTP 429' });
  await assert.rejects(service.handlePremiumTranslation({ ...message, imageStdEngine: 'free' }), /429/);
  assert.ok(!calls.some(c => c.action === 'synth'));
});

test('Offscreen creation can retry after rejection', async () => {
  const { service, creations } = await harness({ failCreate: true });
  await assert.rejects(service.handlePremiumTranslation({ ...message, imageStdEngine: 'free' }), /creation failed/);
  assert.equal(await service.handlePremiumTranslation({ ...message, imageStdEngine: 'free' }), 'composited');
  assert.equal(creations(), 2);
});

test('unsupported synthesis never silently calls Gemini', async () => {
  const { service, calls } = await harness();
  await assert.rejects(service.handlePremiumTranslation({ ...message, imagePremEngine: 'other' }), /아직 지원되지/);
  assert.equal(calls.length, 0);
});
