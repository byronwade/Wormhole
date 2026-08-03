//! Signed mount tokens (open-core unifying primitive).
//!
//! Free tier: admin signs grants with a team key.
//! Paid tier: `teleport-cloud` signs the same token shape after auth.
//!
//! Hosts verify: signature, expiry, scope, optional revocation.

use std::time::{SystemTime, UNIX_EPOCH};

use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};
use thiserror::Error;

/// Default free-tier token TTL (30 days).
pub const DEFAULT_TOKEN_TTL_SECS: u64 = 30 * 24 * 60 * 60;

/// Short-lived paid-tier TTL (1 hour) — refresh via cloud.
pub const PAID_TOKEN_TTL_SECS: u64 = 60 * 60;

/// Grant payload embedded in a mount token (signed bytes).
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct MountGrant {
    /// Team / issuer public key id (hex of verifying key).
    pub team_key_id: String,
    /// Subject identity (user id, device id, or anonymous grant id).
    pub subject: String,
    /// Share scope (empty = all shares for the team key).
    pub share_id: Option<String>,
    /// Unix expiry (seconds).
    pub expires_at: u64,
    /// Optional nonce for uniqueness.
    pub nonce: [u8; 16],
}

/// Signed mount token ready for wire / storage.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct MountToken {
    pub grant: MountGrant,
    /// Ed25519 signature over postcard-encoded grant.
    pub signature: Vec<u8>,
}

#[derive(Error, Debug, Clone, PartialEq, Eq)]
pub enum MountTokenError {
    #[error("serialization failed: {0}")]
    Serialization(String),
    #[error("invalid signature")]
    InvalidSignature,
    #[error("token expired")]
    Expired,
    #[error("token revoked")]
    Revoked,
    #[error("share scope mismatch")]
    ScopeMismatch,
    #[error("invalid key: {0}")]
    InvalidKey(String),
}

/// Generate a new Ed25519 team keypair.
pub fn generate_team_keypair() -> (SigningKey, VerifyingKey) {
    let mut rng = rand_core::OsRng;
    let signing = SigningKey::generate(&mut rng);
    let verifying = signing.verifying_key();
    (signing, verifying)
}

/// Hex-encode a verifying key for `team_key_id`.
pub fn key_id(verifying: &VerifyingKey) -> String {
    verifying
        .as_bytes()
        .iter()
        .map(|b| format!("{:02x}", b))
        .collect()
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn grant_bytes(grant: &MountGrant) -> Result<Vec<u8>, MountTokenError> {
    postcard::to_stdvec(grant).map_err(|e| MountTokenError::Serialization(e.to_string()))
}

/// Sign a mount grant with a team signing key.
pub fn sign_grant(signing: &SigningKey, grant: MountGrant) -> Result<MountToken, MountTokenError> {
    let bytes = grant_bytes(&grant)?;
    let sig: Signature = signing.sign(&bytes);
    Ok(MountToken {
        grant,
        signature: sig.to_bytes().to_vec(),
    })
}

/// Create and sign a grant with defaults.
pub fn issue_token(
    signing: &SigningKey,
    subject: impl Into<String>,
    share_id: Option<String>,
    ttl_secs: u64,
) -> Result<MountToken, MountTokenError> {
    let verifying = signing.verifying_key();
    let mut nonce = [0u8; 16];
    if getrandom::fill(&mut nonce).is_err() {
        return Err(MountTokenError::Serialization("rng failed".into()));
    }
    let grant = MountGrant {
        team_key_id: key_id(&verifying),
        subject: subject.into(),
        share_id,
        expires_at: now_secs().saturating_add(ttl_secs),
        nonce,
    };
    sign_grant(signing, grant)
}

/// Verify signature and expiry. Optionally check share scope and revocation list.
pub fn verify_token(
    verifying: &VerifyingKey,
    token: &MountToken,
    expected_share: Option<&str>,
    revoked_nonces: &[[u8; 16]],
) -> Result<(), MountTokenError> {
    if token.grant.expires_at < now_secs() {
        return Err(MountTokenError::Expired);
    }
    if revoked_nonces.iter().any(|n| n == &token.grant.nonce) {
        return Err(MountTokenError::Revoked);
    }
    if let Some(expected) = expected_share {
        match &token.grant.share_id {
            Some(sid) if sid == expected => {}
            Some(_) => return Err(MountTokenError::ScopeMismatch),
            None => {} // unscoped = all shares
        }
    }

    let bytes = grant_bytes(&token.grant)?;
    let sig_bytes: [u8; 64] = token
        .signature
        .as_slice()
        .try_into()
        .map_err(|_| MountTokenError::InvalidSignature)?;
    let sig = Signature::from_bytes(&sig_bytes);
    verifying
        .verify(&bytes, &sig)
        .map_err(|_| MountTokenError::InvalidSignature)?;

    let expected_id = key_id(verifying);
    if token.grant.team_key_id != expected_id {
        return Err(MountTokenError::InvalidKey("team_key_id mismatch".into()));
    }
    Ok(())
}

/// Encode token for CLI transport (base64-ish hex of postcard).
pub fn encode_token(token: &MountToken) -> Result<String, MountTokenError> {
    let bytes =
        postcard::to_stdvec(token).map_err(|e| MountTokenError::Serialization(e.to_string()))?;
    Ok(hex::encode(bytes))
}

/// Decode token from hex postcard.
pub fn decode_token(s: &str) -> Result<MountToken, MountTokenError> {
    let bytes = hex::decode(s.trim()).map_err(|e| MountTokenError::Serialization(e.to_string()))?;
    postcard::from_bytes(&bytes).map_err(|e| MountTokenError::Serialization(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sign_and_verify_ok() {
        let (sk, vk) = generate_team_keypair();
        let token = issue_token(&sk, "alice", Some("share-1".into()), 3600).unwrap();
        assert!(verify_token(&vk, &token, Some("share-1"), &[]).is_ok());
    }

    #[test]
    fn scope_mismatch() {
        let (sk, vk) = generate_team_keypair();
        let token = issue_token(&sk, "alice", Some("share-1".into()), 3600).unwrap();
        assert_eq!(
            verify_token(&vk, &token, Some("other"), &[]),
            Err(MountTokenError::ScopeMismatch)
        );
    }

    #[test]
    fn revoked_nonce() {
        let (sk, vk) = generate_team_keypair();
        let token = issue_token(&sk, "bob", None, 3600).unwrap();
        assert_eq!(
            verify_token(&vk, &token, None, &[token.grant.nonce]),
            Err(MountTokenError::Revoked)
        );
    }

    #[test]
    fn encode_decode_roundtrip() {
        let (sk, vk) = generate_team_keypair();
        let token = issue_token(&sk, "carol", None, 60).unwrap();
        let encoded = encode_token(&token).unwrap();
        let decoded = decode_token(&encoded).unwrap();
        assert_eq!(token, decoded);
        assert!(verify_token(&vk, &decoded, None, &[]).is_ok());
    }

    #[test]
    fn expired_token() {
        let (sk, vk) = generate_team_keypair();
        let mut grant = MountGrant {
            team_key_id: key_id(&vk),
            subject: "x".into(),
            share_id: None,
            expires_at: 1,
            nonce: [1; 16],
        };
        // fix key id after we have grant - already set
        let _ = &mut grant;
        let token = sign_grant(&sk, grant).unwrap();
        assert_eq!(
            verify_token(&vk, &token, None, &[]),
            Err(MountTokenError::Expired)
        );
    }
}
