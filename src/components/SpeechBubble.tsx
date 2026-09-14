import { useEffect, useState, type CSSProperties } from "react";
import { Sparkles, X } from "lucide-react";
import { ActionChip } from "./ActionChip";
import { AudioWave } from "./AudioWave";
import { readingTime } from "@/lib/speech";
import { cn } from "@/utils/cn";
import type { Bubble } from "@/types";

interface Props {
  bubble: Bubble;
  /** Mientras CUBE habla, el texto se va escribiendo. */
  typing: boolean;
  placement: "above" | "below";
  /** Posición X de la cola respecto al borde izquierdo de la burbuja. */
  tailX: number;
  style: CSSProperties;
  width: number;
  /** Si CUBE está esperando tu respuesta por voz, se muestra aquí la transcripción. */
  listeningText?: string | null;
  /** Etiquetas de aprobación / rechazo (según personalidad). */
  quickLabels?: [string, string];
  onQuickReply?: (yes: boolean) => void;
  onClose: () => void;
}

function useTypewriter(text: string, key: string, enabled: boolean) {
  const [shown, setShown] = useState(enabled ? "" : text);

  useEffect(() => {
    if (!enabled) {
      setShown(text);
      return;
    }
    setShown("");
    const total = readingTime(text) * 0.8;
    const step = Math.max(10, Math.min(38, total / Math.max(1, text.length)));
    let i = 0;
    const iv = window.setInterval(() => {
      i += 1;
      setShown(text.slice(0, i));
      if (i >= text.length) window.clearInterval(iv);
    }, step);
    return () => window.clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Si deja de hablar antes de terminar de escribir, completar.
  useEffect(() => {
    if (!enabled) setShown(text);
  }, [enabled, text]);

  return shown;
}

export function SpeechBubble({
  bubble,
  typing,
  placement,
  tailX,
  style,
  width,
  listeningText,
  quickLabels = ["Sí", "No"],
  onQuickReply,
  onClose,
}: Props) {
  const shown = useTypewriter(bubble.text, bubble.id, typing);
  const done = shown.length >= bubble.text.length;
  const waiting = listeningText !== undefined && listeningText !== null;

  return (
    <div
      className="animate-pop fixed z-[60]"
      style={{ ...style, width, transformOrigin: placement === "above" ? "bottom center" : "top center" }}
      role="status"
      aria-live="polite"
    >
      <div className="group relative rounded-2xl border border-white/10 bg-zinc-900/90 px-3.5 py-2.5 text-[13px] leading-snug text-zinc-100 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.8)] backdrop-blur-xl">
        <button
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute -right-1.5 -top-1.5 hidden h-5 w-5 place-items-center rounded-full border border-white/10 bg-zinc-800 text-zinc-400 hover:text-white group-hover:grid"
        >
          <X className="h-3 w-3" />
        </button>

        {bubble.proactive && (
          <div className="mb-1 flex items-center gap-1 text-[9px] uppercase tracking-[0.22em] text-zinc-500">
            <Sparkles className="h-2.5 w-2.5" />
            iniciativa
          </div>
        )}

        <p className="whitespace-pre-wrap">
          {shown}
          {!done && <span className="animate-caret ml-px inline-block h-[13px] w-[1.5px] translate-y-[2px] bg-white" />}
        </p>

        {bubble.action && (done || !typing) && (
          <div className="animate-fade-up mt-2 flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">acción</span>
            <ActionChip action={bubble.action} />
          </div>
        )}

        {bubble.quickReplies && done && onQuickReply && (
          <div className="animate-fade-up mt-2 flex items-center gap-1.5">
            <button
              onClick={() => onQuickReply(true)}
              className="rounded-full bg-white px-3 py-1 text-[11px] font-medium tracking-wide text-zinc-900 transition-opacity hover:opacity-90"
            >
              {quickLabels[0]}
            </button>
            <button
              onClick={() => onQuickReply(false)}
              className="rounded-full border border-white/15 px-3 py-1 text-[11px] tracking-wide text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
            >
              {quickLabels[1]}
            </button>
            {waiting && (
              <span className="ml-auto flex max-w-[45%] items-center gap-1.5 truncate text-[10.5px] text-zinc-400">
                <AudioWave height={9} />
                <span className="truncate">{listeningText || "te escucho…"}</span>
              </span>
            )}
          </div>
        )}

        {/* cola */}
        <span
          aria-hidden
          className={cn(
            "absolute h-3 w-3 rotate-45 border-white/10 bg-zinc-900/90",
            placement === "above" ? "-bottom-[7px] border-b border-r" : "-top-[7px] border-l border-t",
          )}
          style={{ left: Math.max(12, Math.min(width - 24, tailX - 6)) }}
        />
      </div>
    </div>
  );
}
