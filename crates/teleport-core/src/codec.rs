//! Wire codecs for Wormhole protocol messages.
//!
//! Supports dual-decode: **bincode** (legacy default) and **postcard** (preferred).
//! Peers negotiate via Hello capabilities (`codec:postcard`).

use serde::{Deserialize, Serialize};

use crate::protocol::NetMessage;
use crate::ProtocolError;

/// Capability string advertised when a peer supports postcard.
pub const CAP_CODEC_POSTCARD: &str = "codec:postcard";

/// Capability string for legacy bincode (implicit if postcard absent).
pub const CAP_CODEC_BINCODE: &str = "codec:bincode";

/// Wire serialization codec.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Default, Serialize, Deserialize)]
#[repr(u8)]
pub enum WireCodec {
    /// Legacy bincode framing (default for protocol v1 peers).
    #[default]
    Bincode = 0,
    /// Compact postcard encoding (preferred for protocol v2+).
    Postcard = 1,
}

impl WireCodec {
    /// Parse from a capability token (`codec:postcard` / `codec:bincode`).
    pub fn from_capability(cap: &str) -> Option<Self> {
        match cap {
            CAP_CODEC_POSTCARD => Some(Self::Postcard),
            CAP_CODEC_BINCODE => Some(Self::Bincode),
            _ => None,
        }
    }

    /// Capability string for this codec.
    pub fn as_capability(self) -> &'static str {
        match self {
            Self::Bincode => CAP_CODEC_BINCODE,
            Self::Postcard => CAP_CODEC_POSTCARD,
        }
    }

    /// Negotiate the best mutual codec from advertised capabilities.
    ///
    /// Prefers postcard when both sides advertise it; otherwise bincode.
    pub fn negotiate(local: &[String], remote: &[String]) -> Self {
        let local_postcard = local.iter().any(|c| c == CAP_CODEC_POSTCARD);
        let remote_postcard = remote.iter().any(|c| c == CAP_CODEC_POSTCARD);
        if local_postcard && remote_postcard {
            Self::Postcard
        } else {
            Self::Bincode
        }
    }

    /// Default local capabilities including preferred codecs.
    pub fn local_capabilities() -> Vec<String> {
        vec![
            CAP_CODEC_POSTCARD.into(),
            CAP_CODEC_BINCODE.into(),
            "read".into(),
        ]
    }
}

/// Serialize a message with a 4-byte little-endian length prefix using `codec`.
pub fn serialize_with_codec(msg: &NetMessage, codec: WireCodec) -> Result<Vec<u8>, ProtocolError> {
    let payload = match codec {
        WireCodec::Bincode => {
            bincode::serialize(msg).map_err(|e| ProtocolError::Serialization(e.to_string()))?
        }
        WireCodec::Postcard => {
            postcard::to_stdvec(msg).map_err(|e| ProtocolError::Serialization(e.to_string()))?
        }
    };

    let len = payload.len() as u32;
    let mut result = Vec::with_capacity(4 + payload.len());
    result.extend_from_slice(&len.to_le_bytes());
    result.extend_from_slice(&payload);
    Ok(result)
}

/// Deserialize a payload (without length prefix) using `codec`.
pub fn deserialize_with_codec(data: &[u8], codec: WireCodec) -> Result<NetMessage, ProtocolError> {
    match codec {
        WireCodec::Bincode => {
            bincode::deserialize(data).map_err(|e| ProtocolError::Deserialization(e.to_string()))
        }
        WireCodec::Postcard => {
            postcard::from_bytes(data).map_err(|e| ProtocolError::Deserialization(e.to_string()))
        }
    }
}

/// Dual-decode: try postcard first, then bincode (migration helper).
pub fn deserialize_dual(data: &[u8]) -> Result<(NetMessage, WireCodec), ProtocolError> {
    if let Ok(msg) = postcard::from_bytes::<NetMessage>(data) {
        return Ok((msg, WireCodec::Postcard));
    }
    let msg =
        bincode::deserialize(data).map_err(|e| ProtocolError::Deserialization(e.to_string()))?;
    Ok((msg, WireCodec::Bincode))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::{HelloMessage, NetMessage};

    fn sample_hello() -> NetMessage {
        NetMessage::Hello(HelloMessage {
            protocol_version: 2,
            client_id: [9; 16],
            capabilities: WireCodec::local_capabilities(),
        })
    }

    #[test]
    fn postcard_roundtrip() {
        let msg = sample_hello();
        let bytes = serialize_with_codec(&msg, WireCodec::Postcard).unwrap();
        let payload = &bytes[4..];
        let decoded = deserialize_with_codec(payload, WireCodec::Postcard).unwrap();
        match decoded {
            NetMessage::Hello(h) => {
                assert_eq!(h.protocol_version, 2);
                assert_eq!(h.client_id, [9; 16]);
            }
            _ => panic!("wrong type"),
        }
    }

    #[test]
    fn bincode_roundtrip() {
        let msg = sample_hello();
        let bytes = serialize_with_codec(&msg, WireCodec::Bincode).unwrap();
        let payload = &bytes[4..];
        let decoded = deserialize_with_codec(payload, WireCodec::Bincode).unwrap();
        match decoded {
            NetMessage::Hello(h) => assert_eq!(h.protocol_version, 2),
            _ => panic!("wrong type"),
        }
    }

    #[test]
    fn dual_decode_prefers_postcard_payload() {
        let msg = sample_hello();
        let bytes = serialize_with_codec(&msg, WireCodec::Postcard).unwrap();
        let (decoded, codec) = deserialize_dual(&bytes[4..]).unwrap();
        assert_eq!(codec, WireCodec::Postcard);
        assert!(matches!(decoded, NetMessage::Hello(_)));
    }

    #[test]
    fn negotiate_prefers_postcard() {
        let local = vec![CAP_CODEC_POSTCARD.into()];
        let remote = vec![CAP_CODEC_POSTCARD.into(), "read".into()];
        assert_eq!(WireCodec::negotiate(&local, &remote), WireCodec::Postcard);
    }

    #[test]
    fn negotiate_falls_back_to_bincode() {
        let local = vec![CAP_CODEC_POSTCARD.into()];
        let remote = vec!["read".into()];
        assert_eq!(WireCodec::negotiate(&local, &remote), WireCodec::Bincode);
    }
}
