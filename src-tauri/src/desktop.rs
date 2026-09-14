use tauri::{Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewWindow};

// Preserve the bottom-right mascot anchor while opening/closing a panel.
// Both monitor coordinates and window coordinates here are physical pixels.
fn fit_axis(anchor: i32, size: u32, start: i32, available: u32) -> i32 {
    (anchor - size as i32).clamp(start, start + available.saturating_sub(size) as i32)
}

#[tauri::command]
pub fn desktop_layout(window: WebviewWindow, width: f64, height: f64, reset: bool) -> Result<(), String> {
    if !width.is_finite() || !height.is_finite() || !(64.0..=600.0).contains(&width) || !(64.0..=1000.0).contains(&height) {
        return Err("Tamaño de ventana no válido".into());
    }
    let monitor = window.current_monitor().map_err(|e| e.to_string())?
        .or(window.primary_monitor().map_err(|e| e.to_string())?)
        .ok_or("No se encontró la pantalla")?;
    let area = monitor.work_area();
    let scale = window.scale_factor().map_err(|e| e.to_string())?;
    let old_pos = window.outer_position().map_err(|e| e.to_string())?;
    let old_size = window.inner_size().map_err(|e| e.to_string())?;
    let w = ((width * scale).round() as u32).min(area.size.width);
    let h = ((height * scale).round() as u32).min(area.size.height);
    let (right, bottom) = if reset {
        (area.position.x + area.size.width as i32 - 24, area.position.y + area.size.height as i32 - 24)
    } else {
        (old_pos.x + old_size.width as i32, old_pos.y + old_size.height as i32)
    };
    window.set_size(PhysicalSize::new(w, h)).map_err(|e| e.to_string())?;
    window.set_position(PhysicalPosition::new(
        fit_axis(right, w, area.position.x, area.size.width),
        fit_axis(bottom, h, area.position.y, area.size.height),
    )).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn desktop_quit(app: tauri::AppHandle) { app.exit(0); }

pub fn setup(app: &tauri::App) -> tauri::Result<()> {
    use tauri::menu::{Menu, MenuItem};
    use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
    let show = MenuItem::with_id(app, "show", "Mostrar CUBE", true, None::<&str>)?;
    let chat = MenuItem::with_id(app, "chat", "Chat", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "Configuración y micrófono", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Salir de CUBE", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &chat, &settings, &quit])?;
    let mut tray = TrayIconBuilder::with_id("cube-tray").tooltip("CUBE AI · Hey CUBE")
        .menu(&menu).show_menu_on_left_click(false)
        .on_menu_event(|app, event| {
            if event.id.as_ref() == "quit" { app.exit(0); return; }
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.emit("cube-desktop", event.id.as_ref());
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                if let Some(window) = tray.app_handle().get_webview_window("main") { let _ = window.show(); }
            }
        });
    if let Some(icon) = app.default_window_icon() { tray = tray.icon(icon.clone()); }
    tray.build(app)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn panels_fit_negative_monitor_and_preserve_anchor() {
        assert_eq!(fit_axis(-100, 340, -1920, 1920), -440);
        assert_eq!(fit_axis(-1880, 340, -1920, 1920), -1920);
        assert_eq!(fit_axis(900, 340, 0, 1920) + 340, 900);
        assert_eq!(fit_axis(900, 88, 0, 1920) + 88, 900);
        assert_eq!(fit_axis(2500, 340, 0, 1920), 1580);
    }
}
