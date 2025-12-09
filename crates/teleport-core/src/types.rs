//! Core type definitions for Wormhole
//!
//! These types are used across all crates and define the fundamental
//! data structures for the filesystem protocol.

use serde::{Deserialize, Serialize};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use crate::CHUNK_SIZE;

/// Unique file identifier within a session
pub type Inode = u64;

/// Root directory inode (always 1)
pub const ROOT_INODE: Inode = 1;

/// First user-allocatable inode
pub const FIRST_USER_INODE: Inode = 2;

/// Identifies a specific chunk of a file
#[derive(Clone, Copy, Hash, Eq, PartialEq, Debug, Serialize, Deserialize)]
pub struct ChunkId {
    /// File this chunk belongs to
    pub inode: Inode,
    /// Chunk index (offset / CHUNK_SIZE)
    pub index: u64,
}

impl ChunkId {
    /// Create a new chunk identifier
    pub const fn new(inode: Inode, index: u64) -> Self {
        Self { inode, index }
    }

    /// Create from byte offset
    pub const fn from_offset(inode: Inode, offset: u64) -> Self {
        Self {
            inode,
            index: offset / CHUNK_SIZE as u64,
        }
    }

    /// Byte offset this chunk starts at
    pub const fn byte_offset(&self) -> u64 {
        self.index * CHUNK_SIZE as u64
    }

    /// Calculate offset within this chunk
    pub const fn offset_in_chunk(offset: u64) -> usize {
        (offset % CHUNK_SIZE as u64) as usize
    }
}

/// Type of filesystem entry
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[repr(u8)]
pub enum FileType {
    File = 0,
    Directory = 1,
    Symlink = 2,
}

/// File attributes (similar to struct stat)
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FileAttr {
    pub inode: Inode,
    pub file_type: FileType,
    pub size: u64,
    pub mode: u32,
    pub nlink: u32,
    pub uid: u32,
    pub gid: u32,
    pub atime: u64,
    pub atime_nsec: u32,
    pub mtime: u64,
    pub mtime_nsec: u32,
    pub ctime: u64,
    pub ctime_nsec: u32,
}

impl FileAttr {
    /// Default permissions for directories (rwxr-xr-x)
    pub const DIR_MODE: u32 = 0o755;
    /// Default permissions for files (rw-r--r--)
    pub const FILE_MODE: u32 = 0o644;

    /// Create attributes for a directory
    pub fn directory(inode: Inode) -> Self {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or(Duration::ZERO);
        let secs = now.as_secs();
        let nsecs = now.subsec_nanos();

        Self {
            inode,
            file_type: FileType::Directory,
            size: 0,
            mode: Self::DIR_MODE,
            nlink: 2,
            uid: 0,
            gid: 0,
            atime: secs,
            atime_nsec: nsecs,
            mtime: secs,
            mtime_nsec: nsecs,
            ctime: secs,
            ctime_nsec: nsecs,
        }
    }

    /// Create attributes for a file
    pub fn file(inode: Inode, size: u64) -> Self {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or(Duration::ZERO);
        let secs = now.as_secs();
        let nsecs = now.subsec_nanos();

        Self {
            inode,
            file_type: FileType::File,
            size,
            mode: Self::FILE_MODE,
            nlink: 1,
            uid: 0,
            gid: 0,
            atime: secs,
            atime_nsec: nsecs,
            mtime: secs,
            mtime_nsec: nsecs,
            ctime: secs,
            ctime_nsec: nsecs,
        }
    }

    /// Calculate number of chunks for this file
    pub fn chunk_count(&self) -> u64 {
        if self.size == 0 {
            0
        } else {
            (self.size - 1) / CHUNK_SIZE as u64 + 1
        }
    }
}

/// Directory entry
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DirEntry {
    pub name: String,
    pub inode: Inode,
    pub file_type: FileType,
}

impl DirEntry {
    pub fn new(name: impl Into<String>, inode: Inode, file_type: FileType) -> Self {
        Self {
            name: name.into(),
            inode,
            file_type,
        }
    }
}

/// Lock token for exclusive file access
#[derive(Clone, PartialEq, Eq, Hash, Debug, Default, Serialize, Deserialize)]
pub struct LockToken(pub [u8; 16]);

impl LockToken {
    /// Generate a random lock token
    ///
    /// # Panics
    /// Panics if the system random number generator fails (extremely rare).
    /// Use `try_generate` if you need to handle this case.
    pub fn generate() -> Self {
        Self::try_generate().expect("RNG failed - system entropy source unavailable")
    }

    /// Try to generate a random lock token, returning an error if RNG fails
    pub fn try_generate() -> Result<Self, getrandom::Error> {
        let mut bytes = [0u8; 16];
        getrandom::getrandom(&mut bytes)?;
        Ok(Self(bytes))
    }
}

/// Lock type
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum LockType {
    /// Multiple readers allowed
    Shared,
    /// Single writer, no readers
    Exclusive,
}

// === Multi-Share Types ===

/// Unique identifier for a share (host + folder combination)
#[derive(Clone, Copy, Hash, Eq, PartialEq, Debug, Serialize, Deserialize)]
pub struct ShareId(pub [u8; 8]);

impl ShareId {
    /// Generate a random share ID
    ///
    /// # Panics
    /// Panics if the system random number generator fails (extremely rare).
    /// Use `try_generate` if you need to handle this case.
    pub fn generate() -> Self {
        Self::try_generate().expect("RNG failed - system entropy source unavailable")
    }

    /// Try to generate a random share ID, returning an error if RNG fails
    pub fn try_generate() -> Result<Self, getrandom::Error> {
        let mut bytes = [0u8; 8];
        getrandom::getrandom(&mut bytes)?;
        Ok(Self(bytes))
    }

    /// Create from raw bytes
    pub fn from_bytes(bytes: [u8; 8]) -> Self {
        Self(bytes)
    }

    /// Convert to hex string for display
    pub fn to_hex(&self) -> String {
        self.0.iter().map(|b| format!("{:02x}", b)).collect()
    }
}

impl std::fmt::Display for ShareId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.to_hex())
    }
}

/// Information about a shared folder
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ShareInfo {
    /// Unique share identifier
    pub id: ShareId,
    /// Display name for this share
    pub name: String,
    /// Host name that owns this share
    pub host_name: String,
    /// Root inode for this share
    pub root_inode: Inode,
    /// Total size in bytes (if known)
    pub total_size: Option<u64>,
    /// Number of files (if known)
    pub file_count: Option<u64>,
    /// Whether the share supports writing
    pub writable: bool,
    /// Join code for this share (if available)
    pub join_code: Option<String>,
}

impl ShareInfo {
    /// Create a new ShareInfo
    pub fn new(name: impl Into<String>, host_name: impl Into<String>) -> Self {
        Self {
            id: ShareId::generate(),
            name: name.into(),
            host_name: host_name.into(),
            root_inode: ROOT_INODE,
            total_size: None,
            file_count: None,
            writable: false,
            join_code: None,
        }
    }
}

/// Connection status for a host
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum ConnectionStatus {
    /// Not connected
    Disconnected,
    /// Attempting to connect
    Connecting,
    /// Connected and ready
    Connected,
    /// Connection lost, attempting to reconnect
    Reconnecting,
    /// Connection failed permanently
    Failed,
}

/// Information about a connected host
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct HostInfo {
    /// Host name
    pub name: String,
    /// Host address (may be empty for pending connections)
    pub address: Option<std::net::SocketAddr>,
    /// Connection status
    pub status: ConnectionStatus,
    /// Shares available from this host
    pub shares: Vec<ShareInfo>,
    /// Last seen timestamp (unix millis)
    pub last_seen: u64,
    /// Round-trip time in milliseconds (if measured)
    pub rtt_ms: Option<u32>,
}

impl HostInfo {
    /// Create a new HostInfo
    pub fn new(name: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            address: None,
            status: ConnectionStatus::Disconnected,
            shares: Vec::new(),
            last_seen: 0,
            rtt_ms: None,
        }
    }
}

/// Global inode that includes share context
/// Format: high 16 bits = share index, low 48 bits = local inode
#[derive(Clone, Copy, Hash, Eq, PartialEq, Debug, Serialize, Deserialize)]
pub struct GlobalInode {
    /// Share this inode belongs to (0 = virtual root)
    pub share_index: u16,
    /// Local inode within the share
    pub local_inode: Inode,
}

impl GlobalInode {
    /// Virtual root inode (the mount point itself)
    pub const VIRTUAL_ROOT: GlobalInode = GlobalInode {
        share_index: 0,
        local_inode: 0,
    };

    /// Create a new global inode
    pub const fn new(share_index: u16, local_inode: Inode) -> Self {
        Self {
            share_index,
            local_inode,
        }
    }

    /// Create from a packed u64 representation
    pub const fn from_packed(packed: u64) -> Self {
        Self {
            share_index: (packed >> 48) as u16,
            local_inode: packed & 0x0000_FFFF_FFFF_FFFF,
        }
    }

    /// Pack into a u64 for FUSE
    pub const fn to_packed(&self) -> u64 {
        ((self.share_index as u64) << 48) | (self.local_inode & 0x0000_FFFF_FFFF_FFFF)
    }

    /// Check if this is the virtual root
    pub const fn is_virtual_root(&self) -> bool {
        self.share_index == 0 && self.local_inode == 0
    }

    /// Check if this is a share root (appears in virtual root listing)
    pub const fn is_share_root(&self) -> bool {
        self.share_index > 0 && self.local_inode == ROOT_INODE
    }
}

impl From<u64> for GlobalInode {
    fn from(packed: u64) -> Self {
        Self::from_packed(packed)
    }
}

impl From<GlobalInode> for u64 {
    fn from(gi: GlobalInode) -> u64 {
        gi.to_packed()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_chunk_id_from_offset() {
        let chunk = ChunkId::from_offset(42, 0);
        assert_eq!(chunk.inode, 42);
        assert_eq!(chunk.index, 0);

        let chunk = ChunkId::from_offset(42, CHUNK_SIZE as u64 - 1);
        assert_eq!(chunk.index, 0);

        let chunk = ChunkId::from_offset(42, CHUNK_SIZE as u64);
        assert_eq!(chunk.index, 1);

        let chunk = ChunkId::from_offset(42, CHUNK_SIZE as u64 * 10 + 500);
        assert_eq!(chunk.index, 10);
    }

    #[test]
    fn test_share_id() {
        let id1 = ShareId::generate();
        let id2 = ShareId::generate();
        assert_ne!(id1, id2);

        let hex = id1.to_hex();
        assert_eq!(hex.len(), 16);
    }

    #[test]
    fn test_global_inode() {
        // Test virtual root
        let vroot = GlobalInode::VIRTUAL_ROOT;
        assert!(vroot.is_virtual_root());
        assert!(!vroot.is_share_root());
        assert_eq!(vroot.to_packed(), 0);

        // Test share root (share 1, inode 1)
        let share_root = GlobalInode::new(1, ROOT_INODE);
        assert!(!share_root.is_virtual_root());
        assert!(share_root.is_share_root());

        // Test normal inode (share 1, inode 42)
        let normal = GlobalInode::new(1, 42);
        assert!(!normal.is_virtual_root());
        assert!(!normal.is_share_root());

        // Test packing/unpacking
        let packed = normal.to_packed();
        let unpacked = GlobalInode::from_packed(packed);
        assert_eq!(unpacked.share_index, 1);
        assert_eq!(unpacked.local_inode, 42);

        // Test high share index
        let high = GlobalInode::new(1000, 0x123456789ABC);
        let packed = high.to_packed();
        let unpacked = GlobalInode::from_packed(packed);
        assert_eq!(unpacked.share_index, 1000);
        assert_eq!(unpacked.local_inode, 0x123456789ABC);
    }

    #[test]
    fn test_chunk_count() {
        let empty = FileAttr::file(1, 0);
        assert_eq!(empty.chunk_count(), 0);

        let small = FileAttr::file(1, 1);
        assert_eq!(small.chunk_count(), 1);

        let exact = FileAttr::file(1, CHUNK_SIZE as u64);
        assert_eq!(exact.chunk_count(), 1);

        let over = FileAttr::file(1, CHUNK_SIZE as u64 + 1);
        assert_eq!(over.chunk_count(), 2);

        let large = FileAttr::file(1, CHUNK_SIZE as u64 * 100);
        assert_eq!(large.chunk_count(), 100);
    }
}
