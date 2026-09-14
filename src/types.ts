/** Estados visuales del mascot. */
export type AgentState =
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "happy"
  | "off";

export type ActionIcon =
  | "code"
  | "music"
  | "folder"
  | "terminal"
  | "image"
  | "box"
  | "clock"
  | "globe"
  | "volume"
  | "shield"
  | "sparkles"
  | "sun"
  | "bell";

export type ActionType =
  | "open_app"
  | "search_files"
  | "media"
  | "system"
  | "reminder"
  | "info"
  | "llm"
  | "settings"
  | "window"
  | "routine";

export interface AgentAction {
  /** Tipo de acción que ejecutaría el backend (Tauri) en el PC. */
  type: ActionType;
  /** Etiqueta compacta que se muestra como chip en la burbuja. */
  label: string;
  icon: ActionIcon;
  payload?: {
    /** Recordatorios: retardo hasta el aviso. */
    delayMs?: number;
    note?: string;
    /** Ajustes que CUBE puede cambiar por voz. */
    dnd?: boolean;
    /** Operación nativa de sistema, validada por el backend. */
    command?: "volume" | "volume_up" | "volume_down" | "mute" | "brightness" | "play_pause" | "next" | "previous" | "screenshot";
    windowCommand?: "focus" | "minimize" | "maximize" | "restore";
    app?: string;
    steps?: string[];
    /** Porcentaje objetivo para operaciones que lo admiten. */
    value?: number;
    /** Término estructurado para la búsqueda de archivos. */
    query?: string;
  };
}

/** Pregunta abierta de CUBE: qué hacer si el usuario dice «sí» o «no». */
export interface FollowUp {
  yes: AgentReply;
  no?: string;
}

/**
 * Naturaleza del mensaje. La personalidad "Raphael" lo usa para elegir la
 * fórmula de apertura: Aviso. / Respuesta. / Confirmado. / Propuesta. …
 */
export type ReplyKind =
  | "greeting"
  | "notice"
  | "reminder"
  | "answer"
  | "action"
  | "question"
  | "error"
  | "confirm"
  | "ack";

export interface AgentReply {
  text: string;
  action?: AgentAction;
  /** Si es true, el mascot hace un pequeño "salto" de alegría tras hablar. */
  celebrate?: boolean;
  followUp?: FollowUp;
  kind?: ReplyKind;
}

export interface ChatMessage {
  id: string;
  role: "user" | "cube";
  text: string;
  action?: AgentAction;
  at: number;
  /** Marca si el texto vino de una escucha simulada (sin micrófono real). */
  simulated?: boolean;
  /** Mensaje que CUBE inició por su cuenta. */
  proactive?: boolean;
}

export interface Bubble {
  id: string;
  text: string;
  action?: AgentAction;
  /** Mostrar botones de aprobación / rechazo. */
  quickReplies?: boolean;
  proactive?: boolean;
}

/** Cuánto habla CUBE por iniciativa propia. */
export type Initiative = "off" | "low" | "high";

/** Estado de la escucha continua («Hey CUBE»). */
export type HandsFreeStatus =
  | "off"
  | "starting"
  | "active"
  | "paused"
  | "denied"
  | "unsupported";

/** Personalidad / voz del agente. */
export type PersonaId = "cube" | "raphael";

export interface Settings {
  /** Proveedor opcional para conectar un modelo externo. */
  provider: "local" | "gemini" | "groq" | "openai" | "anthropic" | "custom";
  apiKey: string;
  apiBaseUrl: string;
  model: string;
  /** Tamaño base del mascot en px. */
  size: 48 | 64 | 80;
  /** Responder con voz sintetizada (Web Speech). */
  tts: boolean;
  /** Animación de flotación en reposo. */
  idleMotion: boolean;
  /** Idioma de reconocimiento/síntesis. */
  lang: "es-ES" | "en-US";
  /** Mostrar los 2 controles mini bajo el mascot. */
  showControls: boolean;
  /** Escucha continua con palabra de activación. */
  handsFree: boolean;
  /** Nivel de iniciativa (habla sin que se lo pidas). */
  initiative: Initiative;
  /** Personalidad y perfil de voz. */
  persona: PersonaId;
  /** Voz concreta del sistema (voiceURI) o null = automática. */
  voiceURI: string | null;
  voiceProvider: "system" | "fish";
  fishApiKey: string;
  fishReferenceId: string;
  customCommands: CustomCommand[];
  routines: AstraRoutine[];
  /** Preferencias persistentes, escritas por el usuario y usadas como contexto. */
  preferences: string[];
  /** Tono breve de sistema antes de hablar. */
  chime: boolean;
}

export interface CustomCommand {
  id: string;
  trigger: string;
  response: string;
}

export interface AstraRoutine {
  id: string;
  name: string;
  trigger: string;
  steps: string[];
}

export const DEFAULT_SETTINGS: Settings = {
  provider: "groq",
  apiKey: "",
  apiBaseUrl: "",
  model: "openai/gpt-oss-20b",
  size: 64,
  tts: true,
  idleMotion: true,
  lang: "es-ES",
  showControls: false,
  handsFree: true,
  initiative: "off",
  persona: "cube",
  voiceURI: null,
  voiceProvider: "fish",
  fishApiKey: "",
  fishReferenceId: "26fab9fe8a6f43e19bf78192e9ebc87c",
  customCommands: [],
  routines: [],
  preferences: [],
  chime: true,
};
