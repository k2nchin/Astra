import { invoke } from "@tauri-apps/api/core";
import type { AgentAction, AgentReply } from "@/types";

interface TauriWindow extends Window {
  __TAURI_INTERNALS__?: unknown;
}

export function isTauriRuntime() {
  return typeof window !== "undefined" && !!(window as TauriWindow).__TAURI_INTERNALS__;
}

/** Ejecuta únicamente acciones estructuradas y permitidas por el backend Tauri. */
export async function executeAction(action: AgentAction): Promise<string | null> {
  if (["reminder", "settings", "info", "llm"].includes(action.type)) return null;
  if (!isTauriRuntime()) throw new Error("Las acciones del PC requieren abrir la aplicación instalada de CUBE.");

  switch (action.type) {
    case "open_app":
      await invoke("open_app", { name: action.label });
      return `Se solicitó abrir ${action.label}.`;
    case "search_files":
      return await invoke<string>("search_files", { query: action.payload?.query ?? action.label });
    case "web_search":
      await invoke("open_url", { url: action.payload?.url ?? "" });
      return `Abrí la búsqueda de «${action.payload?.query ?? action.label}».`;
    case "media":
      await invoke("media_control", { command: action.payload?.command ?? mediaCommand(action.label) });
      return "Control enviado al reproductor activo. Reproducción/pausa alterna el estado actual; debe haber música cargada.";
    case "system":
      if (action.payload?.command === "screenshot" || /captura/i.test(action.label)) {
        return `Captura guardada en ${await invoke<string>("take_screenshot")}`;
      }
      if (["volume_up", "volume_down", "mute"].includes(action.payload?.command ?? "")) {
        await invoke("media_control", { command: action.payload?.command });
        return `Control enviado: ${action.label}.`;
      }
      throw new Error("Ese control de sistema todavía no está disponible. Puedes subir, bajar o silenciar el volumen.");
    case "window":
      await invoke("window_control", { app: action.payload?.app ?? action.label, command: action.payload?.windowCommand ?? "focus" });
      return `Control de ventana aplicado a ${action.payload?.app ?? action.label}.`;
    case "routine": {
      const steps = action.payload?.steps ?? [];
      if (!steps.length || steps.length > 12) throw new Error("La rutina no tiene pasos válidos.");
      for (const step of steps) await executeRoutineStep(step);
      return `Rutina «${action.label}» ejecutada (${steps.length} pasos).`;
    }
    default:
      return null;
  }
}

async function executeRoutineStep(step: string) {
  const text = step.trim().toLowerCase();
  const app = text.match(/^(?:abrir|inicia|iniciar|lanza|lanzar)\s+(.+)$/i)?.[1];
  if (app) {
    const allowed = ["visual studio code", "blender", "photoshop", "spotify", "discord", "steam", "figma", "terminal", "explorador de archivos", "navegador"];
    const target = allowed.find((name) => app.includes(name)) ?? (app.includes("chrome") || app.includes("edge") ? "Navegador" : "");
    if (!target) throw new Error(`Paso no permitido: ${step}`);
    await invoke("open_app", { name: target }); return;
  }
  if (/^(pon|reproduce|pausa|pausar|siguiente|siguiente canción|cancion siguiente|anterior|canción anterior)/i.test(text)) {
    const command = /siguiente/.test(text) ? "next" : /anterior/.test(text) ? "previous" : /paus/.test(text) ? "pause" : "play_pause";
    await invoke("media_control", { command }); return;
  }
  if (/sube|aumenta/.test(text)) { await invoke("media_control", { command: "volume_up" }); return; }
  if (/baja|reduce/.test(text)) { await invoke("media_control", { command: "volume_down" }); return; }
  if (/silencia|mute/.test(text)) { await invoke("media_control", { command: "mute" }); return; }
  if (/captura|screenshot/.test(text)) { await invoke("take_screenshot"); return; }
  throw new Error(`Paso no reconocido: ${step}`);
}

/** Await the backend exactly once before displaying success; expose errors in chat. */
export async function resolveActionReply(reply: AgentReply, perform: (action: AgentAction) => Promise<string | null>): Promise<AgentReply> {
  if (!reply.action) return reply;
  try {
    const result = await perform(reply.action);
    return result ? { ...reply, text: result } : reply;
  } catch (e) {
    return { kind: "error", text: `No pude completar esa acción: ${e instanceof Error ? e.message : String(e)}` };
  }
}

function mediaCommand(label: string) {
  if (/pausa/i.test(label)) return "pause";
  if (/siguiente/i.test(label)) return "next";
  return "play";
}
