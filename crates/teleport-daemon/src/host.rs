//! Wormhole host - serves local directory to remote clients

use std::fs;
use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use dashmap::DashMap;
use parking_lot::RwLock;
use tokio::sync::Semaphore;
use tracing::{debug, error, info, warn};

use teleport_core::{
    crypto::checksum, DirEntry, ErrorCode, ErrorMessage, FileAttr, FileType, GetAttrRequest,
    GetAttrResponse, HelloAckMessage, Inode, ListDirRequest, ListDirResponse, LookupRequest,
    LookupResponse, NetMessage, ReadChunkRequest, ReadChunkResponse, CHUNK_SIZE,
    FIRST_USER_INODE, PROTOCOL_VERSION, ROOT_INODE,
};

use crate::net::{create_server_endpoint, recv_message, send_message, ConnectionError};

/// Host configuration
pub struct HostConfig {
    pub bind_addr: SocketAddr,
    pub shared_path: PathBuf,
    pub max_connections: usize,
    pub host_name: String,
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
        }
    }
}

/// Inode table mapping inodes to paths
struct InodeTable {
    inode_to_path: DashMap<Inode, PathBuf>,
    path_to_inode: DashMap<PathBuf, Inode>,
    next_inode: RwLock<Inode>,
}

impl InodeTable {
    fn new(root: PathBuf) -> Self {
        let table = Self {
            inode_to_path: DashMap::new(),
            path_to_inode: DashMap::new(),
            next_inode: RwLock::new(FIRST_USER_INODE),
        };

        // Root is always inode 1
        table.inode_to_path.insert(ROOT_INODE, root.clone());
        table.path_to_inode.insert(root, ROOT_INODE);

        table
    }

    fn get_path(&self, inode: Inode) -> Option<PathBuf> {
        self.inode_to_path.get(&inode).map(|r| r.clone())
    }

    fn get_or_create_inode(&self, path: PathBuf) -> Inode {
        if let Some(inode) = self.path_to_inode.get(&path) {
            return *inode;
        }

        let mut next = self.next_inode.write();
        let inode = *next;
        *next += 1;

        self.inode_to_path.insert(inode, path.clone());
        self.path_to_inode.insert(path, inode);

        inode
    }
}

/// Wormhole host server
pub struct WormholeHost {
    config: HostConfig,
    inodes: Arc<InodeTable>,
    connection_semaphore: Arc<Semaphore>,
}

impl WormholeHost {
    pub fn new(config: HostConfig) -> Self {
        let inodes = Arc::new(InodeTable::new(config.shared_path.clone()));

        Self {
            connection_semaphore: Arc::new(Semaphore::new(config.max_connections)),
            config,
            inodes,
        }
    }

    /// Start serving connections
    pub async fn serve(&self) -> Result<(), HostError> {
        let endpoint = create_server_endpoint(self.config.bind_addr)
            .map_err(|e| HostError::Bind(format!("{:?}", e)))?;

        info!(
            "Wormhole host listening on {} serving {:?}",
            self.config.bind_addr, self.config.shared_path
        );

        loop {
            let incoming = endpoint.accept().await;

            match incoming {
                Some(conn) => {
                    let permit = self.connection_semaphore.clone().acquire_owned().await;
                    if permit.is_err() {
                        warn!("connection limit reached");
                        continue;
                    }
                    let permit = permit.unwrap();

                    let inodes = self.inodes.clone();
                    let shared_path = self.config.shared_path.clone();
                    let host_name = self.config.host_name.clone();

                    tokio::spawn(async move {
                        match conn.await {
                            Ok(connection) => {
                                let remote = connection.remote_address();
                                info!("New connection from {}", remote);

                                if let Err(e) = handle_connection(
                                    connection,
                                    inodes,
                                    shared_path,
                                    host_name,
                                )
                                .await
                                {
                                    error!("Connection error from {}: {:?}", remote, e);
                                }
                            }
                            Err(e) => {
                                warn!("Connection failed: {:?}", e);
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
    getrandom::getrandom(&mut session_id).expect("RNG failed");

    // Send HelloAck
    let ack = NetMessage::HelloAck(HelloAckMessage {
        protocol_version: PROTOCOL_VERSION,
        session_id,
        root_inode: ROOT_INODE,
        host_name: host_name.clone(),
        capabilities: vec!["read".into()],
    });
    send_message(&mut send, &ack).await?;

    info!(
        "Client {:?} authenticated, session {:?}",
        &client_id[..4],
        &session_id[..4]
    );

    // Handle requests
    loop {
        let stream = connection.accept_bi().await;

        match stream {
            Ok((mut send, mut recv)) => {
                let inodes = inodes.clone();
                let shared_path = shared_path.clone();

                tokio::spawn(async move {
                    if let Err(e) =
                        handle_request(&mut send, &mut recv, &inodes, &shared_path).await
                    {
                        debug!("Request error: {:?}", e);
                    }
                });
            }
            Err(quinn::ConnectionError::ApplicationClosed(_)) => {
                info!("Client disconnected gracefully");
                break;
            }
            Err(e) => {
                error!("Stream accept error: {:?}", e);
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
    inodes: &InodeTable,
    shared_path: &Path,
) -> Result<(), ConnectionError> {
    let request = recv_message(recv).await?;

    let response = match request {
        NetMessage::Lookup(req) => handle_lookup(req, inodes, shared_path),
        NetMessage::GetAttr(req) => handle_getattr(req, inodes),
        NetMessage::ListDir(req) => handle_listdir(req, inodes),
        NetMessage::ReadChunk(req) => handle_read_chunk(req, inodes),
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
            let inode = inodes.get_or_create_inode(child_path);
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

fn handle_getattr(req: GetAttrRequest, inodes: &InodeTable) -> NetMessage {
    let path = match inodes.get_path(req.inode) {
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

fn handle_listdir(req: ListDirRequest, inodes: &InodeTable) -> NetMessage {
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

    match fs::read_dir(&path) {
        Ok(entries) => {
            let mut dir_entries = Vec::new();

            for (i, entry) in entries.enumerate() {
                if i < req.offset as usize {
                    continue;
                }
                if dir_entries.len() >= req.limit as usize {
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

                        let inode = inodes.get_or_create_inode(entry_path);
                        dir_entries.push(DirEntry::new(name, inode, file_type));
                    }
                }
            }

            let has_more = dir_entries.len() >= req.limit as usize;
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

fn handle_read_chunk(req: ReadChunkRequest, inodes: &InodeTable) -> NetMessage {
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

    use std::io::{Read, Seek, SeekFrom};
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

    FileAttr {
        inode,
        file_type,
        size: meta.len(),
        mode: meta.mode(),
        nlink: meta.nlink() as u32,
        uid: meta.uid(),
        gid: meta.gid(),
        atime: meta.atime() as u64,
        atime_nsec: meta.atime_nsec() as u32,
        mtime: meta.mtime() as u64,
        mtime_nsec: meta.mtime_nsec() as u32,
        ctime: meta.ctime() as u64,
        ctime_nsec: meta.ctime_nsec() as u32,
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

    #[test]
    fn test_inode_table() {
        let table = InodeTable::new(PathBuf::from("/shared"));

        // Root is inode 1
        assert_eq!(table.get_path(ROOT_INODE), Some(PathBuf::from("/shared")));

        // New paths get new inodes
        let inode = table.get_or_create_inode(PathBuf::from("/shared/file.txt"));
        assert_eq!(inode, FIRST_USER_INODE);

        // Same path returns same inode
        let inode2 = table.get_or_create_inode(PathBuf::from("/shared/file.txt"));
        assert_eq!(inode, inode2);

        // Different path gets different inode
        let inode3 = table.get_or_create_inode(PathBuf::from("/shared/other.txt"));
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
        let file_inode = table.get_or_create_inode(test_file.clone());

        // Read first chunk
        let request = ReadChunkRequest {
            chunk_id: ChunkId::new(file_inode, 0),
            priority: 0,
        };

        let response = handle_read_chunk(request, &table);

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
        let file_inode = table.get_or_create_inode(test_file.clone());

        // Read first chunk
        let req1 = ReadChunkRequest {
            chunk_id: ChunkId::new(file_inode, 0),
            priority: 0,
        };
        let resp1 = handle_read_chunk(req1, &table);

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
        let resp2 = handle_read_chunk(req2, &table);

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
        let resp3 = handle_read_chunk(req3, &table);

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

        let response = handle_read_chunk(request, &table);

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
        let subdir_inode = table.get_or_create_inode(subdir.clone());

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

        let response = handle_listdir(request, &table);

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
}
