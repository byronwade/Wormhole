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
#[derive(Clone, PartialEq, Eq, Hash, Debug, Serialize, Deserialize)]
pub struct LockToken(pub [u8; 16]);

impl LockToken {
    /// Generate a random lock token
    pub fn generate() -> Self {
        let mut bytes = [0u8; 16];
        getrandom::getrandom(&mut bytes).expect("RNG failed");
        Self(bytes)
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
