//! Fish Audio TTS: the API key stays in Windows DPAPI-protected storage.
use serde_json::json;
use std::{path::PathBuf, time::Duration};
use tauri::Manager;

fn key_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path().app_local_data_dir().map(|p| p.join("fish-key.dpapi")).map_err(|_| "No se encontró la carpeta de configuración de Astra.".into())
}

fn protect(bytes: &[u8], decrypt: bool) -> Result<Vec<u8>, String> {
    use windows_sys::Win32::{Foundation::LocalFree, Security::Cryptography::*};
    let input = CRYPT_INTEGER_BLOB { cbData: bytes.len() as u32, pbData: bytes.as_ptr() as *mut u8 };
    let mut output: CRYPT_INTEGER_BLOB = unsafe { std::mem::zeroed() };
    let ok = unsafe { if decrypt { CryptUnprotectData(&input, std::ptr::null_mut(), std::ptr::null(), std::ptr::null(), std::ptr::null(), CRYPTPROTECT_UI_FORBIDDEN, &mut output) } else { CryptProtectData(&input, std::ptr::null(), std::ptr::null(), std::ptr::null(), std::ptr::null(), CRYPTPROTECT_UI_FORBIDDEN, &mut output) } };
    if ok == 0 { return Err("Windows no pudo proteger o recuperar la API key de Fish Audio.".into()); }
    let result = unsafe { std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec() };
    unsafe { LocalFree(output.pbData.cast()); }
    Ok(result)
}

fn valid_key(key: &str) -> Result<(), String> {
    if !(10..=512).contains(&key.len()) || key.bytes().any(|c| c.is_ascii_whitespace() || c.is_ascii_control()) { return Err("API key de Fish Audio no válida.".into()); }
    Ok(())
}

fn read_key(app: &tauri::AppHandle, draft: Option<String>) -> Result<String, String> {
    if let Some(key) = draft.filter(|v| !v.trim().is_empty()) { valid_key(key.trim())?; return Ok(key.trim().into()); }
    let encrypted = std::fs::read(key_path(app)?).map_err(|_| "Guarda primero tu API key de Fish Audio." )?;
    let key = String::from_utf8(protect(&encrypted, true)?).map_err(|_| "La API key guardada de Fish Audio no es válida.")?;
    valid_key(&key)?; Ok(key)
}

#[tauri::command]
pub fn fish_save_key(app: tauri::AppHandle, key: String) -> Result<(), String> {
    valid_key(key.trim())?;
    let path = key_path(&app)?;
    std::fs::create_dir_all(path.parent().ok_or("Carpeta no válida")?).map_err(|_| "No se pudo crear la carpeta de Astra.")?;
    std::fs::write(path, protect(key.trim().as_bytes(), false)?).map_err(|_| "No se pudo guardar la API key de Fish Audio.".to_string())
}

#[tauri::command]
pub fn fish_key_status(app: tauri::AppHandle) -> Result<bool, String> { Ok(key_path(&app)?.is_file()) }

#[tauri::command]
pub async fn fish_tts(app: tauri::AppHandle, text: String, reference_id: String, api_key: Option<String>) -> Result<Vec<u8>, String> {
    let reference_id = reference_id.trim();
    if reference_id.is_empty() || reference_id.len() > 160 || !reference_id.bytes().all(|c| c.is_ascii_alphanumeric() || b"-_".contains(&c)) { return Err("Reference ID de Fish Audio no válido.".into()); }
    let key = read_key(&app, api_key)?;
    let client = reqwest::Client::builder().timeout(Duration::from_secs(45)).connect_timeout(Duration::from_secs(10)).build().map_err(|_| "No se pudo iniciar Fish Audio.")?;
    let response = client.post("https://api.fish.audio/v1/tts").header("Authorization", format!("Bearer {key}")).header("model", "s2-pro").json(&json!({"text": text, "reference_id": reference_id, "format": "mp3", "sample_rate": 44100, "mp3_bitrate": 128, "latency": "balanced", "prosody": {"speed": 0.94, "volume": 0, "normalize_loudness": true}})).send().await.map_err(|_| "No se pudo conectar con Fish Audio.")?;
    let status = response.status().as_u16();
    if !(200..300).contains(&status) { return Err(match status { 401 => "Fish Audio rechazó la API key (401).".into(), 402 => "Fish Audio requiere saldo o cuota (402).".into(), 404 | 422 => "Fish Audio rechazó el Reference ID (404/422).".into(), _ => format!("Fish Audio devolvió el error {status}." ) }); }
    Ok(response.bytes().await.map_err(|_| "La respuesta de Fish Audio quedó incompleta.")?.to_vec())
}
