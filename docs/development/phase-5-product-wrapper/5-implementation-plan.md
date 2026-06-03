1) Scaffold Tauri app: npm create tauri-app@latest -> apps/desktop (React/TS/Vite/Tailwind), id com.wormhole.app.
2) Update root Cargo workspace members to include apps/desktop/src-tauri.
3) Refactor teleport-daemon: add lib.rs exporting start_host_service and start_mount_service; keep bin teleport_cli via [[bin]].
4) Expose modules: fs, net (host/client), cache, client_actor, vfs; mount logic uses HybridCache and actor as in prior phases.
5) apps/desktop/src-tauri/Cargo.toml: depend on teleport_daemon (path), tokio, tauri.
6) Tauri commands in src-tauri/main.rs: start_hosting(path), connect_to_peer(ip, mount_path); spawn tasks with tauri::async_runtime.
7) Frontend App.tsx: host/connect tabs, folder input (or dialog), IP/mount inputs, status bar; styled with Tailwind/lucide icons.
8) Tray (optional): add TrayIconBuilder/menu to keep app alive when window closes.
9) Build: npm install; npm run tauri build to produce dmg/deb/msi.
