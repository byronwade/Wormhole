//! Error types for the Wormhole protocol

use serde::{Deserialize, Serialize};
use thiserror::Error;

/// Protocol-level errors
#[derive(Error, Debug, Clone)]
pub enum ProtocolError {
    #[error("invalid message type: {0}")]
    InvalidMessage(u8),

    #[error("path traversal attempt blocked: {0}")]
    PathTraversal(String),

    #[error("serialization failed: {0}")]
    Serialization(String),

    #[error("deserialization failed: {0}")]
    Deserialization(String),

    #[error("checksum mismatch")]
    ChecksumMismatch,

    #[error("message too large: {size} bytes (max {max})")]
    MessageTooLarge { size: usize, max: usize },

    #[error("protocol version mismatch (expected {expected}, got {actual})")]
    VersionMismatch { expected: u32, actual: u32 },

    #[error("invalid chunk id")]
    InvalidChunkId,

    #[error("timeout")]
    Timeout,
}

impl From<bincode::Error> for ProtocolError {
    fn from(e: bincode::Error) -> Self {
        ProtocolError::Deserialization(e.to_string())
    }
}

/// Wire error codes (sent over network)
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[repr(u16)]
pub enum ErrorCode {
    // General (0-99)
    Ok = 0,
    Unknown = 1,
    ProtocolError = 2,
    NotImplemented = 3,
    Timeout = 4,

    // File errors (100-199)
    FileNotFound = 100,
    NotADirectory = 101,
    NotAFile = 102,
    PermissionDenied = 103,
    PathTraversal = 104,
    NameTooLong = 105,
    AlreadyExists = 106,
    NotEmpty = 107,

    // I/O errors (200-299)
    IoError = 200,
    ChecksumMismatch = 201,
    ChunkOutOfRange = 202,

    // Lock errors (300-399)
    LockNotHeld = 300,
    LockExpired = 301,
    LockConflict = 302,

    // Connection errors (400-499)
    SessionExpired = 400,
    RateLimited = 401,
    HostShuttingDown = 402,
    AuthFailed = 403,
}

impl From<&ProtocolError> for ErrorCode {
    fn from(e: &ProtocolError) -> Self {
        match e {
            ProtocolError::InvalidMessage(_) => ErrorCode::ProtocolError,
            ProtocolError::PathTraversal(_) => ErrorCode::PathTraversal,
            ProtocolError::Serialization(_) => ErrorCode::ProtocolError,
            ProtocolError::Deserialization(_) => ErrorCode::ProtocolError,
            ProtocolError::ChecksumMismatch => ErrorCode::ChecksumMismatch,
            ProtocolError::MessageTooLarge { .. } => ErrorCode::ProtocolError,
            ProtocolError::VersionMismatch { .. } => ErrorCode::ProtocolError,
            ProtocolError::InvalidChunkId => ErrorCode::ChunkOutOfRange,
            ProtocolError::Timeout => ErrorCode::Timeout,
        }
    }
}

/// Map error code to libc errno
impl ErrorCode {
    pub fn to_errno(self) -> i32 {
        match self {
            ErrorCode::Ok => 0,
            ErrorCode::FileNotFound => libc::ENOENT,
            ErrorCode::NotADirectory => libc::ENOTDIR,
            ErrorCode::NotAFile => libc::EISDIR,
            ErrorCode::PermissionDenied => libc::EACCES,
            ErrorCode::PathTraversal => libc::EACCES,
            ErrorCode::NameTooLong => libc::ENAMETOOLONG,
            ErrorCode::AlreadyExists => libc::EEXIST,
            ErrorCode::NotEmpty => libc::ENOTEMPTY,
            ErrorCode::IoError => libc::EIO,
            ErrorCode::ChecksumMismatch => libc::EIO,
            ErrorCode::ChunkOutOfRange => libc::EINVAL,
            ErrorCode::LockNotHeld => libc::ENOLCK,
            ErrorCode::LockExpired => libc::ENOLCK,
            ErrorCode::LockConflict => libc::EAGAIN,
            ErrorCode::Timeout => libc::ETIMEDOUT,
            ErrorCode::RateLimited => libc::EAGAIN,
            _ => libc::EIO,
        }
    }
}
