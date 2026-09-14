import type { AgentReply, HandsFreeStatus, PersonaId } from "@/types";

/**
 * Iniciativa de CUBE: lo que dice sin que nadie se lo pida.
 * Saludo, vuelta tras una ausencia, hora en punto y "nudges" contextuales,
 * redactados para cada personalidad. En la versión Tauri el contexto vendrá
 * del sistema real (ventana activa, calendario, batería, reproducción…).
 */

export interface ProactiveContext {
  hour: number;
  /** Minutos desde que arrancó la sesión. */
  minutesActive: number;
  openApps: string[];
  handsFree: HandsFreeStatus;
  /** Ids de nudges ya usados (para no repetirse). */
  used: Set<string>;
}

const isHandsFree = (s: HandsFreeStatus) => s === "active" || s === "paused";
const timeStr = () => new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });

export function greeting(ctx: ProactiveContext, persona: PersonaId): AgentReply {
  const h = ctx.hour;
  const hello = h < 6 ? "Buenas noches" : h < 12 ? "Buenos días" : h < 20 ? "Buenas tardes" : "Buenas noches";
  const hf = isHandsFree(ctx.handsFree);

  if (persona === "raphael") {
    const tail = hf
      ? "Escucha activa: pronuncie «Hey Astra» para emitir una orden."
      : ctx.handsFree === "starting"
        ? "Acceso al micrófono pendiente. Una vez concedido, bastará con pronunciar «Hey Astra»."
        : "Activación disponible mediante clic o Control + Espacio.";
    return {
      kind: "greeting",
      text: `Aviso. ${hello}, Maestro. Habilidad Definitiva «Raphael, Señor de la Sabiduría» operativa. ${tail}`,
    };
  }

  const tail = hf
    ? "Estoy escuchando: di «Hey Astra» cuando me necesites."
    : ctx.handsFree === "starting"
      ? "En cuanto me des permiso de micrófono, bastará con decir «Hey Astra»."
      : "Tócame, o pulsa Ctrl + Espacio, y te escucho.";
  return { kind: "greeting", text: `${hello}. ${tail}` };
}

export function returnMessage(awayMin: number, persona: PersonaId): AgentReply {
  if (persona === "raphael")
    return {
      kind: "notice",
      text:
        awayMin < 3
          ? "Aviso. Presencia detectada. Retomando."
          : `Aviso. Regreso del Maestro detectado tras ${awayMin} minutos de ausencia. Retomando.`,
    };
  return {
    kind: "notice",
    text: awayMin < 3 ? "Aquí sigo. ¿Retomamos?" : `Bienvenido de vuelta. Han sido ${awayMin} minutos; yo no me he movido.`,
  };
}

export function hourChime(d: Date, persona: PersonaId): AgentReply {
  const hh = String(d.getHours()).padStart(2, "0");
  return {
    kind: "notice",
    text: persona === "raphael" ? `Aviso. Hora actual: ${hh}:00 en punto.` : `Son las ${hh}:00 en punto.`,
    action: { type: "info", label: `${hh}:00`, icon: "clock" },
  };
}

interface Nudge {
  id: string;
  when?: (c: ProactiveContext) => boolean;
  build: (c: ProactiveContext, raphael: boolean) => AgentReply;
}

const NUDGES: Nudge[] = [
  {
    id: "music",
    when: (c) => !c.openApps.includes("spotify"),
    build: (c, R) => ({
      kind: "question",
      text: R
        ? c.minutesActive >= 5
          ? `Propuesta. Se detectan ${c.minutesActive} minutos de actividad sin audio. Reproducir lista «Focus» en Spotify. ¿Aprobar?`
          : "Propuesta. Reproducir música de fondo durante la sesión de trabajo. ¿Aprobar?"
        : c.minutesActive >= 5
          ? `Llevas ${c.minutesActive} minutos trabajando en silencio. ¿Pongo algo de música?`
          : "¿Te pongo música de fondo mientras trabajas?",
      followUp: {
        yes: {
          kind: "confirm",
          text: R ? "Confirmado. Reproduciendo lista «Focus». Volumen: moderado." : "Marchando: playlist «Focus» en Spotify, volumen suave.",
          action: { type: "media", label: "Spotify · ▶", icon: "music" },
          celebrate: true,
        },
        no: R ? "Entendido. Propuesta descartada." : "Vale, silencio entonces.",
      },
    }),
  },
  {
    id: "break",
    when: (c) => c.minutesActive >= 40,
    build: (c, R) => ({
      kind: "question",
      text: R
        ? `Propuesta. Actividad continua: ${c.minutesActive} minutos. Se recomienda una pausa de cinco minutos. ¿Aprobar?`
        : `Llevas ${c.minutesActive} minutos seguidos. ¿Hacemos una pausa de cinco? Te aviso cuando acabe.`,
      followUp: {
        yes: {
          kind: "confirm",
          text: R ? "Confirmado. Pausa iniciada. Aviso programado en cinco minutos." : "Pausa de cinco minutos. Levántate; yo cuento.",
          action: {
            type: "reminder",
            label: "⏱ 5 min",
            icon: "bell",
            payload: { delayMs: 5 * 60_000, note: R ? "fin de la pausa. Retomar actividad" : "se acabó la pausa, volvemos" },
          },
        },
        no: R ? "Entendido. Recomendación pospuesta." : "Como quieras. Te lo recuerdo más tarde.",
      },
    }),
  },
  {
    id: "vscode",
    when: (c) => c.openApps.includes("vscode"),
    build: (_c, R) => ({
      kind: "question",
      text: R
        ? "Propuesta. Visual Studio Code en ejecución. Programar recordatorio de commit en 30 minutos. ¿Aprobar?"
        : "Veo VS Code abierto. ¿Te recuerdo hacer commit dentro de 30 minutos?",
      followUp: {
        yes: {
          kind: "confirm",
          text: R ? "Confirmado. Recordatorio programado: 30 minutos." : "Hecho. En 30 minutos te aviso.",
          action: { type: "reminder", label: "⏱ 30 min", icon: "bell", payload: { delayMs: 30 * 60_000, note: "hacer commit" } },
        },
        no: R ? "Entendido." : "Vale, sin presiones.",
      },
    }),
  },
  {
    id: "terminal",
    when: (c) => c.openApps.includes("vscode") && !c.openApps.includes("terminal"),
    build: (_c, R) => ({
      kind: "question",
      text: R ? "Propuesta. Abrir terminal en el directorio del proyecto. ¿Aprobar?" : "¿Abro una terminal en la carpeta del proyecto?",
      followUp: {
        yes: {
          kind: "confirm",
          text: R ? "Confirmado. Terminal abierta en Proyectos." : "Terminal abierta en Proyectos.",
          action: { type: "open_app", label: "Terminal", icon: "terminal" },
          celebrate: true,
        },
        no: R ? "Entendido." : "Vale.",
      },
    }),
  },
  {
    id: "evening",
    when: (c) => c.hour >= 20 || c.hour < 6,
    build: (_c, R) => ({
      kind: "question",
      text: R
        ? "Propuesta. Hora avanzada detectada. Reducir brillo de pantalla al 40 %. ¿Aprobar?"
        : "Se está haciendo tarde. ¿Bajo el brillo de la pantalla?",
      followUp: {
        yes: {
          kind: "confirm",
          text: R ? "Confirmado. Brillo ajustado al 40 %." : "Brillo al 40 %. Tus ojos me lo agradecerán.",
          action: { type: "system", label: "Brillo 40%", icon: "sun" },
        },
        no: R ? "Entendido. Sin cambios." : "Vale, lo dejo como está.",
      },
    }),
  },
  {
    id: "handsfree-tip",
    when: (c) => isHandsFree(c.handsFree),
    build: (_c, R) => ({
      kind: "notice",
      text: R
        ? "Aviso. No se requiere contacto físico. Pronuncie «Hey Astra» seguido de la orden."
        : "Recuerda: no hace falta tocarme. Di «Hey Astra, abre Blender» y lo hago.",
    }),
  },
  {
    id: "click-tip",
    when: (c) => !isHandsFree(c.handsFree),
    build: (_c, R) => ({
      kind: "notice",
      text: R
        ? "Aviso. Doble clic: interfaz de chat. Control + Espacio: activación por teclado."
        : "Consejo: con doble clic abro el chat compacto, y con Ctrl + Espacio me activas sin ratón.",
    }),
  },
  {
    id: "water",
    build: (_c, R) => ({
      kind: "notice",
      text: R
        ? "Aviso. Se recomienda hidratación. Esta unidad no la requiere; el Maestro, sí."
        : "Recordatorio express: agua. Yo no bebo, pero tú deberías.",
    }),
  },
  {
    id: "stretch",
    when: (c) => c.minutesActive >= 20,
    build: (_c, R) => ({
      kind: "notice",
      text: R ? "Aviso. Se recomienda estiramiento de hombros: diez segundos." : "Estira los hombros diez segundos. Yo vigilo la pantalla.",
    }),
  },
  {
    id: "time",
    build: (_c, R) => ({
      kind: "notice",
      text: R ? `Aviso. Hora actual: ${timeStr()}.` : `Por si lo has perdido de vista: son las ${timeStr()}.`,
      action: { type: "info", label: timeStr(), icon: "clock" },
    }),
  },
  {
    id: "morning",
    when: (c) => c.hour >= 6 && c.hour < 12,
    build: (_c, R) => ({
      kind: "notice",
      text: R
        ? "Aviso. Agenda matutina: sin datos. Integración de calendario pendiente."
        : "Plan de la mañana: nada en tu agenda… porque aún no me has conectado el calendario. Pronto.",
    }),
  },
  {
    id: "corner",
    build: (_c, R) => ({
      kind: "notice",
      text: R
        ? "Aviso. La posición de esta unidad se conserva entre sesiones."
        : "Si me arrastras a una esquina, me quedo ahí. Recuerdo mi sitio entre sesiones.",
    }),
  },
  {
    id: "dnd-tip",
    build: (_c, R) => ({
      kind: "notice",
      text: R
        ? "Aviso. Para suprimir avisos no esenciales, pronuncie «Hey Astra, no molestar»."
        : "Si hablo demasiado, di «Hey Astra, no molestar» y solo te avisaré de tus recordatorios.",
    }),
  },
];

/** Elige un comentario adecuado al contexto, sin repetir hasta agotar el catálogo. */
export function pickNudge(ctx: ProactiveContext, persona: PersonaId): (AgentReply & { id: string }) | null {
  const R = persona === "raphael";
  const eligible = NUDGES.filter((n) => !n.when || n.when(ctx));
  let pool = eligible.filter((n) => !ctx.used.has(n.id));
  if (!pool.length) {
    ctx.used.clear();
    pool = eligible;
  }
  if (!pool.length) return null;
  // La primera vez, mejor una pregunta: así se ve que se le puede contestar.
  if (ctx.used.size === 0) {
    const questions = pool.filter((n) => n.build(ctx, R).followUp);
    if (questions.length) pool = questions;
  }
  const n = pool[Math.floor(Math.random() * pool.length)];
  ctx.used.add(n.id);
  return { id: n.id, ...n.build(ctx, R) };
}
