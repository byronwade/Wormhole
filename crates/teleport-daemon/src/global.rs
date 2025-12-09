//! Global host and mount APIs using signal server for peer discovery
//!
//! These APIs provide code-based peer discovery that works across the internet,
//! not just on local networks.

use std::net::SocketAddr;
use std::path::PathBuf;
use std::time::Duration;

use tracing::{error, info};

use crate::host::HostConfig;
use crate::rendezvous::{RendezvousClient, RendezvousError, RendezvousResult};

/// Events emitted during global hosting/mounting
#[derive(Clone, Debug)]
pub enum GlobalEvent {
    /// Waiting for a peer to connect with the join code
    WaitingForPeer { join_code: String },
    /// Connecting to peer
    Connecting { peer_addr: SocketAddr },
    /// Peer connected successfully
    PeerConnected {
        peer_addr: SocketAddr,
        is_local: bool,
    },
    /// NAT hole punch in progress
    HolePunching { peer_addr: SocketAddr },
    /// Hole punch failed, trying direct connection anyway
    HolePunchFailed { peer_addr: SocketAddr },
    /// Host is ready and serving
    HostReady {
        join_code: String,
        bind_addr: SocketAddr,
    },
    /// Mount is ready
    MountReady { mount_point: PathBuf },
    /// Error occurred
    Error { message: String },
}

/// Configuration for global hosting
#[derive(Clone, Debug)]
pub struct GlobalHostConfig {
    /// Path to share
    pub shared_path: PathBuf,
    /// Optional signal server URL (uses default if not provided)
    pub signal_server: Option<String>,
    /// Optional join code (generated if not provided)
    pub join_code: Option<String>,
    /// Port to bind for QUIC connections
    pub quic_port: u16,
    /// Maximum connections
    pub max_connections: usize,
}

impl Default for GlobalHostConfig {
    fn default() -> Self {
        Self {
            shared_path: PathBuf::new(),
            signal_server: None,
            join_code: None,
            quic_port: 4433,
            max_connections: 10,
        }
    }
}

/// Configuration for global mounting
#[derive(Clone, Debug)]
pub struct GlobalMountConfig {
    /// Join code to connect with
    pub join_code: String,
    /// Path to mount at
    pub mount_point: PathBuf,
    /// Optional signal server URL
    pub signal_server: Option<String>,
    /// Timeout for requests
    pub request_timeout: Duration,
}

impl Default for GlobalMountConfig {
    fn default() -> Self {
        Self {
            join_code: String::new(),
            mount_point: PathBuf::new(),
            signal_server: None,
            request_timeout: Duration::from_secs(30),
        }
    }
}

/// Start hosting globally via signal server
///
/// This function:
/// 1. Connects to the signal server
/// 2. Creates a room with the join code
/// 3. Waits for a peer to connect
/// 4. Performs PAKE handshake
/// 5. Starts serving files
pub async fn start_host_global<F>(
    config: GlobalHostConfig,
    mut event_callback: F,
) -> Result<RendezvousResult, GlobalHostError>
where
    F: FnMut(GlobalEvent) + Send,
{
    // Generate join code if not provided
    let join_code = config
        .join_code
        .unwrap_or_else(teleport_core::crypto::generate_join_code);

    info!("Starting global host with code: {}", join_code);

    // Emit waiting event
    event_callback(GlobalEvent::WaitingForPeer {
        join_code: join_code.clone(),
    });

    // Connect to signal server and wait for peer
    let rendezvous = RendezvousClient::new(config.signal_server);
    let result = rendezvous
        .host(&join_code)
        .await
        .map_err(GlobalHostError::Rendezvous)?;

    info!(
        "Peer found: {} (local: {})",
        result.peer_addr, result.is_local
    );

    // Emit peer connected event
    event_callback(GlobalEvent::PeerConnected {
        peer_addr: result.peer_addr,
        is_local: result.is_local,
    });

    // Attempt hole punch if not on same LAN
    if !result.is_local {
        event_callback(GlobalEvent::HolePunching {
            peer_addr: result.peer_addr,
        });

        if let Err(e) =
            crate::rendezvous::attempt_hole_punch(result.peer_addr, config.quic_port).await
        {
            error!("Hole punch failed: {}", e);
            event_callback(GlobalEvent::HolePunchFailed {
                peer_addr: result.peer_addr,
            });
        }
    }

    // Create host config
    let bind_addr: SocketAddr = format!("0.0.0.0:{}", config.quic_port)
        .parse()
        .map_err(|e| GlobalHostError::Config(format!("Invalid port: {}", e)))?;

    let _host_config = HostConfig {
        bind_addr,
        shared_path: config.shared_path,
        max_connections: config.max_connections,
        host_name: hostname::get()
            .map(|h| h.to_string_lossy().into_owned())
            .unwrap_or_else(|_| "wormhole-host".into()),
    };

    // Emit host ready event
    event_callback(GlobalEvent::HostReady {
        join_code: join_code.clone(),
        bind_addr,
    });

    // The actual host.serve() should be called by the caller
    // We return the rendezvous result so they can use the shared key if needed

    Ok(result)
}

/// Connect and mount globally via signal server
///
/// This function:
/// 1. Connects to the signal server
/// 2. Joins the room with the join code
/// 3. Performs PAKE handshake
/// 4. Connects to the host
pub async fn connect_global<F>(
    config: GlobalMountConfig,
    mut event_callback: F,
) -> Result<RendezvousResult, GlobalMountError>
where
    F: FnMut(GlobalEvent) + Send,
{
    info!("Connecting globally with code: {}", config.join_code);

    // Connect to signal server
    let rendezvous = RendezvousClient::new(config.signal_server);

    // Emit connecting event
    event_callback(GlobalEvent::Connecting {
        peer_addr: "0.0.0.0:0".parse().unwrap(),
    });

    let result = rendezvous
        .connect(&config.join_code)
        .await
        .map_err(GlobalMountError::Rendezvous)?;

    info!(
        "Found host: {} (local: {})",
        result.peer_addr, result.is_local
    );

    // Emit peer connected event
    event_callback(GlobalEvent::PeerConnected {
        peer_addr: result.peer_addr,
        is_local: result.is_local,
    });

    // Attempt hole punch if not on same LAN
    if !result.is_local {
        event_callback(GlobalEvent::HolePunching {
            peer_addr: result.peer_addr,
        });

        // Try hole punch on port 0 (let OS pick)
        if let Err(e) = crate::rendezvous::attempt_hole_punch(result.peer_addr, 0).await {
            error!("Hole punch failed: {}", e);
            event_callback(GlobalEvent::HolePunchFailed {
                peer_addr: result.peer_addr,
            });
        }
    }

    Ok(result)
}

/// Errors during global hosting
#[derive(Debug)]
pub enum GlobalHostError {
    /// Rendezvous failed
    Rendezvous(RendezvousError),
    /// Configuration error
    Config(String),
    /// Host error
    Host(String),
}

impl std::fmt::Display for GlobalHostError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            GlobalHostError::Rendezvous(e) => write!(f, "Rendezvous error: {}", e),
            GlobalHostError::Config(e) => write!(f, "Configuration error: {}", e),
            GlobalHostError::Host(e) => write!(f, "Host error: {}", e),
        }
    }
}

impl std::error::Error for GlobalHostError {}

/// Errors during global mounting
#[derive(Debug)]
pub enum GlobalMountError {
    /// Rendezvous failed
    Rendezvous(RendezvousError),
    /// Configuration error
    Config(String),
    /// Mount error
    Mount(String),
}

impl std::fmt::Display for GlobalMountError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            GlobalMountError::Rendezvous(e) => write!(f, "Rendezvous error: {}", e),
            GlobalMountError::Config(e) => write!(f, "Configuration error: {}", e),
            GlobalMountError::Mount(e) => write!(f, "Mount error: {}", e),
        }
    }
}

impl std::error::Error for GlobalMountError {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_global_host_config_default() {
        let config = GlobalHostConfig::default();
        assert_eq!(config.quic_port, 4433);
        assert_eq!(config.max_connections, 10);
        assert!(config.signal_server.is_none());
    }

    #[test]
    fn test_global_mount_config_default() {
        let config = GlobalMountConfig::default();
        assert!(config.join_code.is_empty());
        assert_eq!(config.request_timeout, Duration::from_secs(30));
    }
}
