import {
  Bell,
  Box,
  Clock,
  Code2,
  Folder,
  Globe,
  Image,
  Music2,
  ShieldCheck,
  Sparkles,
  Sun,
  Terminal,
  Volume2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/utils/cn";
import type { ActionIcon, AgentAction } from "@/types";

export const ACTION_ICONS: Record<ActionIcon, LucideIcon> = {
  code: Code2,
  music: Music2,
  folder: Folder,
  terminal: Terminal,
  image: Image,
  box: Box,
  clock: Clock,
  globe: Globe,
  volume: Volume2,
  shield: ShieldCheck,
  sparkles: Sparkles,
  sun: Sun,
  bell: Bell,
};

export function ActionChip({ action, className }: { action: AgentAction; className?: string }) {
  const Icon = ACTION_ICONS[action.icon] ?? Sparkles;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-2 py-0.5 text-[10.5px] font-medium tracking-wide text-zinc-200",
        className,
      )}
    >
      <Icon className="h-3 w-3 text-zinc-300" strokeWidth={2} />
      {action.label}
    </span>
  );
}
