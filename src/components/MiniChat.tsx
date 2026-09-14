import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { ArrowUp, Eraser, Mic, Settings2, Square, X } from "lucide-react";
import { CubeMascot } from "./CubeMascot";
import { ActionChip } from "./ActionChip";
import { AudioWave } from "./AudioWave";
import { cn } from "@/utils/cn";
import type { CubeAgent } from "@/hooks/useCubeAgent";
import { PERSONAS } from "@/lib/persona";
import type { AgentState, PersonaId } from "@/types";

export const CHAT_W = 304;
export const CHAT_H = 392;

const STATE_LABEL: Record<AgentState, string> = {
  idle: "en reposo",
  listening: "escuchando…",
  thinking: "pensando…",
  speaking: "respondiendo",
  happy: "contento",
  off: "apagado",
};

const SUGGESTIONS = ["Abre VS Code", "Pon música", "Busca archivo informe", "¿Qué hora es?"];

interface Props {
  agent: CubeAgent;
  persona: PersonaId;
  style: CSSProperties;
  onClose: () => void;
  onOpenSettings: () => void;
}

export function MiniChat({ agent, persona, style, onClose, onOpenSettings }: Props) {
  const meta = PERSONAS[persona];
  const { messages, state, ask, toggleListening, transcript, micMode, clearMessages, bubble, handsFree, quickReply } = agent;
  const hf = handsFree === "active" || handsFree === "paused";
  const statusLabel = state === "idle" && hf ? "escuchando «Hey Astra»" : STATE_LABEL[state];
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length, state]);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const t = text.trim();
    if (!t) return;
    setText("");
    void ask(t);
  };

  const busy = state === "thinking" || state === "speaking";

  return (
    <section
      className="animate-pop fixed z-[70] flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/85 shadow-[0_24px_70px_-16px_rgba(0,0,0,0.9)] backdrop-blur-2xl"
      style={{ ...style, width: CHAT_W, height: CHAT_H }}
      aria-label="Chat con Astra"
      onContextMenu={(e) => e.stopPropagation()}
    >
      {/* header */}
      <header className="flex items-center gap-2 border-b border-white/[0.07] px-3 py-2">
        <CubeMascot state={state} size={22} ground={false} idleMotion={false} tone={meta.eyeTone} />
        <div className="flex-1 leading-tight">
          <div className="text-[11px] font-semibold tracking-[0.28em] text-zinc-100">
            ASTRA
            {persona !== "cube" && (
              <span className="ml-1.5 text-[9px] font-normal tracking-[0.18em] text-zinc-500">· {meta.name.toUpperCase()}</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-zinc-500">
            <span
              className={cn(
                "inline-block h-1.5 w-1.5 rounded-full bg-zinc-600",
                state === "idle" && hf && "animate-pulse bg-zinc-300",
                state === "listening" && "bg-white shadow-[0_0_6px_#fff]",
                state === "thinking" && "animate-pulse bg-zinc-300",
                state === "speaking" && "bg-zinc-200",
              )}
            />
            {statusLabel}
            {micMode === "demo" && <span className="text-zinc-600">· mic demo</span>}
          </div>
        </div>
        <IconBtn label="Limpiar" onClick={clearMessages}>
          <Eraser className="h-3.5 w-3.5" />
        </IconBtn>
        <IconBtn label="Configuración" onClick={onOpenSettings}>
          <Settings2 className="h-3.5 w-3.5" />
        </IconBtn>
        <IconBtn label="Cerrar" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </IconBtn>
      </header>

      {/* messages */}
      <div ref={listRef} className="cube-scroll flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {messages.map((m) => (
          <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-3 py-1.5 text-[12.5px] leading-snug",
                m.role === "user"
                  ? "rounded-br-md bg-white text-zinc-900"
                  : "rounded-bl-md border border-white/[0.07] bg-white/[0.05] text-zinc-100",
              )}
            >
              {m.proactive && (
                <span className="mr-1 text-[10px] text-zinc-500" title="Astra lo dijo por iniciativa propia">
                  ✦
                </span>
              )}
              {m.text}
              {m.simulated && (
                <span className="ml-1 text-[10px] text-zinc-500" title="Frase de demostración (sin micrófono)">
                  · demo
                </span>
              )}
              {m.action && (
                <div className="mt-1.5">
                  <ActionChip action={m.action} />
                </div>
              )}
            </div>
          </div>
        ))}

        {state === "thinking" && (
          <div className="flex justify-start">
            <div className="flex items-center gap-1 rounded-2xl rounded-bl-md border border-white/[0.07] bg-white/[0.05] px-3 py-2">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
          </div>
        )}

        {state === "listening" && (
          <div className="flex justify-end">
            <div className="flex items-center gap-2 rounded-2xl rounded-br-md border border-dashed border-white/20 px-3 py-1.5 text-[12px] text-zinc-300">
              <AudioWave height={10} />
              {transcript || "escuchando…"}
            </div>
          </div>
        )}

        {bubble?.quickReplies && (state === "idle" || state === "listening") && (
          <div className="animate-fade-up flex justify-start gap-1.5 pl-1">
            <button
              onClick={() => quickReply(true)}
              className="rounded-full bg-white px-3 py-1 text-[11px] font-medium tracking-wide text-zinc-900"
            >
              {meta.quick[0]}
            </button>
            <button
              onClick={() => quickReply(false)}
              className="rounded-full border border-white/15 px-3 py-1 text-[11px] tracking-wide text-zinc-300 hover:bg-white/10 hover:text-white"
            >
              {meta.quick[1]}
            </button>
          </div>
        )}

        {messages.length <= 1 && state === "idle" && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => void ask(s)}
                className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-zinc-300 transition-colors hover:bg-white/[0.08] hover:text-white"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* input */}
      <form onSubmit={submit} className="flex items-center gap-1.5 border-t border-white/[0.07] p-2">
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Dile algo a Astra…"
          className="h-8 flex-1 rounded-full border border-white/10 bg-white/[0.04] px-3 text-[12.5px] text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-white/25"
        />
        <button
          type="button"
          onClick={() => void toggleListening()}
          aria-label={state === "listening" ? "Dejar de escuchar" : "Hablar"}
          className={cn(
            "grid h-8 w-8 place-items-center rounded-full border border-white/10 text-zinc-300 transition-colors hover:bg-white/[0.08] hover:text-white",
            state === "listening" && "border-white bg-white text-zinc-900 hover:bg-white",
          )}
        >
          {busy ? <Square className="h-3 w-3" /> : <Mic className="h-3.5 w-3.5" />}
        </button>
        <button
          type="submit"
          disabled={!text.trim()}
          aria-label="Enviar"
          className="grid h-8 w-8 place-items-center rounded-full bg-white text-zinc-900 transition-opacity disabled:opacity-30"
        >
          <ArrowUp className="h-3.5 w-3.5" strokeWidth={2.5} />
        </button>
      </form>
    </section>
  );
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid h-6 w-6 place-items-center rounded-md text-zinc-500 transition-colors hover:bg-white/[0.08] hover:text-white"
    >
      {children}
    </button>
  );
}
