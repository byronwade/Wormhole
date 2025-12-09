//! Signal protocol messages

use serde::{Deserialize, Serialize};
use std::net::SocketAddr;

/// Messages sent over the signaling WebSocket
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum SignalMessage {
    /// Host creates a room
    CreateRoom {
        /// Optional preferred join code
        join_code: Option<String>,
    },

    /// Room created successfully
    RoomCreated { join_code: String },

    /// Client joins a room
    JoinRoom { join_code: String },

    /// Successfully joined room
    JoinedRoom {
        join_code: String,
        host_info: Option<PeerInfo>,
    },

    /// Peer connection info for NAT traversal
    PeerInfo(PeerInfo),

    /// Relay a message to a peer
    Relay { to_peer_id: String, payload: String },

    /// Relayed message from another peer
    Relayed {
        from_peer_id: String,
        payload: String,
    },

    /// Peer connected to the room
    PeerConnected { peer_id: String, info: PeerInfo },

    /// Peer disconnected from the room
    PeerDisconnected { peer_id: String },

    /// Leave the current room
    LeaveRoom,

    /// Error response
    Error { code: ErrorCode, message: String },

    /// Ping for keepalive
    Ping { timestamp: u64 },

    /// Pong response
    Pong { timestamp: u64 },
}

/// Peer connection information
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PeerInfo {
    /// Unique peer identifier
    pub peer_id: String,

    /// Peer's public address (as seen by signal server)
    pub public_addr: Option<SocketAddr>,

    /// Peer's local addresses (for LAN detection)
    pub local_addrs: Vec<SocketAddr>,

    /// QUIC port the peer is listening on
    pub quic_port: u16,

    /// Whether this peer is the host
    pub is_host: bool,
}

/// Error codes
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCode {
    /// Room not found
    RoomNotFound,

    /// Room is full
    RoomFull,

    /// Invalid join code
    InvalidJoinCode,

    /// Already in a room
    AlreadyInRoom,

    /// Not in a room
    NotInRoom,

    /// Rate limited
    RateLimited,

    /// Internal server error
    InternalError,
}

impl SignalMessage {
    /// Create an error message
    pub fn error(code: ErrorCode, message: impl Into<String>) -> Self {
        Self::Error {
            code,
            message: message.into(),
        }
    }

    /// Parse from JSON
    pub fn from_json(json: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_str(json)
    }

    /// Serialize to JSON
    pub fn to_json(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string(self)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_message_serialization() {
        let msg = SignalMessage::CreateRoom {
            join_code: Some("ABC-123".into()),
        };

        let json = msg.to_json().unwrap();
        assert!(json.contains("create_room"));
        assert!(json.contains("ABC-123"));

        let parsed: SignalMessage = SignalMessage::from_json(&json).unwrap();
        match parsed {
            SignalMessage::CreateRoom { join_code } => {
                assert_eq!(join_code, Some("ABC-123".into()));
            }
            _ => panic!("wrong message type"),
        }
    }

    #[test]
    fn test_peer_info_serialization() {
        let info = PeerInfo {
            peer_id: "abc123".into(),
            public_addr: Some("1.2.3.4:5678".parse().unwrap()),
            local_addrs: vec!["192.168.1.100:5678".parse().unwrap()],
            quic_port: 4433,
            is_host: true,
        };

        let msg = SignalMessage::PeerInfo(info);
        let json = msg.to_json().unwrap();

        let parsed: SignalMessage = SignalMessage::from_json(&json).unwrap();
        match parsed {
            SignalMessage::PeerInfo(i) => {
                assert_eq!(i.peer_id, "abc123");
                assert!(i.is_host);
            }
            _ => panic!("wrong message type"),
        }
    }

    #[test]
    fn test_error_message() {
        let msg = SignalMessage::error(ErrorCode::RoomNotFound, "Room ABC-123 not found");
        let json = msg.to_json().unwrap();

        assert!(json.contains("error"));
        assert!(json.contains("room_not_found"));
    }
}
