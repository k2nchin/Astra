#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;
use xcap::Monitor;
mod desktop;
mod voice;
mod gemini;
mod fish;

#[tauri::command]
fn open_app(name: String) -> Result<(), String> {
    let key = name.trim().to_lowercase();
    let target = match key.as_str() {
        "visual studio code" | "code" => "code.exe",
        "blender" => "blender.exe",
        "photoshop" => "Photoshop.exe",
        "spotify" => "spotify.exe",
        "discord" => "discord.exe",
        "steam" => "steam.exe",
        "figma" => "Figma.exe",
        "la terminal" | "terminal" => "wt.exe",
        "el explorador de archivos" | "explorador de archivos" | "explorer" => "explorer.exe",
        "el navegador" | "navegador" => "msedge.exe",
        _ => return Err("Aplicación no permitida o no reconocida".into()),
    };

    // Popular per-user installs are usually not on PATH.
    let local = std::env::var_os("LOCALAPPDATA").map(PathBuf::from);
    let roaming = std::env::var_os("APPDATA").map(PathBuf::from);
    let candidate = match target {
        "code.exe" => local.map(|p| p.join("Programs/Microsoft VS Code/Code.exe")),
        "spotify.exe" => roaming.map(|p| p.join("Spotify/Spotify.exe")),
        "msedge.exe" => std::env::var_os("ProgramFiles(x86)").map(PathBuf::from).map(|p| p.join("Microsoft/Edge/Application/msedge.exe")),
        _ => None,
    };
    let executable = candidate.filter(|p| p.is_file()).unwrap_or_else(|| PathBuf::from(target));
    Command::new(executable)
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("No se pudo abrir {target}: {error}"))
}

#[tauri::command]
fn window_control(app: String, command: String) -> Result<(), String> {
    let process = match app.trim().to_lowercase().as_str() {
        "visual studio code" | "code" => "code",
        "blender" => "blender",
        "photoshop" => "Photoshop",
        "spotify" => "Spotify",
        "discord" => "Discord",
        "steam" => "steam",
        "figma" => "Figma",
        "terminal" => "WindowsTerminal",
        "navegador" | "el navegador" => "msedge",
        _ => return Err("Aplicación no permitida para control de ventana".into()),
    };
    let mode = match command.as_str() { "focus" => 9, "minimize" => 6, "maximize" => 3, "restore" => 9, _ => return Err("Operación de ventana no permitida".into()) };
    let script = format!(r#"Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class AstraWin {{ [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr h, int n); [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h); }}'; Get-Process -Name '{process}' -ErrorAction SilentlyContinue | Where-Object MainWindowHandle -ne 0 | ForEach-Object {{ [AstraWin]::ShowWindowAsync($_.MainWindowHandle, {mode}); if ('{command}' -eq 'focus' -or '{command}' -eq 'restore') {{ [AstraWin]::SetForegroundWindow($_.MainWindowHandle) }} }}"#);
    Command::new("powershell").args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", &script]).status().map_err(|e| format!("No se pudo controlar la ventana: {e}"))?.success().then_some(()).ok_or_else(|| "No se encontró una ventana abierta de esa aplicación.".into())
}

#[tauri::command]
fn search_files(query: String) -> Result<String, String> {
    let query = query.trim();
    if query.is_empty() || query.len() > 120 || query.chars().any(|c| matches!(c, '\\' | '/' | ':' | '"' | '\'')) {
        return Err("Término de búsqueda no válido".into());
    }

    let root = std::env::var_os("USERPROFILE")
        .map(PathBuf::from)
        .ok_or("No se encontró el perfil de usuario")?;
    let locations = [root.join("Documents"), root.join("Desktop"), root.join("Downloads")];
    let needle = query.to_lowercase();
    let mut matches = Vec::new();
    let mut remaining = 20_000;
    for location in locations {
        collect_matches(&location, &needle, &mut matches, 40, 0, &mut remaining);
    }

    let Some(target) = matches.first() else { return Ok(format!("No encontré archivos con «{query}» en Documentos, Escritorio o Descargas.")); };
    let folder = target.parent().unwrap_or(target);
    Command::new("explorer.exe")
        .arg(folder)
        .spawn()
        .map(|_| format!("Encontré {} coincidencias con «{}». Abrí la carpeta del primer resultado.", matches.len(), query))
        .map_err(|error| format!("No se pudo abrir el resultado: {error}"))
}

fn collect_matches(root: &Path, needle: &str, output: &mut Vec<PathBuf>, limit: usize, depth: usize, remaining: &mut usize) {
    use std::os::windows::fs::MetadataExt;
    if output.len() >= limit || depth > 8 || *remaining == 0 { return; }
    let Ok(metadata) = std::fs::symlink_metadata(root) else { return; };
    // Junctions can escape the requested folders or create recursive loops.
    if metadata.file_attributes() & 0x400 != 0 { return; }
    let Ok(entries) = std::fs::read_dir(root) else { return; };
    for entry in entries.flatten() {
        if output.len() >= limit || *remaining == 0 { return; }
        *remaining -= 1;
        let path = entry.path();
        let name = path.file_name().and_then(|v| v.to_str()).unwrap_or_default().to_lowercase();
        if name.contains(needle) { output.push(path.clone()); }
        if path.is_dir() && !name.starts_with('.') { collect_matches(&path, needle, output, limit, depth + 1, remaining); }
    }
}

#[tauri::command]
fn media_control(command: String) -> Result<(), String> {
    match command.as_str() {
        "play" | "pause" | "play_pause" => send_media_key(0xB3),
        "next" => send_media_key(0xB0),
        "previous" => send_media_key(0xB1),
        "volume_up" => send_media_key(0xAF),
        "volume_down" => send_media_key(0xAE),
        "mute" => send_media_key(0xAD),
        _ => Err("Control multimedia no permitido".into()),
    }
}

#[cfg(windows)]
fn send_media_key(key: u8) -> Result<(), String> {
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{keybd_event, KEYEVENTF_KEYUP};
    unsafe {
        keybd_event(key, 0, 0, 0);
        keybd_event(key, 0, KEYEVENTF_KEYUP, 0);
    }
    Ok(())
}

#[cfg(not(windows))]
fn send_media_key(_key: u8) -> Result<(), String> {
    Err("El control multimedia solo está disponible en Windows".into())
}

#[tauri::command]
fn take_screenshot() -> Result<String, String> {
    let monitors = Monitor::all()
        .map_err(|error| format!("No se pudieron enumerar las pantallas: {error}"))?;
    let monitor = monitors
        .iter()
        .find(|monitor| monitor.is_primary().unwrap_or(false))
        .or_else(|| monitors.first())
        .ok_or_else(|| "No se encontró ninguna pantalla disponible".to_string())?;

    let image = monitor
        .capture_image()
        .map_err(|error| format!("No se pudo capturar la pantalla: {error}"))?;

    let profile = std::env::var_os("USERPROFILE")
        .map(PathBuf::from)
        .ok_or_else(|| "No se encontró el perfil de usuario".to_string())?;
    let directory = profile.join("Pictures").join("Screenshots");
    std::fs::create_dir_all(&directory)
        .map_err(|error| format!("No se pudo crear la carpeta de capturas: {error}"))?;

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("No se pudo obtener la hora del sistema: {error}"))?
        .as_millis();
    let mut path = directory.join(format!("CUBE-{timestamp}.png"));
    let mut suffix = 1;
    while path.exists() {
        path = directory.join(format!("CUBE-{timestamp}-{suffix}.png"));
        suffix += 1;
    }

    image
        .save(&path)
        .map_err(|error| format!("No se pudo guardar la captura: {error}"))?;
    Ok(path.to_string_lossy().into_owned())
}

fn main() {
    tauri::Builder::default()
        .manage(voice::VoiceState::default())
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![open_app, window_control, search_files, media_control, take_screenshot, desktop::desktop_layout, desktop::desktop_quit, voice::speech_control, gemini::gemini_generate, gemini::gemini_save_key, gemini::gemini_key_status, fish::fish_tts, fish::fish_save_key, fish::fish_key_status])
        .setup(|app| {
            desktop::setup(app)?;
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_always_on_top(true);
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building CUBE AI")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event { app.state::<voice::VoiceState>().stop(); }
        });
}
