import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { SpeechRecognitionLike, SREvent, SRErrorEvent } from "./speech";

interface VoiceEvent { id: string; type: "ready" | "result" | "error"; text?: string; final?: boolean; message?: string }
let operations = Promise.resolve();
let lastId = "";
const control = (mode: string, id: string) => {
  const request = operations.then(() => invoke<void>("speech_control", { mode, id }));
  operations = request.catch(() => {});
  return request;
};

export function shutdownNativeSpeech() { return control("off", lastId); }

/** Web Speech-shaped adapter backed by the bundled offline Windows recognizer. */
export class NativeRecognition extends EventTarget implements SpeechRecognitionLike {
  lang = "es-ES";
  interimResults = true;
  continuous = true;
  maxAlternatives = 1;
  onresult: ((event: SREvent) => void) | null = null;
  onerror: ((event: SRErrorEvent) => void) | null = null;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  private active = false;
  private id = "";
  private unlisten: UnlistenFn | null = null;
  private timeout: ReturnType<typeof setTimeout> | undefined;

  start() {
    if (this.active) return;
    this.active = true;
    this.id = crypto.randomUUID();
    lastId = this.id;
    void this.connect();
  }

  private async connect() {
    try {
      if (!this.lang.startsWith("es")) throw new Error("Esta versión incluye reconocimiento local en español. Selecciona ES en Idioma.");
      const unlisten = await listen<VoiceEvent>("cube-speech", ({ payload }) => {
        if (!this.active || payload.id !== this.id) return;
        if (payload.type === "ready") { clearTimeout(this.timeout); this.onstart?.(); }
        else if (payload.type === "error") this.fail(payload.message ?? "No se pudo iniciar el micrófono.");
        else if (payload.text && (payload.final || this.interimResults)) {
          const event = Object.assign(new Event("result"), {
            resultIndex: 0,
            results: [{ isFinal: !!payload.final, 0: { transcript: payload.text }, length: 1 }],
          }) as SREvent;
          this.onresult?.(event);
          if (payload.final && !this.continuous) this.stop();
        }
      });
      if (!this.active) { unlisten(); return; }
      this.unlisten = unlisten;
      this.timeout = setTimeout(() => this.fail("El motor de voz no respondió. Reintenta desde Configuración."), 30000);
      await control("active", this.id);
    } catch (error) { this.fail(String(error)); }
  }

  private fail(message: string) {
    if (!this.active) return;
    this.onerror?.(Object.assign(new Event("error"), { error: "audio-capture", message }) as SRErrorEvent);
    this.abort();
  }

  stop() { this.abort(); }
  abort() {
    if (!this.active) return;
    this.active = false;
    clearTimeout(this.timeout);
    this.unlisten?.(); this.unlisten = null;
    void control("paused", this.id);
    this.onend?.();
  }
}
