//! Optional mount-token verification at the daemon edge.
//!
//! Paid / team mounts may present a signed mount token from `teleport-cloud`.
//! Free DIY shares remain keyless (no token required).

use ed25519_dalek::VerifyingKey;
use teleport_core::{decode_token, verify_token, MountTokenError};
use tracing::{debug, warn};

/// Result of checking an optional mount token.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TokenGateResult {
    /// No token presented — allowed for free / DIY shares.
    AnonymousAllowed,
    /// Token verified for the expected share.
    Verified { subject: String },
}

/// Verify a mount token against a team verifying key.
///
/// When `encoded` is `None`/`Some("")`, returns [`TokenGateResult::AnonymousAllowed`]
/// unless `require_token` is true.
pub fn check_mount_token(
    encoded: Option<&str>,
    verifying_key_bytes: &[u8; 32],
    expected_share: Option<&str>,
    require_token: bool,
    revoked: &[[u8; 16]],
) -> Result<TokenGateResult, MountTokenError> {
    let Some(raw) = encoded.map(str::trim).filter(|s| !s.is_empty()) else {
        if require_token {
            return Err(MountTokenError::InvalidKey(
                "mount token required".into(),
            ));
        }
        return Ok(TokenGateResult::AnonymousAllowed);
    };

    let token = decode_token(raw)?;
    let key = VerifyingKey::from_bytes(verifying_key_bytes)
        .map_err(|e| MountTokenError::InvalidKey(e.to_string()))?;
    verify_token(&key, &token, expected_share, revoked)?;
    debug!(subject = %token.grant.subject, "mount token verified");
    Ok(TokenGateResult::Verified {
        subject: token.grant.subject.clone(),
    })
}

/// Log-and-reject helper for host accept paths.
pub fn reject_if_invalid(
    encoded: Option<&str>,
    verifying_key_bytes: Option<&[u8; 32]>,
    expected_share: Option<&str>,
    require_token: bool,
) -> Result<TokenGateResult, String> {
    let Some(key) = verifying_key_bytes else {
        if require_token {
            return Err("mount token required but no team key configured".into());
        }
        return Ok(TokenGateResult::AnonymousAllowed);
    };
    check_mount_token(encoded, key, expected_share, require_token, &[]).map_err(|e| {
        warn!(error = %e, "mount token rejected");
        e.to_string()
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use teleport_core::{encode_token, generate_team_keypair, issue_token};

    #[test]
    fn anonymous_allowed_by_default() {
        let (_s, v) = generate_team_keypair();
        let r = check_mount_token(None, v.as_bytes(), None, false, &[]).unwrap();
        assert_eq!(r, TokenGateResult::AnonymousAllowed);
    }

    #[test]
    fn valid_token_verified() {
        let (signing, verifying) = generate_team_keypair();
        let token = issue_token(&signing, "user@studio", Some("share-1".into()), 3600).unwrap();
        let encoded = encode_token(&token).unwrap();
        let r = check_mount_token(
            Some(&encoded),
            verifying.as_bytes(),
            Some("share-1"),
            true,
            &[],
        )
        .unwrap();
        assert!(matches!(r, TokenGateResult::Verified { .. }));
    }
}
