import { cn } from "@/utils/cn";

/** Pequeña onda de audio (5 barras) que aparece bajo el mascot al escuchar. */
export function AudioWave({ className, height = 14 }: { className?: string; height?: number }) {
  return (
    <div className={cn("flex items-center gap-[3px]", className)} style={{ height }} aria-hidden>
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          className="wave-bar block w-[2.5px] rounded-full bg-white"
          style={{ height, boxShadow: "0 0 6px rgba(255,255,255,0.6)" }}
        />
      ))}
    </div>
  );
}
