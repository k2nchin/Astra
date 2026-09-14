import { useId } from "react";
import { cn } from "@/utils/cn";
import type { AgentState } from "@/types";

type Pt = [x: number, y: number, r: number];

/** Polígono con esquinas redondeadas (curvas cuadráticas). */
function roundedPolygon(pts: Pt[]) {
  const n = pts.length;
  let d = "";
  for (let i = 0; i < n; i++) {
    const [x, y, r] = pts[i];
    const [px, py] = pts[(i - 1 + n) % n];
    const [nx, ny] = pts[(i + 1) % n];
    const l1 = Math.hypot(px - x, py - y) || 1;
    const l2 = Math.hypot(nx - x, ny - y) || 1;
    const p1 = [x + ((px - x) / l1) * r, y + ((py - y) / l1) * r];
    const p2 = [x + ((nx - x) / l2) * r, y + ((ny - y) / l2) * r];
    d += `${i === 0 ? "M" : "L"}${p1[0].toFixed(2)} ${p1[1].toFixed(2)} Q${x} ${y} ${p2[0].toFixed(2)} ${p2[1].toFixed(2)} `;
  }
  return d + "Z";
}

/*  Geometría (viewBox 120×120) — proyección oblicua de un cubo:
 *
 *      A(20,20) ───────── B(88,20)
 *        │  ╲  top          ╲
 *        │   G(36,40) ─────── C(104,40)
 *        │ left │   front      │
 *      F(20,88) │              │
 *          ╲    E(36,108) ──── D(104,108)
 */
const SILHOUETTE = roundedPolygon([
  [20, 20, 14],
  [88, 20, 11],
  [104, 40, 11],
  [104, 108, 16],
  [36, 108, 12],
  [20, 88, 10],
]);
const TOP = "M20 20 L88 20 L104 40 L36 40 Z";
const LEFT = "M20 20 L36 40 L36 108 L20 88 Z";
const FRONT = "M36 40 L104 40 L104 108 L36 108 Z";

// Manchas negras "cromo líquido"
const SWIRLS = [
  "M26 26 C40 16, 66 15, 82 23 C92 28, 88 35, 74 34 C60 33, 48 37, 38 35 C28 33, 20 30, 26 26 Z",
  "M18 48 C28 44, 36 54, 34 68 C32 82, 26 96, 18 90 Z",
  "M80 36 C92 34, 106 44, 106 62 C106 72, 98 70, 94 60 C90 50, 82 46, 76 42 Z",
  "M34 90 C42 84, 54 90, 57 98 C60 106, 50 111, 42 108 C34 105, 28 96, 34 90 Z",
];
// Visor oscuro donde viven los ojos
const VISOR =
  "M46 60 C46 50, 56 46, 70 46 C90 46, 104 52, 106 70 C108 88, 96 102, 78 103 C60 104, 46 94, 46 80 Z";

interface Props {
  state: AgentState;
  size?: number;
  idleMotion?: boolean;
  /** Sombra proyectada en el "suelo". */
  ground?: boolean;
  /** Color de los ojos: neutro (CUBE) o hielo (Raphael). */
  tone?: "neutral" | "ice";
  className?: string;
  title?: string;
}

export function CubeMascot({
  state,
  size = 64,
  idleMotion = true,
  ground = true,
  tone = "neutral",
  className,
  title = "Astra",
}: Props) {
  return (
    <img
      src="/cube-aura.png"
      width={size}
      height={size}
      className={cn("cube-body block select-none object-contain overflow-visible", !idleMotion && "no-idle", className)}
      data-state={state}
      alt={title}
      draggable={false}
      style={{ filter: "drop-shadow(0 8px 12px rgba(0,0,0,0.55))" }}
    />
  );

  /* Legacy vector renderer retained below for fallback/reference. */
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const id = (k: string) => `${uid}-${k}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      className={cn("block select-none overflow-visible", className)}
      role="img"
      aria-label={title}
      style={{ filter: "drop-shadow(0 8px 12px rgba(0,0,0,0.55))" }}
    >
      <defs>
        <clipPath id={id("clip")}>
          <path d={SILHOUETTE} />
        </clipPath>
        <linearGradient id={id("top")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.55" stopColor="#d9d9de" />
          <stop offset="1" stopColor="#a6a6ae" />
        </linearGradient>
        <linearGradient id={id("left")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#b4b4bb" />
          <stop offset="0.6" stopColor="#5f5f67" />
          <stop offset="1" stopColor="#2c2c31" />
        </linearGradient>
        <linearGradient id={id("front")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f7f7f8" />
          <stop offset="0.4" stopColor="#cfcfd5" />
          <stop offset="0.75" stopColor="#9d9da6" />
          <stop offset="1" stopColor="#6f6f78" />
        </linearGradient>
        <radialGradient id={id("visor")} cx="0.32" cy="0.28" r="0.95">
          <stop offset="0" stopColor="#2b2b31" />
          <stop offset="0.55" stopColor="#111114" />
          <stop offset="1" stopColor="#050506" />
        </radialGradient>
        <linearGradient id={id("eye")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor={tone === "ice" ? "#b6e2ff" : "#dde4ff"} />
        </linearGradient>
        <linearGradient id={id("floor")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.4" />
        </linearGradient>
        <filter id={id("blur")} x="-50%" y="-200%" width="200%" height="500%">
          <feGaussianBlur stdDeviation="2.6" />
        </filter>
      </defs>

      {ground && (
        <ellipse
          className="cube-shadow"
          data-state={state}
          cx="62"
          cy="115"
          rx="27"
          ry="3.6"
          fill="#000"
          opacity="0.55"
          filter={`url(#${id("blur")})`}
        />
      )}

      <g className={cn("cube-body", !idleMotion && "no-idle")} data-state={state}>
        <g clipPath={`url(#${id("clip")})`}>
          {/* base + caras */}
          <path d={SILHOUETTE} fill="#b9b9c0" />
          <path d={TOP} fill={`url(#${id("top")})`} />
          <path d={LEFT} fill={`url(#${id("left")})`} />
          <path d={FRONT} fill={`url(#${id("front")})`} />

          {/* cromo líquido */}
          {SWIRLS.map((d, i) => (
            <path key={i} d={d} fill="#0a0a0c" opacity={i === 1 ? 0.92 : 1} />
          ))}

          {/* aristas suaves */}
          <path d="M20 20 L36 40" stroke="#fff" strokeOpacity="0.28" strokeWidth="1" />
          <path d="M36 40.5 L104 40.5" stroke="#fff" strokeOpacity="0.55" strokeWidth="1" />
          <path d="M36.5 40 L36.5 108" stroke="#fff" strokeOpacity="0.3" strokeWidth="1" />
          <path d="M28 20.7 L84 20.7" stroke="#fff" strokeOpacity="0.85" strokeWidth="1.3" strokeLinecap="round" />

          {/* visor */}
          <path d={VISOR} fill={`url(#${id("visor")})`} />
          <path d={VISOR} fill="none" stroke="#fff" strokeOpacity="0.08" strokeWidth="1" />

          {/* ojos */}
          <g className="cube-eyes" data-state={state} data-tone={tone}>
            <rect className="cube-eye left" x="60" y="63" width="7.5" height="17" rx="3.75" fill={`url(#${id("eye")})`} />
            <rect className="cube-eye right" x="76.5" y="63" width="7.5" height="17" rx="3.75" fill={`url(#${id("eye")})`} />
          </g>

          {/* brillos */}
          <ellipse cx="50" cy="50" rx="8.5" ry="3.2" fill="#fff" opacity="0.5" transform="rotate(-22 50 50)" />
          <ellipse cx="60" cy="24" rx="14" ry="2" fill="#fff" opacity="0.35" />
          <rect x="36" y="84" width="68" height="24" fill={`url(#${id("floor")})`} />
        </g>
        <path d={SILHOUETTE} fill="none" stroke="#fff" strokeOpacity="0.16" strokeWidth="1" />
      </g>
    </svg>
  );
}
