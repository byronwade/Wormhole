//! Wormhole Tauri Application Library
//!
//! This module provides the Tauri commands and state management for the
//! Wormhole desktop application.

mod commands;

use std::sync::Arc;
use tracing::info;

pub use commands::{AppState, ServiceEvent};

/// Initialize and run the Tauri application
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive("teleport_ui=info".parse().unwrap())
                .add_directive("tauri=info".parse().unwrap()),
        )
        .init();

    info!("Starting Wormhole desktop application");

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .manage(Arc::new(AppState::default()))
        .invoke_handler(tauri::generate_handler![
            commands::start_hosting,
            commands::stop_hosting,
            commands::connect_to_peer,
            commands::disconnect,
            commands::get_status,
            // Phase 6: Global code-based connections
            commands::start_global_hosting,
            commands::connect_with_code,
            commands::generate_code,
            // File browser
            commands::list_directory,
            commands::get_host_info,
            commands::get_mount_info,
        ])
        .setup(|app| {
            info!("Wormhole app setup complete");

            // Set up system tray (optional, enabled in tauri.conf.json)
            #[cfg(desktop)]
            {
                use tauri::menu::{Menu, MenuItem};
                use tauri::tray::TrayIconBuilder;
                use tauri::Manager;

                let quit = MenuItem::with_id(app, "quit", "Quit Wormhole", true, None::<&str>)?;
                let show = MenuItem::with_id(app, "show", "Show Window", true, None::<&str>)?;

                let menu = Menu::with_items(app, &[&show, &quit])?;

                let _tray = TrayIconBuilder::new()
                    .menu(&menu)
                    .on_menu_event(|app, event| match event.id.as_ref() {
                        "quit" => {
                            info!("Quit requested from tray");
                            app.exit(0);
                        }
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        _ => {}
                    })
                    .build(app)?;
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
