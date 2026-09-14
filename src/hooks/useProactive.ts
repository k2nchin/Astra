import { useEffect, useRef } from "react";
import { greeting, hourChime, pickNudge, returnMessage, type ProactiveContext } from "@/lib/proactive";
import type { AgentReply, HandsFreeStatus, Initiative, PersonaId } from "@/types";

interface Options {
  say: (reply: AgentReply | string, opts?: { force?: boolean }) => Promise<boolean>;
  /** El mascot está en pantalla. */
  enabled: boolean;
  level: Initiative;
  persona: PersonaId;
  handsFree: HandsFreeStatus;
  /** Cambia en cada arranque (para volver a saludar tras "Salir" → reabrir). */
  sessionId: number;
  getOpenApps: () => string[];
}

const AWAY_MS = 90_000;
const FIRST_NUDGE_MS = 50_000;
const NUDGE_MIN_MS = 150_000;
const NUDGE_MAX_MS = 260_000;
const PRESENT_MS = 3 * 60_000;

/**
 * Iniciativa de CUBE: habla sin que se lo pidan.
 *   - saludo al arrancar
 *   - «bienvenido de vuelta» tras una ausencia
 *   - comentarios/preguntas contextuales (nivel alto)
 *   - hora en punto (nivel alto)
 * Los recordatorios los gestiona el propio agente (`remind`).
 */
export function useProactive({ say, enabled, level, persona, handsFree, sessionId, getOpenApps }: Options) {
  const sayRef = useRef(say);
  const levelRef = useRef(level);
  const personaRef = useRef(persona);
  const enabledRef = useRef(enabled);
  const handsFreeRef = useRef(handsFree);
  const appsRef = useRef(getOpenApps);
  sayRef.current = say;
  levelRef.current = level;
  personaRef.current = persona;
  enabledRef.current = enabled;
  handsFreeRef.current = handsFree;
  appsRef.current = getOpenApps;

  const startRef = useRef(Date.now());
  const lastActiveRef = useRef(Date.now());
  const usedRef = useRef(new Set<string>());
  const greetedRef = useRef(-1);

  const ctx = (): ProactiveContext => ({
    hour: new Date().getHours(),
    minutesActive: Math.round((Date.now() - startRef.current) / 60_000),
    openApps: appsRef.current(),
    handsFree: handsFreeRef.current,
    used: usedRef.current,
  });

  /* ---------- saludo (una vez por sesión) ---------- */
  useEffect(() => {
    if (!enabled || level === "off" || greetedRef.current === sessionId) return;
    const t = window.setTimeout(() => {
      greetedRef.current = sessionId;
      startRef.current = Date.now();
      void sayRef.current(greeting(ctx(), personaRef.current));
    }, 1600);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, level, sessionId]);

  /* ---------- presencia: vuelta tras ausencia ---------- */
  useEffect(() => {
    let lastTick = 0;
    let hiddenAt = 0;
    const onActivity = () => {
      const now = Date.now();
      if (now - lastTick < 1000) return; // throttle
      lastTick = now;
      const gap = now - lastActiveRef.current;
      lastActiveRef.current = now;
      if (gap > AWAY_MS && enabledRef.current && levelRef.current !== "off") {
        void sayRef.current(returnMessage(Math.round(gap / 60_000), personaRef.current));
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
      } else if (hiddenAt) {
        // La ausencia empieza cuando se ocultó la pestaña; el siguiente movimiento la cierra.
        lastActiveRef.current = Math.min(lastActiveRef.current, hiddenAt);
        hiddenAt = 0;
      }
    };
    const events: Array<keyof WindowEventMap> = ["pointermove", "pointerdown", "keydown", "wheel"];
    events.forEach((ev) => window.addEventListener(ev, onActivity, { passive: true }));
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      events.forEach((ev) => window.removeEventListener(ev, onActivity));
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  /* ---------- comentarios contextuales (nivel alto) ---------- */
  useEffect(() => {
    if (!enabled || level !== "high") return;
    let timer = 0;
    const schedule = (ms: number) => {
      timer = window.setTimeout(tick, ms);
    };
    const tick = () => {
      const present = document.visibilityState === "visible" && Date.now() - lastActiveRef.current < PRESENT_MS;
      if (!present) {
        schedule(45_000); // no hablarle a una habitación vacía
        return;
      }
      const nudge = pickNudge(ctx(), personaRef.current);
      if (nudge) void sayRef.current(nudge);
      schedule(NUDGE_MIN_MS + Math.random() * (NUDGE_MAX_MS - NUDGE_MIN_MS));
    };
    schedule(FIRST_NUDGE_MS + Math.random() * 15_000);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, level, sessionId]);

  /* ---------- hora en punto (nivel alto) ---------- */
  useEffect(() => {
    if (!enabled || level !== "high") return;
    let last = new Date().getHours();
    const iv = window.setInterval(() => {
      const d = new Date();
      if (d.getHours() === last) return;
      last = d.getHours();
      const present = document.visibilityState === "visible" && Date.now() - lastActiveRef.current < PRESENT_MS;
      if (d.getMinutes() < 2 && present) void sayRef.current(hourChime(d, personaRef.current));
    }, 20_000);
    return () => window.clearInterval(iv);
  }, [enabled, level]);
}
