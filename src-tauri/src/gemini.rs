//! Gemini requests stay on the native side, with a fixed HTTPS destination.
use serde_json::Value;
use std::{path::PathBuf, time::Duration};
use tauri::Manager;

const API: &str = "https://generativelanguage.googleapis.com/v1beta/models";

fn key_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path().app_local_data_dir().map(|p| p.join("gemini-key.dpapi"))
        .map_err(|_| "No se encontró la carpeta de configuración de CUBE.".into())
}

fn protect(bytes: &[u8], decrypt: bool) -> Result<Vec<u8>, String> {
    use windows_sys::Win32::{Foundation::LocalFree, Security::Cryptography::*};
    let input = CRYPT_INTEGER_BLOB { cbData: bytes.len() as u32, pbData: bytes.as_ptr() as *mut u8 };
    let mut output: CRYPT_INTEGER_BLOB = unsafe { std::mem::zeroed() };
    // DPAPI binds this secret to the signed-in Windows user. No machine-wide scope.
    let ok = unsafe {
        if decrypt {
            CryptUnprotectData(&input, std::ptr::null_mut(), std::ptr::null(), std::ptr::null(), std::ptr::null(), CRYPTPROTECT_UI_FORBIDDEN, &mut output)
        } else {
            CryptProtectData(&input, std::ptr::null(), std::ptr::null(), std::ptr::null(), std::ptr::null(), CRYPTPROTECT_UI_FORBIDDEN, &mut output)
        }
    };
    if ok == 0 { return Err("Windows no pudo proteger o recuperar la clave. Vuelve a introducirla.".into()); }
    let result = unsafe { std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec() };
    unsafe { LocalFree(output.pbData.cast()); }
    Ok(result)
}

fn validate_key(key: &str) -> Result<(), String> {
    if !(10..=512).contains(&key.len()) || key.bytes().any(|c| c.is_ascii_whitespace() || c.is_ascii_control()) {
        return Err("Introduce una API key de Gemini válida en Configuración.".into());
    }
    Ok(())
}

#[tauri::command]
pub fn gemini_save_key(app: tauri::AppHandle, key: String) -> Result<(), String> {
    let key = key.trim();
    validate_key(key)?;
    let encrypted = protect(key.as_bytes(), false)?;
    let path = key_path(&app)?;
    std::fs::create_dir_all(path.parent().ok_or("Carpeta no válida")?).map_err(|_| "No se pudo crear la carpeta de CUBE.")?;
    std::fs::write(path, encrypted).map_err(|_| "No se pudo guardar la clave de Gemini.".into())
}

#[tauri::command]
pub fn gemini_key_status(app: tauri::AppHandle) -> Result<bool, String> {
    Ok(key_path(&app)?.is_file())
}

fn read_key(app: &tauri::AppHandle, draft: Option<String>) -> Result<String, String> {
    if let Some(key) = draft.filter(|s| !s.trim().is_empty()) {
        validate_key(key.trim())?;
        return Ok(key.trim().into());
    }
    let encrypted = std::fs::read(key_path(app)?).map_err(|_| "Añade tu API key de Gemini en Configuración y pulsa Guardar y probar.")?;
    if encrypted.len() > 8192 { return Err("La clave guardada no es válida. Vuelve a introducirla.".into()); }
    let key = String::from_utf8(protect(&encrypted, true)?).map_err(|_| "La clave guardada no es válida.")?;
    validate_key(&key)?;
    Ok(key)
}

fn model_url(model: &str) -> Result<String, String> {
    let model = model.trim().trim_start_matches("models/");
    if model.is_empty() || model.len() > 120 || !model.bytes().all(|c| c.is_ascii_alphanumeric() || b"-._".contains(&c)) {
        return Err("Nombre de modelo no válido. Ejemplo: gemini-2.5-flash-lite.".into());
    }
    Ok(format!("{API}/{model}:generateContent"))
}

#[tauri::command]
pub async fn gemini_generate(app: tauri::AppHandle, model: String, body: Value, api_key: Option<String>) -> Result<Value, String> {
    let url = model_url(&model)?;
    if !body.is_object() || body.to_string().len() > 256_000 { return Err("La conversación es demasiado grande. Limpia el chat e inténtalo de nuevo.".into()); }
    let key = read_key(&app, api_key)?;
    let client = reqwest::Client::builder().timeout(Duration::from_secs(60))
        .connect_timeout(Duration::from_secs(10)).redirect(reqwest::redirect::Policy::none())
        .build().map_err(|_| "No se pudo iniciar la conexión segura con Gemini.")?;
    let mut response = client.post(url).header("x-goog-api-key", key).json(&body).send().await
        .map_err(|e| if e.is_timeout() { "Gemini tardó demasiado. Inténtalo de nuevo." } else { "No se pudo conectar con Gemini. Revisa Internet y el firewall." })?;
    let status = response.status().as_u16();
    if !(200..300).contains(&status) {
        // Never echo the response body: providers can reflect credentials or input.
        return Err(match status {
            400 => "Gemini rechazó la petición: revisa la clave y el modelo (400).".into(),
            401 | 403 => "Gemini rechazó la clave o sus permisos (401/403).".into(),
            404 => "Ese modelo no está disponible para tu clave. Cambia el nombre del modelo (404).".into(),
            429 => "Tu cuenta de Gemini alcanzó su cuota o límite de solicitudes (429).".into(),
            _ => format!("Gemini devolvió un error {status}. Inténtalo más tarde."),
        });
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| "Se interrumpió la respuesta de Gemini.")? {
        if bytes.len() + chunk.len() > 2_000_000 { return Err("La respuesta de Gemini excedió el límite permitido.".into()); }
        bytes.extend_from_slice(&chunk);
    }
    serde_json::from_slice(&bytes).map_err(|_| "Gemini no devolvió una respuesta válida.".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn model_cannot_change_destination_or_add_query() {
        assert_eq!(model_url("models/gemini-2.5-flash").unwrap(), format!("{API}/gemini-2.5-flash:generateContent"));
        for invalid in ["", "../x", "x?key=secret", "https://example.com", "x#y"] { assert!(model_url(invalid).is_err()); }
    }
    #[test]
    fn windows_secret_round_trip() {
        let key = b"test-key-not-a-real-credential";
        let encrypted = protect(key, false).unwrap();
        assert_ne!(encrypted, key);
        assert_eq!(protect(&encrypted, true).unwrap(), key);
    }
}
