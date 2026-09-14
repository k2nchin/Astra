import { useEffect, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { askGemini, GEMINI_MODEL, GEMINI_MODELS } from "@/lib/gemini";
import type { Settings } from "@/types";

export function GeminiSettings({ settings, onChange }: { settings: Settings; onChange: (patch: Partial<Settings>) => void }) {
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [success, setSuccess] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    if (isTauri()) void invoke<boolean>("gemini_key_status").then((v) => { if (alive.current) setSaved(v); }).catch(() => {});
    return () => { alive.current = false; };
  }, []);
  const test = async () => {
    setBusy(true); setStatus("Comprobando una respuesta de Gemini…"); setSuccess(false);
    try {
      const reply = await askGemini(settings, "Responde únicamente: Conexión con CUBE lista.", "es-ES", [], undefined, false);
      if (!alive.current) return;
      if (reply.followUp) throw new Error("El modelo no respondió a la prueba de texto.");
      if (isTauri() && settings.apiKey.trim()) {
        await invoke("gemini_save_key", { key: settings.apiKey.trim() });
        if (!alive.current) return;
        setSaved(true);
        onChange({ apiKey: "" });
      }
      setStatus(`Conectado a ${settings.model.trim() || GEMINI_MODEL}. Puedes volver al chat.`);
      setSuccess(true);
    } catch (e) { if (alive.current) setStatus(e instanceof Error ? e.message : "No se pudo comprobar la conexión."); }
    finally { if (alive.current) setBusy(false); }
  };
  return <div className="space-y-2.5">
    <p className="text-[11px] leading-relaxed text-zinc-400">Usa tu API key de Google AI Studio. Gemini recibirá el texto y el historial reciente del chat; el reconocimiento del micrófono seguirá siendo local.</p>
    <label className="block text-[11px] text-zinc-300">API key de Gemini
      <input type="password" autoComplete="off" spellCheck={false} value={settings.apiKey} disabled={busy}
        onChange={(e) => { setStatus(""); setSuccess(false); onChange({ apiKey: e.target.value }); }} placeholder={saved ? "Clave guardada · escribe otra para cambiarla" : "Pega aquí tu clave de Gemini"}
        className="mt-1 h-9 w-full rounded-lg border border-white/15 bg-white/[0.04] px-2 text-[11px] text-zinc-100 outline-none focus:border-cyan-300/60" />
    </label>
    <p className="text-[10px] leading-relaxed text-zinc-500">{isTauri() ? saved ? "Hay una clave cifrada guardada para tu usuario de Windows." : "Se guardará cifrada por Windows al superar la prueba." : "Vista web: la clave solo permanece en memoria durante esta sesión."}</p>
    <label className="block text-[11px] text-zinc-300">Modelo
      <select value={settings.model || GEMINI_MODEL} disabled={busy} onChange={(e) => { setStatus(""); setSuccess(false); onChange({ model: e.target.value }); }}
        className="mt-1 h-9 w-full rounded-lg border border-white/15 bg-white/[0.04] px-2 text-[11px] text-zinc-100 outline-none focus:border-cyan-300/60">
        {GEMINI_MODELS.map((model) => <option key={model} value={model}>{model}</option>)}
      </select>
    </label>
    <button onClick={() => void test()} disabled={busy || (!saved && !settings.apiKey.trim())}
      className="w-full rounded-lg border border-cyan-300/30 bg-cyan-300/10 py-2 text-[12px] text-cyan-100 disabled:opacity-40">
      {busy ? "Probando…" : settings.apiKey.trim() && isTauri() ? "Guardar y probar" : "Probar conexión"}
    </button>
    {status && <p role={success ? "status" : "alert"} className={`text-[11px] leading-relaxed ${success ? "text-emerald-300" : "text-amber-200"}`}>{status}</p>}
    <p className="text-[10px] text-zinc-500">La prueba realiza una petición a tu cuenta de Gemini.</p>
  </div>;
}
