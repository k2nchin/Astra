import test from 'node:test';
import assert from 'node:assert/strict';

class Microphone extends EventTarget {
  static current;
  start() { Microphone.current = this; this.onstart?.(); }
  abort() { this.onend?.(); }
  stop() { this.onend?.(); }
  phrase(text, final = true) {
    this.onresult?.({ resultIndex: 0, results: [{ isFinal: final, 0: { transcript: text }, length: 1 }] });
  }
}
globalThis.window = { isSecureContext: true, SpeechRecognition: Microphone, setTimeout, clearTimeout };
const { HandsFreeListener, matchWake } = await import('../.build-cache/wakeword.mjs');

test('accepts the Astra wake phrase with or without a command', () => {
  assert.equal(matchWake('Hey Astra, qué hora es').command, 'qué hora es');
  assert.equal(matchWake('oye astra').command, '');
  assert.equal(matchWake('hola astra abre el navegador').command, 'abre el navegador');
  assert.equal(matchWake('Astra, pon música').command, 'pon música');
  assert.equal(matchWake('Hey Astra, abre Spotify').command, 'abre Spotify');
  assert.equal(matchWake('una conversación normal'), null);
  assert.equal(matchWake('cubierta'), null);
});

test('reacts without a click; ignores unrelated speech; submits a command only once', () => {
  const events = [];
  const listener = new HandsFreeListener({ lang: 'es-ES', onEvent: e => events.push(e) });
  listener.start();
  Microphone.current.phrase('seguimos trabajando');
  assert.equal(events.filter(e => e.type === 'command').length, 0);
  Microphone.current.phrase('oye astra', false);
  assert.equal(events.filter(e => e.type === 'wake').length, 1);
  Microphone.current.phrase('oye astra qué hora es', false);
  Microphone.current.phrase('oye astra qué hora es', true);
  assert.deepEqual(events.filter(e => e.type === 'command'), [{ type: 'command', text: 'qué hora es' }]);
  listener.pause();
  assert.equal(Microphone.current.onresult, null, 'does not listen to its own spoken answer');
  listener.resume();
  assert.equal(listener.status, 'active');
  Microphone.current.phrase('Hey Astra, hola');
  assert.equal(events.filter(e => e.type === 'command').at(-1).text, 'hola');
  listener.stop();
  assert.equal(listener.status, 'off');
});

test('no command after timeout or stop', async () => {
  const events = [];
  const listener = new HandsFreeListener({ lang: 'es-ES', commandTimeoutMs: 20, onEvent: e => events.push(e) });
  listener.start();
  Microphone.current.phrase('oye astra');
  await new Promise(resolve => setTimeout(resolve, 40));
  Microphone.current.phrase('abre el navegador');
  assert.equal(events.filter(e => e.type === 'command').length, 0);
  assert.equal(events.filter(e => e.type === 'timeout').length, 1);
  listener.stop();
});

test('microphone failure is explicit and does not simulate a command', () => {
  const events = [];
  const listener = new HandsFreeListener({ lang: 'es-ES', onEvent: e => events.push(e) });
  listener.start();
  Microphone.current.onerror({ error: 'audio-capture', message: 'Micrófono desconectado' });
  assert.equal(listener.status, 'unsupported');
  assert.ok(events.some(e => e.type === 'error' && e.message === 'Micrófono desconectado'));
  assert.equal(events.filter(e => e.type === 'command').length, 0);
  listener.stop();
});
