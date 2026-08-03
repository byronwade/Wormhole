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

use teleport_core::crypto::{
    decode_certpin_relay, decode_pake_relay, encode_certpin_relay, encode_pake_relay, PakeHandshake,
};
use teleport_signal::{PeerInfo, SignalMessage};

/// Default signal server URL
pub const DEFAULT_SIGNAL_SERVER: &str = "wss://wormhole-signal.fly.dev";

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
    /// Host TLS cert fingerprint authenticated via SPAKE2 (client-side pin).
    pub cert_fingerprint: Option<[u8; 32]>,
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
    /// Cert-pin MAC failed or was missing when required
    CertPinFailed,
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
            RendezvousError::CertPinFailed => {
                write!(f, "Certificate pin verification failed")
            }
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
    /// performs PAKE handshake, optionally binds the TLS cert fingerprint,
    /// and returns the peer's address.
    pub async fn host(
        &self,
        join_code: &str,
        cert_fingerprint: Option<[u8; 32]>,
    ) -> Result<RendezvousResult, RendezvousError> {
        info!("Starting host rendezvous with code: {}", join_code);

        // Connect to signal server
        let mut ws = self.connect_ws().await?;

        // Create our peer info with local addresses
        let my_info = PeerInfo {
            peer_id: generate_peer_id(),
            public_addr: None, // Server will fill this
            local_addrs: self.local_addrs.clone(),
            quic_port: QUIC_PORT,
            is_host: true,
        };

        info!("Creating room with local addresses: {:?}", self.local_addrs);

        // Create room with peer info included
        let create_msg = SignalMessage::CreateRoom {
            join_code: Some(join_code.to_string()),
            peer_info: Some(my_info),
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
        let pake_msg = encode_pake_relay(pake.outbound_message());

        // Wait for client to join
        info!("Waiting for peer to connect...");
        let peer_result = timeout(
            DISCOVERY_TIMEOUT,
            self.wait_for_peer(&mut ws, pake, &pake_msg, &actual_code, cert_fingerprint),
        )
        .await;

        match peer_result {
            Ok(Ok(result)) => Ok(result),
            Ok(Err(e)) => Err(e),
            Err(_) => Err(RendezvousError::Timeout),
        }
    }

    /// Connect to a host using a join code
    ///
    /// Connects to signal server, joins the room, performs real PAKE over Relay,
    /// verifies the host's authenticated cert pin, and returns the host address.
    pub async fn connect(&self, join_code: &str) -> Result<RendezvousResult, RendezvousError> {
        info!("Starting client rendezvous with code: {}", join_code);

        // Connect to signal server
        let mut ws = self.connect_ws().await?;

        let my_info = PeerInfo {
            peer_id: generate_peer_id(),
            public_addr: None,
            local_addrs: self.local_addrs.clone(),
            quic_port: QUIC_PORT,
            is_host: false,
        };

        // Join room (include local addrs for LAN selection on the host)
        let join_msg = SignalMessage::JoinRoom {
            join_code: join_code.to_string(),
            peer_info: Some(my_info),
        };
        self.send_message(&mut ws, &join_msg).await?;

        // Wait for join confirmation
        let response = self.recv_message(&mut ws).await?;
        let (room_code, host_info) = match response {
            SignalMessage::JoinedRoom {
                join_code,
                host_info,
            } => (join_code, host_info),
            SignalMessage::Error { message, .. } => {
                return Err(RendezvousError::ServerError(message));
            }
            _ => return Err(RendezvousError::ServerError("Unexpected response".into())),
        };

        let host = host_info.ok_or(RendezvousError::NoPeerAddress)?;
        let host_peer_id = host.peer_id.clone();
        let (peer_addr, is_local) = select_best_address(&host, &self.local_addrs)?;

        info!(
            "Joined room {}, host {} at {} (local: {}) — starting PAKE",
            room_code, host_peer_id, peer_addr, is_local
        );

        // Real SPAKE2 as client; wait for host's PAKE then cert-pin over Relay.
        let pake = PakeHandshake::start_client(&room_code);
        let client_pake_wire = encode_pake_relay(pake.outbound_message());

        let handshake = timeout(
            DISCOVERY_TIMEOUT,
            self.complete_client_handshake(&mut ws, pake, &client_pake_wire, &host_peer_id),
        )
        .await;

        let (shared_key, cert_fingerprint) = match handshake {
            Ok(Ok(v)) => v,
            Ok(Err(e)) => return Err(e),
            Err(_) => return Err(RendezvousError::Timeout),
        };

        info!(
            "Rendezvous complete, connecting to {} (local: {}, pinned: {})",
            peer_addr,
            is_local,
            cert_fingerprint.is_some()
        );

        Ok(RendezvousResult {
            peer_addr,
            shared_key,
            is_local,
            join_code: room_code,
            cert_fingerprint,
        })
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

        ws.send(Message::text(json))
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
                    let msg = SignalMessage::from_json(text.as_str())
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

    /// Wait for a peer to connect and complete PAKE + optional cert-pin exchange
    async fn wait_for_peer(
        &self,
        ws: &mut WebSocketStream<MaybeTlsStream<TcpStream>>,
        pake: PakeHandshake,
        pake_msg: &str,
        join_code: &str,
        cert_fingerprint: Option<[u8; 32]>,
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

                    // Wait for their PAKE response
                    let shared_key = loop {
                        match self.recv_message(ws).await? {
                            SignalMessage::Relayed { payload, .. } => {
                                let peer_pake = decode_pake_relay(&payload)
                                    .or_else(|| hex::decode(&payload).ok())
                                    .ok_or(RendezvousError::PakeFailed)?;
                                break pake
                                    .finish(&peer_pake)
                                    .map_err(|_| RendezvousError::PakeFailed)?;
                            }
                            SignalMessage::Ping { timestamp } => {
                                self.send_message(ws, &SignalMessage::Pong { timestamp })
                                    .await?;
                            }
                            SignalMessage::Error { message, .. } => {
                                return Err(RendezvousError::ServerError(message));
                            }
                            other => {
                                debug!("Ignoring while awaiting PAKE reply: {:?}", other);
                            }
                        }
                    };

                    // Bind TLS cert fingerprint to the SPAKE2 shared key.
                    if let Some(fp) = cert_fingerprint {
                        let pin_payload = encode_certpin_relay(&shared_key, &fp);
                        self.send_message(
                            ws,
                            &SignalMessage::Relay {
                                to_peer_id: peer_id.clone(),
                                payload: pin_payload,
                            },
                        )
                        .await?;
                    }

                    let (peer_addr, is_local) = select_best_address(&info, &self.local_addrs)?;

                    return Ok(RendezvousResult {
                        peer_addr,
                        shared_key,
                        is_local,
                        join_code: join_code.to_string(),
                        cert_fingerprint,
                    });
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

    /// Client-side: finish SPAKE2 over Relay, then verify host cert pin.
    async fn complete_client_handshake(
        &self,
        ws: &mut WebSocketStream<MaybeTlsStream<TcpStream>>,
        pake: PakeHandshake,
        client_pake_wire: &str,
        host_peer_id: &str,
    ) -> Result<([u8; 32], Option<[u8; 32]>), RendezvousError> {
        // Phase 1: SPAKE2
        let shared_key = loop {
            match self.recv_message(ws).await? {
                SignalMessage::Relayed { payload, .. } => {
                    let host_pake = decode_pake_relay(&payload)
                        .or_else(|| hex::decode(&payload).ok())
                        .ok_or(RendezvousError::PakeFailed)?;
                    let key = pake
                        .finish(&host_pake)
                        .map_err(|_| RendezvousError::PakeFailed)?;

                    self.send_message(
                        ws,
                        &SignalMessage::Relay {
                            to_peer_id: host_peer_id.to_string(),
                            payload: client_pake_wire.to_string(),
                        },
                    )
                    .await?;
                    break key;
                }
                SignalMessage::Ping { timestamp } => {
                    self.send_message(ws, &SignalMessage::Pong { timestamp })
                        .await?;
                }
                SignalMessage::Error { message, .. } => {
                    return Err(RendezvousError::ServerError(message));
                }
                other => {
                    debug!("Ignoring during client PAKE: {:?}", other);
                }
            }
        };

        // Phase 2: authenticated cert pin (brief wait; optional if host skipped)
        const CERTPIN_WAIT: Duration = Duration::from_secs(5);
        let pin_result = timeout(CERTPIN_WAIT, async {
            loop {
                match self.recv_message(ws).await? {
                    SignalMessage::Relayed { payload, .. } => {
                        if let Some(fp) = decode_certpin_relay(&shared_key, &payload) {
                            return Ok::<_, RendezvousError>(Some(fp));
                        }
                        // Wrong MAC under our key → MITM attempt
                        if payload.starts_with(teleport_core::crypto::RELAY_CERTPIN_PREFIX) {
                            return Err(RendezvousError::CertPinFailed);
                        }
                        debug!("Ignoring post-PAKE relay payload");
                    }
                    SignalMessage::Ping { timestamp } => {
                        self.send_message(ws, &SignalMessage::Pong { timestamp })
                            .await?;
                    }
                    SignalMessage::Error { message, .. } => {
                        return Err(RendezvousError::ServerError(message));
                    }
                    other => {
                        debug!("Ignoring during cert-pin wait: {:?}", other);
                    }
                }
            }
        })
        .await;

        match pin_result {
            Ok(Ok(fp)) => Ok((shared_key, fp)),
            Ok(Err(e)) => Err(e),
            Err(_) => {
                // Host did not send a pin (legacy / no TLS identity on signal path)
                Ok((shared_key, None))
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
                    return Ok((SocketAddr::new(peer_local.ip(), peer.quic_port), true));
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
///
/// # Panics
/// Panics if the system random number generator fails (extremely rare).
fn generate_peer_id() -> String {
    try_generate_peer_id().expect("RNG failed - system entropy source unavailable")
}

/// Try to generate a random peer ID, returning an error if RNG fails
fn try_generate_peer_id() -> Result<String, getrandom::Error> {
    let mut bytes = [0u8; 8];
    getrandom::fill(&mut bytes)?;
    Ok(hex::encode(bytes))
}

/// Attempt UDP hole punching to a peer
///
/// Sends a burst of UDP packets to help establish a NAT mapping.
/// This is best-effort and may not work with all NAT types.
pub async fn attempt_hole_punch(
    peer_addr: SocketAddr,
    local_port: u16,
) -> Result<(), std::io::Error> {
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
    use teleport_core::crypto::{encode_certpin_relay, encode_pake_relay, PakeHandshake};

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

    #[test]
    fn pake_relay_roundtrip_matches_direct_handshake() {
        let code = "TEST-CODE-1234";
        let host = PakeHandshake::start_host(code);
        let client = PakeHandshake::start_client(code);

        let host_wire = encode_pake_relay(host.outbound_message());
        let client_wire = encode_pake_relay(client.outbound_message());

        let host_bytes = decode_pake_relay(&host_wire).expect("host pake wire");
        let client_bytes = decode_pake_relay(&client_wire).expect("client pake wire");

        let host_key = host.finish(&client_bytes).expect("host finish");
        let client_key = client.finish(&host_bytes).expect("client finish");
        assert_eq!(host_key, client_key);

        let fp = [7u8; 32];
        let pin = encode_certpin_relay(&host_key, &fp);
        assert_eq!(decode_certpin_relay(&client_key, &pin), Some(fp));
        assert!(decode_certpin_relay(&[0u8; 32], &pin).is_none());
    }
}
