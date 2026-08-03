//! Wormhole client - connects to remote host and serves FUSE requests

use std::net::SocketAddr;
use std::path::PathBuf;
use std::time::Duration;

use tracing::info;

use teleport_core::{
    BulkChunkRequestMsg, BulkChunkResponseMsg, ChunkId, ContentHash, CreateDirRequest,
    CreateDirResponse, CreateFileRequest, CreateFileResponse, DeleteDirRequest, DeleteDirResponse,
    DeleteFileRequest, DeleteFileResponse, DirEntry, FileAttr, FileManifest, GetAttrRequest,
    GetAttrResponse, HelloMessage, Inode, ListDirRequest, ListDirResponse, LockRequest,
    LockResponse, LockType, LookupRequest, LookupResponse, ManifestRequestMsg,
    ManifestResponseMsg, MissingChunksRequestMsg, MissingChunksResponseMsg, NetMessage,
    ReadChunkRequest, ReadChunkResponse, ReleaseRequest, ReleaseResponse, RenameRequest,
    RenameResponse, SetAttrRequest, SetAttrResponse, WriteChunkRequest, WriteChunkResponse,
    PROTOCOL_VERSION, ROOT_INODE,
};

use crate::bridge::{BridgeHandler, FuseError, FuseRequest};
#[allow(deprecated)] // create_client_endpoint is deprecated but used for LAN/dev mode
use crate::net::{
    connect, create_client_endpoint, negotiate_session_codec, recv_message_with, send_message_with,
    QuicConnection,
};
use crate::sync_engine::SyncEngine;
#[allow(deprecated)] // create_client_endpoint is deprecated but used for dev/LAN mode
use teleport_core::WireCodec;

/// Wormhole client configuration
pub struct ClientConfig {
    pub server_addr: SocketAddr,
    pub mount_point: PathBuf,
    pub request_timeout: Duration,
}

impl Default for ClientConfig {
    fn default() -> Self {
        Self {
            server_addr: "127.0.0.1:4433".parse().unwrap(),
            mount_point: PathBuf::from("/tmp/wormhole"),
            request_timeout: Duration::from_secs(30),
        }
    }
}

/// Wormhole client
pub struct WormholeClient {
    config: ClientConfig,
    connection: Option<QuicConnection>,
    session_id: Option<[u8; 16]>,
    /// Negotiated session wire codec (postcard when both peers advertise it).
    codec: WireCodec,
    root_inode: Inode,
    /// Human device name from HelloAck (e.g. "Studio-Render-Box")
    host_name: Option<String>,
    /// Optional live throughput meter for Portal speed UI
    throughput: Option<std::sync::Arc<crate::throughput::SessionMeter>>,
    /// Sync engine for tracking dirty chunks and locks (Phase 7)
    sync_engine: std::sync::Arc<SyncEngine>,
}

impl WormholeClient {
    pub fn new(config: ClientConfig) -> Self {
        Self {
            config,
            connection: None,
            session_id: None,
            codec: WireCodec::Bincode,
            root_inode: ROOT_INODE,
            host_name: None,
            throughput: None,
            sync_engine: std::sync::Arc::new(SyncEngine::default()),
        }
    }

    /// Peer device name from the HelloAck handshake, if connected.
    pub fn host_name(&self) -> Option<&str> {
        self.host_name.as_deref()
    }

    /// Attach a session meter so FUSE/WinFSP reads update live Portal speed.
    pub fn set_throughput(&mut self, meter: std::sync::Arc<crate::throughput::SessionMeter>) {
        self.throughput = Some(meter);
    }

    /// Get the sync engine (for sharing with FUSE)
    pub fn sync_engine(&self) -> std::sync::Arc<SyncEngine> {
        self.sync_engine.clone()
    }

    /// Set the sync engine (to share with FUSE)
    pub fn set_sync_engine(&mut self, sync_engine: std::sync::Arc<SyncEngine>) {
        self.sync_engine = sync_engine;
    }

    /// Start background sync task that periodically uploads dirty chunks
    /// Call this after connect() and before handle_fuse_requests()
    pub fn start_background_sync(&self, sync_engine: std::sync::Arc<SyncEngine>) {
        use crate::sync_engine::SyncRunner;
        use tracing::{debug, warn};

        let conn = match self.connection.as_ref() {
            Some(c) => c.clone(),
            None => {
                warn!("Cannot start background sync: not connected");
                return;
            }
        };
        let codec = self.codec;

        let runner = SyncRunner::new(sync_engine, std::time::Duration::from_secs(1));

        tokio::spawn(async move {
            runner
                .run_loop(|chunk_id, data, lock_token| {
                    let conn = conn.clone();
                    async move {
                        // Open a new stream for this upload
                        let (mut send, mut recv) = conn
                            .open_stream()
                            .await
                            .map_err(|e| format!("stream error: {:?}", e))?;

                        let checksum = teleport_core::crypto::checksum(&data);
                        let lock_token = lock_token.unwrap_or_default();

                        let request = NetMessage::WriteChunk(WriteChunkRequest {
                            chunk_id,
                            data,
                            checksum,
                            lock_token,
                        });

                        send_message_with(&mut send, &request, codec)
                            .await
                            .map_err(|e| format!("send error: {:?}", e))?;

                        let response = recv_message_with(&mut recv, codec)
                            .await
                            .map_err(|e| format!("recv error: {:?}", e))?;

                        match response {
                            NetMessage::WriteChunkResponse(WriteChunkResponse {
                                success: true,
                                ..
                            }) => {
                                debug!("Background sync: uploaded chunk {:?}", chunk_id);
                                Ok(())
                            }
                            NetMessage::WriteChunkResponse(WriteChunkResponse {
                                success: false,
                                ..
                            }) => Err("write rejected by host".into()),
                            NetMessage::Error(e) => Err(format!("{:?}: {}", e.code, e.message)),
                            _ => Err("unexpected response".into()),
                        }
                    }
                })
                .await;
        });

        info!("Started background sync task");
    }

    /// Connect to the server and perform handshake
    #[allow(deprecated)] // Using insecure endpoint for LAN/dev connections
    pub async fn connect(&mut self) -> Result<(), ClientError> {
        let endpoint =
            create_client_endpoint().map_err(|e| ClientError::Connection(format!("{:?}", e)))?;

        let conn = connect(&endpoint, self.config.server_addr, "localhost")
            .await
            .map_err(|e| ClientError::Connection(format!("{:?}", e)))?;

        // Perform handshake
        let (mut send, mut recv) = conn
            .open_stream()
            .await
            .map_err(|e| ClientError::Connection(format!("{:?}", e)))?;

        // Send Hello
        let mut client_id = [0u8; 16];
        getrandom::fill(&mut client_id).expect("RNG failed - system entropy source unavailable");

        let hello = NetMessage::Hello(HelloMessage {
            protocol_version: PROTOCOL_VERSION,
            client_id,
            capabilities: crate::net::client_capabilities(),
        });

        // Send Hello with timeout
        tokio::time::timeout(
            self.config.request_timeout,
            send_message_with(&mut send, &hello, self.codec),
        )
        .await
        .map_err(|_| ClientError::Connection("timeout sending Hello".into()))?
        .map_err(|e| ClientError::Connection(format!("{:?}", e)))?;

        // Receive HelloAck with timeout (handshake remains bincode)
        let response = tokio::time::timeout(
            self.config.request_timeout,
            recv_message_with(&mut recv, self.codec),
        )
        .await
        .map_err(|_| ClientError::Connection("timeout waiting for HelloAck".into()))?
        .map_err(|e| ClientError::Connection(format!("{:?}", e)))?;

        match response {
            NetMessage::HelloAck(ack) => {
                // Accept same major lineage (v1 legacy hosts and v2 postcard-capable).
                if ack.protocol_version == 0 || ack.protocol_version > PROTOCOL_VERSION {
                    return Err(ClientError::VersionMismatch {
                        expected: PROTOCOL_VERSION,
                        actual: ack.protocol_version,
                    });
                }
                self.session_id = Some(ack.session_id);
                self.root_inode = ack.root_inode;
                self.host_name = Some(ack.host_name.clone());
                self.codec =
                    negotiate_session_codec(&crate::net::client_capabilities(), &ack.capabilities);
                info!(
                    host = %ack.host_name,
                    codec = ?self.codec,
                    "Connected to host"
                );
            }
            NetMessage::Error(e) => {
                return Err(ClientError::ServerError(e.message));
            }
            _ => {
                return Err(ClientError::Protocol("unexpected response to Hello".into()));
            }
        }

        self.connection = Some(conn);
        Ok(())
    }

    /// Handle FUSE requests from the bridge
    pub async fn handle_fuse_requests(
        &self,
        request_rx: crossbeam_channel::Receiver<FuseRequest>,
    ) -> Result<(), ClientError> {
        // Verify we're connected before starting the handler
        let _conn = self.connection.as_ref().ok_or(ClientError::NotConnected)?;

        let handler = BridgeHandler::new(request_rx);

        handler
            .run(|request| async {
                match request {
                    FuseRequest::Lookup {
                        parent,
                        name,
                        reply,
                    } => {
                        let result = self.lookup(parent, &name).await;
                        let _ = reply.send(result);
                    }
                    FuseRequest::GetAttr { inode, reply } => {
                        let result = self.getattr(inode).await;
                        let _ = reply.send(result);
                    }
                    FuseRequest::ReadDir {
                        inode,
                        offset,
                        reply,
                    } => {
                        let result = self.readdir(inode, offset).await;
                        let _ = reply.send(result);
                    }
                    FuseRequest::Read {
                        inode,
                        offset,
                        size,
                        reply,
                    } => {
                        let result = self.read(inode, offset, size).await;
                        if let (Ok(ref data), Some(meter)) = (&result, &self.throughput) {
                            meter.record(data.len() as u64);
                        }
                        let _ = reply.send(result);
                    }
                    // Phase 7: Write operations
                    FuseRequest::Write {
                        inode,
                        offset,
                        data,
                        reply,
                    } => {
                        let nbytes = data.len() as u64;
                        let result = self.write(inode, offset, data).await;
                        if result.is_ok() {
                            if let Some(meter) = &self.throughput {
                                meter.record(nbytes);
                            }
                        }
                        let _ = reply.send(result);
                    }
                    FuseRequest::AcquireLock {
                        inode,
                        exclusive,
                        reply,
                    } => {
                        let result = self.acquire_lock(inode, exclusive).await;
                        let _ = reply.send(result);
                    }
                    FuseRequest::ReleaseLock { inode, reply } => {
                        let result = self.release_lock(inode).await;
                        let _ = reply.send(result);
                    }
                    FuseRequest::Flush { inode, reply } => {
                        let result = self.flush(inode).await;
                        let _ = reply.send(result);
                    }
                    // Phase 7: File operations
                    FuseRequest::CreateFile {
                        parent,
                        name,
                        mode,
                        reply,
                    } => {
                        let result = self.create_file(parent, &name, mode).await;
                        let _ = reply.send(result);
                    }
                    FuseRequest::DeleteFile {
                        parent,
                        name,
                        reply,
                    } => {
                        let result = self.delete_file(parent, &name).await;
                        let _ = reply.send(result);
                    }
                    FuseRequest::CreateDir {
                        parent,
                        name,
                        mode,
                        reply,
                    } => {
                        let result = self.create_dir(parent, &name, mode).await;
                        let _ = reply.send(result);
                    }
                    FuseRequest::DeleteDir {
                        parent,
                        name,
                        reply,
                    } => {
                        let result = self.delete_dir(parent, &name).await;
                        let _ = reply.send(result);
                    }
                    FuseRequest::Rename {
                        old_parent,
                        old_name,
                        new_parent,
                        new_name,
                        reply,
                    } => {
                        let result = self
                            .rename(old_parent, &old_name, new_parent, &new_name)
                            .await;
                        let _ = reply.send(result);
                    }
                    FuseRequest::SetAttr {
                        inode,
                        size,
                        mode,
                        mtime,
                        atime,
                        reply,
                    } => {
                        let result = self.setattr(inode, size, mode, mtime, atime).await;
                        let _ = reply.send(result);
                    }
                    FuseRequest::Shutdown => {
                        // Handler will exit
                    }
                }
            })
            .await;

        Ok(())
    }

    /// Look up a file by name
    pub async fn lookup(&self, parent: Inode, name: &str) -> Result<FileAttr, FuseError> {
        let conn = self.connection.as_ref().ok_or(FuseError::Shutdown)?;

        let (mut send, mut recv) = conn
            .open_stream()
            .await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        let request = NetMessage::Lookup(LookupRequest {
            parent,
            name: name.to_string(),
        });

        send_message_with(&mut send, &request, self.codec)
            .await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        let response = recv_message_with(&mut recv, self.codec)
            .await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        match response {
            NetMessage::LookupResponse(LookupResponse { attr: Some(attr) }) => Ok(attr),
            NetMessage::LookupResponse(LookupResponse { attr: None }) => Err(FuseError::NotFound),
            NetMessage::Error(e) => Err(FuseError::IoError(format!("{:?}: {}", e.code, e.message))),
            _ => Err(FuseError::Internal("unexpected response".into())),
        }
    }

    /// Get file attributes
    pub async fn getattr(&self, inode: Inode) -> Result<FileAttr, FuseError> {
        let conn = self.connection.as_ref().ok_or(FuseError::Shutdown)?;

        let (mut send, mut recv) = conn
            .open_stream()
            .await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        let request = NetMessage::GetAttr(GetAttrRequest { inode });

        send_message_with(&mut send, &request, self.codec)
            .await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        let response = recv_message_with(&mut recv, self.codec)
            .await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        match response {
            NetMessage::GetAttrResponse(GetAttrResponse { attr: Some(attr) }) => Ok(attr),
            NetMessage::GetAttrResponse(GetAttrResponse { attr: None }) => Err(FuseError::NotFound),
            NetMessage::Error(e) => Err(FuseError::IoError(format!("{:?}: {}", e.code, e.message))),
            _ => Err(FuseError::Internal("unexpected response".into())),
        }
    }

    /// Read directory contents
    pub async fn readdir(&self, inode: Inode, offset: u64) -> Result<Vec<DirEntry>, FuseError> {
        let conn = self.connection.as_ref().ok_or(FuseError::Shutdown)?;

        let (mut send, mut recv) = conn
            .open_stream()
            .await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        let request = NetMessage::ListDir(ListDirRequest {
            inode,
            offset,
            limit: 1000,
        });

        send_message_with(&mut send, &request, self.codec)
            .await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        let response = recv_message_with(&mut recv, self.codec)
            .await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        match response {
            NetMessage::ListDirResponse(ListDirResponse { entries, .. }) => Ok(entries),
            NetMessage::Error(e) => Err(FuseError::IoError(format!("{:?}: {}", e.code, e.message))),
            _ => Err(FuseError::Internal("unexpected response".into())),
        }
    }

    /// Read file data
    pub async fn read(&self, inode: Inode, offset: u64, size: u32) -> Result<Vec<u8>, FuseError> {
        let conn = self.connection.as_ref().ok_or(FuseError::Shutdown)?;

        let (mut send, mut recv) = conn
            .open_stream()
            .await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        let chunk_id = ChunkId::from_offset(inode, offset);

        let request = NetMessage::ReadChunk(ReadChunkRequest {
            chunk_id,
            priority: 0,
        });

        send_message_with(&mut send, &request, self.codec)
            .await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        let response = recv_message_with(&mut recv, self.codec)
            .await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        match response {
            NetMessage::ReadChunkResponse(ReadChunkResponse { data, checksum, .. }) => {
                // Verify checksum
                let computed = teleport_core::crypto::checksum(&data);
                if computed != checksum {
                    return Err(FuseError::IoError("checksum mismatch".into()));
                }

                // Extract requested portion.
                // Bounds-check the in-chunk offset: a host (malicious or buggy) can
                // return a chunk shorter than the requested offset, and the checksum
                // is computed over whatever `data` was sent, so it does not protect us.
                // Without this guard `data[chunk_offset..chunk_offset]` panics (slice
                // start > len), aborting the FUSE request loop and hanging the mount.
                let chunk_offset = ChunkId::offset_in_chunk(offset);
                if chunk_offset >= data.len() {
                    return Ok(Vec::new());
                }
                let available = data.len() - chunk_offset;
                let to_read = std::cmp::min(size as usize, available);

                Ok(data[chunk_offset..chunk_offset + to_read].to_vec())
            }
            NetMessage::Error(e) => Err(FuseError::IoError(format!("{:?}: {}", e.code, e.message))),
            _ => Err(FuseError::Internal("unexpected response".into())),
        }
    }

    /// Fetch a content-addressed chunk by BLAKE3 hash (bulk / magnet path).
    pub async fn fetch_bulk_chunk(
        &self,
        hash: ContentHash,
        priority: u8,
        transfer_id: u64,
    ) -> Result<Vec<u8>, FuseError> {
        let conn = self.connection.as_ref().ok_or(FuseError::Shutdown)?;

        let (mut send, mut recv) = conn
            .open_stream()
            .await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        let request = NetMessage::BulkChunkRequest(BulkChunkRequestMsg {
            hash,
            priority,
            transfer_id,
        });

        send_message_with(&mut send, &request, self.codec)
            .await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        let response = recv_message_with(&mut recv, self.codec)
            .await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        match response {
            NetMessage::BulkChunkResponse(BulkChunkResponseMsg {
                hash: resp_hash,
                data,
                error,
                ..
            }) => {
                if let Some(err) = error {
                    return Err(FuseError::IoError(err));
                }
                if ContentHash::compute(&data) != resp_hash || resp_hash != hash {
                    return Err(FuseError::IoError("content hash mismatch".into()));
                }
                Ok(data)
            }
            NetMessage::Error(e) => Err(FuseError::IoError(format!("{:?}: {}", e.code, e.message))),
            _ => Err(FuseError::Internal("unexpected response".into())),
        }
    }

    /// Request a content-addressed file manifest from the host.
    pub async fn request_manifest(
        &self,
        inode: Inode,
        file_size: u64,
    ) -> Result<FileManifest, FuseError> {
        let conn = self.connection.as_ref().ok_or(FuseError::Shutdown)?;

        let (mut send, mut recv) = conn
            .open_stream()
            .await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        let request = NetMessage::ManifestRequest(ManifestRequestMsg { inode, file_size });

        send_message_with(&mut send, &request, self.codec)
            .await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        let response = recv_message_with(&mut recv, self.codec)
            .await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        match response {
            NetMessage::ManifestResponse(ManifestResponseMsg { manifest, error }) => {
                if let Some(err) = error {
                    return Err(FuseError::IoError(err));
                }
                Ok(manifest)
            }
            NetMessage::Error(e) => Err(FuseError::IoError(format!("{:?}: {}", e.code, e.message))),
            _ => Err(FuseError::Internal("unexpected response".into())),
        }
    }

    /// Ask the host which hashes from `manifest` are missing locally on the host
    /// (used for reverse-dedup / mesh negotiation).
    pub async fn request_missing_chunks(
        &self,
        manifest: FileManifest,
    ) -> Result<MissingChunksResponseMsg, FuseError> {
        let conn = self.connection.as_ref().ok_or(FuseError::Shutdown)?;

        let (mut send, mut recv) = conn
            .open_stream()
            .await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        let request = NetMessage::MissingChunksRequest(MissingChunksRequestMsg { manifest });

        send_message_with(&mut send, &request, self.codec)
            .await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        let response = recv_message_with(&mut recv, self.codec)
            .await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        match response {
            NetMessage::MissingChunksResponse(msg) => Ok(msg),
            NetMessage::Error(e) => Err(FuseError::IoError(format!("{:?}: {}", e.code, e.message))),
            _ => Err(FuseError::Internal("unexpected response".into())),
        }
    }

    /// Write file data (Phase 7)
    async fn write(&self, inode: Inode, offset: u64, data: Vec<u8>) -> Result<u32, FuseError> {
        let conn = self.connection.as_ref().ok_or(FuseError::Shutdown)?;

        // Check if we have a lock for this file
        let lock_token = self
            .sync_engine
            .get_lock_token(inode)
            .ok_or(FuseError::LockRequired)?;

        let (mut send, mut recv) = conn
            .open_stream()
            .await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        // Write chunk by chunk
        let chunk_size = teleport_core::CHUNK_SIZE as u64;
        let start_chunk = offset / chunk_size;
        let end_offset = offset + data.len() as u64;
        let end_chunk = if end_offset == 0 {
            0
        } else {
            (end_offset - 1) / chunk_size
        };

        let mut total_written = 0u32;

        for chunk_idx in start_chunk..=end_chunk {
            let chunk_id = ChunkId::new(inode, chunk_idx);
            let chunk_start = chunk_idx * chunk_size;

            // Calculate what portion of data goes to this chunk
            let _offset_in_chunk = (offset.max(chunk_start) - chunk_start) as usize;
            let data_start = ((chunk_start as i64 - offset as i64).max(0)) as usize;
            let data_end =
                ((chunk_start + chunk_size) as i64 - offset as i64).min(data.len() as i64) as usize;

            if data_start >= data.len() || data_end <= data_start {
                continue;
            }

            let chunk_data = data[data_start..data_end].to_vec();
            let checksum = teleport_core::crypto::checksum(&chunk_data);

            let request = NetMessage::WriteChunk(WriteChunkRequest {
                chunk_id,
                data: chunk_data.clone(),
                checksum,
                lock_token: lock_token.clone(),
            });

            send_message_with(&mut send, &request, self.codec)
                .await
                .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

            let response = recv_message_with(&mut recv, self.codec)
                .await
                .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

            match response {
                NetMessage::WriteChunkResponse(WriteChunkResponse { success: true, .. }) => {
                    total_written += chunk_data.len() as u32;
                    // Mark as synced in sync engine
                    self.sync_engine.mark_synced(&chunk_id);
                }
                NetMessage::WriteChunkResponse(WriteChunkResponse { success: false, .. }) => {
                    return Err(FuseError::IoError("write failed on host".into()));
                }
                NetMessage::Error(e) => {
                    return Err(FuseError::IoError(format!("{:?}: {}", e.code, e.message)));
                }
                _ => return Err(FuseError::Internal("unexpected response".into())),
            }
        }

        Ok(total_written)
    }

    /// Acquire a lock on a file (Phase 7)
    async fn acquire_lock(&self, inode: Inode, exclusive: bool) -> Result<(), FuseError> {
        let conn = self.connection.as_ref().ok_or(FuseError::Shutdown)?;

        let (mut send, mut recv) = conn
            .open_stream()
            .await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        let lock_type = if exclusive {
            LockType::Exclusive
        } else {
            LockType::Shared
        };

        let request = NetMessage::AcquireLock(LockRequest {
            inode,
            lock_type,
            timeout_ms: 30000, // 30 second lock TTL
        });

        send_message_with(&mut send, &request, self.codec)
            .await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        let response = recv_message_with(&mut recv, self.codec)
            .await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        match response {
            NetMessage::AcquireLockResponse(LockResponse {
                granted: true,
                token: Some(token),
                ..
            }) => {
                // Store lock in sync engine
                self.sync_engine.store_lock(
                    inode,
                    token,
                    lock_type,
                    std::time::Duration::from_secs(30),
                );
                Ok(())
            }
            NetMessage::AcquireLockResponse(LockResponse {
                granted: false,
                holder,
                retry_after_ms,
                ..
            }) => {
                let msg = format!(
                    "lock conflict: held by {:?}, retry after {:?}ms",
                    holder, retry_after_ms
                );
                Err(FuseError::LockConflict(msg))
            }
            NetMessage::Error(e) => Err(FuseError::IoError(format!("{:?}: {}", e.code, e.message))),
            _ => Err(FuseError::Internal("unexpected response".into())),
        }
    }

    /// Release a lock on a file (Phase 7)
    async fn release_lock(&self, inode: Inode) -> Result<(), FuseError> {
        let conn = self.connection.as_ref().ok_or(FuseError::Shutdown)?;

        // Get the lock token
        let lock_token = match self.sync_engine.get_lock_token(inode) {
            Some(token) => token,
            None => return Ok(()), // No lock held, nothing to release
        };

        let (mut send, mut recv) = conn
            .open_stream()
            .await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        let request = NetMessage::ReleaseLock(ReleaseRequest { token: lock_token });

        send_message_with(&mut send, &request, self.codec)
            .await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        let response = recv_message_with(&mut recv, self.codec)
            .await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        match response {
            NetMessage::ReleaseLockResponse(ReleaseResponse { success: true }) => {
                // Remove lock from sync engine
                self.sync_engine.remove_lock(inode);
                Ok(())
            }
            NetMessage::ReleaseLockResponse(ReleaseResponse { success: false }) => {
                // Lock may have expired, still remove from local tracking
                self.sync_engine.remove_lock(inode);
                Ok(())
            }
            NetMessage::Error(e) => Err(FuseError::IoError(format!("{:?}: {}", e.code, e.message))),
            _ => Err(FuseError::Internal("unexpected response".into())),
        }
    }

    /// Flush dirty data for a file (Phase 7)
    async fn flush(&self, inode: Inode) -> Result<(), FuseError> {
        // Get all dirty chunks for this inode
        let dirty_chunks = self.sync_engine.get_dirty_chunks_for_inode(inode);

        if dirty_chunks.is_empty() {
            return Ok(());
        }

        let conn = self.connection.as_ref().ok_or(FuseError::Shutdown)?;

        // Check if we have a lock
        let lock_token = self
            .sync_engine
            .get_lock_token(inode)
            .ok_or(FuseError::LockRequired)?;

        for (chunk_id, dirty_chunk) in dirty_chunks {
            let (mut send, mut recv) = conn
                .open_stream()
                .await
                .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

            let checksum = teleport_core::crypto::checksum(&dirty_chunk.data);

            let request = NetMessage::WriteChunk(WriteChunkRequest {
                chunk_id,
                data: dirty_chunk.data,
                checksum,
                lock_token: lock_token.clone(),
            });

            send_message_with(&mut send, &request, self.codec)
                .await
                .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

            let response = recv_message_with(&mut recv, self.codec)
                .await
                .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

            match response {
                NetMessage::WriteChunkResponse(WriteChunkResponse { success: true, .. }) => {
                    self.sync_engine.mark_synced(&chunk_id);
                }
                NetMessage::WriteChunkResponse(WriteChunkResponse { success: false, .. }) => {
                    self.sync_engine
                        .mark_sync_failed(&chunk_id, "write failed on host".into());
                    return Err(FuseError::IoError("flush failed".into()));
                }
                NetMessage::Error(e) => {
                    self.sync_engine
                        .mark_sync_failed(&chunk_id, format!("{:?}", e.code));
                    return Err(FuseError::IoError(format!("{:?}: {}", e.code, e.message)));
                }
                _ => return Err(FuseError::Internal("unexpected response".into())),
            }
        }

        Ok(())
    }

    /// Create a file (Phase 7)
    async fn create_file(
        &self,
        parent: Inode,
        name: &str,
        mode: u32,
    ) -> Result<FileAttr, FuseError> {
        let conn = self.connection.as_ref().ok_or(FuseError::Shutdown)?;

        let (mut send, mut recv) = conn
            .open_stream()
            .await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        let lock_token = self.sync_engine.get_lock_token(parent);

        let request = NetMessage::CreateFile(CreateFileRequest {
            parent,
            name: name.to_string(),
            mode,
            lock_token,
        });

        send_message_with(&mut send, &request, self.codec)
            .await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        let response = recv_message_with(&mut recv, self.codec)
            .await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        match response {
            NetMessage::CreateFileResponse(CreateFileResponse {
                success: true,
                attr: Some(attr),
                ..
            }) => Ok(attr),
            NetMessage::CreateFileResponse(CreateFileResponse {
                success: false,
                error: Some(err),
                ..
            }) => Err(FuseError::IoError(err)),
            NetMessage::Error(e) => Err(FuseError::IoError(format!("{:?}: {}", e.code, e.message))),
            _ => Err(FuseError::Internal("unexpected response".into())),
        }
    }

    /// Delete a file (Phase 7)
    async fn delete_file(&self, parent: Inode, name: &str) -> Result<(), FuseError> {
        let conn = self.connection.as_ref().ok_or(FuseError::Shutdown)?;

        let (mut send, mut recv) = conn
            .open_stream()
            .await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        let lock_token = self.sync_engine.get_lock_token(parent);

        let request = NetMessage::DeleteFile(DeleteFileRequest {
            parent,
            name: name.to_string(),
            lock_token,
        });

        send_message_with(&mut send, &request, self.codec)
            .await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        let response = recv_message_with(&mut recv, self.codec)
            .await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        match response {
            NetMessage::DeleteFileResponse(DeleteFileResponse { success: true, .. }) => Ok(()),
            NetMessage::DeleteFileResponse(DeleteFileResponse {
                success: false,
                error: Some(err),
            }) => Err(FuseError::IoError(err)),
            NetMessage::Error(e) => Err(FuseError::IoError(format!("{:?}: {}", e.code, e.message))),
            _ => Err(FuseError::Internal("unexpected response".into())),
        }
    }

    /// Create a directory (Phase 7)
    async fn create_dir(
        &self,
        parent: Inode,
        name: &str,
        mode: u32,
    ) -> Result<FileAttr, FuseError> {
        let conn = self.connection.as_ref().ok_or(FuseError::Shutdown)?;

        let (mut send, mut recv) = conn
            .open_stream()
            .await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        let request = NetMessage::CreateDir(CreateDirRequest {
            parent,
            name: name.to_string(),
            mode,
        });

        send_message_with(&mut send, &request, self.codec)
            .await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        let response = recv_message_with(&mut recv, self.codec)
            .await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        match response {
            NetMessage::CreateDirResponse(CreateDirResponse {
                success: true,
                attr: Some(attr),
                ..
            }) => Ok(attr),
            NetMessage::CreateDirResponse(CreateDirResponse {
                success: false,
                error: Some(err),
                ..
            }) => Err(FuseError::IoError(err)),
            NetMessage::Error(e) => Err(FuseError::IoError(format!("{:?}: {}", e.code, e.message))),
            _ => Err(FuseError::Internal("unexpected response".into())),
        }
    }

    /// Delete a directory (Phase 7)
    async fn delete_dir(&self, parent: Inode, name: &str) -> Result<(), FuseError> {
        let conn = self.connection.as_ref().ok_or(FuseError::Shutdown)?;

        let (mut send, mut recv) = conn
            .open_stream()
            .await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        let request = NetMessage::DeleteDir(DeleteDirRequest {
            parent,
            name: name.to_string(),
        });

        send_message_with(&mut send, &request, self.codec)
            .await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        let response = recv_message_with(&mut recv, self.codec)
            .await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        match response {
            NetMessage::DeleteDirResponse(DeleteDirResponse { success: true, .. }) => Ok(()),
            NetMessage::DeleteDirResponse(DeleteDirResponse {
                success: false,
                error: Some(err),
            }) => Err(FuseError::IoError(err)),
            NetMessage::Error(e) => Err(FuseError::IoError(format!("{:?}: {}", e.code, e.message))),
            _ => Err(FuseError::Internal("unexpected response".into())),
        }
    }

    /// Rename a file or directory (Phase 7)
    async fn rename(
        &self,
        old_parent: Inode,
        old_name: &str,
        new_parent: Inode,
        new_name: &str,
    ) -> Result<(), FuseError> {
        let conn = self.connection.as_ref().ok_or(FuseError::Shutdown)?;

        let (mut send, mut recv) = conn
            .open_stream()
            .await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        let lock_token = self.sync_engine.get_lock_token(old_parent);

        let request = NetMessage::Rename(RenameRequest {
            old_parent,
            old_name: old_name.to_string(),
            new_parent,
            new_name: new_name.to_string(),
            lock_token,
        });

        send_message_with(&mut send, &request, self.codec)
            .await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        let response = recv_message_with(&mut recv, self.codec)
            .await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        match response {
            NetMessage::RenameResponse(RenameResponse { success: true, .. }) => Ok(()),
            NetMessage::RenameResponse(RenameResponse {
                success: false,
                error: Some(err),
            }) => Err(FuseError::IoError(err)),
            NetMessage::Error(e) => Err(FuseError::IoError(format!("{:?}: {}", e.code, e.message))),
            _ => Err(FuseError::Internal("unexpected response".into())),
        }
    }

    /// Set file attributes (Phase 7)
    async fn setattr(
        &self,
        inode: Inode,
        size: Option<u64>,
        mode: Option<u32>,
        mtime: Option<u64>,
        atime: Option<u64>,
    ) -> Result<FileAttr, FuseError> {
        let conn = self.connection.as_ref().ok_or(FuseError::Shutdown)?;

        let (mut send, mut recv) = conn
            .open_stream()
            .await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        let lock_token = self.sync_engine.get_lock_token(inode);

        let request = NetMessage::SetAttr(SetAttrRequest {
            inode,
            size,
            mode,
            mtime,
            atime,
            lock_token,
        });

        send_message_with(&mut send, &request, self.codec)
            .await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        let response = recv_message_with(&mut recv, self.codec)
            .await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        match response {
            NetMessage::SetAttrResponse(SetAttrResponse {
                success: true,
                attr: Some(attr),
                ..
            }) => Ok(attr),
            NetMessage::SetAttrResponse(SetAttrResponse {
                success: false,
                error: Some(err),
                ..
            }) => Err(FuseError::IoError(err)),
            NetMessage::Error(e) => Err(FuseError::IoError(format!("{:?}: {}", e.code, e.message))),
            _ => Err(FuseError::Internal("unexpected response".into())),
        }
    }
}

/// Client errors
#[derive(Debug)]
pub enum ClientError {
    NotConnected,
    Connection(String),
    Protocol(String),
    ServerError(String),
    VersionMismatch { expected: u32, actual: u32 },
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::host::{HostConfig, WormholeHost};
    use std::net::{SocketAddr, UdpSocket};
    use teleport_core::{FileType, CHUNK_SIZE};

    #[test]
    fn test_default_config() {
        let config = ClientConfig::default();
        assert_eq!(config.server_addr.port(), 4433);
    }

    /// Pick a currently-free UDP port on loopback for the test host to bind.
    fn free_loopback_addr() -> SocketAddr {
        let sock = UdpSocket::bind("127.0.0.1:0").expect("bind ephemeral udp");
        let addr = sock.local_addr().expect("local_addr");
        drop(sock);
        addr
    }

    /// Deterministic pseudo-random bytes so the test corpus is stable across runs
    /// (we cannot use rand in a way that varies, and we want exact byte comparison).
    fn pseudo_bytes(len: usize) -> Vec<u8> {
        let mut out = Vec::with_capacity(len);
        let mut state: u32 = 0x9e3779b9;
        for _ in 0..len {
            // xorshift32
            state ^= state << 13;
            state ^= state >> 17;
            state ^= state << 5;
            out.push((state & 0xff) as u8);
        }
        out
    }

    /// Read an entire file through the client by looping over chunk-sized reads,
    /// exactly as the FUSE layer would for a sequential read.
    async fn read_whole_file(client: &WormholeClient, inode: Inode, size: u64) -> Vec<u8> {
        let mut buf = Vec::with_capacity(size as usize);
        let mut offset = 0u64;
        while offset < size {
            let want = std::cmp::min(CHUNK_SIZE as u64, size - offset) as u32;
            let part = client.read(inode, offset, want).await.expect("read chunk");
            assert!(!part.is_empty(), "read returned 0 bytes at offset {offset}");
            offset += part.len() as u64;
            buf.extend_from_slice(&part);
        }
        buf
    }

    /// Full end-to-end proof that the product's data plane works over real QUIC:
    /// a host serving a real directory, a client connecting over the network,
    /// listing the directory, looking up files, and reading their bytes back
    /// — including a multi-chunk file — with exact byte and checksum verification.
    ///
    /// This is the regression guard for "the product actually works".
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn e2e_host_serve_client_read_over_quic() {
        // 1. Build a known corpus on disk.
        let dir = tempfile::TempDir::new().unwrap();
        let small = b"hello wormhole over QUIC\n";
        std::fs::write(dir.path().join("small.txt"), small).unwrap();

        // A file spanning multiple 128KB chunks plus a partial trailing chunk.
        let big = pseudo_bytes(CHUNK_SIZE * 2 + 12_345);
        std::fs::write(dir.path().join("big.bin"), &big).unwrap();

        std::fs::create_dir(dir.path().join("sub")).unwrap();
        std::fs::write(dir.path().join("sub").join("nested.txt"), b"nested").unwrap();

        // 2. Start a real host on a free loopback port.
        let addr = free_loopback_addr();
        let host = WormholeHost::new(HostConfig {
            bind_addr: addr,
            shared_path: dir.path().to_path_buf(),
            max_connections: 4,
            host_name: "test-host".into(),
        });
        tokio::spawn(async move {
            let _ = host.serve().await;
        });

        // 3. Connect a client, retrying briefly while the host binds.
        let mut client = WormholeClient::new(ClientConfig {
            server_addr: addr,
            mount_point: dir.path().to_path_buf(),
            request_timeout: Duration::from_secs(5),
        });
        let mut connected = false;
        for _ in 0..50 {
            if client.connect().await.is_ok() {
                connected = true;
                break;
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
        assert!(connected, "client failed to connect to host over QUIC");

        // 4. List the root directory.
        let entries = client.readdir(ROOT_INODE, 0).await.expect("readdir root");
        let names: std::collections::HashSet<&str> =
            entries.iter().map(|e| e.name.as_str()).collect();
        assert!(names.contains("small.txt"), "missing small.txt: {names:?}");
        assert!(names.contains("big.bin"), "missing big.bin: {names:?}");
        assert!(names.contains("sub"), "missing sub dir: {names:?}");

        // 5. Look up + read the small file; bytes must match exactly.
        let small_attr = client
            .lookup(ROOT_INODE, "small.txt")
            .await
            .expect("lookup small");
        assert_eq!(small_attr.file_type, FileType::File);
        assert_eq!(small_attr.size, small.len() as u64);
        let got_small = read_whole_file(&client, small_attr.inode, small_attr.size).await;
        assert_eq!(got_small, small, "small.txt content mismatch over the wire");

        // 6. Look up + read the multi-chunk file; bytes must match exactly.
        let big_attr = client
            .lookup(ROOT_INODE, "big.bin")
            .await
            .expect("lookup big");
        assert_eq!(big_attr.size, big.len() as u64);
        let got_big = read_whole_file(&client, big_attr.inode, big_attr.size).await;
        assert_eq!(got_big.len(), big.len(), "big.bin length mismatch");
        assert!(got_big == big, "big.bin content mismatch over the wire");

        // 7. Descend into a subdirectory and read a nested file.
        let sub_attr = client.lookup(ROOT_INODE, "sub").await.expect("lookup sub");
        assert_eq!(sub_attr.file_type, FileType::Directory);
        let nested_attr = client
            .lookup(sub_attr.inode, "nested.txt")
            .await
            .expect("lookup nested");
        let got_nested = read_whole_file(&client, nested_attr.inode, nested_attr.size).await;
        assert_eq!(got_nested, b"nested");

        // 8. A missing file must report NotFound, not garbage.
        let missing = client.lookup(ROOT_INODE, "does-not-exist.txt").await;
        assert!(
            matches!(missing, Err(FuseError::NotFound)),
            "expected NotFound, got {missing:?}"
        );

        // 9. CAS magnet path: reading seeds the host content store; BulkChunk
        //    by BLAKE3 hash must round-trip (fetch --from data plane).
        let chunk_hash = teleport_core::ContentHash::compute(small);
        let magnet_bytes = client
            .fetch_bulk_chunk(chunk_hash, 255, 1)
            .await
            .expect("bulk chunk by hash after seeded read");
        assert_eq!(magnet_bytes, small);

        let manifest = client
            .request_manifest(small_attr.inode, small_attr.size)
            .await
            .expect("manifest for small.txt");
        assert!(!manifest.chunks.is_empty());
        assert_eq!(manifest.chunks[0].hash, chunk_hash);
    }

    /// Explicit mesh_fetch helper over a live host (same path as `wormhole fetch --from`).
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn e2e_fetch_hash_from_addr_over_quic() {
        let dir = tempfile::TempDir::new().unwrap();
        let payload = b"magnet-mesh-payload-v1";
        std::fs::write(dir.path().join("blob.bin"), payload).unwrap();

        let addr = free_loopback_addr();
        let host = WormholeHost::new(HostConfig {
            bind_addr: addr,
            shared_path: dir.path().to_path_buf(),
            max_connections: 4,
            host_name: "magnet-host".into(),
        });
        tokio::spawn(async move {
            let _ = host.serve().await;
        });

        let mut client = WormholeClient::new(ClientConfig {
            server_addr: addr,
            mount_point: dir.path().to_path_buf(),
            request_timeout: Duration::from_secs(5),
        });
        for _ in 0..50 {
            if client.connect().await.is_ok() {
                break;
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }

        let attr = client.lookup(ROOT_INODE, "blob.bin").await.expect("lookup");
        let _ = client
            .read(attr.inode, 0, payload.len() as u32)
            .await
            .expect("seed host store via read");

        let hash = teleport_core::ContentHash::compute(payload);
        let (data, source) = crate::mesh_fetch::fetch_hash_mesh(hash, Some(addr), false)
            .await
            .expect("mesh fetch from explicit addr");
        assert_eq!(data, payload);
        assert!(
            source.contains(&addr.to_string()) || source == "local",
            "unexpected source {source}"
        );
    }

    /// Performance baseline: sequential read throughput of a large file through
    /// the real QUIC data plane over loopback. Ignored by default (opt-in):
    ///   cargo test -p teleport-daemon --lib --release bench_sequential_read_throughput -- --ignored --nocapture
    #[ignore]
    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn bench_sequential_read_throughput() {
        const FILE_BYTES: usize = 64 * 1024 * 1024; // 64 MiB

        let dir = tempfile::TempDir::new().unwrap();
        let data = pseudo_bytes(FILE_BYTES);
        std::fs::write(dir.path().join("big.bin"), &data).unwrap();

        let addr = free_loopback_addr();
        let host = WormholeHost::new(HostConfig {
            bind_addr: addr,
            shared_path: dir.path().to_path_buf(),
            max_connections: 4,
            host_name: "bench-host".into(),
        });
        tokio::spawn(async move {
            let _ = host.serve().await;
        });

        let mut client = WormholeClient::new(ClientConfig {
            server_addr: addr,
            mount_point: dir.path().to_path_buf(),
            request_timeout: Duration::from_secs(30),
        });
        for _ in 0..50 {
            if client.connect().await.is_ok() {
                break;
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }

        let attr = client.lookup(ROOT_INODE, "big.bin").await.expect("lookup");
        assert_eq!(attr.size, FILE_BYTES as u64);

        // Warm-up pass (open caches, JIT of code paths) then timed pass.
        let _ = read_whole_file(&client, attr.inode, attr.size).await;

        let start = std::time::Instant::now();
        let got = read_whole_file(&client, attr.inode, attr.size).await;
        let elapsed = start.elapsed();
        assert_eq!(got.len(), FILE_BYTES);

        let mb = FILE_BYTES as f64 / (1024.0 * 1024.0);
        let secs = elapsed.as_secs_f64();
        let chunks = FILE_BYTES / CHUNK_SIZE;
        println!(
            "BENCH sequential read: {mb:.0} MiB in {secs:.3}s = {:.1} MiB/s ({chunks} chunks, {:.3} ms/chunk)",
            mb / secs,
            secs * 1000.0 / chunks as f64
        );

        // Pipelined: issue many chunk reads concurrently (bounded) to test
        // whether per-request round-trip latency (not bandwidth) is the limiter.
        use futures_util::stream::{self, StreamExt};
        for concurrency in [8usize, 32, 64] {
            let n = FILE_BYTES / CHUNK_SIZE;
            let start = std::time::Instant::now();
            let total: usize = stream::iter(0..n)
                .map(|i| {
                    let c = &client;
                    let inode = attr.inode;
                    async move {
                        c.read(inode, (i * CHUNK_SIZE) as u64, CHUNK_SIZE as u32)
                            .await
                            .map(|d| d.len())
                            .unwrap_or(0)
                    }
                })
                .buffer_unordered(concurrency)
                .fold(0usize, |acc, len| async move { acc + len })
                .await;
            let el = start.elapsed().as_secs_f64();
            assert_eq!(total, FILE_BYTES);
            println!(
                "BENCH pipelined read (concurrency={concurrency}): {mb:.0} MiB in {el:.3}s = {:.1} MiB/s",
                mb / el
            );
        }
    }

    /// SECURITY regression: a symlink inside the shared directory that points
    /// OUTSIDE it must not allow a client to read (or otherwise reach) the
    /// target. The host must reject both the lookup and any read by inode.
    #[cfg(unix)]
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn e2e_symlink_escape_is_rejected() {
        use std::os::unix::fs::symlink;

        // Secret file OUTSIDE the shared directory.
        let outside = tempfile::TempDir::new().unwrap();
        let secret = outside.path().join("secret.txt");
        std::fs::write(&secret, b"TOP SECRET - must not leak").unwrap();

        // Shared directory containing a legit file and an escaping symlink.
        let share = tempfile::TempDir::new().unwrap();
        std::fs::write(share.path().join("ok.txt"), b"public").unwrap();
        symlink(&secret, share.path().join("escape")).unwrap();

        let addr = free_loopback_addr();
        let host = WormholeHost::new(HostConfig {
            bind_addr: addr,
            shared_path: share.path().to_path_buf(),
            max_connections: 4,
            host_name: "test-host".into(),
        });
        tokio::spawn(async move {
            let _ = host.serve().await;
        });

        let mut client = WormholeClient::new(ClientConfig {
            server_addr: addr,
            mount_point: share.path().to_path_buf(),
            request_timeout: Duration::from_secs(5),
        });
        let mut connected = false;
        for _ in 0..50 {
            if client.connect().await.is_ok() {
                connected = true;
                break;
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
        assert!(connected, "client failed to connect");

        // The legit file still works (the fix must not break normal reads).
        let ok = client
            .lookup(ROOT_INODE, "ok.txt")
            .await
            .expect("legit lookup");
        let ok_data = read_whole_file(&client, ok.inode, ok.size).await;
        assert_eq!(ok_data, b"public");

        // Looking up the escaping symlink by name must be rejected.
        let escaped = client.lookup(ROOT_INODE, "escape").await;
        assert!(
            escaped.is_err(),
            "lookup of escaping symlink should be rejected, got {escaped:?}"
        );

        // Even if the client discovers the symlink's inode via readdir (which
        // assigns inodes to all directory entries), reading it must be rejected
        // and must NOT return the secret bytes.
        let entries = client.readdir(ROOT_INODE, 0).await.expect("readdir");
        if let Some(escape_entry) = entries.iter().find(|e| e.name == "escape") {
            let read_attempt = client.read(escape_entry.inode, 0, 64).await;
            assert!(
                read_attempt.is_err(),
                "reading escaping symlink must be rejected, got {read_attempt:?}"
            );
            if let Ok(bytes) = &read_attempt {
                assert!(
                    !bytes.windows(6).any(|w| w == b"SECRET"),
                    "secret bytes leaked through symlink escape!"
                );
            }
        }
    }
}
