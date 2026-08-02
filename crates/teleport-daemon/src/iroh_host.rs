//! Optional iroh-based host accept loop (feature = `iroh`).
//!
//! Runs alongside the classic quinn host during migration. Join-code SPAKE2
//! still establishes trust; Endpoint IDs are exchanged for dial-by-key.

use teleport_core::protocol::{HelloAckMessage, HelloMessage, NetMessage};
use teleport_core::{WireCodec, PROTOCOL_VERSION, ROOT_INODE};
use teleport_net::{send_message, WormholeEndpoint, WORMHOLE_ALPN};
use tracing::{info, warn};

/// Start an iroh endpoint that accepts Wormhole ALPN and answers Hello.
///
/// Returns the bound endpoint id hex for share handoff.
pub async fn run_iroh_hello_host(host_name: String) -> Result<String, String> {
    let ep = WormholeEndpoint::bind().await.map_err(|e| e.to_string())?;
    let id_hex = ep.endpoint_id_hex();
    info!(
        endpoint_id = %id_hex,
        alpn = %String::from_utf8_lossy(WORMHOLE_ALPN),
        "iroh host listening"
    );
    ep.online().await;

    loop {
        match ep.accept().await {
            Ok(conn) => {
                let remote = conn.remote_id();
                info!(%remote, "iroh peer connected");
                let name = host_name.clone();
                tokio::spawn(async move {
                    if let Err(e) = handle_peer(conn, name).await {
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
    Ok(id_hex)
}

async fn handle_peer(
    conn: teleport_net::WormholeConnection,
    host_name: String,
) -> Result<(), String> {
    let (msg, mut send) = conn.accept_message().await.map_err(|e| e.to_string())?;
    match msg {
        NetMessage::Hello(HelloMessage {
            protocol_version,
            client_id,
            capabilities,
        }) => {
            info!(?client_id, protocol_version, ?capabilities, "iroh hello");
            let codec = WireCodec::negotiate(&crate::net::host_capabilities(true), &capabilities);
            let mut session_id = [0u8; 16];
            getrandom::fill(&mut session_id).map_err(|e| e.to_string())?;
            let ack = NetMessage::HelloAck(HelloAckMessage {
                protocol_version: PROTOCOL_VERSION,
                session_id,
                root_inode: ROOT_INODE,
                host_name,
                capabilities: crate::net::host_capabilities(true),
            });
            send_message(&mut send, &ack, codec)
                .await
                .map_err(|e| e.to_string())?;
            send.finish().map_err(|e| e.to_string())?;
            Ok(())
        }
        other => Err(format!("unexpected first message: {other:?}")),
    }
}
