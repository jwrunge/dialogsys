use std::fs;
use std::net::TcpStream;
use std::path::Path;
use std::sync::Mutex;
use std::time::Duration;

use tauri::{AppHandle, Manager, Url};
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;

pub const DEFAULT_PORT: u16 = 4310;

pub struct LocalServer(Mutex<Option<CommandChild>>);

impl LocalServer {
    pub fn new(child: CommandChild) -> Self {
        Self(Mutex::new(Some(child)))
    }

    pub fn shutdown(&self) {
        if let Ok(mut guard) = self.0.lock() {
            if let Some(child) = guard.take() {
                let _ = child.kill();
            }
        }
    }
}

fn seed_demo_if_empty(seed_demo: &Path, projects_dir: &Path) -> Result<(), String> {
    fs::create_dir_all(projects_dir).map_err(|e| e.to_string())?;

    let demo_dir = projects_dir.join("demo");
    if demo_dir.exists() {
        return Ok(());
    }

    if !seed_demo.exists() {
        return Ok(());
    }

    fs::create_dir_all(demo_dir.parent().unwrap()).map_err(|e| e.to_string())?;
    copy_dir_recursive(seed_demo, &demo_dir).map_err(|e| e.to_string())?;
    Ok(())
}

fn copy_dir_recursive(src: &Path, dest: &Path) -> std::io::Result<()> {
    fs::create_dir_all(dest)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        let target = dest.join(entry.file_name());
        if file_type.is_dir() {
            copy_dir_recursive(&entry.path(), &target)?;
        } else {
            fs::copy(entry.path(), target)?;
        }
    }
    Ok(())
}

pub fn wait_for_port(port: u16) -> Result<(), String> {
    let addr = format!("127.0.0.1:{port}");
    for _ in 0..80 {
        if TcpStream::connect(&addr).is_ok() {
            return Ok(());
        }
        std::thread::sleep(Duration::from_millis(250));
    }
    Err(format!("Timed out waiting for server at {addr}"))
}

pub fn start_local_server(app: &AppHandle) -> Result<(u16, CommandChild), String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?;
    let web_root = resource_dir.join("web");
    let entry_script = web_root.join("dist/server/entry.mjs");

    if !entry_script.exists() {
        return Err(format!(
            "Missing bundled server entry at {}",
            entry_script.display()
        ));
    }

    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let projects_dir = app_data.join("projects");
    seed_demo_if_empty(&web_root.join("seed/projects/demo"), &projects_dir)?;

    let port = DEFAULT_PORT;
    let token_file = app_data.join("sync.token");
    let command = app
        .shell()
        .sidecar("dialogsys-node")
        .map_err(|e| format!("Node runtime sidecar missing: {e}"))?
        .args(["dist/server/entry.mjs"])
        .current_dir(&web_root)
        .env("HOST", "127.0.0.1")
        .env("PORT", port.to_string())
        .env("DIALOGSYS_TAURI", "1")
        .env(
            "DIALOGSYS_PROJECTS_ROOT",
            projects_dir.to_string_lossy().to_string(),
        )
        .env(
            "DIALOGSYS_SYNC_TOKEN_FILE",
            token_file.to_string_lossy().to_string(),
        )
        .env("ASTRO_NODE_LOGGING", "disabled");

    let (_, child) = command
        .spawn()
        .map_err(|e| format!("Failed to start local server: {e}"))?;

    wait_for_port(port)?;

    Ok((port, child))
}

pub fn load_app_url(app: &AppHandle, port: u16) -> Result<(), String> {
    navigate_first_window(app, &format!("http://127.0.0.1:{port}/"))
}

pub fn load_error_page(app: &AppHandle, message: &str) -> Result<(), String> {
    let escaped = message
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;");
    let html = format!(
        "data:text/html,<html><body style='font-family:system-ui;padding:2rem;max-width:42rem'>\
         <h1>Dialogsys could not start</h1>\
         <p>{escaped}</p>\
         <p>Check the application logs, then reinstall or run <code>npm run tauri:dev</code> from source.</p>\
         </body></html>"
    );
    navigate_first_window(app, &html)
}

#[cfg(mobile)]
pub fn load_mobile_fallback(app: &AppHandle) -> Result<(), String> {
    let html = "data:text/html,\
        <html><body style='font-family:system-ui;padding:2rem;max-width:40rem'>\
        <h1>Dialogsys</h1>\
        <p>Offline editing on mobile is not available in this build. Use the desktop app for full local authoring, \
        or run <code>npm run tauri ios dev</code> / <code>npm run tauri android dev</code> against a dev server on your computer.</p>\
        </body></html>";
    navigate_first_window(app, html)
}

fn navigate_first_window(app: &AppHandle, url: &str) -> Result<(), String> {
    let windows = app.webview_windows();
    let window = windows
        .values()
        .next()
        .ok_or_else(|| "No webview window found".to_string())?;
    let parsed: Url = url.parse().map_err(|e| format!("Invalid URL: {e}"))?;
    window.navigate(parsed).map_err(|e| e.to_string())?;
    Ok(())
}
