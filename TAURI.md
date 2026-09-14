# CUBE AI → Tauri (siguiente paso)

Este prototipo web ya contiene toda la capa de interfaz del mascot
(`src/components/FloatingAgent.tsx`, `CubeMascot.tsx`, estados, voz, chat, menú).
Para convertirlo en el agente de escritorio de Windows solo hay que:

## 1. Ventana transparente y flotante

`src-tauri/tauri.conf.json`

```json
{
  "app": {
    "windows": [
      {
        "label": "mascot",
        "title": "CUBE AI",
        "width": 120,
        "height": 150,
        "transparent": true,
        "decorations": false,
        "alwaysOnTop": true,
        "skipTaskbar": true,
        "resizable": false,
        "shadow": false
      }
    ],
    "macOSPrivateApi": true
  }
}
```

En `App.tsx` sustituye `<Desktop>` por un `<div className="h-full bg-transparent">`
y renderiza solo `<FloatingAgent />`. Para arrastrar la ventana real usa
`getCurrentWindow().startDragging()` en el `onPointerDown` del mascot
(en vez de mover un `div`), o mantén el drag interno y llama a
`setPosition(new PhysicalPosition(x, y))`.

## 2. Comandos Rust (donde están los `TODO(tauri)` de `src/lib/brain.ts`)

```rust
#[tauri::command]
fn open_app(name: String) -> Result<(), String> {
    std::process::Command::new("cmd")
        .args(["/C", "start", "", &name])
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn search_files(query: String) -> Vec<String> { /* walkdir / Everything SDK */ vec![] }

#[tauri::command]
fn media_key(action: String) { /* enigo: play/pause, next */ }

#[tauri::command]
fn screenshot() -> String { /* screenshots crate → ruta PNG */ String::new() }
```

Y en el front, en `App.tsx → onAction`:

```ts
import { invoke } from "@tauri-apps/api/core";
if (action.type === "open_app") await invoke("open_app", { name: action.label });
```

## 3. Cerebro

`src/lib/brain.ts → think()` es el único punto que hay que cambiar para pasar
de reglas locales a un LLM (OpenAI / Claude / Ollama local). Mantén el contrato
`AgentReply { text, action?, celebrate? }` y todo lo demás sigue funcionando.

## 4. Voz

`src/lib/speech.ts` expone `listen()` y `speak()`. Sustituye su interior por
Whisper local / Azure STT y Piper / ElevenLabs sin tocar el hook `useCubeAgent`.

## 4a. Personalidad «Raphael» y voz

- `src/lib/persona.ts` define las personalidades (`cube`, `raphael`): perfil de
  voz (tono/velocidad/voces preferidas), fórmulas de apertura y frases fijas.
  `stylize()` adapta cualquier respuesta al estilo activo, así que el LLM puede
  devolver texto neutro y CUBE lo dirá como «Respuesta. …» / «Confirmado. …».
- En el navegador la voz es la del sistema (Web Speech, pitch 0.8). En Tauri usa
  un TTS neuronal con voz femenina serena, p. ej. Azure `es-ES-ElviraNeural`
  (SSML: `<prosody pitch="-8%" rate="0.97">`) o Piper `es_ES-sharvard-medium`.
  **No** se puede usar la voz real de la actriz de doblaje: la personalidad es
  la forma de hablar, no una clonación.
- Cuando conectes el LLM, añade al system prompt: «Responde como Raphael, Señor
  de la Sabiduría: frases cortas y precisas, empieza con Aviso./Respuesta./
  Confirmado./Propuesta., trata al usuario de Maestro, termina las propuestas
  con ¿Aprobar?».

## 4b. Manos libres («Hey CUBE» / «Rafael») e iniciativa

- `src/lib/wakeword.ts` (`HandsFreeListener`) hoy usa Web Speech continuo.
  En escritorio sustitúyelo por **Porcupine** u **openWakeWord** (palabra clave
  local, sin red, ~1 % CPU) + **Whisper** para la orden. Emite los mismos eventos:
  `status → wake → interim* → command | timeout`, así `useCubeAgent` no cambia.
- El agente ya pausa la escucha mientras habla (para no oírse) y deja el micro
  abierto 6 s tras hacer una pregunta (basta con decir «sí»).
- `src/hooks/useProactive.ts` decide *cuándo* habla CUBE por su cuenta; en Tauri
  alimenta `ProactiveContext` con datos reales: ventana activa (`active-win`),
  reproducción (Spotify Web API / SMTC), batería, calendario, inactividad del
  sistema (`GetLastInputInfo` en Windows en vez de eventos del DOM).
- «No molestar» (`dnd`) y los recordatorios (`remind`) viven en el agente; en
  escritorio, añade `tauri-plugin-notification` para que el aviso llegue aunque
  el mascot esté oculto.

## 5. Bandeja y atajo global

- `tauri-plugin-global-shortcut` → `Ctrl+Space` (ya lo escucha el front).
- `TrayIconBuilder` con el icono 32×32 del pack; menú: Chat · Voz · Configuración · Ocultar · Salir.
