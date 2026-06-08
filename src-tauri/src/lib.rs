mod secrets;
mod server;

use tauri::Manager;

struct ServerHandle(server::LocalServer);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
	tauri::Builder::default()
		.plugin(tauri_plugin_shell::init())
		.invoke_handler(tauri::generate_handler![
			secrets::has_sync_token,
			secrets::set_sync_token,
			secrets::clear_sync_token,
		])
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
					std::thread::spawn(move || {
						const DEV_PORT: u16 = 4321;
						if let Err(err) = server::wait_for_port(DEV_PORT) {
							log::error!("Dev server not reachable: {err}");
							let _ = server::load_error_page(&handle, &err);
							return;
						}
						if let Err(err) = server::load_app_url(&handle, DEV_PORT) {
							log::error!("Failed to load dev URL: {err}");
							let _ = server::load_error_page(&handle, &err);
						}
					});
				} else {
					if let Err(err) = secrets::sync_token_file_from_keychain(&handle) {
						log::warn!("Could not sync keychain token file: {err}");
					}
					match server::start_local_server(&handle) {
						Ok((port, child)) => {
							app.manage(ServerHandle(server::LocalServer::new(child)));
							if let Err(err) = server::load_app_url(&handle, port) {
								log::error!("Failed to load app URL: {err}");
								let _ = server::load_error_page(&handle, &err);
							}
						}
						Err(err) => {
							log::error!("Failed to start local server: {err}");
							let _ = server::load_error_page(&handle, &err);
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
			if let tauri::RunEvent::Exit = event {
				if let Some(server) = app.try_state::<ServerHandle>() {
					server.0.shutdown();
				}
			}
		});
}
