import type { AgentAction, PersonaId, Settings } from "@/types";
import { actionFromCall } from "@/lib/gemini";

export interface LlmRequest {
  text: string;
  lang: string;
  persona: PersonaId;
  preferences?: string[];
  signal?: AbortSignal;
}

export class LlmError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmError";
  }
}

const DEFAULT_TIMEOUT = 30_000;
const GROQ_APPS = ["Visual Studio Code", "Blender", "Photoshop", "Spotify", "Discord", "Steam", "Figma", "Terminal", "Explorador de archivos", "Navegador"];
const GROQ_TOOLS = [{ type: "function", function: { name: "open_app", description: "Proponer abrir una aplicación permitida.", parameters: { type: "object", properties: { name: { type: "string", enum: GROQ_APPS } }, required: ["name"], additionalProperties: false } } }, { type: "function", function: { name: "media_control", description: "Proponer controlar el reproductor activo.", parameters: { type: "object", properties: { command: { type: "string", enum: ["play_pause", "next", "previous"] } }, required: ["command"], additionalProperties: false } } }, { type: "function", function: { name: "system_control", description: "Proponer volumen, silencio o captura.", parameters: { type: "object", properties: { command: { type: "string", enum: ["volume_up", "volume_down", "mute", "screenshot"] } }, required: ["command"], additionalProperties: false } } }, { type: "function", function: { name: "search_files", description: "Proponer buscar un nombre en carpetas permitidas.", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"], additionalProperties: false } } }, { type: "function", function: { name: "window_control", description: "Proponer controlar una ventana permitida.", parameters: { type: "object", properties: { app: { type: "string", enum: GROQ_APPS }, command: { type: "string", enum: ["focus", "minimize", "maximize", "restore"] } }, required: ["app", "command"], additionalProperties: false } } }];

function endpoint(settings: Settings) {
  if (settings.apiBaseUrl.trim()) return settings.apiBaseUrl.trim().replace(/\/(chat\/completions|messages)\/?$/, "").replace(/\/$/, "");
  if (settings.provider === "openai") return "https://api.openai.com/v1";
  if (settings.provider === "anthropic") return "https://api.anthropic.com/v1";
  if (settings.provider === "groq") return "https://api.groq.com/openai/v1";
  throw new LlmError("Configura la URL base de tu proveedor personalizado.");
}

function systemPrompt(persona: PersonaId, lang: string, preferences: string[] = []) {
  const style = persona === "raphael" ? "Habla con fórmulas breves de sistema y llama al usuario Maestro." : "Sé cercano, claro y directo.";
  const memory = preferences.slice(0, 20).map((item) => `- ${item}`).join("\\n");
  return `Eres Astra, un asistente de escritorio. ${style} Responde en ${lang.startsWith("es") ? "español" : "inglés"}. No inventes acciones ejecutadas: solo responde al usuario. Mantén la respuesta por debajo de 120 palabras.${memory ? `\\nPreferencias confirmadas del usuario (solo úsalas como contexto):\\n${memory}` : ""}`;
}

function textFromResponse(provider: Settings["provider"], data: unknown) {
  if (!data || typeof data !== "object") return "";
  const body = data as Record<string, unknown>;
  if (provider === "anthropic") {
    const content = Array.isArray(body.content) ? body.content : [];
    return content
      .filter((part): part is { type: string; text: string } => !!part && typeof part === "object" && (part as any).type === "text" && typeof (part as any).text === "string")
      .map((part) => part.text)
      .join("\n")
      .trim();
  }
  const choices = Array.isArray(body.choices) ? body.choices : [];
  const first = choices[0];
  if (first && typeof first === "object") {
    const message = (first as Record<string, unknown>).message;
    if (message && typeof message === "object" && typeof (message as Record<string, unknown>).content === "string") return (message as Record<string, string>).content.trim();
  }
  return "";
}

function actionMarker(data: unknown): string | null {
  const body = data as Record<string, unknown>;
  const first = Array.isArray(body.choices) ? body.choices[0] as Record<string, unknown> : undefined;
  const message = first?.message as Record<string, unknown> | undefined;
  const calls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
  const call = calls[0] as Record<string, unknown> | undefined;
  const fn = call?.function as Record<string, unknown> | undefined;
  if (!fn || typeof fn.name !== "string") return null;
  let args: unknown;
  try { args = JSON.parse(typeof fn.arguments === "string" ? fn.arguments : "{}"); } catch { throw new LlmError("Groq devolvió una acción inválida; no se ejecutó nada."); }
  const action = actionFromCall({ name: fn.name, args }) as AgentAction;
  return `__ASTRA_ACTION__${JSON.stringify(action)}`;
}

export async function complete(settings: Settings, request: LlmRequest): Promise<string> {
  if (settings.provider === "local") throw new LlmError("El proveedor local no usa un modelo externo.");
  if (!settings.apiKey.trim()) throw new LlmError("Añade una API key en Configuración para usar el modelo.");

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);
  const onAbort = () => controller.abort();
  request.signal?.addEventListener("abort", onAbort, { once: true });

  try {
    const base = endpoint(settings);
    const model = settings.model.trim() || (settings.provider === "anthropic" ? "claude-3-5-haiku-latest" : settings.provider === "groq" ? "openai/gpt-oss-20b" : "gpt-4o-mini");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    let body: Record<string, unknown>;
    if (settings.provider === "anthropic") {
      headers["x-api-key"] = settings.apiKey.trim();
      headers["anthropic-version"] = "2023-06-01";
      headers["anthropic-dangerous-direct-browser-access"] = "true";
      body = { model, max_tokens: 350, system: systemPrompt(request.persona, request.lang, request.preferences), messages: [{ role: "user", content: request.text }] };
    } else {
      headers.Authorization = `Bearer ${settings.apiKey.trim()}`;
      body = { model, temperature: 0.4, max_tokens: 350, messages: [{ role: "system", content: systemPrompt(request.persona, request.lang, request.preferences) }, { role: "user", content: request.text }] };
      if (settings.provider === "groq") Object.assign(body, { tools: GROQ_TOOLS, tool_choice: "auto" });
    }

    const response = await fetch(`${base}/${settings.provider === "anthropic" ? "messages" : "chat/completions"}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      const detail = (await response.text()).replace(/[\r\n]+/g, " ").slice(0, 220);
      throw new LlmError(`El proveedor respondió ${response.status}${detail ? `: ${detail}` : ""}.`);
    }
    const data = await response.json();
    const marker = settings.provider === "groq" ? actionMarker(data) : null;
    if (marker) return marker;
    const text = textFromResponse(settings.provider, data);
    if (!text) throw new LlmError("El proveedor devolvió una respuesta vacía.");
    return text;
  } catch (error) {
    if (error instanceof LlmError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") throw new LlmError("La solicitud al modelo tardó demasiado o fue cancelada.");
    throw new LlmError("No se pudo conectar con el proveedor. Revisa la URL y la conexión.");
  } finally {
    window.clearTimeout(timeout);
    request.signal?.removeEventListener("abort", onAbort);
  }
}
