//! Lightweight LAN peer discovery via UDP broadcast.
//!
//! Peers announce when hosting; receivers collect recent sightings for the Portal UI.
//! This complements iroh mDNS (transport layer) with a product-facing "nearby" list.

use std::collections::HashMap;
use std::net::UdpSocket;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tracing::{debug, warn};

const LAN_PORT: u16 = 41234;
const BEACON_MAGIC: &str = "wormhole-lan-v1";
const PEER_TTL: Duration = Duration::from_secs(20);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NearbyPeer {
    pub id: String,
    pub name: String,
    pub join_code: Option<String>,
    pub port: Option<u16>,
    pub last_seen_ms: u64,
    pub is_self: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Beacon {
    magic: String,
    id: String,
    name: String,
    join_code: Option<String>,
    port: Option<u16>,
}

#[derive(Clone)]
struct PeerEntry {
    peer: NearbyPeer,
    seen_at: Instant,
}

pub struct LanDiscovery {
    peers: Arc<Mutex<HashMap<String, PeerEntry>>>,
    self_id: String,
    self_name: String,
}

impl LanDiscovery {
    pub fn new() -> Self {
        let self_name = hostname::get()
            .map(|h| h.to_string_lossy().into_owned())
            .unwrap_or_else(|_| "Wormhole".into());
        let self_id = format!("local-{}", self_name);
        Self {
            peers: Arc::new(Mutex::new(HashMap::new())),
            self_id,
            self_name,
        }
    }

    pub fn self_name(&self) -> &str {
        &self.self_name
    }

    pub fn self_id(&self) -> &str {
        &self.self_id
    }

    /// Spawn background listener (best-effort; ignores bind failures).
    pub fn start_listener(&self) {
        let peers = Arc::clone(&self.peers);
        let self_id = self.self_id.clone();
        std::thread::Builder::new()
            .name("wormhole-lan-listen".into())
            .spawn(move || {
                let socket = match UdpSocket::bind(("0.0.0.0", LAN_PORT)) {
                    Ok(s) => s,
                    Err(e) => {
                        warn!("LAN listen bind failed (port {}): {}", LAN_PORT, e);
                        return;
                    }
                };
                let _ = socket.set_broadcast(true);
                let _ = socket.set_read_timeout(Some(Duration::from_secs(2)));
                let mut buf = [0u8; 2048];
                loop {
                    match socket.recv_from(&mut buf) {
                        Ok((n, _addr)) => {
                            if let Ok(beacon) = serde_json::from_slice::<Beacon>(&buf[..n]) {
                                if beacon.magic != BEACON_MAGIC || beacon.id == self_id {
                                    continue;
                                }
                                let now_ms = SystemTime::now()
                                    .duration_since(UNIX_EPOCH)
                                    .map(|d| d.as_millis() as u64)
                                    .unwrap_or(0);
                                let peer = NearbyPeer {
                                    id: beacon.id.clone(),
                                    name: beacon.name,
                                    join_code: beacon.join_code,
                                    port: beacon.port,
                                    last_seen_ms: now_ms,
                                    is_self: false,
                                };
                                if let Ok(mut map) = peers.lock() {
                                    map.insert(
                                        peer.id.clone(),
                                        PeerEntry {
                                            peer,
                                            seen_at: Instant::now(),
                                        },
                                    );
                                }
                            }
                        }
                        Err(ref e)
                            if e.kind() == std::io::ErrorKind::WouldBlock
                                || e.kind() == std::io::ErrorKind::TimedOut => {}
                        Err(e) => {
                            debug!("LAN recv error: {}", e);
                        }
                    }
                }
            })
            .ok();
    }

    /// Announce this host on the LAN while sharing (runs until aborted).
    pub fn start_announce(&self, join_code: String, port: u16) -> tokio::task::JoinHandle<()> {
        let self_id = self.self_id.clone();
        let self_name = self.self_name.clone();
        tokio::spawn(async move {
            let socket = match UdpSocket::bind("0.0.0.0:0") {
                Ok(s) => s,
                Err(e) => {
                    warn!("LAN announce bind failed: {}", e);
                    return;
                }
            };
            let _ = socket.set_broadcast(true);
            let beacon = Beacon {
                magic: BEACON_MAGIC.into(),
                id: self_id,
                name: self_name,
                join_code: Some(join_code),
                port: Some(port),
            };
            let payload = match serde_json::to_vec(&beacon) {
                Ok(p) => p,
                Err(_) => return,
            };
            loop {
                let _ = socket.send_to(&payload, ("255.255.255.255", LAN_PORT));
                tokio::time::sleep(Duration::from_secs(3)).await;
            }
        })
    }

    pub fn list_peers(&self) -> Vec<NearbyPeer> {
        let mut out = Vec::new();
        // Always include self so the Portal shows "this machine"
        let now_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        out.push(NearbyPeer {
            id: self.self_id.clone(),
            name: format!("{} (this device)", self.self_name),
            join_code: None,
            port: None,
            last_seen_ms: now_ms,
            is_self: true,
        });

        if let Ok(mut map) = self.peers.lock() {
            map.retain(|_, e| e.seen_at.elapsed() < PEER_TTL);
            for entry in map.values() {
                out.push(entry.peer.clone());
            }
        }
        out
    }
}

impl Default for LanDiscovery {
    fn default() -> Self {
        Self::new()
    }
}
