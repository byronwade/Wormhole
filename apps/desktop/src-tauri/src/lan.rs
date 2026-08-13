//! LAN peer discovery inspired by LocalSend's multicast discovery model.
//!
//! Goals (adapted for Wormhole mounts, not file push):
//! - Zero-config same-Wi‑Fi presence (no internet / no signal server)
//! - Stable device fingerprint to avoid self-discovery and remember peers
//! - Rich peer cards: alias, device type/model, IP, sharing state
//! - Announce + unicast response (LocalSend §3.1 pattern)
//! - Multicast + broadcast so locked-down networks still see peers
//!
//! Complements iroh mDNS (transport) with a product-facing "Nearby" list.

use std::collections::HashMap;
use std::fs;
use std::net::{Ipv4Addr, SocketAddr, UdpSocket};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tracing::{debug, warn};

/// Product discovery port (separate from QUIC data port 4433).
pub const LAN_PORT: u16 = 41234;
/// Same default multicast group LocalSend uses (Android-friendly 224.0.0.0/24).
const MULTICAST_ADDR: Ipv4Addr = Ipv4Addr::new(224, 0, 0, 167);
const BEACON_MAGIC_V2: &str = "wormhole-lan-v2";
const BEACON_MAGIC_V1: &str = "wormhole-lan-v1";
const PROTOCOL_VERSION: &str = "1.0";
const PEER_TTL: Duration = Duration::from_secs(25);
const ANNOUNCE_INTERVAL: Duration = Duration::from_secs(3);

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum DeviceType {
    Desktop,
    Mobile,
    Headless,
    Server,
    Unknown,
}

impl Default for DeviceType {
    fn default() -> Self {
        Self::Desktop
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NearbyPeer {
    pub id: String,
    pub name: String,
    pub join_code: Option<String>,
    pub port: Option<u16>,
    pub last_seen_ms: u64,
    pub is_self: bool,
    /// Stable fingerprint (LocalSend-style).
    #[serde(default)]
    pub fingerprint: String,
    #[serde(default)]
    pub device_type: DeviceType,
    #[serde(default)]
    pub device_model: Option<String>,
    /// Address that sent the last beacon (for direct LAN mount).
    #[serde(default)]
    pub ip: Option<String>,
    /// True when the peer is actively hosting a share.
    #[serde(default)]
    pub sharing: bool,
    #[serde(default)]
    pub protocol_version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Beacon {
    magic: String,
    #[serde(default = "default_protocol_version")]
    version: String,
    /// Stable id / fingerprint.
    id: String,
    #[serde(alias = "alias")]
    name: String,
    #[serde(default)]
    fingerprint: Option<String>,
    join_code: Option<String>,
    port: Option<u16>,
    #[serde(default)]
    device_type: Option<DeviceType>,
    #[serde(default)]
    device_model: Option<String>,
    /// LocalSend: only respond when announce == true.
    #[serde(default = "default_true")]
    announce: bool,
    #[serde(default)]
    sharing: bool,
}

fn default_protocol_version() -> String {
    PROTOCOL_VERSION.into()
}

fn default_true() -> bool {
    true
}

#[derive(Clone)]
struct PeerEntry {
    peer: NearbyPeer,
    seen_at: Instant,
}

#[derive(Clone)]
struct ShareAnnounce {
    join_code: String,
    port: u16,
}

pub struct LanDiscovery {
    peers: Arc<Mutex<HashMap<String, PeerEntry>>>,
    share: Arc<Mutex<Option<ShareAnnounce>>>,
    self_id: String,
    self_name: String,
    fingerprint: String,
    device_type: DeviceType,
    device_model: String,
}

impl LanDiscovery {
    pub fn new() -> Self {
        let self_name = hostname::get()
            .map(|h| h.to_string_lossy().into_owned())
            .unwrap_or_else(|_| "Wormhole".into());
        let fingerprint = load_or_create_fingerprint();
        let self_id = fingerprint.clone();
        let device_model = std::env::consts::OS.to_string();
        Self {
            peers: Arc::new(Mutex::new(HashMap::new())),
            share: Arc::new(Mutex::new(None)),
            self_id,
            self_name,
            fingerprint,
            device_type: DeviceType::Desktop,
            device_model,
        }
    }

    pub fn self_name(&self) -> &str {
        &self.self_name
    }

    pub fn self_id(&self) -> &str {
        &self.self_id
    }

    pub fn fingerprint(&self) -> &str {
        &self.fingerprint
    }

    /// Background multicast/broadcast listener + response to announces.
    pub fn start_listener(&self) {
        let peers = Arc::clone(&self.peers);
        let share = Arc::clone(&self.share);
        let self_id = self.self_id.clone();
        let self_name = self.self_name.clone();
        let fingerprint = self.fingerprint.clone();
        let device_type = self.device_type;
        let device_model = self.device_model.clone();

        std::thread::Builder::new()
            .name("wormhole-lan-listen".into())
            .spawn(move || {
                let socket = match bind_discovery_socket() {
                    Ok(s) => s,
                    Err(e) => {
                        warn!("LAN listen bind failed (port {}): {}", LAN_PORT, e);
                        return;
                    }
                };
                let _ = socket.set_broadcast(true);
                let _ = socket.set_multicast_loop_v4(true);
                if let Err(e) = socket.join_multicast_v4(&MULTICAST_ADDR, &Ipv4Addr::UNSPECIFIED) {
                    debug!("LAN multicast join skipped: {}", e);
                }
                let _ = socket.set_read_timeout(Some(Duration::from_secs(2)));
                let mut buf = [0u8; 4096];
                loop {
                    match socket.recv_from(&mut buf) {
                        Ok((n, from)) => {
                            let Ok(beacon) = serde_json::from_slice::<Beacon>(&buf[..n]) else {
                                continue;
                            };
                            if !is_wormhole_beacon(&beacon.magic) {
                                continue;
                            }
                            let peer_fp = beacon
                                .fingerprint
                                .clone()
                                .unwrap_or_else(|| beacon.id.clone());
                            if peer_fp == self_id || beacon.id == self_id {
                                continue;
                            }
                            ingest_beacon(&peers, beacon.clone(), from);
                            // LocalSend: reply only when the peer is announcing.
                            if beacon.announce {
                                let reply_share = share.lock().ok().and_then(|g| g.clone());
                                let reply = Beacon {
                                    magic: BEACON_MAGIC_V2.into(),
                                    version: PROTOCOL_VERSION.into(),
                                    id: self_id.clone(),
                                    name: self_name.clone(),
                                    fingerprint: Some(fingerprint.clone()),
                                    join_code: reply_share.as_ref().map(|s| s.join_code.clone()),
                                    port: reply_share.as_ref().map(|s| s.port),
                                    device_type: Some(device_type),
                                    device_model: Some(device_model.clone()),
                                    announce: false,
                                    sharing: reply_share.is_some(),
                                };
                                if let Ok(payload) = serde_json::to_vec(&reply) {
                                    let _ = socket.send_to(&payload, from);
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

    /// Always-on presence (LocalSend starts discovery at app launch).
    pub fn start_presence(&self) {
        let this_id = self.self_id.clone();
        let this_name = self.self_name.clone();
        let fingerprint = self.fingerprint.clone();
        let device_type = self.device_type;
        let device_model = self.device_model.clone();
        let share = Arc::clone(&self.share);
        std::thread::Builder::new()
            .name("wormhole-lan-presence".into())
            .spawn(move || {
                let socket = match UdpSocket::bind("0.0.0.0:0") {
                    Ok(s) => s,
                    Err(e) => {
                        warn!("LAN presence bind failed: {}", e);
                        return;
                    }
                };
                let _ = socket.set_broadcast(true);
                loop {
                    let share_state = share.lock().ok().and_then(|g| g.clone());
                    let beacon = Beacon {
                        magic: BEACON_MAGIC_V2.into(),
                        version: PROTOCOL_VERSION.into(),
                        id: this_id.clone(),
                        name: this_name.clone(),
                        fingerprint: Some(fingerprint.clone()),
                        join_code: share_state.as_ref().map(|s| s.join_code.clone()),
                        port: share_state.as_ref().map(|s| s.port),
                        device_type: Some(device_type),
                        device_model: Some(device_model.clone()),
                        announce: true,
                        sharing: share_state.is_some(),
                    };
                    if let Ok(payload) = serde_json::to_vec(&beacon) {
                        let _ = socket.send_to(&payload, (MULTICAST_ADDR, LAN_PORT));
                        let _ = socket.send_to(&payload, (Ipv4Addr::BROADCAST, LAN_PORT));
                    }
                    std::thread::sleep(ANNOUNCE_INTERVAL);
                }
            })
            .ok();
    }

    /// Mark this device as hosting (join code appears in presence beacons).
    ///
    /// Returns a join handle kept for compatibility with older abort wiring.
    /// Call [`Self::stop_announce`] when the share ends (abort alone is not enough).
    pub fn start_announce(&self, join_code: String, port: u16) -> tokio::task::JoinHandle<()> {
        if let Ok(mut g) = self.share.lock() {
            *g = Some(ShareAnnounce { join_code, port });
        }
        tokio::spawn(async {
            // Compatibility placeholder — presence task publishes share state.
            std::future::pending::<()>().await;
        })
    }

    /// Clear active share from LAN beacons (back to presence-only).
    pub fn stop_announce(&self) {
        if let Ok(mut g) = self.share.lock() {
            *g = None;
        }
    }

    pub fn list_peers(&self) -> Vec<NearbyPeer> {
        let mut out = Vec::new();
        let now_ms = now_epoch_ms();
        let share = self.share.lock().ok().and_then(|g| g.clone());
        out.push(NearbyPeer {
            id: self.self_id.clone(),
            name: format!("{} (this device)", self.self_name),
            join_code: share.as_ref().map(|s| s.join_code.clone()),
            port: share.as_ref().map(|s| s.port),
            last_seen_ms: now_ms,
            is_self: true,
            fingerprint: self.fingerprint.clone(),
            device_type: self.device_type,
            device_model: Some(self.device_model.clone()),
            ip: None,
            sharing: share.is_some(),
            protocol_version: Some(PROTOCOL_VERSION.into()),
        });

        if let Ok(mut map) = self.peers.lock() {
            map.retain(|_, e| e.seen_at.elapsed() < PEER_TTL);
            for entry in map.values() {
                out.push(entry.peer.clone());
            }
        }
        out.sort_by(|a, b| {
            b.sharing
                .cmp(&a.sharing)
                .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
        });
        out
    }
}

impl Default for LanDiscovery {
    fn default() -> Self {
        Self::new()
    }
}

fn is_wormhole_beacon(magic: &str) -> bool {
    magic == BEACON_MAGIC_V2 || magic == BEACON_MAGIC_V1
}

fn now_epoch_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn ingest_beacon(peers: &Arc<Mutex<HashMap<String, PeerEntry>>>, beacon: Beacon, from: SocketAddr) {
    let now_ms = now_epoch_ms();
    let fingerprint = beacon
        .fingerprint
        .clone()
        .unwrap_or_else(|| beacon.id.clone());
    let peer = NearbyPeer {
        id: fingerprint.clone(),
        name: beacon.name,
        join_code: beacon.join_code,
        port: beacon.port,
        last_seen_ms: now_ms,
        is_self: false,
        fingerprint,
        device_type: beacon.device_type.unwrap_or_default(),
        device_model: beacon.device_model,
        ip: Some(from.ip().to_string()),
        sharing: beacon.sharing || beacon.port.is_some(),
        protocol_version: Some(beacon.version),
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

fn bind_discovery_socket() -> std::io::Result<UdpSocket> {
    UdpSocket::bind(("0.0.0.0", LAN_PORT))
}

fn fingerprint_path() -> PathBuf {
    let base = dirs_next_config();
    base.join("wormhole").join("device_fingerprint")
}

fn dirs_next_config() -> PathBuf {
    if let Some(p) = std::env::var_os("XDG_CONFIG_HOME") {
        return PathBuf::from(p);
    }
    if let Some(home) = std::env::var_os("HOME") {
        return PathBuf::from(home).join(".config");
    }
    if let Some(appdata) = std::env::var_os("APPDATA") {
        return PathBuf::from(appdata);
    }
    std::env::temp_dir()
}

fn load_or_create_fingerprint() -> String {
    let path = fingerprint_path();
    if let Ok(existing) = fs::read_to_string(&path) {
        let trimmed = existing.trim();
        if trimmed.len() >= 16 {
            return trimmed.to_string();
        }
    }
    let fresh = format!("wh-{}", random_hex(16));
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let _ = fs::write(&path, &fresh);
    fresh
}

fn random_hex(bytes: usize) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    SystemTime::now().hash(&mut hasher);
    std::process::id().hash(&mut hasher);
    hostname::get().ok().hash(&mut hasher);
    let mut out = String::with_capacity(bytes * 2);
    let mut state = hasher.finish();
    for _ in 0..bytes {
        state = state
            .wrapping_mul(6364136223846793005)
            .wrapping_add(1);
        out.push_str(&format!("{:02x}", (state >> 56) as u8));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn beacon_roundtrip_v2() {
        let beacon = Beacon {
            magic: BEACON_MAGIC_V2.into(),
            version: PROTOCOL_VERSION.into(),
            id: "wh-abc".into(),
            name: "Studio Mac".into(),
            fingerprint: Some("wh-abc".into()),
            join_code: Some("WORM-TEST".into()),
            port: Some(4433),
            device_type: Some(DeviceType::Desktop),
            device_model: Some("macos".into()),
            announce: true,
            sharing: true,
        };
        let bytes = serde_json::to_vec(&beacon).expect("serialize");
        let decoded: Beacon = serde_json::from_slice(&bytes).expect("decode");
        assert_eq!(decoded.magic, BEACON_MAGIC_V2);
        assert_eq!(decoded.join_code.as_deref(), Some("WORM-TEST"));
        assert!(decoded.sharing);
    }

    #[test]
    fn accepts_v1_magic() {
        assert!(is_wormhole_beacon(BEACON_MAGIC_V1));
        assert!(is_wormhole_beacon(BEACON_MAGIC_V2));
        assert!(!is_wormhole_beacon("localsend"));
    }

    #[test]
    fn v1_beacon_still_parses() {
        let raw = r#"{"magic":"wormhole-lan-v1","id":"local-x","name":"Old","join_code":"ABC","port":4433}"#;
        let decoded: Beacon = serde_json::from_str(raw).expect("v1");
        assert_eq!(decoded.name, "Old");
        assert!(decoded.announce);
    }
}
