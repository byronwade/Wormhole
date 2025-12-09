//! Wire protocol definitions
//!
//! All network messages are defined here. Messages are serialized with bincode
//! and prefixed with a 4-byte little-endian length.

use serde::{Deserialize, Serialize};

use crate::types::{ChunkId, DirEntry, FileAttr, Inode, LockToken, LockType};
use crate::error::ErrorCode;

/// All possible network messages
#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum NetMessage {
    // Handshake
    Hello(HelloMessage),
    HelloAck(HelloAckMessage),

    // Metadata
    ListDir(ListDirRequest),
    ListDirResponse(ListDirResponse),
    GetAttr(GetAttrRequest),
    GetAttrResponse(GetAttrResponse),
    Lookup(LookupRequest),
    LookupResponse(LookupResponse),

    // Data
    ReadChunk(ReadChunkRequest),
    ReadChunkResponse(ReadChunkResponse),

    // Write (Phase 7)
    WriteChunk(WriteChunkRequest),
    WriteChunkResponse(WriteChunkResponse),

    // Locking (Phase 7)
    AcquireLock(LockRequest),
    AcquireLockResponse(LockResponse),
    ReleaseLock(ReleaseRequest),
    ReleaseLockResponse(ReleaseResponse),

    // Control
    Ping(PingMessage),
    Pong(PongMessage),
    Error(ErrorMessage),
    Goodbye(GoodbyeMessage),

    // Cache invalidation
    Invalidate(InvalidateMessage),
}

// === Handshake Messages ===

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct HelloMessage {
    pub protocol_version: u32,
    pub client_id: [u8; 16],
    pub capabilities: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct HelloAckMessage {
    pub protocol_version: u32,
    pub session_id: [u8; 16],
    pub root_inode: Inode,
    pub host_name: String,
    pub capabilities: Vec<String>,
}

// === Metadata Messages ===

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ListDirRequest {
    pub inode: Inode,
    pub offset: u64,
    pub limit: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ListDirResponse {
    pub entries: Vec<DirEntry>,
    pub has_more: bool,
    pub next_offset: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct GetAttrRequest {
    pub inode: Inode,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct GetAttrResponse {
    pub attr: Option<FileAttr>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LookupRequest {
    pub parent: Inode,
    pub name: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LookupResponse {
    pub attr: Option<FileAttr>,
}

// === Data Messages ===

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ReadChunkRequest {
    pub chunk_id: ChunkId,
    pub priority: u8,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ReadChunkResponse {
    pub chunk_id: ChunkId,
    pub data: Vec<u8>,
    pub checksum: [u8; 32],
    pub is_final: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WriteChunkRequest {
    pub chunk_id: ChunkId,
    pub data: Vec<u8>,
    pub checksum: [u8; 32],
    pub lock_token: LockToken,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WriteChunkResponse {
    pub chunk_id: ChunkId,
    pub success: bool,
    pub new_size: Option<u64>,
}

// === Lock Messages ===

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LockRequest {
    pub inode: Inode,
    pub lock_type: LockType,
    pub timeout_ms: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LockResponse {
    pub granted: bool,
    pub token: Option<LockToken>,
    pub holder: Option<String>,
    pub retry_after_ms: Option<u32>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ReleaseRequest {
    pub token: LockToken,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ReleaseResponse {
    pub success: bool,
}

// === Control Messages ===

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PingMessage {
    pub timestamp: u64,
    pub payload: [u8; 8],
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PongMessage {
    pub client_timestamp: u64,
    pub server_timestamp: u64,
    pub payload: [u8; 8],
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ErrorMessage {
    pub code: ErrorCode,
    pub message: String,
    pub related_inode: Option<Inode>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct GoodbyeMessage {
    pub reason: DisconnectReason,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
pub enum DisconnectReason {
    ClientShutdown,
    HostShutdown,
    IdleTimeout,
    ProtocolError,
    AuthenticationFailed,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct InvalidateMessage {
    pub inodes: Vec<Inode>,
    pub reason: InvalidateReason,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
pub enum InvalidateReason {
    Modified,
    Deleted,
    Renamed,
    AttributeChanged,
}

// === Serialization ===

/// Serialize a message with length prefix
pub fn serialize_message(msg: &NetMessage) -> Result<Vec<u8>, bincode::Error> {
    let payload = bincode::serialize(msg)?;
    let len = payload.len() as u32;

    let mut result = Vec::with_capacity(4 + payload.len());
    result.extend_from_slice(&len.to_le_bytes());
    result.extend_from_slice(&payload);

    Ok(result)
}

/// Deserialize a message (without length prefix)
pub fn deserialize_message(data: &[u8]) -> Result<NetMessage, bincode::Error> {
    bincode::deserialize(data)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_roundtrip_hello() {
        let msg = NetMessage::Hello(HelloMessage {
            protocol_version: 1,
            client_id: [1; 16],
            capabilities: vec!["read".into()],
        });

        let bytes = serialize_message(&msg).unwrap();
        assert!(bytes.len() > 4);

        // Skip length prefix
        let payload = &bytes[4..];
        let decoded: NetMessage = deserialize_message(payload).unwrap();

        match decoded {
            NetMessage::Hello(h) => {
                assert_eq!(h.protocol_version, 1);
                assert_eq!(h.client_id, [1; 16]);
            }
            _ => panic!("wrong message type"),
        }
    }

    #[test]
    fn test_roundtrip_read_chunk() {
        let data = vec![0u8; 1024];
        let checksum = blake3::hash(&data);

        let msg = NetMessage::ReadChunkResponse(ReadChunkResponse {
            chunk_id: ChunkId::new(42, 0),
            data: data.clone(),
            checksum: *checksum.as_bytes(),
            is_final: true,
        });

        let bytes = serialize_message(&msg).unwrap();
        let payload = &bytes[4..];
        let decoded: NetMessage = deserialize_message(payload).unwrap();

        match decoded {
            NetMessage::ReadChunkResponse(r) => {
                assert_eq!(r.chunk_id.inode, 42);
                assert_eq!(r.data.len(), 1024);
                assert!(r.is_final);
            }
            _ => panic!("wrong message type"),
        }
    }
}
