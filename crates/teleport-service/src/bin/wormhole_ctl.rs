//! `wormhole-ctl` — production control CLI with full feature parity to desktop/MCP.

use std::path::PathBuf;

use clap::{Parser, Subcommand};
use teleport_service::{
    call_unix, default_socket_path, serve_unix, ControlRequest, DoctorReport, SessionManager,
    StartHostRequest, StartMountRequest, FEATURE_SURFACE,
};

#[derive(Parser)]
#[command(
    name = "wormhole-ctl",
    about = "Wormhole control plane CLI (parity with desktop + MCP)"
)]
struct Cli {
    #[arg(long, global = true, env = "WORMHOLE_CONTROL_SOCK")]
    socket: Option<PathBuf>,

    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    Serve,
    Host {
        #[command(subcommand)]
        cmd: HostCmd,
    },
    Mount {
        #[command(subcommand)]
        cmd: MountCmd,
    },
    Status,
    Probe {
        target: String,
    },
    GenerateCode,
    LocalIps,
    Ls {
        path: PathBuf,
    },
    Doctor,
    Cache {
        #[command(subcommand)]
        cmd: CacheCmd,
    },
    DefaultMountPath {
        label: String,
    },
    Features,
    Ping,
    Shutdown,
    /// Send a playhead scrub hint to the local mount
    Playhead {
        #[arg(long)]
        inode: u64,
        #[arg(long)]
        offset: u64,
        #[arg(long)]
        ahead: Option<u64>,
        #[arg(long)]
        behind: Option<u64>,
    },
}

#[derive(Subcommand)]
enum HostCmd {
    Start {
        path: PathBuf,
        #[arg(long)]
        id: Option<String>,
        #[arg(long)]
        port: Option<u16>,
        #[arg(long)]
        name: Option<String>,
    },
    Stop {
        id: String,
    },
    List,
}

#[derive(Subcommand)]
enum MountCmd {
    Start {
        target: String,
        #[arg(long)]
        id: Option<String>,
        #[arg(long)]
        mount_point: Option<PathBuf>,
        #[arg(long, default_value_t = true)]
        data_plane_only: bool,
        #[arg(long, default_value_t = false)]
        fuse: bool,
    },
    Stop {
        id: String,
    },
    List,
}

#[derive(Subcommand)]
enum CacheCmd {
    Stats,
    Clear,
}

fn print_json(v: &impl serde::Serialize) -> anyhow::Result<()> {
    println!("{}", serde_json::to_string_pretty(v)?);
    Ok(())
}

async fn rpc(sock: &PathBuf, req: ControlRequest) -> anyhow::Result<()> {
    if !sock.exists() {
        anyhow::bail!(
            "control plane not running. Start with: wormhole-ctl serve\n(socket: {})",
            sock.display()
        );
    }
    let resp = call_unix(sock, req).await?;
    if !resp.ok {
        anyhow::bail!("{}", resp.error.unwrap_or_else(|| "unknown error".into()));
    }
    println!("{}", serde_json::to_string_pretty(&resp.result)?);
    Ok(())
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive("info".parse().unwrap()),
        )
        .with_writer(std::io::stderr)
        .init();

    let cli = Cli::parse();
    let sock = cli.socket.unwrap_or_else(default_socket_path);

    match cli.command {
        Commands::Serve => {
            let mgr = SessionManager::new_arc();
            eprintln!("control plane: {}", sock.display());
            serve_unix(sock, mgr).await?;
        }
        Commands::Features => print_json(&FEATURE_SURFACE)?,
        Commands::GenerateCode => {
            if sock.exists() {
                rpc(&sock, ControlRequest::GenerateCode).await?;
            } else {
                println!("{}", SessionManager::generate_code());
            }
        }
        Commands::LocalIps => {
            if sock.exists() {
                rpc(&sock, ControlRequest::LocalIps).await?;
            } else {
                print_json(&SessionManager::local_ips()?)?;
            }
        }
        Commands::Ls { path } => {
            if sock.exists() {
                rpc(
                    &sock,
                    ControlRequest::ListDirectory {
                        path: path.to_string_lossy().into_owned(),
                    },
                )
                .await?;
            } else {
                print_json(&SessionManager::list_directory(&path)?)?;
            }
        }
        Commands::Doctor => {
            if sock.exists() {
                rpc(&sock, ControlRequest::Doctor).await?;
            } else {
                print_json(&DoctorReport::run())?;
            }
        }
        Commands::Cache {
            cmd: CacheCmd::Stats,
        } => {
            if sock.exists() {
                rpc(&sock, ControlRequest::CacheStats).await?;
            } else {
                print_json(&SessionManager::cache_stats()?)?;
            }
        }
        Commands::Cache {
            cmd: CacheCmd::Clear,
        } => {
            if sock.exists() {
                rpc(&sock, ControlRequest::CacheClear).await?;
            } else {
                SessionManager::cache_clear()?;
                println!("\"cleared\"");
            }
        }
        Commands::DefaultMountPath { label } => {
            if sock.exists() {
                rpc(&sock, ControlRequest::DefaultMountPath { label }).await?;
            } else {
                println!("{}", SessionManager::default_mount_path(&label)?.display());
            }
        }
        Commands::Host {
            cmd:
                HostCmd::Start {
                    path,
                    id,
                    port,
                    name,
                },
        } => {
            rpc(
                &sock,
                ControlRequest::HostStart(StartHostRequest {
                    id,
                    path,
                    port,
                    name,
                }),
            )
            .await?;
        }
        Commands::Host {
            cmd: HostCmd::Stop { id },
        } => rpc(&sock, ControlRequest::HostStop { id }).await?,
        Commands::Host { cmd: HostCmd::List } => rpc(&sock, ControlRequest::HostList).await?,
        Commands::Mount {
            cmd:
                MountCmd::Start {
                    target,
                    id,
                    mount_point,
                    data_plane_only,
                    fuse,
                },
        } => {
            rpc(
                &sock,
                ControlRequest::MountStart(StartMountRequest {
                    target,
                    id,
                    mount_point,
                    data_plane_only: if fuse { false } else { data_plane_only },
                }),
            )
            .await?;
        }
        Commands::Mount {
            cmd: MountCmd::Stop { id },
        } => rpc(&sock, ControlRequest::MountStop { id }).await?,
        Commands::Mount {
            cmd: MountCmd::List,
        } => rpc(&sock, ControlRequest::MountList).await?,
        Commands::Status => rpc(&sock, ControlRequest::Status).await?,
        Commands::Probe { target } => rpc(&sock, ControlRequest::ProbeRemote { target }).await?,
        Commands::Ping => rpc(&sock, ControlRequest::Ping).await?,
        Commands::Shutdown => rpc(&sock, ControlRequest::Shutdown).await?,
        Commands::Playhead {
            inode,
            offset,
            ahead,
            behind,
        } => {
            // Prefer control plane when running; otherwise send IPC directly.
            if sock.exists() {
                rpc(
                    &sock,
                    ControlRequest::PlayheadHint {
                        inode,
                        offset,
                        ahead,
                        behind,
                    },
                )
                .await?;
            } else {
                let msg = teleport_daemon::playhead_ipc::PlayheadHintMsg {
                    inode,
                    offset,
                    ahead,
                    behind,
                };
                teleport_daemon::playhead_ipc::send_hint(&msg).map_err(|e| anyhow::anyhow!(e))?;
                println!("\"hint sent\"");
            }
        }
    }
    Ok(())
}
