//! Wormhole MCP server — exposes the same session features as the CLI and desktop app.
//!
//! ```bash
//! cargo run -p teleport-mcp
//! # or: wormhole mcp
//! ```

use std::path::PathBuf;
use std::sync::Arc;

use anyhow::Result;
use rmcp::{
    handler::server::wrapper::Parameters,
    model::{ServerCapabilities, ServerInfo},
    schemars, tool, tool_handler, tool_router, ServerHandler, ServiceExt,
};
use serde::Deserialize;
use teleport_service::{
    DoctorReport, SessionManager, StartHostRequest, StartMountRequest, FEATURE_SURFACE,
};
use tracing_subscriber::EnvFilter;

#[derive(Clone)]
struct WormholeMcp {
    sessions: Arc<SessionManager>,
    tool_router: rmcp::handler::server::router::tool::ToolRouter<Self>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct HostStartParams {
    /// Absolute path to the folder to share
    path: String,
    /// Optional session id
    #[serde(default)]
    id: Option<String>,
    /// Optional UDP port (ephemeral if omitted)
    #[serde(default)]
    port: Option<u16>,
    /// Optional host display name
    #[serde(default)]
    name: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct IdParams {
    id: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct MountStartParams {
    /// `host:port` for LAN/direct connect
    target: String,
    #[serde(default)]
    id: Option<String>,
    #[serde(default)]
    mount_point: Option<String>,
    /// Prefer true in CI / headless (no FUSE)
    #[serde(default = "default_true")]
    data_plane_only: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct ProbeParams {
    target: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct ListDirParams {
    path: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct MountPathParams {
    label: String,
}

#[tool_router]
impl WormholeMcp {
    fn new() -> Self {
        Self {
            sessions: SessionManager::new_arc(),
            tool_router: Self::tool_router(),
        }
    }

    #[tool(description = "Start hosting a local folder over Wormhole QUIC")]
    async fn host_start(
        &self,
        Parameters(p): Parameters<HostStartParams>,
    ) -> Result<String, String> {
        let info = self
            .sessions
            .start_host(StartHostRequest {
                id: p.id,
                path: PathBuf::from(p.path),
                port: p.port,
                name: p.name,
            })
            .await
            .map_err(|e| e.to_string())?;
        serde_json::to_string_pretty(&info).map_err(|e| e.to_string())
    }

    #[tool(description = "Stop a Wormhole host session by id")]
    async fn host_stop(&self, Parameters(p): Parameters<IdParams>) -> Result<String, String> {
        self.sessions
            .stop_host(&p.id)
            .await
            .map_err(|e| e.to_string())?;
        Ok(format!("stopped host {}", p.id))
    }

    #[tool(description = "List active Wormhole host sessions")]
    async fn host_list(&self) -> Result<String, String> {
        let hosts = self.sessions.list_hosts().await;
        serde_json::to_string_pretty(&hosts).map_err(|e| e.to_string())
    }

    #[tool(description = "Connect/mount a peer (data-plane by default; no FUSE)")]
    async fn mount_start(
        &self,
        Parameters(p): Parameters<MountStartParams>,
    ) -> Result<String, String> {
        let info = self
            .sessions
            .start_mount(StartMountRequest {
                target: p.target,
                id: p.id,
                mount_point: p.mount_point.map(PathBuf::from),
                data_plane_only: p.data_plane_only,
            })
            .await
            .map_err(|e| e.to_string())?;
        serde_json::to_string_pretty(&info).map_err(|e| e.to_string())
    }

    #[tool(description = "Disconnect a Wormhole mount session by id")]
    async fn mount_stop(&self, Parameters(p): Parameters<IdParams>) -> Result<String, String> {
        self.sessions
            .stop_mount(&p.id)
            .await
            .map_err(|e| e.to_string())?;
        Ok(format!("stopped mount {}", p.id))
    }

    #[tool(description = "List active Wormhole mount sessions")]
    async fn mount_list(&self) -> Result<String, String> {
        let mounts = self.sessions.list_mounts().await;
        serde_json::to_string_pretty(&mounts).map_err(|e| e.to_string())
    }

    #[tool(description = "Full Wormhole session status (hosts + mounts)")]
    async fn status(&self) -> Result<String, String> {
        let status = self.sessions.status().await;
        serde_json::to_string_pretty(&status).map_err(|e| e.to_string())
    }

    #[tool(description = "Probe a remote host over QUIC and list the root directory")]
    async fn probe_remote(&self, Parameters(p): Parameters<ProbeParams>) -> Result<String, String> {
        let probe = self
            .sessions
            .probe_remote(&p.target)
            .await
            .map_err(|e| e.to_string())?;
        serde_json::to_string_pretty(&probe).map_err(|e| e.to_string())
    }

    #[tool(description = "Generate a new Wormhole join code")]
    fn generate_code(&self) -> Result<String, String> {
        Ok(SessionManager::generate_code())
    }

    #[tool(description = "List local IP addresses for LAN sharing")]
    fn local_ips(&self) -> Result<String, String> {
        let ips = SessionManager::local_ips().map_err(|e| e.to_string())?;
        serde_json::to_string_pretty(&ips).map_err(|e| e.to_string())
    }

    #[tool(description = "List a local directory (safe for agents)")]
    fn list_directory(&self, Parameters(p): Parameters<ListDirParams>) -> Result<String, String> {
        let listing = SessionManager::list_directory(PathBuf::from(p.path).as_path())
            .map_err(|e| e.to_string())?;
        serde_json::to_string_pretty(&listing).map_err(|e| e.to_string())
    }

    #[tool(description = "Run Wormhole doctor / system readiness checks")]
    fn doctor(&self) -> Result<String, String> {
        let report = DoctorReport::run();
        serde_json::to_string_pretty(&report).map_err(|e| e.to_string())
    }

    #[tool(description = "Disk cache statistics")]
    fn cache_stats(&self) -> Result<String, String> {
        let stats = SessionManager::cache_stats().map_err(|e| e.to_string())?;
        serde_json::to_string_pretty(&stats).map_err(|e| e.to_string())
    }

    #[tool(description = "Clear the Wormhole disk cache")]
    fn cache_clear(&self) -> Result<String, String> {
        SessionManager::cache_clear().map_err(|e| e.to_string())?;
        Ok("cache cleared".into())
    }

    #[tool(description = "Suggested default mount path for a label/code")]
    fn default_mount_path(
        &self,
        Parameters(p): Parameters<MountPathParams>,
    ) -> Result<String, String> {
        let path = SessionManager::default_mount_path(&p.label).map_err(|e| e.to_string())?;
        Ok(path.to_string_lossy().into_owned())
    }

    #[tool(description = "List the canonical feature parity matrix (desktop/CLI/MCP)")]
    fn feature_surface(&self) -> Result<String, String> {
        serde_json::to_string_pretty(&FEATURE_SURFACE).map_err(|e| e.to_string())
    }
}

#[tool_handler(router = self.tool_router)]
impl ServerHandler for WormholeMcp {
    fn get_info(&self) -> ServerInfo {
        ServerInfo::new(ServerCapabilities::builder().enable_tools().build())
            .with_instructions(
                "Wormhole P2P filesystem tools. Prefer data_plane_only mounts in headless environments. Use host_start then probe_remote/mount_start against 127.0.0.1:<port>.",
            )
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    // Logging must go to stderr — stdout is the MCP transport.
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env().add_directive("warn".parse()?))
        .with_writer(std::io::stderr)
        .init();

    let server = WormholeMcp::new();
    let service = server.serve(rmcp::transport::stdio()).await?;
    service.waiting().await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn mcp_host_probe_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("readme.md"), b"# hi").unwrap();
        let mcp = WormholeMcp::new();
        let host_json = mcp
            .host_start(Parameters(HostStartParams {
                path: dir.path().to_string_lossy().into_owned(),
                id: Some("mcp-h1".into()),
                port: None,
                name: Some("mcp-test".into()),
            }))
            .await
            .unwrap();
        let host: teleport_service::HostSessionInfo = serde_json::from_str(&host_json).unwrap();
        let target = format!("127.0.0.1:{}", host.port);
        let probe = mcp
            .probe_remote(Parameters(ProbeParams {
                target: target.clone(),
            }))
            .await
            .unwrap();
        assert!(probe.contains("readme.md"), "{probe}");
        let mount = mcp
            .mount_start(Parameters(MountStartParams {
                target,
                id: Some("mcp-m1".into()),
                mount_point: None,
                data_plane_only: true,
            }))
            .await
            .unwrap();
        assert!(mount.contains("mcp-m1"));
        mcp.mount_stop(Parameters(IdParams {
            id: "mcp-m1".into(),
        }))
        .await
        .unwrap();
        mcp.host_stop(Parameters(IdParams {
            id: "mcp-h1".into(),
        }))
        .await
        .unwrap();
    }

    #[test]
    fn feature_surface_tool_lists_matrix() {
        let mcp = WormholeMcp::new();
        let json = mcp.feature_surface().unwrap();
        assert!(json.contains("host_start"));
        assert!(json.contains("\"mcp\": true") || json.contains("\"mcp\":true"));
    }
}
