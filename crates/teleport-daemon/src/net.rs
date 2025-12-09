//! QUIC networking layer
//!
//! Handles connection establishment and message framing over QUIC.

use std::net::SocketAddr;
use std::sync::Arc;

use quinn::{ClientConfig, Connection, Endpoint, RecvStream, SendStream, ServerConfig};
use rustls::pki_types::{CertificateDer, PrivateKeyDer, PrivatePkcs8KeyDer};
use tracing::info;

use teleport_core::{
    deserialize_message, serialize_message, NetMessage, ProtocolError, MAX_MESSAGE_SIZE,
};

/// QUIC connection wrapper
pub struct QuicConnection {
    connection: Connection,
}

impl QuicConnection {
    pub fn new(connection: Connection) -> Self {
        Self { connection }
    }

    /// Open a bidirectional stream
    pub async fn open_stream(&self) -> Result<(SendStream, RecvStream), ConnectionError> {
        let (send, recv) = self
            .connection
            .open_bi()
            .await
            .map_err(|e| ConnectionError::StreamOpen(e.to_string()))?;
        Ok((send, recv))
    }

    /// Accept an incoming bidirectional stream
    pub async fn accept_stream(&self) -> Result<(SendStream, RecvStream), ConnectionError> {
        let (send, recv) = self
            .connection
            .accept_bi()
            .await
            .map_err(|e| ConnectionError::StreamAccept(e.to_string()))?;
        Ok((send, recv))
    }

    /// Get remote address
    pub fn remote_address(&self) -> SocketAddr {
        self.connection.remote_address()
    }

    /// Close the connection
    pub fn close(&self, code: u32, reason: &str) {
        self.connection.close(code.into(), reason.as_bytes());
    }
}

/// Connection errors
#[derive(Debug, Clone)]
pub enum ConnectionError {
    Connect(String),
    StreamOpen(String),
    StreamAccept(String),
    Send(String),
    Receive(String),
    Protocol(ProtocolError),
    Timeout,
}

impl From<ProtocolError> for ConnectionError {
    fn from(e: ProtocolError) -> Self {
        ConnectionError::Protocol(e)
    }
}

/// Send a message on a stream
pub async fn send_message(
    stream: &mut SendStream,
    msg: &NetMessage,
) -> Result<(), ConnectionError> {
    let data = serialize_message(msg).map_err(|e| ConnectionError::Send(e.to_string()))?;

    stream
        .write_all(&data)
        .await
        .map_err(|e| ConnectionError::Send(e.to_string()))?;

    Ok(())
}

/// Receive a message from a stream
pub async fn recv_message(stream: &mut RecvStream) -> Result<NetMessage, ConnectionError> {
    // Read length prefix
    let mut len_buf = [0u8; 4];
    stream
        .read_exact(&mut len_buf)
        .await
        .map_err(|e| ConnectionError::Receive(e.to_string()))?;

    let len = u32::from_le_bytes(len_buf) as usize;

    // Validate length
    if len > MAX_MESSAGE_SIZE {
        return Err(ConnectionError::Protocol(ProtocolError::MessageTooLarge {
            size: len,
            max: MAX_MESSAGE_SIZE,
        }));
    }

    // Read payload
    let mut payload = vec![0u8; len];
    stream
        .read_exact(&mut payload)
        .await
        .map_err(|e| ConnectionError::Receive(e.to_string()))?;

    // Deserialize
    let msg = deserialize_message(&payload)
        .map_err(|e| ConnectionError::Protocol(ProtocolError::Deserialization(e.to_string())))?;

    Ok(msg)
}

/// Generate self-signed certificate for development
pub fn generate_self_signed_cert() -> (Vec<CertificateDer<'static>>, PrivateKeyDer<'static>) {
    let cert = rcgen::generate_simple_self_signed(vec!["localhost".into()]).unwrap();
    let key_der = cert.get_key_pair().serialize_der();
    let cert_der = cert.serialize_der().unwrap();
    let key = PrivatePkcs8KeyDer::from(key_der).into();
    let cert = CertificateDer::from(cert_der);
    (vec![cert], key)
}

/// Create a QUIC client endpoint
pub fn create_client_endpoint() -> Result<Endpoint, ConnectionError> {
    let mut endpoint = Endpoint::client("0.0.0.0:0".parse().unwrap())
        .map_err(|e| ConnectionError::Connect(e.to_string()))?;

    // Configure for self-signed certs (development only)
    let crypto = rustls::ClientConfig::builder()
        .dangerous()
        .with_custom_certificate_verifier(Arc::new(SkipServerVerification))
        .with_no_client_auth();

    let config = ClientConfig::new(Arc::new(
        quinn::crypto::rustls::QuicClientConfig::try_from(crypto).unwrap(),
    ));

    endpoint.set_default_client_config(config);
    Ok(endpoint)
}

/// Create a QUIC server endpoint
pub fn create_server_endpoint(
    bind_addr: SocketAddr,
) -> Result<Endpoint, ConnectionError> {
    let (certs, key) = generate_self_signed_cert();

    let crypto = rustls::ServerConfig::builder()
        .with_no_client_auth()
        .with_single_cert(certs, key)
        .map_err(|e| ConnectionError::Connect(e.to_string()))?;

    let config = ServerConfig::with_crypto(Arc::new(
        quinn::crypto::rustls::QuicServerConfig::try_from(crypto).unwrap(),
    ));

    let endpoint = Endpoint::server(config, bind_addr)
        .map_err(|e| ConnectionError::Connect(e.to_string()))?;

    Ok(endpoint)
}

/// Connect to a QUIC server
pub async fn connect(
    endpoint: &Endpoint,
    addr: SocketAddr,
    server_name: &str,
) -> Result<QuicConnection, ConnectionError> {
    let connection = endpoint
        .connect(addr, server_name)
        .map_err(|e| ConnectionError::Connect(e.to_string()))?
        .await
        .map_err(|e| ConnectionError::Connect(e.to_string()))?;

    info!("Connected to {}", addr);
    Ok(QuicConnection::new(connection))
}

/// Skip server certificate verification (DEVELOPMENT ONLY)
#[derive(Debug)]
struct SkipServerVerification;

impl rustls::client::danger::ServerCertVerifier for SkipServerVerification {
    fn verify_server_cert(
        &self,
        _end_entity: &CertificateDer<'_>,
        _intermediates: &[CertificateDer<'_>],
        _server_name: &rustls::pki_types::ServerName<'_>,
        _ocsp_response: &[u8],
        _now: rustls::pki_types::UnixTime,
    ) -> Result<rustls::client::danger::ServerCertVerified, rustls::Error> {
        Ok(rustls::client::danger::ServerCertVerified::assertion())
    }

    fn verify_tls12_signature(
        &self,
        _message: &[u8],
        _cert: &CertificateDer<'_>,
        _dss: &rustls::DigitallySignedStruct,
    ) -> Result<rustls::client::danger::HandshakeSignatureValid, rustls::Error> {
        Ok(rustls::client::danger::HandshakeSignatureValid::assertion())
    }

    fn verify_tls13_signature(
        &self,
        _message: &[u8],
        _cert: &CertificateDer<'_>,
        _dss: &rustls::DigitallySignedStruct,
    ) -> Result<rustls::client::danger::HandshakeSignatureValid, rustls::Error> {
        Ok(rustls::client::danger::HandshakeSignatureValid::assertion())
    }

    fn supported_verify_schemes(&self) -> Vec<rustls::SignatureScheme> {
        vec![
            rustls::SignatureScheme::RSA_PKCS1_SHA256,
            rustls::SignatureScheme::ECDSA_NISTP256_SHA256,
            rustls::SignatureScheme::RSA_PKCS1_SHA384,
            rustls::SignatureScheme::ECDSA_NISTP384_SHA384,
            rustls::SignatureScheme::RSA_PKCS1_SHA512,
            rustls::SignatureScheme::ECDSA_NISTP521_SHA512,
            rustls::SignatureScheme::RSA_PSS_SHA256,
            rustls::SignatureScheme::RSA_PSS_SHA384,
            rustls::SignatureScheme::RSA_PSS_SHA512,
            rustls::SignatureScheme::ED25519,
        ]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cert_generation() {
        let (certs, _key) = generate_self_signed_cert();
        assert_eq!(certs.len(), 1);
    }
}
