import test from 'node:test';
import assert from 'node:assert/strict';
const { askGemini, geminiBody, parseGemini, actionFromCall } = await import('../.build-cache/gemini.mjs');
const { think } = await import('../.build-cache/brain.mjs');
const { executeAction, resolveActionReply } = await import('../.build-cache/actions.mjs');
const settings = { provider: 'gemini', apiKey: '', model: 'gemini-2.5-flash', apiBaseUrl: '' };
const answer = (text) => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text }] } }] });
function desktop(invoke) { globalThis.isTauri = true; globalThis.window = { __TAURI_INTERNALS__: { invoke }, setTimeout, clearTimeout }; }

test('ordinary questions and contextual follow-ups reach Gemini with history, including greetings', async () => {
  const calls = [];
  desktop(async (cmd, args) => { calls.push({ cmd, args }); return answer('Una respuesta real del modelo.'); });
  const history = [{ role: 'user', text: 'Me llamo Juan.' }, { role: 'assistant', text: 'Hola, Juan.' }];
  for (const question of ['¿Cómo se produce la lluvia?', 'Hola, explícame qué es una API', 'Respóndeme una pregunta', 'Explica la siguiente frase', '¿En qué fecha nació Mozart?', 'Ayúdame con matemáticas', '¿Cómo me llamo?']) {
    const reply = await think(question, 'es-ES', 'cube', settings, undefined, history);
    assert.equal(reply.text, 'Una respuesta real del modelo.', question);
    assert.equal(reply.action, undefined);
  }
  assert.equal(calls.length, 7);
  assert.equal(calls[0].cmd, 'gemini_generate');
  assert.equal(calls[0].args.apiKey, null, 'native side retrieves the encrypted key');
  assert.deepEqual(calls[0].args.body.contents[1], { role: 'model', parts: [{ text: 'Hola, Juan.' }] });
});

test('missing credential and provider errors are visible, without demonstration replies', async () => {
  desktop(async () => { throw 'Añade tu API key de Gemini en Configuración.'; });
  const reply = await think('Cuánto es dos más tres', 'es-ES', 'cube', settings);
  assert.equal(reply.kind, 'error');
  assert.match(reply.text, /API key de Gemini/);
  const local = await think('Cuál es la capital de Francia', 'es-ES', 'cube', { ...settings, provider: 'local' });
  assert.match(local.text, /Configuración/);
  assert.doesNotMatch(local.text, /cerebro|a medias|no implementada/);
});

test('Gemini actions wait for confirmation; an accepted action executes exactly once', async () => {
  const reply = parseGemini({ candidates: [{ content: { parts: [{ functionCall: { name: 'media_control', args: { command: 'next' } } }] } }] });
  assert.equal(reply.action, undefined);
  assert.equal(reply.followUp.yes.action.payload.command, 'next');
  const calls = [];
  desktop(async (command, args) => { calls.push({ command, args }); });
  await resolveActionReply(reply, executeAction);
  assert.equal(calls.length, 0);
  await resolveActionReply(reply.followUp.yes, executeAction);
  assert.deepEqual(calls, [{ command: 'media_control', args: { command: 'next' } }]);
});

test('unknown tools, injected shell parameters and multi-action replies never execute', () => {
  for (const call of [
    { name: 'shell', args: { command: 'anything' } },
    { name: 'open_app', args: { name: 'Terminal', args: 'malicious' } },
    { name: 'open_app', args: { name: 'cmd.exe /c echo wrong' } },
    { name: 'system_control', args: { command: 'shutdown' } },
    { name: 'search_files', args: { query: '../private' } },
  ]) assert.throws(() => actionFromCall(call), /no admitida/);
  const fc = { functionCall: { name: 'open_app', args: { name: 'Spotify' } } };
  assert.throws(() => parseGemini({ candidates: [{ content: { parts: [fc, fc] } }] }), /varias acciones/);
});

test('backend failures replace success claims in the reply', async () => {
  desktop(async () => { throw 'Spotify no está instalado'; });
  const result = await resolveActionReply({ text: 'Abriendo Spotify', action: { type: 'open_app', label: 'Spotify', icon: 'music' }, celebrate: true }, executeAction);
  assert.equal(result.kind, 'error');
  assert.match(result.text, /no está instalado/);
  assert.equal(result.celebrate, undefined);
  assert.equal(result.action, undefined);
});

test('cancelled Gemini responses cannot submit late actions', async () => {
  let finish;
  desktop(() => new Promise((resolve) => { finish = resolve; }));
  const controller = new AbortController();
  const promise = askGemini(settings, 'Abre Spotify', 'es-ES', [], controller.signal);
  controller.abort();
  finish({ candidates: [{ content: { parts: [{ functionCall: { name: 'open_app', args: { name: 'Spotify' } } }] } }] });
  await assert.rejects(promise, { name: 'AbortError' });
});

test('thoughts and blocked replies are not spoken, and tests cannot request PC tools', () => {
  assert.equal(parseGemini({ candidates: [{ content: { parts: [{ thought: true, text: 'private reasoning' }, { text: 'Respuesta final' }] } }] }).text, 'Respuesta final');
  assert.throws(() => parseGemini({ promptFeedback: { blockReason: 'SAFETY' } }), /bloqueó/);
  assert.equal(geminiBody('test', 'es-ES', [], false).tools, undefined);
});

test('web preview uses the Gemini host and header; quota error does not leak response body', async () => {
  globalThis.window = {};
  globalThis.isTauri = false;
  let called;
  globalThis.fetch = async (url, opts) => { called = { url, opts }; return { ok: false, status: 429 }; };
  await assert.rejects(askGemini({ ...settings, apiKey: 'test-secret', apiBaseUrl: 'https://untrusted.example' }, 'hola', 'es-ES'), /429/);
  assert.equal(called.url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
  assert.equal(called.opts.headers['x-goog-api-key'], 'test-secret');
  assert.equal(called.opts.redirect, 'error');
  assert.equal(called.url.includes('test-secret'), false);
});
