mod server;

use tauri::{Manager, RunEvent};

struct ServerHandle(server::LocalServer);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            #[cfg(desktop)]
            {
                let handle = app.handle().clone();
                if cfg!(debug_assertions) {
                    // Window config must not pin `about:blank`; still navigate once Astro is up.
                    std::thread::spawn(move || {
                        const DEV_PORT: u16 = 4321;
                        if let Err(err) = server::wait_for_port(DEV_PORT) {
                            log::error!("Dev server not reachable: {err}");
                            return;
                        }
                        if let Err(err) = server::load_app_url(&handle, DEV_PORT) {
                            log::error!("Failed to load dev URL: {err}");
                        }
                    });
                } else {
                    match server::start_local_server(&handle) {
                        Ok((port, child)) => {
                            app.manage(ServerHandle(server::LocalServer::new(child)));
                            if let Err(err) = server::load_app_url(&handle, port) {
                                log::error!("Failed to load app URL: {err}");
                            }
                        }
                        Err(err) => {
                            log::error!("Failed to start local server: {err}");
                        }
                    }
                }
            }

            #[cfg(mobile)]
            if !cfg!(debug_assertions) {
                if let Err(err) = server::load_mobile_fallback(&app.handle()) {
                    log::error!("Failed to load mobile fallback: {err}");
                }
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                if let Some(server) = app.try_state::<ServerHandle>() {
                    server.0.shutdown();
                }
            }
        });
}
