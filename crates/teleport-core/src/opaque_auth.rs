//! OPAQUE (RFC 9807) helpers for cloud account passwords.
//!
//! Join codes continue to use SPAKE2 (balanced PAKE). OPAQUE is for
//! asymmetric client↔server login where the server never sees the password.

use opaque_ke::ciphersuite::CipherSuite;
use opaque_ke::ksf::Identity;
use opaque_ke::{
    ClientLogin, ClientLoginFinishParameters, ClientRegistration,
    ClientRegistrationFinishParameters, CredentialFinalization, CredentialRequest,
    CredentialResponse, RegistrationRequest, RegistrationResponse, RegistrationUpload, ServerLogin,
    ServerLoginParameters, ServerRegistration, ServerSetup, TripleDh,
};
use rand::rngs::OsRng;
use thiserror::Error;

/// Cipher suite: Ristretto255 + SHA-512 + Identity KSF.
pub struct WormholeOpaque;

impl CipherSuite for WormholeOpaque {
    type OprfCs = opaque_ke::Ristretto255;
    type KeyExchange = TripleDh<opaque_ke::Ristretto255, sha2::Sha512>;
    type Ksf = Identity;
}

#[derive(Error, Debug)]
pub enum OpaqueError {
    #[error("opaque protocol error: {0}")]
    Protocol(String),
}

/// Server long-term OPAQUE setup (store securely).
pub struct OpaqueServerState {
    pub setup: ServerSetup<WormholeOpaque>,
}

impl OpaqueServerState {
    pub fn new() -> Self {
        let mut rng = OsRng;
        Self {
            setup: ServerSetup::<WormholeOpaque>::new(&mut rng),
        }
    }

    pub fn serialize(&self) -> Vec<u8> {
        self.setup.serialize().to_vec()
    }

    pub fn deserialize(bytes: &[u8]) -> Result<Self, OpaqueError> {
        let setup = ServerSetup::<WormholeOpaque>::deserialize(bytes)
            .map_err(|e| OpaqueError::Protocol(format!("{e:?}")))?;
        Ok(Self { setup })
    }
}

impl Default for OpaqueServerState {
    fn default() -> Self {
        Self::new()
    }
}

/// Client registration start → returns message for server + client state.
pub fn client_register_start(
    password: &[u8],
) -> Result<(ClientRegistration<WormholeOpaque>, Vec<u8>), OpaqueError> {
    let mut rng = OsRng;
    let result = ClientRegistration::<WormholeOpaque>::start(&mut rng, password)
        .map_err(|e| OpaqueError::Protocol(format!("{e:?}")))?;
    Ok((result.state, result.message.serialize().to_vec()))
}

/// Server handles registration request.
pub fn server_register(
    server: &OpaqueServerState,
    registration_request: &[u8],
    username: &[u8],
) -> Result<Vec<u8>, OpaqueError> {
    let request = RegistrationRequest::<WormholeOpaque>::deserialize(registration_request)
        .map_err(|e| OpaqueError::Protocol(format!("{e:?}")))?;
    let response = ServerRegistration::<WormholeOpaque>::start(&server.setup, request, username)
        .map_err(|e| OpaqueError::Protocol(format!("{e:?}")))?;
    Ok(response.message.serialize().to_vec())
}

/// Client finishes registration → upload for server to store.
pub fn client_register_finish(
    state: ClientRegistration<WormholeOpaque>,
    password: &[u8],
    server_response: &[u8],
) -> Result<Vec<u8>, OpaqueError> {
    let mut rng = OsRng;
    let response = RegistrationResponse::<WormholeOpaque>::deserialize(server_response)
        .map_err(|e| OpaqueError::Protocol(format!("{e:?}")))?;
    let finish = state
        .finish(
            &mut rng,
            password,
            response,
            ClientRegistrationFinishParameters::default(),
        )
        .map_err(|e| OpaqueError::Protocol(format!("{e:?}")))?;
    Ok(finish.message.serialize().to_vec())
}

/// Server stores the registration upload; returns password file bytes.
pub fn server_register_finish(upload: &[u8]) -> Result<Vec<u8>, OpaqueError> {
    let upload = RegistrationUpload::<WormholeOpaque>::deserialize(upload)
        .map_err(|e| OpaqueError::Protocol(format!("{e:?}")))?;
    let password_file = ServerRegistration::<WormholeOpaque>::finish(upload);
    Ok(password_file.serialize().to_vec())
}

/// Full login round-trip returning matching session keys (for tests / cloud).
pub fn login_session_keys(
    server: &OpaqueServerState,
    password_file: &[u8],
    username: &[u8],
    password: &[u8],
) -> Result<(Vec<u8>, Vec<u8>), OpaqueError> {
    let password_file = ServerRegistration::<WormholeOpaque>::deserialize(password_file)
        .map_err(|e| OpaqueError::Protocol(format!("{e:?}")))?;

    let mut client_rng = OsRng;
    let client_start = ClientLogin::<WormholeOpaque>::start(&mut client_rng, password)
        .map_err(|e| OpaqueError::Protocol(format!("{e:?}")))?;

    let mut server_rng = OsRng;
    let server_start = ServerLogin::<WormholeOpaque>::start(
        &mut server_rng,
        &server.setup,
        Some(password_file),
        CredentialRequest::deserialize(client_start.message.serialize().as_slice())
            .map_err(|e| OpaqueError::Protocol(format!("{e:?}")))?,
        username,
        ServerLoginParameters::default(),
    )
    .map_err(|e| OpaqueError::Protocol(format!("{e:?}")))?;

    let client_finish = client_start
        .state
        .finish(
            &mut client_rng,
            password,
            CredentialResponse::deserialize(server_start.message.serialize().as_slice())
                .map_err(|e| OpaqueError::Protocol(format!("{e:?}")))?,
            ClientLoginFinishParameters::default(),
        )
        .map_err(|e| OpaqueError::Protocol(format!("{e:?}")))?;

    let server_finish = server_start
        .state
        .finish(
            CredentialFinalization::deserialize(client_finish.message.serialize().as_slice())
                .map_err(|e| OpaqueError::Protocol(format!("{e:?}")))?,
            ServerLoginParameters::default(),
        )
        .map_err(|e| OpaqueError::Protocol(format!("{e:?}")))?;

    Ok((
        client_finish.session_key.to_vec(),
        server_finish.session_key.to_vec(),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn register_and_login() {
        let server = OpaqueServerState::new();
        let password = b"correct horse battery staple";
        let user = b"alice";

        let (client_state, reg_req) = client_register_start(password).unwrap();
        let reg_resp = server_register(&server, &reg_req, user).unwrap();
        let upload = client_register_finish(client_state, password, &reg_resp).unwrap();
        let password_file = server_register_finish(&upload).unwrap();

        let (ck, sk) = login_session_keys(&server, &password_file, user, password).unwrap();
        assert_eq!(ck, sk);
    }

    #[test]
    fn wrong_password_fails() {
        let server = OpaqueServerState::new();
        let user = b"bob";
        let (client_state, reg_req) = client_register_start(b"right-password").unwrap();
        let reg_resp = server_register(&server, &reg_req, user).unwrap();
        let upload = client_register_finish(client_state, b"right-password", &reg_resp).unwrap();
        let password_file = server_register_finish(&upload).unwrap();

        let err = login_session_keys(&server, &password_file, user, b"wrong-password");
        assert!(err.is_err());
    }
}
