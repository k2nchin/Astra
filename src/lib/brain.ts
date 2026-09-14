import type { ActionIcon, AgentReply, PersonaId, Settings } from "@/types";
import { complete, LlmError } from "@/lib/llm";
import { askGemini, type ConversationTurn } from "@/lib/gemini";

/**
 * Cerebro de CUBE (MVP).
 *
 *  CUBE AI Mascot → voz/texto → [ este módulo ] → acciones del PC
 *
 * Por ahora son "reflejos": reglas locales que interpretan órdenes típicas
 * y devuelven una respuesta compacta + la acción que ejecutaría el backend.
 * Cada respuesta tiene dos redacciones: CUBE (cercana) y Raphael (fórmulas
 * de sistema: «Respuesta.», «Solicitud aceptada.», «Confirmado.»).
 *
 * Integración real (siguiente paso):
 *   - LLM:    sustituir el fallback por una llamada a OpenAI / Claude / Ollama
 *             con un system prompt de la personalidad activa.
 *   - Tauri:  donde aparece `// TODO(tauri)`, llamar a `invoke("...")`.
 */

const APPS: Array<{ match: RegExp; name: string; icon: ActionIcon }> = [
  { match: /vs ?code|visual studio|code\b/i, name: "Visual Studio Code", icon: "code" },
  { match: /blender/i, name: "Blender", icon: "box" },
  { match: /photoshop|ps\b/i, name: "Photoshop", icon: "image" },
  { match: /spotify/i, name: "Spotify", icon: "music" },
  { match: /chrome|navegador|browser|edge|firefox/i, name: "el navegador", icon: "globe" },
  { match: /terminal|powershell|cmd|consola/i, name: "la terminal", icon: "terminal" },
  { match: /explorador|explorer|archivos|carpeta/i, name: "el Explorador de archivos", icon: "folder" },
  { match: /discord/i, name: "Discord", icon: "sparkles" },
  { match: /steam/i, name: "Steam", icon: "sparkles" },
  { match: /figma/i, name: "Figma", icon: "image" },
  { match: /obsidian|notion/i, name: "tus notas", icon: "folder" },
];

const JOKES = [
  "¿Por qué el cubo nunca se pierde? Porque siempre sabe dónde están sus seis caras.",
  "Soy un cubo de 64 píxeles con más ideas que RAM. Y aun así consumo menos que Electron.",
  "Mi terapeuta dice que tengo demasiadas caras. Le dije que solo seis.",
];

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const clean = (s: string) => s.trim().replace(/[¿?¡!.]+$/g, "").trim();
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const timeNow = (lang: string) => new Date().toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" });
const dateNow = (lang: string) =>
  new Date().toLocaleDateString(lang, { weekday: "long", day: "numeric", month: "long" });

export function fmtDelay(ms: number) {
  if (ms < 60_000) return `${Math.round(ms / 1000)} s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)} min`;
  return `${Math.round(ms / 360_000) / 10} h`;
}

/** Interpreta la petición y devuelve la respuesta (con latencia simulada). */
export async function think(
  raw: string,
  lang = "es-ES",
  _persona: PersonaId = "cube",
  settings?: Settings,
  signal?: AbortSignal,
  history: ConversationTurn[] = [],
): Promise<AgentReply> {
  // Por ahora Rafael solo es un alias de activación; CUBE sigue siendo la identidad activa.
  const activePersona: PersonaId = "cube";
  const input = clean(raw);
  const routine = settings?.routines?.find((item) => item.trigger.trim().toLocaleLowerCase() === input.toLocaleLowerCase());
  if (routine) {
    const action = { type: "routine" as const, label: routine.name, icon: "sparkles" as const, payload: { steps: routine.steps } };
    return { kind: "question", text: `Rutina «${routine.name}» lista con ${routine.steps.length} pasos. ¿La ejecuto?`, followUp: { yes: { kind: "action", text: `Ejecutando la rutina «${routine.name}».`, action }, no: "De acuerdo, no ejecutaré la rutina." } };
  }
  const custom = settings?.customCommands?.find((command) => command.trigger.trim().toLocaleLowerCase() === input.toLocaleLowerCase());
  if (custom) return { kind: "answer", text: custom.response };
  const reply = route(input.toLowerCase(), lang, activePersona);

  // Las órdenes conocidas se resuelven localmente; solo las consultas abiertas usan el proveedor elegido.
  if (settings && settings.provider !== "local" && reply.action?.type === "llm") {
    try {
      if (settings.provider === "gemini") return await askGemini(settings, input, lang, history, signal);
      const text = await complete(settings, { text: input, lang, persona: activePersona, preferences: settings.preferences, signal });
      if (text.startsWith("__ASTRA_ACTION__")) {
        const action = JSON.parse(text.slice("__ASTRA_ACTION__".length));
        return { kind: "question", text: `Puedo hacer esto: ${action.label}. ¿Lo ejecuto?`, followUp: { yes: { kind: "action", text: `Ejecutando: ${action.label}.`, action }, no: "De acuerdo, no ejecutaré esa acción." } };
      }
      return { kind: "answer", text };
    } catch (error) {
      if (signal?.aborted) throw error;
      const message = error instanceof LlmError || error instanceof Error ? error.message : "No se pudo usar el modelo externo.";
      return {
        kind: "error",
        text: `No he podido conectar con el modelo: ${message}`,
        action: { type: "llm", label: "LLM · error", icon: "sparkles" },
      };
    }
  }

  if (reply.action?.type === "llm") {
    return {
      kind: "notice",
      text: "Para conversar, selecciona un proveedor LLM en Configuración, introduce tu API key y guarda los cambios.",
      action: { type: "llm", label: "Conectar LLM", icon: "sparkles" },
    };
  }

  return reply;
}

function route(q: string, lang: string, persona: PersonaId): AgentReply {
  const R = persona === "raphael";
  const t = (cube: string, raphael: string) => (R ? raphael : cube);

  if (!q)
    return {
      kind: "error",
      text: t("No he captado nada. Llámame otra vez y háblame.", "Error. No se ha recibido entrada de audio. Repita la orden."),
    };

  // --- saludos / identidad ---
  if (/^(hola|buenas|hey|ey|qué tal|que tal|hi|hello)$/.test(q))
    return {
      kind: "greeting",
      text: t(
        "¡Hola! Soy Astra. Pequeña por fuera, atenta por dentro. ¿Qué hacemos?",
        "Aviso. Saludos, Maestro. Esta unidad está operativa. Indique su solicitud.",
      ),
    };
  if (/(quién|quien|qué|que) eres|who are you|tu nombre/.test(q))
    return {
      kind: "answer",
      text: t(
        "Soy Astra, tu agente de escritorio. Vivo en esta esquina y actúo sobre tu PC cuando me lo pides.",
        "Respuesta. Designación: Astra, asistente de escritorio. Función: análisis, asistencia y ejecución de órdenes sobre este equipo.",
      ),
    };
  if (/^(muchas )?(gracias|thanks)$/.test(q))
    return {
      kind: "confirm",
      text: t("Siempre. Aquí sigo, pequeño pero atento.", "Confirmado. No se requiere gratitud, Maestro."),
      celebrate: true,
    };
  if (/^(adiós|adios|hasta luego|chao|bye)$/.test(q))
    return {
      kind: "ack",
      text: t("Hasta luego. Me quedo flotando por si me necesitas.", "Confirmado. Entrando en modo de espera. Escucha activa."),
    };

  // --- respuestas sueltas ---
  if (/^(s[ií]|vale|ok|okey|claro|dale|yes|aprobar|apruebo)$/.test(q))
    return { kind: "answer", text: t("¿Sí a qué? Dime qué necesitas.", "Consulta. No hay ninguna propuesta pendiente de aprobación.") };
  if (/^(no|nop|nope|nada|rechazar)$/.test(q)) return { kind: "ack", text: t("Vale. Aquí sigo.", "Confirmado.") };
  if (/^(c[áa]llate|silencio|shh+|calla|para ya|basta)$/.test(q))
    return { kind: "ack", text: t("Vale, me callo.", "Confirmado. Silencio.") };

  // --- no molestar (ajustes por voz) ---
  if (/^(?:(?:activa|pon) (?:el )?(?:modo )?)?(no molestar|no me molestes|silencio total|modo silencio|deja de hablar(me)?|no hables)$/.test(q))
    return {
      kind: "confirm",
      text: t(
        "Modo no molestar activado. Solo hablaré si me llamas o para tus recordatorios.",
        "Confirmado. Modo «no molestar» activado. Solo se emitirán avisos esenciales.",
      ),
      action: { type: "settings", label: "No molestar", icon: "bell", payload: { dnd: true } },
    };
  if (/(vuelve a (hablar|avisar)|reactiva|activa (los )?avisos|ya puedes hablar|(quita|desactiva) (el )?(modo )?no molestar)/.test(q))
    return {
      kind: "confirm",
      text: t("Avisos reactivados. Vuelvo a estar pendiente de ti.", "Confirmado. Avisos restablecidos."),
      action: { type: "settings", label: "Avisos activos", icon: "bell", payload: { dnd: false } },
    };

  // --- capacidades ---
  if (/^(¿?(qué|que) puedes hacer|ayuda|help|comandos|opciones)$/.test(q))
    return {
      kind: "answer",
      text: t(
        "Puedo abrir programas, buscar archivos, controlar Spotify, hacer capturas, poner recordatorios y avisarte por mi cuenta. Prueba: «recuérdame en 20 segundos estirar».",
        "Respuesta. Funciones disponibles: ejecución de programas, búsqueda de archivos, control de Spotify, capturas de pantalla, recordatorios y avisos autónomos. Ejemplo: «recuérdame en 20 segundos estirar».",
      ),
      action: { type: "info", label: "Comandos disponibles", icon: "sparkles" },
    };

  // --- recordatorios / timers ---
  const rem = q.match(
    /^(?:recuérdame|recuerdame|recordatorio|avísame|avisame|temporizador|timer|alarma|remind me|pon(?:me)? (?:un|una) (?:alarma|temporizador|aviso))\b(.*)/,
  );
  if (rem) {
    const tail = (rem[1] ?? "")
      .replace(/media hora/, "30 min")
      .replace(/un cuarto de hora/, "15 min")
      .replace(/\buna? hora\b/, "1 hora")
      .replace(/\bun minuto\b/, "1 min");
    const m = tail.match(/(\d+(?:[.,]\d+)?)\s*(segundos?|seg\b|s\b|minutos?|min\b|m\b|horas?|h\b)/);
    if (!m) {
      return {
        kind: "answer",
        text: t(
          "Vale, lo apunto. ¿En cuánto tiempo te aviso? Por ejemplo: «en 10 minutos».",
          "Consulta. Especifique el intervalo. Ejemplo: «en 10 minutos».",
        ),
        action: { type: "reminder", label: "Recordatorio", icon: "bell" },
      };
    }
    const n = parseFloat(m[1].replace(",", "."));
    const mult = /^s/.test(m[2]) ? 1000 : /^h/.test(m[2]) ? 3_600_000 : 60_000;
    const delayMs = Math.round(n * mult);
    const note = tail
      .replace(m[0], " ")
      .replace(/^\s*(?:en|dentro de|in)\b\s*/, "")
      .replace(/^\s*(?:que|de|para|to|about)\b\s+/, "")
      .replace(/\s{2,}/g, " ")
      .trim();
    const label = fmtDelay(delayMs);
    // TODO(tauri): notificación nativa cuando venza
    return {
      kind: "confirm",
      text: note
        ? t(`Listo. En ${label} te recuerdo ${note}.`, `Confirmado. Recordatorio programado: ${label}. Contenido: ${note}.`)
        : t(`Listo, te aviso en ${label}.`, `Confirmado. Aviso programado en ${label}.`),
      action: { type: "reminder", label: `⏱ ${label}`, icon: "bell", payload: { delayMs, note: note || undefined } },
      celebrate: true,
    };
  }

  // --- hora / fecha ---
  if (/^(¿?(qué|que) hora (es|son)|dime la hora|hora|what time is it)$/.test(q))
    return {
      kind: "answer",
      text: t(`Son las ${timeNow(lang)}.`, `Respuesta. Hora actual: ${timeNow(lang)}.`),
      action: { type: "info", label: timeNow(lang), icon: "clock" },
    };
  if (/^(¿?(qué|que) (día|dia|fecha) es(?: hoy)?|fecha|what day is it)$/.test(q))
    return { kind: "answer", text: t(`Hoy es ${dateNow(lang)}.`, `Respuesta. Fecha actual: ${dateNow(lang)}.`) };

  // --- abrir apps ---
  const open = q.match(/^(?:abre|abrir|abreme|ábreme|lanza|lanzar|ejecuta|inicia|open|launch|run)\s+(?:el |la |los |las |mi |the )?(.+)/);
  if (open) {
    const target = open[1];
    const app = APPS.find((a) => a.match.test(target));
    const name = app?.name ?? capitalize(target);
    const label = name.replace(/^(el|la) /, "");
    // TODO(tauri): await invoke("open_app", { name })
    return {
      kind: "action",
      text: t(`Abriendo ${name}…`, `Solicitud aceptada. Ejecutando: ${capitalize(label)}.`),
      action: { type: "open_app", label, icon: app?.icon ?? "box" },
      celebrate: true,
    };
  }

  // --- media / spotify ---
  if (/^(pausa|pause|para la música|para la musica|stop)(?: (?:la música|la musica|spotify))?$/.test(q))
    return {
      kind: "confirm",
      text: "Alternando reproducción y pausa en el reproductor activo.",
      action: { type: "media", label: "Pausa", icon: "music", payload: { command: "play_pause" } },
    };
  if (/^(siguiente|next|salta|skip)(?: (?:canción|cancion|pista))?$/.test(q))
    return {
      kind: "confirm",
      text: t("Siguiente canción.", "Confirmado. Pista siguiente."),
      action: { type: "media", label: "Siguiente ▸", icon: "music", payload: { command: "next" } },
    };
  if (/^(?:pon|ponme|reproduce|reanuda|play)(?: (?:la |mi )?(?:música|musica|reproducción|reproduccion))?(?: en spotify)?$/.test(q)) {
    return {
      kind: "action",
      text: "Alternando reproducción y pausa en tu reproductor activo. Debe tener una canción o lista cargada.",
      action: { type: "media", label: "Reproducción / pausa", icon: "music", payload: { command: "play_pause" } },
      celebrate: true,
    };
  }

  // --- volumen / brillo ---
  const vol = q.match(/^(?:pon (?:el )?)?(volumen|brillo|volume)\s*(?:al|a|to)?\s*(\d{1,3})/);
  if (vol)
    return {
      kind: "confirm",
      text: t(`${capitalize(vol[1])} al ${vol[2]} %.`, `Confirmado. ${capitalize(vol[1])} ajustado al ${vol[2]} %.`),
      action: {
        type: "system",
        label: `${capitalize(vol[1])} ${vol[2]}%`,
        icon: vol[1] === "brillo" ? "sun" : "volume",
        payload: {
          command: vol[1] === "brillo" ? "brightness" : "volume",
          value: Math.min(100, Number(vol[2])),
        },
      },
    };
  if (/^(sube (el )?volumen|más alto|mas alto)$/.test(q))
    return {
      kind: "confirm",
      text: t("Volumen arriba.", "Confirmado. Volumen incrementado."),
      action: { type: "system", label: "Volumen +10", icon: "volume", payload: { command: "volume_up" } },
    };
  if (/^(baja (el )?volumen|más bajo|mas bajo)$/.test(q))
    return {
      kind: "confirm",
      text: t("Volumen abajo.", "Confirmado. Volumen reducido."),
      action: { type: "system", label: "Volumen −10", icon: "volume", payload: { command: "volume_down" } },
    };

  // --- buscar archivos ---
  const search = q.match(
    /^(?:busca|buscar|encuentra|encontrar|find|search)\s+(?:el |la |los |las |un |una |mis? )?(?:archivos?|files?|documentos?|carpetas?)\s*(?:llamados?|que se llame|de|called|named)?\s*(.+)/,
  );
  if (search && search[1]) {
    const term = clean(search[1]);
    // TODO(tauri): invoke("search_files", { query: term })
    return {
      kind: "answer",
      text: `Buscando «${term}» en Documentos, Escritorio y Descargas…`,
      action: { type: "search_files", label: `Buscar «${term}»`, icon: "folder", payload: { query: term } },
    };
  }

  // --- capturas ---
  if (/^(?:(?:haz|toma|guarda) (?:una )?)?(captura(?: de pantalla)?|screenshot|pantallazo)$/.test(q))
    return {
      kind: "confirm",
      text: t("Capturando la pantalla…", "Solicitud aceptada. Capturando la pantalla."),
      action: { type: "system", label: "Captura.png", icon: "image", payload: { command: "screenshot" } },
      celebrate: true,
    };

  // --- acciones sensibles ---
  if (/(apaga|apagar|reinicia|reiniciar|bloquea|suspende|shutdown|restart)/.test(q))
    return {
      kind: "error",
      text: t(
        "Todavía no tengo un control para apagar, reiniciar o bloquear tu equipo.",
        "Esta acción no está implementada en esta versión.",
      ),
    };
  if (/^(sí|si),? hazlo|confirmo|adelante/.test(q))
    return {
      kind: "confirm",
      text: "No hay una acción pendiente. Dime qué quieres hacer.",
      celebrate: true,
    };

  // --- humor ---
  if (/chiste|joke|hazme reír|hazme reir/.test(q))
    return {
      kind: "answer",
      text: t(pick(JOKES), `Respuesta. El humor no forma parte de las funciones principales. Ejecutando de todos modos: ${pick(JOKES)}`),
      celebrate: true,
    };

  // --- tareas de LLM ---
  if (/(escribe|redacta|resume|traduce|explica|genera|programa|código|codigo|code|refactoriza|corrige)/.test(q))
    return {
      kind: "answer",
      text: t(
        "Consultando el modelo…",
        "Consultando el modelo…",
      ),
      action: { type: "llm", label: "Pendiente: LLM", icon: "sparkles" },
    };

  return { kind: "answer", text: "Consultando el modelo…", action: { type: "llm", label: "Consulta al modelo", icon: "sparkles" } };
}

/** Frases que "oye" CUBE cuando no hay micrófono disponible (modo demo). */
export const SAMPLE_UTTERANCES = [
  "Abre VS Code",
  "Pon música en Spotify",
  "Busca archivo presupuesto",
  "¿Qué hora es?",
  "Abre Blender",
  "Haz una captura de pantalla",
  "¿Qué puedes hacer?",
  "Cuéntame un chiste",
  "Recuérdame en 20 segundos estirar",
];
