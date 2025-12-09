//! Wormhole CLI - Host and mount remote filesystems
//!
//! Usage:
//!   wormhole host <path>              Share a directory
//!   wormhole mount <code> [path]      Mount a remote share
//!   wormhole signal                   Run signal server

use std::net::SocketAddr;
use std::path::PathBuf;

use clap::{Parser, Subcommand};
use tokio::signal;
use tracing::{error, info, Level};
use tracing_subscriber::FmtSubscriber;

use teleport_daemon::host::{HostConfig, WormholeHost};

#[derive(Parser)]
#[command(name = "wormhole")]
#[command(about = "P2P filesystem sharing", long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Commands,

    /// Enable verbose logging
    #[arg(short, long, global = true)]
    verbose: bool,
}

#[derive(Subcommand)]
enum Commands {
    /// Share a directory
    Host {
        /// Path to share
        path: PathBuf,

        /// Port to listen on
        #[arg(short, long, default_value = "4433")]
        port: u16,

        /// Bind address
        #[arg(short, long, default_value = "0.0.0.0")]
        bind: String,
    },

    /// Mount a remote share
    Mount {
        /// Join code (e.g., ABC-123)
        code: String,

        /// Mount point (default: auto-generated)
        path: Option<PathBuf>,

        /// Signal server URL
        #[arg(short, long, default_value = "ws://localhost:8080")]
        signal: String,
    },

    /// Run the signal server
    Signal {
        /// Port to listen on
        #[arg(short, long, default_value = "8080")]
        port: u16,

        /// Bind address
        #[arg(short, long, default_value = "0.0.0.0")]
        bind: String,
    },
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let cli = Cli::parse();

    // Set up logging
    let level = if cli.verbose { Level::DEBUG } else { Level::INFO };
    let subscriber = FmtSubscriber::builder()
        .with_max_level(level)
        .with_target(false)
        .finish();
    tracing::subscriber::set_global_default(subscriber)?;

    match cli.command {
        Commands::Host { path, port, bind } => {
            run_host(path, port, bind).await?;
        }
        Commands::Mount { code, path, signal } => {
            run_mount(code, path, signal).await?;
        }
        Commands::Signal { port, bind } => {
            run_signal(port, bind).await?;
        }
    }

    Ok(())
}

async fn run_host(path: PathBuf, port: u16, bind: String) -> Result<(), Box<dyn std::error::Error>> {
    let path = path.canonicalize()?;

    if !path.is_dir() {
        error!("Path must be a directory: {:?}", path);
        return Err("Not a directory".into());
    }

    let bind_addr: SocketAddr = format!("{}:{}", bind, port).parse()?;

    let config = HostConfig {
        bind_addr,
        shared_path: path.clone(),
        max_connections: 10,
        host_name: hostname::get()
            .map(|h| h.to_string_lossy().into_owned())
            .unwrap_or_else(|_| "wormhole-host".into()),
    };

    info!("Starting Wormhole host...");
    info!("  Sharing: {:?}", path);
    info!("  Listening on: {}", bind_addr);

    // Generate join code
    let join_code = teleport_core::crypto::generate_join_code();
    info!("");
    info!("  Join code: {}", join_code);
    info!("");
    info!("  Run on another machine:");
    info!("    wormhole mount {}", join_code);
    info!("");

    let host = WormholeHost::new(config);

    // Handle Ctrl+C
    tokio::select! {
        result = host.serve() => {
            if let Err(e) = result {
                error!("Host error: {:?}", e);
            }
        }
        _ = signal::ctrl_c() => {
            info!("Shutting down...");
        }
    }

    Ok(())
}

async fn run_mount(
    code: String,
    mount_path: Option<PathBuf>,
    _signal_url: String,
) -> Result<(), Box<dyn std::error::Error>> {
    let code = teleport_core::crypto::normalize_join_code(&code);

    if !teleport_core::crypto::validate_join_code(&code) {
        error!("Invalid join code: {}", code);
        return Err("Invalid join code".into());
    }

    let mount_point = mount_path.unwrap_or_else(|| {
        let tmp = std::env::temp_dir();
        tmp.join(format!("wormhole-{}", &code))
    });

    // Create mount point if it doesn't exist
    if !mount_point.exists() {
        std::fs::create_dir_all(&mount_point)?;
    }

    info!("Connecting to share with code: {}", code);
    info!("Mount point: {:?}", mount_point);

    // TODO: Connect to signal server, get host address
    // TODO: Connect to host via QUIC
    // TODO: Mount FUSE filesystem

    error!("Mount not yet implemented - need signal server connection");
    error!("For now, use direct connection:");
    error!("  1. Run host: wormhole host /path/to/share");
    error!("  2. Note the IP and port");
    error!("  3. Use the test binary (coming soon)");

    Ok(())
}

async fn run_signal(port: u16, bind: String) -> Result<(), Box<dyn std::error::Error>> {
    let bind_addr: SocketAddr = format!("{}:{}", bind, port).parse()?;

    info!("Starting Wormhole signal server...");
    info!("  Listening on: ws://{}", bind_addr);

    let server = teleport_signal::SignalServer::new();

    // Handle Ctrl+C
    tokio::select! {
        result = server.serve(bind_addr) => {
            if let Err(e) = result {
                error!("Signal server error: {:?}", e);
            }
        }
        _ = signal::ctrl_c() => {
            info!("Shutting down...");
        }
    }

    Ok(())
}
