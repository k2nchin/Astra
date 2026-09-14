import { useCallback, useEffect, useRef, useState } from "react";
import type { Toast } from "@/components/Desktop";
import { FloatingAgent } from "@/components/FloatingAgent";
import { DesktopMascot } from "@/components/DesktopMascot";
import { useCubeAgent } from "@/hooks/useCubeAgent";
import { useProactive } from "@/hooks/useProactive";
import { enable as enableAutostart } from "@tauri-apps/plugin-autostart";
import { check } from "@tauri-apps/plugin-updater";
import { installAudioUnlock } from "@/lib/audio";
import { isTauriRuntime } from "@/lib/actions";
import { GEMINI_MODEL } from "@/lib/gemini";
import { DEFAULT_SETTINGS, type AgentAction, type Settings } from "@/types";

const SETTINGS_KEY = "cube-ai:settings";
const HINT_KEY = "cube-ai:hint-dismissed";

/** Relaciona la acción del cerebro con el icono de la barra (simulación del PC). */
const APP_IDS: Array<[RegExp, string]> = [
  [/visual studio code/i, "vscode"],
  [/spotify/i, "spotify"],
  [/navegador/i, "browser"],
  [/explorador|resultado/i, "explorer"],
  [/terminal/i, "terminal"],
  [/blender/i, "blender"],
];

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const saved = { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>), persona: "cube" as const };
      if (saved.provider === "groq" && (saved.model === "llama-3.1-8b-instant" || !saved.model)) saved.model = "openai/gpt-oss-20b";
      if (localStorage.getItem("cube-ai:gemini-v1") !== "1") {
        if (saved.provider === "local" && !saved.apiKey) {
          saved.provider = "gemini"; saved.model = GEMINI_MODEL; saved.apiBaseUrl = "";
        }
        localStorage.setItem("cube-ai:gemini-v1", "1");
      }
      if (localStorage.getItem("cube-ai:compact-v2") !== "1") {
        saved.showControls = false;
        saved.initiative = "off";
        saved.handsFree = true;
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...saved, apiKey: saved.provider === "gemini" ? "" : saved.apiKey }));
        localStorage.setItem("cube-ai:compact-v2", "1");
      }
      return saved;
    }
  } catch {
    /* ignore */
  }
  try { localStorage.setItem("cube-ai:gemini-v1", "1"); } catch { /* Storage can be unavailable in previews. */ }
  return DEFAULT_SETTINGS;
}

function actionDetail(a: AgentAction) {
  switch (a.type) {
    case "open_app":
      return "Acción sobre el PC · simulada en el prototipo";
    case "media":
      return "Control multimedia · simulado";
    case "search_files":
      return "Búsqueda en el sistema · simulada";
    case "system":
      return /captura/i.test(a.label) ? "Captura de pantalla en curso" : "Acción de sistema · simulada";
    case "reminder":
      return a.payload?.delayMs ? "Recordatorio programado · CUBE te avisará" : "Aviso de CUBE";
    case "settings":
      return "Ajuste aplicado por voz";
    case "info":
      return "Consulta resuelta en local";
    case "llm":
      return "Se conectará al modelo de lenguaje";
  }
}

export default function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [running, setRunning] = useState(true);
  const [visible, setVisible] = useState(true);
  const [session, setSession] = useState(1);
  const [hint, setHint] = useState(() => localStorage.getItem(HINT_KEY) !== "1");
  const [, setToast] = useState<Toast | null>(null);
  const [openApps, setOpenApps] = useState<string[]>(["browser"]);
  const openAppsRef = useRef(openApps);
  openAppsRef.current = openApps;
  const toastTimer = useRef<number | null>(null);

  const active = running && (isTauriRuntime() || visible);

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...settings, apiKey: settings.provider === "gemini" ? "" : settings.apiKey }));
  }, [settings]);

  // El tono de aviso (WebAudio) necesita un gesto previo del usuario.
  useEffect(() => installAudioUnlock(), []);

  // En la versión de escritorio, CUBE queda registrado para iniciar con Windows.
  useEffect(() => {
    if (!isTauriRuntime() || import.meta.env.DEV) return;
    void enableAutostart().catch(() => {
      // En modo navegador/demo el plugin no está disponible.
    });
  }, []);

  // Las actualizaciones solo se descargan desde el endpoint HTTPS firmado de GitHub.
  useEffect(() => {
    if (!isTauriRuntime() || import.meta.env.DEV) return;
    let cancelled = false;
    void (async () => {
      try {
        const update = await check();
        if (update && !cancelled) await update.downloadAndInstall();
      } catch {
        // La ausencia de Internet o de un release no afecta al arranque normal.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const pushToast = useCallback((t: Omit<Toast, "id">, ttl = 4200) => {
    setToast({ ...t, id: Math.random().toString(36).slice(2) });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), ttl);
  }, []);

  /** Aquí es donde, en Tauri, Rust ejecutaría la acción real sobre el PC. */
  const onAction = useCallback(
    (action: AgentAction) => {
      const appId = APP_IDS.find(([re]) => re.test(action.label))?.[1];
      const add = (id: string) => setOpenApps((a) => (a.includes(id) ? a : [...a, id]));
      if (action.type === "open_app" && appId) add(appId);
      if (action.type === "media") add("spotify");
      if (action.type === "search_files") add("explorer");
      pushToast({ text: action.label, detail: actionDetail(action) + (isTauriRuntime() ? " · ejecutada" : " · modo demo") }, 3600);
    },
    [pushToast],
  );

  const agent = useCubeAgent({ settings, active, onAction });

  useProactive({
    say: agent.say,
    enabled: active,
    level: settings.initiative,
    persona: settings.persona,
    handsFree: agent.handsFree,
    sessionId: session,
    getOpenApps: () => openAppsRef.current,
  });

  const patchSettings = useCallback((patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch, persona: "cube" })), []);

  const dismissHint = useCallback(() => {
    setHint(false);
    localStorage.setItem(HINT_KEY, "1");
  }, []);

  const show = useCallback(() => {
    setVisible(true);
    agent.wake();
  }, [agent]);

  const hide = useCallback(() => {
    agent.interrupt();
    setVisible(false);
    pushToast({
      text: "CUBE sigue en segundo plano",
      detail: "Pulsa su icono en la bandeja para mostrarlo.",
      action: { label: "Mostrar", onClick: () => show() },
    });
  }, [agent, pushToast, show]);

  const relaunch = useCallback(() => {
    setSession((s) => s + 1);
    setRunning(true);
    show();
    setToast(null);
  }, [show]);

  const exit = useCallback(async () => {
    await agent.powerOff();
    setRunning(false);
    setVisible(false);
    pushToast(
      {
        text: "Astra se ha cerrado",
        detail: "Doble clic en el icono del escritorio para volver a abrirlo.",
        action: { label: "Reabrir", onClick: relaunch },
      },
      8000,
    );
  }, [agent, pushToast, relaunch]);

  if (isTauriRuntime()) return <DesktopMascot agent={agent} settings={settings} onSettingsChange={patchSettings} />;

  return (
    <div className="relative h-full w-full overflow-visible bg-transparent">
      {running && visible && (
        <FloatingAgent
          agent={agent}
          settings={settings}
          onSettingsChange={patchSettings}
          onHide={hide}
          onExit={() => void exit()}
          hint={hint}
          onDismissHint={dismissHint}
        />
      )}
    </div>
  );
}
