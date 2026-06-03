//! Wire protocol definitions
//!
//! All network messages are defined here. Messages are serialized with bincode
//! and prefixed with a 4-byte little-endian length.

use serde::{Deserialize, Serialize};

use crate::error::ErrorCode;
use crate::types::{
    ChunkId, ContentHash, DirEntry, FileAttr, FileManifest, Inode, LockToken, LockType, ShareId,
    ShareInfo,
};

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

    // File operations (Phase 7)
    CreateFile(CreateFileRequest),
    CreateFileResponse(CreateFileResponse),
    DeleteFile(DeleteFileRequest),
    DeleteFileResponse(DeleteFileResponse),
    CreateDir(CreateDirRequest),
    CreateDirResponse(CreateDirResponse),
    DeleteDir(DeleteDirRequest),
    DeleteDirResponse(DeleteDirResponse),
    Rename(RenameRequest),
    RenameResponse(RenameResponse),
    Truncate(TruncateRequest),
    TruncateResponse(TruncateResponse),
    SetAttr(SetAttrRequest),
    SetAttrResponse(SetAttrResponse),

    // Control
    Ping(PingMessage),
    Pong(PongMessage),
    Error(ErrorMessage),
    Goodbye(GoodbyeMessage),

    // Cache invalidation
    Invalidate(InvalidateMessage),

    // Multi-share messages
    ListShares(ListSharesRequest),
    ListSharesResponse(ListSharesResponse),

    // Phase 8: Bulk transfer messages
    ManifestRequest(ManifestRequestMsg),
    ManifestResponse(ManifestResponseMsg),
    MissingChunksRequest(MissingChunksRequestMsg),
    MissingChunksResponse(MissingChunksResponseMsg),
    BulkChunkRequest(BulkChunkRequestMsg),
    BulkChunkResponse(BulkChunkResponseMsg),
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

// === File Operation Messages (Phase 7) ===

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CreateFileRequest {
    pub parent: Inode,
    pub name: String,
    pub mode: u32,
    pub lock_token: Option<LockToken>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CreateFileResponse {
    pub success: bool,
    pub attr: Option<FileAttr>,
    pub error: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DeleteFileRequest {
    pub parent: Inode,
    pub name: String,
    pub lock_token: Option<LockToken>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DeleteFileResponse {
    pub success: bool,
    pub error: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CreateDirRequest {
    pub parent: Inode,
    pub name: String,
    pub mode: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CreateDirResponse {
    pub success: bool,
    pub attr: Option<FileAttr>,
    pub error: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DeleteDirRequest {
    pub parent: Inode,
    pub name: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DeleteDirResponse {
    pub success: bool,
    pub error: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RenameRequest {
    pub old_parent: Inode,
    pub old_name: String,
    pub new_parent: Inode,
    pub new_name: String,
    pub lock_token: Option<LockToken>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RenameResponse {
    pub success: bool,
    pub error: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TruncateRequest {
    pub inode: Inode,
    pub size: u64,
    pub lock_token: Option<LockToken>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TruncateResponse {
    pub success: bool,
    pub new_attr: Option<FileAttr>,
    pub error: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SetAttrRequest {
    pub inode: Inode,
    /// New size (for truncate)
    pub size: Option<u64>,
    /// New mode (permissions)
    pub mode: Option<u32>,
    /// New modification time
    pub mtime: Option<u64>,
    /// New access time
    pub atime: Option<u64>,
    pub lock_token: Option<LockToken>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SetAttrResponse {
    pub success: bool,
    pub attr: Option<FileAttr>,
    pub error: Option<String>,
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

// === Multi-Share Messages ===

/// Request to list available shares
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ListSharesRequest {
    /// Optional filter by share ID (empty = list all)
    pub filter_id: Option<ShareId>,
}

/// Response with available shares
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ListSharesResponse {
    /// Available shares
    pub shares: Vec<ShareInfo>,
}

// === Phase 8: Bulk Transfer Messages ===

/// Request file manifest for dedup negotiation
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ManifestRequestMsg {
    /// File inode to get manifest for
    pub inode: Inode,
    /// Total file size (for validation)
    pub file_size: u64,
}

/// Response with file manifest (list of content hashes)
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ManifestResponseMsg {
    /// Complete manifest with content hashes
    pub manifest: FileManifest,
    /// Error if manifest couldn't be generated
    pub error: Option<String>,
}

/// Request to identify missing chunks for dedup
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MissingChunksRequestMsg {
    /// Manifest from sender to compare against local cache
    pub manifest: FileManifest,
}

/// Response with hashes that need to be transferred
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MissingChunksResponseMsg {
    /// Hashes that are NOT in the local cache
    pub missing_hashes: Vec<ContentHash>,
    /// Total bytes needed (sum of missing chunk sizes)
    pub missing_bytes: u64,
}

/// Request a single bulk chunk by content hash
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BulkChunkRequestMsg {
    /// Content hash of requested chunk
    pub hash: ContentHash,
    /// Transfer priority (higher = more urgent)
    pub priority: u8,
    /// Transfer ID for progress tracking
    pub transfer_id: u64,
}

/// Response with bulk chunk data
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BulkChunkResponseMsg {
    /// Content hash of this chunk
    pub hash: ContentHash,
    /// Chunk data (may be compressed)
    pub data: Vec<u8>,
    /// Whether data is zstd compressed
    pub compressed: bool,
    /// Original size (before compression)
    pub original_size: u32,
    /// Error if chunk couldn't be read
    pub error: Option<String>,
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
