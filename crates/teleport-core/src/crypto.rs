//! Cryptographic utilities for Wormhole
//!
//! Provides:
//! - Join code generation and parsing
//! - BLAKE3 checksums for data integrity
//! - SPAKE2 password-authenticated key exchange

use blake3::Hasher;

/// Length of a join code in characters (without dashes)
pub const JOIN_CODE_LENGTH: usize = 6;

/// Characters used in join codes (unambiguous set)
const JOIN_CODE_CHARS: &[u8] = b"23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/// Generate a random join code (e.g., "ABC-123")
pub fn generate_join_code() -> String {
    let mut bytes = [0u8; JOIN_CODE_LENGTH];
    getrandom::getrandom(&mut bytes).expect("RNG failed");

    let code: String = bytes
        .iter()
        .map(|b| JOIN_CODE_CHARS[(*b as usize) % JOIN_CODE_CHARS.len()] as char)
        .collect();

    // Format as XXX-XXX
    format!("{}-{}", &code[..3], &code[3..])
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
    normalized.len() == JOIN_CODE_LENGTH
        && normalized
            .bytes()
            .all(|b| JOIN_CODE_CHARS.contains(&b))
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
}
