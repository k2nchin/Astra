import type { AgentReply, PersonaId, ReplyKind } from "@/types";

/**
 * Personalidades de CUBE.
 *
 *  - "cube":    cercano y directo (la voz original del prototipo).
 *  - "raphael": estilo Sabio Rey / Raphael (Tensura): voz femenina grave,
 *               cadencia plana y fórmulas de sistema —«Aviso.», «Respuesta.»,
 *               «Confirmado.», «Propuesta… ¿Aprobar?»— y trata al usuario de «Maestro».
 *
 * Nota: no es (ni puede ser) la voz de la actriz de doblaje; es una voz del
 * sistema ajustada + su forma de hablar.
 */

export interface VoiceProfile {
  rate: number;
  pitch: number;
  volume: number;
  /** Orden de preferencia por nombre de voz instalada en el sistema. */
  prefer: RegExp[];
}

export interface PersonaMeta {
  id: PersonaId;
  name: string;
  tagline: string;
  voice: VoiceProfile;
  eyeTone: "neutral" | "ice";
  /** Etiquetas de respuesta rápida (aprobación / rechazo). */
  quick: [string, string];
  /** Palabras de activación que se anuncian en la interfaz. */
  wake: string;
}

export const PERSONAS: Record<PersonaId, PersonaMeta> = {
  cube: {
    id: "cube",
    name: "ASTRA",
    tagline: "ASTRA · voz calmada estilo Jarvis",
    // Voz masculina, calmada y pausada; la voz concreta la proporciona
    // Windows mediante SpeechSynthesis.
    voice: {
      rate: 0.94,
      pitch: 0.82,
      volume: 1,
      prefer: [
        /jorge|pablo|diego|carlos|juan|miguel|alvaro|álvaro|male|hombre/i,
        /natural|neural/i,
        /microsoft|google/i,
      ],
    },
    eyeTone: "neutral",
    quick: ["Sí", "No"],
    wake: "«Astra» / «Hey Astra»",
  },
  raphael: {
    id: "raphael",
    name: "Raphael",
    tagline: "Sabio Rey · «Aviso.» «Respuesta.» «Confirmado.»",
    voice: {
      rate: 0.97,
      pitch: 0.8,
      volume: 1,
      prefer: [
        /elvira/i,
        /helena/i,
        /laura/i,
        /dalia|luc[ií]a|paloma|sabina|abril|m[oó]nica|paulina|lupe|camila|ximena|vera|aria|jenny|zira|samantha|karen|female|mujer/i,
        /natural|neural/i,
        /google/i,
      ],
    },
    eyeTone: "ice",
    quick: ["YES", "NO"],
    wake: "«Hey Astra»",
  },
};

/* ------------------------------------------------------------------ */
/*  Estilo Raphael: fórmula de apertura según el tipo de mensaje        */
/* ------------------------------------------------------------------ */

const RAPHAEL_PREFIX: Record<ReplyKind, string> = {
  greeting: "Aviso.",
  notice: "Aviso.",
  reminder: "Aviso.",
  answer: "Respuesta.",
  action: "Solicitud aceptada.",
  question: "Propuesta.",
  error: "Error.",
  confirm: "Confirmado.",
  ack: "Entendido.",
};

const FORMULA_RE =
  /^(aviso|respuesta|confirmado|solicitud aceptada|propuesta|error|advertencia|consulta|éxito|entendido|informe)\b/i;

export function inferKind(reply: AgentReply, proactive: boolean): ReplyKind {
  if (reply.kind) return reply.kind;
  if (reply.followUp) return "question";
  if (proactive) return "notice";
  if (reply.action) return "action";
  return "answer";
}

function raphaelize(raw: string, kind: ReplyKind) {
  let text = raw
    .trim()
    .replace(/…/g, ".")
    .replace(/¡/g, "")
    .replace(/!/g, ".")
    .replace(/\.{2,}/g, ".")
    .replace(/\s+\./g, ".");
  if (!FORMULA_RE.test(text)) text = `${RAPHAEL_PREFIX[kind]} ${text}`;
  if (kind === "question" && !/\?\s*$/.test(text)) text = `${text} ¿Aprobar?`;
  return text;
}

/** Adapta un mensaje a la personalidad activa (el estilo CUBE se deja tal cual). */
export function stylize(reply: AgentReply, persona: PersonaId, kind: ReplyKind): AgentReply {
  if (persona !== "raphael") return reply;
  const followUp = reply.followUp
    ? {
        yes: stylize(reply.followUp.yes, persona, reply.followUp.yes.kind ?? "confirm"),
        no: reply.followUp.no ? raphaelize(reply.followUp.no, "ack") : undefined,
      }
    : undefined;
  return { ...reply, text: raphaelize(reply.text, kind), followUp };
}

/* ------------------------------------------------------------------ */
/*  Frases fijas del agente                                             */
/* ------------------------------------------------------------------ */

type PhraseKey =
  | "welcome"
  | "notHeard"
  | "micDenied"
  | "dndOn"
  | "dndOff"
  | "foreground"
  | "declined"
  | "switch"
  | "voiceTest"
  | "reminderNote"
  | "reminderElapsed";

const PHRASES: Record<PhraseKey, Record<PersonaId, string>> = {
  welcome: {
    cube: "Hola. Soy Astra. Di «Hey Astra» o escríbeme: puedo abrir programas, buscar archivos, poner música o avisarte cuando toque.",
    raphael:
      "Aviso. Sistema Astra operativo. Pronuncie «Hey Astra» o «Rafael», o escriba la orden: ejecución de programas, búsqueda de archivos, música y recordatorios.",
  },
  notHeard: {
    cube: "No te he oído. Toca de nuevo y háblame.",
    raphael: "Error. Entrada de audio no reconocida. Repita la orden.",
  },
  micDenied: {
    cube: "No tengo acceso al micrófono. Revisa el permiso en Windows y pulsa Reintentar micrófono en Configuración.",
    raphael: "No hay acceso al micrófono. Revisa el permiso de Windows y reintenta desde Configuración.",
  },
  dndOn: {
    cube: "No molestar activado. Solo hablaré si me llamas o para tus recordatorios.",
    raphael: "Confirmado. Modo «no molestar» activado. Solo se emitirán avisos esenciales: llamadas directas y recordatorios.",
  },
  dndOff: {
    cube: "Avisos reactivados.",
    raphael: "Confirmado. Avisos restablecidos.",
  },
  foreground: {
    cube: "Aquí estoy. ¿Qué necesitas?",
    raphael: "Aviso. Unidad en primer plano. Indique su solicitud, Maestro.",
  },
  declined: {
    cube: "Vale, como quieras.",
    raphael: "Entendido. Propuesta descartada.",
  },
  switch: {
    cube: "Vuelvo a ser yo. Hola.",
    raphael:
      "Aviso. Habilidad Definitiva «Raphael, Señor de la Sabiduría» activada. Individuo: Maestro. A la espera de órdenes.",
  },
  voiceTest: {
    cube: "Hola, soy Astra. Así sueno con esta voz.",
    raphael: "Aviso. Prueba de voz en curso. Individuo: Maestro. Todos los sistemas operativos.",
  },
  reminderNote: {
    cube: "Recordatorio: {note}.",
    raphael: "Aviso. Tiempo establecido alcanzado. Recordatorio: {note}.",
  },
  reminderElapsed: {
    cube: "Han pasado {elapsed}. Me pediste que te avisara.",
    raphael: "Aviso. Han transcurrido {elapsed}. Recordatorio solicitado por el Maestro.",
  },
};

export function phrase(persona: PersonaId, key: PhraseKey, vars: Record<string, string> = {}) {
  return PHRASES[key][persona].replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? "");
}
