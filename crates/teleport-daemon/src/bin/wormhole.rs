//! Wormhole CLI - Host and mount remote filesystems
//!
//! Usage:
//!   wormhole host <path>                   Share a directory
//!   wormhole mount <code-or-ip> [path]     Mount a remote share
//!   wormhole signal                        Run signal server
//!
//! Examples:
//!   wormhole host ./my-folder              # Share a folder, get a join code
//!   wormhole mount 192.168.1.100:4433      # Direct IP connection
//!   wormhole mount ABC-123                 # Join code (requires signal server)

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
        /// Join code (e.g., ABC-123) or IP address (e.g., 192.168.1.100:4433)
        target: String,

        /// Mount point (default: auto-generated in temp directory)
        path: Option<PathBuf>,

        /// Signal server URL (only used with join codes)
        #[arg(short, long, default_value = "ws://localhost:8080")]
        signal: String,

        /// Use kernel extension backend instead of FSKit (macOS)
        #[arg(long)]
        use_kext: bool,
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
        Commands::Mount { target, path, signal, use_kext } => {
            run_mount(target, path, signal, use_kext).await?;
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

/// Check if the target looks like an IP:port address
fn is_ip_address(target: &str) -> bool {
    // Try to parse as SocketAddr
    target.parse::<SocketAddr>().is_ok()
}

async fn run_mount(
    target: String,
    mount_path: Option<PathBuf>,
    _signal_url: String,
    use_kext: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    // Determine if this is a direct IP connection or a join code
    if is_ip_address(&target) {
        // Direct IP connection
        run_mount_direct(target, mount_path, use_kext).await
    } else {
        // Join code - needs signal server
        run_mount_via_signal(target, mount_path, _signal_url, use_kext).await
    }
}

async fn run_mount_direct(
    host_addr: String,
    mount_path: Option<PathBuf>,
    use_kext: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    let addr: SocketAddr = host_addr.parse()?;

    // Default mount point depends on platform
    #[cfg(target_os = "macos")]
    let default_mount = if use_kext {
        std::env::temp_dir().join(format!("wormhole-{}", addr.port()))
    } else {
        PathBuf::from("/Volumes/wormhole")
    };

    #[cfg(not(target_os = "macos"))]
    let default_mount = std::env::temp_dir().join(format!("wormhole-{}", addr.port()));

    let mount_point = mount_path.unwrap_or(default_mount);

    // Create mount point if it doesn't exist
    if !mount_point.exists() {
        std::fs::create_dir_all(&mount_point)?;
    }

    info!("Connecting to {}", addr);
    info!("Mount point: {:?}", mount_point);

    // Find the wormhole-mount binary (should be in same directory as wormhole)
    let current_exe = std::env::current_exe()?;
    let mount_exe = current_exe.parent()
        .map(|p| p.join("wormhole-mount"))
        .filter(|p| p.exists())
        .ok_or("Could not find wormhole-mount binary")?;

    // Build command
    let mut cmd = std::process::Command::new(&mount_exe);
    cmd.arg(&host_addr);
    cmd.arg(&mount_point);

    if use_kext {
        cmd.arg("--use-kext");
    }

    // Exec the mount binary (replaces this process)
    info!("Launching mount: {:?} {} {:?}{}",
        mount_exe,
        host_addr,
        mount_point,
        if use_kext { " --use-kext" } else { "" }
    );

    let status = cmd.status()?;

    if !status.success() {
        error!("Mount failed with exit code: {:?}", status.code());
        return Err("Mount failed".into());
    }

    Ok(())
}

async fn run_mount_via_signal(
    code: String,
    mount_path: Option<PathBuf>,
    signal_url: String,
    _use_kext: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    let code = teleport_core::crypto::normalize_join_code(&code);

    if !teleport_core::crypto::validate_join_code(&code) {
        error!("Invalid join code: {}", code);
        error!("");
        error!("Did you mean to use a direct IP address?");
        error!("  Example: wormhole mount 192.168.1.100:4433");
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
    info!("Signal server: {}", signal_url);
    info!("Mount point: {:?}", mount_point);

    // TODO: Connect to signal server, get host address via rendezvous
    // For now, show helpful error
    error!("");
    error!("Signal server connection not yet implemented in CLI.");
    error!("");
    error!("For now, use direct IP connection:");
    error!("  1. On host machine: wormhole host /path/to/share");
    error!("  2. Note the IP address (e.g., ifconfig | grep inet)");
    error!("  3. On client: wormhole mount <ip>:4433 --use-kext");
    error!("");
    error!("Example:");
    error!("  wormhole mount 192.168.50.141:4433 --use-kext");

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
