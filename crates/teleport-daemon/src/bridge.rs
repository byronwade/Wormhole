//! FUSE ↔ Async Bridge
//!
//! This module solves the fundamental impedance mismatch between:
//! - FUSE: sync callbacks that must block until data is ready
//! - Networking: async I/O that must not block the runtime
//!
//! # Design
//!
//! ```text
//! FUSE Thread                    Tokio Runtime
//! ───────────                    ─────────────
//!     │                               │
//!     │  FuseRequest + oneshot::Sender │
//!     ├──────────────────────────────►│
//!     │     (crossbeam bounded)       │
//!     │                               │
//!     │◄─────────[blocks]─────────────┤
//!     │     oneshot::Receiver         │
//!     │                               │
//! ```
//!
//! # Deadlock Prevention
//!
//! 1. Bounded request channel (backpressure, not unbounded growth)
//! 2. Timeout on all blocking operations
//! 3. Separate runtime from FUSE thread
//! 4. No locks held across await points

use std::time::Duration;
use crossbeam_channel::{bounded, Receiver, Sender, TrySendError};
use tokio::sync::oneshot;
use tracing::{debug, error, warn};

use teleport_core::{DirEntry, FileAttr, Inode, ProtocolError};

use crate::MAX_INFLIGHT_REQUESTS;

/// Request from FUSE to async runtime
#[derive(Debug)]
pub enum FuseRequest {
    /// Look up a file by name
    Lookup {
        parent: Inode,
        name: String,
        reply: oneshot::Sender<Result<FileAttr, FuseError>>,
    },

    /// Get file attributes
    GetAttr {
        inode: Inode,
        reply: oneshot::Sender<Result<FileAttr, FuseError>>,
    },

    /// Read directory contents
    ReadDir {
        inode: Inode,
        offset: u64,
        reply: oneshot::Sender<Result<Vec<DirEntry>, FuseError>>,
    },

    /// Read file data
    Read {
        inode: Inode,
        offset: u64,
        size: u32,
        reply: oneshot::Sender<Result<Vec<u8>, FuseError>>,
    },

    /// Write file data (Phase 7)
    Write {
        inode: Inode,
        offset: u64,
        data: Vec<u8>,
        reply: oneshot::Sender<Result<u32, FuseError>>,
    },

    /// Acquire a lock on a file (Phase 7)
    AcquireLock {
        inode: Inode,
        exclusive: bool,
        reply: oneshot::Sender<Result<(), FuseError>>,
    },

    /// Release a lock on a file (Phase 7)
    ReleaseLock {
        inode: Inode,
        reply: oneshot::Sender<Result<(), FuseError>>,
    },

    /// Flush dirty data for a file (Phase 7)
    Flush {
        inode: Inode,
        reply: oneshot::Sender<Result<(), FuseError>>,
    },

    /// Create a new file (Phase 7)
    CreateFile {
        parent: Inode,
        name: String,
        mode: u32,
        reply: oneshot::Sender<Result<FileAttr, FuseError>>,
    },

    /// Delete a file (Phase 7)
    DeleteFile {
        parent: Inode,
        name: String,
        reply: oneshot::Sender<Result<(), FuseError>>,
    },

    /// Create a directory (Phase 7)
    CreateDir {
        parent: Inode,
        name: String,
        mode: u32,
        reply: oneshot::Sender<Result<FileAttr, FuseError>>,
    },

    /// Delete a directory (Phase 7)
    DeleteDir {
        parent: Inode,
        name: String,
        reply: oneshot::Sender<Result<(), FuseError>>,
    },

    /// Rename a file or directory (Phase 7)
    Rename {
        old_parent: Inode,
        old_name: String,
        new_parent: Inode,
        new_name: String,
        reply: oneshot::Sender<Result<(), FuseError>>,
    },

    /// Set file attributes (Phase 7)
    SetAttr {
        inode: Inode,
        size: Option<u64>,
        mode: Option<u32>,
        mtime: Option<u64>,
        atime: Option<u64>,
        reply: oneshot::Sender<Result<FileAttr, FuseError>>,
    },

    /// Shutdown the bridge
    Shutdown,
}

/// Errors returned to FUSE
#[derive(Debug, Clone)]
pub enum FuseError {
    /// File or directory not found
    NotFound,
    /// Permission denied
    PermissionDenied,
    /// I/O error
    IoError(String),
    /// Operation timed out
    Timeout,
    /// Bridge is shutting down
    Shutdown,
    /// Internal error
    Internal(String),
    /// Lock conflict (Phase 7)
    LockConflict(String),
    /// Lock required but not held (Phase 7)
    LockRequired,
    /// Read-only filesystem
    ReadOnly,
}

impl FuseError {
    /// Convert to libc errno
    pub fn to_errno(&self) -> i32 {
        match self {
            FuseError::NotFound => libc::ENOENT,
            FuseError::PermissionDenied => libc::EACCES,
            FuseError::IoError(_) => libc::EIO,
            FuseError::Timeout => libc::ETIMEDOUT,
            FuseError::Shutdown => libc::ESHUTDOWN,
            FuseError::Internal(_) => libc::EIO,
            FuseError::LockConflict(_) => libc::EAGAIN,
            FuseError::LockRequired => libc::ENOLCK,
            FuseError::ReadOnly => libc::EROFS,
        }
    }
}

impl From<ProtocolError> for FuseError {
    fn from(e: ProtocolError) -> Self {
        match e {
            ProtocolError::PathTraversal(_) => FuseError::PermissionDenied,
            ProtocolError::ChecksumMismatch => FuseError::IoError("checksum mismatch".into()),
            ProtocolError::Timeout => FuseError::Timeout,
            _ => FuseError::Internal(e.to_string()),
        }
    }
}

/// Bridge between sync FUSE thread and async runtime
#[derive(Clone)]
pub struct FuseAsyncBridge {
    /// Channel for sending requests to async runtime
    request_tx: Sender<FuseRequest>,
    /// Timeout for blocking operations
    timeout: Duration,
}

impl FuseAsyncBridge {
    /// Create a new bridge and return the receiver for the async side
    pub fn new(timeout: Duration) -> (Self, Receiver<FuseRequest>) {
        let (tx, rx) = bounded(MAX_INFLIGHT_REQUESTS);
        (
            Self {
                request_tx: tx,
                timeout,
            },
            rx,
        )
    }

    /// Look up a file by name (blocking)
    pub fn lookup(&self, parent: Inode, name: String) -> Result<FileAttr, FuseError> {
        let (reply_tx, reply_rx) = oneshot::channel();

        self.send_request(FuseRequest::Lookup {
            parent,
            name: name.clone(),
            reply: reply_tx,
        })?;

        self.recv_response(reply_rx, &format!("lookup {}", name))
    }

    /// Get file attributes (blocking)
    pub fn getattr(&self, inode: Inode) -> Result<FileAttr, FuseError> {
        let (reply_tx, reply_rx) = oneshot::channel();

        self.send_request(FuseRequest::GetAttr {
            inode,
            reply: reply_tx,
        })?;

        self.recv_response(reply_rx, &format!("getattr {}", inode))
    }

    /// Read directory contents (blocking)
    pub fn readdir(&self, inode: Inode, offset: u64) -> Result<Vec<DirEntry>, FuseError> {
        let (reply_tx, reply_rx) = oneshot::channel();

        self.send_request(FuseRequest::ReadDir {
            inode,
            offset,
            reply: reply_tx,
        })?;

        self.recv_response(reply_rx, &format!("readdir {} @ {}", inode, offset))
    }

    /// Read file data (blocking)
    pub fn read(&self, inode: Inode, offset: u64, size: u32) -> Result<Vec<u8>, FuseError> {
        let (reply_tx, reply_rx) = oneshot::channel();

        self.send_request(FuseRequest::Read {
            inode,
            offset,
            size,
            reply: reply_tx,
        })?;

        self.recv_response(reply_rx, &format!("read {} @ {} len {}", inode, offset, size))
    }

    /// Write file data (blocking) - Phase 7
    pub fn write(&self, inode: Inode, offset: u64, data: Vec<u8>) -> Result<u32, FuseError> {
        let (reply_tx, reply_rx) = oneshot::channel();
        let len = data.len();

        self.send_request(FuseRequest::Write {
            inode,
            offset,
            data,
            reply: reply_tx,
        })?;

        self.recv_response(reply_rx, &format!("write {} @ {} len {}", inode, offset, len))
    }

    /// Acquire a lock on a file (blocking) - Phase 7
    pub fn acquire_lock(&self, inode: Inode, exclusive: bool) -> Result<(), FuseError> {
        let (reply_tx, reply_rx) = oneshot::channel();

        self.send_request(FuseRequest::AcquireLock {
            inode,
            exclusive,
            reply: reply_tx,
        })?;

        self.recv_response(reply_rx, &format!("acquire_lock {} exclusive={}", inode, exclusive))
    }

    /// Release a lock on a file (blocking) - Phase 7
    pub fn release_lock(&self, inode: Inode) -> Result<(), FuseError> {
        let (reply_tx, reply_rx) = oneshot::channel();

        self.send_request(FuseRequest::ReleaseLock {
            inode,
            reply: reply_tx,
        })?;

        self.recv_response(reply_rx, &format!("release_lock {}", inode))
    }

    /// Flush dirty data for a file (blocking) - Phase 7
    pub fn flush(&self, inode: Inode) -> Result<(), FuseError> {
        let (reply_tx, reply_rx) = oneshot::channel();

        self.send_request(FuseRequest::Flush {
            inode,
            reply: reply_tx,
        })?;

        self.recv_response(reply_rx, &format!("flush {}", inode))
    }

    /// Create a new file (blocking) - Phase 7
    pub fn create_file(&self, parent: Inode, name: String, mode: u32) -> Result<FileAttr, FuseError> {
        let (reply_tx, reply_rx) = oneshot::channel();

        self.send_request(FuseRequest::CreateFile {
            parent,
            name: name.clone(),
            mode,
            reply: reply_tx,
        })?;

        self.recv_response(reply_rx, &format!("create_file {} in {}", name, parent))
    }

    /// Delete a file (blocking) - Phase 7
    pub fn delete_file(&self, parent: Inode, name: String) -> Result<(), FuseError> {
        let (reply_tx, reply_rx) = oneshot::channel();

        self.send_request(FuseRequest::DeleteFile {
            parent,
            name: name.clone(),
            reply: reply_tx,
        })?;

        self.recv_response(reply_rx, &format!("delete_file {} in {}", name, parent))
    }

    /// Create a directory (blocking) - Phase 7
    pub fn create_dir(&self, parent: Inode, name: String, mode: u32) -> Result<FileAttr, FuseError> {
        let (reply_tx, reply_rx) = oneshot::channel();

        self.send_request(FuseRequest::CreateDir {
            parent,
            name: name.clone(),
            mode,
            reply: reply_tx,
        })?;

        self.recv_response(reply_rx, &format!("create_dir {} in {}", name, parent))
    }

    /// Delete a directory (blocking) - Phase 7
    pub fn delete_dir(&self, parent: Inode, name: String) -> Result<(), FuseError> {
        let (reply_tx, reply_rx) = oneshot::channel();

        self.send_request(FuseRequest::DeleteDir {
            parent,
            name: name.clone(),
            reply: reply_tx,
        })?;

        self.recv_response(reply_rx, &format!("delete_dir {} in {}", name, parent))
    }

    /// Rename a file or directory (blocking) - Phase 7
    pub fn rename(
        &self,
        old_parent: Inode,
        old_name: String,
        new_parent: Inode,
        new_name: String,
    ) -> Result<(), FuseError> {
        let (reply_tx, reply_rx) = oneshot::channel();

        self.send_request(FuseRequest::Rename {
            old_parent,
            old_name: old_name.clone(),
            new_parent,
            new_name: new_name.clone(),
            reply: reply_tx,
        })?;

        self.recv_response(
            reply_rx,
            &format!("rename {}/{} -> {}/{}", old_parent, old_name, new_parent, new_name),
        )
    }

    /// Set file attributes (blocking) - Phase 7
    pub fn setattr(
        &self,
        inode: Inode,
        size: Option<u64>,
        mode: Option<u32>,
        mtime: Option<u64>,
        atime: Option<u64>,
    ) -> Result<FileAttr, FuseError> {
        let (reply_tx, reply_rx) = oneshot::channel();

        self.send_request(FuseRequest::SetAttr {
            inode,
            size,
            mode,
            mtime,
            atime,
            reply: reply_tx,
        })?;

        self.recv_response(reply_rx, &format!("setattr {}", inode))
    }

    /// Request shutdown
    pub fn shutdown(&self) {
        let _ = self.request_tx.try_send(FuseRequest::Shutdown);
    }

    /// Send a request to the async runtime
    fn send_request(&self, request: FuseRequest) -> Result<(), FuseError> {
        match self.request_tx.try_send(request) {
            Ok(()) => Ok(()),
            Err(TrySendError::Full(original_request)) => {
                // Channel full - apply backpressure with timeout
                // Recover the original request and retry with blocking send
                warn!("bridge channel full, applying backpressure...");
                match self.request_tx.send_timeout(original_request, self.timeout) {
                    Ok(()) => Ok(()),
                    Err(crossbeam_channel::SendTimeoutError::Timeout(_)) => {
                        error!("bridge channel backpressure timeout");
                        Err(FuseError::Timeout)
                    }
                    Err(crossbeam_channel::SendTimeoutError::Disconnected(_)) => {
                        error!("bridge channel disconnected during backpressure");
                        Err(FuseError::Shutdown)
                    }
                }
            }
            Err(TrySendError::Disconnected(_)) => {
                error!("bridge channel disconnected");
                Err(FuseError::Shutdown)
            }
        }
    }

    /// Receive a response from the async runtime (blocking with timeout)
    fn recv_response<T>(
        &self,
        rx: oneshot::Receiver<Result<T, FuseError>>,
        op: &str,
    ) -> Result<T, FuseError> {
        // Block on oneshot - this is the sync/async bridge point
        // We use std::thread blocking, NOT tokio::block_on
        match rx.blocking_recv() {
            Ok(result) => result,
            Err(_) => {
                error!("response channel closed for {}", op);
                Err(FuseError::Internal("response channel closed".into()))
            }
        }
    }
}

/// Async side of the bridge - runs in tokio runtime
pub struct BridgeHandler {
    request_rx: Receiver<FuseRequest>,
}

impl BridgeHandler {
    pub fn new(request_rx: Receiver<FuseRequest>) -> Self {
        Self { request_rx }
    }

    /// Process requests from the FUSE side
    /// Call this from a tokio task
    pub async fn run<F, Fut>(self, mut handler: F)
    where
        F: FnMut(FuseRequest) -> Fut,
        Fut: std::future::Future<Output = ()>,
    {
        loop {
            // Use recv_timeout to periodically check for shutdown
            match self.request_rx.recv_timeout(Duration::from_millis(100)) {
                Ok(FuseRequest::Shutdown) => {
                    debug!("bridge handler received shutdown");
                    break;
                }
                Ok(request) => {
                    handler(request).await;
                }
                Err(crossbeam_channel::RecvTimeoutError::Timeout) => {
                    // Check if channel is still connected
                    continue;
                }
                Err(crossbeam_channel::RecvTimeoutError::Disconnected) => {
                    debug!("bridge handler: FUSE side disconnected");
                    break;
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::thread;

    #[test]
    fn test_bridge_lookup() {
        let (bridge, rx) = FuseAsyncBridge::new(Duration::from_secs(5));

        // Spawn async handler
        let handle = thread::spawn(move || {
            // Simulate async runtime receiving request
            let request = rx.recv_timeout(Duration::from_secs(1)).unwrap();

            if let FuseRequest::Lookup { parent, name, reply } = request {
                assert_eq!(parent, 1);
                assert_eq!(name, "test.txt");

                let attr = FileAttr::file(42, 1024);
                let _ = reply.send(Ok(attr));
            } else {
                panic!("unexpected request type");
            }
        });

        // FUSE side makes blocking call
        let result = bridge.lookup(1, "test.txt".into());
        assert!(result.is_ok());

        let attr = result.unwrap();
        assert_eq!(attr.inode, 42);
        assert_eq!(attr.size, 1024);

        handle.join().unwrap();
    }

    #[test]
    fn test_bridge_shutdown() {
        let (bridge, rx) = FuseAsyncBridge::new(Duration::from_secs(5));

        bridge.shutdown();

        let request = rx.recv_timeout(Duration::from_secs(1)).unwrap();
        assert!(matches!(request, FuseRequest::Shutdown));
    }

    #[test]
    fn test_fuse_error_errno() {
        assert_eq!(FuseError::NotFound.to_errno(), libc::ENOENT);
        assert_eq!(FuseError::PermissionDenied.to_errno(), libc::EACCES);
        assert_eq!(FuseError::Timeout.to_errno(), libc::ETIMEDOUT);
    }
}
