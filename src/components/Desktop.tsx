import { useEffect, useState, type ReactNode } from "react";
import {
  Battery,
  Box,
  Code2,
  Folder,
  Globe,
  LayoutGrid,
  Monitor,
  Music2,
  Search,
  Terminal,
  Volume2,
  Wifi,
  X,
} from "lucide-react";
import { CubeMascot } from "./CubeMascot";
import { cn } from "@/utils/cn";
import type { AgentState } from "@/types";

export interface Toast {
  id: string;
  text: string;
  detail?: string;
  action?: { label: string; onClick: () => void };
}

export const TASKBAR_APPS = [
  { id: "explorer", label: "Explorador", icon: Folder },
  { id: "browser", label: "Navegador", icon: Globe },
  { id: "vscode", label: "Visual Studio Code", icon: Code2 },
  { id: "spotify", label: "Spotify", icon: Music2 },
  { id: "terminal", label: "Terminal", icon: Terminal },
  { id: "blender", label: "Blender", icon: Box },
] as const;

interface Props {
  running: boolean;
  visible: boolean;
  agentState: AgentState;
  eyeTone?: "neutral" | "ice";
  openApps: string[];
  toast: Toast | null;
  note: boolean;
  onDismissNote: () => void;
  onDismissToast: () => void;
  onToggleCube: () => void;
  onLaunchCube: () => void;
  children?: ReactNode;
}

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const iv = window.setInterval(() => setNow(new Date()), 15000);
    return () => window.clearInterval(iv);
  }, []);
  return now;
}

export function Desktop({
  running,
  visible,
  agentState,
  eyeTone = "neutral",
  openApps,
  toast,
  note,
  onDismissNote,
  onDismissToast,
  onToggleCube,
  onLaunchCube,
  children,
}: Props) {
  const now = useClock();
  const time = now.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  const date = now.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0a0a0c] text-zinc-100" onContextMenu={(e) => e.preventDefault()}>
      {/* ---------- fondo de pantalla ---------- */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-[10%] -top-[20%] h-[70%] w-[55%] rounded-full bg-white/[0.05] blur-[120px]" />
        <div className="absolute -bottom-[25%] right-[5%] h-[70%] w-[50%] rounded-full bg-zinc-400/[0.07] blur-[140px]" />
        <div className="absolute left-[35%] top-[30%] h-[40%] w-[30%] rotate-[25deg] rounded-full bg-white/[0.025] blur-[90px]" />
        <div
          className="absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage: "radial-gradient(rgba(255,255,255,0.09) 0.8px, transparent 0.8px)",
            backgroundSize: "26px 26px",
          }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(0,0,0,0.65))]" />
      </div>

      {/* ---------- iconos del escritorio ---------- */}
      <div className="absolute left-4 top-4 flex flex-col gap-1.5">
        <DesktopIcon label="Este equipo">
          <Monitor className="h-7 w-7 text-zinc-300" strokeWidth={1.4} />
        </DesktopIcon>
        <DesktopIcon label="Proyectos">
          <Folder className="h-7 w-7 text-zinc-300" strokeWidth={1.4} />
        </DesktopIcon>
        <DesktopIcon label="CUBE AI" onDoubleClick={onLaunchCube} title="Doble clic para abrir CUBE AI">
          <CubeMascot state={running ? "idle" : "off"} size={30} ground={false} idleMotion={false} tone={eyeTone} />
        </DesktopIcon>
      </div>

      {/* ---------- nota de prototipo ---------- */}
      {note && (
        <div className="animate-fade-up absolute right-4 top-4 flex max-w-[360px] items-start gap-2.5 rounded-xl border border-white/10 bg-zinc-900/70 px-3 py-2.5 text-[11.5px] leading-relaxed text-zinc-300 backdrop-blur-xl">
          <div className="min-w-0">
            <div className="mb-0.5 text-[9.5px] uppercase tracking-[0.24em] text-zinc-500">Prototipo web · MVP manos libres</div>
            Este fondo simula tu escritorio. CUBE te <span className="text-white">saluda y habla por su cuenta</span>, y con el
            micrófono permitido basta con decir <span className="text-white">«Hey CUBE, abre Blender»</span>: sin clics. En la
            versión <span className="text-white">Tauri</span> solo existirá el mascot (ventana transparente, always-on-top).
          </div>
          <button onClick={onDismissNote} aria-label="Cerrar nota" className="mt-0.5 shrink-0 text-zinc-500 hover:text-white">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* ---------- marca ---------- */}
      <div className="pointer-events-none absolute bottom-16 left-5 select-none">
        <div className="text-[13px] font-semibold tracking-[0.42em] text-zinc-200/90">CUBE AI</div>
        <div className="mt-0.5 text-[9.5px] uppercase tracking-[0.3em] text-zinc-500">Just a small icon. A bigger mind.</div>
      </div>

      {/* capa del agente y demás */}
      {children}

      {/* ---------- toast ---------- */}
      {toast && (
        <div
          key={toast.id}
          className="animate-fade-up absolute bottom-[60px] right-4 z-[90] flex w-[300px] items-start gap-3 rounded-xl border border-white/10 bg-zinc-900/90 p-3 shadow-2xl backdrop-blur-xl"
          role="status"
        >
          <CubeMascot state="idle" size={26} ground={false} idleMotion={false} tone={eyeTone} />
          <div className="min-w-0 flex-1 leading-snug">
            <div className="text-[12px] font-medium text-zinc-100">{toast.text}</div>
            {toast.detail && <div className="mt-0.5 text-[11px] text-zinc-400">{toast.detail}</div>}
            {toast.action && (
              <button
                onClick={toast.action.onClick}
                className="mt-1.5 rounded-md border border-white/15 px-2 py-0.5 text-[11px] text-zinc-200 hover:bg-white/10"
              >
                {toast.action.label}
              </button>
            )}
          </div>
          <button onClick={onDismissToast} aria-label="Cerrar" className="text-zinc-500 hover:text-white">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* ---------- barra de tareas ---------- */}
      <footer className="absolute inset-x-0 bottom-0 z-[95] flex h-12 items-center border-t border-white/[0.06] bg-zinc-950/70 px-3 backdrop-blur-2xl">
        {/* centro */}
        <div className="absolute left-1/2 flex -translate-x-1/2 items-center gap-1">
          <TaskButton label="Inicio">
            <LayoutGrid className="h-[18px] w-[18px] text-zinc-200" strokeWidth={1.6} />
          </TaskButton>
          <TaskButton label="Buscar">
            <Search className="h-[18px] w-[18px] text-zinc-300" strokeWidth={1.6} />
          </TaskButton>
          <div className="mx-1 h-6 w-px bg-white/10" />
          {TASKBAR_APPS.map((a) => (
            <TaskButton key={a.id} label={a.label} running={openApps.includes(a.id)}>
              <a.icon className="h-[18px] w-[18px] text-zinc-300" strokeWidth={1.6} />
            </TaskButton>
          ))}
          {running && (
            <TaskButton label="CUBE AI" running onClick={onLaunchCube}>
              <CubeMascot state={agentState} size={22} ground={false} idleMotion={false} tone={eyeTone} />
            </TaskButton>
          )}
        </div>

        {/* bandeja */}
        <div className="ml-auto flex items-center gap-1 text-zinc-300">
          {running && (
            <button
              onClick={onToggleCube}
              title={visible ? "Ocultar CUBE AI" : "Mostrar CUBE AI"}
              className={cn(
                "grid h-8 w-8 place-items-center rounded-md transition-colors hover:bg-white/10",
                !visible && "opacity-60",
              )}
            >
              <CubeMascot state={visible ? agentState : "off"} size={16} ground={false} idleMotion={false} tone={eyeTone} />
            </button>
          )}
          <div className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-white/10">
            <Wifi className="h-3.5 w-3.5" strokeWidth={1.8} />
            <Volume2 className="h-3.5 w-3.5" strokeWidth={1.8} />
            <Battery className="h-3.5 w-3.5" strokeWidth={1.8} />
          </div>
          <div className="rounded-md px-2 py-1 text-right leading-tight hover:bg-white/10">
            <div className="text-[11.5px] tabular-nums">{time}</div>
            <div className="text-[10px] tabular-nums text-zinc-400">{date}</div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function DesktopIcon({
  label,
  children,
  onDoubleClick,
  title,
}: {
  label: string;
  children: ReactNode;
  onDoubleClick?: () => void;
  title?: string;
}) {
  return (
    <button
      onDoubleClick={onDoubleClick}
      title={title}
      className="flex w-[76px] flex-col items-center gap-1 rounded-md px-1 py-2 text-center transition-colors hover:bg-white/[0.06]"
    >
      <span className="grid h-9 w-9 place-items-center">{children}</span>
      <span className="text-[11px] leading-tight text-zinc-300 [text-shadow:0_1px_2px_rgba(0,0,0,0.8)]">{label}</span>
    </button>
  );
}

function TaskButton({
  label,
  children,
  running,
  onClick,
}: {
  label: string;
  children: ReactNode;
  running?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      title={label}
      aria-label={label}
      onClick={onClick}
      className="relative grid h-9 w-9 place-items-center rounded-md transition-colors hover:bg-white/10"
    >
      {children}
      {running && <span className="absolute bottom-0.5 h-[3px] w-4 rounded-full bg-zinc-300/80" />}
    </button>
  );
}
