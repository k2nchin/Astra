import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Crosshair, Mic, Play, X } from "lucide-react";
import { PERSONAS } from "@/lib/persona";
import { GeminiSettings } from "./GeminiSettings";
import { GEMINI_MODEL } from "@/lib/gemini";
import {
  getVoices,
  isRecognitionSupported,
  isSynthesisSupported,
  onVoicesChanged,
  resolveVoice,
  voiceLabel,
  voicesForLang,
} from "@/lib/speech";
import { cn } from "@/utils/cn";
import type { AstraRoutine, CustomCommand, HandsFreeStatus, PersonaId, Settings } from "@/types";
import { invoke, isTauri } from "@tauri-apps/api/core";

export const SETTINGS_W = 284;
export const SETTINGS_H = 640;

const HF_HINT: Record<HandsFreeStatus, string> = {
  off: "desactivado",
  starting: "iniciando… permite el micrófono",
  active: "escuchando la palabra clave",
  paused: "en pausa mientras hablo",
  denied: "sin permiso de micrófono",
  unsupported: "no disponible: revisa el micrófono",
};

const INITIATIVE_HINT: Record<Settings["initiative"], string> = {
  off: "solo responde cuando le hablas",
  low: "saluda, avisa y te recuerda cosas",
  high: "además comenta y pregunta por su cuenta",
};

/** Lista de voces del idioma, actualizada cuando el navegador termina de cargarlas. */
function useVoices(lang: string) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    getVoices();
    return onVoicesChanged(() => setTick((t) => t + 1));
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => voicesForLang(lang), [lang, tick]);
}

interface Props {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  onResetPosition: () => void;
  onClose: () => void;
  onTestVoice: () => void;
  micMode: "unknown" | "real" | "demo";
  handsFree: HandsFreeStatus;
  voiceError?: string;
  onRetryHandsFree: () => void;
  style: CSSProperties;
}

export function SettingsPanel({
  settings,
  onChange,
  onResetPosition,
  onClose,
  onTestVoice,
  micMode,
  handsFree,
  voiceError,
  onRetryHandsFree,
  style,
}: Props) {
  const [savedNotice, setSavedNotice] = useState("");
  const [commandTrigger, setCommandTrigger] = useState("");
  const [commandResponse, setCommandResponse] = useState("");
  const [routineName, setRoutineName] = useState("");
  const [routineTrigger, setRoutineTrigger] = useState("");
  const [routineSteps, setRoutineSteps] = useState("");
  const [fishSaved, setFishSaved] = useState(false);
  const stt = isRecognitionSupported();
  const tts = isSynthesisSupported();
  const voices = useVoices(settings.lang);
  const auto = resolveVoice(settings.lang, settings.persona, null);
  const meta = PERSONAS[settings.persona];

  useEffect(() => {
    if (!isTauri()) return;
    void invoke<boolean>("fish_key_status").then(setFishSaved).catch(() => setFishSaved(false));
  }, [settings.voiceProvider]);

  return (
    <section
      className="animate-pop fixed z-[70] flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/85 shadow-[0_24px_70px_-16px_rgba(0,0,0,0.9)] backdrop-blur-2xl"
      style={{ ...style, width: SETTINGS_W, maxHeight: "calc(100vh - 72px)" }}
      aria-label="Configuración de Astra"
      onContextMenu={(e) => e.stopPropagation()}
    >
      <header className="flex shrink-0 items-center justify-between border-b border-white/[0.07] px-3.5 py-2.5">
        <div>
          <div className="text-[11px] font-semibold tracking-[0.28em] text-zinc-100">CONFIGURACIÓN</div>
          <div className="text-[10px] text-zinc-500">ASTRA · mascot</div>
        </div>
        <button
          onClick={onClose}
          aria-label="Cerrar"
          className="grid h-6 w-6 place-items-center rounded-md text-zinc-500 hover:bg-white/[0.08] hover:text-white"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </header>

      <div className="cube-scroll space-y-3.5 overflow-y-auto px-3.5 py-3">
        <SectionTitle>Modelo y proveedores</SectionTitle>
        <Row label="Proveedor" hint="configuración local del agente">
          <select aria-label="Proveedor de LLM" value={settings.provider} onChange={(e) => { const provider = e.target.value as Settings["provider"]; onChange({ provider, apiKey: "", apiBaseUrl: "", model: provider === "gemini" ? GEMINI_MODEL : provider === "groq" ? "openai/gpt-oss-20b" : "" }); }} className="h-7 max-w-[136px] rounded-lg border border-white/10 bg-zinc-900 px-2 text-[11px] text-zinc-200 outline-none">
            <option value="groq">Groq · gratis</option><option value="gemini">Google Gemini</option><option value="local">Sin LLM</option><option value="openai">OpenAI</option><option value="anthropic">Anthropic</option><option value="custom">Personalizado</option>
          </select>
        </Row>
        {settings.provider === "gemini" && <GeminiSettings settings={settings} onChange={onChange} />}
        {settings.provider !== "local" && settings.provider !== "gemini" && <>
          <input type="password" value={settings.apiKey} onChange={(e) => onChange({ apiKey: e.target.value })} placeholder="API key" className="h-8 w-full rounded-lg border border-white/10 bg-white/[0.04] px-2.5 text-[11px] text-zinc-200 outline-none placeholder:text-zinc-500" />
          <input value={settings.apiBaseUrl} onChange={(e) => onChange({ apiBaseUrl: e.target.value })} placeholder={settings.provider === "groq" ? "URL Groq automática" : "URL base (opcional)"} className="h-8 w-full rounded-lg border border-white/10 bg-white/[0.04] px-2.5 text-[11px] text-zinc-200 outline-none placeholder:text-zinc-500" />
          <input value={settings.model} onChange={(e) => onChange({ model: e.target.value })} placeholder="Modelo (opcional)" className="h-8 w-full rounded-lg border border-white/10 bg-white/[0.04] px-2.5 text-[11px] text-zinc-200 outline-none placeholder:text-zinc-500" />
        </>}
        <div className="h-px bg-white/[0.07]" />
        <SectionTitle>Comandos personalizados</SectionTitle>
        <p className="text-[10px] leading-relaxed text-zinc-500">Crea respuestas rápidas para Astra. Ejemplo: «modo trabajo» → «Abriendo tu modo de concentración».</p>
        <input value={commandTrigger} onChange={(e) => setCommandTrigger(e.target.value)} placeholder="Frase que dirás" className="h-8 w-full rounded-lg border border-white/10 bg-white/[0.04] px-2.5 text-[11px] text-zinc-200 outline-none placeholder:text-zinc-500" />
        <input value={commandResponse} onChange={(e) => setCommandResponse(e.target.value)} placeholder="Respuesta de Astra" className="h-8 w-full rounded-lg border border-white/10 bg-white/[0.04] px-2.5 text-[11px] text-zinc-200 outline-none placeholder:text-zinc-500" />
        <button
          onClick={() => {
            const trigger = commandTrigger.trim(), response = commandResponse.trim();
            if (!trigger || !response) return;
            const item: CustomCommand = { id: crypto.randomUUID(), trigger, response };
            onChange({ customCommands: [...(settings.customCommands ?? []), item] });
            setCommandTrigger(""); setCommandResponse("");
          }}
          className="w-full rounded-lg border border-white/15 bg-white/[0.04] py-1.5 text-[11px] text-zinc-200 hover:bg-white/10"
        >Añadir comando</button>
        {!!settings.customCommands?.length && <div className="space-y-1">
          {settings.customCommands.map((command) => <div key={command.id} className="flex items-center gap-2 rounded-lg border border-white/[0.07] px-2 py-1.5 text-[10px] text-zinc-400"><span className="min-w-0 flex-1 truncate">{command.trigger}</span><button aria-label={`Eliminar ${command.trigger}`} onClick={() => onChange({ customCommands: settings.customCommands.filter((item) => item.id !== command.id) })} className="text-zinc-500 hover:text-red-300">×</button></div>)}
        </div>}
        <div className="mt-2 space-y-1.5 rounded-xl border border-white/[0.07] bg-white/[0.02] p-2">
          <div className="text-[10px] font-medium text-zinc-300">Rutinas de varios pasos</div>
          <input value={routineName} onChange={(e) => setRoutineName(e.target.value)} placeholder="Nombre: Inicio de trabajo" className="h-7 w-full rounded-lg border border-white/10 bg-white/[0.04] px-2 text-[10px] text-zinc-200 outline-none placeholder:text-zinc-500" />
          <input value={routineTrigger} onChange={(e) => setRoutineTrigger(e.target.value)} placeholder="Disparador: empieza el trabajo" className="h-7 w-full rounded-lg border border-white/10 bg-white/[0.04] px-2 text-[10px] text-zinc-200 outline-none placeholder:text-zinc-500" />
          <input value={routineSteps} onChange={(e) => setRoutineSteps(e.target.value)} placeholder="Pasos separados por ; ej. abrir Spotify; pon música" className="h-7 w-full rounded-lg border border-white/10 bg-white/[0.04] px-2 text-[10px] text-zinc-200 outline-none placeholder:text-zinc-500" />
          <button onClick={() => { const name = routineName.trim(), trigger = routineTrigger.trim(), steps = routineSteps.split(";").map((s) => s.trim()).filter(Boolean); if (!name || !trigger || !steps.length) return; const routine: AstraRoutine = { id: crypto.randomUUID(), name, trigger, steps }; onChange({ routines: [...(settings.routines ?? []), routine] }); setRoutineName(""); setRoutineTrigger(""); setRoutineSteps(""); }} className="w-full rounded-lg border border-white/15 bg-white/[0.04] py-1.5 text-[10px] text-zinc-200 hover:bg-white/10">Guardar rutina</button>
        {!!settings.routines?.length && settings.routines.map((routine) => <div key={routine.id} className="flex items-center gap-2 text-[10px] text-zinc-400"><span className="min-w-0 flex-1 truncate">{routine.name} · «{routine.trigger}»</span><button aria-label={`Eliminar rutina ${routine.name}`} onClick={() => onChange({ routines: settings.routines.filter((item) => item.id !== routine.id) })} className="text-zinc-500 hover:text-red-300">×</button></div>)}
        </div>
        <div className="space-y-1.5 rounded-xl border border-white/[0.07] bg-white/[0.02] p-2">
          <div className="text-[10px] font-medium text-zinc-300">Memoria de preferencias</div>
          <p className="text-[10px] leading-relaxed text-zinc-500">Una preferencia por línea. Astra la usa como contexto, pero no ejecuta acciones por ella.</p>
          <textarea value={(settings.preferences ?? []).join("\\n")} onChange={(e) => onChange({ preferences: e.target.value.split("\\n").map((item) => item.trim()).filter(Boolean).slice(0, 20) })} placeholder={"prefiero respuestas cortas\\nmi reproductor es Spotify"} rows={3} className="w-full resize-none rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 text-[10px] text-zinc-200 outline-none placeholder:text-zinc-500" />
        </div>
        <div className="h-px bg-white/[0.07]" />
        {/* ---------- personalidad y voz ---------- */}
        <SectionTitle>Personalidad y voz</SectionTitle>

        <Row label="Personalidad" hint={meta.tagline}>
          <Segmented<PersonaId>
            value={settings.persona}
            options={[
              { value: "cube", label: "ASTRA" },
            ]}
            onChange={(v) => onChange({ persona: v, voiceURI: null })}
          />
        </Row>

        <Row label="Voz del sistema" hint={auto ? `auto: ${voiceLabel(auto)}` : tts ? "cargando voces…" : "no disponible aquí"}>
          <select
            value={settings.voiceURI ?? ""}
            disabled={!tts || !voices.length}
            onChange={(e) => onChange({ voiceURI: e.target.value || null })}
            className="h-7 max-w-[136px] shrink-0 rounded-lg border border-white/10 bg-zinc-900 px-2 text-[11px] text-zinc-200 outline-none focus:border-white/30 disabled:opacity-40"
          >
            <option value="">Automática</option>
            {voices.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {voiceLabel(v)}
                {v.localService ? "" : " ·☁"}
              </option>
            ))}
          </select>
        </Row>
        <Row label="Proveedor de voz" hint={settings.voiceProvider === "fish" ? "voz neural · Fish Audio" : "voz instalada en Windows"}>
          <select value={settings.voiceProvider} onChange={(e) => onChange({ voiceProvider: e.target.value as Settings["voiceProvider"] })} className="h-7 max-w-[136px] rounded-lg border border-white/10 bg-zinc-900 px-2 text-[11px] text-zinc-200 outline-none">
            <option value="system">Windows</option><option value="fish">Fish Audio</option>
          </select>
        </Row>
        {settings.voiceProvider === "fish" && <>
          <input type="password" value={settings.fishApiKey} onChange={(e) => onChange({ fishApiKey: e.target.value })} placeholder="API key de Fish Audio" className="h-8 w-full rounded-lg border border-white/10 bg-white/[0.04] px-2.5 text-[11px] text-zinc-200 outline-none placeholder:text-zinc-500" />
          <input value={settings.fishReferenceId} onChange={(e) => onChange({ fishReferenceId: e.target.value })} placeholder="Reference ID de Fish Audio" className="h-8 w-full rounded-lg border border-white/10 bg-white/[0.04] px-2.5 text-[11px] text-zinc-200 outline-none placeholder:text-zinc-500" />
          <p className="text-[10px] leading-relaxed text-zinc-500">Fish Audio usará tu Reference ID para sintetizar la voz de Astra.</p>
        </>}

        <Toggle
          label="Voz de respuesta"
          hint={tts ? "síntesis del sistema" : "no disponible aquí"}
          checked={settings.tts && tts}
          disabled={!tts}
          onChange={(v) => onChange({ tts: v })}
        />
        <Toggle
          label="Tono de aviso"
          hint="blip de sistema antes de hablar"
          checked={settings.chime}
          onChange={(v) => onChange({ chime: v })}
        />

        <button
          onClick={onTestVoice}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/20 bg-white/[0.04] py-1.5 text-[11.5px] text-zinc-100 transition-colors hover:bg-white/10"
        >
          <Play className="h-3.5 w-3.5" />
          Probar voz
        </button>
        <button
          onClick={async () => {
            try {
              let fishApiKey = settings.fishApiKey.trim();
              if (settings.voiceProvider === "fish" && fishApiKey && isTauri()) {
                await invoke("fish_save_key", { key: fishApiKey });
                setFishSaved(true);
                fishApiKey = "";
                onChange({ fishApiKey: "" });
              }
              localStorage.setItem("cube-ai:settings", JSON.stringify({ ...settings, fishApiKey, apiKey: settings.provider === "gemini" ? "" : settings.apiKey }));
              setSavedNotice("Configuración guardada");
              window.setTimeout(() => setSavedNotice(""), 2200);
            } catch (error) { setSavedNotice(error instanceof Error ? error.message : "No se pudo guardar"); }
          }}
          className="w-full rounded-lg border border-cyan-300/30 bg-cyan-300/10 py-1.5 text-[11.5px] text-cyan-100 transition-colors hover:bg-cyan-300/20"
        >
          Guardar configuración
        </button>
        {savedNotice && <p role="status" className="text-center text-[10px] text-emerald-300">{savedNotice}</p>}

        <div className="h-px bg-white/[0.07]" />
        <SectionTitle>Diagnóstico de Astra</SectionTitle>
        <div className="space-y-1 rounded-xl border border-white/[0.07] bg-white/[0.025] p-2 text-[10px]">
          <DiagnosticRow label="Motor local" ok={stt} value={stt ? "Vosk / micrófono disponible" : "No disponible"} />
          <DiagnosticRow label="Voz del sistema" ok={tts} value={tts ? "SpeechSynthesis disponible" : "No disponible"} />
          <DiagnosticRow label="Fish Audio" ok={settings.voiceProvider !== "fish" || ((!!settings.fishApiKey.trim() || fishSaved) && !!settings.fishReferenceId.trim())} value={settings.voiceProvider === "fish" ? ((settings.fishApiKey.trim() || fishSaved) && settings.fishReferenceId.trim() ? "Configurado" : "Falta API key o Reference ID") : "No seleccionado"} />
          <DiagnosticRow label="LLM" ok={settings.provider === "local" || !!settings.apiKey.trim() || settings.provider === "gemini"} value={settings.provider === "local" ? "Sin LLM" : settings.provider === "gemini" ? "Google Gemini" : settings.apiKey.trim() ? `${settings.provider} configurado` : "Falta API key"} />
          <DiagnosticRow label="Manos libres" ok={handsFree === "active" || handsFree === "paused"} value={handsFree} />
        </div>

        <div className="h-px bg-white/[0.07]" />

        {/* ---------- escucha e iniciativa ---------- */}
        <SectionTitle>Escucha e iniciativa</SectionTitle>
        <p className="text-[11px] leading-relaxed text-zinc-400">Di «Astra» o «Hey Astra», espera a «Te escucho…» y habla. El audio se reconoce localmente en español.</p>
        {voiceError && <p role="alert" className="text-[11px] text-amber-300">{voiceError}</p>}

        <Toggle
          label="Manos libres"
          hint={stt ? HF_HINT[settings.handsFree ? handsFree : "off"] : HF_HINT.unsupported}
          checked={settings.handsFree && stt}
          disabled={!stt}
          onChange={(v) => onChange({ handsFree: v })}
          live={settings.handsFree && handsFree === "active"}
        />
        {settings.handsFree && (handsFree === "denied" || handsFree === "unsupported" || handsFree === "starting") && (
          <button
            onClick={onRetryHandsFree}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/20 bg-white/[0.04] py-1.5 text-[11.5px] text-zinc-100 transition-colors hover:bg-white/10"
          >
            <Mic className="h-3.5 w-3.5" />
            Reintentar micrófono
          </button>
        )}

        <Row label="Iniciativa" hint={INITIATIVE_HINT[settings.initiative]}>
          <Segmented
            value={settings.initiative}
            options={[
              { value: "off", label: "Off" },
              { value: "low", label: "Baja" },
              { value: "high", label: "Alta" },
            ]}
            onChange={(v) => onChange({ initiative: v })}
          />
        </Row>

        <Row label="Idioma" hint="reconocimiento y voz">
          <Segmented
            value={settings.lang}
            options={[
              { value: "es-ES", label: "ES" },
              { value: "en-US", label: "EN" },
            ]}
            onChange={(v) => onChange({ lang: v, voiceURI: null })}
          />
        </Row>

        <div className="h-px bg-white/[0.07]" />

        {/* ---------- apariencia ---------- */}
        <SectionTitle>Apariencia</SectionTitle>

        <Row label="Tamaño" hint={`${settings.size} px`}>
          <Segmented
            value={settings.size}
            options={[
              { value: 48, label: "S" },
              { value: 64, label: "M" },
              { value: 80, label: "L" },
            ]}
            onChange={(v) => onChange({ size: v })}
          />
        </Row>
        <Toggle
          label="Animación en reposo"
          hint="flotación sutil"
          checked={settings.idleMotion}
          onChange={(v) => onChange({ idleMotion: v })}
        />
        <Toggle
          label="Controles mini"
          hint="◉ ▼ bajo el mascot"
          checked={settings.showControls}
          onChange={(v) => onChange({ showControls: v })}
        />

        <div className="h-px bg-white/[0.07]" />

        <div className="space-y-1.5 text-[11px] text-zinc-400">
          <Fact k="Palabra clave" v={meta.wake} />
          <Fact k="Micrófono" v={micMode === "real" ? "real" : micMode === "demo" ? "demo (frases de ejemplo)" : "pendiente"} />
          <Fact k="Atajo" v="Ctrl + Espacio" />
          <Fact k="Ventana" v="transparente · always-on-top" dim="Tauri" />
        </div>

        <button
          onClick={onResetPosition}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/10 py-1.5 text-[11.5px] text-zinc-300 transition-colors hover:bg-white/[0.08] hover:text-white"
        >
          <Crosshair className="h-3.5 w-3.5" />
          Restablecer posición
        </button>
      </div>
    </section>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <div className="text-[9.5px] uppercase tracking-[0.24em] text-zinc-500">{children}</div>;
}

function DiagnosticRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return <div className="flex items-center gap-2"><span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-emerald-400" : "bg-amber-300"}`} /><span className="w-[92px] text-zinc-500">{label}</span><span className="min-w-0 truncate text-zinc-300">{value}</span></div>;
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0 leading-tight">
        <div className="text-[12px] text-zinc-200">{label}</div>
        {hint && <div className="truncate text-[10px] text-zinc-500">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

function Fact({ k, v, dim }: { k: string; v: string; dim?: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="shrink-0 text-zinc-500">{k}</span>
      <span className="truncate text-right text-zinc-300">
        {v}
        {dim && (
          <span className="ml-1 rounded border border-white/10 px-1 text-[9px] uppercase tracking-wider text-zinc-500">{dim}</span>
        )}
      </span>
    </div>
  );
}

function Segmented<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex shrink-0 rounded-lg border border-white/10 bg-white/[0.03] p-0.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          onClick={() => onChange(o.value)}
          className={cn(
            "min-w-[30px] rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors",
            o.value === value ? "bg-white text-zinc-900" : "text-zinc-400 hover:text-white",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  disabled,
  live,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  /** Punto parpadeante junto al interruptor (escucha en vivo). */
  live?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Row label={label} hint={hint}>
      <div className="flex shrink-0 items-center gap-2">
        {live && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white shadow-[0_0_6px_#fff]" />}
        <button
          role="switch"
          aria-checked={checked}
          disabled={disabled}
          onClick={() => onChange(!checked)}
          className={cn(
            "relative h-5 w-9 rounded-full border transition-colors disabled:opacity-40",
            checked ? "border-white bg-white" : "border-white/15 bg-white/[0.06]",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 h-3.5 w-3.5 rounded-full transition-all",
              checked ? "left-[18px] bg-zinc-900" : "left-0.5 bg-zinc-400",
            )}
          />
        </button>
      </div>
    </Row>
  );
}
