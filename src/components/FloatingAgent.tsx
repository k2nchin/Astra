import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import {
  Bell,
  BellOff,
  ChevronDown,
  EyeOff,
  MessageSquare,
  Mic,
  MoonStar,
  Power,
  Settings2,
  Square,
} from "lucide-react";
import { CubeMascot } from "./CubeMascot";
import { AudioWave } from "./AudioWave";
import { SpeechBubble } from "./SpeechBubble";
import { ContextMenu, type MenuItem } from "./ContextMenu";
import { MiniChat, CHAT_H, CHAT_W } from "./MiniChat";
import { SettingsPanel, SETTINGS_H, SETTINGS_W } from "./SettingsPanel";
import { useDraggable } from "@/hooks/useDraggable";
import { useViewport } from "@/hooks/useViewport";
import type { CubeAgent } from "@/hooks/useCubeAgent";
import { PERSONAS } from "@/lib/persona";
import { cn } from "@/utils/cn";
import type { Settings } from "@/types";

const TASKBAR = 48;
const BUBBLE_W = 256;
const HINT_W = 244;

interface Props {
  agent: CubeAgent;
  settings: Settings;
  onSettingsChange: (patch: Partial<Settings>) => void;
  onHide: () => void;
  onExit: () => void;
  hint: boolean;
  onDismissHint: () => void;
}

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

export function FloatingAgent({ agent, settings, onSettingsChange, onHide, onExit, hint, onDismissHint }: Props) {
  const {
    state,
    bubble,
    transcript,
    toggleListening,
    dismissBubble,
    micMode,
    handsFree,
    dnd,
    toggleDnd,
    quickReply,
    retryHandsFree,
    testVoice,
  } = agent;
  const persona = PERSONAS[settings.persona];
  const size = settings.size;
  const controlsH = settings.showControls ? 28 : 0;
  const boxW = Math.max(size, 76);
  const boxH = size + controlsH;

  const hf = handsFree === "active" || handsFree === "paused" || handsFree === "starting";
  const hfLive = handsFree === "active";

  const { vw, vh } = useViewport();
  const initial = useCallback(
    (w: number, h: number) => ({ x: w - boxW - 40, y: h - boxH - TASKBAR - 110 }),
    [boxW, boxH],
  );
  const { pos, dragging, wasDragRef, resetPosition, handlers } = useDraggable({
    width: boxW,
    height: boxH,
    bottomInset: 0,
    storageKey: "cube-ai:pos",
    initial,
  });

  const [chatOpen, setChatOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const clickTimer = useRef<number | null>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);

  const openChat = useCallback(() => {
    setSettingsOpen(false);
    setChatOpen(true);
    onDismissHint();
  }, [onDismissHint]);

  const openSettings = useCallback(() => {
    setChatOpen(false);
    setSettingsOpen(true);
    onDismissHint();
  }, [onDismissHint]);

  const allowMic = useCallback(() => {
    onSettingsChange({ handsFree: true });
    retryHandsFree();
  }, [onSettingsChange, retryHandsFree]);

  // Clic simple → voz · doble clic → chat (usamos e.detail para no duplicar).
  const onMascotClick = (e: MouseEvent) => {
    if (wasDragRef.current) return;
    onDismissHint();
    if (e.detail >= 2) {
      if (clickTimer.current) window.clearTimeout(clickTimer.current);
      clickTimer.current = null;
      openChat();
      return;
    }
    if (clickTimer.current) window.clearTimeout(clickTimer.current);
    clickTimer.current = window.setTimeout(() => {
      clickTimer.current = null;
      void toggleListening();
    }, 250);
  };

  const onContext = (e: MouseEvent) => {
    e.preventDefault();
    onDismissHint();
    setMenu({ x: e.clientX, y: e.clientY });
  };

  const openMenuFromButton = () => {
    const r = menuBtnRef.current?.getBoundingClientRect();
    if (r) setMenu({ x: r.left - 60, y: r.bottom + 8 });
  };

  // Atajos: Ctrl+Espacio (voz) · Esc (cerrar)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " " && e.ctrlKey) {
        e.preventDefault();
        void toggleListening();
      } else if (e.key === "Escape") {
        setMenu(null);
        setChatOpen(false);
        setSettingsOpen(false);
        dismissBubble();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleListening, dismissBubble]);

  /* ---------- colocación de popovers ---------- */
  const cx = pos.x + boxW / 2;
  const onRight = cx > vw / 2;
  const onBottom = pos.y + boxH / 2 > vh / 2;
  const abovePlacement: "above" | "below" = pos.y > 150 ? "above" : "below";

  const anchoredStyle = (w: number) => {
    const left = clamp(cx - w / 2, 8, vw - w - 8);
    return {
      style: abovePlacement === "above" ? { left, bottom: vh - pos.y + 12 } : { left, top: pos.y + boxH + 12 },
      tailX: cx - left,
    };
  };
  const sidePanel = (w: number, h: number) => ({
    left: clamp(onRight ? pos.x - w - 14 : pos.x + boxW + 14, 8, vw - w - 8),
    top: clamp(onBottom ? pos.y + boxH - h : pos.y, 8, vh - h - TASKBAR - 8),
  });

  const bubbleAnchor = anchoredStyle(BUBBLE_W);
  const hintAnchor = anchoredStyle(HINT_W);

  const listening = state === "listening";
  const busy = state === "thinking" || state === "speaking";
  // La burbuja con pregunta se mantiene mientras CUBE espera tu «sí» / «no».
  const bubbleVisible = !!bubble && !chatOpen && (!listening || !!bubble.quickReplies);
  const pillVisible = listening && !chatOpen && !bubbleVisible;
  const listenText = transcript || (hf ? "te escucho…" : micMode === "demo" ? "escuchando (demo)…" : "escuchando…");

  const menuItems: MenuItem[] = [
    { icon: MessageSquare, label: "Chat", hint: "doble clic", onSelect: openChat },
    {
      icon: Mic,
      label: listening ? "Dejar de escuchar" : "Voz",
      hint: hfLive ? persona.wake.split(" o ")[0] : "clic",
      onSelect: () => void toggleListening(),
    },
    {
      icon: dnd ? Bell : BellOff,
      label: dnd ? "Reactivar avisos" : "No molestar",
      hint: dnd ? undefined : "silencia iniciativa",
      onSelect: toggleDnd,
    },
    { icon: Settings2, label: "Configuración", onSelect: openSettings },
    { icon: EyeOff, label: "Ocultar", hint: "bandeja", onSelect: onHide, dividerBefore: true },
    { icon: Power, label: "Salir", onSelect: onExit, danger: true },
  ];

  return (
    <>
      {/* ---------- mascot ---------- */}
      <div
        className={cn(
          "fixed z-[50] flex flex-col items-center transition-[opacity,transform] duration-300",
          state === "off" && "scale-75 opacity-0",
        )}
        style={{ left: pos.x, top: pos.y, width: boxW }}
        onContextMenu={onContext}
      >
        <div
          role="button"
          tabIndex={0}
          aria-label={
            hfLive
              ? "ASTRA — di «Hey Astra» o haz clic para hablar, doble clic para chat"
              : "ASTRA — clic para hablar, doble clic para chat"
          }
          className={cn("relative grid place-items-center outline-none", dragging ? "cursor-grabbing" : "cursor-grab")}
          style={{ width: size, height: size, touchAction: "none" }}
          {...handlers}
          onClick={onMascotClick}
          onKeyDown={(e) => {
            if (e.key === "Enter") void toggleListening();
          }}
        >
          {/* anillos al escuchar */}
          {listening && (
            <>
              <span className="animate-ring pointer-events-none absolute inset-1 rounded-full border border-white/50" />
              <span
                className="animate-ring pointer-events-none absolute inset-1 rounded-full border border-white/30"
                style={{ animationDelay: "0.55s" }}
              />
            </>
          )}
          {state === "thinking" && (
            <span className="pointer-events-none absolute inset-0 rounded-full bg-white/[0.06] blur-md" />
          )}
          <div
            className={cn(
              "transition-transform duration-200",
              !dragging && "hover:scale-[1.06]",
              dragging && "scale-[1.08]",
            )}
          >
            <CubeMascot state={state} size={size} idleMotion={settings.idleMotion && !dragging} tone={persona.eyeTone} />
          </div>

          {/* insignia no molestar */}
          {dnd && (
            <span
              title="No molestar"
              className="pointer-events-none absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full border border-white/10 bg-zinc-900 text-zinc-300 shadow"
            >
              <MoonStar className="h-2.5 w-2.5" />
            </span>
          )}
        </div>

        {/* ---------- controles mini ◉ ▼ ---------- */}
        {settings.showControls && (
          <div className="mt-1 flex h-6 items-center gap-1.5">
            <button
              onClick={() => void toggleListening()}
              aria-label={listening ? "Dejar de escuchar" : busy ? "Interrumpir" : "Hablar con CUBE"}
              title={
                listening
                  ? "Dejar de escuchar"
                  : busy
                    ? "Interrumpir"
                    : hfLive
                      ? "Escuchando «Hey Astra» · clic para hablar (Ctrl+Espacio)"
                      : "Hablar (Ctrl+Espacio)"
              }
              className={cn(
                "relative grid h-[22px] w-[22px] place-items-center rounded-full border border-white/15 bg-zinc-900/80 text-zinc-300 shadow-lg backdrop-blur transition-all hover:border-white/40 hover:text-white",
                listening &&
                  "border-white bg-white text-zinc-900 shadow-[0_0_14px_rgba(255,255,255,0.55)] hover:text-zinc-900",
              )}
            >
              {busy ? <Square className="h-2.5 w-2.5 fill-current" /> : <Mic className="h-3 w-3" strokeWidth={2.2} />}
              {/* punto de escucha activa */}
              {hf && !listening && (
                <span
                  className={cn(
                    "absolute -right-px -top-px h-[7px] w-[7px] rounded-full border border-zinc-950 bg-white",
                    hfLive ? "animate-pulse shadow-[0_0_6px_#fff]" : "opacity-40",
                  )}
                />
              )}
            </button>

            {listening ? (
              <div className="grid h-[22px] place-items-center rounded-full border border-white/10 bg-zinc-900/80 px-2.5 backdrop-blur">
                <AudioWave height={11} />
              </div>
            ) : (
              <button
                ref={menuBtnRef}
                onClick={openMenuFromButton}
              aria-label="Menú de Astra"
                title="Menú"
                className="grid h-[22px] w-[22px] place-items-center rounded-full border border-white/15 bg-zinc-900/80 text-zinc-300 shadow-lg backdrop-blur transition-all hover:border-white/40 hover:text-white"
              >
                <ChevronDown className="h-3 w-3" strokeWidth={2.2} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* ---------- transcripción mientras escucha ---------- */}
      {pillVisible && (
        <div
          className="animate-fade-up pointer-events-none fixed z-[55] flex justify-center"
          style={{ ...hintAnchor.style, width: HINT_W }}
        >
          <div className="max-w-full truncate rounded-full border border-white/10 bg-zinc-900/85 px-3 py-1 text-[11.5px] text-zinc-200 backdrop-blur">
            {listenText}
          </div>
        </div>
      )}

      {/* ---------- burbuja de respuesta ---------- */}
      {bubbleVisible && bubble && (
        <SpeechBubble
          bubble={bubble}
          typing={state === "speaking"}
          placement={abovePlacement}
          tailX={bubbleAnchor.tailX}
          style={bubbleAnchor.style}
          width={BUBBLE_W}
          listeningText={listening ? transcript : null}
          quickLabels={persona.quick}
          onQuickReply={bubble.quickReplies ? quickReply : undefined}
          onClose={dismissBubble}
        />
      )}

      {/* ---------- pista de primer uso ---------- */}
      {hint && state === "idle" && !bubble && !chatOpen && !settingsOpen && !menu && (
        <div className="animate-fade-up fixed z-[55]" style={{ ...hintAnchor.style, width: HINT_W }}>
          <div className="rounded-xl border border-white/10 bg-zinc-900/85 px-3 py-2 text-[11px] leading-relaxed text-zinc-300 shadow-xl backdrop-blur">
            <div className="mb-1 text-[9.5px] uppercase tracking-[0.22em] text-zinc-500">ASTRA</div>
            {hf ? (
              <>
                Di <b className="font-medium text-white">{persona.wake}</b> y te escucho
              </>
            ) : (
              <>
                <b className="font-medium text-white">Clic</b> hablar
              </>
            )}{" "}
            · <b className="font-medium text-white">Doble clic</b> chat · <b className="font-medium text-white">Clic derecho</b> menú ·{" "}
            <b className="font-medium text-white">Arrastra</b> para mover
            {handsFree === "denied" && (
              <div className="mt-1.5 flex items-center justify-between gap-2 border-t border-white/10 pt-1.5 text-zinc-400">
                <span>Sin micrófono no puedo oír «Hey Astra».</span>
                <button
                  onClick={allowMic}
                  className="shrink-0 rounded-full border border-white/20 px-2 py-0.5 text-[10.5px] text-white hover:bg-white/10"
                >
                  Permitir
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---------- menú ---------- */}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />}

      {/* ---------- chat compacto ---------- */}
      {chatOpen && (
        <MiniChat
          agent={agent}
          persona={settings.persona}
          style={sidePanel(CHAT_W, CHAT_H)}
          onClose={() => setChatOpen(false)}
          onOpenSettings={openSettings}
        />
      )}

      {/* ---------- configuración ---------- */}
      {settingsOpen && (
        <SettingsPanel
          settings={settings}
          onChange={onSettingsChange}
          micMode={micMode}
          handsFree={handsFree}
          onRetryHandsFree={allowMic}
          onTestVoice={testVoice}
          style={sidePanel(SETTINGS_W, SETTINGS_H)}
          onResetPosition={resetPosition}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </>
  );
}
