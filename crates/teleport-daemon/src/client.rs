//! Wormhole client - connects to remote host and serves FUSE requests

use std::net::SocketAddr;
use std::path::PathBuf;
use std::time::Duration;

use tracing::info;

use teleport_core::{
    ChunkId, DirEntry, FileAttr, GetAttrRequest, GetAttrResponse, HelloMessage, Inode,
    ListDirRequest, ListDirResponse, LookupRequest, LookupResponse, NetMessage,
    ReadChunkRequest, ReadChunkResponse, PROTOCOL_VERSION, ROOT_INODE,
};

use crate::bridge::{BridgeHandler, FuseError, FuseRequest};
use crate::net::{connect, create_client_endpoint, recv_message, send_message, QuicConnection};

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
}

impl WormholeClient {
    pub fn new(config: ClientConfig) -> Self {
        Self {
            config,
            connection: None,
            session_id: None,
            root_inode: ROOT_INODE,
        }
    }

    /// Connect to the server and perform handshake
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
        getrandom::getrandom(&mut client_id).expect("RNG failed");

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
