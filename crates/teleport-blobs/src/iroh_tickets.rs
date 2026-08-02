//! Thin facade over `iroh-blobs` tickets (optional feature `iroh-blobs`).
//!
//! Local [`crate::BlobStore`] remains the default cache. When the `iroh-blobs`
//! feature is enabled, peers can exchange [`BlobTicket`] strings for verified
//! BLAKE3 streaming pulls.

use teleport_core::ContentHash;

#[cfg(feature = "iroh-blobs")]
pub use iroh_blobs::ticket::BlobTicket;
#[cfg(feature = "iroh-blobs")]
pub use iroh_blobs::{BlobFormat, Hash};

/// Convert a Wormhole [`ContentHash`] to an iroh-blobs [`Hash`].
#[cfg(feature = "iroh-blobs")]
pub fn content_hash_to_iroh(hash: &ContentHash) -> Hash {
    Hash::from_bytes(hash.0)
}

/// Convert an iroh-blobs [`Hash`] to a Wormhole [`ContentHash`].
#[cfg(feature = "iroh-blobs")]
pub fn iroh_hash_to_content(hash: &Hash) -> ContentHash {
    ContentHash(*hash.as_bytes())
}

/// Encode a content hash as a portable ticket string (hash-only, no provider).
///
/// Full provider tickets require an [`iroh::EndpointAddr`]; use
/// [`BlobTicket::new`] when dialing a live peer.
pub fn hash_ticket_label(hash: &ContentHash) -> String {
    format!("blake3:{}", hash.to_hex())
}

/// Parse a `blake3:<hex>` label back into a content hash.
pub fn parse_hash_ticket_label(label: &str) -> Option<ContentHash> {
    let hex = label.strip_prefix("blake3:")?;
    ContentHash::from_hex(hex)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn label_roundtrip() {
        let h = ContentHash::compute(b"ticket-me");
        let label = hash_ticket_label(&h);
        assert_eq!(parse_hash_ticket_label(&label), Some(h));
    }
}
