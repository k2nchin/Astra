import {
  getRecognitionCtor,
  type SpeechRecognitionLike,
  type SREvent,
  type SRErrorEvent,
} from "./speech";
import type { HandsFreeStatus } from "@/types";
import { isTauri } from "@tauri-apps/api/core";
import { shutdownNativeSpeech } from "./nativeSpeech";

/**
 * Escucha continua en segundo plano con palabra de activación («Hey CUBE»).
 *
 *   status → wake → interim* → command | timeout
 *
 * En Tauri esto se sustituirá por un motor local (Porcupine / openWakeWord +
 * Whisper), manteniendo exactamente esta interfaz de eventos.
 */

export const WAKE_WORDS = ["Hey Astra", "Oye Astra", "Hola Astra", "Astra"];

/**
 * Variantes que el reconocedor (sobre todo en español) suele producir al oír
 * "cube" o el alias de activación «Rafael». El alias despierta a CUBE, pero no
 * cambia su personalidad ni su voz.
 */
const WAKE_RE =
  /(?:^|[\s,.])(?:hey|ey|eh|oye|oe|ok|okey|okay|hola)?[\s,]*(?:astra|astraia)(?=$|[\s,.!?¡¿])[\s,.!?¡¿]*/i;

export function matchWake(text: string): { command: string } | null {
  const m = WAKE_RE.exec(text);
  if (!m) return null;
  const after = text.slice(m.index + m[0].length).trim();
  const before = text.slice(0, m.index).trim();
  // «Hey CUBE, abre Blender»  ó  «abre Blender, CUBE»
  const command = after || (before.split(/\s+/).filter(Boolean).length >= 2 ? before : "");
  return { command: command.replace(/^[\s,.:;!?¡¿-]+/, "").trim() };
}

export type HandsFreeEvent =
  | { type: "error"; message: string }
  | { type: "status"; status: HandsFreeStatus }
  /** Palabra de activación detectada (o activación manual). `command` si venía en la misma frase. */
  | { type: "wake"; command: string | null }
  | { type: "interim"; text: string }
  | { type: "command"; text: string }
  | { type: "timeout"; manual: boolean };

interface Options {
  lang: string;
  onEvent: (e: HandsFreeEvent) => void;
  /** Tiempo de espera de la orden tras la palabra de activación. */
  commandTimeoutMs?: number;
}

export class HandsFreeListener {
  status: HandsFreeStatus = "off";

  private readonly opts: Options;
  private rec: SpeechRecognitionLike | null = null;
  private lang: string;
  /** El usuario quiere manos libres. */
  private enabled = false;
  /** Pausa temporal (mientras CUBE habla, para no oírse a sí mismo). */
  private paused = false;
  private phase: "wake" | "command" = "wake";
  private manual = false;
  private cmdTimer: number | null = null;
  private restartTimer: number | null = null;
  private backoff = 250;
  private startedAt = 0;
  private lastError = "";

  constructor(opts: Options) {
    this.opts = opts;
    this.lang = opts.lang;
  }

  get available() {
    return this.enabled && (this.status === "active" || this.status === "paused" || this.status === "starting");
  }

  get inCommand() {
    return this.phase === "command";
  }

  start() {
    if (!getRecognitionCtor() || (!isTauri() && !window.isSecureContext)) {
      this.enabled = false;
      this.setStatus("unsupported");
      return;
    }
    this.enabled = true;
    this.paused = false;
    if (this.rec || this.restartTimer) return; // ya en marcha
    this.setStatus("starting");
    this.spin();
  }

  stop() {
    this.enabled = false;
    this.paused = false;
    this.resetPhase();
    this.kill();
    if (isTauri()) void shutdownNativeSpeech();
    this.setStatus("off");
  }

  pause() {
    if (!this.enabled || this.paused) return;
    this.paused = true;
    this.resetPhase();
    this.kill();
    if (this.status === "active" || this.status === "starting") this.setStatus("paused");
  }

  resume() {
    if (!this.enabled || !this.paused) return;
    this.paused = false;
    if (this.status === "paused") this.setStatus("starting");
    this.spin();
  }

  setLang(lang: string) {
    if (lang === this.lang) return;
    this.lang = lang;
    if (this.rec) {
      this.kill();
      this.spin();
    }
  }

  /** Entra en fase de orden sin palabra de activación (clic manual o pregunta de CUBE). */
  armCommand(o: { manual?: boolean; timeoutMs?: number } = {}) {
    if (!this.available) return false;
    this.phase = "command";
    this.manual = o.manual ?? true;
    this.armTimeout(o.timeoutMs);
    this.paused = false;
    if (!this.rec) this.spin();
    this.opts.onEvent({ type: "wake", command: null });
    return true;
  }

  cancelCommand() {
    if (this.phase !== "command") return;
    this.resetPhase();
  }

  /* ------------------------------------------------------------------ */

  private setStatus(s: HandsFreeStatus) {
    if (this.status === s) return;
    this.status = s;
    this.opts.onEvent({ type: "status", status: s });
  }

  private resetPhase() {
    this.phase = "wake";
    this.manual = false;
    if (this.cmdTimer) {
      window.clearTimeout(this.cmdTimer);
      this.cmdTimer = null;
    }
  }

  private armTimeout(ms?: number) {
    if (this.cmdTimer) window.clearTimeout(this.cmdTimer);
    this.cmdTimer = window.setTimeout(() => {
      const manual = this.manual;
      this.resetPhase();
      this.opts.onEvent({ type: "timeout", manual });
    }, ms ?? this.opts.commandTimeoutMs ?? 7000);
  }

  private emitCommand(text: string) {
    this.resetPhase();
    this.opts.onEvent({ type: "command", text });
  }

  private spin() {
    if (!this.enabled || this.paused || this.rec) return;
    if (this.restartTimer) {
      window.clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;

    const rec = new Ctor();
    rec.lang = this.lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      this.startedAt = Date.now();
      this.backoff = 250;
      this.setStatus("active");
    };
    rec.onresult = (e) => this.handleResult(e);
    rec.onerror = (e) => this.handleError(e);
    rec.onend = () => {
      if (this.rec !== rec) return;
      this.rec = null;
      if (!this.enabled || this.paused) return;
      // Chrome cierra la sesión tras silencios largos: relanzar.
      // Si muere en bucle (sin micro, sin red…) espaciamos los reintentos.
      const failing = Date.now() - this.startedAt < 1500 || this.lastError === "network";
      this.backoff = failing ? Math.min(8000, this.backoff * 2) : 250;
      this.lastError = "";
      this.restartTimer = window.setTimeout(() => {
        this.restartTimer = null;
        this.spin();
      }, this.backoff);
    };

    this.rec = rec;
    this.startedAt = Date.now();
    try {
      rec.start();
    } catch {
      this.rec = null;
      this.restartTimer = window.setTimeout(() => {
        this.restartTimer = null;
        this.spin();
      }, 600);
    }
  }

  private kill() {
    if (this.restartTimer) {
      window.clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    const rec = this.rec;
    if (!rec) return;
    this.rec = null;
    rec.onstart = null;
    rec.onresult = null;
    rec.onerror = null;
    rec.onend = null;
    try {
      rec.abort();
    } catch {
      /* noop */
    }
  }

  private handleError(e: SRErrorEvent) {
    if (e.message) this.opts.onEvent({ type: "error", message: e.message });
    this.lastError = e.error;
    switch (e.error) {
      case "not-allowed":
      case "service-not-allowed":
        this.enabled = false;
        this.resetPhase();
        this.kill();
        this.setStatus("denied");
        break;
      case "audio-capture":
        this.enabled = false;
        this.resetPhase();
        this.kill();
        this.setStatus("unsupported");
        break;
      default:
        // no-speech / aborted / network → `onend` se encarga de relanzar
        break;
    }
  }

  private handleResult(e: SREvent) {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      const raw = (r[0]?.transcript ?? "").trim();
      if (!raw) continue;
      const wake = matchWake(raw);

      if (this.phase === "wake") {
        if (!wake) continue;
        if (r.isFinal && wake.command) {
          // «Hey CUBE, abre VS Code» en una sola frase.
          this.emitCommand(wake.command);
          continue;
        }
        // Palabra clave oída: abrir la fase de orden y avisar en cuanto hay indicio.
        this.phase = "command";
        this.manual = false;
        this.armTimeout();
        this.opts.onEvent({ type: "wake", command: null });
        if (wake.command) this.opts.onEvent({ type: "interim", text: wake.command });
      } else {
        const text = wake ? wake.command : raw;
        if (r.isFinal) {
          if (text) this.emitCommand(text);
          else this.armTimeout(); // solo dijo «Hey CUBE»: esperamos la orden
        } else {
          this.armTimeout();
          if (text) this.opts.onEvent({ type: "interim", text });
        }
      }
    }
  }
}
