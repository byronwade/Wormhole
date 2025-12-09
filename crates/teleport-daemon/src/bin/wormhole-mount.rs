//! Direct mount test - connects to host without signal server
//!
//! Usage:
//!   wormhole-mount <host:port> <mount_point>
//!
//! Example (Unix):
//!   wormhole-mount 127.0.0.1:4433 /Volumes/wormhole-test
//!
//! Example (Windows):
//!   wormhole-mount 127.0.0.1:4433 W:
//!
//! Note: On macOS 26+, uses FSKit backend (no kernel extension needed).
//!       FSKit requires mount points in /Volumes.
//!
//! Platform support:
//! - Linux: Uses FUSE (requires libfuse3)
//! - macOS: Uses macFUSE (requires macfuse)
//! - Windows: Uses WinFSP (requires winfsp)

// FUSE is only available on Unix platforms (Linux, macOS)
#[cfg(unix)]
mod unix_impl {
    use std::net::SocketAddr;
    use std::path::PathBuf;
    use std::thread;
    use std::time::Duration;

    use clap::Parser;
    use fuser::MountOption;
    use tokio::runtime::Runtime;
    #[cfg(target_os = "macos")]
    use tracing::warn;
    use tracing::{error, info, Level};
    use tracing_subscriber::FmtSubscriber;

    use teleport_daemon::bridge::FuseAsyncBridge;
    use teleport_daemon::client::{ClientConfig, WormholeClient};
    use teleport_daemon::fuse::WormholeFS;
    use teleport_daemon::GarbageCollector;

    #[derive(Parser)]
    #[command(name = "wormhole-mount")]
    #[command(about = "Mount a remote Wormhole share directly (for testing)")]
    pub struct Cli {
        /// Host address (e.g., 127.0.0.1:4433)
        host: SocketAddr,

        /// Mount point (must be in /Volumes on macOS with FSKit)
        mount_point: Option<PathBuf>,

        /// Enable verbose logging
        #[arg(short, long)]
        verbose: bool,

        /// Use kernel extension backend instead of FSKit (requires kext approval)
        #[arg(long)]
        use_kext: bool,
    }

    pub fn run() -> Result<(), Box<dyn std::error::Error>> {
        let cli = Cli::parse();

        // Set up logging
        let level = if cli.verbose {
            Level::DEBUG
        } else {
            Level::INFO
        };
        let subscriber = FmtSubscriber::builder()
            .with_max_level(level)
            .with_target(false)
            .finish();
        tracing::subscriber::set_global_default(subscriber)?;

        // Determine mount point - default to /Volumes/wormhole for FSKit compatibility
        let mount_point = cli
            .mount_point
            .unwrap_or_else(|| PathBuf::from("/Volumes/wormhole"));

        // On macOS with FSKit, mount point must be in /Volumes
        #[cfg(target_os = "macos")]
        if !cli.use_kext && !mount_point.starts_with("/Volumes") {
            warn!("FSKit backend requires mount point in /Volumes");
            warn!("Using /Volumes/wormhole instead of {:?}", mount_point);
            warn!("Use --use-kext flag to mount elsewhere (requires kernel extension)");
        }

        // Determine the actual mount point to use
        #[cfg(target_os = "macos")]
        let actual_mount_point = if !cli.use_kext && !mount_point.starts_with("/Volumes") {
            PathBuf::from("/Volumes/wormhole")
        } else {
            mount_point.clone()
        };

        #[cfg(not(target_os = "macos"))]
        let actual_mount_point = mount_point.clone();

        // Create mount point if it doesn't exist
        if !actual_mount_point.exists() {
            std::fs::create_dir_all(&actual_mount_point)?;
        }

        // Determine if FSKit backend should be used
        #[cfg(target_os = "macos")]
        let use_fskit = !cli.use_kext;

        #[cfg(target_os = "macos")]
        if use_fskit {
            info!("Using FSKit backend (no kernel extension required)");
        }

        info!("Connecting to {}", cli.host);
        info!("Mount point: {:?}", actual_mount_point);

        // Create the FUSE ↔ async bridge
        let (bridge, request_rx) = FuseAsyncBridge::new(Duration::from_secs(30));

        // Create client config
        let config = ClientConfig {
            server_addr: cli.host,
            mount_point: actual_mount_point.clone(),
            request_timeout: Duration::from_secs(30),
        };

        // Create the WormholeFS first so we can get a reference to its disk cache for GC
        let fs = WormholeFS::new(bridge);

        // Get the disk cache for the garbage collector
        let disk_cache = fs.disk_cache();

        // Get the sync engine for background sync (Phase 7)
        let sync_engine = fs.sync_engine();

        // Start tokio runtime in a separate thread for async networking
        let rt = Runtime::new()?;

        // Clone what we need for the async task
        let request_rx_clone = request_rx;

        // Spawn the client in the runtime
        let client_handle = thread::spawn(move || {
            rt.block_on(async move {
                let mut client = WormholeClient::new(config);

                // Connect to the host
                if let Err(e) = client.connect().await {
                    error!("Failed to connect: {:?}", e);
                    return;
                }

                info!("Connected to host!");

                // Start the garbage collector if we have a disk cache
                if let Some(disk_cache) = disk_cache {
                    info!("Starting garbage collector for disk cache");
                    let gc = GarbageCollector::new(disk_cache);
                    tokio::spawn(async move {
                        gc.run_loop().await;
                    });
                }

                // Start background sync for dirty chunks (Phase 7)
                info!("Starting background sync for dirty chunks");
                client.start_background_sync(sync_engine);

                // Handle FUSE requests
                if let Err(e) = client.handle_fuse_requests(request_rx_clone).await {
                    error!("Client error: {:?}", e);
                }
            });
        });

        // Mount FUSE filesystem (this blocks the main thread)
        info!("Mounting filesystem...");

        let mut mount_options = vec![
            MountOption::FSName("wormhole".to_string()),
            MountOption::AutoUnmount,
            MountOption::DefaultPermissions,
        ];

        // On macOS, add FSKit backend option if not using kext
        #[cfg(target_os = "macos")]
        if use_fskit {
            // Use CUSTOM mount option to tell libfuse to use FSKit backend
            mount_options.push(MountOption::CUSTOM("backend=fskit".to_string()));
            // FSKit may require local flag
            mount_options.push(MountOption::CUSTOM("local".to_string()));
        }

        // AllowOther may not work with FSKit, only add for kext backend
        #[cfg(target_os = "macos")]
        if !use_fskit {
            mount_options.push(MountOption::AllowOther);
        }

        #[cfg(not(target_os = "macos"))]
        mount_options.push(MountOption::AllowOther);

        // This blocks until unmounted
        if let Err(e) = fuser::mount2(fs, &actual_mount_point, &mount_options) {
            error!("Mount failed: {}", e);
            error!("");
            #[cfg(target_os = "macos")]
            {
                if cli.use_kext {
                    error!("Kernel extension issues:");
                    error!("  1. Enable in System Settings > Privacy & Security");
                    error!("  2. Reboot after enabling");
                } else {
                    error!("FSKit issues:");
                    error!("  1. Ensure macFUSE 5.1+ is installed: brew install --cask macfuse");
                    error!("  2. Mount point must be in /Volumes");
                    error!("  3. Try: sudo umount {:?}", actual_mount_point);
                }
            }
            #[cfg(not(target_os = "macos"))]
            {
                error!("Common issues:");
                error!("  1. FUSE not installed");
                error!("  2. Permission denied - try running with sudo");
                error!(
                    "  3. Mount point busy - unmount first: umount {:?}",
                    actual_mount_point
                );
            }
        }

        info!("Filesystem unmounted");

        // Wait for client thread
        let _ = client_handle.join();

        Ok(())
    }
}

// WinFSP is available on Windows
#[cfg(windows)]
mod windows_impl {
    use std::net::SocketAddr;
    use std::thread;
    use std::time::Duration;

    use clap::Parser;
    use tokio::runtime::Runtime;
    use tracing::{error, info, Level};
    use tracing_subscriber::FmtSubscriber;

    use teleport_daemon::bridge::FuseAsyncBridge;
    use teleport_daemon::client::{ClientConfig, WormholeClient};
    use teleport_daemon::winfsp::WormholeWinFS;
    use teleport_daemon::GarbageCollector;
    use winfsp::host::{FileSystemHost, VolumeParams};

    #[derive(Parser)]
    #[command(name = "wormhole-mount")]
    #[command(about = "Mount a remote Wormhole share using WinFSP")]
    pub struct Cli {
        /// Host address (e.g., 127.0.0.1:4433)
        host: SocketAddr,

        /// Mount point (drive letter like W: or directory path)
        #[arg(default_value = "W:")]
        mount_point: String,

        /// Enable verbose logging
        #[arg(short, long)]
        verbose: bool,

        /// Enable write support (experimental)
        #[arg(long)]
        writable: bool,
    }

    pub fn run() -> Result<(), Box<dyn std::error::Error>> {
        let cli = Cli::parse();

        // Set up logging
        let level = if cli.verbose {
            Level::DEBUG
        } else {
            Level::INFO
        };
        let subscriber = FmtSubscriber::builder()
            .with_max_level(level)
            .with_target(false)
            .finish();
        tracing::subscriber::set_global_default(subscriber)?;

        // Check if WinFSP is installed
        if !check_winfsp_installed() {
            error!("WinFSP is not installed or not properly configured.");
            error!("");
            error!("Please install WinFSP from: https://winfsp.dev/rel/");
            error!("After installation, you may need to restart your computer.");
            std::process::exit(1);
        }

        info!("Connecting to {}", cli.host);
        info!("Mount point: {}", cli.mount_point);

        // Create the filesystem ↔ async bridge
        let (bridge, request_rx) = FuseAsyncBridge::new(Duration::from_secs(30));

        // Create client config (use a dummy path for Windows)
        let config = ClientConfig {
            server_addr: cli.host,
            mount_point: std::path::PathBuf::from(&cli.mount_point),
            request_timeout: Duration::from_secs(30),
        };

        // Create the WinFSP filesystem
        let fs = if cli.writable {
            WormholeWinFS::new_writable(bridge)
        } else {
            WormholeWinFS::new(bridge)
        };

        // Get references for background tasks
        let disk_cache = fs.disk_cache();
        let sync_engine = fs.sync_engine();

        // Start tokio runtime in a separate thread for async networking
        let rt = Runtime::new()?;
        let request_rx_clone = request_rx;

        // Spawn the client in the runtime
        let client_handle = thread::spawn(move || {
            rt.block_on(async move {
                let mut client = WormholeClient::new(config);

                // Connect to the host
                if let Err(e) = client.connect().await {
                    error!("Failed to connect: {:?}", e);
                    return;
                }

                info!("Connected to host!");

                // Start the garbage collector if we have a disk cache
                if let Some(disk_cache) = disk_cache {
                    info!("Starting garbage collector for disk cache");
                    let gc = GarbageCollector::new(disk_cache);
                    tokio::spawn(async move {
                        gc.run_loop().await;
                    });
                }

                // Start background sync for dirty chunks
                info!("Starting background sync for dirty chunks");
                client.start_background_sync(sync_engine);

                // Handle filesystem requests
                if let Err(e) = client.handle_fuse_requests(request_rx_clone).await {
                    error!("Client error: {:?}", e);
                }
            });
        });

        // Mount WinFSP filesystem (this blocks the main thread)
        info!("Mounting filesystem via WinFSP...");

        // Create volume parameters
        let mut params = VolumeParams::new();
        params.filesystem_name("Wormhole");
        params.prefix(&cli.mount_point);

        match FileSystemHost::new(params, fs) {
            Ok(mut host) => {
                // Mount the filesystem
                if let Err(e) = host.mount(&cli.mount_point) {
                    error!("Failed to mount: {:?}", e);
                    error!("");
                    error!("Common issues:");
                    error!("  1. WinFSP not installed - download from https://winfsp.dev/rel/");
                    error!("  2. Drive letter already in use - try a different letter");
                    error!("  3. Run as Administrator if permission denied");
                    std::process::exit(1);
                }

                info!("Filesystem mounted at {}", cli.mount_point);
                info!("Press Ctrl+C to unmount and exit");

                // Start the filesystem dispatcher (blocks until stopped)
                if let Err(e) = host.start() {
                    error!("Filesystem error: {:?}", e);
                }

                // Unmount when done
                let _ = host.unmount();
                info!("Filesystem unmounted");
            }
            Err(e) => {
                error!("Failed to create filesystem host: {:?}", e);
                error!("");
                error!("WinFSP may not be properly installed.");
                std::process::exit(1);
            }
        }

        // Wait for client thread
        let _ = client_handle.join();

        Ok(())
    }

    /// Check if WinFSP is installed by trying to load the library
    fn check_winfsp_installed() -> bool {
        // Try to initialize WinFSP - this will fail if not installed
        // The winfsp crate handles this internally with delay loading
        // We just check if the registry key exists
        use std::process::Command;

        // Check if WinFSP registry key exists
        let output = Command::new("reg")
            .args(["query", r"HKLM\SOFTWARE\WinFsp", "/v", "InstallDir"])
            .output();

        match output {
            Ok(result) => result.status.success(),
            Err(_) => false,
        }
    }
}

#[cfg(unix)]
fn main() -> Result<(), Box<dyn std::error::Error>> {
    unix_impl::run()
}

#[cfg(windows)]
fn main() -> Result<(), Box<dyn std::error::Error>> {
    windows_impl::run()
}
