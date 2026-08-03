//! In-process session manager for hosts and data-plane mounts/probes.

use std::collections::HashMap;
use std::net::{SocketAddr, UdpSocket};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;
use tokio::task::JoinHandle;
use tracing::{error, info};

use teleport_core::crypto::generate_join_code;
use teleport_core::path::safe_path;
use teleport_core::{DirEntry, FileType, ROOT_INODE};
use teleport_daemon::client::{ClientConfig, WormholeClient};
use teleport_daemon::host::{HostConfig, WormholeHost};

#[derive(Debug, thiserror::Error)]
pub enum SessionError {
    #[error("{0}")]
    Message(String),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Anyhow(#[from] anyhow::Error),
}

impl SessionError {
    pub fn msg(s: impl Into<String>) -> Self {
        Self::Message(s.into())
    }
}

/// Paths that must never be listed via the local control plane.
fn is_denied_list_path(path: &Path) -> bool {
    #[cfg(unix)]
    {
        const DENIED_PREFIXES: &[&str] = &[
            "/etc", "/proc", "/sys", "/dev", "/root", "/var/run", "/run", "/boot",
        ];
        for prefix in DENIED_PREFIXES {
            if path.starts_with(prefix) {
                return true;
            }
        }
    }
    #[cfg(windows)]
    {
        let s = path.to_string_lossy().to_ascii_lowercase();
        if s.starts_with("c:\\windows") || s.starts_with("c:\\program files") {
            return true;
        }
    }
    let _ = path;
    false
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StartHostRequest {
    pub id: Option<String>,
    pub path: PathBuf,
    pub port: Option<u16>,
    pub name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StartMountRequest {
    /// Direct `host:port` or join code (join code requires signal; for local e2e use host:port).
    pub target: String,
    pub mount_point: Option<PathBuf>,
    pub id: Option<String>,
    /// When true, only open a QUIC data-plane session (no FUSE). Used by MCP/CI.
    pub data_plane_only: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HostSessionInfo {
    pub id: String,
    pub share_path: String,
    pub port: u16,
    pub join_code: String,
    pub host_name: String,
    pub share_mode: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MountSessionInfo {
    pub id: String,
    pub target: String,
    pub mount_point: String,
    pub peer_name: Option<String>,
    pub data_plane_only: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionStatus {
    pub hosts: Vec<HostSessionInfo>,
    pub mounts: Vec<MountSessionInfo>,
    pub protocol_version: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProbeResult {
    pub peer_name: Option<String>,
    pub entries: Vec<DirListingEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DirListingEntry {
    pub name: String,
    pub is_dir: bool,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheStats {
    pub path: String,
    pub exists: bool,
    pub file_count: u64,
    pub total_bytes: u64,
}

struct HostHandle {
    abort: tokio::task::AbortHandle,
    info: HostSessionInfo,
}

struct MountHandle {
    /// Optional background FUSE/client task
    abort: Option<tokio::task::AbortHandle>,
    info: MountSessionInfo,
}

/// Process-local session table shared by CLI / MCP.
pub struct SessionManager {
    hosts: Mutex<HashMap<String, HostHandle>>,
    mounts: Mutex<HashMap<String, MountHandle>>,
    next_port: Mutex<u16>,
}

impl Default for SessionManager {
    fn default() -> Self {
        Self::new()
    }
}

impl SessionManager {
    pub fn new() -> Self {
        Self {
            hosts: Mutex::new(HashMap::new()),
            mounts: Mutex::new(HashMap::new()),
            next_port: Mutex::new(4433),
        }
    }

    pub fn new_arc() -> Arc<Self> {
        Arc::new(Self::new())
    }

    fn free_port() -> u16 {
        let sock = UdpSocket::bind("127.0.0.1:0").expect("bind ephemeral");
        sock.local_addr().expect("addr").port()
    }

    pub async fn start_host(&self, req: StartHostRequest) -> Result<HostSessionInfo, SessionError> {
        let share_path = req
            .path
            .canonicalize()
            .map_err(|e| SessionError::msg(format!("Invalid path: {e}")))?;
        if !share_path.is_dir() {
            return Err(SessionError::msg(format!(
                "Path is not a directory: {}",
                req.path.display()
            )));
        }

        let id = req
            .id
            .unwrap_or_else(|| format!("host-{}", chrono::Utc::now().timestamp_millis()));

        {
            let hosts = self.hosts.lock().await;
            if hosts.contains_key(&id) {
                return Err(SessionError::msg(format!("Share {id} is already active")));
            }
        }

        let port = if let Some(p) = req.port {
            p
        } else {
            // Prefer ephemeral in tests / crowded environments
            let p = Self::free_port();
            let mut next = self.next_port.lock().await;
            *next = p.saturating_add(1);
            p
        };

        let join_code = generate_join_code();
        let host_name = req.name.unwrap_or_else(|| {
            hostname::get()
                .map(|h| h.to_string_lossy().into_owned())
                .unwrap_or_else(|_| "wormhole-host".into())
        });

        let bind_addr: SocketAddr = format!("0.0.0.0:{port}")
            .parse()
            .map_err(|e| SessionError::msg(format!("Invalid port: {e}")))?;

        let config = HostConfig {
            bind_addr,
            shared_path: share_path.clone(),
            max_connections: 10,
            host_name: host_name.clone(),
            join_code: Some(join_code.clone()),
        };

        let id_clone = id.clone();
        let task: JoinHandle<()> = tokio::spawn(async move {
            let host = WormholeHost::new(config);
            info!(id = %id_clone, port, "host serving");
            if let Err(e) = host.serve().await {
                error!(id = %id_clone, error = ?e, "host stopped with error");
            }
        });

        let info = HostSessionInfo {
            id: id.clone(),
            share_path: share_path.to_string_lossy().into_owned(),
            port,
            join_code,
            host_name,
            share_mode: "mount".into(),
        };

        self.hosts.lock().await.insert(
            id,
            HostHandle {
                abort: task.abort_handle(),
                info: info.clone(),
            },
        );

        // Brief settle so accept loop is listening
        tokio::time::sleep(Duration::from_millis(80)).await;
        Ok(info)
    }

    pub async fn stop_host(&self, id: &str) -> Result<(), SessionError> {
        let mut hosts = self.hosts.lock().await;
        let Some(h) = hosts.remove(id) else {
            return Err(SessionError::msg(format!("Host {id} not found")));
        };
        h.abort.abort();
        Ok(())
    }

    pub async fn list_hosts(&self) -> Vec<HostSessionInfo> {
        self.hosts
            .lock()
            .await
            .values()
            .map(|h| h.info.clone())
            .collect()
    }

    /// Connect over QUIC and list the remote root (no FUSE). Mirrors desktop “connect” data plane.
    pub async fn probe_remote(&self, target: &str) -> Result<ProbeResult, SessionError> {
        let addr = parse_target_addr(target)?;
        // Prefer the join code of a local host bound on this port (same-machine probe).
        let join_code = {
            let hosts = self.hosts.lock().await;
            hosts
                .values()
                .find(|h| h.info.port == addr.port())
                .map(|h| h.info.join_code.clone())
        };
        let mut client = WormholeClient::new(ClientConfig {
            server_addr: addr,
            mount_point: PathBuf::from("/tmp/wormhole-probe"),
            request_timeout: Duration::from_secs(8),
            join_code,
            cert_pin: None,
        });

        let mut last_err = None;
        for _ in 0..40 {
            match client.connect().await {
                Ok(()) => {
                    last_err = None;
                    break;
                }
                Err(e) => {
                    last_err = Some(format!("{e:?}"));
                    tokio::time::sleep(Duration::from_millis(50)).await;
                }
            }
        }
        if let Some(e) = last_err {
            return Err(SessionError::msg(format!("connect failed: {e}")));
        }

        let peer_name = client.host_name().map(str::to_string);
        let entries = client
            .readdir(ROOT_INODE, 0)
            .await
            .map_err(|e| SessionError::msg(format!("readdir: {e:?}")))?;

        Ok(ProbeResult {
            peer_name,
            entries: entries.into_iter().map(dir_entry_to_listing).collect(),
        })
    }

    /// Register a mount session. With `data_plane_only`, validates connectivity via probe.
    pub async fn start_mount(
        &self,
        req: StartMountRequest,
    ) -> Result<MountSessionInfo, SessionError> {
        let id = req
            .id
            .unwrap_or_else(|| format!("mount-{}", chrono::Utc::now().timestamp_millis()));

        {
            let mounts = self.mounts.lock().await;
            if mounts.contains_key(&id) {
                return Err(SessionError::msg(format!("Mount {id} already active")));
            }
        }

        let mount_point = req.mount_point.unwrap_or_else(|| {
            default_mount_path(&req.target).unwrap_or_else(|_| PathBuf::from("/tmp/wormhole"))
        });

        if req.data_plane_only || std::env::var_os("WORMHOLE_NO_FUSE").is_some() {
            let probe = self.probe_remote(&req.target).await?;
            let info = MountSessionInfo {
                id: id.clone(),
                target: req.target,
                mount_point: mount_point.to_string_lossy().into_owned(),
                peer_name: probe.peer_name,
                data_plane_only: true,
            };
            self.mounts.lock().await.insert(
                id,
                MountHandle {
                    abort: None,
                    info: info.clone(),
                },
            );
            return Ok(info);
        }

        // Full FUSE mount via wormhole-mount helper (same as CLI)
        std::fs::create_dir_all(&mount_point)?;
        let addr = parse_target_addr(&req.target)?;
        let join_code = {
            let hosts = self.hosts.lock().await;
            hosts
                .values()
                .find(|h| h.info.port == addr.port())
                .map(|h| h.info.join_code.clone())
        };
        let binary = std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|d| d.join("wormhole-mount")))
            .filter(|p| p.exists())
            .unwrap_or_else(|| PathBuf::from("wormhole-mount"));

        let mut cmd = tokio::process::Command::new(&binary);
        cmd.arg(format!("{}", addr)).arg(&mount_point);
        if let Some(code) = join_code.as_deref() {
            cmd.arg("--join-code").arg(code);
        }
        let mut child = cmd.spawn().map_err(|e| {
            SessionError::msg(format!(
                "failed to spawn {}: {e}. Use data_plane_only or WORMHOLE_NO_FUSE=1",
                binary.display()
            ))
        })?;

        let id_clone = id.clone();
        let task = tokio::spawn(async move {
            match child.wait().await {
                Ok(status) => info!(id = %id_clone, ?status, "mount helper exited"),
                Err(e) => error!(id = %id_clone, error = %e, "mount helper wait failed"),
            }
        });

        let info = MountSessionInfo {
            id: id.clone(),
            target: req.target,
            mount_point: mount_point.to_string_lossy().into_owned(),
            peer_name: None,
            data_plane_only: false,
        };
        self.mounts.lock().await.insert(
            id,
            MountHandle {
                abort: Some(task.abort_handle()),
                info: info.clone(),
            },
        );
        Ok(info)
    }

    pub async fn stop_mount(&self, id: &str) -> Result<(), SessionError> {
        let mut mounts = self.mounts.lock().await;
        let Some(m) = mounts.remove(id) else {
            return Err(SessionError::msg(format!("Mount {id} not found")));
        };
        if let Some(abort) = m.abort {
            abort.abort();
        }
        if !m.info.data_plane_only {
            let _ = unmount_path(Path::new(&m.info.mount_point));
        }
        Ok(())
    }

    pub async fn list_mounts(&self) -> Vec<MountSessionInfo> {
        self.mounts
            .lock()
            .await
            .values()
            .map(|m| m.info.clone())
            .collect()
    }

    pub async fn status(&self) -> SessionStatus {
        SessionStatus {
            hosts: self.list_hosts().await,
            mounts: self.list_mounts().await,
            protocol_version: teleport_core::PROTOCOL_VERSION,
        }
    }

    pub fn generate_code() -> String {
        generate_join_code()
    }

    pub fn local_ips() -> Result<Vec<String>, SessionError> {
        let mut ips = vec!["127.0.0.1".into()];
        if let Ok(sock) = UdpSocket::bind("0.0.0.0:0") {
            if sock.connect("8.8.8.8:80").is_ok() {
                if let Ok(addr) = sock.local_addr() {
                    let ip = addr.ip().to_string();
                    if !ips.contains(&ip) {
                        ips.push(ip);
                    }
                }
            }
        }
        Ok(ips)
    }

    pub fn list_directory(path: &Path) -> Result<Vec<DirListingEntry>, SessionError> {
        let path = path
            .canonicalize()
            .map_err(|e| SessionError::msg(format!("Invalid path: {e}")))?;
        if !path.is_dir() {
            return Err(SessionError::msg("Not a directory"));
        }
        // SECURITY: deny listing sensitive system trees via the control plane.
        if is_denied_list_path(&path) {
            return Err(SessionError::msg(
                "listing this path is not allowed from the control plane",
            ));
        }
        let mut out = Vec::new();
        for entry in std::fs::read_dir(&path)? {
            let entry = entry?;
            // Prefer file_type so we do not follow symlinks for is_dir classification.
            let ft = entry.file_type()?;
            let size = if ft.is_symlink() {
                0
            } else {
                entry.metadata().map(|m| m.len()).unwrap_or(0)
            };
            out.push(DirListingEntry {
                name: entry.file_name().to_string_lossy().into_owned(),
                is_dir: ft.is_dir(),
                size,
            });
        }
        out.sort_by(|a, b| a.name.cmp(&b.name));
        Ok(out)
    }

    /// Safe join under a root (rejects traversal).
    pub fn safe_list_under(
        root: &Path,
        relative: &str,
    ) -> Result<Vec<DirListingEntry>, SessionError> {
        let full = safe_path(root, relative).map_err(|e| SessionError::msg(e.to_string()))?;
        Self::list_directory(&full)
    }

    pub fn default_mount_path(label: &str) -> Result<PathBuf, SessionError> {
        default_mount_path(label)
    }

    pub fn cache_dir() -> Result<PathBuf, SessionError> {
        let dirs = directories::ProjectDirs::from("", "", "wormhole")
            .ok_or_else(|| SessionError::msg("could not resolve cache directory"))?;
        Ok(dirs.cache_dir().join("chunks"))
    }

    pub fn cache_stats() -> Result<CacheStats, SessionError> {
        let path = Self::cache_dir()?;
        let exists = path.exists();
        let mut file_count = 0u64;
        let mut total_bytes = 0u64;
        if exists {
            walk_count(&path, &mut file_count, &mut total_bytes)?;
        }
        Ok(CacheStats {
            path: path.to_string_lossy().into_owned(),
            exists,
            file_count,
            total_bytes,
        })
    }

    pub fn cache_clear() -> Result<(), SessionError> {
        let path = Self::cache_dir()?;
        if path.exists() {
            std::fs::remove_dir_all(&path)?;
        }
        std::fs::create_dir_all(&path)?;
        Ok(())
    }

    pub async fn stop_all(&self) {
        let host_ids: Vec<String> = self.hosts.lock().await.keys().cloned().collect();
        for id in host_ids {
            let _ = self.stop_host(&id).await;
        }
        let mount_ids: Vec<String> = self.mounts.lock().await.keys().cloned().collect();
        for id in mount_ids {
            let _ = self.stop_mount(&id).await;
        }
    }
}

fn dir_entry_to_listing(e: DirEntry) -> DirListingEntry {
    DirListingEntry {
        name: e.name,
        is_dir: matches!(e.file_type, FileType::Directory),
        size: 0,
    }
}

fn parse_target_addr(target: &str) -> Result<SocketAddr, SessionError> {
    let t = target.trim();
    if let Ok(addr) = t.parse::<SocketAddr>() {
        return Ok(addr);
    }
    if let Ok(addr) = format!("{t}:4433").parse::<SocketAddr>() {
        return Ok(addr);
    }
    // Join codes need signal — for service API require host:port or IP
    Err(SessionError::msg(format!(
        "Expected host:port (got `{t}`). Join-code mounts use the signal path via CLI `wormhole mount <code>`."
    )))
}

fn default_mount_path(label: &str) -> Result<PathBuf, SessionError> {
    let home = directories::UserDirs::new()
        .map(|u| u.home_dir().to_path_buf())
        .ok_or_else(|| SessionError::msg("could not resolve home directory"))?;
    let safe: String = label
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '_' })
        .collect();
    Ok(home.join("Wormhole").join(if safe.is_empty() {
        "mount".into()
    } else {
        safe
    }))
}

fn unmount_path(path: &Path) -> std::io::Result<()> {
    #[cfg(target_os = "linux")]
    {
        let _ = std::process::Command::new("fusermount3")
            .args(["-u", &path.to_string_lossy()])
            .status();
        let _ = std::process::Command::new("fusermount")
            .args(["-u", &path.to_string_lossy()])
            .status();
    }
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("umount").arg(path).status();
    }
    let _ = path;
    Ok(())
}

fn walk_count(path: &Path, files: &mut u64, bytes: &mut u64) -> std::io::Result<()> {
    if path.is_file() {
        *files += 1;
        *bytes += std::fs::metadata(path)?.len();
        return Ok(());
    }
    for entry in std::fs::read_dir(path)? {
        let entry = entry?;
        let p = entry.path();
        if p.is_dir() {
            walk_count(&p, files, bytes)?;
        } else {
            *files += 1;
            *bytes += entry.metadata()?.len();
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::tempdir;

    #[tokio::test]
    async fn host_probe_list_and_stop() {
        let dir = tempdir().unwrap();
        std::fs::write(dir.path().join("hello.txt"), b"world").unwrap();
        std::fs::create_dir(dir.path().join("sub")).unwrap();
        let mut f = std::fs::File::create(dir.path().join("sub/nested.bin")).unwrap();
        f.write_all(&[1, 2, 3, 4]).unwrap();

        let mgr = SessionManager::new();
        let host = mgr
            .start_host(StartHostRequest {
                id: Some("t1".into()),
                path: dir.path().to_path_buf(),
                port: None,
                name: Some("test-host".into()),
            })
            .await
            .expect("start host");

        assert_eq!(host.id, "t1");
        assert!(!host.join_code.is_empty());

        let target = format!("127.0.0.1:{}", host.port);
        let probe = mgr.probe_remote(&target).await.expect("probe");
        let names: Vec<_> = probe.entries.iter().map(|e| e.name.as_str()).collect();
        assert!(names.contains(&"hello.txt"), "{names:?}");
        assert!(names.contains(&"sub"), "{names:?}");

        let mount = mgr
            .start_mount(StartMountRequest {
                target: target.clone(),
                mount_point: None,
                id: Some("m1".into()),
                data_plane_only: true,
            })
            .await
            .expect("mount");
        assert!(mount.data_plane_only);

        let status = mgr.status().await;
        assert_eq!(status.hosts.len(), 1);
        assert_eq!(status.mounts.len(), 1);

        mgr.stop_mount("m1").await.unwrap();
        mgr.stop_host("t1").await.unwrap();
        let status = mgr.status().await;
        assert!(status.hosts.is_empty());
        assert!(status.mounts.is_empty());
    }

    #[test]
    fn generate_code_and_safe_list() {
        let code = SessionManager::generate_code();
        assert!(code.len() >= 6);
        let dir = tempdir().unwrap();
        std::fs::write(dir.path().join("a.txt"), b"x").unwrap();
        let listing = SessionManager::list_directory(dir.path()).unwrap();
        assert_eq!(listing.len(), 1);
        assert!(SessionManager::safe_list_under(dir.path(), "../etc").is_err());
    }
}
