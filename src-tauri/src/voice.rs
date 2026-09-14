//! Offline Spanish recognition. Audio is processed in memory and never saved.
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use libloading::Library;
use serde_json::{json, Value};
use std::ffi::{c_char, c_void, CStr, CString};
use std::path::{Path, PathBuf};
use std::sync::{atomic::{AtomicU8, Ordering}, mpsc, Arc, Mutex};
use std::thread::JoinHandle;
use std::time::Duration;
use tauri::{Emitter, Manager};

// mode: 0 = stopped, 1 = paused, 2 = active.
#[derive(Default)]
struct Session { mode: AtomicU8, id: Mutex<String> }
#[derive(Default)]
pub struct VoiceState { session: Arc<Session>, worker: Mutex<Option<JoinHandle<()>>> }

fn emit(app: &tauri::AppHandle, session: &Session, mut event: Value) {
    event["id"] = json!(session.id.lock().unwrap().as_str());
    let _ = app.emit_to("main", "cube-speech", event);
}

#[tauri::command]
pub fn speech_control(app: tauri::AppHandle, state: tauri::State<VoiceState>, mode: String, id: String) -> Result<(), String> {
    let mut worker = state.worker.lock().map_err(|_| "No se pudo acceder al micrófono")?;
    if mode != "active" && *state.session.id.lock().unwrap() != id { return Ok(()); }
    match mode.as_str() {
        "off" => {
            state.session.mode.store(0, Ordering::SeqCst);
            if let Some(handle) = worker.take() { let _ = handle.join(); }
        }
        "paused" => { state.session.mode.store(1, Ordering::SeqCst); }
        "active" => {
            *state.session.id.lock().unwrap() = id;
            state.session.mode.store(2, Ordering::SeqCst);
            if worker.as_ref().is_some_and(|w| !w.is_finished()) {
                // The worker acknowledges active only after the stream is started.
                return Ok(());
            }
            if let Some(handle) = worker.take() { let _ = handle.join(); }
            let root = speech_root(&app)?;
            let session = state.session.clone();
            *worker = Some(std::thread::spawn(move || {
                if let Err(message) = run(&app, &session, &root) {
                    emit(&app, &session, json!({"type":"error", "message":message}));
                }
            }));
        }
        _ => return Err("Estado de micrófono no válido".into()),
    }
    Ok(())
}

fn speech_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let mut candidates = vec![PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/speech")];
    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("resources/speech"));
        candidates.push(resource_dir.join("speech"));
        candidates.push(resource_dir);
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            candidates.push(parent.join("resources/speech"));
            candidates.push(parent.join("speech"));
        }
    }
    candidates.into_iter().find(|root| {
        root.join("vosk-win64-0.3.45/libvosk.dll").is_file()
            && root.join("vosk-model-small-es-0.42/am/final.mdl").is_file()
    }).ok_or_else(|| "No se encontró el motor local ni el modelo español. Reinstala CUBE AI para reparar sus recursos de voz.".into())
}

impl VoiceState {
    pub fn stop(&self) {
        self.session.mode.store(0, Ordering::SeqCst);
        if let Ok(mut worker) = self.worker.lock() { if let Some(handle) = worker.take() { let _ = handle.join(); } }
    }
}

type Free = unsafe extern "C" fn(*mut c_void);
struct Decoder {
    // Library outlives every function pointer and the opaque objects.
    _library: Library,
    model: *mut c_void,
    recognizer: *mut c_void,
    model_free: Free,
    rec_free: Free,
    reset: Free,
    accept: unsafe extern "C" fn(*mut c_void, *const i16, i32) -> i32,
    result: unsafe extern "C" fn(*mut c_void) -> *const c_char,
    partial: unsafe extern "C" fn(*mut c_void) -> *const c_char,
}
impl Decoder {
    fn new(root: &Path, rate: f32) -> Result<Self, String> {
        let library_path = root.join("vosk-win64-0.3.45").join("libvosk.dll").canonicalize().map_err(|e| e.to_string())?;
        // Kaldi's filesystem reader does not understand Windows' extended-path prefix.
        let model_dir = root.join("vosk-model-small-es-0.42").canonicalize().map_err(|e| e.to_string())?;
        let model_text = model_dir.to_string_lossy().trim_start_matches("\\\\?\\").replace('\\', "/");
        let model_path = CString::new(model_text).map_err(|e| e.to_string())?;
        // Vosk's C ABI; all pointers stay on this worker thread. Only load the
        // bundled absolute DLL, resolving its dependencies beside that DLL.
        unsafe {
            #[cfg(windows)]
            let lib: Library = libloading::os::windows::Library::load_with_flags(&library_path, 0x100 | 0x1000)
                .map_err(|e| format!("Falta el motor de voz del instalador: {e} ({})", std::io::Error::last_os_error()))?.into();
            #[cfg(not(windows))]
            let lib = Library::new(&library_path).map_err(|e| e.to_string())?;
            let new_model = *lib.get::<unsafe extern "C" fn(*const c_char) -> *mut c_void>(b"vosk_model_new\0").map_err(|e| e.to_string())?;
            let new_rec = *lib.get::<unsafe extern "C" fn(*mut c_void, f32) -> *mut c_void>(b"vosk_recognizer_new\0").map_err(|e| e.to_string())?;
            let model_free = *lib.get::<Free>(b"vosk_model_free\0").map_err(|e| e.to_string())?;
            let rec_free = *lib.get::<Free>(b"vosk_recognizer_free\0").map_err(|e| e.to_string())?;
            let reset = *lib.get::<Free>(b"vosk_recognizer_reset\0").map_err(|e| e.to_string())?;
            let accept = *lib.get(b"vosk_recognizer_accept_waveform_s\0").map_err(|e| e.to_string())?;
            let result = *lib.get(b"vosk_recognizer_result\0").map_err(|e| e.to_string())?;
            let partial = *lib.get(b"vosk_recognizer_partial_result\0").map_err(|e| e.to_string())?;
            lib.get::<unsafe extern "C" fn(i32)>(b"vosk_set_log_level\0").map_err(|e| e.to_string())?(-1);
            let model = new_model(model_path.as_ptr());
            if model.is_null() { return Err("No se pudo cargar el modelo de español incluido en el instalador.".into()); }
            let recognizer = new_rec(model, rate);
            if recognizer.is_null() { model_free(model); return Err("No se pudo iniciar el reconocimiento local.".into()); }
            Ok(Self { _library: lib, model, recognizer, model_free, rec_free, reset, accept, result, partial })
        }
    }
    fn reset(&self) { unsafe { (self.reset)(self.recognizer); } }
    fn feed(&self, pcm: &[i16]) -> Result<(bool, String), String> {
        unsafe {
            let status = (self.accept)(self.recognizer, pcm.as_ptr(), pcm.len() as i32);
            if status < 0 { return Err("El motor no pudo procesar el audio del micrófono.".into()); }
            let ptr = if status == 1 { (self.result)(self.recognizer) } else { (self.partial)(self.recognizer) };
            if ptr.is_null() { return Err("El motor de voz devolvió un resultado vacío.".into()); }
            let result: Value = serde_json::from_slice(CStr::from_ptr(ptr).to_bytes()).map_err(|e| e.to_string())?;
            Ok((status == 1, result[if status == 1 { "text" } else { "partial" }].as_str().unwrap_or("").into()))
        }
    }
}
impl Drop for Decoder {
    fn drop(&mut self) { unsafe { (self.rec_free)(self.recognizer); (self.model_free)(self.model); } }
}

fn microphone<T>(device: &cpal::Device, config: &cpal::StreamConfig, tx: mpsc::SyncSender<Vec<i16>>, errors: mpsc::Sender<String>) -> Result<cpal::Stream, String>
where T: cpal::SizedSample, f32: cpal::FromSample<T> {
    let channels = config.channels as usize;
    device.build_input_stream(config, move |samples: &[T], _| {
        let mono = samples.chunks_exact(channels).map(|frame| {
            let sample = frame.iter().map(|s| s.to_sample::<f32>()).sum::<f32>() / channels as f32;
            (sample.clamp(-1.0, 1.0) * 32767.0) as i16
        }).collect();
        // A bounded queue avoids blocking the real-time capture callback.
        let _ = tx.try_send(mono);
    }, move |e| { let _ = errors.send(e.to_string()); }, None).map_err(|e| format!("No se puede abrir el micrófono. Revisa el permiso de micrófono para aplicaciones de escritorio: {e}"))
}

fn run(app: &tauri::AppHandle, session: &Session, root: &Path) -> Result<(), String> {
    let device = cpal::default_host().default_input_device().ok_or("No hay micrófono predeterminado. Conecta uno y pulsa Reintentar en Configuración.")?;
    let supported = device.default_input_config().map_err(|e| format!("No se puede leer el micrófono: {e}"))?;
    let format = supported.sample_format();
    let config: cpal::StreamConfig = supported.into();
    let decoder = Decoder::new(root, config.sample_rate.0 as f32)?;
    if session.mode.load(Ordering::SeqCst) == 0 { return Ok(()); }
    let (tx, rx) = mpsc::sync_channel(32);
    let (error_tx, error_rx) = mpsc::channel();
    let stream = match format {
        cpal::SampleFormat::F32 => microphone::<f32>(&device, &config, tx, error_tx),
        cpal::SampleFormat::I16 => microphone::<i16>(&device, &config, tx, error_tx),
        cpal::SampleFormat::U16 => microphone::<u16>(&device, &config, tx, error_tx),
        _ => Err(format!("Formato de micrófono no compatible: {format}")),
    }?;
    let mut live = false;
    let mut acknowledged = String::new();
    let mut partial = String::new();
    loop {
        let mode = session.mode.load(Ordering::SeqCst);
        if mode == 0 { break; }
        if let Ok(error) = error_rx.try_recv() { return Err(format!("El micrófono se desconectó: {error}")); }
        if mode == 1 {
            if live { stream.pause().map_err(|e| e.to_string())?; live = false; decoder.reset(); partial.clear(); }
            while rx.try_recv().is_ok() {}
            std::thread::sleep(Duration::from_millis(60));
            continue;
        }
        let id = session.id.lock().unwrap().clone();
        if !live || id != acknowledged {
            while rx.try_recv().is_ok() {}
            decoder.reset(); partial.clear();
            if !live { stream.play().map_err(|e| e.to_string())?; live = true; }
            acknowledged = id;
            emit(app, session, json!({"type":"ready"}));
        }
        if let Ok(pcm) = rx.recv_timeout(Duration::from_millis(100)) {
            let (final_result, text) = decoder.feed(&pcm)?;
            // Suppress stale results during pause/session changes.
            if session.mode.load(Ordering::SeqCst) != 2 || *session.id.lock().unwrap() != acknowledged { continue; }
            if !text.is_empty() && (final_result || text != partial) {
                emit(app, session, json!({"type":"result", "text":text, "final":final_result}));
            }
            partial = if final_result { String::new() } else { text };
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn bundled_spanish_model_accepts_silence_and_resets() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/speech");
        let decoder = Decoder::new(&root, 16000.0).expect("bundled Vosk DLL and Spanish model");
        let (_, text) = decoder.feed(&vec![0; 16000]).unwrap();
        assert!(text.is_empty());
        decoder.reset();
        assert!(decoder.feed(&vec![0; 16000]).unwrap().1.is_empty());
    }
}
