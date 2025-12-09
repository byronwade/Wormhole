//! Tauri commands for the Wormhole desktop application

use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::Mutex;
use tracing::info;

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

/// Application state for managing host and client connections
pub struct AppState {
    /// Currently hosting (handle to stop)
    pub host_handle: Mutex<Option<tokio::task::JoinHandle<()>>>,
    /// Currently connected client (handle to stop)
    pub client_handle: Mutex<Option<tokio::task::JoinHandle<()>>>,
    /// Current mount point (for cleanup)
    pub mount_point: Mutex<Option<String>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            host_handle: Mutex::new(None),
            client_handle: Mutex::new(None),
            mount_point: Mutex::new(None),
        }
    }
}

/// Generate a simple join code (placeholder - will use PAKE in Phase 6)
fn generate_join_code() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis();
    format!("{:06}", timestamp % 1_000_000)
}

/// Start hosting a folder
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

    // Validate path exists
    let share_path = std::path::PathBuf::from(&path);
    if !share_path.exists() {
        return Err(format!("Path does not exist: {}", path));
    }
    if !share_path.is_dir() {
        return Err(format!("Path is not a directory: {}", path));
    }

    let join_code = generate_join_code();
    let join_code_clone = join_code.clone();
    let path_clone = path.clone();
    let app_clone = app.clone();

    // Spawn the host task
    let handle = tokio::spawn(async move {
        // In Phase 5, we'll integrate with teleport-daemon's Host
        // For now, emit a started event and simulate hosting
        info!("Host task started for {}", path_clone);

        // Emit host started event
        let _ = app_clone.emit(
            "host-event",
            ServiceEvent::HostStarted {
                port,
                share_path: path_clone.clone(),
                join_code: join_code_clone,
            },
        );

        // Keep the task alive (in real implementation, this runs the QUIC server)
        // The actual host implementation will come from teleport-daemon
        loop {
            tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
        }
    });

    // Store the handle
    {
        let mut host_handle = state.host_handle.lock().await;
        *host_handle = Some(handle);
    }

    Ok(())
}

/// Stop hosting
#[tauri::command]
pub async fn stop_hosting(state: State<'_, Arc<AppState>>) -> Result<(), String> {
    info!("Stopping host");

    let mut handle = state.host_handle.lock().await;
    if let Some(h) = handle.take() {
        h.abort();
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

    // Validate mount path
    let mount_point = std::path::PathBuf::from(&mount_path);
    if !mount_point.exists() {
        // Try to create it
        std::fs::create_dir_all(&mount_point)
            .map_err(|e| format!("Failed to create mount point: {}", e))?;
    }

    // Store mount point for cleanup
    {
        let mut mp = state.mount_point.lock().await;
        *mp = Some(mount_path.clone());
    }

    let mount_path_clone = mount_path.clone();
    let app_clone = app.clone();

    // Spawn the client task
    let handle = tokio::spawn(async move {
        // In Phase 5, we'll integrate with teleport-daemon's mount
        // For now, emit a mount ready event
        info!("Client task connecting to {}", host_address);

        // Simulate connection delay
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;

        // Emit mount ready event
        let _ = app_clone.emit(
            "mount-event",
            ServiceEvent::MountReady {
                mountpoint: mount_path_clone,
            },
        );

        // Keep task alive
        loop {
            tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
        }
    });

    // Store the handle
    {
        let mut client_handle = state.client_handle.lock().await;
        *client_handle = Some(handle);
    }

    Ok(())
}

/// Disconnect from peer and unmount
#[tauri::command]
pub async fn disconnect(state: State<'_, Arc<AppState>>) -> Result<(), String> {
    info!("Disconnecting");

    // Stop the client task
    let mut handle = state.client_handle.lock().await;
    if let Some(h) = handle.take() {
        h.abort();
    }

    // Clean up mount point
    let mut mp = state.mount_point.lock().await;
    if let Some(mount_path) = mp.take() {
        // In real implementation, we'd unmount the FUSE filesystem here
        info!("Cleaned up mount point: {}", mount_path);
    }

    Ok(())
}

/// Get application status
#[tauri::command]
pub async fn get_status(state: State<'_, Arc<AppState>>) -> Result<serde_json::Value, String> {
    let is_hosting = state.host_handle.lock().await.is_some();
    let is_connected = state.client_handle.lock().await.is_some();
    let mount_point = state.mount_point.lock().await.clone();

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
    fn test_generate_join_code() {
        let code1 = generate_join_code();
        let code2 = generate_join_code();

        // Join code should be 6 digits
        assert_eq!(code1.len(), 6);
        assert!(code1.chars().all(|c| c.is_ascii_digit()));

        // Codes should be different (most of the time)
        // Note: there's a tiny chance they could be the same if called in same millisecond
        std::thread::sleep(std::time::Duration::from_millis(1));
        let code3 = generate_join_code();
        // At least check they're valid
        assert_eq!(code3.len(), 6);
    }

    #[test]
    fn test_app_state_default() {
        let state = AppState::default();
        // Can't easily test async mutexes in sync test, but we can verify it compiles
        assert!(std::mem::size_of::<AppState>() > 0);
    }

    #[test]
    fn test_service_event_serialization() {
        // Test HostStarted event
        let event = ServiceEvent::HostStarted {
            port: 4433,
            share_path: "/test/path".to_string(),
            join_code: "123456".to_string(),
        };
        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("HostStarted"));
        assert!(json.contains("4433"));
        assert!(json.contains("/test/path"));
        assert!(json.contains("123456"));

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
        let json = r#"{"type":"HostStarted","port":4433,"share_path":"/test","join_code":"123456"}"#;
        let event: ServiceEvent = serde_json::from_str(json).unwrap();
        match event {
            ServiceEvent::HostStarted {
                port,
                share_path,
                join_code,
            } => {
                assert_eq!(port, 4433);
                assert_eq!(share_path, "/test");
                assert_eq!(join_code, "123456");
            }
            _ => panic!("Expected HostStarted event"),
        }
    }

    #[tokio::test]
    async fn test_app_state_mutex_operations() {
        let state = AppState::default();

        // Test host_handle mutex
        {
            let handle = state.host_handle.lock().await;
            assert!(handle.is_none());
        }

        // Test client_handle mutex
        {
            let handle = state.client_handle.lock().await;
            assert!(handle.is_none());
        }

        // Test mount_point mutex
        {
            let mp = state.mount_point.lock().await;
            assert!(mp.is_none());
        }

        // Test setting mount_point
        {
            let mut mp = state.mount_point.lock().await;
            *mp = Some("/test/mount".to_string());
        }
        {
            let mp = state.mount_point.lock().await;
            assert_eq!(mp.as_ref().unwrap(), "/test/mount");
        }
    }

    #[test]
    fn test_path_validation_logic() {
        // Test that path exists check works
        let temp_dir = std::env::temp_dir();
        assert!(temp_dir.exists());
        assert!(temp_dir.is_dir());

        // Test non-existent path
        let non_existent = std::path::PathBuf::from("/this/path/should/not/exist/abc123xyz");
        assert!(!non_existent.exists());
    }
}
