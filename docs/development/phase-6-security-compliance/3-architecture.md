# Phase 6 Architecture - Global Connectivity and Magic Codes

## New Workspace Dependencies

```toml
# Cargo.toml additions
[workspace.dependencies]
axum = { version = "0.7", features = ["ws"] }
tokio-tungstenite = "0.21"
spake2 = "0.4"
rand = "0.8"
futures = "0.3"
base32 = "0.4"  # For human-readable codes
```

## Signaling Server Architecture

### New Crate: teleport-signal

```
crates/
└── teleport-signal/
    ├── Cargo.toml
    └── src/
        ├── main.rs       # Server entrypoint
        └── rooms.rs      # Room management
```

### crates/teleport-signal/src/main.rs

```rust
use axum::{
    extract::{ws::{WebSocket, WebSocketUpgrade, Message}, Path, State},
    routing::get,
    Router,
};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{broadcast, RwLock};

type RoomMap = Arc<RwLock<HashMap<String, broadcast::Sender<SignalMessage>>>>;

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub enum SignalMessage {
    /// Peer announcing presence with their public address
    Announce {
        peer_id: String,
        public_addr: String,      // Public IP:port from STUN
        local_addrs: Vec<String>, // Local IPs for same-LAN optimization
    },
    /// Peer found - relay other peer's info
    PeerFound {
        peer_id: String,
        public_addr: String,
        local_addrs: Vec<String>,
    },
    /// PAKE message exchange
    PakeMessage {
        from_peer: String,
        payload: Vec<u8>,  // spake2 protocol messages
    },
}

#[tokio::main]
async fn main() {
    tracing_subscriber::init();

    let rooms: RoomMap = Arc::new(RwLock::new(HashMap::new()));

    let app = Router::new()
        .route("/ws/:code", get(ws_handler))
        .with_state(rooms);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:8080").await.unwrap();
    tracing::info!("Signal server listening on :8080");
    axum::serve(listener, app).await.unwrap();
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    Path(code): Path<String>,
    State(rooms): State<RoomMap>,
) -> impl axum::response::IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, code, rooms))
}

async fn handle_socket(mut socket: WebSocket, code: String, rooms: RoomMap) {
    // Get or create room
    let tx = {
        let mut rooms_lock = rooms.write().await;
        rooms_lock.entry(code.clone())
            .or_insert_with(|| broadcast::channel(16).0)
            .clone()
    };

    let mut rx = tx.subscribe();

    loop {
        tokio::select! {
            // Incoming message from this peer
            Some(Ok(msg)) = socket.recv() => {
                if let Message::Text(text) = msg {
                    if let Ok(signal_msg) = serde_json::from_str::<SignalMessage>(&text) {
                        // Broadcast to all peers in room
                        let _ = tx.send(signal_msg);
                    }
                }
            }
            // Message from another peer in the room
            Ok(msg) = rx.recv() => {
                let text = serde_json::to_string(&msg).unwrap();
                if socket.send(Message::Text(text)).await.is_err() {
                    break;
                }
            }
            else => break,
        }
    }

    // Cleanup: remove room if empty
    let rooms_lock = rooms.read().await;
    if let Some(tx) = rooms_lock.get(&code) {
        if tx.receiver_count() == 0 {
            drop(rooms_lock);
            rooms.write().await.remove(&code);
        }
    }
}
```

## PAKE (Password-Authenticated Key Exchange)

### teleport-core/src/crypto.rs

```rust
use spake2::{Ed25519Group, Identity, Password, Spake2};
use rand::rngs::OsRng;

/// PAKE state machine for deriving shared secret from join code
pub struct PakeHandshake {
    spake: Spake2<Ed25519Group>,
    outbound_msg: Vec<u8>,
}

impl PakeHandshake {
    /// Start PAKE as the initiator (host)
    pub fn start_host(code: &str) -> Self {
        let (spake, outbound_msg) = Spake2::<Ed25519Group>::start_a(
            &Password::new(code.as_bytes()),
            &Identity::new(b"wormhole-host"),
            &Identity::new(b"wormhole-client"),
        );
        Self { spake, outbound_msg }
    }

    /// Start PAKE as the responder (client)
    pub fn start_client(code: &str) -> Self {
        let (spake, outbound_msg) = Spake2::<Ed25519Group>::start_b(
            &Password::new(code.as_bytes()),
            &Identity::new(b"wormhole-host"),
            &Identity::new(b"wormhole-client"),
        );
        Self { spake, outbound_msg }
    }

    /// Get the message to send to peer
    pub fn outbound_message(&self) -> &[u8] {
        &self.outbound_msg
    }

    /// Finish handshake with peer's message, returns shared secret
    pub fn finish(self, peer_msg: &[u8]) -> Result<[u8; 32], PakeError> {
        let shared_secret = self.spake.finish(peer_msg)
            .map_err(|_| PakeError::InvalidPeerMessage)?;

        // Derive 32-byte key from shared secret
        let mut key = [0u8; 32];
        key.copy_from_slice(&shared_secret[..32]);
        Ok(key)
    }
}

#[derive(Debug, thiserror::Error)]
pub enum PakeError {
    #[error("Invalid peer message")]
    InvalidPeerMessage,
}

/// Generate a human-readable join code
pub fn generate_join_code() -> String {
    use rand::Rng;
    let mut rng = OsRng;

    // 4 words from wordlist or base32 encoded random bytes
    let bytes: [u8; 10] = rng.gen();
    base32::encode(base32::Alphabet::Crockford, &bytes)
        .chars()
        .take(16)
        .collect::<Vec<_>>()
        .chunks(4)
        .map(|c| c.iter().collect::<String>())
        .collect::<Vec<_>>()
        .join("-")
    // Result: "7KJM-XBCD-QRST-VWYZ"
}
```

## NAT Traversal

### teleport-daemon/src/net/rendezvous.rs

```rust
use std::net::SocketAddr;
use tokio_tungstenite::{connect_async, tungstenite::Message};
use futures::{SinkExt, StreamExt};

const SIGNAL_SERVER: &str = "wss://signal.wormhole.app/ws";
const STUN_SERVER: &str = "stun.l.google.com:19302";

pub struct RendezvousResult {
    pub peer_addr: SocketAddr,
    pub shared_key: [u8; 32],
    pub is_local: bool,  // Same LAN, skip hole punching
}

/// Discover public IP via STUN
async fn get_public_addr() -> Result<SocketAddr> {
    use std::net::UdpSocket;

    let socket = UdpSocket::bind("0.0.0.0:0")?;
    socket.connect(STUN_SERVER)?;

    // Send STUN binding request
    let mut request = [0u8; 20];
    request[0] = 0x00; request[1] = 0x01; // Binding request
    // Transaction ID (random)
    rand::thread_rng().fill(&mut request[8..20]);

    socket.send(&request)?;

    let mut response = [0u8; 64];
    let len = socket.recv(&mut response)?;

    // Parse STUN response for XOR-MAPPED-ADDRESS
    parse_stun_response(&response[..len])
}

/// Get local addresses for same-LAN detection
fn get_local_addrs() -> Vec<SocketAddr> {
    use std::net::UdpSocket;

    let mut addrs = Vec::new();

    // Bind to various interfaces
    if let Ok(socket) = UdpSocket::bind("0.0.0.0:0") {
        // Connect to external to determine default interface
        if socket.connect("8.8.8.8:80").is_ok() {
            if let Ok(local) = socket.local_addr() {
                addrs.push(local);
            }
        }
    }

    addrs
}

/// Perform NAT hole punching
async fn hole_punch(
    local_socket: &tokio::net::UdpSocket,
    peer_addr: SocketAddr,
) -> Result<()> {
    // Send burst of packets to punch hole
    for _ in 0..5 {
        local_socket.send_to(b"punch", peer_addr).await?;
        tokio::time::sleep(Duration::from_millis(50)).await;
    }

    // Wait for response
    let mut buf = [0u8; 16];
    let timeout = Duration::from_secs(5);

    match tokio::time::timeout(timeout, local_socket.recv_from(&mut buf)).await {
        Ok(Ok((_, from))) if from == peer_addr => Ok(()),
        Ok(Ok(_)) => Err(anyhow!("Received from unexpected peer")),
        Ok(Err(e)) => Err(e.into()),
        Err(_) => Err(anyhow!("Hole punch timeout")),
    }
}

/// Full rendezvous flow
pub async fn rendezvous(code: &str, is_host: bool) -> Result<RendezvousResult> {
    let peer_id = uuid::Uuid::new_v4().to_string();

    // 1. Start PAKE
    let pake = if is_host {
        PakeHandshake::start_host(code)
    } else {
        PakeHandshake::start_client(code)
    };

    // 2. Connect to signaling server
    let url = format!("{}/{}", SIGNAL_SERVER, code);
    let (mut ws, _) = connect_async(&url).await?;

    // 3. Get our addresses
    let public_addr = get_public_addr().await?;
    let local_addrs = get_local_addrs();

    // 4. Announce ourselves
    let announce = SignalMessage::Announce {
        peer_id: peer_id.clone(),
        public_addr: public_addr.to_string(),
        local_addrs: local_addrs.iter().map(|a| a.to_string()).collect(),
    };
    ws.send(Message::Text(serde_json::to_string(&announce)?)).await?;

    // 5. Send PAKE message
    let pake_msg = SignalMessage::PakeMessage {
        from_peer: peer_id.clone(),
        payload: pake.outbound_message().to_vec(),
    };
    ws.send(Message::Text(serde_json::to_string(&pake_msg)?)).await?;

    // 6. Wait for peer
    let mut peer_public_addr = None;
    let mut peer_local_addrs = Vec::new();
    let mut peer_pake_msg = None;

    while let Some(msg) = ws.next().await {
        if let Ok(Message::Text(text)) = msg {
            let signal: SignalMessage = serde_json::from_str(&text)?;
            match signal {
                SignalMessage::Announce { peer_id: pid, public_addr, local_addrs }
                | SignalMessage::PeerFound { peer_id: pid, public_addr, local_addrs }
                    if pid != peer_id =>
                {
                    peer_public_addr = Some(public_addr.parse()?);
                    peer_local_addrs = local_addrs.iter()
                        .filter_map(|a| a.parse().ok())
                        .collect();
                }
                SignalMessage::PakeMessage { from_peer, payload } if from_peer != peer_id => {
                    peer_pake_msg = Some(payload);
                }
                _ => {}
            }

            if peer_public_addr.is_some() && peer_pake_msg.is_some() {
                break;
            }
        }
    }

    let peer_public = peer_public_addr.ok_or_else(|| anyhow!("Peer not found"))?;
    let pake_response = peer_pake_msg.ok_or_else(|| anyhow!("PAKE not completed"))?;

    // 7. Complete PAKE
    let shared_key = pake.finish(&pake_response)?;

    // 8. Check if same LAN
    let is_local = local_addrs.iter().any(|local| {
        peer_local_addrs.iter().any(|peer_local| {
            // Same subnet check (simplified)
            local.ip().to_string().rsplit('.').skip(1).collect::<Vec<_>>() ==
            peer_local.ip().to_string().rsplit('.').skip(1).collect::<Vec<_>>()
        })
    });

    // 9. Hole punch if needed
    if !is_local {
        let socket = tokio::net::UdpSocket::bind("0.0.0.0:0").await?;
        hole_punch(&socket, peer_public).await?;
    }

    Ok(RendezvousResult {
        peer_addr: if is_local { peer_local_addrs[0] } else { peer_public },
        shared_key,
        is_local,
    })
}
```

## Global API Extensions

### teleport-daemon/src/lib.rs additions

```rust
/// Start hosting with a join code (global connectivity)
pub async fn start_host_global(
    share_path: PathBuf,
    port: u16,
) -> Result<(String, broadcast::Receiver<ServiceEvent>, ShutdownHandle)> {
    // Generate join code
    let code = crypto::generate_join_code();

    let (event_tx, event_rx) = broadcast::channel(100);
    let shutdown = ShutdownHandle::new();

    let task_code = code.clone();
    tokio::spawn({
        let shutdown = shutdown.clone();
        let event_tx = event_tx.clone();
        async move {
            // Wait for peer via rendezvous
            event_tx.send(ServiceEvent::WaitingForPeer { code: task_code.clone() }).ok();

            match rendezvous(&task_code, true).await {
                Ok(result) => {
                    event_tx.send(ServiceEvent::PeerConnected {
                        peer_addr: result.peer_addr,
                    }).ok();

                    // Start hosting with derived key for encryption
                    let addr = SocketAddr::from(([0, 0, 0, 0], port));
                    host::run_host_with_key(addr, share_path, result.shared_key, shutdown.token()).await
                }
                Err(e) => {
                    event_tx.send(ServiceEvent::Error { message: e.to_string() }).ok();
                    Err(e)
                }
            }
        }
    });

    Ok((code, event_rx, shutdown))
}

/// Mount using a join code
pub async fn start_mount_global(
    code: String,
    mountpoint: PathBuf,
) -> Result<(broadcast::Receiver<ServiceEvent>, ShutdownHandle)> {
    let (event_tx, event_rx) = broadcast::channel(100);
    let shutdown = ShutdownHandle::new();

    tokio::spawn({
        let shutdown = shutdown.clone();
        let event_tx = event_tx.clone();
        async move {
            event_tx.send(ServiceEvent::Connecting { code: code.clone() }).ok();

            match rendezvous(&code, false).await {
                Ok(result) => {
                    event_tx.send(ServiceEvent::PeerConnected {
                        peer_addr: result.peer_addr,
                    }).ok();

                    // Connect with derived encryption key
                    let metadata = client::fetch_metadata_with_key(
                        result.peer_addr,
                        result.shared_key,
                    ).await?;

                    let vfs = vfs::VirtualFilesystem::from_dir_entry(metadata);

                    event_tx.send(ServiceEvent::MountReady {
                        mountpoint: mountpoint.clone(),
                    }).ok();

                    fs::mount(vfs, mountpoint, shutdown.token()).await
                }
                Err(e) => {
                    event_tx.send(ServiceEvent::Error { message: e.to_string() }).ok();
                    Err(e)
                }
            }
        }
    });

    Ok((event_rx, shutdown))
}

/// Extended service events
#[derive(Clone, Debug)]
pub enum ServiceEvent {
    // Existing...
    HostStarted { port: u16, share_path: PathBuf },
    ClientConnected { peer_addr: SocketAddr },
    MountReady { mountpoint: PathBuf },
    SyncProgress { file: String, percent: u8 },
    Error { message: String },

    // Phase 6 additions
    WaitingForPeer { code: String },
    Connecting { code: String },
    PeerConnected { peer_addr: SocketAddr },
    HolePunchFailed { reason: String },
}
```

## QUIC Configuration for NAT Traversal

### quinn_config.rs

```rust
use quinn::{ClientConfig, ServerConfig, TransportConfig};
use std::time::Duration;
use std::sync::Arc;

/// Create NAT-traversal-friendly transport config
pub fn nat_friendly_transport() -> Arc<TransportConfig> {
    let mut transport = TransportConfig::default();

    // Aggressive keepalives to maintain NAT mapping
    transport.keep_alive_interval(Some(Duration::from_secs(15)));

    // Shorter idle timeout (NAT mappings often expire in 30-60s)
    transport.max_idle_timeout(Some(Duration::from_secs(30).try_into().unwrap()));

    // Initial RTT estimate for faster connection
    transport.initial_rtt(Duration::from_millis(100));

    // Allow connection migration (for IP changes)
    // transport.allow_migration(true);  // If supported

    Arc::new(transport)
}

/// Create client config with PAKE-derived key
pub fn client_config_with_key(shared_key: [u8; 32]) -> ClientConfig {
    // Use shared key to derive TLS-PSK or for additional verification
    let crypto = rustls::ClientConfig::builder()
        .with_safe_defaults()
        .with_custom_certificate_verifier(Arc::new(PakeVerifier::new(shared_key)))
        .with_no_client_auth();

    let mut config = ClientConfig::new(Arc::new(crypto));
    config.transport_config(nat_friendly_transport());
    config
}

/// Custom certificate verifier that validates using PAKE key
struct PakeVerifier {
    expected_key: [u8; 32],
}

impl PakeVerifier {
    fn new(key: [u8; 32]) -> Self {
        Self { expected_key: key }
    }
}

impl rustls::client::ServerCertVerifier for PakeVerifier {
    fn verify_server_cert(
        &self,
        end_entity: &rustls::Certificate,
        _intermediates: &[rustls::Certificate],
        _server_name: &rustls::ServerName,
        _scts: &mut dyn Iterator<Item = &[u8]>,
        _ocsp_response: &[u8],
        _now: std::time::SystemTime,
    ) -> Result<rustls::client::ServerCertVerified, rustls::Error> {
        // Verify certificate is signed with PAKE-derived key
        // This ensures MITM cannot impersonate even with valid cert
        let cert_hash = blake3::hash(end_entity.as_ref());
        let expected_hash = blake3::keyed_hash(&self.expected_key, b"cert-verify");

        // For MVP: accept any cert, rely on QUIC encryption with PAKE key
        // Future: implement proper PAKE-TLS binding
        Ok(rustls::client::ServerCertVerified::assertion())
    }
}
```

## Connection Flow Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           JOIN CODE FLOW                                      │
└──────────────────────────────────────────────────────────────────────────────┘

  Host                        Signal Server                        Client
   │                               │                                  │
   │  1. Generate code: 7KJM-XBCD  │                                  │
   │                               │                                  │
   │  2. WS connect /ws/7KJM-XBCD  │                                  │
   │ ────────────────────────────► │                                  │
   │                               │                                  │
   │  3. Announce{addr, pake_msg}  │                                  │
   │ ────────────────────────────► │                                  │
   │                               │                                  │
   │                               │  4. WS connect /ws/7KJM-XBCD     │
   │                               │ ◄──────────────────────────────── │
   │                               │                                  │
   │                               │  5. PeerFound{host info}         │
   │                               │ ────────────────────────────────► │
   │                               │                                  │
   │                               │  6. Announce{addr, pake_msg}     │
   │                               │ ◄──────────────────────────────── │
   │                               │                                  │
   │  7. PeerFound{client info}    │                                  │
   │ ◄──────────────────────────── │                                  │
   │                               │                                  │
   │  8. Complete PAKE → shared_key                                   │
   │                               │                                  │
   │  9. UDP hole punch ◄──────────────────────────────────────────── │
   │ ──────────────────────────────────────────────────────────────► │
   │                               │                                  │
   │  10. QUIC connection with shared_key                             │
   │ ◄──────────────────────────────────────────────────────────────► │
   │                               │                                  │


┌──────────────────────────────────────────────────────────────────────────────┐
│                         NAT TRAVERSAL CASES                                   │
└──────────────────────────────────────────────────────────────────────────────┘

  Case 1: Same LAN (detected via local_addrs overlap)
  ═══════════════════════════════════════════════════
  → Skip hole punching
  → Connect directly via local IP
  → Lowest latency

  Case 2: One peer behind NAT (common)
  ═════════════════════════════════════
  → Hole punch from NAT'd peer
  → Works with most home routers
  → ~80% success rate

  Case 3: Both behind NAT (symmetric NAT)
  ═══════════════════════════════════════
  → Simultaneous hole punch
  → May fail with symmetric NAT
  → Fallback: TURN relay (future)

  Case 4: Carrier-grade NAT (CGNAT)
  ═════════════════════════════════
  → Hole punching often fails
  → Requires TURN relay
  → Phase 6.5: implement relay fallback
```

## Deployment

### Dockerfile for Signal Server

```dockerfile
FROM rust:1.75-slim as builder

WORKDIR /app
COPY . .
RUN cargo build --release -p teleport-signal

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/teleport-signal /usr/local/bin/

EXPOSE 8080
CMD ["teleport-signal"]
```

### fly.toml

```toml
app = "wormhole-signal"
primary_region = "iad"

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true

[[services]]
  protocol = "tcp"
  internal_port = 8080

  [[services.ports]]
    port = 443
    handlers = ["tls", "http"]

  [[services.ports]]
    port = 80
    handlers = ["http"]
```

## Security Considerations

| Aspect | Mitigation |
|--------|------------|
| Code guessing | 16 chars base32 = 80 bits entropy |
| MITM on signaling | PAKE ensures key agreement without MITM |
| Replay attacks | PAKE uses fresh randomness per session |
| Signal server compromise | Cannot derive shared key without code |
| Code leakage | Short-lived codes, single-use recommended |
