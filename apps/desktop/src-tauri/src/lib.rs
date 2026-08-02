//! Wormhole Tauri Application Library
//!
//! This module provides the Tauri commands and state management for the
//! Wormhole desktop application.

mod cli;
mod commands;
mod lan;
mod shell_integration;

use std::sync::Arc;
use tauri::{Emitter, Listener, Manager};
use tracing::info;

pub use commands::{AppState, ServiceEvent};
use cli::{parse_launch_args, parse_wormhole_url, LaunchAction};

/// Deep link event payload for join links
#[derive(Clone, serde::Serialize)]
pub struct DeepLinkPayload {
    /// The join code extracted from the deep link
    pub join_code: String,
    /// The full URL that was opened
    pub url: String,
}

/// Parse a wormhole:// deep link URL and extract the join code
fn parse_deep_link(url: &str) -> Option<String> {
    // Handle formats:
    // wormhole://join/ABC-123
    // wormhole://j/ABC-123
    // wormhole://ABC-123

    let url = url.trim();

    // Remove the scheme
    let path = url
        .strip_prefix("wormhole://")
        .or_else(|| url.strip_prefix("wormhole:"))?;

    // Remove leading slashes
    let path = path.trim_start_matches('/');

    // Extract the code
    let code = if let Some(rest) = path.strip_prefix("join/") {
        rest
    } else if let Some(rest) = path.strip_prefix("j/") {
        rest
    } else {
        path
    };

    // Clean and validate the code
    let code = code.trim().to_uppercase();
    if code.is_empty() {
        return None;
    }

    // Normalize: remove non-alphanumeric except dash
    let normalized: String = code
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-')
        .collect();

    if normalized.len() >= 6 {
        Some(normalized)
    } else {
        None
    }
}

/// Initialize and run the Tauri application
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive("wormhole_desktop=info".parse().unwrap())
                .add_directive("tauri=info".parse().unwrap()),
        )
        .init();

    info!("Starting Wormhole desktop application");

    let launch = parse_launch_args(std::env::args());
    let start_hidden = launch.hidden;

    tauri::Builder::default()
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_drag::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--hidden"]),
        ))
        .manage(Arc::new(AppState::default()))
        .invoke_handler(tauri::generate_handler![
            // Legacy single-share commands (backwards compatible)
            commands::start_hosting,
            commands::stop_hosting,
            commands::connect_to_peer,
            commands::disconnect,
            commands::get_status,
            // Phase 6: Global code-based connections (legacy)
            commands::start_global_hosting,
            commands::connect_with_code,
            commands::generate_code,
            commands::get_local_ip,
            // Multi-share ID-based commands (new)
            commands::start_hosting_with_id,
            commands::stop_hosting_by_id,
            commands::start_global_hosting_with_id,
            commands::connect_with_code_and_id,
            commands::disconnect_by_id,
            commands::get_active_hosts,
            commands::get_active_mounts,
            // File browser
            commands::list_directory,
            commands::index_directory,
            commands::get_host_info,
            commands::get_mount_info,
            // File operations
            commands::delete_path,
            commands::default_mount_path,
            commands::open_file,
            commands::reveal_in_explorer,
            commands::get_device_identity,
            commands::list_nearby_peers,
            // Setup wizard
            commands::check_fuse_installed,
            // Share expiration
            commands::start_hosting_with_expiration,
            // Updates
            commands::check_for_updates,
            // Phase 8: High-performance bulk export
            commands::export_file,
            commands::export_files_batch,
            commands::get_drag_file_path,
            // OS shell integration
            shell_integration::install_shell_integration,
            shell_integration::uninstall_shell_integration,
            shell_integration::shell_integration_status,
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // Always-on: close hides to tray; Quit from tray exits.
                if window.label() == "main" {
                    let _ = window.hide();
                    api.prevent_close();
                }
            }
        })
        .setup(move |app| {
            info!("Wormhole app setup complete");

            let state = Arc::clone(app.state::<Arc<AppState>>().inner());
            commands::start_throughput_poller(app.handle().clone(), state);

            if start_hidden {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }

            // Emit CLI / shell-integration actions once the UI can listen
            if !launch.actions.is_empty() {
                let handle = app.handle().clone();
                let actions = launch.actions.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(600));
                    for action in actions {
                        let _ = handle.emit("launch-action", action);
                    }
                });
            }

            // Set window and webview background color on macOS to eliminate white border
            #[cfg(target_os = "macos")]
            {
                #[allow(deprecated)]
                use cocoa::base::id;
                use objc::{class, msg_send, sel, sel_impl};

                if let Some(window) = app.get_webview_window("main") {
                    // Set NSWindow background color
                    if let Ok(ns_win) = window.ns_window() {
                        #[allow(deprecated)]
                        let ns_window = ns_win as id;
                        unsafe {
                            // Set background to match zinc-900 (#18181b) for the titlebar area
                            #[allow(deprecated)]
                            let color: id = msg_send![class!(NSColor), colorWithRed:24.0/255.0_f64 green:24.0/255.0_f64 blue:27.0/255.0_f64 alpha:1.0_f64];
                            let _: () = msg_send![ns_window, setBackgroundColor: color];

                            // Make titlebar transparent and blend with content
                            let _: () = msg_send![ns_window, setTitlebarAppearsTransparent: true];

                            // Remove the toolbar separator line
                            let _: () = msg_send![ns_window, setToolbarStyle: 3_i64]; // NSWindowToolbarStyleUnified = 3

                            // Remove titlebar separator (the thin line below the title bar)
                            let _: () = msg_send![ns_window, setTitlebarSeparatorStyle: 0_i64]; // NSTitlebarSeparatorStyleNone = 0

                            // Re-enable shadow for proper window appearance
                            let _: () = msg_send![ns_window, setHasShadow: true];

                            // Get the content view and set its background
                            #[allow(deprecated)]
                            let content_view: id = msg_send![ns_window, contentView];
                            if !content_view.is_null() {
                                let _: () = msg_send![content_view, setWantsLayer: true];
                                #[allow(deprecated)]
                                let layer: id = msg_send![content_view, layer];
                                if !layer.is_null() {
                                    let cg_color: *mut std::ffi::c_void = msg_send![color, CGColor];
                                    let _: () = msg_send![layer, setBackgroundColor: cg_color];
                                }
                            }
                        }
                    }

                    // Set WKWebView to not draw its own background
                    let _ = window.with_webview(|webview| {
                        #[allow(deprecated)]
                        let wv = webview.inner() as id;
                        unsafe {
                            let _: () = msg_send![wv, _setDrawsBackground: false];
                        }
                    });
                }
            }

            // Handle deep links (join codes + share paths)
            #[cfg(desktop)]
            {
                let handle = app.handle().clone();
                app.listen("deep-link://new-url", move |event| {
                    let payload_str = event.payload();
                    if let Ok(urls) = serde_json::from_str::<Vec<String>>(payload_str) {
                        for url in urls {
                            info!("Received deep link: {}", url);
                            if let Some(action) = parse_wormhole_url(&url) {
                                match &action {
                                    LaunchAction::Connect { code } => {
                                        let payload = DeepLinkPayload {
                                            join_code: code.clone(),
                                            url: url.clone(),
                                        };
                                        let _ = handle.emit("deep-link-join", payload);
                                    }
                                    LaunchAction::Share { .. } | LaunchAction::Portal => {}
                                }
                                let _ = handle.emit("launch-action", action);
                            }
                        }
                    }
                });
            }

            // System tray — primary product surface when window is closed
            #[cfg(desktop)]
            {
                use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
                use tauri::tray::TrayIconBuilder;

                let share =
                    MenuItem::with_id(app, "share", "Share a Folder…", true, None::<&str>)?;
                let connect =
                    MenuItem::with_id(app, "connect", "Enter a Code…", true, None::<&str>)?;
                let portal =
                    MenuItem::with_id(app, "portal", "Open Portal", true, None::<&str>)?;
                let sep = PredefinedMenuItem::separator(app)?;
                let quit = MenuItem::with_id(app, "quit", "Quit Wormhole", true, None::<&str>)?;

                let menu = Menu::with_items(app, &[&share, &connect, &portal, &sep, &quit])?;

                let _tray = TrayIconBuilder::new()
                    .menu(&menu)
                    .tooltip("Wormhole — running in background")
                    .on_menu_event(|app, event| match event.id.as_ref() {
                        "quit" => {
                            info!("Quit requested from tray");
                            app.exit(0);
                        }
                        "share" | "connect" | "portal" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                            let action = event.id.as_ref();
                            let _ = app.emit(
                                "tray-action",
                                serde_json::json!({ "action": action }),
                            );
                        }
                        _ => {}
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let tauri::tray::TrayIconEvent::Click {
                            button: tauri::tray::MouseButton::Left,
                            button_state: tauri::tray::MouseButtonState::Up,
                            ..
                        } = event
                        {
                            let app = tray.app_handle();
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                            let _ = app.emit(
                                "tray-action",
                                serde_json::json!({ "action": "portal" }),
                            );
                        }
                    })
                    .build(app)?;
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_deep_link() {
        // Standard format
        assert_eq!(
            parse_deep_link("wormhole://join/ABC-123"),
            Some("ABC-123".to_string())
        );
        assert_eq!(
            parse_deep_link("wormhole://j/ABC-123"),
            Some("ABC-123".to_string())
        );

        // Direct code
        assert_eq!(
            parse_deep_link("wormhole://ABC-123"),
            Some("ABC-123".to_string())
        );

        // Lowercase should be normalized
        assert_eq!(
            parse_deep_link("wormhole://join/abc-123"),
            Some("ABC-123".to_string())
        );

        // Without dash
        assert_eq!(
            parse_deep_link("wormhole://join/ABC123"),
            Some("ABC123".to_string())
        );

        // Invalid
        assert_eq!(parse_deep_link("wormhole://"), None);
        assert_eq!(parse_deep_link("wormhole://join/"), None);
        assert_eq!(parse_deep_link("wormhole://AB"), None); // Too short
    }
}
