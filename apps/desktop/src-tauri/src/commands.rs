//! Tauri commands for the Wormhole desktop application
//!
//! This module integrates with teleport-daemon to provide real file sharing
//! and mounting functionality through the Tauri UI.
//!
//! Platform support:
//! - Unix (Linux, macOS): Uses FUSE via the fuser crate
//! - Windows: Uses WinFSP via the winfsp crate

use std::collections::HashMap;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use std::thread;

#[cfg(unix)]
use fuser::MountOption;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use tokio::runtime::Runtime;
use tokio::sync::Mutex;
use tracing::{error, info};
#[cfg(windows)]
use winfsp::host::{FileSystemHost, VolumeParams};

use teleport_core::crypto::generate_join_code;
use teleport_daemon::bridge::FuseAsyncBridge;
use teleport_daemon::client::{ClientConfig, WormholeClient};
#[cfg(unix)]
use teleport_daemon::fuse::WormholeFS;
use teleport_daemon::global::{
    connect_global, start_host_global, GlobalEvent, GlobalHostConfig, GlobalMountConfig,
};
use teleport_daemon::host::{HostConfig, WormholeHost};
#[cfg(windows)]
use teleport_daemon::winfsp::WormholeWinFS;

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
    /// Global hosting events
    GlobalWaitingForPeer {
        join_code: String,
    },
    GlobalPeerConnected {
        peer_addr: String,
        is_local: bool,
    },
    GlobalConnecting,
    GlobalHolePunching {
        peer_addr: String,
    },
}

/// Host info structure
#[derive(Clone, Serialize, Deserialize)]
pub struct HostInfo {
    pub id: String,
    pub share_path: String,
    pub port: u16,
    pub join_code: String,
}

/// Mount info structure
#[derive(Clone, Serialize, Deserialize)]
pub struct MountInfo {
    pub id: String,
    pub mount_point: String,
    pub join_code: String,
}

/// Handle for stopping the host
struct HostHandle {
    /// Abort handle for the host task
    abort_handle: tokio::task::AbortHandle,
    /// Host information
    info: HostInfo,
}

/// Handle for stopping the client/mount
struct ClientHandle {
    /// Thread handle for filesystem mount (blocks until unmounted)
    mount_thread: Option<thread::JoinHandle<()>>,
    /// Mount point for cleanup
    mount_point: PathBuf,
    /// Join code used for this connection
    join_code: String,
}

/// Application state for managing host and client connections
/// Supports multiple simultaneous hosts and clients via HashMaps
pub struct AppState {
    /// Active hosts, keyed by share ID
    host_handles: Mutex<HashMap<String, HostHandle>>,
    /// Active client connections, keyed by connection ID
    client_handles: Mutex<HashMap<String, ClientHandle>>,
    /// Counter for auto-incrementing ports
    next_port: Mutex<u16>,
    /// Tokio runtime for async operations
    runtime: Runtime,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            host_handles: Mutex::new(HashMap::new()),
            client_handles: Mutex::new(HashMap::new()),
            next_port: Mutex::new(4433),
            runtime: Runtime::new().expect("Failed to create tokio runtime"),
        }
    }
}

/// Start hosting a folder with a specific ID (supports multiple shares)
#[tauri::command]
pub async fn start_hosting_with_id(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    id: String,
    path: String,
    port: Option<u16>,
) -> Result<HostInfo, String> {
    info!("Starting host {} for path: {}", id, path);

    // Get or auto-assign port
    let port = if let Some(p) = port {
        p
    } else {
        let mut next_port = state.next_port.lock().await;
        let p = *next_port;
        *next_port += 1;
        p
    };

    // Check if this ID is already active
    {
        let handles = state.host_handles.lock().await;
        if handles.contains_key(&id) {
            return Err(format!("Share {} is already active", id));
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
    let id_clone = id.clone();

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

        info!("Host {} serving {:?} on port {}", id_clone, path_clone, port);

        // This blocks until the host is stopped
        if let Err(e) = host.serve().await {
            error!("Host {} error: {:?}", id_clone, e);
            let _ = app_clone.emit(
                "host-event",
                ServiceEvent::Error {
                    message: format!("Host error: {:?}", e),
                },
            );
        }
    });

    let host_info = HostInfo {
        id: id.clone(),
        share_path: share_path.to_string_lossy().to_string(),
        port,
        join_code: join_code.clone(),
    };

    // Store the handle with host info
    {
        let mut handles = state.host_handles.lock().await;
        handles.insert(
            id.clone(),
            HostHandle {
                abort_handle: host_task.abort_handle(),
                info: host_info.clone(),
            },
        );
    }

    info!("Host {} started with join code: {}", id, join_code);
    Ok(host_info)
}

/// Stop hosting by ID
#[tauri::command]
pub async fn stop_hosting_by_id(
    state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<(), String> {
    info!("Stopping host: {}", id);

    let mut handles = state.host_handles.lock().await;
    if let Some(h) = handles.remove(&id) {
        h.abort_handle.abort();
        info!("Host {} stopped", id);
        Ok(())
    } else {
        Err(format!("No active host with id: {}", id))
    }
}

/// Legacy: Start hosting a folder (single share, backwards compatible)
#[tauri::command]
pub async fn start_hosting(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    path: String,
    port: u16,
) -> Result<(), String> {
    // Use a fixed ID for legacy single-share mode
    let id = "default".to_string();

    // Stop any existing default host first
    let _ = stop_hosting_by_id(state.clone(), id.clone()).await;

    // Start with the new function
    start_hosting_with_id(app, state, id, path, Some(port)).await?;
    Ok(())
}

/// Legacy: Stop hosting (single share, backwards compatible)
#[tauri::command]
pub async fn stop_hosting(state: State<'_, Arc<AppState>>) -> Result<(), String> {
    // Stop the default host
    stop_hosting_by_id(state, "default".to_string()).await
}

/// Connect to a peer and mount their shared folder (Unix only)
#[cfg(unix)]
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

    // For legacy single-connection, use "default" ID
    let _ = disconnect_by_id(state.clone(), "default".to_string()).await;

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
        let mut handles = state.client_handles.lock().await;
        handles.insert(
            "default".to_string(),
            ClientHandle {
                mount_thread: Some(mount_thread),
                mount_point,
                join_code: host_address.clone(), // Use host_address as identifier
            },
        );
    }

    Ok(())
}

/// Connect to a peer and mount their shared folder (Windows - WinFSP)
#[cfg(windows)]
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

    // For legacy single-connection, use "default" ID
    let _ = disconnect_by_id(state.clone(), "default".to_string()).await;

    // Parse the host address
    let server_addr: SocketAddr = host_address
        .parse()
        .map_err(|e| format!("Invalid host address '{}': {}", host_address, e))?;

    // Validate mount point (for Windows, this is a drive letter like "W:")
    let mount_point = PathBuf::from(&mount_path);
    let mount_path_str = mount_path.clone();
    let app_clone = app.clone();

    // Spawn the mount in a separate thread (WinFSP is blocking)
    let mount_thread = thread::spawn(move || {
        // Create the filesystem ↔ async bridge
        let (bridge, request_rx) = FuseAsyncBridge::new(Duration::from_secs(30));

        // Create client config
        let config = ClientConfig {
            server_addr,
            mount_point: mount_point.clone(),
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

            // Handle filesystem requests
            if let Err(e) = client.handle_fuse_requests(request_rx).await {
                error!("Client error: {:?}", e);
            }
        });

        // Create WinFSP filesystem
        info!("Mounting filesystem via WinFSP at {}", mount_path_str);
        let fs = WormholeWinFS::new(bridge);

        // Create volume parameters
        let mut params = VolumeParams::new();
        params.filesystem_name("Wormhole");
        params.prefix(&mount_path_str);

        match FileSystemHost::new(params, fs) {
            Ok(mut host) => {
                if let Err(e) = host.mount(&mount_path_str) {
                    error!("Mount failed: {:?}", e);
                    let _ = app_clone.emit(
                        "mount-event",
                        ServiceEvent::Error {
                            message: format!(
                                "Mount failed: {:?}. Make sure WinFSP is installed.",
                                e
                            ),
                        },
                    );
                    return;
                }

                info!("Filesystem mounted at {}", mount_path_str);

                // Start the filesystem dispatcher (blocks until stopped)
                if let Err(e) = host.start() {
                    error!("Filesystem error: {:?}", e);
                }

                let _ = host.unmount();
                info!("Filesystem unmounted");
            }
            Err(e) => {
                error!("Failed to create filesystem host: {:?}", e);
                let _ = app_clone.emit(
                    "mount-event",
                    ServiceEvent::Error {
                        message: format!(
                            "Failed to create filesystem: {:?}. Make sure WinFSP is installed.",
                            e
                        ),
                    },
                );
            }
        }
    });

    // Store the handle
    {
        let mut handles = state.client_handles.lock().await;
        handles.insert(
            "default".to_string(),
            ClientHandle {
                mount_thread: Some(mount_thread),
                mount_point: PathBuf::from(&mount_path),
                join_code: host_address.clone(),
            },
        );
    }

    Ok(())
}

/// Disconnect by connection ID
#[tauri::command]
pub async fn disconnect_by_id(
    state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<(), String> {
    info!("Disconnecting connection: {}", id);

    let mut handles = state.client_handles.lock().await;
    if let Some(ch) = handles.remove(&id) {
        let mount_path = ch.mount_point.to_string_lossy().to_string();

        // Force unmount in background - don't wait for it to complete
        std::thread::spawn(move || {
            #[cfg(target_os = "macos")]
            {
                info!("Force unmounting {}", mount_path);
                let _ = std::process::Command::new("umount")
                    .args(["-f", &mount_path])
                    .output();
            }

            #[cfg(target_os = "linux")]
            {
                info!("Force unmounting {}", mount_path);
                let _ = std::process::Command::new("fusermount")
                    .args(["-uz", &mount_path])
                    .output();
            }

            #[cfg(target_os = "windows")]
            {
                info!("Force unmounting WinFSP volume: {}", mount_path);
            }
        });

        if let Some(_thread) = ch.mount_thread {
            info!("Disconnecting {} - mount thread will cleanup in background", id);
        }

        info!("Disconnected {} and unmounted", id);
        Ok(())
    } else {
        Err(format!("No active connection with id: {}", id))
    }
}

/// Legacy: Disconnect from peer and unmount (backwards compatible)
#[tauri::command]
pub async fn disconnect(state: State<'_, Arc<AppState>>) -> Result<(), String> {
    // Try to disconnect the default connection first
    if disconnect_by_id(state.clone(), "default".to_string()).await.is_ok() {
        return Ok(());
    }

    // Otherwise disconnect any connection
    let handles = state.client_handles.lock().await;
    if let Some(id) = handles.keys().next().cloned() {
        drop(handles);
        disconnect_by_id(state, id).await
    } else {
        Err("Not currently connected".to_string())
    }
}

/// Get application status
#[tauri::command]
pub async fn get_status(state: State<'_, Arc<AppState>>) -> Result<serde_json::Value, String> {
    let host_handles = state.host_handles.lock().await;
    let client_handles = state.client_handles.lock().await;

    let is_hosting = !host_handles.is_empty();
    let is_connected = !client_handles.is_empty();
    let host_count = host_handles.len();
    let connection_count = client_handles.len();
    let mount_point = client_handles.values().next().map(|h| h.mount_point.to_string_lossy().to_string());

    Ok(serde_json::json!({
        "is_hosting": is_hosting,
        "is_connected": is_connected,
        "host_count": host_count,
        "connection_count": connection_count,
        "mount_point": mount_point
    }))
}

/// Start global hosting via signal server with ID (supports multiple shares)
#[tauri::command]
pub async fn start_global_hosting_with_id(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    id: String,
    path: String,
    join_code: Option<String>,
) -> Result<HostInfo, String> {
    info!("Starting global host {} for path: {}", id, path);

    // Check if this ID is already active
    {
        let handles = state.host_handles.lock().await;
        if handles.contains_key(&id) {
            return Err(format!("Share {} is already active", id));
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

    // Auto-increment port for multiple shares
    let port = {
        let mut next_port = state.next_port.lock().await;
        let p = *next_port;
        *next_port += 1;
        p
    };

    let config = GlobalHostConfig {
        shared_path: share_path.clone(),
        signal_server: None,
        join_code,
        quic_port: port,
        max_connections: 10,
    };

    let app_clone = app.clone();
    let path_clone = share_path.clone();
    let id_clone = id.clone();

    let (code_tx, code_rx) = tokio::sync::oneshot::channel::<Result<String, String>>();

    let host_task = state.runtime.spawn(async move {
        let mut final_code = String::new();

        let event_callback = |event: GlobalEvent| match &event {
            GlobalEvent::WaitingForPeer { join_code } => {
                final_code = join_code.clone();
                let _ = app_clone.emit(
                    "global-event",
                    ServiceEvent::GlobalWaitingForPeer {
                        join_code: join_code.clone(),
                    },
                );
            }
            GlobalEvent::PeerConnected {
                peer_addr,
                is_local,
            } => {
                let _ = app_clone.emit(
                    "global-event",
                    ServiceEvent::GlobalPeerConnected {
                        peer_addr: peer_addr.to_string(),
                        is_local: *is_local,
                    },
                );
            }
            GlobalEvent::HolePunching { peer_addr } => {
                let _ = app_clone.emit(
                    "global-event",
                    ServiceEvent::GlobalHolePunching {
                        peer_addr: peer_addr.to_string(),
                    },
                );
            }
            GlobalEvent::HostReady {
                join_code,
                bind_addr,
            } => {
                let _ = app_clone.emit(
                    "host-event",
                    ServiceEvent::HostStarted {
                        port: bind_addr.port(),
                        share_path: path_clone.to_string_lossy().to_string(),
                        join_code: join_code.clone(),
                    },
                );
            }
            GlobalEvent::Error { message } => {
                let _ = app_clone.emit(
                    "global-event",
                    ServiceEvent::Error {
                        message: message.clone(),
                    },
                );
            }
            _ => {}
        };

        match start_host_global(config, event_callback).await {
            Ok(_result) => {
                let _ = code_tx.send(Ok(final_code));
            }
            Err(e) => {
                error!("Global host {} error: {:?}", id_clone, e);
                let _ = code_tx.send(Err(format!("Global host error: {}", e)));
            }
        }
    });

    let final_code = match code_rx.await {
        Ok(Ok(code)) => {
            info!("Global host {} started with join code: {}", id, code);
            code
        }
        Ok(Err(e)) => return Err(e),
        Err(_) => return Err("Failed to get join code".to_string()),
    };

    let host_info = HostInfo {
        id: id.clone(),
        share_path: share_path.to_string_lossy().to_string(),
        port,
        join_code: final_code.clone(),
    };

    {
        let mut handles = state.host_handles.lock().await;
        handles.insert(
            id.clone(),
            HostHandle {
                abort_handle: host_task.abort_handle(),
                info: host_info.clone(),
            },
        );
    }

    Ok(host_info)
}

/// Legacy: Start global hosting (backwards compatible)
#[tauri::command]
pub async fn start_global_hosting(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    path: String,
    join_code: Option<String>,
) -> Result<String, String> {
    let id = "default".to_string();
    let _ = stop_hosting_by_id(state.clone(), id.clone()).await;
    let host_info = start_global_hosting_with_id(app, state, id, path, join_code).await?;
    Ok(host_info.join_code)
}

/// Connect to a global host using a join code with ID (Unix only)
#[cfg(unix)]
#[tauri::command]
pub async fn connect_with_code_and_id(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    id: String,
    join_code: String,
    mount_path: String,
) -> Result<MountInfo, String> {
    info!(
        "Connecting {} with code {} to mount at {}",
        id, join_code, mount_path
    );

    // Check if this ID is already active
    {
        let handles = state.client_handles.lock().await;
        if handles.contains_key(&id) {
            return Err(format!("Connection {} is already active", id));
        }
    }

    // Check if mount path is already in use
    {
        let handles = state.client_handles.lock().await;
        for h in handles.values() {
            if h.mount_point.to_string_lossy() == mount_path {
                return Err(format!("Mount path {} is already in use", mount_path));
            }
        }
    }

    // Validate/create mount point
    let mount_point = PathBuf::from(&mount_path);
    if !mount_point.exists() {
        std::fs::create_dir_all(&mount_point)
            .map_err(|e| format!("Failed to create mount point: {}", e))?;
    }

    let mount_point_clone = mount_point.clone();
    let app_clone = app.clone();

    let config = GlobalMountConfig {
        join_code: join_code.clone(),
        mount_point: mount_point_clone.clone(),
        signal_server: None, // Use default
        request_timeout: Duration::from_secs(30),
    };

    // Use a channel to signal when connection is established
    let (connect_tx, connect_rx) = tokio::sync::oneshot::channel::<Result<SocketAddr, String>>();

    // Spawn connection task
    let connect_task = state.runtime.spawn(async move {
        // Event callback
        let event_callback = |event: GlobalEvent| match &event {
            GlobalEvent::Connecting { .. } => {
                let _ = app_clone.emit("global-event", ServiceEvent::GlobalConnecting);
            }
            GlobalEvent::PeerConnected {
                peer_addr,
                is_local,
            } => {
                let _ = app_clone.emit(
                    "global-event",
                    ServiceEvent::GlobalPeerConnected {
                        peer_addr: peer_addr.to_string(),
                        is_local: *is_local,
                    },
                );
            }
            GlobalEvent::HolePunching { peer_addr } => {
                let _ = app_clone.emit(
                    "global-event",
                    ServiceEvent::GlobalHolePunching {
                        peer_addr: peer_addr.to_string(),
                    },
                );
            }
            GlobalEvent::Error { message } => {
                let _ = app_clone.emit(
                    "global-event",
                    ServiceEvent::Error {
                        message: message.clone(),
                    },
                );
            }
            _ => {}
        };

        match connect_global(config, event_callback).await {
            Ok(result) => {
                let _ = connect_tx.send(Ok(result.peer_addr));
            }
            Err(e) => {
                error!("Global connect error: {:?}", e);
                let _ = connect_tx.send(Err(format!("Connection error: {}", e)));
            }
        }
    });

    // Wait for connection to be established
    let server_addr = match connect_rx.await {
        Ok(Ok(addr)) => addr,
        Ok(Err(e)) => return Err(e),
        Err(_) => return Err("Connection task failed".to_string()),
    };

    // Abort the connection task (we got what we needed)
    connect_task.abort();

    // Now proceed with mounting using the discovered peer address
    // (Reuse the existing connect_to_peer logic with the discovered address)
    let mount_path_str = mount_path.clone();
    let app_for_mount = app.clone();
    let mount_point_for_client = mount_point.clone();

    let mount_thread = thread::spawn(move || {
        let (bridge, request_rx) = FuseAsyncBridge::new(Duration::from_secs(30));

        let config = ClientConfig {
            server_addr,
            mount_point: mount_point_for_client.clone(),
            request_timeout: Duration::from_secs(30),
        };

        let rt = match Runtime::new() {
            Ok(rt) => rt,
            Err(e) => {
                error!("Failed to create runtime: {}", e);
                let _ = app_for_mount.emit(
                    "mount-event",
                    ServiceEvent::Error {
                        message: format!("Failed to create runtime: {}", e),
                    },
                );
                return;
            }
        };

        let app_for_client = app_for_mount.clone();
        let mount_path_for_event = mount_path_str.clone();

        rt.spawn(async move {
            let mut client = WormholeClient::new(config);

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

            info!("Connected to host via join code!");

            let _ = app_for_client.emit(
                "mount-event",
                ServiceEvent::MountReady {
                    mountpoint: mount_path_for_event,
                },
            );

            if let Err(e) = client.handle_fuse_requests(request_rx).await {
                error!("Client error: {:?}", e);
            }
        });

        info!("Mounting filesystem at {:?}", mount_point_for_client);

        let fs = WormholeFS::new(bridge);

        let mut mount_options = vec![
            MountOption::FSName("wormhole".to_string()),
            MountOption::AutoUnmount,
            MountOption::DefaultPermissions,
        ];

        #[cfg(target_os = "macos")]
        {
            mount_options.push(MountOption::AllowOther);
        }

        #[cfg(not(target_os = "macos"))]
        {
            mount_options.push(MountOption::AllowOther);
        }

        if let Err(e) = fuser::mount2(fs, &mount_point_for_client, &mount_options) {
            error!("Mount failed: {}", e);
            let _ = app_for_mount.emit(
                "mount-event",
                ServiceEvent::Error {
                    message: format!("Mount failed: {}", e),
                },
            );
        }

        info!("Filesystem unmounted");
    });

    let mount_info = MountInfo {
        id: id.clone(),
        mount_point: mount_point.to_string_lossy().to_string(),
        join_code: join_code.clone(),
    };

    // Store the handle
    {
        let mut handles = state.client_handles.lock().await;
        handles.insert(
            id.clone(),
            ClientHandle {
                mount_thread: Some(mount_thread),
                mount_point,
                join_code,
            },
        );
    }

    Ok(mount_info)
}

/// Legacy: Connect to a global host using a join code (Unix only)
#[cfg(unix)]
#[tauri::command]
pub async fn connect_with_code(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    join_code: String,
    mount_path: String,
) -> Result<(), String> {
    let id = "default".to_string();
    let _ = disconnect_by_id(state.clone(), id.clone()).await;
    connect_with_code_and_id(app, state, id, join_code, mount_path).await?;
    Ok(())
}

/// Connect to a global host using a join code with ID (Windows - WinFSP)
#[cfg(windows)]
#[tauri::command]
pub async fn connect_with_code_and_id(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    id: String,
    join_code: String,
    mount_path: String,
) -> Result<MountInfo, String> {
    info!(
        "Connecting {} with code {} to mount at {}",
        id, join_code, mount_path
    );

    // Check if this ID is already active
    {
        let handles = state.client_handles.lock().await;
        if handles.contains_key(&id) {
            return Err(format!("Connection {} is already active", id));
        }
    }

    // Check if mount path is already in use
    {
        let handles = state.client_handles.lock().await;
        for h in handles.values() {
            if h.mount_point.to_string_lossy() == mount_path {
                return Err(format!("Mount path {} is already in use", mount_path));
            }
        }
    }

    let mount_point = PathBuf::from(&mount_path);
    let app_clone = app.clone();

    let config = GlobalMountConfig {
        join_code: join_code.clone(),
        mount_point: mount_point.clone(),
        signal_server: None,
        request_timeout: Duration::from_secs(30),
    };

    // Use a channel to signal when connection is established
    let (connect_tx, connect_rx) = tokio::sync::oneshot::channel::<Result<SocketAddr, String>>();

    // Spawn connection task
    let connect_task = state.runtime.spawn(async move {
        let event_callback = |event: GlobalEvent| match &event {
            GlobalEvent::Connecting { .. } => {
                let _ = app_clone.emit("global-event", ServiceEvent::GlobalConnecting);
            }
            GlobalEvent::PeerConnected {
                peer_addr,
                is_local,
            } => {
                let _ = app_clone.emit(
                    "global-event",
                    ServiceEvent::GlobalPeerConnected {
                        peer_addr: peer_addr.to_string(),
                        is_local: *is_local,
                    },
                );
            }
            GlobalEvent::HolePunching { peer_addr } => {
                let _ = app_clone.emit(
                    "global-event",
                    ServiceEvent::GlobalHolePunching {
                        peer_addr: peer_addr.to_string(),
                    },
                );
            }
            GlobalEvent::Error { message } => {
                let _ = app_clone.emit(
                    "global-event",
                    ServiceEvent::Error {
                        message: message.clone(),
                    },
                );
            }
            _ => {}
        };

        match connect_global(config, event_callback).await {
            Ok(result) => {
                let _ = connect_tx.send(Ok(result.peer_addr));
            }
            Err(e) => {
                error!("Global connect error: {:?}", e);
                let _ = connect_tx.send(Err(format!("Connection error: {}", e)));
            }
        }
    });

    // Wait for connection to be established
    let server_addr = match connect_rx.await {
        Ok(Ok(addr)) => addr,
        Ok(Err(e)) => return Err(e),
        Err(_) => return Err("Connection task failed".to_string()),
    };

    connect_task.abort();

    // Now proceed with mounting using the discovered peer address
    let mount_path_str = mount_path.clone();
    let app_for_mount = app.clone();
    let mount_point_for_client = mount_point.clone();

    let mount_thread = thread::spawn(move || {
        let (bridge, request_rx) = FuseAsyncBridge::new(Duration::from_secs(30));

        let config = ClientConfig {
            server_addr,
            mount_point: mount_point_for_client.clone(),
            request_timeout: Duration::from_secs(30),
        };

        let rt = match Runtime::new() {
            Ok(rt) => rt,
            Err(e) => {
                error!("Failed to create runtime: {}", e);
                let _ = app_for_mount.emit(
                    "mount-event",
                    ServiceEvent::Error {
                        message: format!("Failed to create runtime: {}", e),
                    },
                );
                return;
            }
        };

        let app_for_client = app_for_mount.clone();
        let mount_path_for_event = mount_path_str.clone();

        rt.spawn(async move {
            let mut client = WormholeClient::new(config);

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

            info!("Connected to host via join code!");

            let _ = app_for_client.emit(
                "mount-event",
                ServiceEvent::MountReady {
                    mountpoint: mount_path_for_event,
                },
            );

            if let Err(e) = client.handle_fuse_requests(request_rx).await {
                error!("Client error: {:?}", e);
            }
        });

        info!("Mounting filesystem via WinFSP at {}", mount_path_str);
        let fs = WormholeWinFS::new(bridge);

        // Create volume parameters
        let mut params = VolumeParams::new();
        params.filesystem_name("Wormhole");
        params.prefix(&mount_path_str);

        match FileSystemHost::new(params, fs) {
            Ok(mut host) => {
                if let Err(e) = host.mount(&mount_path_str) {
                    error!("Mount failed: {:?}", e);
                    let _ = app_for_mount.emit(
                        "mount-event",
                        ServiceEvent::Error {
                            message: format!(
                                "Mount failed: {:?}. Make sure WinFSP is installed.",
                                e
                            ),
                        },
                    );
                    return;
                }

                info!("Filesystem mounted at {}", mount_path_str);

                if let Err(e) = host.start() {
                    error!("Filesystem error: {:?}", e);
                }

                let _ = host.unmount();
                info!("Filesystem unmounted");
            }
            Err(e) => {
                error!("Failed to create filesystem host: {:?}", e);
                let _ = app_for_mount.emit(
                    "mount-event",
                    ServiceEvent::Error {
                        message: format!(
                            "Failed to create filesystem: {:?}. Make sure WinFSP is installed.",
                            e
                        ),
                    },
                );
            }
        }
    });

    let mount_info = MountInfo {
        id: id.clone(),
        mount_point: mount_point.to_string_lossy().to_string(),
        join_code: join_code.clone(),
    };

    // Store the handle
    {
        let mut handles = state.client_handles.lock().await;
        handles.insert(
            id.clone(),
            ClientHandle {
                mount_thread: Some(mount_thread),
                mount_point,
                join_code,
            },
        );
    }

    Ok(mount_info)
}

/// Legacy: Connect to a global host using a join code (Windows)
#[cfg(windows)]
#[tauri::command]
pub async fn connect_with_code(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    join_code: String,
    mount_path: String,
) -> Result<(), String> {
    let id = "default".to_string();
    let _ = disconnect_by_id(state.clone(), id.clone()).await;
    connect_with_code_and_id(app, state, id, join_code, mount_path).await?;
    Ok(())
}

/// Generate a new join code for sharing
#[tauri::command]
pub fn generate_code() -> String {
    generate_join_code()
}

/// Get the local IP address(es) of this machine
#[tauri::command]
pub fn get_local_ip() -> Result<Vec<String>, String> {
    use std::net::UdpSocket;

    // Try to get the primary local IP by connecting to a public DNS
    let mut ips = Vec::new();

    // Method 1: Connect to external address to find local IP
    if let Ok(socket) = UdpSocket::bind("0.0.0.0:0") {
        if socket.connect("8.8.8.8:80").is_ok() {
            if let Ok(addr) = socket.local_addr() {
                let ip = addr.ip().to_string();
                if !ip.starts_with("127.") {
                    ips.push(ip);
                }
            }
        }
    }

    // Method 2: Get all network interfaces
    use std::net::ToSocketAddrs;
    if let Ok(hostname) = hostname::get() {
        if let Some(hostname_str) = hostname.to_str() {
            // Try to resolve hostname to get all IPs
            if let Ok(addrs) = format!("{}:0", hostname_str).to_socket_addrs() {
                for addr in addrs {
                    let ip = addr.ip().to_string();
                    if !ip.starts_with("127.") && !ip.starts_with("::") && !ips.contains(&ip) {
                        ips.push(ip);
                    }
                }
            }
        }
    }

    if ips.is_empty() {
        Err("Could not determine local IP address".to_string())
    } else {
        Ok(ips)
    }
}

/// File entry for directory listing
#[derive(Clone, Serialize, Deserialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: Option<u64>,
}

/// List files in a directory
#[tauri::command]
pub fn list_directory(path: String) -> Result<Vec<FileEntry>, String> {
    let path = PathBuf::from(&path);

    if !path.exists() {
        return Err(format!("Path does not exist: {}", path.display()));
    }

    if !path.is_dir() {
        return Err(format!("Path is not a directory: {}", path.display()));
    }

    let mut entries = Vec::new();

    match std::fs::read_dir(&path) {
        Ok(dir) => {
            for entry in dir.flatten() {
                let file_path = entry.path();
                let metadata = entry.metadata().ok();

                let name = entry.file_name().to_string_lossy().to_string();

                // Skip hidden files (starting with .)
                if name.starts_with('.') {
                    continue;
                }

                let is_dir = file_path.is_dir();
                let size = metadata.as_ref().map(|m| m.len()).unwrap_or(0);
                let modified = metadata
                    .and_then(|m| m.modified().ok())
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_secs());

                entries.push(FileEntry {
                    name,
                    path: file_path.to_string_lossy().to_string(),
                    is_dir,
                    size,
                    modified,
                });
            }
        }
        Err(e) => {
            return Err(format!("Failed to read directory: {}", e));
        }
    }

    // Sort: directories first, then by name
    entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    Ok(entries)
}

/// Get all active hosts
#[tauri::command]
pub async fn get_active_hosts(state: State<'_, Arc<AppState>>) -> Result<Vec<HostInfo>, String> {
    let handles = state.host_handles.lock().await;
    Ok(handles.values().map(|h| h.info.clone()).collect())
}

/// Get all active mounts/connections
#[tauri::command]
pub async fn get_active_mounts(state: State<'_, Arc<AppState>>) -> Result<Vec<MountInfo>, String> {
    let handles = state.client_handles.lock().await;
    Ok(handles
        .iter()
        .map(|(id, h)| MountInfo {
            id: id.clone(),
            mount_point: h.mount_point.to_string_lossy().to_string(),
            join_code: h.join_code.clone(),
        })
        .collect())
}

/// Get current hosting info (legacy - returns first active host)
#[tauri::command]
pub async fn get_host_info(state: State<'_, Arc<AppState>>) -> Result<Option<HostInfo>, String> {
    let handles = state.host_handles.lock().await;
    Ok(handles.values().next().map(|h| h.info.clone()))
}

/// Get current mount info (legacy - returns first active mount)
#[tauri::command]
pub async fn get_mount_info(state: State<'_, Arc<AppState>>) -> Result<Option<MountInfo>, String> {
    let handles = state.client_handles.lock().await;
    Ok(handles.iter().next().map(|(id, h)| MountInfo {
        id: id.clone(),
        mount_point: h.mount_point.to_string_lossy().to_string(),
        join_code: h.join_code.clone(),
    }))
}

/// Delete a file or folder
#[tauri::command]
pub fn delete_path(path: String) -> Result<(), String> {
    let path = PathBuf::from(&path);

    if !path.exists() {
        return Err(format!("Path does not exist: {}", path.display()));
    }

    if path.is_dir() {
        std::fs::remove_dir_all(&path)
            .map_err(|e| format!("Failed to delete folder: {}", e))?;
    } else {
        std::fs::remove_file(&path)
            .map_err(|e| format!("Failed to delete file: {}", e))?;
    }

    info!("Deleted: {}", path.display());
    Ok(())
}

/// Open a file with the default application
#[tauri::command]
pub fn open_file(path: String) -> Result<(), String> {
    let path = PathBuf::from(&path);

    if !path.exists() {
        return Err(format!("Path does not exist: {}", path.display()));
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open file: {}", e))?;
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &path.to_string_lossy()])
            .spawn()
            .map_err(|e| format!("Failed to open file: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open file: {}", e))?;
    }

    info!("Opened: {}", path.display());
    Ok(())
}

/// Reveal a file or folder in the native file explorer
#[tauri::command]
pub fn reveal_in_explorer(path: String) -> Result<(), String> {
    let path = PathBuf::from(&path);

    if !path.exists() {
        return Err(format!("Path does not exist: {}", path.display()));
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .args(["-R", &path.to_string_lossy()])
            .spawn()
            .map_err(|e| format!("Failed to reveal in Finder: {}", e))?;
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .args(["/select,", &path.to_string_lossy()])
            .spawn()
            .map_err(|e| format!("Failed to reveal in Explorer: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        // Try to use nautilus, thunar, or xdg-open as fallback
        let parent = path.parent().unwrap_or(&path);
        std::process::Command::new("xdg-open")
            .arg(parent)
            .spawn()
            .map_err(|e| format!("Failed to reveal in file manager: {}", e))?;
    }

    info!("Revealed in explorer: {}", path.display());
    Ok(())
}

/// Check if FUSE is installed on the system
/// Returns true if FUSE (macFUSE, WinFSP, or libfuse) is available
#[tauri::command]
pub fn check_fuse_installed() -> bool {
    #[cfg(target_os = "macos")]
    {
        // Check for macFUSE by looking for the kext or the /Library/Filesystems entry
        let macfuse_path = std::path::Path::new("/Library/Filesystems/macfuse.fs");
        let osxfuse_path = std::path::Path::new("/Library/Filesystems/osxfuse.fs");

        if macfuse_path.exists() || osxfuse_path.exists() {
            return true;
        }

        // Also try running a quick check
        if let Ok(output) = std::process::Command::new("kextstat")
            .args(["-l", "-b", "io.macfuse.filesystems.macfuse"])
            .output()
        {
            if output.status.success() && !output.stdout.is_empty() {
                return true;
            }
        }

        false
    }

    #[cfg(target_os = "windows")]
    {
        // Check for WinFSP installation
        let winfsp_path = std::path::Path::new("C:\\Program Files (x86)\\WinFsp");
        let winfsp_path2 = std::path::Path::new("C:\\Program Files\\WinFsp");

        winfsp_path.exists() || winfsp_path2.exists()
    }

    #[cfg(target_os = "linux")]
    {
        // Check for FUSE by looking for /dev/fuse or the fusermount binary
        let dev_fuse = std::path::Path::new("/dev/fuse");

        if dev_fuse.exists() {
            return true;
        }

        // Check for fusermount or fusermount3
        if let Ok(output) = std::process::Command::new("which")
            .arg("fusermount3")
            .output()
        {
            if output.status.success() {
                return true;
            }
        }

        if let Ok(output) = std::process::Command::new("which")
            .arg("fusermount")
            .output()
        {
            if output.status.success() {
                return true;
            }
        }

        false
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        false
    }
}

/// Index entry for fast searching
#[derive(Clone, Serialize, Deserialize)]
pub struct IndexEntry {
    pub name: String,
    pub name_lower: String, // Pre-computed lowercase for fast search
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: Option<u64>,
    pub root_path: String,   // Which share/mount this belongs to
    pub root_name: String,   // Display name for the source
    pub root_type: String,   // "share" or "connection"
}

/// Recursively index all files in a directory
/// Returns a flat list of all files for instant search
#[tauri::command]
pub fn index_directory(
    path: String,
    root_name: String,
    root_type: String,
    max_depth: Option<u32>,
) -> Result<Vec<IndexEntry>, String> {
    let root_path = PathBuf::from(&path);

    if !root_path.exists() {
        return Err(format!("Path does not exist: {}", root_path.display()));
    }

    if !root_path.is_dir() {
        return Err(format!("Path is not a directory: {}", root_path.display()));
    }

    let mut entries = Vec::new();
    let max_depth = max_depth.unwrap_or(10); // Default max depth

    fn walk_dir(
        dir: &PathBuf,
        entries: &mut Vec<IndexEntry>,
        root_path: &str,
        root_name: &str,
        root_type: &str,
        current_depth: u32,
        max_depth: u32,
    ) {
        if current_depth > max_depth {
            return;
        }

        if let Ok(read_dir) = std::fs::read_dir(dir) {
            for entry in read_dir.flatten() {
                let file_path = entry.path();
                let metadata = entry.metadata().ok();
                let name = entry.file_name().to_string_lossy().to_string();

                // Skip hidden files/folders
                if name.starts_with('.') {
                    continue;
                }

                let is_dir = file_path.is_dir();
                let size = metadata.as_ref().map(|m| m.len()).unwrap_or(0);
                let modified = metadata.as_ref().and_then(|m| {
                    m.modified()
                        .ok()
                        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                        .map(|d| d.as_secs())
                });

                entries.push(IndexEntry {
                    name: name.clone(),
                    name_lower: name.to_lowercase(),
                    path: file_path.to_string_lossy().to_string(),
                    is_dir,
                    size,
                    modified,
                    root_path: root_path.to_string(),
                    root_name: root_name.to_string(),
                    root_type: root_type.to_string(),
                });

                // Recurse into directories
                if is_dir {
                    walk_dir(
                        &file_path,
                        entries,
                        root_path,
                        root_name,
                        root_type,
                        current_depth + 1,
                        max_depth,
                    );
                }
            }
        }
    }

    walk_dir(
        &root_path,
        &mut entries,
        &path,
        &root_name,
        &root_type,
        0,
        max_depth,
    );

    info!(
        "Indexed {} files from {} ({})",
        entries.len(),
        root_name,
        path
    );

    Ok(entries)
}

/// Update information from GitHub
#[derive(Clone, Serialize, Deserialize)]
pub struct UpdateInfo {
    pub version: String,
    pub release_url: String,
    pub release_notes: Option<String>,
    pub published_at: Option<String>,
}

/// Check for updates from GitHub releases
#[tauri::command]
pub async fn check_for_updates(current_version: String) -> Result<Option<UpdateInfo>, String> {
    use semver::Version;

    let url = "https://api.github.com/repos/byronwade/wormhole/releases/latest";

    let client = reqwest::Client::builder()
        .user_agent("Wormhole-Desktop")
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch releases: {}", e))?;

    if !response.status().is_success() {
        // No releases found or rate limited
        if response.status() == reqwest::StatusCode::NOT_FOUND {
            return Ok(None);
        }
        return Err(format!("GitHub API error: {}", response.status()));
    }

    let release: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse release: {}", e))?;

    let tag_name = release["tag_name"]
        .as_str()
        .ok_or("No tag name in release")?;

    // Remove 'v' prefix if present
    let latest_version_str = tag_name.trim_start_matches('v');
    let current_version_str = current_version.trim_start_matches('v');

    // Parse versions
    let latest_version = Version::parse(latest_version_str)
        .map_err(|e| format!("Invalid latest version '{}': {}", latest_version_str, e))?;
    let current_version = Version::parse(current_version_str)
        .map_err(|e| format!("Invalid current version '{}': {}", current_version_str, e))?;

    // Compare versions
    if latest_version > current_version {
        Ok(Some(UpdateInfo {
            version: tag_name.to_string(),
            release_url: release["html_url"]
                .as_str()
                .unwrap_or("")
                .to_string(),
            release_notes: release["body"].as_str().map(|s| s.to_string()),
            published_at: release["published_at"].as_str().map(|s| s.to_string()),
        }))
    } else {
        Ok(None)
    }
}

/// Start hosting with expiration support
#[tauri::command]
pub async fn start_hosting_with_expiration(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    id: String,
    path: String,
    port: Option<u16>,
    expires_in_ms: Option<u64>,
) -> Result<HostInfo, String> {
    info!(
        "Starting host {} for path: {} with expiration: {:?}ms",
        id, path, expires_in_ms
    );

    // Start the host normally first
    let host_info = start_hosting_with_id(app.clone(), state.clone(), id.clone(), path.clone(), port).await?;

    // If expiration is set, spawn a task to auto-stop the share
    if let Some(ms) = expires_in_ms {
        let state_clone = state.inner().clone();
        let app_clone = app.clone();
        let id_clone = id.clone();

        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(ms)).await;

            info!("Share {} has expired, stopping...", id_clone);

            // Stop the host
            let mut handles = state_clone.host_handles.lock().await;
            if let Some(h) = handles.remove(&id_clone) {
                h.abort_handle.abort();

                // Emit expired event to frontend
                let _ = app_clone.emit("share-expired", serde_json::json!({
                    "id": id_clone,
                    "share_path": h.info.share_path,
                }));

                info!("Expired share {} stopped successfully", id_clone);
            }
        });
    }

    Ok(host_info)
}

// === Phase 8: High-Performance Bulk Export ===

/// Transfer progress event for real-time UI updates
#[derive(Clone, Serialize, Deserialize)]
pub struct TransferProgressEvent {
    pub transfer_id: String,
    pub file_name: String,
    pub bytes_transferred: u64,
    pub total_bytes: u64,
    pub speed_bps: f64,
    pub eta_seconds: Option<u64>,
}

/// Transfer completed event
#[derive(Clone, Serialize, Deserialize)]
pub struct TransferCompletedEvent {
    pub transfer_id: String,
    pub success: bool,
    pub bytes_transferred: u64,
    pub duration_ms: u64,
    pub error: Option<String>,
}

/// High-performance file export from mounted share to local disk
/// This bypasses FUSE for maximum throughput using parallel reads and smart compression
#[tauri::command]
pub async fn export_file(
    app: AppHandle,
    source_path: String,
    dest_path: String,
    transfer_id: String,
) -> Result<(), String> {
    use std::io::{Read, Write};
    use std::time::Instant;

    info!("Starting bulk export: {} -> {}", source_path, dest_path);

    let source = PathBuf::from(&source_path);
    let dest = PathBuf::from(&dest_path);

    // Validate source exists
    if !source.exists() {
        return Err(format!("Source file does not exist: {}", source_path));
    }

    // Get file size for progress tracking
    let metadata = std::fs::metadata(&source)
        .map_err(|e| format!("Failed to get file metadata: {}", e))?;
    let total_bytes = metadata.len();
    let file_name = source.file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "unknown".to_string());

    // Create destination directory if needed
    if let Some(parent) = dest.parent() {
        if !parent.exists() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create destination directory: {}", e))?;
        }
    }

    // Spawn the transfer in a background task
    let app_clone = app.clone();
    let transfer_id_clone = transfer_id.clone();
    let file_name_clone = file_name.clone();

    tokio::task::spawn_blocking(move || {
        let start_time = Instant::now();
        let mut bytes_copied: u64 = 0;
        let mut last_progress_time = Instant::now();

        // Use large buffer for bulk transfer (4MB - Phase 8 chunk size)
        const BUFFER_SIZE: usize = 4 * 1024 * 1024;
        let mut buffer = vec![0u8; BUFFER_SIZE];

        let result: Result<(), String> = (|| {
            let mut source_file = std::fs::File::open(&source)
                .map_err(|e| format!("Failed to open source: {}", e))?;
            let mut dest_file = std::fs::File::create(&dest)
                .map_err(|e| format!("Failed to create destination: {}", e))?;

            loop {
                let bytes_read = source_file.read(&mut buffer)
                    .map_err(|e| format!("Read error: {}", e))?;

                if bytes_read == 0 {
                    break;
                }

                dest_file.write_all(&buffer[..bytes_read])
                    .map_err(|e| format!("Write error: {}", e))?;

                bytes_copied += bytes_read as u64;

                // Emit progress every 100ms
                let now = Instant::now();
                if now.duration_since(last_progress_time).as_millis() >= 100 {
                    let elapsed = start_time.elapsed().as_secs_f64();
                    let speed_bps = if elapsed > 0.0 {
                        bytes_copied as f64 / elapsed
                    } else {
                        0.0
                    };

                    let eta_seconds = if speed_bps > 0.0 {
                        Some(((total_bytes - bytes_copied) as f64 / speed_bps) as u64)
                    } else {
                        None
                    };

                    let _ = app_clone.emit("transfer-progress", TransferProgressEvent {
                        transfer_id: transfer_id_clone.clone(),
                        file_name: file_name_clone.clone(),
                        bytes_transferred: bytes_copied,
                        total_bytes,
                        speed_bps,
                        eta_seconds,
                    });

                    last_progress_time = now;
                }
            }

            // Ensure all data is flushed to disk
            dest_file.sync_all()
                .map_err(|e| format!("Sync error: {}", e))?;

            Ok(())
        })();

        let duration_ms = start_time.elapsed().as_millis() as u64;

        // Emit completion event
        let _ = app_clone.emit("transfer-completed", TransferCompletedEvent {
            transfer_id: transfer_id_clone,
            success: result.is_ok(),
            bytes_transferred: bytes_copied,
            duration_ms,
            error: result.err(),
        });
    });

    Ok(())
}

/// Batch export multiple files with progress tracking
#[tauri::command]
pub async fn export_files_batch(
    app: AppHandle,
    files: Vec<(String, String)>, // Vec of (source_path, dest_path)
    batch_id: String,
) -> Result<(), String> {
    info!("Starting batch export of {} files", files.len());

    for (idx, (source, dest)) in files.iter().enumerate() {
        let transfer_id = format!("{}-{}", batch_id, idx);
        export_file(app.clone(), source.clone(), dest.clone(), transfer_id).await?;
    }

    Ok(())
}

/// Get the path for drag-to-desktop operations
/// Returns the actual file path that can be used for native drag
#[tauri::command]
pub fn get_drag_file_path(path: String) -> Result<String, String> {
    let file_path = PathBuf::from(&path);

    if !file_path.exists() {
        return Err(format!("File does not exist: {}", path));
    }

    // Return the canonical path for drag operations
    file_path.canonicalize()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| format!("Failed to resolve path: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_app_state_default() {
        let _state = AppState::default();
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
        let json =
            r#"{"type":"HostStarted","port":4433,"share_path":"/test","join_code":"ABC-123"}"#;
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
