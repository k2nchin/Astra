/**
 * Tono de sistema (blip suave de dos notas) que suena justo antes de que
 * CUBE hable, al estilo de un aviso de interfaz. WebAudio puro, sin assets.
 */

let ctx: AudioContext | null = null;
let unlocked = false;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function getCtx(): AudioContext | null {
  if (ctx) return ctx;
  const AC =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  try {
    ctx = new AC();
  } catch {
    return null;
  }
  return ctx;
}

/** Los navegadores solo permiten audio tras un gesto: lo desbloqueamos en el primero. */
export function installAudioUnlock() {
  if (unlocked) return () => {};
  const remove = () => {
    window.removeEventListener("pointerdown", unlock, true);
    window.removeEventListener("keydown", unlock, true);
  };
  const unlock = () => {
    const c = getCtx();
    if (c && c.state === "suspended") void c.resume().catch(() => undefined);
    unlocked = true;
    remove();
  };
  window.addEventListener("pointerdown", unlock, true);
  window.addEventListener("keydown", unlock, true);
  return remove;
}

export async function playChime(kind: "notice" | "ok" = "notice"): Promise<void> {
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") await Promise.race([c.resume().catch(() => undefined), sleep(120)]);
  if (c.state !== "running") return;

  const t0 = c.currentTime + 0.01;
  const notes: Array<[freq: number, at: number]> =
    kind === "notice" ? [[1046.5, 0], [1567.98, 0.1]] : [[1318.5, 0], [1760, 0.09]];

  for (const [freq, at] of notes) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0 + at);
    gain.gain.exponentialRampToValueAtTime(0.05, t0 + at + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.17);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(t0 + at);
    osc.stop(t0 + at + 0.2);
  }
  await sleep(260);
}
