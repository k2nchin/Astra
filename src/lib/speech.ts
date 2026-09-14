import { invoke, isTauri } from "@tauri-apps/api/core";
import { NativeRecognition } from "./nativeSpeech";
import { PERSONAS } from "./persona";
import { playChime } from "./audio";
import type { PersonaId } from "@/types";

/**
 * Capa de voz del MVP (Web Speech API).
 * En la versión Tauri esto se sustituirá por Whisper local / STT nativo y un
 * TTS neuronal, pero la interfaz `listen()` / `speak()` se mantiene igual.
 */

// Tipos mínimos para SpeechRecognition (no están en lib.dom en todos los targets).
export interface SRResultAlt {
  transcript: string;
}
export interface SRResult {
  isFinal: boolean;
  0: SRResultAlt;
  length: number;
}
export interface SREvent extends Event {
  resultIndex: number;
  results: ArrayLike<SRResult>;
}
export interface SRErrorEvent extends Event {
  error: string;
  message?: string;
}
export interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SREvent) => void) | null;
  onerror: ((e: SRErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}
export type SRConstructor = new () => SpeechRecognitionLike;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function getRecognitionCtor(): SRConstructor | null {
  if (typeof window === "undefined") return null;
  if (isTauri()) return NativeRecognition;
  const w = window as unknown as {
    SpeechRecognition?: SRConstructor;
    webkitSpeechRecognition?: SRConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isRecognitionSupported() {
  return getRecognitionCtor() !== null && (isTauri() || window.isSecureContext);
}

export function isSynthesisSupported() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export interface ListenResult {
  text: string;
  /** true si no hubo micrófono real y se usó una frase de demostración. */
  simulated: boolean;
}

export interface ListenOptions {
  lang: string;
  onInterim?: (text: string) => void;
  signal?: AbortSignal;
  /** Tiempo máximo de escucha (ms). */
  timeoutMs?: number;
}

/**
 * Escucha UNA frase (modo pulsar-para-hablar). Resuelve `null` si el usuario
 * cancela o no se oye nada. Si el navegador no soporta reconocimiento (o el
 * micro está bloqueado), entra en modo demo y "oye" una frase de ejemplo.
 */
export function listen(opts: ListenOptions): Promise<ListenResult | null> {
  const Ctor = getRecognitionCtor();
  if (!Ctor || (!isTauri() && !window.isSecureContext) || opts.signal?.aborted) return Promise.resolve(null);

  return new Promise((resolve) => {
    let settled = false;
    let finalText = "";
    const rec = new Ctor();
    rec.lang = opts.lang;
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;

    const finish = (value: ListenResult | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);
      resolve(value);
    };

    const onAbort = () => {
      try {
        rec.abort();
      } catch {
        /* noop */
      }
      finish(null);
    };
    opts.signal?.addEventListener("abort", onAbort);

    const timer = setTimeout(() => {
      try {
        rec.stop();
      } catch {
        /* noop */
      }
    }, opts.timeoutMs ?? 8000);

    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      opts.onInterim?.(finalText || interim);
    };

    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed" || e.error === "audio-capture") {
        finish(null);
        return;
      }
      if (e.error === "aborted") return finish(null);
      finish(finalText ? { text: finalText.trim(), simulated: false } : null);
    };

    rec.onend = () => {
      if (settled) return;
      finish(finalText.trim() ? { text: finalText.trim(), simulated: false } : null);
    };

    try {
      rec.start();
    } catch {
      finish(null);
    }
  });
}

/* ------------------------------------------------------------------ */
/*  Voces del sistema                                                   */
/* ------------------------------------------------------------------ */

const normLang = (l: string) => l.replace("_", "-").toLowerCase();

export function getVoices(): SpeechSynthesisVoice[] {
  return isSynthesisSupported() ? window.speechSynthesis.getVoices() : [];
}

/** Chrome carga las voces de forma asíncrona: avisa cuando cambie la lista. */
export function onVoicesChanged(cb: () => void) {
  if (!isSynthesisSupported()) return () => {};
  window.speechSynthesis.addEventListener("voiceschanged", cb);
  return () => window.speechSynthesis.removeEventListener("voiceschanged", cb);
}

/** Voces del idioma (las del dialecto exacto primero). */
export function voicesForLang(lang: string): SpeechSynthesisVoice[] {
  const exact = normLang(lang);
  const base = exact.split("-")[0];
  const pool = getVoices().filter((v) => normLang(v.lang).startsWith(base));
  return [...pool.filter((v) => normLang(v.lang) === exact), ...pool.filter((v) => normLang(v.lang) !== exact)];
}

/** Voz que se usará: la elegida por el usuario o la mejor según la personalidad. */
export function resolveVoice(lang: string, persona: PersonaId = "cube", voiceURI?: string | null) {
  const voices = getVoices();
  if (voiceURI) {
    const chosen = voices.find((v) => v.voiceURI === voiceURI);
    if (chosen) return chosen;
  }
  const pool = voicesForLang(lang);
  if (!pool.length) return null;
  for (const re of PERSONAS[persona].voice.prefer) {
    const v = pool.find((x) => re.test(x.name));
    if (v) return v;
  }
  return pool[0];
}

/** Nombre corto y legible de una voz («Microsoft Helena - Spanish (Spain)» → «Helena»). */
export function voiceLabel(v: SpeechSynthesisVoice) {
  return v.name
    .replace(/^Microsoft\s+/i, "")
    .replace(/\s+Online/i, "")
    .replace(/\s+-\s+.*$/, "")
    .trim();
}

/* ------------------------------------------------------------------ */
/*  Síntesis                                                           */
/* ------------------------------------------------------------------ */

/**
 * Referencia viva al utterance actual (Chrome lo recolecta si no se retiene y
 * nunca dispara `onend`) y a su `resolve`, para poder cortar la voz al instante.
 */
let current: { utterance: SpeechSynthesisUtterance; finish: () => void } | null = null;
/** Generación de locución: `cancelSpeech()` invalida las que aún no han empezado. */
let speakGen = 0;

export function isSpeaking() {
  return current !== null;
}

/** Duración estimada de lectura para animar "speaking" aunque no haya TTS. */
export function readingTime(text: string) {
  return Math.max(1500, Math.min(7000, 600 + text.length * 42));
}

export interface SpeakOptions {
  lang: string;
  enabled: boolean;
  persona?: PersonaId;
  voiceURI?: string | null;
  voiceProvider?: "system" | "fish";
  fishApiKey?: string;
  fishReferenceId?: string;
  /** Tono de sistema antes de hablar. */
  chime?: boolean;
}

/**
 * Habla el texto. Resuelve cuando termina (o tras un tiempo estimado si el
 * TTS está desactivado, no soportado o bloqueado por el navegador porque aún
 * no ha habido un gesto del usuario).
 */
export async function speak(text: string, opts: SpeakOptions): Promise<void> {
  cancelSpeech();
  const gen = ++speakGen;
  if (!opts.enabled || !isSynthesisSupported()) {
    await sleep(readingTime(text));
    return;
  }
  // En Tauri la API key puede estar guardada en DPAPI y no volver al frontend.
  if (opts.voiceProvider === "fish" && opts.fishReferenceId?.trim() && (opts.fishApiKey?.trim() || isTauri())) {
    await speakFish(text, opts);
    return;
  }
  if (opts.chime) {
    await playChime();
    if (gen !== speakGen) return; // interrumpido durante el tono
  }
  await speakNow(text, opts);
}

async function speakFish(text: string, opts: SpeakOptions) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 45_000);
  try {
    const response = isTauri() ? null : await fetch("https://api.fish.audio/v1/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.fishApiKey!.trim()}`, model: "s2-pro" },
      body: JSON.stringify({ text, reference_id: opts.fishReferenceId!.trim(), format: "mp3", sample_rate: 44100, mp3_bitrate: 128, latency: "balanced", prosody: { speed: 0.94, volume: 0, normalize_loudness: true } }),
      signal: controller.signal,
    });
    const bytes = isTauri()
      ? new Uint8Array(await invoke<number[]>("fish_tts", { text, referenceId: opts.fishReferenceId!.trim(), apiKey: opts.fishApiKey?.trim() || null }))
      : new Uint8Array(await (async () => { if (!response!.ok) throw new Error(`Fish Audio respondió ${response!.status}. Revisa la API key y el Reference ID.`); return await response!.arrayBuffer(); })());
    const audio = new Audio(URL.createObjectURL(new Blob([bytes], { type: "audio/mpeg" })));
    await new Promise<void>((resolve, reject) => { audio.onended = () => resolve(); audio.onerror = () => reject(new Error("No se pudo reproducir la voz de Fish Audio.")); void audio.play().catch(reject); });
  } catch {
    await sleep(readingTime(text));
  } finally { window.clearTimeout(timer); }
}

function speakNow(text: string, opts: SpeakOptions): Promise<void> {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const estimated = readingTime(text);
    const profile = PERSONAS[opts.persona ?? "cube"].voice;
    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(safety);
      if (current?.utterance === u) current = null;
      resolve();
    };
    /** Sin audio (p. ej. `not-allowed` antes del primer clic): mantenemos el ritmo visual. */
    const finishAfterEstimate = () => {
      const remaining = estimated - (Date.now() - startedAt);
      setTimeout(finish, Math.max(0, remaining));
    };

    const synth = window.speechSynthesis;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = opts.lang;
    u.rate = profile.rate;
    u.pitch = profile.pitch;
    u.volume = profile.volume;
    const voice = resolveVoice(opts.lang, opts.persona, opts.voiceURI);
    if (voice) u.voice = voice;
    u.onend = finish;
    u.onerror = (e) => {
      if (e.error === "interrupted" || e.error === "canceled") finish();
      else finishAfterEstimate();
    };
    current = { utterance: u, finish };
    const safety = setTimeout(finish, estimated + 4000);
    try {
      synth.resume();
      synth.speak(u);
    } catch {
      finishAfterEstimate();
    }
  });
}

/** Corta la voz actual (si la hay) y resuelve su promesa al instante. */
export function cancelSpeech() {
  speakGen += 1;
  if (!isSynthesisSupported()) return;
  const c = current;
  current = null;
  window.speechSynthesis.cancel();
  c?.finish();
}

// Precarga de voces (Chrome las carga de forma asíncrona).
if (isSynthesisSupported()) {
  window.speechSynthesis.getVoices();
  window.speechSynthesis.addEventListener("voiceschanged", () => window.speechSynthesis.getVoices());
}
