//! Local control-plane protocol for CLI ↔ daemon sessions.
//!
//! Line-delimited JSON over a Unix domain socket (or TCP loopback on Windows).

use std::path::PathBuf;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tracing::{error, info};

use crate::doctor::DoctorReport;
use crate::session::{SessionManager, StartHostRequest, StartMountRequest};
use crate::FEATURE_SURFACE;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "op", rename_all = "snake_case")]
pub enum ControlRequest {
    HostStart(StartHostRequest),
    HostStop { id: String },
    HostList,
    MountStart(StartMountRequest),
    MountStop { id: String },
    MountList,
    Status,
    ProbeRemote { target: String },
    GenerateCode,
    LocalIps,
    ListDirectory { path: String },
    Doctor,
    CacheStats,
    CacheClear,
    DefaultMountPath { label: String },
    FeatureSurface,
    /// Forward a playhead scrub hint to the local mount via playhead IPC.
    PlayheadHint {
        inode: u64,
        offset: u64,
        ahead: Option<u64>,
        behind: Option<u64>,
    },
    Ping,
    Shutdown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ControlResponse {
    pub ok: bool,
    pub result: serde_json::Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl ControlResponse {
    pub fn success(result: impl Serialize) -> Self {
        Self {
            ok: true,
            result: serde_json::to_value(result).unwrap_or(serde_json::Value::Null),
            error: None,
        }
    }

    pub fn failure(msg: impl Into<String>) -> Self {
        Self {
            ok: false,
            result: serde_json::Value::Null,
            error: Some(msg.into()),
        }
    }
}

pub fn default_socket_path() -> PathBuf {
    if let Some(dirs) = directories::ProjectDirs::from("", "", "wormhole") {
        let dir = dirs.data_local_dir().to_path_buf();
        let _ = std::fs::create_dir_all(&dir);
        return dir.join("control.sock");
    }
    PathBuf::from("/tmp/wormhole-control.sock")
}

pub async fn handle_request(mgr: &SessionManager, req: ControlRequest) -> ControlResponse {
    match req {
        ControlRequest::Ping => ControlResponse::success("pong"),
        ControlRequest::HostStart(r) => match mgr.start_host(r).await {
            Ok(v) => ControlResponse::success(v),
            Err(e) => ControlResponse::failure(e.to_string()),
        },
        ControlRequest::HostStop { id } => match mgr.stop_host(&id).await {
            Ok(()) => ControlResponse::success("stopped"),
            Err(e) => ControlResponse::failure(e.to_string()),
        },
        ControlRequest::HostList => ControlResponse::success(mgr.list_hosts().await),
        ControlRequest::MountStart(r) => match mgr.start_mount(r).await {
            Ok(v) => ControlResponse::success(v),
            Err(e) => ControlResponse::failure(e.to_string()),
        },
        ControlRequest::MountStop { id } => match mgr.stop_mount(&id).await {
            Ok(()) => ControlResponse::success("stopped"),
            Err(e) => ControlResponse::failure(e.to_string()),
        },
        ControlRequest::MountList => ControlResponse::success(mgr.list_mounts().await),
        ControlRequest::Status => ControlResponse::success(mgr.status().await),
        ControlRequest::ProbeRemote { target } => match mgr.probe_remote(&target).await {
            Ok(v) => ControlResponse::success(v),
            Err(e) => ControlResponse::failure(e.to_string()),
        },
        ControlRequest::GenerateCode => ControlResponse::success(SessionManager::generate_code()),
        ControlRequest::LocalIps => match SessionManager::local_ips() {
            Ok(v) => ControlResponse::success(v),
            Err(e) => ControlResponse::failure(e.to_string()),
        },
        ControlRequest::ListDirectory { path } => {
            match SessionManager::list_directory(std::path::Path::new(&path)) {
                Ok(v) => ControlResponse::success(v),
                Err(e) => ControlResponse::failure(e.to_string()),
            }
        }
        ControlRequest::Doctor => ControlResponse::success(DoctorReport::run()),
        ControlRequest::CacheStats => match SessionManager::cache_stats() {
            Ok(v) => ControlResponse::success(v),
            Err(e) => ControlResponse::failure(e.to_string()),
        },
        ControlRequest::CacheClear => match SessionManager::cache_clear() {
            Ok(()) => ControlResponse::success("cleared"),
            Err(e) => ControlResponse::failure(e.to_string()),
        },
        ControlRequest::DefaultMountPath { label } => {
            match SessionManager::default_mount_path(&label) {
                Ok(v) => ControlResponse::success(v.to_string_lossy()),
                Err(e) => ControlResponse::failure(e.to_string()),
            }
        }
        ControlRequest::FeatureSurface => ControlResponse::success(FEATURE_SURFACE),
        ControlRequest::PlayheadHint {
            inode,
            offset,
            ahead,
            behind,
        } => {
            let msg = teleport_daemon::playhead_ipc::PlayheadHintMsg {
                inode,
                offset,
                ahead,
                behind,
            };
            match teleport_daemon::playhead_ipc::send_hint(&msg) {
                Ok(()) => ControlResponse::success("hint sent"),
                Err(e) => ControlResponse::failure(e),
            }
        }
        ControlRequest::Shutdown => {
            mgr.stop_all().await;
            ControlResponse::success("shutdown")
        }
    }
}

#[cfg(unix)]
pub async fn serve_unix(path: PathBuf, mgr: Arc<SessionManager>) -> anyhow::Result<()> {
    use std::os::unix::fs::PermissionsExt;
    use std::sync::atomic::{AtomicBool, Ordering};
    use tokio::net::UnixListener;

    if path.exists() {
        let _ = std::fs::remove_file(&path);
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
        // SECURITY: restrict control-plane directory to the service user.
        let _ = std::fs::set_permissions(parent, std::fs::Permissions::from_mode(0o700));
    }
    let listener = UnixListener::bind(&path)?;
    // SECURITY: socket must not be world/group-writable.
    let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
    info!(path = %path.display(), "control plane listening");
    let shutting_down = Arc::new(AtomicBool::new(false));

    loop {
        if shutting_down.load(Ordering::SeqCst) {
            break;
        }
        let accept = listener.accept();
        tokio::pin!(accept);
        let (stream, _) = tokio::select! {
            res = &mut accept => res?,
            _ = tokio::time::sleep(std::time::Duration::from_millis(200)) => {
                continue;
            }
        };
        let mgr = Arc::clone(&mgr);
        let shutting_down = Arc::clone(&shutting_down);
        tokio::spawn(async move {
            match handle_connection(stream, mgr).await {
                Ok(true) => {
                    shutting_down.store(true, Ordering::SeqCst);
                }
                Ok(false) => {}
                Err(e) => error!(error = %e, "control connection error"),
            }
        });
    }
    let _ = std::fs::remove_file(&path);
    info!("control plane stopped");
    Ok(())
}

/// Returns `true` when the control plane should exit.
#[cfg(unix)]
async fn handle_connection(
    stream: tokio::net::UnixStream,
    mgr: Arc<SessionManager>,
) -> anyhow::Result<bool> {
    // SECURITY: only accept control clients from the same UID as this process.
    if let Ok(cred) = stream.peer_cred() {
        let self_uid = unsafe { libc::getuid() };
        if cred.uid() != self_uid {
            anyhow::bail!(
                "control peer uid {} rejected (expected {})",
                cred.uid(),
                self_uid
            );
        }
    }

    let (reader, mut writer) = stream.into_split();
    let mut lines = BufReader::new(reader).lines();
    let mut shutdown = false;
    while let Some(line) = lines.next_line().await? {
        if line.trim().is_empty() {
            continue;
        }
        let req: ControlRequest = match serde_json::from_str(&line) {
            Ok(r) => r,
            Err(e) => {
                let resp = ControlResponse::failure(format!("bad request: {e}"));
                writer
                    .write_all(format!("{}\n", serde_json::to_string(&resp)?).as_bytes())
                    .await?;
                continue;
            }
        };
        shutdown = matches!(req, ControlRequest::Shutdown);
        let resp = handle_request(&mgr, req).await;
        writer
            .write_all(format!("{}\n", serde_json::to_string(&resp)?).as_bytes())
            .await?;
        if shutdown {
            break;
        }
    }
    Ok(shutdown)
}

#[cfg(unix)]
pub async fn call_unix(path: &PathBuf, req: ControlRequest) -> anyhow::Result<ControlResponse> {
    use tokio::net::UnixStream;
    let stream = UnixStream::connect(path).await?;
    let (reader, mut writer) = stream.into_split();
    let payload = serde_json::to_string(&req)?;
    writer.write_all(payload.as_bytes()).await?;
    writer.write_all(b"\n").await?;
    let mut lines = BufReader::new(reader).lines();
    let line = lines
        .next_line()
        .await?
        .ok_or_else(|| anyhow::anyhow!("control plane closed without response"))?;
    Ok(serde_json::from_str(&line)?)
}

#[cfg(not(unix))]
pub async fn serve_unix(_path: PathBuf, _mgr: Arc<SessionManager>) -> anyhow::Result<()> {
    anyhow::bail!("Unix control socket is not supported on this platform yet")
}

#[cfg(not(unix))]
pub async fn call_unix(_path: &PathBuf, _req: ControlRequest) -> anyhow::Result<ControlResponse> {
    anyhow::bail!("Unix control socket is not supported on this platform yet")
}
