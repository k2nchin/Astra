import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

export interface Point {
  x: number;
  y: number;
}

interface Options {
  /** Tamaño del elemento arrastrable (para limitar a la pantalla). */
  width: number;
  height: number;
  /** Margen inferior reservado (barra de tareas). */
  bottomInset?: number;
  margin?: number;
  storageKey?: string;
  /** Posición inicial si no hay nada guardado. */
  initial?: (vw: number, vh: number) => Point;
}

const DRAG_THRESHOLD = 5;

/**
 * Arrastre con pointer events. Distingue clic de drag mediante un umbral
 * de movimiento y expone `wasDragRef` para que el padre ignore el clic
 * que el navegador dispara al soltar tras arrastrar.
 */
export function useDraggable(opts: Options) {
  const { width, height, bottomInset = 56, margin = 8, storageKey, initial } = opts;

  const clamp = useCallback(
    (p: Point): Point => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      return {
        x: Math.min(Math.max(p.x, margin), Math.max(margin, vw - width - margin)),
        y: Math.min(Math.max(p.y, margin), Math.max(margin, vh - height - bottomInset - margin)),
      };
    },
    [width, height, bottomInset, margin],
  );

  const [pos, setPos] = useState<Point>(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (storageKey) {
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          const p = JSON.parse(raw) as Point;
          if (Number.isFinite(p.x) && Number.isFinite(p.y)) return p;
        }
      } catch {
        /* ignore */
      }
    }
    return initial ? initial(vw, vh) : { x: vw - width - 48, y: vh - height - 140 };
  });

  const [dragging, setDragging] = useState(false);
  const wasDragRef = useRef(false);
  const dragRef = useRef<{
    id: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);

  // Mantener dentro de pantalla al redimensionar o cambiar tamaño.
  useEffect(() => {
    setPos((p) => clamp(p));
    const onResize = () => setPos((p) => clamp(p));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [clamp]);

  const persist = useCallback(
    (p: Point) => {
      if (!storageKey) return;
      try {
        localStorage.setItem(storageKey, JSON.stringify(p));
      } catch {
        /* ignore */
      }
    },
    [storageKey],
  );

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      const el = e.currentTarget;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      dragRef.current = {
        id: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        originX: pos.x,
        originY: pos.y,
        moved: false,
      };
    },
    [pos.x, pos.y],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const d = dragRef.current;
      if (!d || d.id !== e.pointerId) return;
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      if (!d.moved) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        d.moved = true;
        wasDragRef.current = true;
        setDragging(true);
      }
      setPos(clamp({ x: d.originX + dx, y: d.originY + dy }));
    },
    [clamp],
  );

  const endDrag = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const d = dragRef.current;
      if (!d || d.id !== e.pointerId) return;
      dragRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      if (d.moved) {
        setDragging(false);
        setPos((p) => {
          persist(p);
          return p;
        });
        // El click sintético llega justo después del pointerup.
        setTimeout(() => {
          wasDragRef.current = false;
        }, 0);
      }
    },
    [persist],
  );

  const resetPosition = useCallback(() => {
    const p = clamp(initial ? initial(window.innerWidth, window.innerHeight) : { x: 0, y: 0 });
    setPos(p);
    persist(p);
  }, [clamp, initial, persist]);

  return {
    pos,
    dragging,
    wasDragRef,
    resetPosition,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
    },
  };
}
