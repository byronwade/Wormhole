//! Mesh magnet fetch — local content store, then explicit peer, then peer registry.

use std::net::SocketAddr;
use std::path::PathBuf;
use std::time::Duration;

use teleport_core::ContentHash;

use crate::client::{ClientConfig, WormholeClient};
use crate::content_store::ContentStore;
use crate::peers::PeerRegistry;

/// Fetch a content hash from a single peer via QUIC `BulkChunkRequest`.
pub async fn fetch_hash_from_addr(
    addr: SocketAddr,
    hash: ContentHash,
) -> Result<Vec<u8>, String> {
    let mut client = WormholeClient::new(ClientConfig {
        server_addr: addr,
        mount_point: PathBuf::from("/tmp"),
        request_timeout: Duration::from_secs(30),
        join_code: None,
        });
    client
        .connect()
        .await
        .map_err(|e| format!("connect {addr}: {e:?}"))?;
    client
        .fetch_bulk_chunk(hash, 0, 0)
        .await
        .map_err(|e| format!("bulk chunk from {addr}: {e:?}"))
}

/// Resolve a magnet hash from local store and/or the peer mesh.
///
/// Order:
/// 1. Local [`ContentStore`]
/// 2. Explicit `--from` address (if provided)
/// 3. [`PeerRegistry`] addresses when `also_peers` is true
///
/// On remote success, bytes are `put_verified` into the local store.
/// Returns `(data, source_description)`.
pub async fn fetch_hash_mesh(
    hash: ContentHash,
    explicit: Option<SocketAddr>,
    also_peers: bool,
) -> Result<(Vec<u8>, String), String> {
    if let Ok(store) = ContentStore::open_default() {
        if store.contains(&hash) {
            let data = store.get(&hash).map_err(|e| e.to_string())?;
            return Ok((data, "local".into()));
        }
    }

    let mut last_err = String::from("chunk not found (no local copy, no reachable peers)");

    if let Some(addr) = explicit {
        match fetch_hash_from_addr(addr, hash).await {
            Ok(data) => {
                store_verified(&hash, &data);
                return Ok((data, format!("peer {addr}")));
            }
            Err(e) => last_err = e,
        }
    }

    if also_peers {
        let registry = PeerRegistry::load().unwrap_or_default();
        for addr in registry.get_addrs() {
            if explicit == Some(addr) {
                continue;
            }
            match fetch_hash_from_addr(addr, hash).await {
                Ok(data) => {
                    store_verified(&hash, &data);
                    return Ok((data, format!("peer {addr}")));
                }
                Err(e) => last_err = e,
            }
        }
    }

    Err(last_err)
}

fn store_verified(hash: &ContentHash, data: &[u8]) {
    if let Ok(store) = ContentStore::open_default() {
        if let Err(e) = store.put_verified(hash, data) {
            tracing::warn!(error = %e, "failed to put_verified fetched chunk");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::peers::{normalize_addr, PeerRegistry};

    #[test]
    fn normalize_and_registry_smoke() {
        assert_eq!(normalize_addr("10.0.0.1").unwrap(), "10.0.0.1:4433");
        let mut reg = PeerRegistry::default();
        reg.add("127.0.0.1:9", Some("dummy".into())).unwrap();
        assert_eq!(reg.get_addrs().len(), 1);
    }

    #[test]
    fn store_verified_helper_roundtrip() {
        let dir = tempfile::TempDir::new().unwrap();
        let store = ContentStore::open(dir.path()).unwrap();
        let data = b"mesh-local-bytes";
        let hash = ContentHash::compute(data);
        store.put_verified(&hash, data).unwrap();
        assert_eq!(store.get(&hash).unwrap(), data);
    }
}
