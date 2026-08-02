//! Wormhole networking on **iroh** (QUIC dial-by-key + relay + discovery).
//!
//! ALPN: `wormhole/1` carries framed [`teleport_core::NetMessage`] payloads.
//! Join codes still derive session trust via SPAKE2; Endpoint IDs are exchanged
//! afterward for subsequent dials.

use std::sync::Arc;

use iroh::tls::default_provider;
use iroh::{
    endpoint::presets::{self, Empty},
    protocol::{ProtocolHandler, Router},
    Endpoint, EndpointAddr, EndpointId, RelayMode, SecretKey,
};
use teleport_core::{
    deserialize_with_codec, serialize_with_codec, NetMessage, ProtocolError, WireCodec,
    MAX_MESSAGE_SIZE,
};
use thiserror::Error;
use tracing::{debug, info};

/// ALPN identifier for the Wormhole control/data protocol.
pub const WORMHOLE_ALPN: &[u8] = b"wormhole/1";

#[derive(Error, Debug)]
pub enum NetError {
    #[error("iroh endpoint: {0}")]
    Endpoint(String),
    #[error("connect: {0}")]
    Connect(String),
    #[error("accept: {0}")]
    Accept(String),
    #[error("stream: {0}")]
    Stream(String),
    #[error("protocol: {0}")]
    Protocol(#[from] ProtocolError),
    #[error("closed")]
    Closed,
}

/// Wormhole iroh endpoint wrapper.
pub struct WormholeEndpoint {
    endpoint: Endpoint,
    secret_key: SecretKey,
}

impl WormholeEndpoint {
    /// Bind a new endpoint with default N0 preset (public relays + DNS lookup).
    ///
    /// For air-gapped / self-host, use [`Self::bind_relay_only`] later.
    pub async fn bind() -> Result<Self, NetError> {
        let secret_key = SecretKey::generate();
        Self::bind_with_key(secret_key).await
    }

    /// Bind with an existing secret key (persistent identity).
    pub async fn bind_with_key(secret_key: SecretKey) -> Result<Self, NetError> {
        let endpoint = Endpoint::builder(presets::N0)
            .secret_key(secret_key.clone())
            .alpns(vec![WORMHOLE_ALPN.to_vec()])
            .bind()
            .await
            .map_err(|e| NetError::Endpoint(e.to_string()))?;

        info!(
            endpoint_id = %endpoint.id(),
            "wormhole iroh endpoint bound"
        );

        Ok(Self {
            endpoint,
            secret_key,
        })
    }

    /// Bind without relays (direct addressing only — for tests / LAN).
    pub async fn bind_empty_relays() -> Result<Self, NetError> {
        let secret_key = SecretKey::generate();
        let endpoint = Endpoint::builder(Empty)
            .secret_key(secret_key.clone())
            .alpns(vec![WORMHOLE_ALPN.to_vec()])
            .relay_mode(RelayMode::Disabled)
            .crypto_provider(default_provider())
            .bind()
            .await
            .map_err(|e| NetError::Endpoint(e.to_string()))?;
        Ok(Self {
            endpoint,
            secret_key,
        })
    }

    pub fn endpoint_id(&self) -> EndpointId {
        self.endpoint.id()
    }

    pub fn endpoint(&self) -> &Endpoint {
        &self.endpoint
    }

    pub fn secret_key(&self) -> &SecretKey {
        &self.secret_key
    }

    /// Hex-encoded endpoint id for join-code handoff / CLI display.
    pub fn endpoint_id_hex(&self) -> String {
        hex::encode(self.endpoint.id().as_bytes())
    }

    /// Connect to a peer by endpoint address and open a bi stream.
    pub async fn connect(&self, addr: EndpointAddr) -> Result<WormholeConnection, NetError> {
        let conn = self
            .endpoint
            .connect(addr, WORMHOLE_ALPN)
            .await
            .map_err(|e| NetError::Connect(e.to_string()))?;
        Ok(WormholeConnection {
            conn,
            codec: WireCodec::Postcard,
        })
    }

    /// Accept the next incoming connection.
    pub async fn accept(&self) -> Result<WormholeConnection, NetError> {
        let incoming = self.endpoint.accept().await.ok_or(NetError::Closed)?;
        let accepting = incoming
            .accept()
            .map_err(|e| NetError::Accept(e.to_string()))?;
        let conn = accepting
            .await
            .map_err(|e| NetError::Accept(e.to_string()))?;
        Ok(WormholeConnection {
            conn,
            codec: WireCodec::Postcard,
        })
    }

    /// Wait until the endpoint is online (relay home established when using N0).
    pub async fn online(&self) {
        self.endpoint.online().await;
    }

    /// Graceful close.
    pub async fn close(self) {
        self.endpoint.close().await;
    }
}

/// Active QUIC connection carrying Wormhole messages.
pub struct WormholeConnection {
    conn: iroh::endpoint::Connection,
    codec: WireCodec,
}

impl WormholeConnection {
    pub fn set_codec(&mut self, codec: WireCodec) {
        self.codec = codec;
    }

    pub fn codec(&self) -> WireCodec {
        self.codec
    }

    pub fn remote_id(&self) -> EndpointId {
        self.conn.remote_id()
    }

    /// Open bi-directional stream and send a message (lazy stream creation).
    pub async fn open_and_send(&self, msg: &NetMessage) -> Result<(), NetError> {
        let (mut send, _recv) = self
            .conn
            .open_bi()
            .await
            .map_err(|e| NetError::Stream(e.to_string()))?;
        send_message(&mut send, msg, self.codec).await?;
        send.finish().map_err(|e| NetError::Stream(e.to_string()))?;
        Ok(())
    }

    /// Open bi stream for request/response.
    pub async fn request(&self, msg: &NetMessage) -> Result<NetMessage, NetError> {
        let (mut send, mut recv) = self
            .conn
            .open_bi()
            .await
            .map_err(|e| NetError::Stream(e.to_string()))?;
        send_message(&mut send, msg, self.codec).await?;
        send.finish().map_err(|e| NetError::Stream(e.to_string()))?;
        recv_message(&mut recv, self.codec).await
    }

    /// Accept bi stream and read one message.
    pub async fn accept_message(
        &self,
    ) -> Result<(NetMessage, iroh::endpoint::SendStream), NetError> {
        let (send, mut recv) = self
            .conn
            .accept_bi()
            .await
            .map_err(|e| NetError::Stream(e.to_string()))?;
        let msg = recv_message(&mut recv, self.codec).await?;
        Ok((msg, send))
    }

    pub fn close(&self, reason: &str) {
        self.conn.close(0u32.into(), reason.as_bytes());
    }
}

/// Send length-prefixed message on a send stream.
pub async fn send_message(
    stream: &mut iroh::endpoint::SendStream,
    msg: &NetMessage,
    codec: WireCodec,
) -> Result<(), NetError> {
    let data = serialize_with_codec(msg, codec)?;
    stream
        .write_all(&data)
        .await
        .map_err(|e| NetError::Stream(e.to_string()))?;
    debug!(bytes = data.len(), ?codec, "sent wormhole message");
    Ok(())
}

/// Receive length-prefixed message from a recv stream.
pub async fn recv_message(
    stream: &mut iroh::endpoint::RecvStream,
    codec: WireCodec,
) -> Result<NetMessage, NetError> {
    let mut len_buf = [0u8; 4];
    stream
        .read_exact(&mut len_buf)
        .await
        .map_err(|e| NetError::Stream(e.to_string()))?;
    let len = u32::from_le_bytes(len_buf) as usize;
    if len > MAX_MESSAGE_SIZE {
        return Err(NetError::Protocol(ProtocolError::MessageTooLarge {
            size: len,
            max: MAX_MESSAGE_SIZE,
        }));
    }
    let mut payload = vec![0u8; len];
    stream
        .read_exact(&mut payload)
        .await
        .map_err(|e| NetError::Stream(e.to_string()))?;
    Ok(deserialize_with_codec(&payload, codec)?)
}

/// Parse endpoint id from hex.
pub fn parse_endpoint_id_hex(s: &str) -> Result<EndpointId, NetError> {
    let bytes = hex::decode(s.trim()).map_err(|e| NetError::Connect(e.to_string()))?;
    let arr: [u8; 32] = bytes
        .as_slice()
        .try_into()
        .map_err(|_| NetError::Connect("endpoint id must be 32 bytes".into()))?;
    EndpointId::from_bytes(&arr).map_err(|e| NetError::Connect(e.to_string()))
}

/// Minimal protocol handler for Router-based accept loops.
#[derive(Debug, Clone, Default)]
pub struct WormholeProtocol;

impl ProtocolHandler for WormholeProtocol {
    async fn accept(
        &self,
        connection: iroh::endpoint::Connection,
    ) -> Result<(), iroh::protocol::AcceptError> {
        debug!(remote = %connection.remote_id(), "wormhole protocol accept");
        // Application should take over via Endpoint::accept; this handler
        // acknowledges ALPN routing when using Router.
        let _ = connection;
        Ok(())
    }
}

/// Spawn a router that accepts the Wormhole ALPN (optional helper).
pub async fn spawn_router(endpoint: Endpoint) -> Result<Router, NetError> {
    let router = Router::builder(endpoint)
        .accept(WORMHOLE_ALPN, Arc::new(WormholeProtocol))
        .spawn();
    Ok(router)
}

/// Join-code → Endpoint ID exchange payload (after SPAKE2).
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct EndpointHandoff {
    pub endpoint_id_hex: String,
    pub direct_addrs: Vec<String>,
    pub relay_url: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use teleport_core::protocol::{HelloMessage, NetMessage};
    use tokio::time::{timeout, Duration};

    #[tokio::test]
    async fn local_iroh_hello_roundtrip() {
        let host = WormholeEndpoint::bind_empty_relays().await.unwrap();
        let host_addr = host.endpoint().addr();
        assert!(
            !host_addr.addrs.is_empty(),
            "host must have at least one direct address"
        );

        let server = tokio::spawn(async move {
            let incoming = host.endpoint().accept().await.expect("incoming");
            let conn = incoming.accept().expect("accept").await.expect("handshake");
            let (mut send, mut recv) = conn.accept_bi().await.expect("accept bi");
            let msg = recv_message(&mut recv, WireCodec::Postcard)
                .await
                .expect("recv hello");
            assert!(matches!(msg, NetMessage::Hello(_)));
            let ack = NetMessage::Hello(HelloMessage {
                protocol_version: 2,
                client_id: [2; 16],
                capabilities: WireCodec::local_capabilities(),
            });
            send_message(&mut send, &ack, WireCodec::Postcard)
                .await
                .expect("send ack");
            send.finish().expect("finish");
            conn.closed().await;
        });

        let client = WormholeEndpoint::bind_empty_relays().await.unwrap();
        let connect = async {
            let conn = client.connect(host_addr).await.expect("connect");
            let hello = NetMessage::Hello(HelloMessage {
                protocol_version: 2,
                client_id: [1; 16],
                capabilities: WireCodec::local_capabilities(),
            });
            let (mut send, mut recv) = conn.conn.open_bi().await.expect("open bi");
            send_message(&mut send, &hello, WireCodec::Postcard)
                .await
                .expect("send hello");
            send.finish().expect("finish send");
            let reply = recv_message(&mut recv, WireCodec::Postcard)
                .await
                .expect("recv ack");
            assert!(matches!(reply, NetMessage::Hello(_)));
            conn.close("done");
        };

        timeout(Duration::from_secs(15), async {
            connect.await;
            server.await.expect("server task");
        })
        .await
        .expect("iroh local roundtrip timed out");
    }
}
