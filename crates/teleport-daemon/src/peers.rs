//! Persistent peer registry for mesh magnet fetch.

use std::fs;
use std::net::{SocketAddr, ToSocketAddrs};
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

/// A known mesh peer (host:port) that can serve content-addressed chunks.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct PeerEntry {
    /// Peer address as `host:port`.
    pub addr: String,
    /// Optional friendly name.
    pub name: Option<String>,
    /// Whether this peer serves content-addressed chunks.
    #[serde(default = "default_true")]
    pub content_addressed: bool,
    /// When true, skipped by [`PeerRegistry::get_addrs`].
    #[serde(default)]
    pub blocked: bool,
}

fn default_true() -> bool {
    true
}

/// On-disk list of mesh peers (`peers.json`).
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct PeerRegistry {
    peers: Vec<PeerEntry>,
}

impl PeerRegistry {
    /// Default path: platform data-local dir `/peers.json`.
    pub fn default_path() -> PathBuf {
        if let Some(dirs) = directories::ProjectDirs::from("", "", "wormhole") {
            return dirs.data_local_dir().join("peers.json");
        }
        PathBuf::from("peers.json")
    }

    /// Load from the default path (empty registry if missing).
    pub fn load() -> Result<Self, String> {
        Self::load_from(&Self::default_path())
    }

    /// Load from an explicit path (used by unit tests with tempfile).
    pub fn load_from(path: &Path) -> Result<Self, String> {
        if !path.exists() {
            return Ok(Self::default());
        }
        let data = fs::read_to_string(path).map_err(|e| e.to_string())?;
        serde_json::from_str(&data).map_err(|e| e.to_string())
    }

    /// Persist to the default path.
    pub fn save(&self) -> Result<(), String> {
        self.save_to(&Self::default_path())
    }

    /// Persist to an explicit path.
    pub fn save_to(&self, path: &Path) -> Result<(), String> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let data = serde_json::to_string_pretty(self).map_err(|e| e.to_string())?;
        fs::write(path, data).map_err(|e| e.to_string())
    }

    /// All registered peers (including blocked).
    pub fn list(&self) -> &[PeerEntry] {
        &self.peers
    }

    /// Add or update a peer by address string.
    pub fn add(&mut self, addr: &str, name: Option<String>) -> Result<(), String> {
        let normalized = normalize_addr(addr)?;
        if let Some(existing) = self.peers.iter_mut().find(|p| p.addr == normalized) {
            if name.is_some() {
                existing.name = name;
            }
            return Ok(());
        }
        self.peers.push(PeerEntry {
            addr: normalized,
            name,
            content_addressed: true,
            blocked: false,
        });
        Ok(())
    }

    /// Remove a peer by address (exact or host-only match).
    pub fn remove(&mut self, addr: &str) -> Result<bool, String> {
        let normalized = normalize_addr(addr).unwrap_or_else(|_| addr.to_string());
        let before = self.peers.len();
        self.peers
            .retain(|p| p.addr != normalized && p.addr != addr);
        Ok(before != self.peers.len())
    }

    /// Find a peer by address string.
    pub fn find(&self, addr: &str) -> Option<&PeerEntry> {
        let normalized = normalize_addr(addr).unwrap_or_else(|_| addr.to_string());
        self.peers
            .iter()
            .find(|p| p.addr == normalized || p.addr == addr)
    }

    /// Resolve non-blocked peers to socket addresses.
    pub fn get_addrs(&self) -> Vec<SocketAddr> {
        let mut out = Vec::new();
        for peer in &self.peers {
            if peer.blocked {
                continue;
            }
            if let Ok(addrs) = peer.addr.to_socket_addrs() {
                out.extend(addrs);
            }
        }
        out
    }
}

/// Normalize `host`, `host:port`, or `ip:port` to `host:port` (default port 4433).
pub fn normalize_addr(s: &str) -> Result<String, String> {
    let s = s.trim();
    if s.is_empty() {
        return Err("empty peer address".into());
    }
    if let Ok(addr) = s.parse::<SocketAddr>() {
        return Ok(addr.to_string());
    }
    // host:port where port is numeric
    if let Some((host, port)) = s.rsplit_once(':') {
        if !host.is_empty() && port.parse::<u16>().is_ok() {
            return Ok(format!("{host}:{port}"));
        }
    }
    Ok(format!("{s}:4433"))
}

/// Parse a peer / `--from` string into a [`SocketAddr`] (default port 4433).
pub fn parse_peer_socket_addr(s: &str) -> Result<SocketAddr, String> {
    let normalized = normalize_addr(s)?;
    normalized
        .to_socket_addrs()
        .map_err(|e| e.to_string())?
        .next()
        .ok_or_else(|| format!("could not resolve peer address: {normalized}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn registry_roundtrip_tempfile() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("peers.json");

        let mut reg = PeerRegistry::default();
        reg.add("127.0.0.1", Some("loopback".into())).unwrap();
        reg.add("192.168.1.10:4433", None).unwrap();
        reg.save_to(&path).unwrap();

        let loaded = PeerRegistry::load_from(&path).unwrap();
        assert_eq!(loaded.list().len(), 2);
        assert_eq!(loaded.list()[0].addr, "127.0.0.1:4433");
        assert_eq!(loaded.list()[0].name.as_deref(), Some("loopback"));
        assert!(loaded.list()[0].content_addressed);

        let mut loaded = loaded;
        assert!(loaded.remove("127.0.0.1:4433").unwrap());
        loaded.save_to(&path).unwrap();
        assert_eq!(PeerRegistry::load_from(&path).unwrap().list().len(), 1);
    }

    #[test]
    fn get_addrs_skips_blocked() {
        let mut reg = PeerRegistry::default();
        reg.add("127.0.0.1:9", None).unwrap();
        reg.add("127.0.0.1:10", None).unwrap();
        reg.peers[0].blocked = true;
        let addrs = reg.get_addrs();
        assert_eq!(addrs.len(), 1);
        assert_eq!(addrs[0].port(), 10);
    }

    #[test]
    fn normalize_default_port() {
        assert_eq!(normalize_addr("10.0.0.1").unwrap(), "10.0.0.1:4433");
        assert_eq!(normalize_addr("10.0.0.1:9999").unwrap(), "10.0.0.1:9999");
    }

    #[test]
    fn parse_peer_socket() {
        let a = parse_peer_socket_addr("127.0.0.1").unwrap();
        assert_eq!(a.port(), 4433);
        let b = parse_peer_socket_addr("127.0.0.1:9").unwrap();
        assert_eq!(b.port(), 9);
    }
}
