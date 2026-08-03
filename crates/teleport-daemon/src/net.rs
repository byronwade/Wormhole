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

use quinn::{
    ClientConfig, Connection, Endpoint, RecvStream, SendStream, ServerConfig, TransportConfig,
    VarInt,
};
use rustls::pki_types::{CertificateDer, PrivateKeyDer, PrivatePkcs8KeyDer};
use tracing::{debug, info, warn};

/// NAT-friendly keepalive interval (25 seconds is typically safe for most NATs)
pub const NAT_KEEPALIVE_INTERVAL: Duration = Duration::from_secs(25);

/// Idle timeout - longer than keepalive to allow connection recovery
pub const IDLE_TIMEOUT: Duration = Duration::from_secs(120);

/// Maximum UDP payload size for NAT traversal compatibility
pub const MAX_UDP_PAYLOAD_SIZE: u16 = 1350;

use teleport_core::{
    deserialize_with_codec, serialize_with_codec, NetMessage, ProtocolError, WireCodec,
    CAP_CODEC_POSTCARD, MAX_MESSAGE_SIZE,
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

/// Send a message on a stream using the legacy bincode codec.
pub async fn send_message(
    stream: &mut SendStream,
    msg: &NetMessage,
) -> Result<(), ConnectionError> {
    send_message_with(stream, msg, WireCodec::Bincode).await
}

/// Send a message with an explicit wire codec.
pub async fn send_message_with(
    stream: &mut SendStream,
    msg: &NetMessage,
    codec: WireCodec,
) -> Result<(), ConnectionError> {
    let data =
        serialize_with_codec(msg, codec).map_err(|e| ConnectionError::Send(e.to_string()))?;

    stream
        .write_all(&data)
        .await
        .map_err(|e| ConnectionError::Send(e.to_string()))?;

    Ok(())
}

/// Receive a message from a stream using the legacy bincode codec.
pub async fn recv_message(stream: &mut RecvStream) -> Result<NetMessage, ConnectionError> {
    recv_message_with(stream, WireCodec::Bincode).await
}

/// Receive a message with an explicit wire codec.
pub async fn recv_message_with(
    stream: &mut RecvStream,
    codec: WireCodec,
) -> Result<NetMessage, ConnectionError> {
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

    let msg = deserialize_with_codec(&payload, codec)?;

    Ok(msg)
}

/// Negotiate session codec from Hello/HelloAck capability lists.
pub fn negotiate_session_codec(local_caps: &[String], remote_caps: &[String]) -> WireCodec {
    WireCodec::negotiate(local_caps, remote_caps)
}

/// Capability prefix carrying a normalized join code (`join:ABC123`).
pub const CAP_JOIN_PREFIX: &str = "join:";

/// Standard capability list for hosts (includes postcard).
pub fn host_capabilities(writable: bool) -> Vec<String> {
    let mut caps = vec![CAP_CODEC_POSTCARD.into(), "read".into()];
    if writable {
        caps.push("write".into());
        caps.push("lock".into());
    }
    caps
}

/// Standard capability list for clients.
pub fn client_capabilities() -> Vec<String> {
    vec![CAP_CODEC_POSTCARD.into(), "read".into()]
}

/// Build a `join:<normalized>` capability from a join code.
pub fn join_capability(join_code: &str) -> String {
    format!(
        "{}{}",
        CAP_JOIN_PREFIX,
        teleport_core::crypto::normalize_join_code(join_code)
    )
}

/// Append join-code auth capability when present.
pub fn client_capabilities_with_join(join_code: Option<&str>) -> Vec<String> {
    let mut caps = client_capabilities();
    if let Some(code) = join_code {
        let normalized = teleport_core::crypto::normalize_join_code(code);
        if !normalized.is_empty() {
            caps.push(format!("{}{}", CAP_JOIN_PREFIX, normalized));
        }
    }
    caps
}

/// Extract normalized join code from a capability list, if advertised.
pub fn join_code_from_capabilities(caps: &[String]) -> Option<String> {
    caps.iter().find_map(|c| {
        c.strip_prefix(CAP_JOIN_PREFIX)
            .map(teleport_core::crypto::normalize_join_code)
            .filter(|s| !s.is_empty())
    })
}

/// Constant-time equality for equal-length byte strings.
pub fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

/// Verify a client-presented join code against the host expectation.
///
/// Returns `true` when the host has no join code configured (dev/test open mode),
/// or when the client advertised a matching `join:` capability.
pub fn verify_join_code(expected: Option<&str>, client_caps: &[String]) -> bool {
    let Some(expected) = expected else {
        return true;
    };
    let expected = teleport_core::crypto::normalize_join_code(expected);
    if expected.is_empty() {
        return true;
    }
    match join_code_from_capabilities(client_caps) {
        Some(got) => constant_time_eq(expected.as_bytes(), got.as_bytes()),
        None => false,
    }
}

/// Certificate fingerprint - BLAKE3 hash of DER-encoded certificate
pub type CertFingerprint = [u8; 32];

/// Generate self-signed certificate for development
pub fn generate_self_signed_cert() -> (Vec<CertificateDer<'static>>, PrivateKeyDer<'static>) {
    // rcgen 0.13+ returns a CertifiedKey { cert, signing_key }; the cert exposes
    // its DER via `der()` and the key serializes to PKCS#8 DER.
    let rcgen::CertifiedKey { cert, signing_key } =
        rcgen::generate_simple_self_signed(vec!["localhost".into()]).unwrap();
    let key_der = signing_key.serialize_der();
    let key = PrivatePkcs8KeyDer::from(key_der).into();
    let cert = cert.der().clone();
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
    debug!(
        "Generated certificate with fingerprint: {}",
        hex::encode(fingerprint)
    );
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
    transport.max_idle_timeout(Some(IDLE_TIMEOUT.try_into().expect("idle timeout valid")));

    // Conservative initial RTT estimate for internet connections
    transport.initial_rtt(Duration::from_millis(100));

    // Allow more concurrent streams for parallel operations
    transport.max_concurrent_bidi_streams(VarInt::from_u32(128));
    transport.max_concurrent_uni_streams(VarInt::from_u32(128));

    // Flow-control windows for bulk file transfer. QUIC throughput on a single
    // transfer is bounded by window / RTT, so quinn's defaults (~1.25 MiB stream /
    // ~12.5 MiB connection) throttle high bandwidth-delay-product links — e.g. the
    // default stream window caps one file at ~25 MiB/s on a 50 ms link regardless
    // of available bandwidth. These larger windows lift that cap for fast/remote
    // links; the values are bounded to keep per-connection receive-buffer memory
    // reasonable (8 MiB/stream, 32 MiB/connection) given max_connections hosts.
    // NOTE: this helps real (higher-RTT) networks; it is intentionally neutral on
    // loopback, where BDP is tiny and the window is never the limiter.
    const STREAM_WINDOW: u64 = 8 * 1024 * 1024; // 8 MiB per stream
    const CONN_WINDOW: u64 = 32 * 1024 * 1024; // 32 MiB per connection
    transport.stream_receive_window(VarInt::from_u64(STREAM_WINDOW).unwrap());
    transport.receive_window(VarInt::from_u64(CONN_WINDOW).unwrap());
    transport.send_window(CONN_WINDOW);

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
    let mut endpoint =
        Endpoint::client(bind_addr).map_err(|e| ConnectionError::Connect(e.to_string()))?;

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
    let mut endpoint =
        Endpoint::client(bind_addr).map_err(|e| ConnectionError::Connect(e.to_string()))?;

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

    let endpoint =
        Endpoint::server(config, bind_addr).map_err(|e| ConnectionError::Connect(e.to_string()))?;

    info!(
        "Server endpoint created with cert fingerprint: {}",
        hex::encode(fingerprint)
    );
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
        Self {
            expected_fingerprint,
        }
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
            debug!(
                "Certificate fingerprint verified: {}",
                hex::encode(actual_fingerprint)
            );
            Ok(rustls::client::danger::ServerCertVerified::assertion())
        } else {
            warn!(
                "Certificate fingerprint mismatch! Expected: {}, Got: {}",
                hex::encode(self.expected_fingerprint),
                hex::encode(actual_fingerprint)
            );
            Err(rustls::Error::General(
                "certificate fingerprint mismatch".into(),
            ))
        }
    }

    fn verify_tls12_signature(
        &self,
        message: &[u8],
        cert: &CertificateDer<'_>,
        dss: &rustls::DigitallySignedStruct,
    ) -> Result<rustls::client::danger::HandshakeSignatureValid, rustls::Error> {
        // Pinning checks identity; still cryptographically verify the handshake signature.
        rustls::crypto::verify_tls12_signature(
            message,
            cert,
            dss,
            &rustls::crypto::ring::default_provider().signature_verification_algorithms,
        )
    }

    fn verify_tls13_signature(
        &self,
        message: &[u8],
        cert: &CertificateDer<'_>,
        dss: &rustls::DigitallySignedStruct,
    ) -> Result<rustls::client::danger::HandshakeSignatureValid, rustls::Error> {
        rustls::crypto::verify_tls13_signature(
            message,
            cert,
            dss,
            &rustls::crypto::ring::default_provider().signature_verification_algorithms,
        )
    }

    fn supported_verify_schemes(&self) -> Vec<rustls::SignatureScheme> {
        rustls::crypto::ring::default_provider()
            .signature_verification_algorithms
            .supported_schemes()
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
        message: &[u8],
        cert: &CertificateDer<'_>,
        dss: &rustls::DigitallySignedStruct,
    ) -> Result<rustls::client::danger::HandshakeSignatureValid, rustls::Error> {
        // Dev mode skips identity checks but must still verify handshake signatures.
        rustls::crypto::verify_tls12_signature(
            message,
            cert,
            dss,
            &rustls::crypto::ring::default_provider().signature_verification_algorithms,
        )
    }

    fn verify_tls13_signature(
        &self,
        message: &[u8],
        cert: &CertificateDer<'_>,
        dss: &rustls::DigitallySignedStruct,
    ) -> Result<rustls::client::danger::HandshakeSignatureValid, rustls::Error> {
        rustls::crypto::verify_tls13_signature(
            message,
            cert,
            dss,
            &rustls::crypto::ring::default_provider().signature_verification_algorithms,
        )
    }

    fn supported_verify_schemes(&self) -> Vec<rustls::SignatureScheme> {
        rustls::crypto::ring::default_provider()
            .signature_verification_algorithms
            .supported_schemes()
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

    #[test]
    fn join_code_capability_roundtrip() {
        let cap = join_capability("abc-def");
        assert_eq!(cap, "join:ABCDEF");
        let caps = client_capabilities_with_join(Some("abc-def"));
        assert_eq!(join_code_from_capabilities(&caps).as_deref(), Some("ABCDEF"));
        assert!(verify_join_code(Some("ABCDEF"), &caps));
        assert!(!verify_join_code(Some("ABCDEF"), &client_capabilities()));
        assert!(verify_join_code(None, &client_capabilities()));
    }

    #[test]
    fn constant_time_eq_rejects_mismatch() {
        assert!(constant_time_eq(b"abcdef", b"abcdef"));
        assert!(!constant_time_eq(b"abcdef", b"abcdeg"));
        assert!(!constant_time_eq(b"abc", b"abcd"));
    }
}
