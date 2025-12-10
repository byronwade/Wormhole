//! Room management for signal server

use std::collections::HashMap;
use std::time::Instant;

use crate::messages::PeerInfo;

/// A room where peers can discover each other
pub struct Room {
    /// Join code for this room
    pub join_code: String,

    /// Connected peers
    peers: HashMap<String, Peer>,

    /// Host peer ID
    host_id: Option<String>,

    /// When the room was created (reserved for future metrics)
    #[allow(dead_code)]
    created_at: Instant,

    /// Last activity time
    last_activity: Instant,
}

/// A peer in a room
pub struct Peer {
    pub info: PeerInfo,
    pub connected_at: Instant,
}

impl Room {
    /// Create a new room
    pub fn new(join_code: String) -> Self {
        let now = Instant::now();
        Self {
            join_code,
            peers: HashMap::new(),
            host_id: None,
            created_at: now,
            last_activity: now,
        }
    }

    /// Add a peer to the room
    pub fn add_peer(&mut self, info: PeerInfo) -> Result<(), RoomError> {
        if self.peers.len() >= crate::MAX_PEERS_PER_ROOM {
            return Err(RoomError::RoomFull);
        }

        let peer_id = info.peer_id.clone();
        let is_host = info.is_host;

        self.peers.insert(
            peer_id.clone(),
            Peer {
                info,
                connected_at: Instant::now(),
            },
        );

        if is_host {
            self.host_id = Some(peer_id);
        }

        self.last_activity = Instant::now();
        Ok(())
    }

    /// Remove a peer from the room
    pub fn remove_peer(&mut self, peer_id: &str) -> Option<PeerInfo> {
        self.last_activity = Instant::now();

        if self.host_id.as_deref() == Some(peer_id) {
            self.host_id = None;
        }

        self.peers.remove(peer_id).map(|p| p.info)
    }

    /// Get peer info
    pub fn get_peer(&self, peer_id: &str) -> Option<&PeerInfo> {
        self.peers.get(peer_id).map(|p| &p.info)
    }

    /// Update peer info
    pub fn update_peer(&mut self, info: PeerInfo) -> bool {
        if let Some(peer) = self.peers.get_mut(&info.peer_id) {
            peer.info = info;
            self.last_activity = Instant::now();
            true
        } else {
            false
        }
    }

    /// Get host info
    pub fn get_host(&self) -> Option<&PeerInfo> {
        self.host_id.as_ref().and_then(|id| self.get_peer(id))
    }

    /// Get all peer IDs
    pub fn peer_ids(&self) -> Vec<String> {
        self.peers.keys().cloned().collect()
    }

    /// Get all peers
    pub fn peers(&self) -> impl Iterator<Item = &PeerInfo> {
        self.peers.values().map(|p| &p.info)
    }

    /// Number of peers in the room
    pub fn peer_count(&self) -> usize {
        self.peers.len()
    }

    /// Check if the room is empty
    pub fn is_empty(&self) -> bool {
        self.peers.is_empty()
    }

    /// Check if the room has been idle for too long
    pub fn is_idle(&self, timeout_secs: u64) -> bool {
        self.last_activity.elapsed().as_secs() > timeout_secs
    }

    /// Update last activity time
    pub fn touch(&mut self) {
        self.last_activity = Instant::now();
    }
}

/// Room errors
#[derive(Debug, Clone)]
pub enum RoomError {
    RoomFull,
    PeerNotFound,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_peer(id: &str, is_host: bool) -> PeerInfo {
        PeerInfo {
            peer_id: id.into(),
            public_addr: None,
            local_addrs: vec![],
            quic_port: 4433,
            is_host,
        }
    }

    #[test]
    fn test_room_creation() {
        let room = Room::new("ABC-123".into());
        assert_eq!(room.join_code, "ABC-123");
        assert!(room.is_empty());
        assert!(room.get_host().is_none());
    }

    #[test]
    fn test_add_remove_peer() {
        let mut room = Room::new("ABC-123".into());

        let host = make_peer("host", true);
        room.add_peer(host).unwrap();

        assert_eq!(room.peer_count(), 1);
        assert!(room.get_host().is_some());
        assert_eq!(room.get_host().unwrap().peer_id, "host");

        let client = make_peer("client", false);
        room.add_peer(client).unwrap();
        assert_eq!(room.peer_count(), 2);

        room.remove_peer("client");
        assert_eq!(room.peer_count(), 1);

        room.remove_peer("host");
        assert!(room.is_empty());
        assert!(room.get_host().is_none());
    }

    #[test]
    fn test_room_full() {
        let mut room = Room::new("ABC-123".into());

        for i in 0..crate::MAX_PEERS_PER_ROOM {
            let peer = make_peer(&format!("peer{}", i), i == 0);
            room.add_peer(peer).unwrap();
        }

        let extra = make_peer("extra", false);
        assert!(matches!(room.add_peer(extra), Err(RoomError::RoomFull)));
    }
}
