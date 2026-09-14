import { useCallback, useEffect, useRef, useState } from "react";
import { fmtDelay, think } from "@/lib/brain";
import { inferKind, phrase, stylize } from "@/lib/persona";
import { cancelSpeech, isSynthesisSupported, listen, speak } from "@/lib/speech";
import { HandsFreeListener, type HandsFreeEvent } from "@/lib/wakeword";
import { executeAction, resolveActionReply } from "@/lib/actions";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type {
  AgentAction,
  AgentReply,
  AgentState,
  Bubble,
  ChatMessage,
  FollowUp,
  HandsFreeStatus,
  PersonaId,
  Settings,
} from "@/types";

const BUBBLE_TTL = 8000;
const BUBBLE_TTL_QUESTION = 14000;
const FOLLOW_UP_TTL = 45000;
const QUEUE_MAX = 3;
const MEMORY_KEY = "astra:conversation-memory";

const YES_RE =
  /^(s[ií]|vale|claro|dale|ok|okey|venga|por favor|hazlo|adelante|apruebo|aprobar|aprobado|acepto|aceptar|afirmativo|confirmo|confirmar|yes|sure|yeah|yep|please|approve)\b/i;
const NO_RE =
  /^(no|nah|nope|ahora no|luego|despu[ée]s|d[ée]jalo|paso|rechazar|rechazado|rechazo|denegar|denegado|negativo|cancelar|not now)\b/i;

const uid = () => Math.random().toString(36).slice(2, 9);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const welcome = (persona: PersonaId): ChatMessage => ({
  id: "welcome",
  role: "cube",
  text: phrase(persona, "welcome"),
  at: Date.now(),
});

interface SayOptions {
  /** Ignora "no molestar" (recordatorios pedidos por el usuario). */
  force?: boolean;
}

interface Options {
  settings: Settings;
  /** El mascot está en pantalla. Si no, se apaga la escucha continua. */
  active: boolean;
  /** Se dispara cuando CUBE "ejecuta" una acción sobre el PC. */
  onAction?: (action: AgentAction) => void;
}

/**
 * Máquina de estados del agente:
 *   idle → listening → thinking → speaking → (happy) → idle
 *
 * Entradas: palabra de activación («Hey CUBE» / «Rafael»), clic, texto, o la
 * propia iniciativa de CUBE (`say`). Cada ciclo tiene un `runId`; si el
 * usuario interrumpe, las continuaciones del ciclo antiguo se descartan.
 * Todo lo que CUBE dice pasa por `stylize()` → personalidad activa.
 */
export function useCubeAgent({ settings, active, onAction }: Options) {
  const [state, setState] = useState<AgentState>("idle");
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(MEMORY_KEY) || "[]") as ChatMessage[];
      return Array.isArray(saved) && saved.length ? saved.slice(-40) : [welcome(settings.persona)];
    } catch { return [welcome(settings.persona)]; }
  });
  const [bubble, setBubble] = useState<Bubble | null>(null);
  const [transcript, setTranscript] = useState("");
  const [handsFree, setHandsFree] = useState<HandsFreeStatus>("off");
  const [voiceError, setVoiceError] = useState("");
  const [dnd, setDndState] = useState(false);
  const [fallbackMic, setFallbackMic] = useState<"unknown" | "real" | "demo">(
    "unknown",
  );

  const stateRef = useRef<AgentState>("idle");
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  useEffect(() => {
    try { localStorage.setItem(MEMORY_KEY, JSON.stringify(messages.slice(-40))); } catch { /* storage may be unavailable */ }
  }, [messages]);
  const runRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const bubbleTimer = useRef<number | null>(null);
  const listenerRef = useRef<HandsFreeListener | null>(null);
  const queueRef = useRef<AgentReply[]>([]);
  const followUpRef = useRef<FollowUp | null>(null);
  const followUpTimer = useRef<number | null>(null);
  const reminderTimers = useRef<Set<number>>(new Set());
  const dndRef = useRef(false);
  const settingsRef = useRef(settings);
  const onActionRef = useRef(onAction);
  const activeRef = useRef(active);
  const prevPersona = useRef(settings.persona);
  const sayRef = useRef<(input: AgentReply | string, opts?: SayOptions) => Promise<boolean>>(async () => false);
  const handleEventRef = useRef<(e: HandsFreeEvent) => void>(() => {});
  settingsRef.current = settings;
  onActionRef.current = onAction;
  activeRef.current = active;

  const go = useCallback((s: AgentState) => {
    stateRef.current = s;
    setState(s);
  }, []);

  const scheduleBubbleHide = useCallback((id: string, ttl = BUBBLE_TTL) => {
    if (bubbleTimer.current) window.clearTimeout(bubbleTimer.current);
    bubbleTimer.current = window.setTimeout(() => {
      setBubble((b) => (b?.id === id ? null : b));
    }, ttl);
  }, []);

  const showBubble = useCallback(
    (text: string, action?: AgentAction) => {
      const id = uid();
      setBubble({ id, text, action });
      scheduleBubbleHide(id);
    },
    [scheduleBubbleHide],
  );

  const dismissBubble = useCallback(() => setBubble(null), []);

  const setDnd = useCallback((v: boolean) => {
    dndRef.current = v;
    setDndState(v);
  }, []);

  const setFollowUp = useCallback((fu: FollowUp | null) => {
    if (followUpTimer.current) {
      window.clearTimeout(followUpTimer.current);
      followUpTimer.current = null;
    }
    followUpRef.current = fu;
    if (fu) {
      followUpTimer.current = window.setTimeout(() => {
        followUpRef.current = null;
      }, FOLLOW_UP_TTL);
    }
  }, []);

  /** Corta lo que esté haciendo (escuchar/pensar/hablar) y vuelve a idle. */
  const interrupt = useCallback(() => {
    runRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    listenerRef.current?.cancelCommand();
    cancelSpeech();
    setTranscript("");
    go("idle");
  }, [go]);

  /** Programa un aviso: cuando venza, CUBE habla por su cuenta (aunque esté en no molestar). */
  const remind = useCallback((delayMs: number, note?: string) => {
    const id = window.setTimeout(() => {
      reminderTimers.current.delete(id);
      const persona = settingsRef.current.persona;
      void sayRef.current(
        {
          kind: "reminder",
          text: note
            ? phrase(persona, "reminderNote", { note })
            : phrase(persona, "reminderElapsed", { elapsed: fmtDelay(delayMs) }),
          action: { type: "reminder", label: "⏰ Recordatorio", icon: "bell" },
        },
        { force: true },
      );
    }, delayMs);
    reminderTimers.current.add(id);
  }, []);

  /** Ejecuta acciones permitidas en Windows y mantiene el registro visual. */
  const applyAction = useCallback(
    async (action: AgentAction) => {
      const result = await executeAction(action);
      if (action.type === "reminder" && action.payload?.delayMs) remind(action.payload.delayMs, action.payload.note);
      if (action.type === "settings" && typeof action.payload?.dnd === "boolean") setDnd(action.payload.dnd);
      onActionRef.current?.(action);
      return result;
    },
    [remind, setDnd],
  );

  /** Segunda mitad del ciclo: estilo → mostrar → hablar → celebrar → dejar el micro abierto si preguntó. */
  const deliver = useCallback(
    async (raw: AgentReply, run: number, proactive: boolean) => {
      const { lang, tts, persona, voiceURI, voiceProvider, fishApiKey, fishReferenceId, chime } = settingsRef.current;
      if (runRef.current !== run) return;
      const completed = await resolveActionReply(raw, applyAction);
      if (runRef.current !== run) return;
      const reply = stylize(completed, persona, inferKind(completed, proactive));
      // Buttons are usable as soon as the proposal appears, including while TTS speaks.
      setFollowUp(reply.followUp ?? null);

      setMessages((m) => [
        ...m,
        { id: uid(), role: "cube", text: reply.text, action: reply.action, at: Date.now(), proactive },
      ]);
      const bubbleId = uid();
      if (bubbleTimer.current) window.clearTimeout(bubbleTimer.current);
      setBubble({ id: bubbleId, text: reply.text, action: reply.action, quickReplies: !!reply.followUp, proactive });
      go("speaking");

      await speak(reply.text, { lang, enabled: tts, persona, voiceURI, voiceProvider, fishApiKey, fishReferenceId, chime });
      if (runRef.current !== run) return;

      if (reply.celebrate) {
        go("happy");
        await sleep(650);
        if (runRef.current !== run) return;
      }

      go("idle");
      scheduleBubbleHide(bubbleId, reply.followUp ? BUBBLE_TTL_QUESTION : BUBBLE_TTL);

      // Si CUBE ha preguntado algo, deja el micro abierto unos segundos: basta con decir «sí».
      if (reply.followUp && listenerRef.current?.available) {
        listenerRef.current.armCommand({ manual: false, timeoutMs: 6000 });
      }

      // Mensajes de iniciativa que quedaron en cola mientras estaba ocupado.
      const next = queueRef.current.shift();
      if (next) {
        window.setTimeout(() => {
          if (stateRef.current === "idle") void sayRef.current(next, { force: true });
          else queueRef.current.unshift(next);
        }, 900);
      }
    },
    [applyAction, go, scheduleBubbleHide, setFollowUp],
  );

  /** CUBE habla por iniciativa propia (saludos, avisos, comentarios, recordatorios). */
  const say = useCallback(
    async (input: AgentReply | string, opts?: SayOptions) => {
      const reply = typeof input === "string" ? { text: input } : input;
      if (!activeRef.current) return false;
      if (dndRef.current && !opts?.force) return false;
      if (stateRef.current !== "idle") {
        if (queueRef.current.length < QUEUE_MAX) queueRef.current.push(reply);
        return true;
      }
      const run = ++runRef.current;
      await deliver(reply, run, true);
      return true;
    },
    [deliver],
  );
  sayRef.current = say;

  /** Pipeline texto → cerebro → respuesta hablada. */
  const ask = useCallback(
    async (text: string, meta?: { simulated?: boolean }) => {
      const clean = text.trim();
      if (!clean) return;
      if (stateRef.current !== "idle") interrupt();

      const run = ++runRef.current;
      const { lang, persona } = settingsRef.current;
      const controller = new AbortController();
      abortRef.current = controller;
      const history = messagesRef.current.filter((m) => m.id !== "welcome" && !m.proactive && !m.simulated).slice(-12)
        .map((m) => ({ role: m.role === "cube" ? "assistant" as const : "user" as const, text: m.text }));

      setMessages((m) => [...m, { id: uid(), role: "user", text: clean, at: Date.now(), simulated: meta?.simulated }]);
      setBubble(null);
      go("thinking");

      // ¿Estaba CUBE esperando un sí / no?
      let reply: AgentReply | null = null;
      const fu = followUpRef.current;
      if (fu) {
        setFollowUp(null);
        if (YES_RE.test(clean)) reply = fu.yes;
        else if (NO_RE.test(clean)) reply = { kind: "ack", text: fu.no ?? phrase(persona, "declined") };
      }
      if (reply) await sleep(420);
      else {
        try { reply = await think(clean, lang, persona, settingsRef.current, controller.signal, history); }
        catch (e) {
          if (controller.signal.aborted || runRef.current !== run) return;
          reply = { kind: "error", text: e instanceof Error ? e.message : "No pude completar la consulta." };
        }
      }
      if (runRef.current !== run) return;

      await deliver(reply, run, false);
    },
    [deliver, go, interrupt, setFollowUp],
  );

  /** Eventos del detector de palabra de activación. */
  const handleEvent = useCallback(
    (e: HandsFreeEvent) => {
      switch (e.type) {
        case "error":
          setVoiceError(e.message);
          break;
        case "status":
          setHandsFree(e.status);
          if (e.status === "active") setVoiceError("");
          // Si el micro se deniega justo cuando esperábamos una orden, no dejar al mascot "escuchando".
          if ((e.status === "denied" || e.status === "unsupported") && stateRef.current === "listening" && !abortRef.current) {
            setTranscript("");
            go("idle");
            showBubble(phrase(settingsRef.current.persona, "micDenied"));
          }
          break;
        case "wake": {
          if (isTauri()) void getCurrentWindow().show();
          const s = stateRef.current;
          if (s === "speaking" || s === "thinking" || s === "happy") {
            runRef.current += 1;
            cancelSpeech();
          }
          if (e.command) {
            void ask(e.command);
          } else {
            setBubble((b) => (b?.quickReplies ? b : null));
            setTranscript("");
            go("listening");
          }
          break;
        }
        case "interim":
          setTranscript(e.text);
          break;
        case "command":
          if (isTauri()) void getCurrentWindow().show();
          setTranscript("");
          void ask(e.text);
          break;
        case "timeout":
          if (stateRef.current === "listening") {
            setTranscript("");
            go("idle");
            if (e.manual) showBubble(phrase(settingsRef.current.persona, "notHeard"));
          }
          break;
      }
    },
    [ask, go, showBubble],
  );
  handleEventRef.current = handleEvent;

  /** Activa/desactiva la escucha (clic en el mascot, ◉, Ctrl+Espacio). */
  const toggleListening = useCallback(async () => {
    const l = listenerRef.current;
    if (stateRef.current === "listening") {
      if (l?.inCommand) {
        l.cancelCommand();
      } else if (abortRef.current) {
        abortRef.current.abort(); // la sesión puntual resuelve `null` y vuelve a idle
        return;
      }
      setTranscript("");
      go("idle");
      return;
    }
    if (stateRef.current === "speaking" || stateRef.current === "thinking" || stateRef.current === "happy") {
      interrupt();
      return;
    }

    setBubble(null);
    setTranscript("");

    // Con manos libres activo, el clic simplemente abre la fase de orden (sin palabra clave).
    if (l?.available) {
      l.armCommand({ manual: true });
      return;
    }

    // Sin escucha continua: sesión puntual (o demo si no hay micrófono).
    const run = ++runRef.current;
    const { lang } = settingsRef.current;
    go("listening");
    const ac = new AbortController();
    abortRef.current = ac;
    const result = await listen({ lang, onInterim: setTranscript, signal: ac.signal });
    if (runRef.current !== run) return;
    abortRef.current = null;
    setTranscript("");

    if (!result) {
      go("idle");
      if (!ac.signal.aborted) showBubble(phrase(settingsRef.current.persona, "notHeard"));
      return;
    }
    setFallbackMic(result.simulated ? "demo" : "real");
    await ask(result.text, { simulated: result.simulated });
  }, [ask, go, interrupt, showBubble]);

  /** Reintenta el modo manos libres desde un gesto del usuario (pide permiso de micro). */
  const retryHandsFree = useCallback(() => {
    let l = listenerRef.current;
    if (!l) {
      l = new HandsFreeListener({ lang: settingsRef.current.lang, onEvent: (e) => handleEventRef.current(e) });
      listenerRef.current = l;
    }
    const start = () => l!.start();
    if (isTauri()) { start(); return; }
    const md = navigator.mediaDevices;
    if (md?.getUserMedia) {
      md.getUserMedia({ audio: true })
        .then((stream) => {
          stream.getTracks().forEach((t) => t.stop());
          start();
        })
        .catch(start);
    } else {
      start();
    }
  }, []);

  /** Apagado suave: atenúa los ojos antes de desaparecer. */
  const powerOff = useCallback(async () => {
    interrupt();
    go("off");
    await sleep(420);
  }, [go, interrupt]);

  const wake = useCallback(() => {
    if (stateRef.current === "off") go("idle");
  }, [go]);

  const toggleDnd = useCallback(() => {
    const next = !dndRef.current;
    setDnd(next);
    showBubble(phrase(settingsRef.current.persona, next ? "dndOn" : "dndOff"));
  }, [setDnd, showBubble]);

  const quickReply = useCallback((yes: boolean) => void ask(yes ? "sí" : "no"), [ask]);

  /** Frase de prueba con la voz y personalidad actuales (desde Configuración). */
  const testVoice = useCallback(() => {
    if (stateRef.current !== "idle") interrupt();
    void sayRef.current({ kind: "notice", text: phrase(settingsRef.current.persona, "voiceTest") }, { force: true });
  }, [interrupt]);

  const clearMessages = useCallback(() => {
    const next = [welcome(settingsRef.current.persona)];
    setMessages(next);
    try { localStorage.removeItem(MEMORY_KEY); } catch { /* noop */ }
  }, []);

  /* ---------- cambio de personalidad: se presenta ---------- */
  useEffect(() => {
    if (prevPersona.current === settings.persona) return;
    prevPersona.current = settings.persona;
    interrupt();
    void sayRef.current({ kind: "notice", text: phrase(settings.persona, "switch") }, { force: true });
  }, [settings.persona, interrupt]);

  /* ---------- ciclo de vida de la escucha continua ---------- */
  useEffect(() => {
    if (!settings.handsFree || !active) {
      listenerRef.current?.stop();
      setHandsFree("off");
      return;
    }
    let l = listenerRef.current;
    if (!l) {
      l = new HandsFreeListener({ lang: settings.lang, onEvent: (e) => handleEventRef.current(e) });
      listenerRef.current = l;
    }
    l.setLang(settings.lang);
    l.start();
  }, [settings.handsFree, settings.lang, active]);

  // Mientras CUBE habla en voz alta, deja de escuchar para no oírse a sí mismo.
  useEffect(() => {
    const l = listenerRef.current;
    if (!l) return;
    const speakingAloud = state === "speaking" && settings.tts && isSynthesisSupported();
    if (state === "off" || speakingAloud) l.pause();
    else l.resume();
  }, [state, settings.tts]);

  useEffect(
    () => () => {
      listenerRef.current?.stop();
      abortRef.current?.abort();
      cancelSpeech();
      if (bubbleTimer.current) window.clearTimeout(bubbleTimer.current);
      if (followUpTimer.current) window.clearTimeout(followUpTimer.current);
      reminderTimers.current.forEach((t) => window.clearTimeout(t));
    },
    [],
  );

  const micMode: "unknown" | "real" | "demo" =
    handsFree === "active" || handsFree === "paused" ? "real" : fallbackMic;

  return {
    state,
    messages,
    bubble,
    transcript,
    micMode,
    handsFree,
    voiceError,
    dnd,
    ask,
    say,
    remind,
    toggleListening,
    interrupt,
    dismissBubble,
    showBubble,
    powerOff,
    wake,
    clearMessages,
    toggleDnd,
    quickReply,
    retryHandsFree,
    testVoice,
  };
}

export type CubeAgent = ReturnType<typeof useCubeAgent>;
