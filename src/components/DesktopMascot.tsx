import { useEffect, useRef, useState, type PointerEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { MessageSquare, Mic, Settings2, EyeOff, Power, X } from "lucide-react";
import { CubeMascot } from "./CubeMascot";
import { MiniChat } from "./MiniChat";
import { SettingsPanel } from "./SettingsPanel";
import type { CubeAgent } from "@/hooks/useCubeAgent";
import type { Settings } from "@/types";

interface Props {
  agent: CubeAgent;
  settings: Settings;
  onSettingsChange: (patch: Partial<Settings>) => void;
}
type Panel = "chat" | "settings" | "menu" | null;
// Serialize changes so an old resize cannot arrive after a newer collapse.
let layoutQueue = Promise.resolve();

export function DesktopMascot({ agent, settings, onSettingsChange }: Props) {
  const [panel, setPanel] = useState<Panel>(null);
  const [error, setError] = useState("");
  const [reset, setReset] = useState(0);
  const started = useRef(false);
  const pointer = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const clickTimer = useRef<number | undefined>(undefined);
  const compact = settings.size + 24;
  const notice = !panel && (!!agent.bubble || agent.state === "listening" || !!error);
  const width = panel || notice ? 336 : compact;
  const height = panel === "settings" ? 640 : panel === "chat" ? 540 : panel === "menu" ? 356 : notice ? 280 : compact;

  useEffect(() => {
    const initial = !started.current;
    started.current = true;
    layoutQueue = layoutQueue.then(async () => {
      await invoke("desktop_layout", { width, height, reset: initial || reset > 0 });
      if (initial) await getCurrentWindow().show();
    }).catch((e: unknown) => setError(`No pude ajustar la ventana: ${String(e)}`));
    // Reset is consumed once; normal layouts keep the current mascot anchor.
    if (reset > 0) setReset(0);
  }, [width, height, reset]);

  useEffect(() => {
    let cancelled = false;
    const registration = listen<string>("cube-desktop", ({ payload }) => {
      if (!cancelled) setPanel(payload === "chat" || payload === "settings" ? payload : null);
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setPanel(null); setError(""); agent.dismissBubble(); }
      if (e.key === " " && e.ctrlKey) { e.preventDefault(); void agent.toggleListening(); }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      cancelled = true;
      void registration.then((unlisten) => unlisten());
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(clickTimer.current);
    };
  }, [agent.dismissBubble, agent.toggleListening]);

  const drag = (e: PointerEvent<HTMLButtonElement>) => {
    const p = pointer.current;
    if (!p || p.moved || !(e.buttons & 1) || Math.hypot(e.screenX - p.x, e.screenY - p.y) < 5) return;
    p.moved = true;
    suppressClick.current = true;
    window.clearTimeout(clickTimer.current);
    // Do not capture the pointer or move the HTML element: Windows moves the window.
    void getCurrentWindow().startDragging().catch((reason: unknown) => {
      setError(`No pude mover CUBE: ${String(reason)}`);
    });
  };

  return <div className="desktop-mascot" style={{ "--mascot-space": `${compact}px` } as React.CSSProperties}>
    {panel === "chat" && <MiniChat agent={agent} persona={settings.persona} style={{}} onClose={() => setPanel(null)} onOpenSettings={() => setPanel("settings")} />}
    {panel === "settings" && <SettingsPanel settings={settings} onChange={onSettingsChange} style={{}}
      micMode={agent.micMode} handsFree={agent.handsFree} voiceError={agent.voiceError}
      onRetryHandsFree={() => { onSettingsChange({ handsFree: true }); agent.retryHandsFree(); }}
      onTestVoice={agent.testVoice} onResetPosition={() => setReset((n) => n + 1)} onClose={() => setPanel(null)} />}
    {panel === "menu" && <section className="desktop-menu" aria-label="Menú de CUBE">
      <button onClick={() => setPanel("chat")}><MessageSquare size={16} /> Chat</button>
      <button onClick={() => { setPanel(null); void agent.toggleListening(); }}><Mic size={16} /> Hablar ahora</button>
      <button onClick={() => setPanel("settings")}><Settings2 size={16} /> Configuración y micrófono</button>
      <button onClick={() => { setPanel(null); agent.dismissBubble(); void getCurrentWindow().hide(); }}><EyeOff size={16} /> Ocultar en bandeja</button>
      <button onClick={() => void invoke("desktop_quit")}><Power size={16} /> Salir de CUBE</button>
      <button onClick={() => setPanel(null)}><X size={16} /> Cerrar menú</button>
    </section>}
    {notice && <section className="desktop-notice" aria-live="polite">
      <button className="float-right ml-2 text-zinc-400" aria-label="Cerrar aviso" onClick={() => { setError(""); agent.dismissBubble(); if (agent.state === "listening") agent.interrupt(); }}><X size={16} /></button>
      <p>{error || (agent.state === "listening" ? agent.transcript || "Te escucho…" : agent.bubble?.text)}</p>
      {agent.bubble?.quickReplies && <div className="mt-3 flex gap-4"><button onClick={() => agent.quickReply(true)}>Sí</button><button onClick={() => agent.quickReply(false)}>No</button></div>}
    </section>}
    <button className="desktop-icon" aria-label="CUBE: arrastra para mover; doble clic para chat; clic derecho para menú"
      title={agent.handsFree === "active" ? "Di Rafael o Hey CUBE · Doble clic: chat · Clic derecho: menú" : "CUBE · Clic derecho: configuración y micrófono"}
      style={{ width: settings.size, height: settings.size }}
      onPointerDown={(e) => { if (e.button === 0) { pointer.current = { x: e.screenX, y: e.screenY, moved: false }; suppressClick.current = false; } }}
      onPointerMove={drag} onPointerUp={() => { pointer.current = null; }} onPointerCancel={() => { pointer.current = null; }}
      onClick={(e) => {
        if (suppressClick.current) return;
        window.clearTimeout(clickTimer.current);
        if (e.detail > 1) setPanel("chat");
        else clickTimer.current = window.setTimeout(() => setPanel((p) => p ? null : "menu"), 250);
      }}
      onContextMenu={(e) => { e.preventDefault(); window.clearTimeout(clickTimer.current); setPanel("menu"); }}>
      <CubeMascot state={agent.state} size={settings.size} idleMotion={settings.idleMotion} />
      {agent.state === "listening" && <span className="absolute inset-0 animate-pulse rounded-full border-2 border-cyan-300" />}
      {(agent.handsFree === "denied" || agent.handsFree === "unsupported") && <span className="absolute right-0 top-0 h-2 w-2 rounded-full bg-amber-400" title="Revisa el micrófono en Configuración" />}
    </button>
  </div>;
}
