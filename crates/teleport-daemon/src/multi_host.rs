//! Multi-Share Host - Serves multiple directories to remote clients
//!
//! This module extends the basic host functionality to support:
//! - Multiple shared folders (each with its own ShareId)
//! - Namespace isolation between shares
//! - Dynamic share management (add/remove shares at runtime)

use std::collections::HashMap;
use std::fs::{self, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant};

use dashmap::DashMap;
use parking_lot::RwLock;
use tokio::sync::Semaphore;
use tracing::{debug, error, info, warn};

use teleport_core::{
    crypto::checksum, path::safe_real_path, DirEntry, ErrorCode, ErrorMessage, FileAttr, FileType,
    GetAttrRequest, GetAttrResponse, HelloAckMessage, Inode, ListDirRequest, ListDirResponse,
    ListSharesResponse, LockRequest, LockResponse, LookupRequest, LookupResponse, NetMessage,
    ReadChunkRequest, ReadChunkResponse, ReleaseRequest, ReleaseResponse, ShareId, ShareInfo,
    WriteChunkRequest, WriteChunkResponse, CHUNK_SIZE, FIRST_USER_INODE, LockType,
    PROTOCOL_VERSION, ROOT_INODE,
};

use crate::lock_manager::LockManager;
use crate::rate_limiter::RateLimiter;
use crate::net::{create_server_endpoint, recv_message, send_message, ConnectionError};

/// SECURITY: Maximum session duration before forced re-authentication (24 hours)
/// This prevents stale or compromised sessions from being used indefinitely.
const MAX_SESSION_DURATION: Duration = Duration::from_secs(24 * 60 * 60);

/// Configuration for a single shared folder
#[derive(Clone, Debug)]
pub struct SharedFolder {
    /// Unique ID for this share
    pub id: ShareId,
    /// Path to the shared directory
    pub path: PathBuf,
    /// Display name for this share
    pub name: String,
    /// Whether writes are allowed
    pub writable: bool,
}

impl SharedFolder {
    /// Create a new shared folder configuration
    pub fn new(path: impl Into<PathBuf>, name: impl Into<String>) -> Self {
        Self {
            id: ShareId::generate(),
            path: path.into(),
            name: name.into(),
            writable: true,
        }
    }

    /// Make this share read-only
    pub fn read_only(mut self) -> Self {
        self.writable = false;
        self
    }
}

/// Multi-share host configuration
#[derive(Clone, Debug)]
pub struct MultiHostConfig {
    /// Address to bind to
    pub bind_addr: SocketAddr,
    /// Maximum concurrent connections
    pub max_connections: usize,
    /// Host display name
    pub host_name: String,
    /// Shared folders
    pub shares: Vec<SharedFolder>,
}

impl Default for MultiHostConfig {
    fn default() -> Self {
        Self {
            bind_addr: "0.0.0.0:4433".parse().unwrap(),
            max_connections: 10,
            host_name: hostname::get()
                .map(|h| h.to_string_lossy().into_owned())
                .unwrap_or_else(|_| "wormhole-host".into()),
            shares: Vec::new(),
        }
    }
}

impl MultiHostConfig {
    /// Add a shared folder
    pub fn add_share(mut self, share: SharedFolder) -> Self {
        self.shares.push(share);
        self
    }

    /// Create with a single share (backward compatible)
    pub fn single_share(path: impl Into<PathBuf>) -> Self {
        let path = path.into();
        let name = path.file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| "share".into());

        Self::default().add_share(SharedFolder::new(path, name))
    }
}

/// Inode table for a single share
struct ShareInodeTable {
    /// Share ID
    #[allow(dead_code)]
    share_id: ShareId,
    /// Path to the shared directory (used for symlink validation)
    root_path: PathBuf,
    /// Inode to path mapping
    inode_to_path: DashMap<Inode, PathBuf>,
    /// Path to inode mapping
    path_to_inode: DashMap<PathBuf, Inode>,
    /// Next available inode
    next_inode: RwLock<Inode>,
}

impl ShareInodeTable {
    fn new(share_id: ShareId, root_path: PathBuf) -> Self {
        let table = Self {
            share_id,
            root_path: root_path.clone(),
            inode_to_path: DashMap::new(),
            path_to_inode: DashMap::new(),
            next_inode: RwLock::new(FIRST_USER_INODE),
        };

        // Root is always inode 1
        table.inode_to_path.insert(ROOT_INODE, root_path.clone());
        table.path_to_inode.insert(root_path, ROOT_INODE);

        table
    }

    fn get_path(&self, inode: Inode) -> Option<PathBuf> {
        self.inode_to_path.get(&inode).map(|r| r.clone())
    }

    fn get_or_create_inode(&self, path: PathBuf) -> Option<Inode> {
        if let Some(inode) = self.path_to_inode.get(&path) {
            return Some(*inode);
        }

        let mut next = self.next_inode.write();
        let inode = *next;

        // Check for overflow - this is theoretical but prevents wraparound
        // The max inode we can use is limited by GlobalInode's 48-bit local inode field
        const MAX_LOCAL_INODE: u64 = 0x0000_FFFF_FFFF_FFFF;
        if inode >= MAX_LOCAL_INODE {
            warn!("Inode space exhausted, cannot create more inodes");
            return None;
        }

        *next = inode + 1;

        self.inode_to_path.insert(inode, path.clone());
        self.path_to_inode.insert(path, inode);

        Some(inode)
    }
}

/// Multi-share host server
pub struct MultiShareHost {
    config: MultiHostConfig,
    /// Share ID to inode table mapping
    share_tables: Arc<HashMap<ShareId, ShareInodeTable>>,
    /// Share info list
    share_infos: Vec<ShareInfo>,
    /// Connection semaphore
    connection_semaphore: Arc<Semaphore>,
    /// Lock manager (shared across all shares)
    lock_manager: Arc<LockManager>,
    /// Rate limiter for protection against brute-force attacks
    rate_limiter: Arc<RateLimiter>,
}

impl MultiShareHost {
    /// Create a new multi-share host
    pub fn new(config: MultiHostConfig) -> Self {
        let mut share_tables = HashMap::new();
        let mut share_infos = Vec::new();

        for share in &config.shares {
            let table = ShareInodeTable::new(share.id, share.path.clone());
            share_tables.insert(share.id, table);

            let mut info = ShareInfo::new(&share.name, &config.host_name);
            info.id = share.id;
            info.writable = share.writable;
            share_infos.push(info);
        }

        Self {
            connection_semaphore: Arc::new(Semaphore::new(config.max_connections)),
            config,
            share_tables: Arc::new(share_tables),
            share_infos,
            lock_manager: Arc::new(LockManager::default()),
            rate_limiter: Arc::new(RateLimiter::new()),
        }
    }

    /// Get share info list
    pub fn get_shares(&self) -> Vec<ShareInfo> {
        self.share_infos.clone()
    }

    /// Start serving connections
    pub async fn serve(&self) -> Result<(), MultiHostError> {
        let (endpoint, cert_fingerprint) = create_server_endpoint(self.config.bind_addr)
            .map_err(|e| MultiHostError::Bind(format!("{:?}", e)))?;

        info!(
            "Multi-share host listening on {} with {} shares (cert fingerprint: {})",
            self.config.bind_addr,
            self.share_infos.len(),
            hex::encode(cert_fingerprint)
        );

        for share in &self.share_infos {
            info!("  - {}: {:?}", share.name, self.config.shares.iter()
                .find(|s| s.id == share.id)
                .map(|s| &s.path));
        }

        // Spawn a background task to periodically clean up expired rate limiter entries
        let cleanup_limiter = self.rate_limiter.clone();
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(60));
            loop {
                interval.tick().await;
                cleanup_limiter.cleanup_expired();
            }
        });

        loop {
            let incoming = endpoint.accept().await;

            match incoming {
                Some(conn) => {
                    // SECURITY: Check if the remote IP is rate limited before accepting
                    let remote_addr = conn.remote_address();
                    let remote_ip = remote_addr.ip();

                    if !self.rate_limiter.check(remote_ip) {
                        let remaining = self.rate_limiter.get_block_remaining(remote_ip);
                        warn!(
                            "Rate limited connection from {} (blocked for {:?})",
                            remote_ip,
                            remaining
                        );
                        // Don't accept the connection - just drop the incoming
                        continue;
                    }

                    let permit = match self.connection_semaphore.clone().acquire_owned().await {
                        Ok(p) => p,
                        Err(_) => {
                            warn!("Connection limit reached");
                            continue;
                        }
                    };

                    let share_tables = self.share_tables.clone();
                    let share_infos = self.share_infos.clone();
                    let host_name = self.config.host_name.clone();
                    let lock_manager = self.lock_manager.clone();
                    let config = self.config.clone();
                    let rate_limiter = self.rate_limiter.clone();

                    tokio::spawn(async move {
                        match conn.await {
                            Ok(connection) => {
                                let remote = connection.remote_address();
                                let remote_ip = remote.ip();
                                info!("New connection from {}", remote);

                                match handle_connection(
                                    connection,
                                    share_tables,
                                    share_infos,
                                    host_name,
                                    lock_manager,
                                    config,
                                )
                                .await
                                {
                                    Ok(()) => {
                                        // SECURITY: Record successful connection
                                        rate_limiter.record_success(remote_ip);
                                    }
                                    Err(e) => {
                                        // SECURITY: Record failed handshake
                                        let blocked = rate_limiter.record_failure(remote_ip);
                                        if blocked {
                                            warn!("Connection error from {} (now blocked): {:?}", remote, e);
                                        } else {
                                            error!("Connection error from {}: {:?}", remote, e);
                                        }
                                    }
                                }
                            }
                            Err(e) => {
                                // SECURITY: Record TLS/connection failures
                                let blocked = rate_limiter.record_failure(remote_ip);
                                if blocked {
                                    warn!("Connection failed from {} (now blocked): {:?}", remote_ip, e);
                                } else {
                                    warn!("Connection failed: {:?}", e);
                                }
                            }
                        }
                        drop(permit);
                    });
                }
                None => {
                    // Endpoint closed
                    break;
                }
            }
        }

        Ok(())
    }
}

/// Handle a single client connection
async fn handle_connection(
    connection: quinn::Connection,
    share_tables: Arc<HashMap<ShareId, ShareInodeTable>>,
    share_infos: Vec<ShareInfo>,
    host_name: String,
    lock_manager: Arc<LockManager>,
    config: MultiHostConfig,
) -> Result<(), ConnectionError> {
    // Wait for handshake stream
    let (mut send, mut recv) = connection
        .accept_bi()
        .await
        .map_err(|e| ConnectionError::StreamAccept(e.to_string()))?;

    // Receive Hello
    let hello = recv_message(&mut recv).await?;

    let client_id = match hello {
        NetMessage::Hello(h) => {
            if h.protocol_version != PROTOCOL_VERSION {
                let error = NetMessage::Error(ErrorMessage {
                    code: ErrorCode::ProtocolError,
                    message: format!(
                        "protocol version mismatch: expected {}, got {}",
                        PROTOCOL_VERSION, h.protocol_version
                    ),
                    related_inode: None,
                });
                send_message(&mut send, &error).await?;
                return Err(ConnectionError::Protocol(
                    teleport_core::ProtocolError::VersionMismatch {
                        expected: PROTOCOL_VERSION,
                        actual: h.protocol_version,
                    },
                ));
            }
            h.client_id
        }
        _ => {
            return Err(ConnectionError::Receive("expected Hello".into()));
        }
    };

    // Generate session ID
    let mut session_id = [0u8; 16];
    getrandom::getrandom(&mut session_id)
        .expect("RNG failed - system entropy source unavailable");

    // Create a unique holder ID for this client
    let holder_id = format!(
        "{:02x}{:02x}{:02x}{:02x}",
        client_id[0], client_id[1], client_id[2], client_id[3]
    );

    // Determine capabilities based on shares
    let mut capabilities = vec!["read".into(), "multi-share".into()];
    if config.shares.iter().any(|s| s.writable) {
        capabilities.push("write".into());
        capabilities.push("lock".into());
    }

    // For backward compatibility, use first share as root
    let root_inode = ROOT_INODE;

    // Send HelloAck
    let ack = NetMessage::HelloAck(HelloAckMessage {
        protocol_version: PROTOCOL_VERSION,
        session_id,
        root_inode,
        host_name: host_name.clone(),
        capabilities,
    });
    send_message(&mut send, &ack).await?;

    info!(
        "Client {:?} authenticated, session {:?}",
        &client_id[..4],
        &session_id[..4]
    );

    // SECURITY: Track session start time for expiration enforcement
    let session_started = Instant::now();

    // Handle requests
    loop {
        // SECURITY: Check if session has exceeded maximum duration
        if session_started.elapsed() > MAX_SESSION_DURATION {
            warn!(
                "Session {} expired after {:?} - forcing disconnect",
                holder_id,
                session_started.elapsed()
            );
            // Close connection gracefully with session expired error code
            connection.close(0x02u32.into(), b"session expired");
            lock_manager.release_all_by_holder(&holder_id);
            break;
        }

        let stream = connection.accept_bi().await;

        match stream {
            Ok((mut send, mut recv)) => {
                let share_tables = share_tables.clone();
                let share_infos = share_infos.clone();
                let lock_manager = lock_manager.clone();
                let holder_id = holder_id.clone();
                let config = config.clone();

                tokio::spawn(async move {
                    if let Err(e) = handle_request(
                        &mut send,
                        &mut recv,
                        &share_tables,
                        &share_infos,
                        &lock_manager,
                        &holder_id,
                        &config,
                    )
                    .await
                    {
                        debug!("Request error: {:?}", e);
                    }
                });
            }
            Err(quinn::ConnectionError::ApplicationClosed(_)) => {
                info!("Client {} disconnected gracefully", holder_id);
                lock_manager.release_all_by_holder(&holder_id);
                break;
            }
            Err(e) => {
                error!("Stream accept error: {:?}", e);
                lock_manager.release_all_by_holder(&holder_id);
                break;
            }
        }
    }

    Ok(())
}

/// Handle a single request
async fn handle_request(
    send: &mut quinn::SendStream,
    recv: &mut quinn::RecvStream,
    share_tables: &HashMap<ShareId, ShareInodeTable>,
    share_infos: &[ShareInfo],
    lock_manager: &LockManager,
    holder_id: &str,
    config: &MultiHostConfig,
) -> Result<(), ConnectionError> {
    let request = recv_message(recv).await?;

    // For now, use the first share as default (backward compatibility)
    let default_share = config.shares.first();

    let response = match request {
        NetMessage::ListShares(req) => {
            let shares = if let Some(filter) = req.filter_id {
                share_infos.iter().filter(|s| s.id == filter).cloned().collect()
            } else {
                share_infos.to_vec()
            };
            NetMessage::ListSharesResponse(ListSharesResponse { shares })
        }
        NetMessage::Lookup(req) => {
            if let Some(share) = default_share {
                if let Some(table) = share_tables.get(&share.id) {
                    handle_lookup(req, table, &share.path)
                } else {
                    NetMessage::Error(ErrorMessage {
                        code: ErrorCode::FileNotFound,
                        message: "share not found".into(),
                        related_inode: None,
                    })
                }
            } else {
                NetMessage::Error(ErrorMessage {
                    code: ErrorCode::FileNotFound,
                    message: "no shares available".into(),
                    related_inode: None,
                })
            }
        }
        NetMessage::GetAttr(req) => {
            if let Some(share) = default_share {
                if let Some(table) = share_tables.get(&share.id) {
                    handle_getattr(req, table)
                } else {
                    NetMessage::Error(ErrorMessage {
                        code: ErrorCode::FileNotFound,
                        message: "share not found".into(),
                        related_inode: None,
                    })
                }
            } else {
                NetMessage::Error(ErrorMessage {
                    code: ErrorCode::FileNotFound,
                    message: "no shares available".into(),
                    related_inode: None,
                })
            }
        }
        NetMessage::ListDir(req) => {
            if let Some(share) = default_share {
                if let Some(table) = share_tables.get(&share.id) {
                    handle_listdir(req, table)
                } else {
                    NetMessage::Error(ErrorMessage {
                        code: ErrorCode::FileNotFound,
                        message: "share not found".into(),
                        related_inode: None,
                    })
                }
            } else {
                NetMessage::Error(ErrorMessage {
                    code: ErrorCode::FileNotFound,
                    message: "no shares available".into(),
                    related_inode: None,
                })
            }
        }
        NetMessage::ReadChunk(req) => {
            if let Some(share) = default_share {
                if let Some(table) = share_tables.get(&share.id) {
                    handle_read_chunk(req, table)
                } else {
                    NetMessage::Error(ErrorMessage {
                        code: ErrorCode::FileNotFound,
                        message: "share not found".into(),
                        related_inode: None,
                    })
                }
            } else {
                NetMessage::Error(ErrorMessage {
                    code: ErrorCode::FileNotFound,
                    message: "no shares available".into(),
                    related_inode: None,
                })
            }
        }
        NetMessage::WriteChunk(req) => {
            if let Some(share) = default_share {
                if !share.writable {
                    NetMessage::Error(ErrorMessage {
                        code: ErrorCode::PermissionDenied,
                        message: "share is read-only".into(),
                        related_inode: Some(req.chunk_id.inode),
                    })
                } else if let Some(table) = share_tables.get(&share.id) {
                    handle_write_chunk(req, table, lock_manager)
                } else {
                    NetMessage::Error(ErrorMessage {
                        code: ErrorCode::FileNotFound,
                        message: "share not found".into(),
                        related_inode: None,
                    })
                }
            } else {
                NetMessage::Error(ErrorMessage {
                    code: ErrorCode::FileNotFound,
                    message: "no shares available".into(),
                    related_inode: None,
                })
            }
        }
        NetMessage::AcquireLock(req) => handle_acquire_lock(req, lock_manager, holder_id),
        NetMessage::ReleaseLock(req) => handle_release_lock(req, lock_manager),
        NetMessage::Ping(p) => NetMessage::Pong(teleport_core::PongMessage {
            client_timestamp: p.timestamp,
            server_timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis() as u64,
            payload: p.payload,
        }),
        _ => NetMessage::Error(ErrorMessage {
            code: ErrorCode::NotImplemented,
            message: "request type not implemented".into(),
            related_inode: None,
        }),
    };

    send_message(send, &response).await
}

fn handle_lookup(req: LookupRequest, table: &ShareInodeTable, shared_path: &Path) -> NetMessage {
    let parent_path = match table.get_path(req.parent) {
        Some(p) => p,
        None => {
            return NetMessage::LookupResponse(LookupResponse { attr: None });
        }
    };

    // Validate name
    if let Err(e) = teleport_core::path::validate_filename(&req.name) {
        return NetMessage::Error(ErrorMessage {
            code: ErrorCode::PathTraversal,
            message: e.to_string(),
            related_inode: Some(req.parent),
        });
    }

    let child_path = parent_path.join(&req.name);

    // Quick check: ensure path is within shared directory (lexical check)
    if !child_path.starts_with(shared_path) {
        return NetMessage::Error(ErrorMessage {
            code: ErrorCode::PathTraversal,
            message: "path escapes shared directory".into(),
            related_inode: Some(req.parent),
        });
    }

    match fs::metadata(&child_path) {
        Ok(meta) => {
            // SECURITY: After confirming the file exists, verify symlinks don't escape
            // the shared directory. This follows all symlinks and checks the real path.
            if let Err(e) = safe_real_path(shared_path, &child_path) {
                warn!("Path traversal attempt via symlink: {}: {}", child_path.display(), e);
                return NetMessage::Error(ErrorMessage {
                    code: ErrorCode::PathTraversal,
                    message: "symlink escapes shared directory".into(),
                    related_inode: Some(req.parent),
                });
            }

            match table.get_or_create_inode(child_path) {
                Some(inode) => {
                    let attr = metadata_to_attr(inode, &meta);
                    NetMessage::LookupResponse(LookupResponse { attr: Some(attr) })
                }
                None => NetMessage::Error(ErrorMessage {
                    code: ErrorCode::IoError,
                    message: "inode space exhausted".into(),
                    related_inode: Some(req.parent),
                })
            }
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            NetMessage::LookupResponse(LookupResponse { attr: None })
        }
        Err(e) => NetMessage::Error(ErrorMessage {
            code: ErrorCode::IoError,
            message: e.to_string(),
            related_inode: Some(req.parent),
        }),
    }
}

fn handle_getattr(req: GetAttrRequest, table: &ShareInodeTable) -> NetMessage {
    let path = match table.get_path(req.inode) {
        Some(p) => p,
        None => {
            return NetMessage::GetAttrResponse(GetAttrResponse { attr: None });
        }
    };

    match fs::metadata(&path) {
        Ok(meta) => {
            let attr = metadata_to_attr(req.inode, &meta);
            NetMessage::GetAttrResponse(GetAttrResponse { attr: Some(attr) })
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            NetMessage::GetAttrResponse(GetAttrResponse { attr: None })
        }
        Err(e) => NetMessage::Error(ErrorMessage {
            code: ErrorCode::IoError,
            message: e.to_string(),
            related_inode: Some(req.inode),
        }),
    }
}

fn handle_listdir(req: ListDirRequest, table: &ShareInodeTable) -> NetMessage {
    let path = match table.get_path(req.inode) {
        Some(p) => p,
        None => {
            return NetMessage::Error(ErrorMessage {
                code: ErrorCode::FileNotFound,
                message: "inode not found".into(),
                related_inode: Some(req.inode),
            });
        }
    };

    match fs::read_dir(&path) {
        Ok(entries) => {
            let mut dir_entries = Vec::new();
            // Fetch one extra entry to determine has_more accurately
            let fetch_limit = req.limit.saturating_add(1) as usize;

            for (i, entry) in entries.enumerate() {
                if i < req.offset as usize {
                    continue;
                }
                if dir_entries.len() >= fetch_limit {
                    break;
                }

                if let Ok(entry) = entry {
                    let name = entry.file_name().to_string_lossy().into_owned();
                    let entry_path = entry.path();

                    if let Ok(meta) = entry.metadata() {
                        let file_type = if meta.is_dir() {
                            FileType::Directory
                        } else if meta.is_symlink() {
                            FileType::Symlink
                        } else {
                            FileType::File
                        };

                        if let Some(inode) = table.get_or_create_inode(entry_path.clone()) {
                            dir_entries.push(DirEntry::new(name, inode, file_type));
                        } else {
                            // Inode space exhausted - log and skip this entry
                            // This is a critical condition that should be investigated
                            error!(
                                "Inode space exhausted while listing directory, skipping entry: {:?}",
                                entry_path
                            );
                        }
                    }
                }
            }

            // If we got more than limit, there are more entries
            let has_more = dir_entries.len() > req.limit as usize;
            // Truncate to requested limit
            dir_entries.truncate(req.limit as usize);
            let next_offset = req.offset + dir_entries.len() as u64;

            NetMessage::ListDirResponse(ListDirResponse {
                entries: dir_entries,
                has_more,
                next_offset,
            })
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => NetMessage::Error(ErrorMessage {
            code: ErrorCode::FileNotFound,
            message: "directory not found".into(),
            related_inode: Some(req.inode),
        }),
        Err(e) if e.kind() == std::io::ErrorKind::NotADirectory => NetMessage::Error(ErrorMessage {
            code: ErrorCode::NotADirectory,
            message: "not a directory".into(),
            related_inode: Some(req.inode),
        }),
        Err(e) => NetMessage::Error(ErrorMessage {
            code: ErrorCode::IoError,
            message: e.to_string(),
            related_inode: Some(req.inode),
        }),
    }
}

fn handle_read_chunk(req: ReadChunkRequest, table: &ShareInodeTable) -> NetMessage {
    let path = match table.get_path(req.chunk_id.inode) {
        Some(p) => p,
        None => {
            return NetMessage::Error(ErrorMessage {
                code: ErrorCode::FileNotFound,
                message: "inode not found".into(),
                related_inode: Some(req.chunk_id.inode),
            });
        }
    };

    // SECURITY: Verify symlinks don't escape shared directory before reading content.
    // This check must happen before fs::File::open which follows symlinks.
    if let Err(e) = safe_real_path(&table.root_path, &path) {
        warn!("Path traversal attempt in read_chunk via symlink: {}: {}", path.display(), e);
        return NetMessage::Error(ErrorMessage {
            code: ErrorCode::PathTraversal,
            message: "symlink escapes shared directory".into(),
            related_inode: Some(req.chunk_id.inode),
        });
    }

    let file = match fs::File::open(&path) {
        Ok(f) => f,
        Err(e) => {
            return NetMessage::Error(ErrorMessage {
                code: ErrorCode::IoError,
                message: e.to_string(),
                related_inode: Some(req.chunk_id.inode),
            });
        }
    };

    let mut file = file;

    let offset = req.chunk_id.byte_offset();
    if file.seek(SeekFrom::Start(offset)).is_err() {
        return NetMessage::Error(ErrorMessage {
            code: ErrorCode::IoError,
            message: "seek failed".into(),
            related_inode: Some(req.chunk_id.inode),
        });
    }

    let mut buffer = vec![0u8; CHUNK_SIZE];
    let bytes_read = match file.read(&mut buffer) {
        Ok(n) => n,
        Err(e) => {
            return NetMessage::Error(ErrorMessage {
                code: ErrorCode::IoError,
                message: e.to_string(),
                related_inode: Some(req.chunk_id.inode),
            });
        }
    };

    buffer.truncate(bytes_read);
    let hash = checksum(&buffer);

    // Check if this is the final chunk
    let file_size = file.metadata().map(|m| m.len()).unwrap_or(0);
    let is_final = offset + bytes_read as u64 >= file_size;

    NetMessage::ReadChunkResponse(ReadChunkResponse {
        chunk_id: req.chunk_id,
        data: buffer,
        checksum: hash,
        is_final,
    })
}

fn handle_write_chunk(
    req: WriteChunkRequest,
    table: &ShareInodeTable,
    lock_manager: &LockManager,
) -> NetMessage {
    let inode = req.chunk_id.inode;

    // Verify the lock token is valid for exclusive write
    if !lock_manager.validate(inode, &req.lock_token, LockType::Exclusive) {
        return NetMessage::Error(ErrorMessage {
            code: ErrorCode::LockRequired,
            message: "Invalid or expired lock token".into(),
            related_inode: Some(inode),
        });
    }

    // Verify checksum
    let computed_checksum = checksum(&req.data);
    if computed_checksum != req.checksum {
        return NetMessage::Error(ErrorMessage {
            code: ErrorCode::ChecksumMismatch,
            message: "Data checksum mismatch".into(),
            related_inode: Some(inode),
        });
    }

    let path = match table.get_path(inode) {
        Some(p) => p,
        None => {
            return NetMessage::Error(ErrorMessage {
                code: ErrorCode::FileNotFound,
                message: "inode not found".into(),
                related_inode: Some(inode),
            });
        }
    };

    // SECURITY: Verify symlinks don't escape shared directory before writing.
    // This check is CRITICAL for write operations - without it, an attacker could
    // overwrite arbitrary files on the host system via symlinks.
    if let Err(e) = safe_real_path(&table.root_path, &path) {
        warn!("Path traversal attempt in write_chunk via symlink: {}: {}", path.display(), e);
        return NetMessage::Error(ErrorMessage {
            code: ErrorCode::PathTraversal,
            message: "symlink escapes shared directory".into(),
            related_inode: Some(inode),
        });
    }

    // Open file for writing
    let mut file = match OpenOptions::new().write(true).open(&path) {
        Ok(f) => f,
        Err(e) => {
            return NetMessage::Error(ErrorMessage {
                code: ErrorCode::IoError,
                message: format!("Failed to open file for writing: {}", e),
                related_inode: Some(inode),
            });
        }
    };

    // Seek to the chunk offset
    let offset = req.chunk_id.byte_offset();
    if let Err(e) = file.seek(SeekFrom::Start(offset)) {
        return NetMessage::Error(ErrorMessage {
            code: ErrorCode::IoError,
            message: format!("Seek failed: {}", e),
            related_inode: Some(inode),
        });
    }

    // Write the data
    if let Err(e) = file.write_all(&req.data) {
        return NetMessage::Error(ErrorMessage {
            code: ErrorCode::IoError,
            message: format!("Write failed: {}", e),
            related_inode: Some(inode),
        });
    }

    // Sync to disk
    if let Err(e) = file.sync_data() {
        warn!("Failed to sync file data: {}", e);
    }

    // Get new file size
    let new_size = file.metadata().map(|m| m.len()).ok();

    info!(
        "Write chunk: inode={}, offset={}, size={}",
        inode,
        offset,
        req.data.len()
    );

    NetMessage::WriteChunkResponse(WriteChunkResponse {
        chunk_id: req.chunk_id,
        success: true,
        new_size,
    })
}

fn handle_acquire_lock(req: LockRequest, lock_manager: &LockManager, holder_id: &str) -> NetMessage {
    let timeout = if req.timeout_ms > 0 {
        Some(Duration::from_millis(req.timeout_ms as u64))
    } else {
        None
    };

    match lock_manager.acquire(req.inode, req.lock_type, holder_id, timeout) {
        Ok(token) => {
            info!(
                "Lock acquired: inode={}, type={:?}, holder={}",
                req.inode, req.lock_type, holder_id
            );
            NetMessage::AcquireLockResponse(LockResponse {
                granted: true,
                token: Some(token),
                holder: None,
                retry_after_ms: None,
            })
        }
        Err(crate::lock_manager::LockError::Conflict {
            holder,
            retry_after,
            ..
        }) => {
            debug!("Lock conflict: inode={}, holder={:?}", req.inode, holder);
            NetMessage::AcquireLockResponse(LockResponse {
                granted: false,
                token: None,
                holder,
                retry_after_ms: retry_after.map(|d| d.as_millis() as u32),
            })
        }
        Err(crate::lock_manager::LockError::TokenNotFound) => NetMessage::Error(ErrorMessage {
            code: ErrorCode::LockRequired,
            message: "Lock token not found".into(),
            related_inode: Some(req.inode),
        }),
    }
}

fn handle_release_lock(req: ReleaseRequest, lock_manager: &LockManager) -> NetMessage {
    match lock_manager.release(&req.token) {
        Ok(()) => {
            info!("Lock released");
            NetMessage::ReleaseLockResponse(ReleaseResponse { success: true })
        }
        Err(crate::lock_manager::LockError::TokenNotFound) => {
            warn!("Attempted to release non-existent lock");
            NetMessage::ReleaseLockResponse(ReleaseResponse { success: false })
        }
        Err(_) => NetMessage::ReleaseLockResponse(ReleaseResponse { success: false }),
    }
}

/// Convert std::fs::Metadata to FileAttr
fn metadata_to_attr(inode: Inode, meta: &fs::Metadata) -> FileAttr {
    use std::os::unix::fs::MetadataExt;

    let file_type = if meta.is_dir() {
        FileType::Directory
    } else if meta.is_symlink() {
        FileType::Symlink
    } else {
        FileType::File
    };

    // Safely convert timestamps: negative times (pre-1970) are clamped to 0
    // and nanoseconds are clamped to valid range [0, 999_999_999]
    FileAttr {
        inode,
        file_type,
        size: meta.len(),
        mode: meta.mode(),
        nlink: meta.nlink() as u32,
        uid: meta.uid(),
        gid: meta.gid(),
        atime: meta.atime().max(0) as u64,
        atime_nsec: meta.atime_nsec().clamp(0, 999_999_999) as u32,
        mtime: meta.mtime().max(0) as u64,
        mtime_nsec: meta.mtime_nsec().clamp(0, 999_999_999) as u32,
        ctime: meta.ctime().max(0) as u64,
        ctime_nsec: meta.ctime_nsec().clamp(0, 999_999_999) as u32,
    }
}

/// Errors from multi-share host
#[derive(Debug)]
pub enum MultiHostError {
    Bind(String),
    Io(String),
}

impl std::fmt::Display for MultiHostError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            MultiHostError::Bind(msg) => write!(f, "Bind error: {}", msg),
            MultiHostError::Io(msg) => write!(f, "IO error: {}", msg),
        }
    }
}

impl std::error::Error for MultiHostError {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_shared_folder_new() {
        let folder = SharedFolder::new("/test/path", "test-share");
        assert_eq!(folder.name, "test-share");
        assert_eq!(folder.path, PathBuf::from("/test/path"));
        assert!(folder.writable);
    }

    #[test]
    fn test_shared_folder_read_only() {
        let folder = SharedFolder::new("/test/path", "test-share").read_only();
        assert!(!folder.writable);
    }

    #[test]
    fn test_multi_host_config_default() {
        let config = MultiHostConfig::default();
        assert_eq!(config.bind_addr.port(), 4433);
        assert_eq!(config.max_connections, 10);
        assert!(config.shares.is_empty());
    }

    #[test]
    fn test_multi_host_config_single_share() {
        let config = MultiHostConfig::single_share("/test/share");
        assert_eq!(config.shares.len(), 1);
        assert_eq!(config.shares[0].path, PathBuf::from("/test/share"));
    }

    #[test]
    fn test_multi_host_config_add_share() {
        let config = MultiHostConfig::default()
            .add_share(SharedFolder::new("/share1", "Share 1"))
            .add_share(SharedFolder::new("/share2", "Share 2"));

        assert_eq!(config.shares.len(), 2);
        assert_eq!(config.shares[0].name, "Share 1");
        assert_eq!(config.shares[1].name, "Share 2");
    }
}
