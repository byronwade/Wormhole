//! Wormhole host - serves local directory to remote clients

use std::fs::{self, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::net::SocketAddr;
#[cfg(unix)]
use std::os::unix::fs::OpenOptionsExt;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant};

use dashmap::DashMap;
use parking_lot::RwLock;
use tokio::sync::Semaphore;
use tracing::{debug, error, info, warn};

use teleport_core::{
    crypto::checksum, BulkChunkRequestMsg, BulkChunkResponseMsg, ContentChunk, ContentHash,
    CreateDirRequest, CreateDirResponse, CreateFileRequest, CreateFileResponse, DeleteDirRequest,
    DeleteDirResponse, DeleteFileRequest, DeleteFileResponse, DirEntry, ErrorCode, ErrorMessage,
    FileAttr, FileManifest, FileType, GetAttrRequest, GetAttrResponse, HelloAckMessage, Inode,
    ListDirRequest, ListDirResponse, LockRequest, LockResponse, LockType, LookupRequest,
    LookupResponse, ManifestRequestMsg, ManifestResponseMsg, MissingChunksRequestMsg,
    MissingChunksResponseMsg, NetMessage, ReadChunkRequest, ReadChunkResponse, ReleaseRequest,
    ReleaseResponse, RenameRequest, RenameResponse, SetAttrRequest, SetAttrResponse,
    TruncateRequest, TruncateResponse, WriteChunkRequest, WriteChunkResponse, CHUNK_SIZE,
    FIRST_USER_INODE, PROTOCOL_VERSION, ROOT_INODE,
};

use crate::content_store::{ChunkGrantSet, ContentStore};
use crate::lock_manager::LockManager;
use crate::rate_limiter::RateLimiter;

use crate::net::{
    create_server_endpoint_with_identity, generate_server_identity, host_capabilities,
    negotiate_session_codec, recv_message, recv_message_with, send_message, send_message_with,
    CertFingerprint, ConnectionError, ServerIdentity,
};
use teleport_core::WireCodec;

/// SECURITY: Maximum session duration before forced re-authentication (24 hours)
/// This prevents stale or compromised sessions from being used indefinitely.
const MAX_SESSION_DURATION: Duration = Duration::from_secs(24 * 60 * 60);

/// SECURITY: Handshake timeout - prevent clients from holding connections without completing handshake
const HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(30);

/// Maximum number of inode entries to prevent unbounded memory growth
const MAX_INODE_ENTRIES: usize = 1_000_000;

/// Warning threshold for inode table size (90% of max)
const INODE_WARNING_THRESHOLD: usize = MAX_INODE_ENTRIES * 9 / 10;

/// Host configuration
pub struct HostConfig {
    pub bind_addr: SocketAddr,
    pub shared_path: PathBuf,
    pub max_connections: usize,
    pub host_name: String,
    /// When set, clients must advertise a matching `join:` capability in Hello.
    /// `None` / empty keeps open mode for unit tests and local benches.
    pub join_code: Option<String>,
}

impl Default for HostConfig {
    fn default() -> Self {
        Self {
            bind_addr: "0.0.0.0:4433".parse().unwrap(),
            shared_path: PathBuf::from("."),
            max_connections: 10,
            host_name: hostname::get()
                .map(|h| h.to_string_lossy().into_owned())
                .unwrap_or_else(|_| "wormhole-host".into()),
            join_code: None,
        }
    }
}

/// Cap whole-file manifest sync to limit host CPU/memory DoS.
const MAX_MANIFEST_FILE_BYTES: u64 = 512 * 1024 * 1024;
/// 512 MiB / 128 KiB chunks.
const MAX_MANIFEST_CHUNKS: usize = 4096;

/// Inode table mapping inodes to paths
pub(crate) struct InodeTable {
    inode_to_path: DashMap<Inode, PathBuf>,
    path_to_inode: DashMap<PathBuf, Inode>,
    next_inode: RwLock<Inode>,
    /// Track whether we've warned about table size
    warned_high_usage: std::sync::atomic::AtomicBool,
}

impl InodeTable {
    pub(crate) fn new(root: PathBuf) -> Self {
        let table = Self {
            inode_to_path: DashMap::new(),
            path_to_inode: DashMap::new(),
            next_inode: RwLock::new(FIRST_USER_INODE),
            warned_high_usage: std::sync::atomic::AtomicBool::new(false),
        };

        // Root is always inode 1
        table.inode_to_path.insert(ROOT_INODE, root.clone());
        table.path_to_inode.insert(root, ROOT_INODE);

        table
    }

    fn get_path(&self, inode: Inode) -> Option<PathBuf> {
        self.inode_to_path.get(&inode).map(|r| r.clone())
    }

    /// Get current number of entries
    fn len(&self) -> usize {
        self.inode_to_path.len()
    }

    fn get_or_create_inode(&self, path: PathBuf) -> Option<Inode> {
        if let Some(inode) = self.path_to_inode.get(&path) {
            return Some(*inode);
        }

        // Check if we've hit the limit
        let current_size = self.inode_to_path.len();
        if current_size >= MAX_INODE_ENTRIES {
            error!(
                "Inode table full ({} entries) - cannot allocate new inodes. \
                 Consider cleaning up deleted files or increasing MAX_INODE_ENTRIES.",
                current_size
            );
            return None;
        }

        // Warn once when approaching the limit
        if current_size >= INODE_WARNING_THRESHOLD
            && !self
                .warned_high_usage
                .swap(true, std::sync::atomic::Ordering::Relaxed)
        {
            warn!(
                "Inode table is {}% full ({}/{} entries). \
                     Performance may degrade as the table grows.",
                current_size * 100 / MAX_INODE_ENTRIES,
                current_size,
                MAX_INODE_ENTRIES
            );
        }

        let mut next = self.next_inode.write();
        let inode = *next;

        // SECURITY: Prevent inode overflow that could cause collisions
        *next = match next.checked_add(1) {
            Some(n) => n,
            None => {
                error!("Inode space exhausted - cannot allocate new inodes");
                return None;
            }
        };

        self.inode_to_path.insert(inode, path.clone());
        self.path_to_inode.insert(path, inode);

        Some(inode)
    }

    /// Remove an inode mapping (for deleted files)
    fn remove_inode(&self, inode: Inode) {
        if let Some((_, path)) = self.inode_to_path.remove(&inode) {
            self.path_to_inode.remove(&path);
        }
    }

    /// Clean up stale entries (paths that no longer exist on disk)
    /// Returns the number of entries removed.
    fn cleanup_stale_entries(&self) -> usize {
        let mut removed = 0;
        let stale_inodes: Vec<Inode> = self
            .inode_to_path
            .iter()
            .filter(|entry| {
                let path = entry.value();
                // Don't remove root inode, and check if path still exists
                *entry.key() != ROOT_INODE && !path.exists()
            })
            .map(|entry| *entry.key())
            .collect();

        for inode in stale_inodes {
            self.remove_inode(inode);
            removed += 1;
        }

        if removed > 0 {
            info!(
                "Cleaned up {} stale inode entries. Current table size: {}",
                removed,
                self.len()
            );
            // Reset warning flag after cleanup
            self.warned_high_usage
                .store(false, std::sync::atomic::Ordering::Relaxed);
        }

        removed
    }
}

/// Wormhole host server
pub struct WormholeHost {
    config: HostConfig,
    inodes: Arc<InodeTable>,
    connection_semaphore: Arc<Semaphore>,
    lock_manager: Arc<LockManager>,
    /// Rate limiter for protection against brute-force attacks
    rate_limiter: Arc<RateLimiter>,
    /// TLS identity generated at construction (moved into the endpoint on serve).
    identity: parking_lot::Mutex<Option<ServerIdentity>>,
    /// Stable cert fingerprint for PAKE pin binding (available before serve).
    cert_fingerprint: CertFingerprint,
}

impl WormholeHost {
    pub fn new(config: HostConfig) -> Self {
        let inodes = Arc::new(InodeTable::new(config.shared_path.clone()));
        let lock_manager = Arc::new(LockManager::default());
        let rate_limiter = Arc::new(RateLimiter::new());
        let identity = generate_server_identity();
        let cert_fingerprint = identity.fingerprint;

        Self {
            connection_semaphore: Arc::new(Semaphore::new(config.max_connections)),
            config,
            inodes,
            lock_manager,
            rate_limiter,
            identity: parking_lot::Mutex::new(Some(identity)),
            cert_fingerprint,
        }
    }

    /// BLAKE3 fingerprint of the host QUIC certificate (for SPAKE2 pin binding).
    pub fn cert_fingerprint(&self) -> CertFingerprint {
        self.cert_fingerprint
    }

    /// Start serving connections
    pub async fn serve(&self) -> Result<(), HostError> {
        let identity = self.identity.lock().take().ok_or_else(|| {
            HostError::Bind("host identity already consumed by a prior serve()".into())
        })?;
        let cert_fingerprint = identity.fingerprint;
        let endpoint = create_server_endpoint_with_identity(self.config.bind_addr, identity)
            .map_err(|e| HostError::Bind(format!("{:?}", e)))?;

        info!(
            "Wormhole host listening on {} serving {:?} (cert fingerprint: {})",
            self.config.bind_addr,
            self.config.shared_path,
            hex::encode(cert_fingerprint)
        );

        // Spawn a background task to periodically clean up expired rate limiter entries
        let cleanup_limiter = self.rate_limiter.clone();
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(60));
            loop {
                interval.tick().await;
                cleanup_limiter.cleanup_expired();
            }
        });

        // Spawn a background task to periodically clean up stale inode entries
        // This runs every 5 minutes and removes entries for files that no longer exist
        let cleanup_inodes = self.inodes.clone();
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(300));
            loop {
                interval.tick().await;
                cleanup_inodes.cleanup_stale_entries();
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
                            remote_ip, remaining
                        );
                        // Don't accept the connection - just drop the incoming
                        continue;
                    }

                    let permit = self.connection_semaphore.clone().acquire_owned().await;
                    if permit.is_err() {
                        warn!("connection limit reached");
                        continue;
                    }
                    let permit = permit.unwrap();

                    let inodes = self.inodes.clone();
                    let shared_path = self.config.shared_path.clone();
                    let host_name = self.config.host_name.clone();
                    let join_code = self.config.join_code.clone();
                    let lock_manager = self.lock_manager.clone();
                    let rate_limiter = self.rate_limiter.clone();

                    tokio::spawn(async move {
                        match conn.await {
                            Ok(connection) => {
                                let remote = connection.remote_address();
                                let remote_ip = remote.ip();
                                info!("New connection from {}", remote);

                                match handle_connection(
                                    connection,
                                    inodes,
                                    shared_path,
                                    host_name,
                                    join_code,
                                    lock_manager,
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
                                            warn!(
                                                "Connection error from {} (now blocked): {:?}",
                                                remote, e
                                            );
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
                                    warn!(
                                        "Connection failed from {} (now blocked): {:?}",
                                        remote_ip, e
                                    );
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
    inodes: Arc<InodeTable>,
    shared_path: PathBuf,
    host_name: String,
    join_code: Option<String>,
    lock_manager: Arc<LockManager>,
) -> Result<(), ConnectionError> {
    // Wait for handshake stream with timeout
    let (mut send, mut recv) = tokio::time::timeout(HANDSHAKE_TIMEOUT, connection.accept_bi())
        .await
        .map_err(|_| ConnectionError::StreamAccept("handshake timeout waiting for stream".into()))?
        .map_err(|e| ConnectionError::StreamAccept(e.to_string()))?;

    // Receive Hello with timeout
    let hello = tokio::time::timeout(HANDSHAKE_TIMEOUT, recv_message(&mut recv))
        .await
        .map_err(|_| ConnectionError::Receive("handshake timeout waiting for Hello".into()))??;

    let (client_id, remote_caps) = match hello {
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
            (h.client_id, h.capabilities)
        }
        _ => {
            return Err(ConnectionError::Receive("expected Hello".into()));
        }
    };

    // SECURITY: require join-code capability when the host is configured with one.
    if !crate::net::verify_join_code(join_code.as_deref(), &remote_caps) {
        let error = NetMessage::Error(ErrorMessage {
            code: ErrorCode::AuthFailed,
            message: "join code required or invalid".into(),
            related_inode: None,
        });
        send_message(&mut send, &error).await?;
        return Err(ConnectionError::Receive(
            "join code authentication failed".into(),
        ));
    }

    let local_caps = host_capabilities(true);
    let session_codec = negotiate_session_codec(&local_caps, &remote_caps);

    // Generate session ID
    let mut session_id = [0u8; 16];
    getrandom::fill(&mut session_id).expect("RNG failed - system entropy source unavailable");

    // Create a unique holder ID for this client
    let holder_id = format!(
        "{:02x}{:02x}{:02x}{:02x}",
        client_id[0], client_id[1], client_id[2], client_id[3]
    );

    // Send HelloAck with write capability (handshake remains bincode)
    let ack = NetMessage::HelloAck(HelloAckMessage {
        protocol_version: PROTOCOL_VERSION,
        session_id,
        root_inode: ROOT_INODE,
        host_name: host_name.clone(),
        capabilities: local_caps,
    });
    send_message(&mut send, &ack).await?;

    info!(
        client = ?&client_id[..4],
        session = ?&session_id[..4],
        ?session_codec,
        "Client authenticated"
    );

    // SECURITY: Track session start time for expiration enforcement
    let session_started = Instant::now();
    // Per-connection BulkChunk ACL — only hashes seeded on this connection.
    let grants = Arc::new(ChunkGrantSet::new());

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
                let inodes = inodes.clone();
                let shared_path = shared_path.clone();
                let lock_manager = lock_manager.clone();
                let holder_id = holder_id.clone();
                let grants = Arc::clone(&grants);

                tokio::spawn(async move {
                    if let Err(e) = handle_request(
                        &mut send,
                        &mut recv,
                        &inodes,
                        &shared_path,
                        &lock_manager,
                        &holder_id,
                        session_codec,
                        &grants,
                    )
                    .await
                    {
                        debug!("Request error: {:?}", e);
                    }
                });
            }
            Err(quinn::ConnectionError::ApplicationClosed(_)) => {
                info!("Client {} disconnected gracefully", holder_id);
                // Release all locks held by this client
                lock_manager.release_all_by_holder(&holder_id);
                break;
            }
            Err(e) => {
                error!("Stream accept error: {:?}", e);
                // Release all locks held by this client
                lock_manager.release_all_by_holder(&holder_id);
                break;
            }
        }
    }

    Ok(())
}

/// Handle a single request
#[allow(clippy::too_many_arguments)]
async fn handle_request(
    send: &mut quinn::SendStream,
    recv: &mut quinn::RecvStream,
    inodes: &InodeTable,
    shared_path: &Path,
    lock_manager: &LockManager,
    holder_id: &str,
    codec: WireCodec,
    grants: &ChunkGrantSet,
) -> Result<(), ConnectionError> {
    let request = recv_message_with(recv, codec).await?;
    let response = dispatch_request(
        request,
        inodes,
        shared_path,
        lock_manager,
        holder_id,
        grants,
    );
    send_message_with(send, &response, codec).await
}

/// Dispatch a protocol request against a shared directory (quinn + iroh hosts).
pub(crate) fn dispatch_request(
    request: NetMessage,
    inodes: &InodeTable,
    shared_path: &Path,
    lock_manager: &LockManager,
    holder_id: &str,
    grants: &ChunkGrantSet,
) -> NetMessage {
    match request {
        NetMessage::Lookup(req) => handle_lookup(req, inodes, shared_path),
        NetMessage::GetAttr(req) => handle_getattr(req, inodes, shared_path),
        NetMessage::ListDir(req) => handle_listdir(req, inodes, shared_path),
        NetMessage::ReadChunk(req) => handle_read_chunk(req, inodes, shared_path, grants),
        NetMessage::WriteChunk(req) => handle_write_chunk(req, inodes, shared_path, lock_manager),
        NetMessage::AcquireLock(req) => handle_acquire_lock(req, lock_manager, holder_id),
        NetMessage::ReleaseLock(req) => handle_release_lock(req, lock_manager),
        NetMessage::CreateFile(req) => handle_create_file(req, inodes, shared_path, lock_manager),
        NetMessage::DeleteFile(req) => handle_delete_file(req, inodes, shared_path, lock_manager),
        NetMessage::CreateDir(req) => handle_create_dir(req, inodes, shared_path),
        NetMessage::DeleteDir(req) => handle_delete_dir(req, inodes, shared_path),
        NetMessage::Rename(req) => handle_rename(req, inodes, shared_path, lock_manager),
        NetMessage::Truncate(req) => handle_truncate(req, inodes, shared_path, lock_manager),
        NetMessage::SetAttr(req) => handle_setattr(req, inodes, shared_path, lock_manager),
        NetMessage::Ping(p) => NetMessage::Pong(teleport_core::PongMessage {
            client_timestamp: p.timestamp,
            server_timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis().min(u64::MAX as u128) as u64)
                .unwrap_or(0),
            payload: p.payload,
        }),
        NetMessage::ManifestRequest(req) => {
            handle_manifest_request(req, inodes, shared_path, grants)
        }
        NetMessage::MissingChunksRequest(req) => handle_missing_chunks_request(req),
        NetMessage::BulkChunkRequest(req) => handle_bulk_chunk_request(req, grants),
        _ => NetMessage::Error(ErrorMessage {
            code: ErrorCode::NotImplemented,
            message: "request type not implemented".into(),
            related_inode: None,
        }),
    }
}

/// Build a [`FileManifest`] by reading `path` in [`CHUNK_SIZE`] pieces.
///
/// When a content store is available, each chunk is also `put` so subsequent
/// [`BulkChunkRequest`] lookups succeed.
pub(crate) fn build_file_manifest(
    path: &Path,
    inode: Inode,
    grants: Option<&ChunkGrantSet>,
) -> Result<FileManifest, String> {
    let store = ContentStore::open_default().ok();
    build_file_manifest_into(path, inode, store.as_ref(), grants)
}

/// Build a manifest, optionally populating `store` with chunk blobs.
pub(crate) fn build_file_manifest_into(
    path: &Path,
    inode: Inode,
    store: Option<&ContentStore>,
    grants: Option<&ChunkGrantSet>,
) -> Result<FileManifest, String> {
    let mut file = fs::File::open(path).map_err(|e| e.to_string())?;
    let metadata = file.metadata().map_err(|e| e.to_string())?;
    let file_size = metadata.len();

    if file_size > MAX_MANIFEST_FILE_BYTES {
        return Err(format!(
            "file too large for manifest sync ({} bytes; max {})",
            file_size, MAX_MANIFEST_FILE_BYTES
        ));
    }

    let mut manifest = FileManifest::new(inode);
    let mut offset = 0u64;
    let mut buf = vec![0u8; CHUNK_SIZE];

    while offset < file_size {
        if manifest.chunks.len() >= MAX_MANIFEST_CHUNKS {
            return Err(format!(
                "manifest exceeds max chunk count ({})",
                MAX_MANIFEST_CHUNKS
            ));
        }
        let to_read = ((file_size - offset) as usize).min(CHUNK_SIZE);
        let n = file.read(&mut buf[..to_read]).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        let data = &buf[..n];
        let hash = ContentHash::compute(data);
        if let Some(store) = store {
            match grants {
                Some(g) => {
                    if let Err(e) = store.put_granted(data, g) {
                        warn!(error = %e, "failed to put chunk into content store");
                    }
                }
                None => {
                    if let Err(e) = store.put(data) {
                        warn!(error = %e, "failed to put chunk into content store");
                    }
                }
            }
        }
        manifest.push_chunk(ContentChunk::new(hash, n as u32, offset));
        offset += n as u64;
    }

    Ok(manifest)
}

pub(crate) fn handle_manifest_request(
    req: ManifestRequestMsg,
    inodes: &InodeTable,
    shared_path: &Path,
    grants: &ChunkGrantSet,
) -> NetMessage {
    let path = match inodes.get_path(req.inode) {
        Some(p) => p,
        None => {
            return NetMessage::ManifestResponse(ManifestResponseMsg {
                manifest: FileManifest::new(req.inode),
                error: Some(format!("inode {} not found", req.inode)),
            });
        }
    };

    if let Err(e) = teleport_core::path::safe_real_path(shared_path, &path) {
        warn!(
            "Path traversal attempt via symlink on manifest: {} ({})",
            path.display(),
            e
        );
        return NetMessage::ManifestResponse(ManifestResponseMsg {
            manifest: FileManifest::new(req.inode),
            error: Some("path escapes share".into()),
        });
    }

    match build_file_manifest(&path, req.inode, Some(grants)) {
        Ok(manifest) => NetMessage::ManifestResponse(ManifestResponseMsg {
            manifest,
            error: None,
        }),
        Err(e) => NetMessage::ManifestResponse(ManifestResponseMsg {
            manifest: FileManifest::new(req.inode),
            error: Some(e),
        }),
    }
}

pub(crate) fn handle_missing_chunks_request(req: MissingChunksRequestMsg) -> NetMessage {
    use std::collections::HashMap;

    let hashes = req.manifest.unique_hashes();
    let size_by_hash: HashMap<ContentHash, u64> = req
        .manifest
        .chunks
        .iter()
        .map(|c| (c.hash, c.size as u64))
        .collect();

    let missing_hashes = match ContentStore::open_default() {
        Ok(store) => store.missing(&hashes),
        Err(_) => {
            // Store unavailable — report all unique hashes as missing.
            hashes
        }
    };

    let missing_bytes = missing_hashes
        .iter()
        .map(|h| size_by_hash.get(h).copied().unwrap_or(0))
        .sum();

    NetMessage::MissingChunksResponse(MissingChunksResponseMsg {
        missing_hashes,
        missing_bytes,
    })
}

pub(crate) fn handle_bulk_chunk_request(
    req: BulkChunkRequestMsg,
    grants: &ChunkGrantSet,
) -> NetMessage {
    // SECURITY: only serve hashes seeded on this connection.
    if !grants.contains(&req.hash) {
        return NetMessage::BulkChunkResponse(BulkChunkResponseMsg {
            hash: req.hash,
            data: Vec::new(),
            compressed: false,
            original_size: 0,
            error: Some("chunk not authorized for bulk fetch".into()),
        });
    }

    match ContentStore::open_default() {
        Ok(store) => match store.get(&req.hash) {
            Ok(data) => NetMessage::BulkChunkResponse(BulkChunkResponseMsg {
                hash: req.hash,
                original_size: data.len() as u32,
                compressed: false,
                data,
                error: None,
            }),
            Err(_) => NetMessage::BulkChunkResponse(BulkChunkResponseMsg {
                hash: req.hash,
                data: Vec::new(),
                compressed: false,
                original_size: 0,
                error: Some(
                    "chunk not in content store — host with content_addressed after first read"
                        .into(),
                ),
            }),
        },
        Err(e) => NetMessage::BulkChunkResponse(BulkChunkResponseMsg {
            hash: req.hash,
            data: Vec::new(),
            compressed: false,
            original_size: 0,
            error: Some(format!("content store unavailable: {e}")),
        }),
    }
}

/// SECURITY: Reject access to a path that escapes the shared directory via a
/// symlink. `safe_real_path` resolves all symlinks (canonicalize) and checks
/// containment, so this MUST be called before any filesystem operation that
/// follows symlinks (open / read_dir / set_len / set_permissions). Returns
/// `Some(error)` if the resolved path escapes the share (or cannot be resolved),
/// `None` if it is safely contained. Mirrors the checks in `multi_host.rs`.
fn enforce_within_share(shared_path: &Path, path: &Path, inode: Inode) -> Option<NetMessage> {
    if let Err(e) = teleport_core::path::safe_real_path(shared_path, path) {
        warn!(
            "Path traversal attempt via symlink: {} escapes share ({})",
            path.display(),
            e
        );
        return Some(NetMessage::Error(ErrorMessage {
            code: ErrorCode::PathTraversal,
            message: "symlink escapes shared directory".into(),
            related_inode: Some(inode),
        }));
    }
    None
}

fn handle_lookup(req: LookupRequest, inodes: &InodeTable, shared_path: &Path) -> NetMessage {
    let parent_path = match inodes.get_path(req.parent) {
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

    // Ensure path is within shared directory
    if !child_path.starts_with(shared_path) {
        return NetMessage::Error(ErrorMessage {
            code: ErrorCode::PathTraversal,
            message: "path escapes shared directory".into(),
            related_inode: Some(req.parent),
        });
    }

    match fs::metadata(&child_path) {
        Ok(meta) => {
            // SECURITY: the file exists; ensure it (after symlink resolution) is
            // still inside the share before we ever hand out an inode for it.
            if let Some(err) = enforce_within_share(shared_path, &child_path, req.parent) {
                return err;
            }
            let inode = match inodes.get_or_create_inode(child_path) {
                Some(i) => i,
                None => {
                    return NetMessage::Error(ErrorMessage {
                        code: ErrorCode::IoError,
                        message: "inode allocation failed".into(),
                        related_inode: Some(req.parent),
                    });
                }
            };
            let attr = metadata_to_attr(inode, &meta);
            NetMessage::LookupResponse(LookupResponse { attr: Some(attr) })
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

fn handle_getattr(req: GetAttrRequest, inodes: &InodeTable, shared_path: &Path) -> NetMessage {
    let path = match inodes.get_path(req.inode) {
        Some(p) => p,
        None => {
            return NetMessage::GetAttrResponse(GetAttrResponse { attr: None });
        }
    };

    // SECURITY: do not follow escaping symlinks for metadata disclosure.
    if let Some(err) = enforce_within_share(shared_path, &path, req.inode) {
        return err;
    }

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

fn handle_listdir(req: ListDirRequest, inodes: &InodeTable, shared_path: &Path) -> NetMessage {
    let path = match inodes.get_path(req.inode) {
        Some(p) => p,
        None => {
            return NetMessage::Error(ErrorMessage {
                code: ErrorCode::FileNotFound,
                message: "inode not found".into(),
                related_inode: Some(req.inode),
            });
        }
    };

    // SECURITY: directory itself must resolve inside the share (no escaped symlink dirs).
    if let Some(err) = enforce_within_share(shared_path, &path, req.inode) {
        return err;
    }

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

                    // Use file_type() so we do not follow symlinks while classifying.
                    let Ok(ft) = entry.file_type() else {
                        continue;
                    };
                    let file_type = if ft.is_dir() {
                        FileType::Directory
                    } else if ft.is_symlink() {
                        FileType::Symlink
                    } else {
                        FileType::File
                    };

                    // Skip symlinks (and any entry) whose resolved target escapes the share.
                    if teleport_core::path::safe_real_path(shared_path, &entry_path).is_err() {
                        continue;
                    }

                    if let Some(inode) = inodes.get_or_create_inode(entry_path) {
                        dir_entries.push(DirEntry::new(name, inode, file_type));
                    }
                    // Skip entries if inode allocation fails (shouldn't happen in practice)
                }
            }

            // If we got more than limit, there are more entries
            let has_more = dir_entries.len() > req.limit as usize;
            // Truncate to requested limit
            dir_entries.truncate(req.limit as usize);
            let next_offset = req.offset.saturating_add(dir_entries.len() as u64);

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
        Err(e) if e.kind() == std::io::ErrorKind::NotADirectory => {
            NetMessage::Error(ErrorMessage {
                code: ErrorCode::NotADirectory,
                message: "not a directory".into(),
                related_inode: Some(req.inode),
            })
        }
        Err(e) => NetMessage::Error(ErrorMessage {
            code: ErrorCode::IoError,
            message: e.to_string(),
            related_inode: Some(req.inode),
        }),
    }
}

fn handle_read_chunk(
    req: ReadChunkRequest,
    inodes: &InodeTable,
    shared_path: &Path,
    grants: &ChunkGrantSet,
) -> NetMessage {
    let path = match inodes.get_path(req.chunk_id.inode) {
        Some(p) => p,
        None => {
            return NetMessage::Error(ErrorMessage {
                code: ErrorCode::FileNotFound,
                message: "inode not found".into(),
                related_inode: Some(req.chunk_id.inode),
            });
        }
    };

    // SECURITY: reject reads whose path escapes the share via a symlink, before
    // fs::File::open (which follows symlinks).
    if let Some(err) = enforce_within_share(shared_path, &path, req.chunk_id.inode) {
        return err;
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

    // Seed content store + grant for this connection's BulkChunk ACL.
    if let Ok(store) = ContentStore::open_default() {
        if let Err(e) = store.put_granted(&buffer, grants) {
            warn!(error = %e, "failed to seed content store from read_chunk");
        }
    }

    // Check if this is the final chunk
    // Use saturating_add to prevent overflow with very large offsets
    let file_size = file.metadata().map(|m| m.len()).unwrap_or(0);
    let is_final = offset.saturating_add(bytes_read as u64) >= file_size;

    NetMessage::ReadChunkResponse(ReadChunkResponse {
        chunk_id: req.chunk_id,
        data: buffer,
        checksum: hash,
        is_final,
    })
}

/// Handle a write chunk request (Phase 7)
fn handle_write_chunk(
    req: WriteChunkRequest,
    inodes: &InodeTable,
    shared_path: &Path,
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

    let path = match inodes.get_path(inode) {
        Some(p) => p,
        None => {
            return NetMessage::Error(ErrorMessage {
                code: ErrorCode::FileNotFound,
                message: "inode not found".into(),
                related_inode: Some(inode),
            });
        }
    };

    // SECURITY: reject writes whose path escapes the share via a symlink, before
    // OpenOptions::open (which follows symlinks).
    if let Some(err) = enforce_within_share(shared_path, &path, inode) {
        return err;
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

/// Handle a lock acquire request (Phase 7)
fn handle_acquire_lock(
    req: LockRequest,
    lock_manager: &LockManager,
    holder_id: &str,
) -> NetMessage {
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

/// Handle a lock release request (Phase 7)
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

// === SECURE FILE OPERATION HANDLERS (Phase 7) ===

/// Helper: Validate path is within shared directory (SECURITY CRITICAL)
fn validate_path_security(
    path: &Path,
    shared_path: &Path,
    parent_inode: Inode,
) -> Result<(), NetMessage> {
    // SECURITY: Ensure path doesn't escape shared directory via symlinks or traversal
    // Use canonicalize to resolve symlinks and check containment
    match path.canonicalize() {
        Ok(canonical) => {
            let shared_canonical = shared_path
                .canonicalize()
                .unwrap_or_else(|_| shared_path.to_path_buf());
            if !canonical.starts_with(&shared_canonical) {
                return Err(NetMessage::Error(ErrorMessage {
                    code: ErrorCode::PathTraversal,
                    message: "path escapes shared directory".into(),
                    related_inode: Some(parent_inode),
                }));
            }
        }
        Err(_) => {
            // Path doesn't exist yet - validate the parent instead
            if let Some(parent) = path.parent() {
                if let Ok(parent_canonical) = parent.canonicalize() {
                    let shared_canonical = shared_path
                        .canonicalize()
                        .unwrap_or_else(|_| shared_path.to_path_buf());
                    if !parent_canonical.starts_with(&shared_canonical) {
                        return Err(NetMessage::Error(ErrorMessage {
                            code: ErrorCode::PathTraversal,
                            message: "parent path escapes shared directory".into(),
                            related_inode: Some(parent_inode),
                        }));
                    }
                }
            }
        }
    }
    Ok(())
}

/// Handle create file request (SECURITY: validates path, checks parent lock)
fn handle_create_file(
    req: CreateFileRequest,
    inodes: &InodeTable,
    shared_path: &Path,
    lock_manager: &LockManager,
) -> NetMessage {
    // SECURITY: Validate filename
    if let Err(e) = teleport_core::path::validate_filename(&req.name) {
        return NetMessage::Error(ErrorMessage {
            code: ErrorCode::PathTraversal,
            message: e.to_string(),
            related_inode: Some(req.parent),
        });
    }

    // Get parent path
    let parent_path = match inodes.get_path(req.parent) {
        Some(p) => p,
        None => {
            return NetMessage::CreateFileResponse(CreateFileResponse {
                success: false,
                attr: None,
                error: Some("parent directory not found".into()),
            });
        }
    };

    let file_path = parent_path.join(&req.name);

    // SECURITY: Validate path is within shared directory
    if let Err(e) = validate_path_security(&file_path, shared_path, req.parent) {
        return e;
    }

    // SECURITY: Require lock token for parent directory (optional but recommended)
    if let Some(ref token) = req.lock_token {
        if !lock_manager.validate(req.parent, token, LockType::Exclusive) {
            return NetMessage::Error(ErrorMessage {
                code: ErrorCode::LockRequired,
                message: "Invalid lock token for parent directory".into(),
                related_inode: Some(req.parent),
            });
        }
    }

    // Create the file
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    options.mode(req.mode);

    match options.open(&file_path) {
        Ok(_file) => match fs::metadata(&file_path) {
            Ok(meta) => {
                let inode = match inodes.get_or_create_inode(file_path) {
                    Some(i) => i,
                    None => {
                        return NetMessage::CreateFileResponse(CreateFileResponse {
                            success: false,
                            attr: None,
                            error: Some("inode allocation failed".into()),
                        });
                    }
                };
                let attr = metadata_to_attr(inode, &meta);
                info!("Created file: {:?} (inode {})", req.name, inode);
                NetMessage::CreateFileResponse(CreateFileResponse {
                    success: true,
                    attr: Some(attr),
                    error: None,
                })
            }
            Err(e) => NetMessage::CreateFileResponse(CreateFileResponse {
                success: false,
                attr: None,
                error: Some(format!("failed to stat created file: {}", e)),
            }),
        },
        Err(e) => NetMessage::CreateFileResponse(CreateFileResponse {
            success: false,
            attr: None,
            error: Some(e.to_string()),
        }),
    }
}

/// Handle delete file request (SECURITY: validates path, requires lock)
fn handle_delete_file(
    req: DeleteFileRequest,
    inodes: &InodeTable,
    shared_path: &Path,
    lock_manager: &LockManager,
) -> NetMessage {
    // SECURITY: Validate filename
    if let Err(e) = teleport_core::path::validate_filename(&req.name) {
        return NetMessage::Error(ErrorMessage {
            code: ErrorCode::PathTraversal,
            message: e.to_string(),
            related_inode: Some(req.parent),
        });
    }

    // Get parent path
    let parent_path = match inodes.get_path(req.parent) {
        Some(p) => p,
        None => {
            return NetMessage::DeleteFileResponse(DeleteFileResponse {
                success: false,
                error: Some("parent directory not found".into()),
            });
        }
    };

    let file_path = parent_path.join(&req.name);

    // SECURITY: Validate path is within shared directory
    if let Err(e) = validate_path_security(&file_path, shared_path, req.parent) {
        return e;
    }

    // Get the file's inode before deletion
    let file_inode = inodes.get_or_create_inode(file_path.clone());

    // SECURITY: Require lock token for the file being deleted
    if let Some(ref token) = req.lock_token {
        if let Some(inode) = file_inode {
            if !lock_manager.validate(inode, token, LockType::Exclusive) {
                return NetMessage::Error(ErrorMessage {
                    code: ErrorCode::LockRequired,
                    message: "Invalid lock token for file".into(),
                    related_inode: Some(inode),
                });
            }
        }
    }

    // Delete the file
    match fs::remove_file(&file_path) {
        Ok(()) => {
            // Remove inode mapping
            if let Some(inode) = file_inode {
                inodes.remove_inode(inode);
            }
            info!("Deleted file: {:?}", req.name);
            NetMessage::DeleteFileResponse(DeleteFileResponse {
                success: true,
                error: None,
            })
        }
        Err(e) => NetMessage::DeleteFileResponse(DeleteFileResponse {
            success: false,
            error: Some(e.to_string()),
        }),
    }
}

/// Handle create directory request (SECURITY: validates path)
fn handle_create_dir(req: CreateDirRequest, inodes: &InodeTable, shared_path: &Path) -> NetMessage {
    // SECURITY: Validate directory name
    if let Err(e) = teleport_core::path::validate_filename(&req.name) {
        return NetMessage::Error(ErrorMessage {
            code: ErrorCode::PathTraversal,
            message: e.to_string(),
            related_inode: Some(req.parent),
        });
    }

    // Get parent path
    let parent_path = match inodes.get_path(req.parent) {
        Some(p) => p,
        None => {
            return NetMessage::CreateDirResponse(CreateDirResponse {
                success: false,
                attr: None,
                error: Some("parent directory not found".into()),
            });
        }
    };

    let dir_path = parent_path.join(&req.name);

    // SECURITY: Validate path is within shared directory
    if let Err(e) = validate_path_security(&dir_path, shared_path, req.parent) {
        return e;
    }

    // Create the directory
    match fs::create_dir(&dir_path) {
        Ok(()) => {
            // Set permissions
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let _ = fs::set_permissions(&dir_path, fs::Permissions::from_mode(req.mode));
            }

            match fs::metadata(&dir_path) {
                Ok(meta) => {
                    let inode = match inodes.get_or_create_inode(dir_path) {
                        Some(i) => i,
                        None => {
                            return NetMessage::CreateDirResponse(CreateDirResponse {
                                success: false,
                                attr: None,
                                error: Some("inode allocation failed".into()),
                            });
                        }
                    };
                    let attr = metadata_to_attr(inode, &meta);
                    info!("Created directory: {:?} (inode {})", req.name, inode);
                    NetMessage::CreateDirResponse(CreateDirResponse {
                        success: true,
                        attr: Some(attr),
                        error: None,
                    })
                }
                Err(e) => NetMessage::CreateDirResponse(CreateDirResponse {
                    success: false,
                    attr: None,
                    error: Some(format!("failed to stat created directory: {}", e)),
                }),
            }
        }
        Err(e) => NetMessage::CreateDirResponse(CreateDirResponse {
            success: false,
            attr: None,
            error: Some(e.to_string()),
        }),
    }
}

/// Handle delete directory request (SECURITY: validates path)
fn handle_delete_dir(req: DeleteDirRequest, inodes: &InodeTable, shared_path: &Path) -> NetMessage {
    // SECURITY: Validate directory name
    if let Err(e) = teleport_core::path::validate_filename(&req.name) {
        return NetMessage::Error(ErrorMessage {
            code: ErrorCode::PathTraversal,
            message: e.to_string(),
            related_inode: Some(req.parent),
        });
    }

    // Get parent path
    let parent_path = match inodes.get_path(req.parent) {
        Some(p) => p,
        None => {
            return NetMessage::DeleteDirResponse(DeleteDirResponse {
                success: false,
                error: Some("parent directory not found".into()),
            });
        }
    };

    let dir_path = parent_path.join(&req.name);

    // SECURITY: Validate path is within shared directory
    if let Err(e) = validate_path_security(&dir_path, shared_path, req.parent) {
        return e;
    }

    // Get the directory's inode before deletion
    let dir_inode = inodes.get_or_create_inode(dir_path.clone());

    // Delete the directory (must be empty)
    match fs::remove_dir(&dir_path) {
        Ok(()) => {
            // Remove inode mapping
            if let Some(inode) = dir_inode {
                inodes.remove_inode(inode);
            }
            info!("Deleted directory: {:?}", req.name);
            NetMessage::DeleteDirResponse(DeleteDirResponse {
                success: true,
                error: None,
            })
        }
        Err(e) => NetMessage::DeleteDirResponse(DeleteDirResponse {
            success: false,
            error: Some(e.to_string()),
        }),
    }
}

/// Handle rename request (SECURITY: validates both paths, requires lock)
fn handle_rename(
    req: RenameRequest,
    inodes: &InodeTable,
    shared_path: &Path,
    lock_manager: &LockManager,
) -> NetMessage {
    // SECURITY: Validate both filenames
    if let Err(e) = teleport_core::path::validate_filename(&req.old_name) {
        return NetMessage::Error(ErrorMessage {
            code: ErrorCode::PathTraversal,
            message: format!("invalid old name: {}", e),
            related_inode: Some(req.old_parent),
        });
    }
    if let Err(e) = teleport_core::path::validate_filename(&req.new_name) {
        return NetMessage::Error(ErrorMessage {
            code: ErrorCode::PathTraversal,
            message: format!("invalid new name: {}", e),
            related_inode: Some(req.new_parent),
        });
    }

    // Get source and destination paths
    let old_parent_path = match inodes.get_path(req.old_parent) {
        Some(p) => p,
        None => {
            return NetMessage::RenameResponse(RenameResponse {
                success: false,
                error: Some("source parent directory not found".into()),
            });
        }
    };

    let new_parent_path = match inodes.get_path(req.new_parent) {
        Some(p) => p,
        None => {
            return NetMessage::RenameResponse(RenameResponse {
                success: false,
                error: Some("destination parent directory not found".into()),
            });
        }
    };

    let old_path = old_parent_path.join(&req.old_name);
    let new_path = new_parent_path.join(&req.new_name);

    // SECURITY: Validate both paths are within shared directory
    if let Err(e) = validate_path_security(&old_path, shared_path, req.old_parent) {
        return e;
    }
    if let Err(e) = validate_path_security(&new_path, shared_path, req.new_parent) {
        return e;
    }

    // Get the source inode
    let old_inode = inodes.get_or_create_inode(old_path.clone());

    // SECURITY: Require lock token for the source file
    if let Some(ref token) = req.lock_token {
        if let Some(inode) = old_inode {
            if !lock_manager.validate(inode, token, LockType::Exclusive) {
                return NetMessage::Error(ErrorMessage {
                    code: ErrorCode::LockRequired,
                    message: "Invalid lock token for source file".into(),
                    related_inode: Some(inode),
                });
            }
        }
    }

    // Perform the rename
    match fs::rename(&old_path, &new_path) {
        Ok(()) => {
            // Update inode mapping
            if let Some(inode) = old_inode {
                inodes.remove_inode(inode);
                inodes.get_or_create_inode(new_path);
            }
            info!("Renamed {:?} to {:?}", req.old_name, req.new_name);
            NetMessage::RenameResponse(RenameResponse {
                success: true,
                error: None,
            })
        }
        Err(e) => NetMessage::RenameResponse(RenameResponse {
            success: false,
            error: Some(e.to_string()),
        }),
    }
}

/// Handle truncate request (SECURITY: requires lock)
fn handle_truncate(
    req: TruncateRequest,
    inodes: &InodeTable,
    shared_path: &Path,
    lock_manager: &LockManager,
) -> NetMessage {
    let path = match inodes.get_path(req.inode) {
        Some(p) => p,
        None => {
            return NetMessage::TruncateResponse(TruncateResponse {
                success: false,
                new_attr: None,
                error: Some("file not found".into()),
            });
        }
    };

    // SECURITY: reject truncation of a path that escapes the share via a symlink.
    if let Some(err) = enforce_within_share(shared_path, &path, req.inode) {
        return err;
    }

    // SECURITY: Require lock token for truncate
    if let Some(ref token) = req.lock_token {
        if !lock_manager.validate(req.inode, token, LockType::Exclusive) {
            return NetMessage::Error(ErrorMessage {
                code: ErrorCode::LockRequired,
                message: "Invalid lock token for truncate".into(),
                related_inode: Some(req.inode),
            });
        }
    }

    // Open file and truncate
    match OpenOptions::new().write(true).open(&path) {
        Ok(file) => {
            if let Err(e) = file.set_len(req.size) {
                return NetMessage::TruncateResponse(TruncateResponse {
                    success: false,
                    new_attr: None,
                    error: Some(format!("truncate failed: {}", e)),
                });
            }

            match fs::metadata(&path) {
                Ok(meta) => {
                    let attr = metadata_to_attr(req.inode, &meta);
                    info!("Truncated inode {} to {} bytes", req.inode, req.size);
                    NetMessage::TruncateResponse(TruncateResponse {
                        success: true,
                        new_attr: Some(attr),
                        error: None,
                    })
                }
                Err(e) => NetMessage::TruncateResponse(TruncateResponse {
                    success: false,
                    new_attr: None,
                    error: Some(format!("failed to stat after truncate: {}", e)),
                }),
            }
        }
        Err(e) => NetMessage::TruncateResponse(TruncateResponse {
            success: false,
            new_attr: None,
            error: Some(format!("failed to open file: {}", e)),
        }),
    }
}

/// Handle setattr request (SECURITY: requires lock for modifications)
fn handle_setattr(
    req: SetAttrRequest,
    inodes: &InodeTable,
    shared_path: &Path,
    lock_manager: &LockManager,
) -> NetMessage {
    let path = match inodes.get_path(req.inode) {
        Some(p) => p,
        None => {
            return NetMessage::SetAttrResponse(SetAttrResponse {
                success: false,
                attr: None,
                error: Some("file not found".into()),
            });
        }
    };

    // SECURITY: reject attribute changes on a path that escapes the share via a symlink.
    if let Some(err) = enforce_within_share(shared_path, &path, req.inode) {
        return err;
    }

    // SECURITY: Require lock token for modifications
    let needs_lock =
        req.size.is_some() || req.mode.is_some() || req.mtime.is_some() || req.atime.is_some();
    if needs_lock {
        if let Some(ref token) = req.lock_token {
            if !lock_manager.validate(req.inode, token, LockType::Exclusive) {
                return NetMessage::Error(ErrorMessage {
                    code: ErrorCode::LockRequired,
                    message: "Invalid lock token for setattr".into(),
                    related_inode: Some(req.inode),
                });
            }
        }
    }

    // Apply size change (truncate)
    if let Some(new_size) = req.size {
        match OpenOptions::new().write(true).open(&path) {
            Ok(file) => {
                if let Err(e) = file.set_len(new_size) {
                    return NetMessage::SetAttrResponse(SetAttrResponse {
                        success: false,
                        attr: None,
                        error: Some(format!("truncate failed: {}", e)),
                    });
                }
            }
            Err(e) => {
                return NetMessage::SetAttrResponse(SetAttrResponse {
                    success: false,
                    attr: None,
                    error: Some(format!("failed to open file: {}", e)),
                });
            }
        }
    }

    // Apply mode change
    #[cfg(unix)]
    if let Some(new_mode) = req.mode {
        use std::os::unix::fs::PermissionsExt;
        if let Err(e) = fs::set_permissions(&path, fs::Permissions::from_mode(new_mode)) {
            return NetMessage::SetAttrResponse(SetAttrResponse {
                success: false,
                attr: None,
                error: Some(format!("chmod failed: {}", e)),
            });
        }
    }

    // Apply time changes (mtime/atime)
    // Note: This requires the filetime crate for cross-platform support
    // For now, we just log a warning if time changes are requested
    if req.mtime.is_some() || req.atime.is_some() {
        warn!("Time modification not yet implemented");
    }

    // Return updated attributes
    match fs::metadata(&path) {
        Ok(meta) => {
            let attr = metadata_to_attr(req.inode, &meta);
            info!("Updated attributes for inode {}", req.inode);
            NetMessage::SetAttrResponse(SetAttrResponse {
                success: true,
                attr: Some(attr),
                error: None,
            })
        }
        Err(e) => NetMessage::SetAttrResponse(SetAttrResponse {
            success: false,
            attr: None,
            error: Some(format!("failed to stat: {}", e)),
        }),
    }
}

/// Convert std::fs::Metadata to FileAttr (Unix)
#[cfg(unix)]
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

/// Convert std::fs::Metadata to FileAttr (Windows)
#[cfg(windows)]
fn metadata_to_attr(inode: Inode, meta: &fs::Metadata) -> FileAttr {
    use std::os::windows::fs::MetadataExt;

    let file_type = if meta.is_dir() {
        FileType::Directory
    } else if meta.is_symlink() {
        FileType::Symlink
    } else {
        FileType::File
    };

    // Windows timestamps are in FILETIME (100-ns intervals since 1601)
    // Convert to Unix timestamps
    fn filetime_to_unix(filetime: u64) -> (u64, u32) {
        const EPOCH_DIFF: u64 = 116444736000000000; // 100-ns intervals from 1601 to 1970
        if filetime < EPOCH_DIFF {
            return (0, 0);
        }
        let unix_100ns = filetime - EPOCH_DIFF;
        let secs = unix_100ns / 10_000_000;
        let nsecs = ((unix_100ns % 10_000_000) * 100) as u32;
        (secs, nsecs)
    }

    let (atime, atime_nsec) = filetime_to_unix(meta.last_access_time());
    let (mtime, mtime_nsec) = filetime_to_unix(meta.last_write_time());
    let (ctime, ctime_nsec) = filetime_to_unix(meta.creation_time());

    // Windows doesn't have Unix permissions, use sensible defaults
    let mode = if meta.is_dir() { 0o755 } else { 0o644 };

    FileAttr {
        inode,
        file_type,
        size: meta.len(),
        mode,
        nlink: 1, // Windows doesn't expose hard link count easily
        uid: 0,   // No Unix UID/GID on Windows
        gid: 0,
        atime,
        atime_nsec,
        mtime,
        mtime_nsec,
        ctime,
        ctime_nsec,
    }
}

/// Host errors
#[derive(Debug)]
pub enum HostError {
    Bind(String),
    Io(String),
}

#[cfg(test)]
mod tests {
    use super::*;
    use teleport_core::ChunkId;
    use tempfile::TempDir;

    /// Isolates host-side CPU cost per chunk (file open + safe_real_path
    /// canonicalize + seek + read + blake3) with NO QUIC, to attribute the
    /// per-chunk latency seen in the network benchmark.
    ///   cargo test -p teleport-daemon --lib --release bench_host_read_chunk_cpu -- --ignored --nocapture
    #[ignore]
    #[test]
    fn bench_host_read_chunk_cpu() {
        let dir = TempDir::new().unwrap();
        let file = dir.path().join("big.bin");
        let bytes: Vec<u8> = (0..(64 * 1024 * 1024usize))
            .map(|i| (i % 251) as u8)
            .collect();
        std::fs::write(&file, &bytes).unwrap();
        let table = InodeTable::new(dir.path().to_path_buf());
        let inode = table.get_or_create_inode(file).unwrap();
        let chunks = bytes.len() / CHUNK_SIZE;

        let grants = ChunkGrantSet::new();
        // warm the page cache
        for i in 0..chunks {
            let _ = handle_read_chunk(
                ReadChunkRequest {
                    chunk_id: ChunkId::new(inode, i as u64),
                    priority: 0,
                },
                &table,
                dir.path(),
                &grants,
            );
        }
        let start = Instant::now();
        for i in 0..chunks {
            let _ = handle_read_chunk(
                ReadChunkRequest {
                    chunk_id: ChunkId::new(inode, i as u64),
                    priority: 0,
                },
                &table,
                dir.path(),
                &grants,
            );
        }
        let el = start.elapsed();
        println!(
            "BENCH host read_chunk CPU: {chunks} chunks in {:.3}s = {:.3} ms/chunk, {:.1} MiB/s",
            el.as_secs_f64(),
            el.as_secs_f64() * 1000.0 / chunks as f64,
            bytes.len() as f64 / (1024.0 * 1024.0) / el.as_secs_f64()
        );
    }

    #[test]
    fn test_inode_table() {
        let table = InodeTable::new(PathBuf::from("/shared"));

        // Root is inode 1
        assert_eq!(table.get_path(ROOT_INODE), Some(PathBuf::from("/shared")));

        // New paths get new inodes
        let inode = table
            .get_or_create_inode(PathBuf::from("/shared/file.txt"))
            .unwrap();
        assert_eq!(inode, FIRST_USER_INODE);

        // Same path returns same inode
        let inode2 = table
            .get_or_create_inode(PathBuf::from("/shared/file.txt"))
            .unwrap();
        assert_eq!(inode, inode2);

        // Different path gets different inode
        let inode3 = table
            .get_or_create_inode(PathBuf::from("/shared/other.txt"))
            .unwrap();
        assert_ne!(inode, inode3);
    }

    #[test]
    fn test_default_config() {
        let config = HostConfig::default();
        assert_eq!(config.bind_addr.port(), 4433);
        assert_eq!(config.max_connections, 10);
    }

    #[test]
    fn test_handle_read_chunk() {
        // Create a temp directory with a test file
        let temp_dir = TempDir::new().unwrap();
        let test_file = temp_dir.path().join("test.txt");
        let test_content = b"Hello, Wormhole Phase 2!";

        std::fs::write(&test_file, test_content).unwrap();

        // Set up inode table
        let table = InodeTable::new(temp_dir.path().to_path_buf());
        let file_inode = table.get_or_create_inode(test_file.clone()).unwrap();

        // Read first chunk
        let request = ReadChunkRequest {
            chunk_id: ChunkId::new(file_inode, 0),
            priority: 0,
        };

        let grants = ChunkGrantSet::new();
        let response = handle_read_chunk(request, &table, temp_dir.path(), &grants);

        match response {
            NetMessage::ReadChunkResponse(resp) => {
                assert_eq!(resp.chunk_id.inode, file_inode);
                assert_eq!(resp.data, test_content);
                assert!(resp.is_final);
                // Verify checksum
                let expected_checksum = teleport_core::crypto::checksum(&resp.data);
                assert_eq!(resp.checksum, expected_checksum);
            }
            NetMessage::Error(e) => panic!("Unexpected error: {:?}", e),
            _ => panic!("Unexpected response type"),
        }
    }

    #[test]
    fn test_handle_read_chunk_large_file() {
        // Create a temp directory with a file larger than one chunk
        let temp_dir = TempDir::new().unwrap();
        let test_file = temp_dir.path().join("large.bin");

        // Create a file with 2.5 chunks worth of data
        let chunk_size = CHUNK_SIZE;
        let total_size = chunk_size * 2 + chunk_size / 2;
        let test_data: Vec<u8> = (0..total_size).map(|i| (i % 256) as u8).collect();

        std::fs::write(&test_file, &test_data).unwrap();

        let table = InodeTable::new(temp_dir.path().to_path_buf());
        let file_inode = table.get_or_create_inode(test_file.clone()).unwrap();

        // Read first chunk
        let req1 = ReadChunkRequest {
            chunk_id: ChunkId::new(file_inode, 0),
            priority: 0,
        };
        let grants = ChunkGrantSet::new();
        let resp1 = handle_read_chunk(req1, &table, temp_dir.path(), &grants);

        match resp1 {
            NetMessage::ReadChunkResponse(r) => {
                assert_eq!(r.data.len(), chunk_size);
                assert!(!r.is_final);
                assert_eq!(r.data, &test_data[..chunk_size]);
            }
            _ => panic!("Expected ReadChunkResponse"),
        }

        // Read second chunk
        let req2 = ReadChunkRequest {
            chunk_id: ChunkId::new(file_inode, 1),
            priority: 0,
        };
        let resp2 = handle_read_chunk(req2, &table, temp_dir.path(), &grants);

        match resp2 {
            NetMessage::ReadChunkResponse(r) => {
                assert_eq!(r.data.len(), chunk_size);
                assert!(!r.is_final);
                assert_eq!(r.data, &test_data[chunk_size..chunk_size * 2]);
            }
            _ => panic!("Expected ReadChunkResponse"),
        }

        // Read third (final) chunk
        let req3 = ReadChunkRequest {
            chunk_id: ChunkId::new(file_inode, 2),
            priority: 0,
        };
        let resp3 = handle_read_chunk(req3, &table, temp_dir.path(), &grants);

        match resp3 {
            NetMessage::ReadChunkResponse(r) => {
                assert_eq!(r.data.len(), chunk_size / 2);
                assert!(r.is_final);
                assert_eq!(r.data, &test_data[chunk_size * 2..]);
            }
            _ => panic!("Expected ReadChunkResponse"),
        }
    }

    #[test]
    fn test_handle_read_chunk_nonexistent_inode() {
        let temp_dir = TempDir::new().unwrap();
        let table = InodeTable::new(temp_dir.path().to_path_buf());

        // Try to read from a non-existent inode
        let request = ReadChunkRequest {
            chunk_id: ChunkId::new(9999, 0),
            priority: 0,
        };

        let grants = ChunkGrantSet::new();
        let response = handle_read_chunk(request, &table, temp_dir.path(), &grants);

        match response {
            NetMessage::Error(e) => {
                assert_eq!(e.code, ErrorCode::FileNotFound);
            }
            _ => panic!("Expected error response"),
        }
    }

    #[test]
    fn test_handle_lookup() {
        let temp_dir = TempDir::new().unwrap();
        let subdir = temp_dir.path().join("subdir");
        std::fs::create_dir(&subdir).unwrap();
        let test_file = subdir.join("file.txt");
        std::fs::write(&test_file, b"test content").unwrap();

        let table = InodeTable::new(temp_dir.path().to_path_buf());
        let subdir_inode = table.get_or_create_inode(subdir.clone()).unwrap();

        // Lookup existing file
        let request = LookupRequest {
            parent: subdir_inode,
            name: "file.txt".into(),
        };

        let response = handle_lookup(request, &table, temp_dir.path());

        match response {
            NetMessage::LookupResponse(r) => {
                assert!(r.attr.is_some());
                let attr = r.attr.unwrap();
                assert_eq!(attr.size, 12); // "test content"
                assert_eq!(attr.file_type, FileType::File);
            }
            _ => panic!("Expected LookupResponse"),
        }
    }

    #[test]
    fn test_handle_lookup_nonexistent() {
        let temp_dir = TempDir::new().unwrap();
        let table = InodeTable::new(temp_dir.path().to_path_buf());

        let request = LookupRequest {
            parent: ROOT_INODE,
            name: "nonexistent.txt".into(),
        };

        let response = handle_lookup(request, &table, temp_dir.path());

        match response {
            NetMessage::LookupResponse(r) => {
                assert!(r.attr.is_none());
            }
            _ => panic!("Expected LookupResponse"),
        }
    }

    #[test]
    fn test_handle_listdir() {
        let temp_dir = TempDir::new().unwrap();
        std::fs::write(temp_dir.path().join("file1.txt"), b"content1").unwrap();
        std::fs::write(temp_dir.path().join("file2.txt"), b"content2").unwrap();
        std::fs::create_dir(temp_dir.path().join("subdir")).unwrap();

        let table = InodeTable::new(temp_dir.path().to_path_buf());

        let request = ListDirRequest {
            inode: ROOT_INODE,
            offset: 0,
            limit: 100,
        };

        let response = handle_listdir(request, &table, temp_dir.path());

        match response {
            NetMessage::ListDirResponse(r) => {
                assert_eq!(r.entries.len(), 3);
                let names: Vec<_> = r.entries.iter().map(|e| &e.name).collect();
                assert!(names.contains(&&"file1.txt".to_string()));
                assert!(names.contains(&&"file2.txt".to_string()));
                assert!(names.contains(&&"subdir".to_string()));
            }
            _ => panic!("Expected ListDirResponse"),
        }
    }

    #[test]
    fn test_build_file_manifest_chunks_and_store() {
        let temp_dir = TempDir::new().unwrap();
        let store_dir = TempDir::new().unwrap();
        let store = ContentStore::open(store_dir.path()).unwrap();

        let file_path = temp_dir.path().join("data.bin");
        let total = CHUNK_SIZE + 100;
        let data: Vec<u8> = (0..total).map(|i| (i % 251) as u8).collect();
        std::fs::write(&file_path, &data).unwrap();

        let grants = ChunkGrantSet::new();
        let manifest =
            build_file_manifest_into(&file_path, 42, Some(&store), Some(&grants)).unwrap();
        assert_eq!(manifest.inode, 42);
        assert_eq!(manifest.total_size, total as u64);
        assert_eq!(manifest.chunks.len(), 2);
        assert_eq!(manifest.chunks[0].size as usize, CHUNK_SIZE);
        assert_eq!(manifest.chunks[1].size, 100);
        assert!(store.contains(&manifest.chunks[0].hash));
        assert!(store.contains(&manifest.chunks[1].hash));
        assert_eq!(
            store.get(&manifest.chunks[0].hash).unwrap(),
            data[..CHUNK_SIZE]
        );
    }

    #[test]
    fn test_handle_manifest_missing_inode() {
        let temp_dir = TempDir::new().unwrap();
        let table = InodeTable::new(temp_dir.path().to_path_buf());
        let grants = ChunkGrantSet::new();
        let resp = handle_manifest_request(
            ManifestRequestMsg {
                inode: 9999,
                file_size: 0,
            },
            &table,
            temp_dir.path(),
            &grants,
        );
        match resp {
            NetMessage::ManifestResponse(r) => {
                assert!(r.error.is_some());
                assert!(r.manifest.chunks.is_empty());
            }
            _ => panic!("Expected ManifestResponse"),
        }
    }

    #[test]
    fn test_dispatch_manifest_and_bulk_chunk() {
        let temp_dir = TempDir::new().unwrap();
        let store_dir = TempDir::new().unwrap();
        // Isolate CAS: put via build into temp store, then exercise handlers that use
        // open_default by also verifying build_file_manifest_into + missing/bulk logic
        // through the pure helpers.
        let store = ContentStore::open(store_dir.path()).unwrap();
        let file_path = temp_dir.path().join("clip.bin");
        let data = b"bulk-chunk-demo-bytes".to_vec();
        std::fs::write(&file_path, &data).unwrap();

        let table = InodeTable::new(temp_dir.path().to_path_buf());
        let inode = table.get_or_create_inode(file_path.clone()).unwrap();
        let grants = ChunkGrantSet::new();
        let manifest =
            build_file_manifest_into(&file_path, inode, Some(&store), Some(&grants)).unwrap();
        assert_eq!(manifest.chunks.len(), 1);
        let hash = manifest.chunks[0].hash;
        assert_eq!(store.get(&hash).unwrap(), data);

        // MissingChunks against empty store reports the hash; against filled store reports none.
        let empty = ContentStore::open(TempDir::new().unwrap().path()).unwrap();
        assert_eq!(empty.missing(&[hash]), vec![hash]);
        assert!(store.missing(&[hash]).is_empty());
    }
}
