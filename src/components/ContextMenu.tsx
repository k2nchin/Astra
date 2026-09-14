import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/utils/cn";

export interface MenuItem {
  icon: LucideIcon;
  label: string;
  hint?: string;
  onSelect: () => void;
  danger?: boolean;
  dividerBefore?: boolean;
}

interface Props {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

/** Menú compacto (clic derecho / ▼). Se recoloca para no salirse de pantalla. */
export function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const nx = Math.min(x, window.innerWidth - r.width - 8);
    const ny = Math.min(y, window.innerHeight - r.height - 56 - 8);
    setPos({ x: Math.max(8, nx), y: Math.max(8, ny) });
  }, [x, y]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="menu"
      className="animate-pop fixed z-[80] min-w-[176px] origin-top-left rounded-xl border border-white/10 bg-zinc-900/95 p-1 shadow-[0_16px_50px_-12px_rgba(0,0,0,0.85)] backdrop-blur-xl"
      style={{ left: pos.x, top: pos.y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((it, i) => (
        <div key={it.label}>
          {it.dividerBefore && i > 0 && <div className="mx-2 my-1 h-px bg-white/10" />}
          <button
            role="menuitem"
            onClick={() => {
              onClose();
              it.onSelect();
            }}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[12.5px] text-zinc-200 transition-colors hover:bg-white/[0.08]",
              it.danger && "text-zinc-400 hover:text-red-300",
            )}
          >
            <it.icon className="h-3.5 w-3.5 shrink-0 opacity-80" strokeWidth={1.8} />
            <span className="flex-1">{it.label}</span>
            {it.hint && <span className="text-[10px] tracking-wide text-zinc-500">{it.hint}</span>}
          </button>
        </div>
      ))}
    </div>
  );
}
