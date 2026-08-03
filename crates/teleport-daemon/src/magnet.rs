//! Magnet URIs for content-addressed Wormhole chunks.
//!
//! Format: `wormhole:magnet:blake3:<64-hex>`

use teleport_core::ContentHash;

/// Build a Wormhole magnet URI for a content hash.
pub fn magnet_uri(hash: &ContentHash) -> String {
    format!("wormhole:magnet:blake3:{}", hash.to_hex())
}

/// Parse a magnet / content-hash string into a [`ContentHash`].
///
/// Accepts:
/// - `wormhole:magnet:blake3:<hex>`
/// - `blake3:<hex>`
/// - raw 64-character hex
pub fn parse_magnet(s: &str) -> Option<ContentHash> {
    let s = s.trim();
    if let Some(hex) = s.strip_prefix("wormhole:magnet:blake3:") {
        return ContentHash::from_hex(hex);
    }
    if let Some(hex) = s.strip_prefix("blake3:") {
        return ContentHash::from_hex(hex);
    }
    ContentHash::from_hex(s)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn magnet_roundtrip() {
        let hash = ContentHash::compute(b"roundtrip-payload");
        let uri = magnet_uri(&hash);
        assert!(uri.starts_with("wormhole:magnet:blake3:"));
        let parsed = parse_magnet(&uri).expect("parse magnet uri");
        assert_eq!(parsed, hash);
    }

    #[test]
    fn parse_blake3_prefix() {
        let hash = ContentHash::compute(b"prefixed");
        let s = format!("blake3:{}", hash.to_hex());
        assert_eq!(parse_magnet(&s), Some(hash));
    }

    #[test]
    fn parse_raw_hex() {
        let hash = ContentHash::compute(b"raw-hex");
        assert_eq!(parse_magnet(&hash.to_hex()), Some(hash));
    }

    #[test]
    fn parse_invalid() {
        assert!(parse_magnet("not-a-hash").is_none());
        assert!(parse_magnet("wormhole:magnet:blake3:zz").is_none());
        assert!(parse_magnet("blake3:short").is_none());
    }
}
