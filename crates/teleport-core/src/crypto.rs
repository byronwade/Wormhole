//! Cryptographic utilities for Wormhole
//!
//! Provides:
//! - Join code generation and parsing
//! - BLAKE3 checksums for data integrity
//! - SPAKE2 password-authenticated key exchange (PAKE)

use blake3::Hasher;
use spake2::{Ed25519Group, Identity, Password, Spake2};
use tracing::debug;

/// Length of a join code in characters (without dashes)
pub const JOIN_CODE_LENGTH: usize = 6;

/// Characters used in join codes (unambiguous set)
const JOIN_CODE_CHARS: &[u8] = b"23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/// Generate a random join code (e.g., "ABC-123")
///
/// # Panics
/// Panics if the system random number generator fails (extremely rare).
/// Use `try_generate_join_code` if you need to handle this case.
pub fn generate_join_code() -> String {
    try_generate_join_code().expect("RNG failed - system entropy source unavailable")
}

/// Try to generate a random join code, returning an error if RNG fails
pub fn try_generate_join_code() -> Result<String, getrandom::Error> {
    let mut bytes = [0u8; JOIN_CODE_LENGTH];
    getrandom::getrandom(&mut bytes)?;

    let code: String = bytes
        .iter()
        .map(|b| JOIN_CODE_CHARS[(*b as usize) % JOIN_CODE_CHARS.len()] as char)
        .collect();

    // Format as XXX-XXX
    Ok(format!("{}-{}", &code[..3], &code[3..]))
}

/// Normalize a join code (remove dashes, uppercase)
pub fn normalize_join_code(code: &str) -> String {
    code.chars()
        .filter(|c| !c.is_whitespace() && *c != '-')
        .map(|c| c.to_ascii_uppercase())
        .collect()
}

/// Validate a join code format
pub fn validate_join_code(code: &str) -> bool {
    let normalized = normalize_join_code(code);
    normalized.len() == JOIN_CODE_LENGTH && normalized.bytes().all(|b| JOIN_CODE_CHARS.contains(&b))
}

/// Base URL for wormhole share links
pub const WORMHOLE_BASE_URL: &str = "https://wormhole.byronwade.com";

/// Extract a join code from a URL or return the input if it's already a code
///
/// Handles formats:
/// - `ABC-123` (plain code)
/// - `https://wormhole.byronwade.com/j/ABC-123` (web link)
/// - `wormhole://join/ABC-123` (deep link)
/// - `wormhole://j/ABC-123` (deep link short)
/// - `wormhole://ABC-123` (deep link direct)
pub fn extract_join_code(input: &str) -> Option<String> {
    let input = input.trim();

    // Check if it's a wormhole:// deep link
    if let Some(path) = input
        .strip_prefix("wormhole://")
        .or_else(|| input.strip_prefix("wormhole:"))
    {
        let path = path.trim_start_matches('/');
        let code = if let Some(rest) = path.strip_prefix("join/") {
            rest
        } else if let Some(rest) = path.strip_prefix("j/") {
            rest
        } else {
            path
        };
        let normalized = normalize_join_code(code);
        if validate_join_code(&normalized) {
            return Some(format_join_code(&normalized));
        }
        return None;
    }

    // Check if it's a web URL
    if input.starts_with("http://") || input.starts_with("https://") {
        // Try to extract from URL path
        // Formats: /j/CODE, /join/CODE
        if let Some(path_start) = input.find("/j/").or_else(|| input.find("/join/")) {
            let after_prefix = if input[path_start..].starts_with("/j/") {
                &input[path_start + 3..]
            } else {
                &input[path_start + 6..]
            };
            // Take until next / or end
            let code = after_prefix.split('/').next().unwrap_or("");
            let normalized = normalize_join_code(code);
            if validate_join_code(&normalized) {
                return Some(format_join_code(&normalized));
            }
        }
        return None;
    }

    // It might be a plain code
    let normalized = normalize_join_code(input);
    if validate_join_code(&normalized) {
        return Some(format_join_code(&normalized));
    }

    None
}

/// Format a normalized join code with dashes (e.g., "ABCXYZ" -> "ABC-XYZ")
pub fn format_join_code(normalized: &str) -> String {
    if normalized.len() == JOIN_CODE_LENGTH {
        format!("{}-{}", &normalized[..3], &normalized[3..])
    } else {
        normalized.to_string()
    }
}

/// Generate a full share link for a join code
pub fn make_share_link(join_code: &str) -> String {
    let normalized = normalize_join_code(join_code);
    let formatted = format_join_code(&normalized);
    format!("{}/j/{}", WORMHOLE_BASE_URL, formatted)
}

/// Compute BLAKE3 checksum of data
pub fn checksum(data: &[u8]) -> [u8; 32] {
    *blake3::hash(data).as_bytes()
}

/// Verify BLAKE3 checksum
pub fn verify_checksum(data: &[u8], expected: &[u8; 32]) -> bool {
    &checksum(data) == expected
}

/// Incremental hasher for streaming data
pub struct StreamingHasher {
    hasher: Hasher,
}

impl StreamingHasher {
    pub fn new() -> Self {
        Self {
            hasher: Hasher::new(),
        }
    }

    pub fn update(&mut self, data: &[u8]) {
        self.hasher.update(data);
    }

    pub fn finalize(self) -> [u8; 32] {
        *self.hasher.finalize().as_bytes()
    }
}

impl Default for StreamingHasher {
    fn default() -> Self {
        Self::new()
    }
}

/// Size of PAKE output message
pub const PAKE_MESSAGE_SIZE: usize = 33;

/// Size of shared key derived from PAKE
pub const SHARED_KEY_SIZE: usize = 32;

/// PAKE identity for wormhole protocol
const PAKE_IDENTITY: &[u8] = b"wormhole-pake-v1";

/// Role in PAKE handshake
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PakeRole {
    /// Host (initiator) - the one sharing files
    Host,
    /// Client (responder) - the one mounting files
    Client,
}

/// PAKE handshake state machine
///
/// Implements SPAKE2 password-authenticated key exchange using Ed25519.
/// This allows two parties to derive a shared key from a password (join code)
/// without revealing the password to an eavesdropper.
pub struct PakeHandshake {
    state: Option<Spake2<Ed25519Group>>,
    outbound_msg: Vec<u8>,
    role: PakeRole,
}

impl PakeHandshake {
    /// Start a PAKE handshake as host (initiator)
    ///
    /// The host generates the first message to send to the client.
    pub fn start_host(join_code: &str) -> Self {
        let normalized = normalize_join_code(join_code);
        let password = Password::new(normalized.as_bytes());
        let identity = Identity::new(PAKE_IDENTITY);

        let (state, outbound_msg) =
            Spake2::<Ed25519Group>::start_a(&password, &identity, &identity);

        debug!("Started PAKE handshake as host");

        Self {
            state: Some(state),
            outbound_msg: outbound_msg.to_vec(),
            role: PakeRole::Host,
        }
    }

    /// Start a PAKE handshake as client (responder)
    ///
    /// The client generates a message to send to the host.
    pub fn start_client(join_code: &str) -> Self {
        let normalized = normalize_join_code(join_code);
        let password = Password::new(normalized.as_bytes());
        let identity = Identity::new(PAKE_IDENTITY);

        let (state, outbound_msg) =
            Spake2::<Ed25519Group>::start_b(&password, &identity, &identity);

        debug!("Started PAKE handshake as client");

        Self {
            state: Some(state),
            outbound_msg: outbound_msg.to_vec(),
            role: PakeRole::Client,
        }
    }

    /// Get the outbound PAKE message to send to the peer
    pub fn outbound_message(&self) -> &[u8] {
        &self.outbound_msg
    }

    /// Get the role of this handshake
    pub fn role(&self) -> PakeRole {
        self.role
    }

    /// Complete the handshake with the peer's message
    ///
    /// Returns the 32-byte shared key if successful.
    pub fn finish(mut self, peer_message: &[u8]) -> Result<[u8; SHARED_KEY_SIZE], PakeError> {
        let state = self.state.take().ok_or(PakeError::AlreadyFinished)?;

        let shared_key = state
            .finish(peer_message)
            .map_err(|_| PakeError::HandshakeFailed)?;

        // The shared key from SPAKE2 is 32 bytes
        let mut key = [0u8; SHARED_KEY_SIZE];
        key.copy_from_slice(&shared_key);

        debug!("PAKE handshake completed successfully");
        Ok(key)
    }
}

/// PAKE errors
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PakeError {
    /// Handshake already completed
    AlreadyFinished,
    /// Handshake failed (wrong password or corrupted message)
    HandshakeFailed,
}

impl std::fmt::Display for PakeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PakeError::AlreadyFinished => write!(f, "PAKE handshake already finished"),
            PakeError::HandshakeFailed => write!(f, "PAKE handshake failed"),
        }
    }
}

impl std::error::Error for PakeError {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_join_code_generation() {
        let code = generate_join_code();
        assert_eq!(code.len(), 7); // XXX-XXX
        assert_eq!(&code[3..4], "-");
        assert!(validate_join_code(&code));
    }

    #[test]
    fn test_join_code_normalization() {
        assert_eq!(normalize_join_code("abc-xyz"), "ABCXYZ");
        assert_eq!(normalize_join_code("ABC XYZ"), "ABCXYZ");
        assert_eq!(normalize_join_code("  a-b-c-x-y-z  "), "ABCXYZ");
    }

    #[test]
    fn test_join_code_validation() {
        // Valid codes (using only chars from JOIN_CODE_CHARS: 23456789ABCDEFGHJKLMNPQRSTUVWXYZ)
        assert!(validate_join_code("ABC-DEF"));
        assert!(validate_join_code("234567"));
        assert!(validate_join_code("XY2-3ZW"));

        // Invalid: wrong length
        assert!(!validate_join_code("ABC-DE")); // too short (5 chars)
        assert!(!validate_join_code("ABC-DEFG")); // too long (7 chars)

        // Invalid: contains ambiguous characters
        assert!(!validate_join_code("ABC-12O")); // contains O (ambiguous with 0)
        assert!(!validate_join_code("ABC-1EF")); // contains 1 (ambiguous with l)
        assert!(!validate_join_code("ABC-0EF")); // contains 0 (ambiguous with O)
    }

    #[test]
    fn test_checksum() {
        let data = b"hello world";
        let hash = checksum(data);
        assert!(verify_checksum(data, &hash));
        assert!(!verify_checksum(b"hello worlD", &hash));
    }

    #[test]
    fn test_streaming_hasher() {
        let data = b"hello world";

        // One-shot
        let expected = checksum(data);

        // Streaming
        let mut hasher = StreamingHasher::new();
        hasher.update(b"hello ");
        hasher.update(b"world");
        let actual = hasher.finalize();

        assert_eq!(expected, actual);
    }

    #[test]
    fn test_pake_handshake_success() {
        let join_code = "ABC-123";

        // Simulate host starting handshake
        let host = PakeHandshake::start_host(join_code);
        assert_eq!(host.role(), PakeRole::Host);

        // Simulate client starting handshake
        let client = PakeHandshake::start_client(join_code);
        assert_eq!(client.role(), PakeRole::Client);

        // Exchange messages
        let host_msg = host.outbound_message().to_vec();
        let client_msg = client.outbound_message().to_vec();

        // Complete handshakes
        let host_key = host.finish(&client_msg).unwrap();
        let client_key = client.finish(&host_msg).unwrap();

        // Both should derive the same shared key
        assert_eq!(host_key, client_key);
        assert_eq!(host_key.len(), SHARED_KEY_SIZE);
    }

    #[test]
    fn test_pake_handshake_wrong_code() {
        // Host and client use different codes
        let host = PakeHandshake::start_host("ABC-123");
        let client = PakeHandshake::start_client("XYZ-789");

        let host_msg = host.outbound_message().to_vec();
        let client_msg = client.outbound_message().to_vec();

        // The handshakes will complete but derive different keys
        let host_key = host.finish(&client_msg).unwrap();
        let client_key = client.finish(&host_msg).unwrap();

        // Keys should be different
        assert_ne!(host_key, client_key);
    }

    #[test]
    fn test_pake_message_size() {
        let host = PakeHandshake::start_host("TEST-CD");
        // SPAKE2 messages are 33 bytes (compressed Ed25519 point)
        assert_eq!(host.outbound_message().len(), PAKE_MESSAGE_SIZE);
    }

    #[test]
    fn test_extract_join_code_plain() {
        // Plain codes
        assert_eq!(extract_join_code("ABC-DEF"), Some("ABC-DEF".to_string()));
        assert_eq!(extract_join_code("ABCDEF"), Some("ABC-DEF".to_string()));
        assert_eq!(extract_join_code("abc-def"), Some("ABC-DEF".to_string()));
        assert_eq!(
            extract_join_code("  ABC-DEF  "),
            Some("ABC-DEF".to_string())
        );
    }

    #[test]
    fn test_extract_join_code_web_url() {
        // Web URLs
        assert_eq!(
            extract_join_code("https://wormhole.dev/j/ABC-DEF"),
            Some("ABC-DEF".to_string())
        );
        assert_eq!(
            extract_join_code("https://wormhole.dev/j/ABCDEF"),
            Some("ABC-DEF".to_string())
        );
        assert_eq!(
            extract_join_code("http://wormhole.dev/join/ABC-DEF"),
            Some("ABC-DEF".to_string())
        );
        assert_eq!(
            extract_join_code("https://example.com/j/ABC-DEF"),
            Some("ABC-DEF".to_string())
        );
    }

    #[test]
    fn test_extract_join_code_deep_link() {
        // Deep links
        assert_eq!(
            extract_join_code("wormhole://join/ABC-DEF"),
            Some("ABC-DEF".to_string())
        );
        assert_eq!(
            extract_join_code("wormhole://j/ABC-DEF"),
            Some("ABC-DEF".to_string())
        );
        assert_eq!(
            extract_join_code("wormhole://ABC-DEF"),
            Some("ABC-DEF".to_string())
        );
        assert_eq!(
            extract_join_code("wormhole:ABC-DEF"),
            Some("ABC-DEF".to_string())
        );
    }

    #[test]
    fn test_extract_join_code_invalid() {
        // Invalid inputs
        assert_eq!(extract_join_code(""), None);
        assert_eq!(extract_join_code("ABC"), None);
        assert_eq!(extract_join_code("https://wormhole.dev/"), None);
        assert_eq!(extract_join_code("wormhole://"), None);
        assert_eq!(extract_join_code("random text"), None);
    }

    #[test]
    fn test_make_share_link() {
        assert_eq!(make_share_link("ABC-DEF"), "https://wormhole.byronwade.com/j/ABC-DEF");
        assert_eq!(make_share_link("abcdef"), "https://wormhole.byronwade.com/j/ABC-DEF");
    }

    #[test]
    fn test_format_join_code() {
        assert_eq!(format_join_code("ABCDEF"), "ABC-DEF");
        assert_eq!(format_join_code("ABC"), "ABC"); // Too short, return as-is
    }
}
