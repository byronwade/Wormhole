//! Wormhole cloud control plane (no file bytes).
//!
//! - Issue / verify mount tokens
//! - Polar webhook event shapes for seat billing
//! - OPAQUE password file storage helpers

use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::sync::Arc;

use ed25519_dalek::{SigningKey, VerifyingKey};
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use teleport_core::{
    decode_token, encode_token, generate_team_keypair, issue_token, key_id, verify_token,
    MountToken, MountTokenError, OpaqueServerState, PAID_TOKEN_TTL_SECS,
};
use thiserror::Error;
use tracing::info;

// Re-export opaque helpers used by the binary / web.
pub use teleport_core::opaque_auth::{
    client_register_finish, client_register_start, login_session_keys, server_register,
    server_register_finish, OpaqueError, OpaqueServerState as OpaqueState,
};

#[derive(Error, Debug)]
pub enum CloudError {
    #[error("token: {0}")]
    Token(#[from] MountTokenError),
    #[error("io: {0}")]
    Io(String),
    #[error("auth: {0}")]
    Auth(String),
    #[error("billing: {0}")]
    Billing(String),
    #[error("not found: {0}")]
    NotFound(String),
}

/// In-memory + on-disk team key and revocation list.
pub struct TokenService {
    signing: SigningKey,
    verifying: VerifyingKey,
    revoked: RwLock<Vec<[u8; 16]>>,
}

impl TokenService {
    pub fn new() -> Self {
        let (signing, verifying) = generate_team_keypair();
        Self {
            signing,
            verifying,
            revoked: RwLock::new(Vec::new()),
        }
    }

    pub fn from_seed(seed: [u8; 32]) -> Self {
        let signing = SigningKey::from_bytes(&seed);
        let verifying = signing.verifying_key();
        Self {
            signing,
            verifying,
            revoked: RwLock::new(Vec::new()),
        }
    }

    pub fn team_key_id(&self) -> String {
        key_id(&self.verifying)
    }

    pub fn verifying_key_bytes(&self) -> [u8; 32] {
        *self.verifying.as_bytes()
    }

    pub fn issue(
        &self,
        subject: &str,
        share_id: Option<String>,
        ttl_secs: Option<u64>,
    ) -> Result<MountToken, CloudError> {
        let ttl = ttl_secs.unwrap_or(PAID_TOKEN_TTL_SECS);
        Ok(issue_token(&self.signing, subject, share_id, ttl)?)
    }

    pub fn issue_encoded(
        &self,
        subject: &str,
        share_id: Option<String>,
        ttl_secs: Option<u64>,
    ) -> Result<String, CloudError> {
        let token = self.issue(subject, share_id, ttl_secs)?;
        Ok(encode_token(&token)?)
    }

    pub fn verify(
        &self,
        token: &MountToken,
        expected_share: Option<&str>,
    ) -> Result<(), CloudError> {
        let revoked = self.revoked.read();
        Ok(verify_token(
            &self.verifying,
            token,
            expected_share,
            &revoked,
        )?)
    }

    pub fn verify_encoded(
        &self,
        encoded: &str,
        expected_share: Option<&str>,
    ) -> Result<MountToken, CloudError> {
        let token = decode_token(encoded)?;
        self.verify(&token, expected_share)?;
        Ok(token)
    }

    pub fn revoke_nonce(&self, nonce: [u8; 16]) {
        self.revoked.write().push(nonce);
        info!(nonce = %hex::encode(nonce), "mount token revoked");
    }

    pub fn save_seed(&self, path: impl AsRef<Path>) -> Result<(), CloudError> {
        let bytes = self.signing.to_bytes();
        if let Some(parent) = path.as_ref().parent() {
            fs::create_dir_all(parent).map_err(|e| CloudError::Io(e.to_string()))?;
        }
        fs::write(path, hex::encode(bytes)).map_err(|e| CloudError::Io(e.to_string()))
    }

    pub fn load_seed(path: impl AsRef<Path>) -> Result<Self, CloudError> {
        let hex_str = fs::read_to_string(path).map_err(|e| CloudError::Io(e.to_string()))?;
        let bytes = hex::decode(hex_str.trim()).map_err(|e| CloudError::Io(e.to_string()))?;
        let seed: [u8; 32] = bytes
            .as_slice()
            .try_into()
            .map_err(|_| CloudError::Io("seed must be 32 bytes".into()))?;
        Ok(Self::from_seed(seed))
    }
}

impl Default for TokenService {
    fn default() -> Self {
        Self::new()
    }
}

/// Polar webhook event (subset we care about).
/// See https://polar.sh/docs/integrate/webhooks/endpoints
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PolarWebhookEvent {
    #[serde(rename = "type")]
    pub event_type: String,
    pub data: serde_json::Value,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SeatEntitlement {
    pub org_id: String,
    pub seats: u32,
    pub active: bool,
    pub product_id: Option<String>,
}

/// Apply Polar subscription events to seat entitlements.
pub fn apply_polar_event(
    entitlements: &mut HashMap<String, SeatEntitlement>,
    event: &PolarWebhookEvent,
) -> Result<(), CloudError> {
    match event.event_type.as_str() {
        "subscription.active" | "subscription.updated" => {
            let org = event
                .data
                .get("metadata")
                .and_then(|m| m.get("org_id"))
                .and_then(|v| v.as_str())
                .or_else(|| event.data.get("customer_id").and_then(|v| v.as_str()))
                .ok_or_else(|| CloudError::Billing("missing org/customer id".into()))?;
            let seats = event
                .data
                .get("seats")
                .and_then(|v| v.as_u64())
                .or_else(|| {
                    event
                        .data
                        .pointer("/product/benefits/0/properties/seats")
                        .and_then(|v| v.as_u64())
                })
                .unwrap_or(1) as u32;
            entitlements.insert(
                org.to_string(),
                SeatEntitlement {
                    org_id: org.to_string(),
                    seats,
                    active: true,
                    product_id: event
                        .data
                        .get("product_id")
                        .and_then(|v| v.as_str())
                        .map(str::to_string),
                },
            );
            Ok(())
        }
        "subscription.canceled" | "subscription.revoked" => {
            let org = event
                .data
                .get("metadata")
                .and_then(|m| m.get("org_id"))
                .and_then(|v| v.as_str())
                .or_else(|| event.data.get("customer_id").and_then(|v| v.as_str()))
                .ok_or_else(|| CloudError::Billing("missing org/customer id".into()))?;
            if let Some(ent) = entitlements.get_mut(org) {
                ent.active = false;
            }
            Ok(())
        }
        _ => Ok(()), // ignore unknown
    }
}

/// Simple password-file map for OPAQUE (subject → password file bytes).
pub struct OpaqueUserStore {
    inner: RwLock<HashMap<String, Vec<u8>>>,
    server: Arc<OpaqueServerState>,
}

impl OpaqueUserStore {
    pub fn new() -> Self {
        Self {
            inner: RwLock::new(HashMap::new()),
            server: Arc::new(OpaqueServerState::new()),
        }
    }

    pub fn server(&self) -> &OpaqueServerState {
        &self.server
    }

    pub fn insert_password_file(&self, subject: &str, file: Vec<u8>) {
        self.inner.write().insert(subject.to_string(), file);
    }

    pub fn get_password_file(&self, subject: &str) -> Option<Vec<u8>> {
        self.inner.read().get(subject).cloned()
    }
}

impl Default for OpaqueUserStore {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn issue_and_verify_token() {
        let svc = TokenService::new();
        let enc = svc
            .issue_encoded("user-1", Some("share-a".into()), Some(120))
            .unwrap();
        let token = svc.verify_encoded(&enc, Some("share-a")).unwrap();
        assert_eq!(token.grant.subject, "user-1");
    }

    #[test]
    fn polar_seat_activation() {
        let mut map = HashMap::new();
        let event = PolarWebhookEvent {
            event_type: "subscription.active".into(),
            data: serde_json::json!({
                "customer_id": "org_abc",
                "seats": 5,
                "product_id": "pro"
            }),
        };
        apply_polar_event(&mut map, &event).unwrap();
        assert_eq!(map["org_abc"].seats, 5);
        assert!(map["org_abc"].active);
    }

    #[test]
    fn seed_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("team.seed");
        let svc = TokenService::new();
        let kid = svc.team_key_id();
        svc.save_seed(&path).unwrap();
        let loaded = TokenService::load_seed(&path).unwrap();
        assert_eq!(loaded.team_key_id(), kid);
    }
}
