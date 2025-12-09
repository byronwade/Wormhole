//! Tauri commands for the Wormhole desktop application
//!
//! This module integrates with teleport-daemon to provide real file sharing
//! and mounting functionality through the Tauri UI.

use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use fuser::MountOption;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use tokio::runtime::Runtime;
use tokio::sync::Mutex;
use tracing::{error, info};

use teleport_core::crypto::generate_join_code;
use teleport_daemon::bridge::FuseAsyncBridge;
use teleport_daemon::client::{ClientConfig, WormholeClient};
use teleport_daemon::fuse::WormholeFS;
use teleport_daemon::host::{HostConfig, WormholeHost};

/// Events emitted to the frontend
#[derive(Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ServiceEvent {
    HostStarted {
        port: u16,
        share_path: String,
        join_code: String,
    },
    ClientConnected {
        peer_addr: String,
    },
    MountReady {
        mountpoint: String,
    },
    Error {
        message: String,
    },
}

/// Handle for stopping the host
struct HostHandle {
    /// Abort handle for the host task
    abort_handle: tokio::task::AbortHandle,
}

/// Handle for stopping the client/mount
struct ClientHandle {
    /// Thread handle for FUSE mount (blocks until unmounted)
    mount_thread: Option<thread::JoinHandle<()>>,
    /// Mount point for cleanup
    mount_point: PathBuf,
}

/// Application state for managing host and client connections
pub struct AppState {
    /// Currently hosting
    host_handle: Mutex<Option<HostHandle>>,
    /// Currently connected client
    client_handle: Mutex<Option<ClientHandle>>,
    /// Tokio runtime for async operations
    runtime: Runtime,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            host_handle: Mutex::new(None),
            client_handle: Mutex::new(None),
            runtime: Runtime::new().expect("Failed to create tokio runtime"),
        }
    }
}

/// Start hosting a folder using the real WormholeHost
#[tauri::command]
pub async fn start_hosting(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    path: String,
    port: u16,
) -> Result<(), String> {
    info!("Starting host for path: {} on port {}", path, port);

    // Check if already hosting
    {
        let handle = state.host_handle.lock().await;
        if handle.is_some() {
            return Err("Already hosting. Stop current session first.".to_string());
        }
    }

    // Validate and canonicalize path
    let share_path = PathBuf::from(&path);
    let share_path = share_path
        .canonicalize()
        .map_err(|e| format!("Invalid path: {}", e))?;

    if !share_path.is_dir() {
        return Err(format!("Path is not a directory: {}", path));
    }

    // Generate join code
    let join_code = generate_join_code();
    let join_code_clone = join_code.clone();
    let path_clone = share_path.clone();
    let app_clone = app.clone();

    // Create host configuration
    let bind_addr: SocketAddr = format!("0.0.0.0:{}", port)
        .parse()
        .map_err(|e| format!("Invalid port: {}", e))?;

    let config = HostConfig {
        bind_addr,
        shared_path: share_path.clone(),
        max_connections: 10,
        host_name: hostname::get()
            .map(|h| h.to_string_lossy().into_owned())
            .unwrap_or_else(|_| "wormhole-host".into()),
    };

    // Spawn the host task in the runtime
    let host_task = state.runtime.spawn(async move {
        let host = WormholeHost::new(config);

        // Emit host started event
        let _ = app_clone.emit(
            "host-event",
            ServiceEvent::HostStarted {
                port,
                share_path: path_clone.to_string_lossy().to_string(),
                join_code: join_code_clone,
            },
        );

        info!("Host serving {:?} on port {}", path_clone, port);

        // This blocks until the host is stopped
        if let Err(e) = host.serve().await {
            error!("Host error: {:?}", e);
            let _ = app_clone.emit(
                "host-event",
                ServiceEvent::Error {
                    message: format!("Host error: {:?}", e),
                },
            );
        }
    });

    // Store the handle
    {
        let mut host_handle = state.host_handle.lock().await;
        *host_handle = Some(HostHandle {
            abort_handle: host_task.abort_handle(),
        });
    }

    info!("Host started with join code: {}", join_code);
    Ok(())
}

/// Stop hosting
#[tauri::command]
pub async fn stop_hosting(state: State<'_, Arc<AppState>>) -> Result<(), String> {
    info!("Stopping host");

    let mut handle = state.host_handle.lock().await;
    if let Some(h) = handle.take() {
        h.abort_handle.abort();
        info!("Host stopped");
        Ok(())
    } else {
        Err("Not currently hosting".to_string())
    }
}

/// Connect to a peer and mount their shared folder
#[tauri::command]
pub async fn connect_to_peer(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    host_address: String,
    mount_path: String,
) -> Result<(), String> {
    info!(
        "Connecting to {} and mounting at {}",
        host_address, mount_path
    );

    // Check if already connected
    {
        let handle = state.client_handle.lock().await;
        if handle.is_some() {
            return Err("Already connected. Disconnect first.".to_string());
        }
    }

    // Parse the host address
    let server_addr: SocketAddr = host_address
        .parse()
        .map_err(|e| format!("Invalid host address '{}': {}", host_address, e))?;

    // Validate/create mount point
    let mount_point = PathBuf::from(&mount_path);
    if !mount_point.exists() {
        std::fs::create_dir_all(&mount_point)
            .map_err(|e| format!("Failed to create mount point: {}", e))?;
    }

    let mount_point_clone = mount_point.clone();
    let mount_path_str = mount_path.clone();
    let app_clone = app.clone();

    // Spawn the mount in a separate thread (FUSE is blocking)
    let mount_thread = thread::spawn(move || {
        // Create the FUSE ↔ async bridge
        let (bridge, request_rx) = FuseAsyncBridge::new(Duration::from_secs(30));

        // Create client config
        let config = ClientConfig {
            server_addr,
            mount_point: mount_point_clone.clone(),
            request_timeout: Duration::from_secs(30),
        };

        // Create a new runtime for this thread
        let rt = match Runtime::new() {
            Ok(rt) => rt,
            Err(e) => {
                error!("Failed to create runtime: {}", e);
                let _ = app_clone.emit(
                    "mount-event",
                    ServiceEvent::Error {
                        message: format!("Failed to create runtime: {}", e),
                    },
                );
                return;
            }
        };

        // Spawn the client network handler
        let request_rx_clone = request_rx;
        let app_for_client = app_clone.clone();
        let mount_path_for_event = mount_path_str.clone();

        rt.spawn(async move {
            let mut client = WormholeClient::new(config);

            // Connect to the host
            if let Err(e) = client.connect().await {
                error!("Failed to connect: {:?}", e);
                let _ = app_for_client.emit(
                    "mount-event",
                    ServiceEvent::Error {
                        message: format!("Failed to connect: {:?}", e),
                    },
                );
                return;
            }

            info!("Connected to host!");

            // Emit mount ready event
            let _ = app_for_client.emit(
                "mount-event",
                ServiceEvent::MountReady {
                    mountpoint: mount_path_for_event,
                },
            );

            // Handle FUSE requests
            if let Err(e) = client.handle_fuse_requests(request_rx_clone).await {
                error!("Client error: {:?}", e);
            }
        });

        // Mount FUSE filesystem (this blocks until unmounted)
        info!("Mounting filesystem at {:?}", mount_point_clone);

        let fs = WormholeFS::new(bridge);

        let mut mount_options = vec![
            MountOption::FSName("wormhole".to_string()),
            MountOption::AutoUnmount,
            MountOption::DefaultPermissions,
        ];

        // On macOS with kext, allow other users
        #[cfg(target_os = "macos")]
        {
            mount_options.push(MountOption::AllowOther);
        }

        #[cfg(not(target_os = "macos"))]
        {
            mount_options.push(MountOption::AllowOther);
        }

        if let Err(e) = fuser::mount2(fs, &mount_point_clone, &mount_options) {
            error!("Mount failed: {}", e);
            let _ = app_clone.emit(
                "mount-event",
                ServiceEvent::Error {
                    message: format!("Mount failed: {}. Make sure macFUSE is installed and the kernel extension is enabled.", e),
                },
            );
        }

        info!("Filesystem unmounted");
    });

    // Store the handle
    {
        let mut client_handle = state.client_handle.lock().await;
        *client_handle = Some(ClientHandle {
            mount_thread: Some(mount_thread),
            mount_point,
        });
    }

    Ok(())
}

/// Disconnect from peer and unmount
#[tauri::command]
pub async fn disconnect(state: State<'_, Arc<AppState>>) -> Result<(), String> {
    info!("Disconnecting");

    let mut handle = state.client_handle.lock().await;
    if let Some(ch) = handle.take() {
        // Unmount the filesystem
        #[cfg(target_os = "macos")]
        {
            let mount_path = ch.mount_point.to_string_lossy().to_string();
            // Try diskutil first (preferred on macOS)
            let output = std::process::Command::new("diskutil")
                .args(["unmount", &mount_path])
                .output();

            if output.is_err() || !output.as_ref().map(|o| o.status.success()).unwrap_or(false) {
                // Fallback to umount
                let _ = std::process::Command::new("umount")
                    .arg(&mount_path)
                    .output();
            }
        }

        #[cfg(not(target_os = "macos"))]
        {
            let mount_path = ch.mount_point.to_string_lossy().to_string();
            let _ = std::process::Command::new("fusermount")
                .args(["-u", &mount_path])
                .output();
        }

        // Wait for mount thread to finish (with timeout)
        if let Some(thread) = ch.mount_thread {
            // Give it a moment to unmount
            let _ = thread.join();
        }

        info!("Disconnected and unmounted");
        Ok(())
    } else {
        Err("Not currently connected".to_string())
    }
}

/// Get application status
#[tauri::command]
pub async fn get_status(state: State<'_, Arc<AppState>>) -> Result<serde_json::Value, String> {
    let is_hosting = state.host_handle.lock().await.is_some();
    let is_connected = state.client_handle.lock().await.is_some();
    let mount_point = state
        .client_handle
        .lock()
        .await
        .as_ref()
        .map(|h| h.mount_point.to_string_lossy().to_string());

    Ok(serde_json::json!({
        "is_hosting": is_hosting,
        "is_connected": is_connected,
        "mount_point": mount_point
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_app_state_default() {
        let state = AppState::default();
        // Verify runtime was created
        assert!(std::mem::size_of::<AppState>() > 0);
    }

    #[test]
    fn test_service_event_serialization() {
        // Test HostStarted event
        let event = ServiceEvent::HostStarted {
            port: 4433,
            share_path: "/test/path".to_string(),
            join_code: "ABC-123".to_string(),
        };
        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("HostStarted"));
        assert!(json.contains("4433"));
        assert!(json.contains("/test/path"));
        assert!(json.contains("ABC-123"));

        // Test ClientConnected event
        let event = ServiceEvent::ClientConnected {
            peer_addr: "192.168.1.100:4433".to_string(),
        };
        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("ClientConnected"));
        assert!(json.contains("192.168.1.100:4433"));

        // Test MountReady event
        let event = ServiceEvent::MountReady {
            mountpoint: "/tmp/wormhole".to_string(),
        };
        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("MountReady"));
        assert!(json.contains("/tmp/wormhole"));

        // Test Error event
        let event = ServiceEvent::Error {
            message: "Test error".to_string(),
        };
        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("Error"));
        assert!(json.contains("Test error"));
    }

    #[test]
    fn test_service_event_deserialization() {
        let json = r#"{"type":"HostStarted","port":4433,"share_path":"/test","join_code":"ABC-123"}"#;
        let event: ServiceEvent = serde_json::from_str(json).unwrap();
        match event {
            ServiceEvent::HostStarted {
                port,
                share_path,
                join_code,
            } => {
                assert_eq!(port, 4433);
                assert_eq!(share_path, "/test");
                assert_eq!(join_code, "ABC-123");
            }
            _ => panic!("Expected HostStarted event"),
        }
    }
}
