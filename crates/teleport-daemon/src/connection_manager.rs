//! Connection Manager for multiple hosts
//!
//! Manages connections to multiple remote hosts, handling:
//! - Connection lifecycle (connect, disconnect, reconnect)
//! - Connection health monitoring
//! - Share discovery and registration
//! - Request routing to appropriate hosts

use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::{Duration, Instant};

use dashmap::DashMap;
use parking_lot::RwLock;
use tokio::sync::broadcast;
use tracing::{info, warn};

use teleport_core::{
    ConnectionStatus, DirEntry, FileAttr, GlobalInode, HostInfo, Inode, ShareId, ShareInfo,
    ROOT_INODE,
};

use crate::bridge::FuseError;
#[allow(deprecated)] // create_client_endpoint is deprecated but used for dev/LAN mode
use crate::net::{connect, create_client_endpoint, recv_message, send_message, QuicConnection};

/// Configuration for connecting to a host
#[derive(Clone, Debug)]
pub struct HostConnectionConfig {
    /// Address to connect to
    pub address: SocketAddr,
    /// Optional join code for authentication
    pub join_code: Option<String>,
    /// Display name for the host
    pub display_name: Option<String>,
    /// Reconnection settings
    pub reconnect: ReconnectConfig,
}

/// Reconnection configuration
#[derive(Clone, Debug)]
pub struct ReconnectConfig {
    /// Enable automatic reconnection
    pub enabled: bool,
    /// Initial delay before first reconnect attempt
    pub initial_delay: Duration,
    /// Maximum delay between reconnect attempts
    pub max_delay: Duration,
    /// Maximum number of reconnection attempts (0 = unlimited)
    pub max_attempts: u32,
}

impl Default for ReconnectConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            initial_delay: Duration::from_secs(1),
            max_delay: Duration::from_secs(60),
            max_attempts: 0, // Unlimited
        }
    }
}

/// A registered share with its associated connection
#[derive(Clone, Debug)]
pub struct RegisteredShare {
    /// Share information
    pub info: ShareInfo,
    /// Index in the share list (used for GlobalInode)
    pub index: u16,
    /// Host ID this share belongs to
    pub host_id: String,
    /// Last successful access time
    pub last_accessed: Instant,
}

/// Events from the connection manager
#[derive(Clone, Debug)]
pub enum ConnectionEvent {
    /// A host connected successfully
    HostConnected { host_id: String, host_info: HostInfo },
    /// A host disconnected
    HostDisconnected { host_id: String, reason: String },
    /// A host is reconnecting
    HostReconnecting { host_id: String, attempt: u32 },
    /// A share was discovered
    ShareDiscovered { share: ShareInfo },
    /// A share was removed
    ShareRemoved { share_id: ShareId },
    /// Connection health changed
    HealthChanged { host_id: String, healthy: bool },
}

/// Managed host connection state
struct ManagedHost {
    /// Configuration for this host
    config: HostConnectionConfig,
    /// Current connection (if connected)
    connection: Option<QuicConnection>,
    /// Host info from handshake
    info: HostInfo,
    /// Connection status
    status: ConnectionStatus,
    /// Session ID from handshake
    session_id: Option<[u8; 16]>,
    /// Last successful ping time
    last_ping: Option<Instant>,
    /// Current RTT in milliseconds
    rtt_ms: Option<u32>,
    /// Reconnection attempt count
    reconnect_attempts: u32,
    /// Time of last reconnection attempt
    #[allow(dead_code)]
    last_reconnect: Option<Instant>,
}

impl ManagedHost {
    fn new(config: HostConnectionConfig) -> Self {
        let name = config.display_name.clone().unwrap_or_else(|| config.address.to_string());
        Self {
            config,
            connection: None,
            info: HostInfo::new(name),
            status: ConnectionStatus::Disconnected,
            session_id: None,
            last_ping: None,
            rtt_ms: None,
            reconnect_attempts: 0,
            last_reconnect: None,
        }
    }
}

/// Connection Manager for handling multiple hosts
pub struct ConnectionManager {
    /// Managed hosts by host ID
    hosts: Arc<DashMap<String, ManagedHost>>,
    /// Registered shares by share ID
    shares: Arc<DashMap<ShareId, RegisteredShare>>,
    /// Share index to share ID mapping
    share_index: Arc<RwLock<HashMap<u16, ShareId>>>,
    /// Next share index to assign
    next_share_index: Arc<RwLock<u16>>,
    /// Event broadcaster
    event_tx: broadcast::Sender<ConnectionEvent>,
    /// Request timeout
    #[allow(dead_code)]
    request_timeout: Duration,
    /// Health check interval
    health_check_interval: Duration,
}

impl ConnectionManager {
    /// Create a new connection manager
    pub fn new() -> Self {
        let (event_tx, _) = broadcast::channel(64);

        Self {
            hosts: Arc::new(DashMap::new()),
            shares: Arc::new(DashMap::new()),
            share_index: Arc::new(RwLock::new(HashMap::new())),
            next_share_index: Arc::new(RwLock::new(1)), // Start at 1 (0 = virtual root)
            event_tx,
            request_timeout: Duration::from_secs(30),
            health_check_interval: Duration::from_secs(30),
        }
    }

    /// Subscribe to connection events
    pub fn subscribe(&self) -> broadcast::Receiver<ConnectionEvent> {
        self.event_tx.subscribe()
    }

    /// Add and connect to a host
    pub async fn add_host(&self, host_id: String, config: HostConnectionConfig) -> Result<(), ConnectionError> {
        info!("Adding host: {} at {}", host_id, config.address);

        let mut host = ManagedHost::new(config);
        host.status = ConnectionStatus::Connecting;
        host.info.status = ConnectionStatus::Connecting;
        host.info.address = Some(host.config.address);

        self.hosts.insert(host_id.clone(), host);

        // Attempt connection
        self.connect_host(&host_id).await
    }

    /// Connect to a specific host
    #[allow(deprecated)] // Using insecure endpoint for LAN/dev connections
    async fn connect_host(&self, host_id: &str) -> Result<(), ConnectionError> {
        let config = {
            let host = self.hosts.get(host_id)
                .ok_or_else(|| ConnectionError::HostNotFound(host_id.to_string()))?;
            host.config.clone()
        };

        // Create QUIC endpoint
        let endpoint = create_client_endpoint()
            .map_err(|e| ConnectionError::Connection(format!("{:?}", e)))?;

        // Connect to host
        let conn = match connect(&endpoint, config.address, "localhost").await {
            Ok(c) => c,
            Err(e) => {
                self.update_host_status(host_id, ConnectionStatus::Failed);
                return Err(ConnectionError::Connection(format!("{:?}", e)));
            }
        };

        // Perform handshake
        let (session_id, host_name, shares) = self.handshake(&conn).await?;

        // Update host state
        if let Some(mut host) = self.hosts.get_mut(host_id) {
            host.connection = Some(conn);
            host.session_id = Some(session_id);
            host.status = ConnectionStatus::Connected;
            host.info.name = host_name;
            host.info.status = ConnectionStatus::Connected;
            // Safe conversion: millis since epoch won't overflow u64 until year 584 million
            host.info.last_seen = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis().min(u64::MAX as u128) as u64)
                .unwrap_or(0);
            host.reconnect_attempts = 0;
        }

        // Register shares from this host
        for share in shares {
            if self.register_share(host_id, share).await.is_none() {
                warn!("Failed to register share - index space exhausted");
            }
        }

        // Emit event
        if let Some(host) = self.hosts.get(host_id) {
            let _ = self.event_tx.send(ConnectionEvent::HostConnected {
                host_id: host_id.to_string(),
                host_info: host.info.clone(),
            });
        }

        info!("Connected to host: {}", host_id);
        Ok(())
    }

    /// Perform handshake with host
    async fn handshake(&self, conn: &QuicConnection) -> Result<([u8; 16], String, Vec<ShareInfo>), ConnectionError> {
        use teleport_core::{HelloMessage, NetMessage, PROTOCOL_VERSION};

        let (mut send, mut recv) = conn.open_stream().await
            .map_err(|e| ConnectionError::Connection(format!("{:?}", e)))?;

        // Generate client ID
        let mut client_id = [0u8; 16];
        getrandom::getrandom(&mut client_id)
            .expect("RNG failed - system entropy source unavailable");

        // Send Hello
        let hello = NetMessage::Hello(HelloMessage {
            protocol_version: PROTOCOL_VERSION,
            client_id,
            capabilities: vec!["read".into(), "write".into(), "multi-share".into()],
        });

        send_message(&mut send, &hello).await
            .map_err(|e| ConnectionError::Connection(format!("{:?}", e)))?;

        // Receive HelloAck
        let response = recv_message(&mut recv).await
            .map_err(|e| ConnectionError::Connection(format!("{:?}", e)))?;

        match response {
            NetMessage::HelloAck(ack) => {
                if ack.protocol_version != PROTOCOL_VERSION {
                    return Err(ConnectionError::VersionMismatch {
                        expected: PROTOCOL_VERSION,
                        actual: ack.protocol_version,
                    });
                }

                // Create default share for backwards compatibility
                let mut shares = Vec::new();
                let mut share = ShareInfo::new(&ack.host_name, &ack.host_name);
                share.root_inode = ack.root_inode;
                share.writable = ack.capabilities.iter().any(|c| c == "write");
                shares.push(share);

                Ok((ack.session_id, ack.host_name, shares))
            }
            NetMessage::Error(e) => {
                Err(ConnectionError::Protocol(e.message))
            }
            _ => {
                Err(ConnectionError::Protocol("unexpected response to Hello".into()))
            }
        }
    }

    /// Register a share from a host
    /// Returns the assigned share index, or None if the index space is exhausted
    ///
    /// Lock ordering: next_share_index -> share_index (always acquire in this order)
    /// DashMap operations are done outside of RwLock holds to prevent deadlocks
    ///
    /// TOCTOU Protection: We verify the host still exists before committing.
    /// If the host was removed between index allocation and registration,
    /// we rollback the index to prevent orphaned mappings.
    async fn register_share(&self, host_id: &str, share: ShareInfo) -> Option<u16> {
        // First check if host exists (DashMap has internal locking)
        if !self.hosts.contains_key(host_id) {
            warn!("Cannot register share: host {} no longer exists", host_id);
            return None;
        }

        // Acquire both locks atomically in consistent order to prevent deadlocks
        // Order: next_share_index first, then share_index
        let index = {
            let mut next = self.next_share_index.write();
            let mut mapping = self.share_index.write();

            let idx = *next;
            // Check for overflow - u16::MAX (65535) is reserved to indicate exhaustion
            if idx == u16::MAX {
                warn!("Share index space exhausted, cannot register more shares");
                return None;
            }
            *next = idx + 1;

            // Update share index mapping while still holding both locks
            mapping.insert(idx, share.id);
            idx
        }; // Both locks released here

        // DashMap operations outside of RwLock holds - DashMap handles its own locking
        let registered = RegisteredShare {
            info: share.clone(),
            index,
            host_id: host_id.to_string(),
            last_accessed: Instant::now(),
        };

        // Add to host's share list with TOCTOU protection
        // If host was removed between our check and now, rollback the index allocation
        // IMPORTANT: All mutations must happen atomically within the match to prevent
        // orphaned data in any of the maps.
        match self.hosts.get_mut(host_id) {
            Some(mut host) => {
                host.info.shares.push(share.clone());
                // Insert share into shares map only after confirming host exists
                self.shares.insert(share.id, registered);
            }
            None => {
                // Host was removed - rollback the index allocation
                warn!(
                    "TOCTOU race detected: host {} removed during share registration, rolling back",
                    host_id
                );
                let mut mapping = self.share_index.write();
                mapping.remove(&index);
                // Note: We don't decrement next_share_index as it could cause
                // collisions with concurrent registrations. Index space is large
                // enough that this minor leak is acceptable.
                return None;
            }
        }

        let _ = self.event_tx.send(ConnectionEvent::ShareDiscovered { share });
        info!("Registered share at index {}", index);
        Some(index)
    }

    /// Remove a host and its shares
    pub async fn remove_host(&self, host_id: &str) {
        if let Some((_, _host)) = self.hosts.remove(host_id) {
            // Remove all shares from this host
            let share_ids: Vec<ShareId> = self.shares.iter()
                .filter(|s| s.host_id == host_id)
                .map(|s| s.info.id)
                .collect();

            for share_id in share_ids {
                self.shares.remove(&share_id);
                let _ = self.event_tx.send(ConnectionEvent::ShareRemoved { share_id });
            }

            let _ = self.event_tx.send(ConnectionEvent::HostDisconnected {
                host_id: host_id.to_string(),
                reason: "removed by user".into(),
            });

            info!("Removed host: {}", host_id);
        }
    }

    /// Update host connection status
    fn update_host_status(&self, host_id: &str, status: ConnectionStatus) {
        if let Some(mut host) = self.hosts.get_mut(host_id) {
            host.status = status;
            host.info.status = status;
        }
    }

    /// Get all connected shares
    pub fn get_shares(&self) -> Vec<RegisteredShare> {
        self.shares.iter().map(|s| s.value().clone()).collect()
    }

    /// Get share by index
    pub fn get_share_by_index(&self, index: u16) -> Option<RegisteredShare> {
        let share_id = self.share_index.read().get(&index).copied()?;
        self.shares.get(&share_id).map(|s| s.value().clone())
    }

    /// Get host info by ID
    pub fn get_host(&self, host_id: &str) -> Option<HostInfo> {
        self.hosts.get(host_id).map(|h| h.info.clone())
    }

    /// Get all hosts
    pub fn get_hosts(&self) -> Vec<HostInfo> {
        self.hosts.iter().map(|h| h.info.clone()).collect()
    }

    /// Resolve a global inode to share and local inode
    pub fn resolve_inode(&self, global: GlobalInode) -> Option<(RegisteredShare, Inode)> {
        if global.is_virtual_root() {
            return None; // Virtual root is handled specially
        }

        let share = self.get_share_by_index(global.share_index)?;
        Some((share, global.local_inode))
    }

    /// Get connection for a share
    fn get_connection_for_share(&self, share_id: &ShareId) -> Option<QuicConnection> {
        let share = self.shares.get(share_id)?;
        let host = self.hosts.get(&share.host_id)?;
        host.connection.clone()
    }

    /// Perform a lookup operation on the appropriate host
    pub async fn lookup(&self, global_parent: GlobalInode, name: &str) -> Result<FileAttr, FuseError> {
        use teleport_core::{LookupRequest, LookupResponse, NetMessage};

        let (share, local_parent) = self.resolve_inode(global_parent)
            .ok_or(FuseError::NotFound)?;

        let conn = self.get_connection_for_share(&share.info.id)
            .ok_or(FuseError::Shutdown)?;

        let (mut send, mut recv) = conn.open_stream().await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        let request = NetMessage::Lookup(LookupRequest {
            parent: local_parent,
            name: name.to_string(),
        });

        send_message(&mut send, &request).await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        let response = recv_message(&mut recv).await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        match response {
            NetMessage::LookupResponse(LookupResponse { attr: Some(mut attr) }) => {
                // Convert local inode to global inode
                let global = GlobalInode::new(share.index, attr.inode);
                attr.inode = global.to_packed();
                Ok(attr)
            }
            NetMessage::LookupResponse(LookupResponse { attr: None }) => {
                Err(FuseError::NotFound)
            }
            NetMessage::Error(e) => {
                Err(FuseError::IoError(format!("{:?}: {}", e.code, e.message)))
            }
            _ => Err(FuseError::Internal("unexpected response".into())),
        }
    }

    /// Get attributes for a global inode
    pub async fn getattr(&self, global: GlobalInode) -> Result<FileAttr, FuseError> {
        use teleport_core::{GetAttrRequest, GetAttrResponse, NetMessage};

        let (share, local_inode) = self.resolve_inode(global)
            .ok_or(FuseError::NotFound)?;

        let conn = self.get_connection_for_share(&share.info.id)
            .ok_or(FuseError::Shutdown)?;

        let (mut send, mut recv) = conn.open_stream().await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        let request = NetMessage::GetAttr(GetAttrRequest { inode: local_inode });

        send_message(&mut send, &request).await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        let response = recv_message(&mut recv).await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        match response {
            NetMessage::GetAttrResponse(GetAttrResponse { attr: Some(mut attr) }) => {
                // Convert local inode to global inode
                let global = GlobalInode::new(share.index, attr.inode);
                attr.inode = global.to_packed();
                Ok(attr)
            }
            NetMessage::GetAttrResponse(GetAttrResponse { attr: None }) => {
                Err(FuseError::NotFound)
            }
            NetMessage::Error(e) => {
                Err(FuseError::IoError(format!("{:?}: {}", e.code, e.message)))
            }
            _ => Err(FuseError::Internal("unexpected response".into())),
        }
    }

    /// Read directory contents
    pub async fn readdir(&self, global: GlobalInode, offset: u64) -> Result<Vec<DirEntry>, FuseError> {
        use teleport_core::{ListDirRequest, ListDirResponse, NetMessage};

        // Special case: virtual root lists all shares
        if global.is_virtual_root() {
            let mut entries = Vec::new();
            for share in self.shares.iter() {
                let global_inode = GlobalInode::new(share.index, ROOT_INODE);
                entries.push(DirEntry::new(
                    &share.info.name,
                    global_inode.to_packed(),
                    teleport_core::FileType::Directory,
                ));
            }
            return Ok(entries);
        }

        let (share, local_inode) = self.resolve_inode(global)
            .ok_or(FuseError::NotFound)?;

        let conn = self.get_connection_for_share(&share.info.id)
            .ok_or(FuseError::Shutdown)?;

        let (mut send, mut recv) = conn.open_stream().await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        let request = NetMessage::ListDir(ListDirRequest {
            inode: local_inode,
            offset,
            limit: 1000,
        });

        send_message(&mut send, &request).await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        let response = recv_message(&mut recv).await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        match response {
            NetMessage::ListDirResponse(ListDirResponse { mut entries, .. }) => {
                // Convert local inodes to global inodes
                for entry in &mut entries {
                    let global = GlobalInode::new(share.index, entry.inode);
                    entry.inode = global.to_packed();
                }
                Ok(entries)
            }
            NetMessage::Error(e) => {
                Err(FuseError::IoError(format!("{:?}: {}", e.code, e.message)))
            }
            _ => Err(FuseError::Internal("unexpected response".into())),
        }
    }

    /// Read file data
    pub async fn read(&self, global: GlobalInode, offset: u64, size: u32) -> Result<Vec<u8>, FuseError> {
        use teleport_core::{ChunkId, NetMessage, ReadChunkRequest, ReadChunkResponse};

        let (share, local_inode) = self.resolve_inode(global)
            .ok_or(FuseError::NotFound)?;

        let conn = self.get_connection_for_share(&share.info.id)
            .ok_or(FuseError::Shutdown)?;

        let (mut send, mut recv) = conn.open_stream().await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        let chunk_id = ChunkId::from_offset(local_inode, offset);

        let request = NetMessage::ReadChunk(ReadChunkRequest {
            chunk_id,
            priority: 0,
        });

        send_message(&mut send, &request).await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        let response = recv_message(&mut recv).await
            .map_err(|e| FuseError::IoError(format!("{:?}", e)))?;

        match response {
            NetMessage::ReadChunkResponse(ReadChunkResponse { data, checksum, .. }) => {
                // Verify checksum
                let computed = teleport_core::crypto::checksum(&data);
                if computed != checksum {
                    return Err(FuseError::IoError("checksum mismatch".into()));
                }

                // Extract requested portion with bounds checking
                let chunk_offset = ChunkId::offset_in_chunk(offset);

                // Bounds check: if offset is beyond data, return empty
                if chunk_offset >= data.len() {
                    return Ok(Vec::new());
                }

                let available = data.len() - chunk_offset;
                let to_read = std::cmp::min(size as usize, available);

                Ok(data[chunk_offset..chunk_offset + to_read].to_vec())
            }
            NetMessage::Error(e) => {
                Err(FuseError::IoError(format!("{:?}: {}", e.code, e.message)))
            }
            _ => Err(FuseError::Internal("unexpected response".into())),
        }
    }

    /// Start health check task
    pub fn start_health_checks(self: &Arc<Self>) -> tokio::task::JoinHandle<()> {
        let manager = Arc::clone(self);

        tokio::spawn(async move {
            let mut interval = tokio::time::interval(manager.health_check_interval);

            loop {
                interval.tick().await;

                for host in manager.hosts.iter() {
                    let host_id = host.key().clone();
                    if host.status == ConnectionStatus::Connected {
                        if let Err(e) = manager.ping_host(&host_id).await {
                            warn!("Health check failed for {}: {:?}", host_id, e);
                            manager.handle_connection_failure(&host_id).await;
                        }
                    }
                }
            }
        })
    }

    /// Ping a host for health check
    async fn ping_host(&self, host_id: &str) -> Result<Duration, ConnectionError> {
        use teleport_core::{NetMessage, PingMessage};

        let conn = {
            let host = self.hosts.get(host_id)
                .ok_or_else(|| ConnectionError::HostNotFound(host_id.to_string()))?;
            host.connection.clone()
                .ok_or(ConnectionError::NotConnected)?
        };

        let (mut send, mut recv) = conn.open_stream().await
            .map_err(|e| ConnectionError::Connection(format!("{:?}", e)))?;

        let start = Instant::now();
        let mut payload = [0u8; 8];
        getrandom::getrandom(&mut payload)
            .expect("RNG failed - system entropy source unavailable");

        let ping = NetMessage::Ping(PingMessage {
            // Safe conversion: millis since epoch won't overflow u64 until year 584 million
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis().min(u64::MAX as u128) as u64)
                .unwrap_or(0),
            payload,
        });

        send_message(&mut send, &ping).await
            .map_err(|e| ConnectionError::Connection(format!("{:?}", e)))?;

        let response = recv_message(&mut recv).await
            .map_err(|e| ConnectionError::Connection(format!("{:?}", e)))?;

        let rtt = start.elapsed();

        match response {
            NetMessage::Pong(pong) => {
                if pong.payload != payload {
                    return Err(ConnectionError::Protocol("ping payload mismatch".into()));
                }

                // Update host RTT
                if let Some(mut host) = self.hosts.get_mut(host_id) {
                    host.rtt_ms = Some(rtt.as_millis() as u32);
                    host.info.rtt_ms = host.rtt_ms;
                    host.last_ping = Some(Instant::now());
                }

                Ok(rtt)
            }
            _ => Err(ConnectionError::Protocol("expected Pong response".into())),
        }
    }

    /// Handle a connection failure
    async fn handle_connection_failure(&self, host_id: &str) {
        let should_reconnect = {
            let mut host = match self.hosts.get_mut(host_id) {
                Some(h) => h,
                None => return,
            };

            host.status = ConnectionStatus::Reconnecting;
            host.info.status = ConnectionStatus::Reconnecting;
            host.connection = None;

            let _ = self.event_tx.send(ConnectionEvent::HostDisconnected {
                host_id: host_id.to_string(),
                reason: "connection lost".into(),
            });

            host.config.reconnect.enabled
        };

        if should_reconnect {
            self.attempt_reconnect(host_id).await;
        }
    }

    /// Attempt to reconnect to a host
    async fn attempt_reconnect(&self, host_id: &str) {
        let (delay, max_attempts) = {
            let host = match self.hosts.get(host_id) {
                Some(h) => h,
                None => return,
            };
            (host.config.reconnect.initial_delay, host.config.reconnect.max_attempts)
        };

        let mut current_delay = delay;

        loop {
            let attempt = {
                let mut host = match self.hosts.get_mut(host_id) {
                    Some(h) => h,
                    None => return,
                };

                host.reconnect_attempts += 1;
                let attempt = host.reconnect_attempts;

                if max_attempts > 0 && attempt > max_attempts {
                    host.status = ConnectionStatus::Failed;
                    host.info.status = ConnectionStatus::Failed;
                    return;
                }

                let _ = self.event_tx.send(ConnectionEvent::HostReconnecting {
                    host_id: host_id.to_string(),
                    attempt,
                });

                attempt
            };

            info!("Reconnecting to {} (attempt {})", host_id, attempt);

            tokio::time::sleep(current_delay).await;

            match self.connect_host(host_id).await {
                Ok(()) => {
                    info!("Reconnected to {}", host_id);
                    return;
                }
                Err(e) => {
                    warn!("Reconnect failed for {}: {:?}", host_id, e);

                    // Exponential backoff
                    let max_delay = {
                        let host = match self.hosts.get(host_id) {
                            Some(h) => h,
                            None => return,
                        };
                        host.config.reconnect.max_delay
                    };

                    current_delay = std::cmp::min(current_delay * 2, max_delay);
                }
            }
        }
    }
}

impl Default for ConnectionManager {
    fn default() -> Self {
        Self::new()
    }
}

// === Blocking methods for FUSE integration ===

impl ConnectionManager {
    /// Blocking lookup - for use in FUSE callbacks
    pub fn lookup_blocking(&self, share_index: u16, parent: Inode, name: &str) -> Result<FileAttr, ConnectionError> {
        use teleport_core::{LookupRequest, LookupResponse, NetMessage};

        let share = self.get_share_by_index(share_index)
            .ok_or(ConnectionError::NotFound)?;

        let conn = self.get_connection_for_share(&share.info.id)
            .ok_or(ConnectionError::NotConnected)?;

        // Use a runtime handle to run async code in blocking context
        let handle = tokio::runtime::Handle::try_current()
            .map_err(|_| ConnectionError::Io("no tokio runtime".into()))?;

        handle.block_on(async {
            let (mut send, mut recv) = conn.open_stream().await
                .map_err(|e| ConnectionError::Connection(format!("{:?}", e)))?;

            let request = NetMessage::Lookup(LookupRequest {
                parent,
                name: name.to_string(),
            });

            send_message(&mut send, &request).await
                .map_err(|e| ConnectionError::Connection(format!("{:?}", e)))?;

            let response = recv_message(&mut recv).await
                .map_err(|e| ConnectionError::Connection(format!("{:?}", e)))?;

            match response {
                NetMessage::LookupResponse(LookupResponse { attr: Some(attr) }) => Ok(attr),
                NetMessage::LookupResponse(LookupResponse { attr: None }) => Err(ConnectionError::NotFound),
                NetMessage::Error(e) => Err(ConnectionError::Protocol(format!("{:?}: {}", e.code, e.message))),
                _ => Err(ConnectionError::Protocol("unexpected response".into())),
            }
        })
    }

    /// Blocking getattr - for use in FUSE callbacks
    pub fn getattr_blocking(&self, share_index: u16, inode: Inode) -> Result<FileAttr, ConnectionError> {
        use teleport_core::{GetAttrRequest, GetAttrResponse, NetMessage};

        let share = self.get_share_by_index(share_index)
            .ok_or(ConnectionError::NotFound)?;

        let conn = self.get_connection_for_share(&share.info.id)
            .ok_or(ConnectionError::NotConnected)?;

        let handle = tokio::runtime::Handle::try_current()
            .map_err(|_| ConnectionError::Io("no tokio runtime".into()))?;

        handle.block_on(async {
            let (mut send, mut recv) = conn.open_stream().await
                .map_err(|e| ConnectionError::Connection(format!("{:?}", e)))?;

            let request = NetMessage::GetAttr(GetAttrRequest { inode });

            send_message(&mut send, &request).await
                .map_err(|e| ConnectionError::Connection(format!("{:?}", e)))?;

            let response = recv_message(&mut recv).await
                .map_err(|e| ConnectionError::Connection(format!("{:?}", e)))?;

            match response {
                NetMessage::GetAttrResponse(GetAttrResponse { attr: Some(attr) }) => Ok(attr),
                NetMessage::GetAttrResponse(GetAttrResponse { attr: None }) => Err(ConnectionError::NotFound),
                NetMessage::Error(e) => Err(ConnectionError::Protocol(format!("{:?}: {}", e.code, e.message))),
                _ => Err(ConnectionError::Protocol("unexpected response".into())),
            }
        })
    }

    /// Blocking readdir - for use in FUSE callbacks
    pub fn readdir_blocking(&self, share_index: u16, inode: Inode, offset: u64) -> Result<Vec<DirEntry>, ConnectionError> {
        use teleport_core::{ListDirRequest, ListDirResponse, NetMessage};

        let share = self.get_share_by_index(share_index)
            .ok_or(ConnectionError::NotFound)?;

        let conn = self.get_connection_for_share(&share.info.id)
            .ok_or(ConnectionError::NotConnected)?;

        let handle = tokio::runtime::Handle::try_current()
            .map_err(|_| ConnectionError::Io("no tokio runtime".into()))?;

        handle.block_on(async {
            let (mut send, mut recv) = conn.open_stream().await
                .map_err(|e| ConnectionError::Connection(format!("{:?}", e)))?;

            let request = NetMessage::ListDir(ListDirRequest {
                inode,
                offset,
                limit: 1000,
            });

            send_message(&mut send, &request).await
                .map_err(|e| ConnectionError::Connection(format!("{:?}", e)))?;

            let response = recv_message(&mut recv).await
                .map_err(|e| ConnectionError::Connection(format!("{:?}", e)))?;

            match response {
                NetMessage::ListDirResponse(ListDirResponse { entries, .. }) => Ok(entries),
                NetMessage::Error(e) => Err(ConnectionError::Protocol(format!("{:?}: {}", e.code, e.message))),
                _ => Err(ConnectionError::Protocol("unexpected response".into())),
            }
        })
    }

    /// Blocking read chunk - for use in FUSE callbacks
    pub fn read_chunk_blocking(&self, share_index: u16, chunk_id: teleport_core::ChunkId) -> Result<Vec<u8>, ConnectionError> {
        use teleport_core::{NetMessage, ReadChunkRequest, ReadChunkResponse};

        let share = self.get_share_by_index(share_index)
            .ok_or(ConnectionError::NotFound)?;

        let conn = self.get_connection_for_share(&share.info.id)
            .ok_or(ConnectionError::NotConnected)?;

        let handle = tokio::runtime::Handle::try_current()
            .map_err(|_| ConnectionError::Io("no tokio runtime".into()))?;

        handle.block_on(async {
            let (mut send, mut recv) = conn.open_stream().await
                .map_err(|e| ConnectionError::Connection(format!("{:?}", e)))?;

            let request = NetMessage::ReadChunk(ReadChunkRequest {
                chunk_id,
                priority: 0,
            });

            send_message(&mut send, &request).await
                .map_err(|e| ConnectionError::Connection(format!("{:?}", e)))?;

            let response = recv_message(&mut recv).await
                .map_err(|e| ConnectionError::Connection(format!("{:?}", e)))?;

            match response {
                NetMessage::ReadChunkResponse(ReadChunkResponse { data, checksum, .. }) => {
                    // Verify checksum
                    let computed = teleport_core::crypto::checksum(&data);
                    if computed != checksum {
                        return Err(ConnectionError::Io("checksum mismatch".into()));
                    }
                    Ok(data)
                }
                NetMessage::Error(e) => Err(ConnectionError::Protocol(format!("{:?}: {}", e.code, e.message))),
                _ => Err(ConnectionError::Protocol("unexpected response".into())),
            }
        })
    }
}

/// Errors from the connection manager
#[derive(Debug)]
pub enum ConnectionError {
    /// Host not found
    HostNotFound(String),
    /// Not connected
    NotConnected,
    /// Connection error
    Connection(String),
    /// Protocol error
    Protocol(String),
    /// Version mismatch
    VersionMismatch { expected: u32, actual: u32 },
    /// File/inode not found
    NotFound,
    /// IO error
    Io(String),
}

impl std::fmt::Display for ConnectionError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ConnectionError::HostNotFound(id) => write!(f, "Host not found: {}", id),
            ConnectionError::NotConnected => write!(f, "Not connected"),
            ConnectionError::Connection(msg) => write!(f, "Connection error: {}", msg),
            ConnectionError::Protocol(msg) => write!(f, "Protocol error: {}", msg),
            ConnectionError::VersionMismatch { expected, actual } => {
                write!(f, "Version mismatch: expected {}, got {}", expected, actual)
            }
            ConnectionError::NotFound => write!(f, "Not found"),
            ConnectionError::Io(msg) => write!(f, "IO error: {}", msg),
        }
    }
}

impl std::error::Error for ConnectionError {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_reconnect_config_default() {
        let config = ReconnectConfig::default();
        assert!(config.enabled);
        assert_eq!(config.initial_delay, Duration::from_secs(1));
        assert_eq!(config.max_delay, Duration::from_secs(60));
        assert_eq!(config.max_attempts, 0);
    }

    #[test]
    fn test_connection_manager_new() {
        let manager = ConnectionManager::new();
        assert!(manager.get_shares().is_empty());
        assert!(manager.get_hosts().is_empty());
    }

    #[test]
    fn test_global_inode_resolution() {
        let manager = ConnectionManager::new();

        // Virtual root should not resolve
        assert!(manager.resolve_inode(GlobalInode::VIRTUAL_ROOT).is_none());

        // Non-existent share should not resolve
        let unknown = GlobalInode::new(999, 42);
        assert!(manager.resolve_inode(unknown).is_none());
    }
}
