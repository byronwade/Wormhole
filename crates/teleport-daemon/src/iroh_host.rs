//! Optional iroh-based host accept loop (feature = `iroh`).
//!
//! Serves the same `NetMessage` request surface as the classic quinn host over
//! the Wormhole ALPN (`wormhole/1`). Join-code SPAKE2 still establishes trust;
//! Endpoint IDs are exchanged for dial-by-key.

use std::path::PathBuf;
use std::sync::Arc;

use teleport_core::protocol::{HelloAckMessage, HelloMessage, NetMessage};
use teleport_core::{WireCodec, PROTOCOL_VERSION, ROOT_INODE};
use teleport_net::{send_message, WormholeConnection, WormholeEndpoint, WORMHOLE_ALPN};
use tracing::{debug, info, warn};

use crate::host::{dispatch_request, InodeTable};
use crate::lock_manager::LockManager;
use crate::net::{host_capabilities, negotiate_session_codec};

/// Configuration for an iroh share session.
pub struct IrohHostConfig {
    pub shared_path: PathBuf,
    pub host_name: String,
    /// Advertise on LAN via mDNS (iroh-mdns-address-lookup).
    pub announce_mdns: bool,
}

/// Running iroh share: endpoint id is available immediately; `join` drives accept loop.
pub struct IrohShareHandle {
    pub endpoint_id_hex: String,
    pub join: tokio::task::JoinHandle<()>,
}

impl IrohShareHandle {
    /// Wait until the accept loop ends.
    pub async fn wait(self) -> Result<(), String> {
        self.join.await.map_err(|e| e.to_string())
    }

    /// Abort the accept loop.
    pub fn abort(self) {
        self.join.abort();
    }
}

/// Bind an iroh endpoint and spawn the accept loop.
pub async fn start_iroh_share(config: IrohHostConfig) -> Result<IrohShareHandle, String> {
    let ep = if config.announce_mdns {
        WormholeEndpoint::bind_with_mdns()
            .await
            .map_err(|e| e.to_string())?
    } else {
        WormholeEndpoint::bind().await.map_err(|e| e.to_string())?
    };
    let id_hex = ep.endpoint_id_hex();
    info!(
        endpoint_id = %id_hex,
        alpn = %String::from_utf8_lossy(WORMHOLE_ALPN),
        path = %config.shared_path.display(),
        mdns = config.announce_mdns,
        "iroh host listening"
    );
    ep.online().await;

    let inodes = Arc::new(InodeTable::new(config.shared_path.clone()));
    let lock_manager = Arc::new(LockManager::default());
    let shared_path = config.shared_path;
    let host_name = config.host_name;

    let join = tokio::spawn(async move {
        loop {
            match ep.accept().await {
                Ok(conn) => {
                    let remote = conn.remote_id();
                    info!(%remote, "iroh peer connected");
                    let inodes = inodes.clone();
                    let lock_manager = lock_manager.clone();
                    let shared_path = shared_path.clone();
                    let name = host_name.clone();
                    tokio::spawn(async move {
                        if let Err(e) =
                            handle_peer(conn, name, inodes, shared_path, lock_manager).await
                        {
                            warn!(error = %e, "iroh peer handler ended");
                        }
                    });
                }
                Err(e) => {
                    warn!(error = %e, "iroh accept failed");
                    break;
                }
            }
        }
    });

    Ok(IrohShareHandle {
        endpoint_id_hex: id_hex,
        join,
    })
}

/// Run until the accept loop ends (blocks).
pub async fn run_iroh_share(config: IrohHostConfig) -> Result<String, String> {
    let handle = start_iroh_share(config).await?;
    let id = handle.endpoint_id_hex.clone();
    handle.wait().await?;
    Ok(id)
}

/// Hello-only host (compat / tests). Prefer [`start_iroh_share`] for real mounts.
pub async fn run_iroh_hello_host(host_name: String) -> Result<String, String> {
    let handle = start_iroh_share(IrohHostConfig {
        shared_path: std::env::temp_dir(),
        host_name,
        announce_mdns: false,
    })
    .await?;
    Ok(handle.endpoint_id_hex)
}

async fn handle_peer(
    mut conn: WormholeConnection,
    host_name: String,
    inodes: Arc<InodeTable>,
    shared_path: PathBuf,
    lock_manager: Arc<LockManager>,
) -> Result<(), String> {
    // First stream: Hello / HelloAck (postcard by default on iroh path)
    let (msg, mut send) = conn.accept_message().await.map_err(|e| e.to_string())?;
    let (client_id, remote_caps) = match msg {
        NetMessage::Hello(HelloMessage {
            protocol_version,
            client_id,
            capabilities,
        }) => {
            if protocol_version == 0 || protocol_version > PROTOCOL_VERSION {
                return Err(format!("unsupported protocol version {protocol_version}"));
            }
            (client_id, capabilities)
        }
        other => return Err(format!("unexpected first message: {other:?}")),
    };

    let local_caps = host_capabilities(true);
    let codec = negotiate_session_codec(&local_caps, &remote_caps);
    conn.set_codec(codec);

    let mut session_id = [0u8; 16];
    getrandom::fill(&mut session_id).map_err(|e| e.to_string())?;
    let ack = NetMessage::HelloAck(HelloAckMessage {
        protocol_version: PROTOCOL_VERSION,
        session_id,
        root_inode: ROOT_INODE,
        host_name,
        capabilities: local_caps,
    });
    send_message(&mut send, &ack, codec)
        .await
        .map_err(|e| e.to_string())?;
    send.finish().map_err(|e| e.to_string())?;

    let holder_id = format!(
        "{:02x}{:02x}{:02x}{:02x}",
        client_id[0], client_id[1], client_id[2], client_id[3]
    );
    info!(
        holder = %holder_id,
        codec = ?codec,
        "iroh session established"
    );

    // Subsequent streams: request/response
    loop {
        let (request, mut send) = match conn.accept_message().await {
            Ok(v) => v,
            Err(e) => {
                debug!(error = %e, "iroh peer closed");
                break;
            }
        };
        let response = dispatch_request(
            request,
            &inodes,
            &shared_path,
            &lock_manager,
            &holder_id,
        );
        if let Err(e) = send_message(&mut send, &response, codec).await {
            warn!(error = %e, "iroh response send failed");
            break;
        }
        let _ = send.finish();
    }

    lock_manager.release_all_by_holder(&holder_id);
    Ok(())
}

/// Dial an iroh endpoint and complete Hello (used by CLI mount --transport iroh).
pub async fn iroh_hello_client(
    endpoint_id_hex: &str,
    announce_mdns: bool,
) -> Result<(WormholeConnection, WireCodec, String), String> {
    let ep = if announce_mdns {
        WormholeEndpoint::bind_with_mdns()
            .await
            .map_err(|e| e.to_string())?
    } else {
        WormholeEndpoint::bind().await.map_err(|e| e.to_string())?
    };
    ep.online().await;

    let peer_id = teleport_net::parse_endpoint_id_hex(endpoint_id_hex).map_err(|e| e.to_string())?;
    let addr = teleport_net::endpoint_addr_from_id(peer_id);
    let mut conn = ep.connect(addr).await.map_err(|e| e.to_string())?;

    let mut client_id = [0u8; 16];
    getrandom::fill(&mut client_id).map_err(|e| e.to_string())?;
    let hello = NetMessage::Hello(HelloMessage {
        protocol_version: PROTOCOL_VERSION,
        client_id,
        capabilities: crate::net::client_capabilities(),
    });
    let reply = conn.request(&hello).await.map_err(|e| e.to_string())?;
    match reply {
        NetMessage::HelloAck(ack) => {
            let codec =
                negotiate_session_codec(&crate::net::client_capabilities(), &ack.capabilities);
            conn.set_codec(codec);
            Ok((conn, codec, ack.host_name))
        }
        other => Err(format!("unexpected hello reply: {other:?}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use teleport_core::protocol::{GetAttrRequest, GetAttrResponse};
    use tempfile::TempDir;
    use tokio::time::{timeout, Duration};

    #[tokio::test]
    async fn iroh_share_hello_and_getattr() {
        let dir = TempDir::new().unwrap();
        std::fs::write(dir.path().join("hi.txt"), b"hello").unwrap();
        let host_path = dir.path().to_path_buf();

        let host = WormholeEndpoint::bind_empty_relays().await.unwrap();
        let host_addr = host.endpoint().addr();

        let server = tokio::spawn(async move {
            let conn = host.accept().await.expect("accept");
            let inodes = Arc::new(InodeTable::new(host_path.clone()));
            let locks = Arc::new(LockManager::default());
            handle_peer(conn, "test-host".into(), inodes, host_path, locks)
                .await
                .expect("peer");
        });

        let client = async {
            let ep = WormholeEndpoint::bind_empty_relays().await.unwrap();
            let mut conn = ep.connect(host_addr).await.expect("connect");
            let mut client_id = [0u8; 16];
            getrandom::fill(&mut client_id).unwrap();
            let hello = NetMessage::Hello(HelloMessage {
                protocol_version: PROTOCOL_VERSION,
                client_id,
                capabilities: crate::net::client_capabilities(),
            });
            let reply = conn.request(&hello).await.expect("hello");
            let NetMessage::HelloAck(ack) = reply else {
                panic!("expected HelloAck");
            };
            let codec =
                negotiate_session_codec(&crate::net::client_capabilities(), &ack.capabilities);
            conn.set_codec(codec);

            let getattr = NetMessage::GetAttr(GetAttrRequest { inode: ROOT_INODE });
            let reply = conn.request(&getattr).await.expect("getattr");
            match reply {
                NetMessage::GetAttrResponse(GetAttrResponse { attr: Some(attr) }) => {
                    assert_eq!(attr.inode, ROOT_INODE);
                }
                other => panic!("unexpected getattr reply: {other:?}"),
            }
            conn.close("done");
        };

        timeout(Duration::from_secs(20), async {
            client.await;
            // Abort host after client done
            server.abort();
        })
        .await
        .expect("iroh share roundtrip timed out");
    }
}
