# Phase 5 Architecture - Product Wrapper (GUI, Tray, Installer)

## Workspace Structure

```
wormhole/
├── Cargo.toml                    # Workspace root
├── crates/
│   ├── teleport-core/            # Shared types, protocol
│   └── teleport-daemon/
│       ├── src/
│       │   ├── lib.rs            # Library exports (NEW)
│       │   └── bin/
│       │       └── teleport_cli.rs  # CLI binary (moved)
│       └── Cargo.toml
└── apps/
    └── desktop/              # Tauri app (NEW)
        ├── src/                  # React frontend
        ├── src-tauri/            # Rust backend
        └── package.json
```

## Daemon Library Refactor

### teleport-daemon/src/lib.rs

```rust
//! Library interface for embedding teleport-daemon in other applications (e.g., Tauri)

pub mod cache;
pub mod client;
pub mod client_actor;
pub mod fs;
pub mod host;
pub mod vfs;

use std::path::PathBuf;
use std::net::SocketAddr;
use tokio::sync::broadcast;

/// Events emitted by services for UI updates
#[derive(Clone, Debug)]
pub enum ServiceEvent {
    HostStarted { port: u16, share_path: PathBuf },
    ClientConnected { peer_addr: SocketAddr },
    MountReady { mountpoint: PathBuf },
    SyncProgress { file: String, percent: u8 },
    Error { message: String },
}

/// Start hosting a directory
///
/// Returns a channel receiver for status events and a shutdown handle
pub async fn start_host_service(
    share_path: PathBuf,
    port: u16,
) -> Result<(broadcast::Receiver<ServiceEvent>, ShutdownHandle)> {
    // Validate path exists and is directory
    if !share_path.is_dir() {
        anyhow::bail!("Share path must be a directory");
    }

    let (event_tx, event_rx) = broadcast::channel(100);
    let shutdown = ShutdownHandle::new();

    let task_handle = tokio::spawn({
        let shutdown = shutdown.clone();
        let event_tx = event_tx.clone();
        async move {
            let addr = SocketAddr::from(([0, 0, 0, 0], port));
            event_tx.send(ServiceEvent::HostStarted {
                port,
                share_path: share_path.clone(),
            }).ok();

            host::run_host(addr, share_path, shutdown.token()).await
        }
    });

    Ok((event_rx, shutdown))
}

/// Mount a remote share
pub async fn start_mount_service(
    host_addr: SocketAddr,
    mountpoint: PathBuf,
) -> Result<(broadcast::Receiver<ServiceEvent>, ShutdownHandle)> {
    // Validate mountpoint exists and is empty directory
    if !mountpoint.is_dir() {
        std::fs::create_dir_all(&mountpoint)?;
    }

    let (event_tx, event_rx) = broadcast::channel(100);
    let shutdown = ShutdownHandle::new();

    let task_handle = tokio::spawn({
        let shutdown = shutdown.clone();
        let event_tx = event_tx.clone();
        async move {
            // Fetch metadata
            let metadata = client::fetch_metadata(host_addr).await?;

            // Build VFS
            let vfs = vfs::VirtualFilesystem::from_dir_entry(metadata);

            event_tx.send(ServiceEvent::MountReady {
                mountpoint: mountpoint.clone(),
            }).ok();

            // Mount (blocks until unmount)
            fs::mount(vfs, mountpoint, shutdown.token()).await
        }
    });

    Ok((event_rx, shutdown))
}

/// Handle for graceful shutdown
#[derive(Clone)]
pub struct ShutdownHandle {
    token: tokio_util::sync::CancellationToken,
}

impl ShutdownHandle {
    pub fn new() -> Self {
        Self {
            token: tokio_util::sync::CancellationToken::new(),
        }
    }

    pub fn shutdown(&self) {
        self.token.cancel();
    }

    pub fn token(&self) -> tokio_util::sync::CancellationToken {
        self.token.clone()
    }
}
```

## Tauri Backend

### apps/desktop/src-tauri/Cargo.toml

```toml
[package]
name = "desktop"
version = "0.1.0"
edition = "2021"

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = ["tray-icon"] }
tauri-plugin-shell = "2"
tokio = { version = "1", features = ["full"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"

# Link to daemon library
teleport-daemon = { path = "../../../crates/teleport-daemon" }
```

### apps/desktop/src-tauri/src/main.rs

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;
use std::sync::Arc;
use tauri::{Manager, State};
use tokio::sync::RwLock;
use teleport_daemon::{ServiceEvent, ShutdownHandle};

struct AppState {
    host_handle: RwLock<Option<ShutdownHandle>>,
    mount_handle: RwLock<Option<ShutdownHandle>>,
}

#[tauri::command]
async fn start_hosting(
    path: String,
    port: u16,
    state: State<'_, Arc<AppState>>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let share_path = PathBuf::from(&path);

    let (mut events, handle) = teleport_daemon::start_host_service(share_path, port)
        .await
        .map_err(|e| e.to_string())?;

    *state.host_handle.write().await = Some(handle);

    // Forward events to frontend
    tauri::async_runtime::spawn(async move {
        while let Ok(event) = events.recv().await {
            app.emit("host-event", &event).ok();
        }
    });

    Ok(())
}

#[tauri::command]
async fn connect_to_peer(
    host_ip: String,
    mount_path: String,
    state: State<'_, Arc<AppState>>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let addr: std::net::SocketAddr = host_ip.parse()
        .map_err(|e| format!("Invalid address: {}", e))?;
    let mountpoint = PathBuf::from(&mount_path);

    let (mut events, handle) = teleport_daemon::start_mount_service(addr, mountpoint)
        .await
        .map_err(|e| e.to_string())?;

    *state.mount_handle.write().await = Some(handle);

    // Forward events to frontend
    tauri::async_runtime::spawn(async move {
        while let Ok(event) = events.recv().await {
            app.emit("mount-event", &event).ok();
        }
    });

    Ok(())
}

#[tauri::command]
async fn stop_hosting(state: State<'_, Arc<AppState>>) -> Result<(), String> {
    if let Some(handle) = state.host_handle.write().await.take() {
        handle.shutdown();
    }
    Ok(())
}

#[tauri::command]
async fn disconnect(state: State<'_, Arc<AppState>>) -> Result<(), String> {
    if let Some(handle) = state.mount_handle.write().await.take() {
        handle.shutdown();
    }
    Ok(())
}

fn main() {
    let state = Arc::new(AppState {
        host_handle: RwLock::new(None),
        mount_handle: RwLock::new(None),
    });

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            start_hosting,
            connect_to_peer,
            stop_hosting,
            disconnect,
        ])
        .setup(|app| {
            // System tray setup
            use tauri::menu::{MenuBuilder, MenuItemBuilder};
            use tauri::tray::TrayIconBuilder;

            let show = MenuItemBuilder::with_id("show", "Show").build(app)?;
            let quit = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
            let menu = MenuBuilder::new(app).items(&[&show, &quit]).build()?;

            TrayIconBuilder::new()
                .menu(&menu)
                .on_menu_event(|app, event| {
                    match event.id().as_ref() {
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                window.show().ok();
                                window.set_focus().ok();
                            }
                        }
                        "quit" => std::process::exit(0),
                        _ => {}
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            // Hide instead of close to keep services running
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                window.hide().ok();
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

## Frontend (React/TypeScript)

### apps/desktop/src/App.tsx

```tsx
import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';

type Tab = 'host' | 'connect';

function App() {
  const [tab, setTab] = useState<Tab>('host');

  // Host state
  const [sharePath, setSharePath] = useState('');
  const [port, setPort] = useState(5000);
  const [isHosting, setIsHosting] = useState(false);

  // Connect state
  const [hostIp, setHostIp] = useState('');
  const [mountPath, setMountPath] = useState('');
  const [isConnected, setIsConnected] = useState(false);

  // Status
  const [status, setStatus] = useState('');

  useEffect(() => {
    const unlistenHost = listen('host-event', (event) => {
      setStatus(JSON.stringify(event.payload));
    });

    const unlistenMount = listen('mount-event', (event) => {
      setStatus(JSON.stringify(event.payload));
    });

    return () => {
      unlistenHost.then(fn => fn());
      unlistenMount.then(fn => fn());
    };
  }, []);

  const selectFolder = async (setter: (path: string) => void) => {
    const selected = await open({ directory: true });
    if (selected) setter(selected as string);
  };

  const handleStartHosting = async () => {
    try {
      await invoke('start_hosting', { path: sharePath, port });
      setIsHosting(true);
      setStatus('Hosting started');
    } catch (e) {
      setStatus(`Error: ${e}`);
    }
  };

  const handleConnect = async () => {
    try {
      await invoke('connect_to_peer', { hostIp, mountPath });
      setIsConnected(true);
      setStatus('Connected and mounted');
    } catch (e) {
      setStatus(`Error: ${e}`);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      {/* Tab Navigation */}
      <div className="flex gap-4 mb-6">
        <button
          className={`px-4 py-2 rounded ${tab === 'host' ? 'bg-blue-600' : 'bg-gray-700'}`}
          onClick={() => setTab('host')}
        >
          Host
        </button>
        <button
          className={`px-4 py-2 rounded ${tab === 'connect' ? 'bg-blue-600' : 'bg-gray-700'}`}
          onClick={() => setTab('connect')}
        >
          Connect
        </button>
      </div>

      {/* Host Tab */}
      {tab === 'host' && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm mb-1">Share Folder</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={sharePath}
                onChange={(e) => setSharePath(e.target.value)}
                className="flex-1 bg-gray-800 rounded px-3 py-2"
                placeholder="/path/to/share"
              />
              <button
                onClick={() => selectFolder(setSharePath)}
                className="bg-gray-700 px-4 py-2 rounded"
              >
                Browse
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm mb-1">Port</label>
            <input
              type="number"
              value={port}
              onChange={(e) => setPort(parseInt(e.target.value))}
              className="w-full bg-gray-800 rounded px-3 py-2"
            />
          </div>

          <button
            onClick={handleStartHosting}
            disabled={isHosting || !sharePath}
            className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-600 px-4 py-2 rounded"
          >
            {isHosting ? 'Hosting...' : 'Start Hosting'}
          </button>
        </div>
      )}

      {/* Connect Tab */}
      {tab === 'connect' && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm mb-1">Host Address</label>
            <input
              type="text"
              value={hostIp}
              onChange={(e) => setHostIp(e.target.value)}
              className="w-full bg-gray-800 rounded px-3 py-2"
              placeholder="192.168.1.100:5000"
            />
          </div>

          <div>
            <label className="block text-sm mb-1">Mount Point</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={mountPath}
                onChange={(e) => setMountPath(e.target.value)}
                className="flex-1 bg-gray-800 rounded px-3 py-2"
                placeholder="/mnt/wormhole"
              />
              <button
                onClick={() => selectFolder(setMountPath)}
                className="bg-gray-700 px-4 py-2 rounded"
              >
                Browse
              </button>
            </div>
          </div>

          <button
            onClick={handleConnect}
            disabled={isConnected || !hostIp || !mountPath}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 px-4 py-2 rounded"
          >
            {isConnected ? 'Connected' : 'Connect'}
          </button>
        </div>
      )}

      {/* Status Bar */}
      <div className="mt-6 p-3 bg-gray-800 rounded text-sm">
        Status: {status || 'Ready'}
      </div>
    </div>
  );
}

export default App;
```

## Packaging Configuration

### apps/desktop/src-tauri/tauri.conf.json

```json
{
  "$schema": "../node_modules/@tauri-apps/cli/schema.json",
  "productName": "Wormhole",
  "version": "0.1.0",
  "identifier": "com.wormhole.app",
  "build": {
    "beforeBuildCommand": "npm run build",
    "beforeDevCommand": "npm run dev",
    "devUrl": "http://localhost:5173",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "title": "Wormhole",
        "width": 400,
        "height": 500,
        "resizable": true,
        "center": true
      }
    ],
    "trayIcon": {
      "iconPath": "icons/icon.png",
      "iconAsTemplate": true
    }
  },
  "bundle": {
    "active": true,
    "targets": ["dmg", "msi", "deb", "appimage"],
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "macOS": {
      "minimumSystemVersion": "10.13"
    }
  }
}
```

## Build Commands

```bash
# Development
cd apps/desktop
npm install
npm run tauri dev

# Production build
npm run tauri build

# Outputs:
# - macOS: target/release/bundle/dmg/Wormhole_0.1.0_x64.dmg
# - Windows: target/release/bundle/msi/Wormhole_0.1.0_x64.msi
# - Linux: target/release/bundle/deb/wormhole_0.1.0_amd64.deb
```
