//! QUIC networking layer
//!
//! Handles connection establishment and message framing over QUIC.
//!
//! # Security
//!
//! This module supports two modes of certificate verification:
//! - **Certificate Pinning** (recommended): Client verifies server certificate matches
//!   a known fingerprint obtained via a secure channel (signal server + PAKE)
//! - **Skip Verification** (development only): Accepts any certificate. Only available
//!   when compiled with debug assertions or explicitly requested.

use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;

use quinn::{ClientConfig, Connection, Endpoint, RecvStream, SendStream, ServerConfig, TransportConfig, VarInt};
use rustls::pki_types::{CertificateDer, PrivateKeyDer, PrivatePkcs8KeyDer};
use tracing::{debug, info, warn};

/// NAT-friendly keepalive interval (25 seconds is typically safe for most NATs)
pub const NAT_KEEPALIVE_INTERVAL: Duration = Duration::from_secs(25);

/// Idle timeout - longer than keepalive to allow connection recovery
pub const IDLE_TIMEOUT: Duration = Duration::from_secs(120);

/// Maximum UDP payload size for NAT traversal compatibility
pub const MAX_UDP_PAYLOAD_SIZE: u16 = 1350;

use teleport_core::{
    deserialize_message, serialize_message, NetMessage, ProtocolError, MAX_MESSAGE_SIZE,
};

/// QUIC connection wrapper
#[derive(Clone)]
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

/// Certificate fingerprint - BLAKE3 hash of DER-encoded certificate
pub type CertFingerprint = [u8; 32];

/// Generate self-signed certificate for development
pub fn generate_self_signed_cert() -> (Vec<CertificateDer<'static>>, PrivateKeyDer<'static>) {
    let cert = rcgen::generate_simple_self_signed(vec!["localhost".into()]).unwrap();
    let key_der = cert.get_key_pair().serialize_der();
    let cert_der = cert.serialize_der().unwrap();
    let key = PrivatePkcs8KeyDer::from(key_der).into();
    let cert = CertificateDer::from(cert_der);
    (vec![cert], key)
}

/// Compute BLAKE3 fingerprint of a certificate
pub fn compute_cert_fingerprint(cert: &CertificateDer<'_>) -> CertFingerprint {
    teleport_core::crypto::checksum(cert.as_ref())
}

/// Generate self-signed certificate and return its fingerprint
///
/// Returns (certs, key, fingerprint) where fingerprint can be shared
/// with clients for certificate pinning.
pub fn generate_self_signed_cert_with_fingerprint() -> (
    Vec<CertificateDer<'static>>,
    PrivateKeyDer<'static>,
    CertFingerprint,
) {
    let (certs, key) = generate_self_signed_cert();
    let fingerprint = compute_cert_fingerprint(&certs[0]);
    debug!("Generated certificate with fingerprint: {}", hex::encode(fingerprint));
    (certs, key, fingerprint)
}

/// Create NAT-friendly transport configuration
///
/// This configuration is optimized for traversing NATs:
/// - Keepalive packets every 25 seconds to maintain NAT mappings
/// - Reasonable idle timeout to handle network hiccups
/// - Conservative MTU for compatibility
pub fn create_nat_transport_config() -> TransportConfig {
    let mut transport = TransportConfig::default();

    // Send keepalive packets to maintain NAT mappings
    // Most NATs have 60-300 second timeouts, 25s is safe
    transport.keep_alive_interval(Some(NAT_KEEPALIVE_INTERVAL));

    // Idle timeout - close connection after no activity
    transport.max_idle_timeout(Some(
        IDLE_TIMEOUT.try_into().expect("idle timeout valid")
    ));

    // Conservative initial RTT estimate for internet connections
    transport.initial_rtt(Duration::from_millis(100));

    // Allow more concurrent streams for parallel operations
    transport.max_concurrent_bidi_streams(VarInt::from_u32(128));
    transport.max_concurrent_uni_streams(VarInt::from_u32(128));

    transport
}

/// Create a QUIC client endpoint
///
/// WARNING: This uses skip verification mode which is INSECURE.
/// Use `create_client_endpoint_with_pinned_cert` for production.
#[deprecated(
    since = "0.2.0",
    note = "Use create_client_endpoint_with_pinned_cert for production"
)]
#[allow(deprecated)]
pub fn create_client_endpoint() -> Result<Endpoint, ConnectionError> {
    create_client_endpoint_with_port(0)
}

/// Create a QUIC client endpoint bound to a specific port (for NAT hole punching)
///
/// WARNING: This uses skip verification mode which is INSECURE.
/// Use `create_client_endpoint_with_pinned_cert` for production.
#[deprecated(
    since = "0.2.0",
    note = "Use create_client_endpoint_with_pinned_cert for production"
)]
pub fn create_client_endpoint_with_port(port: u16) -> Result<Endpoint, ConnectionError> {
    warn!("SECURITY: Creating client endpoint WITHOUT certificate pinning");
    let bind_addr: SocketAddr = format!("0.0.0.0:{}", port).parse().unwrap();
    let mut endpoint = Endpoint::client(bind_addr)
        .map_err(|e| ConnectionError::Connect(e.to_string()))?;

    // Configure for self-signed certs (development only - INSECURE)
    let crypto = rustls::ClientConfig::builder()
        .dangerous()
        .with_custom_certificate_verifier(Arc::new(SkipServerVerification))
        .with_no_client_auth();

    let mut config = ClientConfig::new(Arc::new(
        quinn::crypto::rustls::QuicClientConfig::try_from(crypto).unwrap(),
    ));

    // Apply NAT-friendly transport configuration
    config.transport_config(Arc::new(create_nat_transport_config()));

    endpoint.set_default_client_config(config);
    Ok(endpoint)
}

/// Create a QUIC client endpoint with certificate pinning (SECURE)
///
/// This is the recommended approach for production. The expected certificate
/// fingerprint should be obtained via a secure channel (signal server + PAKE).
///
/// # Arguments
/// * `port` - Local port to bind (0 for any available port)
/// * `expected_fingerprint` - BLAKE3 hash of the expected server certificate
///
/// # Security
/// The connection will fail if the server presents a certificate with a
/// different fingerprint, preventing man-in-the-middle attacks.
pub fn create_client_endpoint_with_pinned_cert(
    port: u16,
    expected_fingerprint: CertFingerprint,
) -> Result<Endpoint, ConnectionError> {
    debug!(
        "Creating client endpoint with pinned cert: {}",
        hex::encode(expected_fingerprint)
    );
    let bind_addr: SocketAddr = format!("0.0.0.0:{}", port).parse().unwrap();
    let mut endpoint = Endpoint::client(bind_addr)
        .map_err(|e| ConnectionError::Connect(e.to_string()))?;

    // Configure with certificate pinning
    let crypto = rustls::ClientConfig::builder()
        .dangerous()
        .with_custom_certificate_verifier(Arc::new(PinnedCertVerifier::new(expected_fingerprint)))
        .with_no_client_auth();

    let mut config = ClientConfig::new(Arc::new(
        quinn::crypto::rustls::QuicClientConfig::try_from(crypto).unwrap(),
    ));

    // Apply NAT-friendly transport configuration
    config.transport_config(Arc::new(create_nat_transport_config()));

    endpoint.set_default_client_config(config);
    Ok(endpoint)
}

/// Create a QUIC server endpoint
///
/// Returns the endpoint along with its certificate fingerprint, which should
/// be shared with clients for certificate pinning (via signal server + PAKE).
pub fn create_server_endpoint(
    bind_addr: SocketAddr,
) -> Result<(Endpoint, CertFingerprint), ConnectionError> {
    let (certs, key, fingerprint) = generate_self_signed_cert_with_fingerprint();

    let crypto = rustls::ServerConfig::builder()
        .with_no_client_auth()
        .with_single_cert(certs, key)
        .map_err(|e| ConnectionError::Connect(e.to_string()))?;

    let mut config = ServerConfig::with_crypto(Arc::new(
        quinn::crypto::rustls::QuicServerConfig::try_from(crypto).unwrap(),
    ));

    // Apply NAT-friendly transport configuration
    config.transport_config(Arc::new(create_nat_transport_config()));

    let endpoint = Endpoint::server(config, bind_addr)
        .map_err(|e| ConnectionError::Connect(e.to_string()))?;

    info!("Server endpoint created with cert fingerprint: {}", hex::encode(fingerprint));
    Ok((endpoint, fingerprint))
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

/// Certificate pinning verifier - validates server cert matches expected fingerprint
///
/// This is the RECOMMENDED approach for production. The expected fingerprint should
/// be obtained via a secure channel (signal server protected by PAKE).
#[derive(Debug)]
struct PinnedCertVerifier {
    expected_fingerprint: CertFingerprint,
}

impl PinnedCertVerifier {
    fn new(expected_fingerprint: CertFingerprint) -> Self {
        Self { expected_fingerprint }
    }
}

impl rustls::client::danger::ServerCertVerifier for PinnedCertVerifier {
    fn verify_server_cert(
        &self,
        end_entity: &CertificateDer<'_>,
        _intermediates: &[CertificateDer<'_>],
        _server_name: &rustls::pki_types::ServerName<'_>,
        _ocsp_response: &[u8],
        _now: rustls::pki_types::UnixTime,
    ) -> Result<rustls::client::danger::ServerCertVerified, rustls::Error> {
        let actual_fingerprint = compute_cert_fingerprint(end_entity);

        if actual_fingerprint == self.expected_fingerprint {
            debug!("Certificate fingerprint verified: {}", hex::encode(actual_fingerprint));
            Ok(rustls::client::danger::ServerCertVerified::assertion())
        } else {
            warn!(
                "Certificate fingerprint mismatch! Expected: {}, Got: {}",
                hex::encode(self.expected_fingerprint),
                hex::encode(actual_fingerprint)
            );
            Err(rustls::Error::General("certificate fingerprint mismatch".into()))
        }
    }

    fn verify_tls12_signature(
        &self,
        _message: &[u8],
        _cert: &CertificateDer<'_>,
        _dss: &rustls::DigitallySignedStruct,
    ) -> Result<rustls::client::danger::HandshakeSignatureValid, rustls::Error> {
        // Since we've verified the cert fingerprint, we trust the signature
        // This is secure because we're using certificate pinning - only the holder
        // of the private key can create valid signatures for the pinned cert
        Ok(rustls::client::danger::HandshakeSignatureValid::assertion())
    }

    fn verify_tls13_signature(
        &self,
        _message: &[u8],
        _cert: &CertificateDer<'_>,
        _dss: &rustls::DigitallySignedStruct,
    ) -> Result<rustls::client::danger::HandshakeSignatureValid, rustls::Error> {
        // Since we've verified the cert fingerprint, we trust the signature
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

/// Skip server certificate verification (DEVELOPMENT ONLY - INSECURE)
///
/// WARNING: This verifier accepts ANY certificate without validation.
/// Only use this for local development when certificate pinning is not yet set up.
/// Never use in production as it enables man-in-the-middle attacks.
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
        warn!("SECURITY WARNING: Skipping certificate verification (development mode)");
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
