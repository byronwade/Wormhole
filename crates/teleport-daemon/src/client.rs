//! Wormhole client - connects to remote host and serves FUSE requests

use std::net::SocketAddr;
use std::path::PathBuf;
use std::time::Duration;

use tracing::info;

use teleport_core::{
    ChunkId, CreateDirRequest, CreateDirResponse, CreateFileRequest, CreateFileResponse,
    DeleteDirRequest, DeleteDirResponse, DeleteFileRequest, DeleteFileResponse, DirEntry,
    FileAttr, GetAttrRequest, GetAttrResponse, HelloMessage, Inode, ListDirRequest,
    ListDirResponse, LockRequest, LockResponse, LockType, LookupRequest, LookupResponse,
    NetMessage, ReadChunkRequest, ReadChunkResponse, ReleaseRequest, ReleaseResponse,
    RenameRequest, RenameResponse, SetAttrRequest, SetAttrResponse, WriteChunkRequest,
    WriteChunkResponse, PROTOCOL_VERSION, ROOT_INODE,
};

use crate::bridge::{BridgeHandler, FuseError, FuseRequest};
#[allow(deprecated)] // create_client_endpoint is deprecated but used for dev/LAN mode
use crate::net::{connect, create_client_endpoint, recv_message, send_message, QuicConnection};
use crate::sync_engine::SyncEngine;

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
    root_inode: Inode,
    /// Sync engine for tracking dirty chunks and locks (Phase 7)
    sync_engine: std::sync::Arc<SyncEngine>,
}

impl WormholeClient {
    pub fn new(config: ClientConfig) -> Self {
        Self {
            config,
            connection: None,
            session_id: None,
            root_inode: ROOT_INODE,
            sync_engine: std::sync::Arc::new(SyncEngine::default()),
        }
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

        let runner = SyncRunner::new(sync_engine, std::time::Duration::from_secs(1));

        tokio::spawn(async move {
            runner.run_loop(|chunk_id, data, lock_token| {
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

                    send_message(&mut send, &request)
                        .await
                        .map_err(|e| format!("send error: {:?}", e))?;

                    let response = recv_message(&mut recv)
                        .await
                        .map_err(|e| format!("recv error: {:?}", e))?;

                    match response {
                        NetMessage::WriteChunkResponse(WriteChunkResponse { success: true, .. }) => {
                            debug!("Background sync: uploaded chunk {:?}", chunk_id);
                            Ok(())
                        }
                        NetMessage::WriteChunkResponse(WriteChunkResponse { success: false, .. }) => {
                            Err("write rejected by host".into())
                        }
                        NetMessage::Error(e) => {
                            Err(format!("{:?}: {}", e.code, e.message))
                        }
                        _ => Err("unexpected response".into()),
                    }
                }
            }).await;
        });

        info!("Started background sync task");
    }

    /// Connect to the server and perform handshake
    #[allow(deprecated)] // Using insecure endpoint for LAN/dev connections
    pub async fn connect(&mut self) -> Result<(), ClientError> {
        let endpoint = create_client_endpoint()
            .map_err(|e| ClientError::Connection(format!("{:?}", e)))?;

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
        getrandom::getrandom(&mut client_id)
            .expect("RNG failed - system entropy source unavailable");

        let hello = NetMessage::Hello(HelloMessage {
            protocol_version: PROTOCOL_VERSION,
            client_id,
            capabilities: vec!["read".into()],
        });

        send_message(&mut send, &hello)
            .await
            .map_err(|e| ClientError::Connection(format!("{:?}", e)))?;

        // Receive HelloAck
        let response = recv_message(&mut recv)
            .await
            .map_err(|e| ClientError::Connection(format!("{:?}", e)))?;

        match response {
            NetMessage::HelloAck(ack) => {
                if ack.protocol_version != PROTOCOL_VERSION {
                    return Err(ClientError::VersionMismatch {
                        expected: PROTOCOL_VERSION,
                        actual: ack.protocol_version,
                    });
                }
                self.session_id = Some(ack.session_id);
                self.root_inode = ack.root_inode;
                info!("Connected to host: {}", ack.host_name);
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
        let _conn = self
            .connection
            .as_ref()
            .ok_or(ClientError::NotConnected)?;

        let handler = BridgeHandler::new(request_rx);

        handler
            .run(|request| async {
                match request {
                    FuseRequest::Lookup { parent, name, reply } => {
                        let result = self.lookup(parent, &name).await;
                        let _ = reply.send(result);
                    }
                    FuseRequest::GetAttr { inode, reply } => {
                        let result = self.getattr(inode).await;
                        let _ = reply.send(result);
                    }
                    FuseRequest::ReadDir { inode, offset, reply } => {
                        let result = self.readdir(inode, offset).await;
                        let _ = reply.send(result);
                    }
                    FuseRequest::Read { inode, offset, size, reply } => {
                        let result = self.read(inode, offset, size).await;
                        let _ = reply.send(result);
                    }
                    // Phase 7: Write operations
                    FuseRequest::Write { inode, offset, data, reply } => {
                        let result = self.write(inode, offset, data).await;
                        let _ = reply.send(result);
                    }
                    FuseRequest::AcquireLock { inode, exclusive, reply } => {
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
                    FuseRequest::CreateFile { parent, name, mode, reply } => {
                        let result = self.create_file(parent, &name, mode).await;
                        let _ = reply.send(result);
                    }
                    FuseRequest::DeleteFile { parent, name, reply } => {
                        let result = self.delete_file(parent, &name).await;
                        let _ = reply.send(result);
                    }
                    FuseRequest::CreateDir { parent, name, mode, reply } => {
                        let result = self.create_dir(parent, &name, mode).await;
                        let _ = reply.send(result);
                    }
                    FuseRequest::DeleteDir { parent, name, reply } => {
                        let result = self.delete_dir(parent, &name).await;
                        let _ = reply.send(result);
                    }
                    FuseRequest::Rename { old_parent, old_name, new_parent, new_name, reply } => {
                        let result = self.rename(old_parent, &old_name, new_parent, &new_name).await;
                        let _ = reply.send(result);
                    }
                    FuseRequest::SetAttr { inode, size, mode, mtime, atime, reply } => {
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
    async fn lookup(&self, parent: Inode, name: &str) -> Result<FileAttr, FuseError> {
        let conn = self.connection.as_ref().ok_or(FuseError::Shutdown)?;

        let (mut send, mut recv) = conn
            .open_stream()
            .await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        let request = NetMessage::Lookup(LookupRequest {
            parent,
            name: name.to_string(),
        });

        send_message(&mut send, &request)
            .await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        let response = recv_message(&mut recv)
            .await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        match response {
            NetMessage::LookupResponse(LookupResponse { attr: Some(attr) }) => Ok(attr),
            NetMessage::LookupResponse(LookupResponse { attr: None }) => Err(FuseError::NotFound),
            NetMessage::Error(e) => {
                Err(FuseError::IoError(format!("{:?}: {}", e.code, e.message)))
            }
            _ => Err(FuseError::Internal("unexpected response".into())),
        }
    }

    /// Get file attributes
    async fn getattr(&self, inode: Inode) -> Result<FileAttr, FuseError> {
        let conn = self.connection.as_ref().ok_or(FuseError::Shutdown)?;

        let (mut send, mut recv) = conn
            .open_stream()
            .await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        let request = NetMessage::GetAttr(GetAttrRequest { inode });

        send_message(&mut send, &request)
            .await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        let response = recv_message(&mut recv)
            .await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        match response {
            NetMessage::GetAttrResponse(GetAttrResponse { attr: Some(attr) }) => Ok(attr),
            NetMessage::GetAttrResponse(GetAttrResponse { attr: None }) => Err(FuseError::NotFound),
            NetMessage::Error(e) => {
                Err(FuseError::IoError(format!("{:?}: {}", e.code, e.message)))
            }
            _ => Err(FuseError::Internal("unexpected response".into())),
        }
    }

    /// Read directory contents
    async fn readdir(&self, inode: Inode, offset: u64) -> Result<Vec<DirEntry>, FuseError> {
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

        send_message(&mut send, &request)
            .await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        let response = recv_message(&mut recv)
            .await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        match response {
            NetMessage::ListDirResponse(ListDirResponse { entries, .. }) => Ok(entries),
            NetMessage::Error(e) => {
                Err(FuseError::IoError(format!("{:?}: {}", e.code, e.message)))
            }
            _ => Err(FuseError::Internal("unexpected response".into())),
        }
    }

    /// Read file data
    async fn read(&self, inode: Inode, offset: u64, size: u32) -> Result<Vec<u8>, FuseError> {
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

        send_message(&mut send, &request)
            .await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        let response = recv_message(&mut recv)
            .await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        match response {
            NetMessage::ReadChunkResponse(ReadChunkResponse { data, checksum, .. }) => {
                // Verify checksum
                let computed = teleport_core::crypto::checksum(&data);
                if computed != checksum {
                    return Err(FuseError::IoError("checksum mismatch".into()));
                }

                // Extract requested portion
                let chunk_offset = ChunkId::offset_in_chunk(offset);
                let available = data.len().saturating_sub(chunk_offset);
                let to_read = std::cmp::min(size as usize, available);

                Ok(data[chunk_offset..chunk_offset + to_read].to_vec())
            }
            NetMessage::Error(e) => {
                Err(FuseError::IoError(format!("{:?}: {}", e.code, e.message)))
            }
            _ => Err(FuseError::Internal("unexpected response".into())),
        }
    }

    /// Write file data (Phase 7)
    async fn write(&self, inode: Inode, offset: u64, data: Vec<u8>) -> Result<u32, FuseError> {
        let conn = self.connection.as_ref().ok_or(FuseError::Shutdown)?;

        // Check if we have a lock for this file
        let lock_token = self.sync_engine.get_lock_token(inode)
            .ok_or(FuseError::LockRequired)?;

        let (mut send, mut recv) = conn
            .open_stream()
            .await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        // Write chunk by chunk
        let chunk_size = teleport_core::CHUNK_SIZE as u64;
        let start_chunk = offset / chunk_size;
        let end_offset = offset + data.len() as u64;
        let end_chunk = if end_offset == 0 { 0 } else { (end_offset - 1) / chunk_size };

        let mut total_written = 0u32;

        for chunk_idx in start_chunk..=end_chunk {
            let chunk_id = ChunkId::new(inode, chunk_idx);
            let chunk_start = chunk_idx * chunk_size;

            // Calculate what portion of data goes to this chunk
            let _offset_in_chunk = (offset.max(chunk_start) - chunk_start) as usize;
            let data_start = ((chunk_start as i64 - offset as i64).max(0)) as usize;
            let data_end = ((chunk_start + chunk_size) as i64 - offset as i64).min(data.len() as i64) as usize;

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

            send_message(&mut send, &request)
                .await
                .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

            let response = recv_message(&mut recv)
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

        let lock_type = if exclusive { LockType::Exclusive } else { LockType::Shared };

        let request = NetMessage::AcquireLock(LockRequest {
            inode,
            lock_type,
            timeout_ms: 30000, // 30 second lock TTL
        });

        send_message(&mut send, &request)
            .await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        let response = recv_message(&mut recv)
            .await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        match response {
            NetMessage::AcquireLockResponse(LockResponse { granted: true, token: Some(token), .. }) => {
                // Store lock in sync engine
                self.sync_engine.store_lock(
                    inode,
                    token,
                    lock_type,
                    std::time::Duration::from_secs(30),
                );
                Ok(())
            }
            NetMessage::AcquireLockResponse(LockResponse { granted: false, holder, retry_after_ms, .. }) => {
                let msg = format!(
                    "lock conflict: held by {:?}, retry after {:?}ms",
                    holder, retry_after_ms
                );
                Err(FuseError::LockConflict(msg))
            }
            NetMessage::Error(e) => {
                Err(FuseError::IoError(format!("{:?}: {}", e.code, e.message)))
            }
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

        let request = NetMessage::ReleaseLock(ReleaseRequest {
            token: lock_token,
        });

        send_message(&mut send, &request)
            .await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        let response = recv_message(&mut recv)
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
            NetMessage::Error(e) => {
                Err(FuseError::IoError(format!("{:?}: {}", e.code, e.message)))
            }
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
        let lock_token = self.sync_engine.get_lock_token(inode)
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

            send_message(&mut send, &request)
                .await
                .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

            let response = recv_message(&mut recv)
                .await
                .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

            match response {
                NetMessage::WriteChunkResponse(WriteChunkResponse { success: true, .. }) => {
                    self.sync_engine.mark_synced(&chunk_id);
                }
                NetMessage::WriteChunkResponse(WriteChunkResponse { success: false, .. }) => {
                    self.sync_engine.mark_sync_failed(&chunk_id, "write failed on host".into());
                    return Err(FuseError::IoError("flush failed".into()));
                }
                NetMessage::Error(e) => {
                    self.sync_engine.mark_sync_failed(&chunk_id, format!("{:?}", e.code));
                    return Err(FuseError::IoError(format!("{:?}: {}", e.code, e.message)));
                }
                _ => return Err(FuseError::Internal("unexpected response".into())),
            }
        }

        Ok(())
    }

    /// Create a file (Phase 7)
    async fn create_file(&self, parent: Inode, name: &str, mode: u32) -> Result<FileAttr, FuseError> {
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

        send_message(&mut send, &request)
            .await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        let response = recv_message(&mut recv)
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
            NetMessage::Error(e) => {
                Err(FuseError::IoError(format!("{:?}: {}", e.code, e.message)))
            }
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

        send_message(&mut send, &request)
            .await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        let response = recv_message(&mut recv)
            .await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        match response {
            NetMessage::DeleteFileResponse(DeleteFileResponse { success: true, .. }) => Ok(()),
            NetMessage::DeleteFileResponse(DeleteFileResponse {
                success: false,
                error: Some(err),
            }) => Err(FuseError::IoError(err)),
            NetMessage::Error(e) => {
                Err(FuseError::IoError(format!("{:?}: {}", e.code, e.message)))
            }
            _ => Err(FuseError::Internal("unexpected response".into())),
        }
    }

    /// Create a directory (Phase 7)
    async fn create_dir(&self, parent: Inode, name: &str, mode: u32) -> Result<FileAttr, FuseError> {
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

        send_message(&mut send, &request)
            .await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        let response = recv_message(&mut recv)
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
            NetMessage::Error(e) => {
                Err(FuseError::IoError(format!("{:?}: {}", e.code, e.message)))
            }
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

        send_message(&mut send, &request)
            .await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        let response = recv_message(&mut recv)
            .await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        match response {
            NetMessage::DeleteDirResponse(DeleteDirResponse { success: true, .. }) => Ok(()),
            NetMessage::DeleteDirResponse(DeleteDirResponse {
                success: false,
                error: Some(err),
            }) => Err(FuseError::IoError(err)),
            NetMessage::Error(e) => {
                Err(FuseError::IoError(format!("{:?}: {}", e.code, e.message)))
            }
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

        send_message(&mut send, &request)
            .await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        let response = recv_message(&mut recv)
            .await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        match response {
            NetMessage::RenameResponse(RenameResponse { success: true, .. }) => Ok(()),
            NetMessage::RenameResponse(RenameResponse {
                success: false,
                error: Some(err),
            }) => Err(FuseError::IoError(err)),
            NetMessage::Error(e) => {
                Err(FuseError::IoError(format!("{:?}: {}", e.code, e.message)))
            }
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

        send_message(&mut send, &request)
            .await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        let response = recv_message(&mut recv)
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
            NetMessage::Error(e) => {
                Err(FuseError::IoError(format!("{:?}: {}", e.code, e.message)))
            }
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

    #[test]
    fn test_default_config() {
        let config = ClientConfig::default();
        assert_eq!(config.server_addr.port(), 4433);
    }
}
