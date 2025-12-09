//! Rendezvous client for peer discovery via signal server
//!
//! This module handles:
//! - WebSocket connection to signal server
//! - PAKE key exchange for secure peer authentication
//! - Local IP detection for LAN optimization
//! - UDP hole punching for NAT traversal

use std::net::{IpAddr, SocketAddr, UdpSocket};
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use tokio::net::TcpStream;
use tokio::time::timeout;
use tokio_tungstenite::{connect_async, tungstenite::Message, MaybeTlsStream, WebSocketStream};
use tracing::{debug, info};
use url::Url;

use teleport_core::crypto::PakeHandshake;
use teleport_signal::{PeerInfo, SignalMessage};

/// Default signal server URL
pub const DEFAULT_SIGNAL_SERVER: &str = "wss://signal.wormhole.dev";

/// Timeout for WebSocket operations
const WS_TIMEOUT: Duration = Duration::from_secs(30);

/// Timeout for peer discovery
const DISCOVERY_TIMEOUT: Duration = Duration::from_secs(60);

/// Port for QUIC connections
const QUIC_PORT: u16 = 4433;

/// Result of a successful rendezvous
#[derive(Debug, Clone)]
pub struct RendezvousResult {
    /// Address to connect to
    pub peer_addr: SocketAddr,
    /// Shared key from PAKE (32 bytes)
    pub shared_key: [u8; 32],
    /// Whether the peer is on the same LAN
    pub is_local: bool,
    /// The join code used
    pub join_code: String,
}

/// Rendezvous errors
#[derive(Debug)]
pub enum RendezvousError {
    /// Failed to connect to signal server
    ConnectionFailed(String),
    /// Timeout waiting for peer
    Timeout,
    /// Signal server returned an error
    ServerError(String),
    /// PAKE handshake failed
    PakeFailed,
    /// No valid peer address found
    NoPeerAddress,
    /// WebSocket error
    WebSocket(String),
}

impl std::fmt::Display for RendezvousError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            RendezvousError::ConnectionFailed(e) => write!(f, "Connection failed: {}", e),
            RendezvousError::Timeout => write!(f, "Timeout waiting for peer"),
            RendezvousError::ServerError(e) => write!(f, "Server error: {}", e),
            RendezvousError::PakeFailed => write!(f, "PAKE handshake failed"),
            RendezvousError::NoPeerAddress => write!(f, "No valid peer address found"),
            RendezvousError::WebSocket(e) => write!(f, "WebSocket error: {}", e),
        }
    }
}

impl std::error::Error for RendezvousError {}

/// Rendezvous client for peer discovery
pub struct RendezvousClient {
    signal_server: String,
    local_addrs: Vec<SocketAddr>,
}

impl RendezvousClient {
    /// Create a new rendezvous client
    pub fn new(signal_server: Option<String>) -> Self {
        let signal_server = signal_server.unwrap_or_else(|| DEFAULT_SIGNAL_SERVER.to_string());
        let local_addrs = detect_local_addresses();

        Self {
            signal_server,
            local_addrs,
        }
    }

    /// Start hosting with a join code
    ///
    /// Connects to signal server, creates a room, waits for a peer,
    /// performs PAKE handshake, and returns the peer's address.
    pub async fn host(&self, join_code: &str) -> Result<RendezvousResult, RendezvousError> {
        info!("Starting host rendezvous with code: {}", join_code);

        // Connect to signal server
        let mut ws = self.connect_ws().await?;

        // Create room
        let create_msg = SignalMessage::CreateRoom {
            join_code: Some(join_code.to_string()),
        };
        self.send_message(&mut ws, &create_msg).await?;

        // Wait for room created confirmation
        let response = self.recv_message(&mut ws).await?;
        let actual_code = match response {
            SignalMessage::RoomCreated { join_code } => join_code,
            SignalMessage::Error { message, .. } => {
                return Err(RendezvousError::ServerError(message));
            }
            _ => return Err(RendezvousError::ServerError("Unexpected response".into())),
        };

        info!("Room created with code: {}", actual_code);

        // Start PAKE handshake as host
        let pake = PakeHandshake::start_host(&actual_code);
        let pake_msg = hex::encode(pake.outbound_message());

        // Send our peer info with PAKE message
        let my_info = PeerInfo {
            peer_id: generate_peer_id(),
            public_addr: None, // Server will fill this
            local_addrs: self.local_addrs.clone(),
            quic_port: QUIC_PORT,
            is_host: true,
        };
        self.send_message(&mut ws, &SignalMessage::PeerInfo(my_info))
            .await?;

        // Wait for client to join
        info!("Waiting for peer to connect...");
        let peer_result =
            timeout(DISCOVERY_TIMEOUT, self.wait_for_peer(&mut ws, pake, &pake_msg)).await;

        match peer_result {
            Ok(Ok(result)) => Ok(result),
            Ok(Err(e)) => Err(e),
            Err(_) => Err(RendezvousError::Timeout),
        }
    }

    /// Connect to a host using a join code
    ///
    /// Connects to signal server, joins the room, performs PAKE handshake,
    /// and returns the host's address.
    pub async fn connect(&self, join_code: &str) -> Result<RendezvousResult, RendezvousError> {
        info!("Starting client rendezvous with code: {}", join_code);

        // Connect to signal server
        let mut ws = self.connect_ws().await?;

        // Join room
        let join_msg = SignalMessage::JoinRoom {
            join_code: join_code.to_string(),
        };
        self.send_message(&mut ws, &join_msg).await?;

        // Wait for join confirmation
        let response = self.recv_message(&mut ws).await?;
        let host_info = match response {
            SignalMessage::JoinedRoom {
                join_code: _,
                host_info,
            } => host_info,
            SignalMessage::Error { message, .. } => {
                return Err(RendezvousError::ServerError(message));
            }
            _ => return Err(RendezvousError::ServerError("Unexpected response".into())),
        };

        info!("Joined room, host info: {:?}", host_info);

        // Start PAKE handshake as client
        let pake = PakeHandshake::start_client(join_code);
        let pake_msg = hex::encode(pake.outbound_message());

        // Send our peer info
        let my_info = PeerInfo {
            peer_id: generate_peer_id(),
            public_addr: None,
            local_addrs: self.local_addrs.clone(),
            quic_port: QUIC_PORT,
            is_host: false,
        };
        self.send_message(&mut ws, &SignalMessage::PeerInfo(my_info))
            .await?;

        // Exchange PAKE messages via relay
        if let Some(host) = host_info {
            // Relay our PAKE message to host
            let relay_msg = SignalMessage::Relay {
                to_peer_id: host.peer_id.clone(),
                payload: pake_msg,
            };
            self.send_message(&mut ws, &relay_msg).await?;

            // Wait for host's PAKE message
            let relayed = self.recv_message(&mut ws).await?;
            if let SignalMessage::Relayed {
                from_peer_id: _,
                payload,
            } = relayed
            {
                // Complete PAKE handshake
                let host_pake_msg =
                    hex::decode(&payload).map_err(|_| RendezvousError::PakeFailed)?;
                let shared_key = pake
                    .finish(&host_pake_msg)
                    .map_err(|_| RendezvousError::PakeFailed)?;

                // Determine best address to connect to
                let (peer_addr, is_local) = select_best_address(&host, &self.local_addrs)?;

                info!(
                    "Rendezvous complete, connecting to {} (local: {})",
                    peer_addr, is_local
                );

                return Ok(RendezvousResult {
                    peer_addr,
                    shared_key,
                    is_local,
                    join_code: join_code.to_string(),
                });
            }
        }

        Err(RendezvousError::NoPeerAddress)
    }

    /// Connect to the WebSocket signal server
    async fn connect_ws(
        &self,
    ) -> Result<WebSocketStream<MaybeTlsStream<TcpStream>>, RendezvousError> {
        let url = Url::parse(&self.signal_server)
            .map_err(|e| RendezvousError::ConnectionFailed(e.to_string()))?;

        debug!("Connecting to signal server: {}", url);

        let connect_result = timeout(WS_TIMEOUT, connect_async(url.as_str())).await;

        match connect_result {
            Ok(Ok((ws, _response))) => {
                info!("Connected to signal server");
                Ok(ws)
            }
            Ok(Err(e)) => Err(RendezvousError::ConnectionFailed(e.to_string())),
            Err(_) => Err(RendezvousError::Timeout),
        }
    }

    /// Send a message on the WebSocket
    async fn send_message(
        &self,
        ws: &mut WebSocketStream<MaybeTlsStream<TcpStream>>,
        msg: &SignalMessage,
    ) -> Result<(), RendezvousError> {
        let json = msg
            .to_json()
            .map_err(|e| RendezvousError::WebSocket(e.to_string()))?;

        ws.send(Message::Text(json))
            .await
            .map_err(|e| RendezvousError::WebSocket(e.to_string()))?;

        Ok(())
    }

    /// Receive a message from the WebSocket
    async fn recv_message(
        &self,
        ws: &mut WebSocketStream<MaybeTlsStream<TcpStream>>,
    ) -> Result<SignalMessage, RendezvousError> {
        loop {
            let recv_result = timeout(WS_TIMEOUT, ws.next()).await;

            match recv_result {
                Ok(Some(Ok(Message::Text(text)))) => {
                    let msg = SignalMessage::from_json(&text)
                        .map_err(|e| RendezvousError::WebSocket(e.to_string()))?;
                    return Ok(msg);
                }
                Ok(Some(Ok(Message::Close(_)))) => {
                    return Err(RendezvousError::WebSocket("Connection closed".into()));
                }
                Ok(Some(Err(e))) => {
                    return Err(RendezvousError::WebSocket(e.to_string()));
                }
                Ok(None) => {
                    return Err(RendezvousError::WebSocket("Connection closed".into()));
                }
                Ok(Some(Ok(_))) => {
                    // Ignore non-text messages (ping/pong/binary), continue loop
                    continue;
                }
                Err(_) => {
                    return Err(RendezvousError::Timeout);
                }
            }
        }
    }

    /// Wait for a peer to connect and complete PAKE exchange
    async fn wait_for_peer(
        &self,
        ws: &mut WebSocketStream<MaybeTlsStream<TcpStream>>,
        pake: PakeHandshake,
        pake_msg: &str,
    ) -> Result<RendezvousResult, RendezvousError> {
        loop {
            let msg = self.recv_message(ws).await?;

            match msg {
                SignalMessage::PeerConnected { peer_id, info } => {
                    info!("Peer connected: {}", peer_id);

                    // Send our PAKE message to the peer
                    let relay = SignalMessage::Relay {
                        to_peer_id: peer_id.clone(),
                        payload: pake_msg.to_string(),
                    };
                    self.send_message(ws, &relay).await?;

                    // Wait for their PAKE message
                    if let SignalMessage::Relayed {
                        from_peer_id: _,
                        payload,
                    } = self.recv_message(ws).await?
                    {
                        // Complete PAKE handshake
                        let peer_pake_msg =
                            hex::decode(&payload).map_err(|_| RendezvousError::PakeFailed)?;
                        let shared_key = pake
                            .finish(&peer_pake_msg)
                            .map_err(|_| RendezvousError::PakeFailed)?;

                        // Determine best address
                        let (peer_addr, is_local) =
                            select_best_address(&info, &self.local_addrs)?;

                        return Ok(RendezvousResult {
                            peer_addr,
                            shared_key,
                            is_local,
                            join_code: String::new(), // Host already knows the code
                        });
                    }
                }

                SignalMessage::Error { message, .. } => {
                    return Err(RendezvousError::ServerError(message));
                }

                SignalMessage::Ping { timestamp } => {
                    // Respond to keepalive
                    self.send_message(ws, &SignalMessage::Pong { timestamp })
                        .await?;
                }

                _ => {
                    debug!("Ignoring message: {:?}", msg);
                }
            }
        }
    }
}

/// Detect local network addresses
fn detect_local_addresses() -> Vec<SocketAddr> {
    let mut addrs = Vec::new();

    // Try to detect local IP by creating a UDP socket
    if let Ok(socket) = UdpSocket::bind("0.0.0.0:0") {
        // Connect to a public address (doesn't actually send packets)
        if socket.connect("8.8.8.8:80").is_ok() {
            if let Ok(local) = socket.local_addr() {
                addrs.push(SocketAddr::new(local.ip(), QUIC_PORT));
            }
        }
    }

    // Also add common private network addresses if they're bound
    for port in [QUIC_PORT] {
        if let Ok(socket) = UdpSocket::bind(format!("0.0.0.0:{}", port)) {
            if let Ok(local) = socket.local_addr() {
                if !addrs.contains(&local) {
                    addrs.push(local);
                }
            }
        }
    }

    debug!("Detected local addresses: {:?}", addrs);
    addrs
}

/// Select the best address to connect to a peer
fn select_best_address(
    peer: &PeerInfo,
    my_local_addrs: &[SocketAddr],
) -> Result<(SocketAddr, bool), RendezvousError> {
    // First, check if we're on the same LAN
    for peer_local in &peer.local_addrs {
        for my_local in my_local_addrs {
            // Same subnet check (simplified - just check first 3 octets for /24)
            if let (IpAddr::V4(peer_ip), IpAddr::V4(my_ip)) = (peer_local.ip(), my_local.ip()) {
                let peer_octets = peer_ip.octets();
                let my_octets = my_ip.octets();

                if peer_octets[0] == my_octets[0]
                    && peer_octets[1] == my_octets[1]
                    && peer_octets[2] == my_octets[2]
                {
                    info!("Detected same LAN, using local address: {}", peer_local);
                    return Ok((
                        SocketAddr::new(peer_local.ip(), peer.quic_port),
                        true,
                    ));
                }
            }
        }
    }

    // Use public address if available
    if let Some(public) = peer.public_addr {
        return Ok((SocketAddr::new(public.ip(), peer.quic_port), false));
    }

    // Fallback to first local address
    if let Some(local) = peer.local_addrs.first() {
        return Ok((SocketAddr::new(local.ip(), peer.quic_port), false));
    }

    Err(RendezvousError::NoPeerAddress)
}

/// Generate a random peer ID
fn generate_peer_id() -> String {
    let mut bytes = [0u8; 8];
    getrandom::getrandom(&mut bytes).expect("RNG failed");
    hex::encode(bytes)
}

/// Attempt UDP hole punching to a peer
///
/// Sends a burst of UDP packets to help establish a NAT mapping.
/// This is best-effort and may not work with all NAT types.
pub async fn attempt_hole_punch(peer_addr: SocketAddr, local_port: u16) -> Result<(), std::io::Error> {
    let socket = UdpSocket::bind(format!("0.0.0.0:{}", local_port))?;
    socket.set_nonblocking(true)?;

    // Send a burst of packets
    let punch_data = b"WORMHOLE_PUNCH";
    for i in 0..5 {
        debug!("Hole punch attempt {} to {}", i + 1, peer_addr);
        let _ = socket.send_to(punch_data, peer_addr);
        tokio::time::sleep(Duration::from_millis(100)).await;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_local_address_detection() {
        let addrs = detect_local_addresses();
        // Should detect at least one address in most environments
        // (may be empty in some CI environments)
        println!("Detected addresses: {:?}", addrs);
    }

    #[test]
    fn test_peer_id_generation() {
        let id1 = generate_peer_id();
        let id2 = generate_peer_id();

        assert_eq!(id1.len(), 16); // 8 bytes = 16 hex chars
        assert_ne!(id1, id2);
    }
}
