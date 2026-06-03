# Wormhole Security Guide

## Threat Model

### Assets to Protect

1. **File Content** - Data being shared/transferred
2. **Metadata** - File names, sizes, directory structure
3. **Credentials** - Join codes, PAKE keys
4. **Network Privacy** - IP addresses, connection patterns
5. **System Integrity** - Host/client machines

### Threat Actors

| Actor | Capability | Motivation |
|-------|------------|------------|
| **Passive Network Observer** | Intercept traffic | Surveillance, data collection |
| **Active Network Attacker (MITM)** | Intercept + modify traffic | Data theft, impersonation |
| **Malicious Peer** | Connect as client/host | Data exfiltration, malware |
| **Signal Server Operator** | See connection metadata | Privacy violation |
| **Local User** | Access to cache/config | Unauthorized file access |

---

## Security by Phase

### Phase 1-4: LAN Security

#### Threat: Passive Eavesdropping
- **Risk**: Network traffic captured
- **Mitigation**: TLS 1.3 encryption via QUIC
- **Status**: Implemented

#### Threat: MITM Attack
- **Risk**: Attacker intercepts and modifies data
- **Mitigation (MVP)**: Self-signed certificates with warning
- **Mitigation (Future)**: Certificate pinning, TOFU, or CA verification
- **Status**: MVP implemented, needs improvement

```rust
// Current MVP: Accept any certificate (INSECURE for production)
pub struct SkipServerVerification;

impl rustls::client::ServerCertVerifier for SkipServerVerification {
    fn verify_server_cert(
        &self,
        _end_entity: &rustls::Certificate,
        _intermediates: &[rustls::Certificate],
        _server_name: &rustls::ServerName,
        _scts: &mut dyn Iterator<Item = &[u8]>,
        _ocsp_response: &[u8],
        _now: std::time::SystemTime,
    ) -> Result<rustls::client::ServerCertVerified, rustls::Error> {
        // TODO: Implement proper verification
        Ok(rustls::client::ServerCertVerified::assertion())
    }
}

// FUTURE: Trust-on-first-use (TOFU) implementation
pub struct TofuVerifier {
    known_hosts: HashMap<String, Vec<u8>>, // hostname -> cert hash
}

impl TofuVerifier {
    pub fn verify(&self, hostname: &str, cert: &[u8]) -> VerifyResult {
        let cert_hash = blake3::hash(cert);

        match self.known_hosts.get(hostname) {
            None => VerifyResult::NewHost, // Prompt user to accept
            Some(known_hash) if known_hash == cert_hash.as_bytes() => VerifyResult::Trusted,
            Some(_) => VerifyResult::Changed, // Warn: possible MITM!
        }
    }
}
```

#### Threat: Path Traversal
- **Risk**: Attacker reads files outside share directory
- **Mitigation**: Path canonicalization + prefix check
- **Status**: Implemented

```rust
pub fn safe_path(root: &Path, relative: &str) -> Option<PathBuf> {
    // 1. Reject obvious attacks
    if relative.contains("..") || relative.starts_with('/') {
        return None;
    }

    // 2. Build and canonicalize
    let full = root.join(relative);
    let canonical_root = root.canonicalize().ok()?;
    let canonical_full = full.canonicalize().ok()?;

    // 3. Verify containment
    if canonical_full.starts_with(&canonical_root) {
        Some(canonical_full)
    } else {
        None
    }
}
```

#### Threat: Symlink Escape
- **Risk**: Symlink points outside share directory
- **Mitigation**: Skip symlinks in scanner + resolve in safe_path
- **Status**: Implemented

```rust
// Scanner skips symlinks
fn scan_directory(root: &Path) -> Result<DirEntry> {
    for entry in WalkDir::new(root).follow_links(false) {
        let entry = entry?;
        if entry.file_type().is_symlink() {
            tracing::debug!("Skipping symlink: {:?}", entry.path());
            continue;
        }
        // ... process entry
    }
}
```

### Phase 5: Desktop App Security

#### Threat: IPC Command Injection
- **Risk**: Malicious web content invokes Tauri commands
- **Mitigation**: Content Security Policy (CSP) + command validation
- **Status**: Needs implementation

```json
// src-tauri/tauri.conf.json
{
  "app": {
    "security": {
      "csp": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'"
    }
  }
}
```

```rust
// Validate all command inputs
#[tauri::command]
async fn start_hosting(path: String, port: u16) -> Result<(), String> {
    // Validate port range
    if port < 1024 || port > 65535 {
        return Err("Invalid port number".to_string());
    }

    // Validate path exists and is directory
    let path = PathBuf::from(&path);
    if !path.is_dir() {
        return Err("Path must be a directory".to_string());
    }

    // Validate path doesn't contain sensitive locations
    let forbidden = ["/etc", "/var", "/root", "C:\\Windows", "C:\\Program Files"];
    for prefix in forbidden {
        if path.starts_with(prefix) {
            return Err("Cannot share system directories".to_string());
        }
    }

    // ... proceed with hosting
}
```

#### Threat: Sensitive Data in Storage
- **Risk**: Credentials/paths stored in plaintext
- **Mitigation**: Use OS keychain for secrets, encrypt config
- **Status**: Needs implementation

```rust
// Use OS keychain for sensitive data
use keyring::Entry;

pub fn store_secret(service: &str, key: &str, value: &str) -> Result<()> {
    let entry = Entry::new(service, key)?;
    entry.set_password(value)?;
    Ok(())
}

pub fn get_secret(service: &str, key: &str) -> Result<String> {
    let entry = Entry::new(service, key)?;
    entry.get_password().map_err(Into::into)
}
```

### Phase 6: Global Connectivity Security

#### Threat: Join Code Brute Force
- **Risk**: Attacker guesses join codes
- **Mitigation**: 80-bit entropy + rate limiting + expiry
- **Status**: Partially implemented

```rust
// Code generation with 80 bits of entropy
pub fn generate_join_code() -> String {
    use rand::Rng;
    let mut rng = rand::rngs::OsRng;

    let bytes: [u8; 10] = rng.gen(); // 80 bits
    base32::encode(base32::Alphabet::Crockford, &bytes)
        .chars()
        .take(16)
        .collect::<Vec<_>>()
        .chunks(4)
        .map(|c| c.iter().collect::<String>())
        .collect::<Vec<_>>()
        .join("-")
}

// Signal server rate limiting
pub struct RateLimiter {
    attempts: HashMap<IpAddr, Vec<Instant>>,
    max_attempts: usize,
    window: Duration,
}

impl RateLimiter {
    pub fn check(&mut self, ip: IpAddr) -> bool {
        let now = Instant::now();
        let attempts = self.attempts.entry(ip).or_default();

        // Remove old attempts
        attempts.retain(|t| now.duration_since(*t) < self.window);

        if attempts.len() >= self.max_attempts {
            return false; // Rate limited
        }

        attempts.push(now);
        true
    }
}
```

#### Threat: PAKE Authentication Failure
- **Risk**: Codes don't match, revealing info to attacker
- **Mitigation**: Constant-time comparison, no early abort
- **Status**: Implemented via spake2 library

```rust
// PAKE is constant-time by design
let shared_key = pake_state.finish(peer_message)?;
// If codes don't match, shared_key will be different
// Subsequent protocol messages will fail to decrypt
```

#### Threat: Signal Server Compromise
- **Risk**: Server sees IP addresses and timing
- **Mitigation**: Server cannot derive shared keys (PAKE property)
- **Mitigation (Future)**: Onion routing / Tor support
- **Status**: Inherent to PAKE design

```
Signal Server sees:
  - IP addresses of peers
  - Join code (but cannot derive key from it)
  - Timing of connections

Signal Server CANNOT see:
  - File contents (encrypted with PAKE-derived key)
  - File names (encrypted)
  - Shared secret
```

#### Threat: STUN Response Spoofing
- **Risk**: Attacker injects fake public IP
- **Mitigation**: Use multiple STUN servers, verify consistency
- **Status**: Needs implementation

```rust
pub async fn get_public_address_verified() -> Result<SocketAddr> {
    let servers = [
        "stun.l.google.com:19302",
        "stun.cloudflare.com:3478",
        "stun.stunprotocol.org:3478",
    ];

    let mut results = Vec::new();
    for server in servers {
        if let Ok(addr) = query_stun_server(server).await {
            results.push(addr);
        }
    }

    // Require at least 2 servers to agree
    if results.len() < 2 {
        anyhow::bail!("Insufficient STUN responses");
    }

    // Find most common result
    let mut counts: HashMap<SocketAddr, usize> = HashMap::new();
    for addr in &results {
        *counts.entry(*addr).or_default() += 1;
    }

    counts
        .into_iter()
        .max_by_key(|(_, count)| *count)
        .map(|(addr, _)| addr)
        .ok_or_else(|| anyhow::anyhow!("No consensus on public IP"))
}
```

### Phase 7: Write Security

#### Threat: Unauthorized Write
- **Risk**: Attacker modifies files without permission
- **Mitigation**: Lock tokens + validation
- **Status**: Implemented

```rust
// Every write request must include valid lock token
pub async fn handle_write_request(
    lock_manager: &LockManager,
    path: &str,
    token: LockToken,
    data: &[u8],
) -> Result<()> {
    // Verify lock is held by this client
    if !lock_manager.verify(path, token).await {
        return Err(WormholeError::InvalidLockToken);
    }

    // Proceed with write
    apply_write(path, data)
}
```

#### Threat: Lock Starvation
- **Risk**: Client holds lock indefinitely, blocking others
- **Mitigation**: Lock TTL with auto-expiry
- **Status**: Implemented

```rust
const LOCK_TTL: Duration = Duration::from_secs(60);

impl LockManager {
    pub async fn acquire(&self, path: &str, client_id: &str) -> Result<LockToken> {
        let mut locks = self.locks.write().await;

        // Check for existing lock
        if let Some(entry) = locks.get(path) {
            if entry.expires_at > Instant::now() && entry.client_id != client_id {
                return Err(WormholeError::LockHeld {
                    holder: entry.client_id.clone(),
                });
            }
            // Expired or same client - allow re-acquisition
        }

        // Create new lock with TTL
        let token = LockToken(rand::random());
        locks.insert(path.to_string(), LockEntry {
            token,
            client_id: client_id.to_string(),
            expires_at: Instant::now() + LOCK_TTL,
        });

        Ok(token)
    }
}
```

#### Threat: Race Condition on Write
- **Risk**: Concurrent writes corrupt data
- **Mitigation**: Locks are mutually exclusive per file
- **Status**: Implemented

---

## Cache Security

### Threat: Cache Poisoning
- **Risk**: Corrupted chunk used silently
- **Mitigation**: Integrity verification with BLAKE3
- **Status**: Needs implementation

```rust
// Store hash alongside chunk
pub struct CachedChunk {
    data: Vec<u8>,
    hash: [u8; 32],
}

impl DiskCache {
    pub async fn write(&self, chunk_id: ChunkId, data: &[u8]) -> Result<()> {
        let hash = blake3::hash(data);
        let chunk = CachedChunk {
            data: data.to_vec(),
            hash: *hash.as_bytes(),
        };

        let encoded = bincode::serialize(&chunk)?;
        self.write_atomic(chunk_id, &encoded).await
    }

    pub async fn read(&self, chunk_id: &ChunkId) -> Result<Option<Vec<u8>>> {
        let encoded = self.read_raw(chunk_id).await?;
        let Some(encoded) = encoded else { return Ok(None) };

        let chunk: CachedChunk = bincode::deserialize(&encoded)?;

        // Verify integrity
        let computed_hash = blake3::hash(&chunk.data);
        if computed_hash.as_bytes() != &chunk.hash {
            tracing::error!("Cache corruption detected for {:?}", chunk_id);
            self.remove(chunk_id).await?;
            return Err(WormholeError::CacheCorrupted(
                format!("{:?}", chunk_id)
            ).into());
        }

        Ok(Some(chunk.data))
    }
}
```

### Threat: Cache Directory Permissions
- **Risk**: Other users access cached files
- **Mitigation**: Restrict directory permissions
- **Status**: Needs implementation

```rust
pub fn ensure_secure_cache_dir(path: &Path) -> Result<()> {
    if !path.exists() {
        std::fs::create_dir_all(path)?;
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let perms = std::fs::Permissions::from_mode(0o700);
        std::fs::set_permissions(path, perms)?;
    }

    #[cfg(windows)]
    {
        // Windows: Set ACL to owner-only
        // Requires windows-acl crate
    }

    Ok(())
}
```

### Threat: Cache Encryption at Rest
- **Risk**: Disk theft exposes cached files
- **Mitigation**: Encrypt cache with user-derived key
- **Status**: Future enhancement

```rust
// Future: Encrypt cache with key derived from user password
pub struct EncryptedCache {
    inner: DiskCache,
    cipher: ChaCha20Poly1305,
}

impl EncryptedCache {
    pub fn new(cache_dir: PathBuf, password: &str) -> Result<Self> {
        // Derive key from password
        let salt = Self::get_or_create_salt(&cache_dir)?;
        let key = argon2::hash_password(password.as_bytes(), &salt)?;

        let cipher = ChaCha20Poly1305::new(&key.into());

        Ok(Self {
            inner: DiskCache::new(cache_dir)?,
            cipher,
        })
    }

    pub async fn write(&self, chunk_id: ChunkId, data: &[u8]) -> Result<()> {
        let nonce = ChaCha20Poly1305::generate_nonce(&mut OsRng);
        let ciphertext = self.cipher.encrypt(&nonce, data)?;

        let payload = [nonce.as_slice(), &ciphertext].concat();
        self.inner.write(chunk_id, &payload).await
    }

    pub async fn read(&self, chunk_id: &ChunkId) -> Result<Option<Vec<u8>>> {
        let Some(payload) = self.inner.read(chunk_id).await? else {
            return Ok(None);
        };

        let (nonce, ciphertext) = payload.split_at(12);
        let plaintext = self.cipher.decrypt(nonce.into(), ciphertext)?;

        Ok(Some(plaintext))
    }
}
```

---

## Network Security

### TLS Configuration

```rust
// Recommended TLS settings
pub fn secure_tls_config() -> rustls::ClientConfig {
    rustls::ClientConfig::builder()
        .with_safe_default_cipher_suites()
        .with_safe_default_kx_groups()
        .with_protocol_versions(&[&rustls::version::TLS13])
        .expect("TLS 1.3 supported")
        .with_root_certificates(root_store())
        .with_no_client_auth()
}

// Cipher suites (TLS 1.3 only)
// - TLS_AES_256_GCM_SHA384
// - TLS_AES_128_GCM_SHA256
// - TLS_CHACHA20_POLY1305_SHA256
```

### QUIC Security

```rust
// QUIC provides:
// - Encrypted transport (TLS 1.3)
// - Connection migration (IP changes)
// - 0-RTT resumption (with replay protection)

pub fn secure_quic_config() -> quinn::TransportConfig {
    let mut config = quinn::TransportConfig::default();

    // Limit idle timeout (prevent resource exhaustion)
    config.max_idle_timeout(Some(Duration::from_secs(60).try_into().unwrap()));

    // Limit concurrent streams (prevent DoS)
    config.max_concurrent_bidi_streams(100u32.into());
    config.max_concurrent_uni_streams(100u32.into());

    config
}
```

---

## Security Checklist

### Before Alpha

- [ ] Path traversal blocked (unit tests)
- [ ] TLS configured correctly
- [ ] QUIC limits set
- [ ] Rate limiting on signal server
- [ ] Lock TTL enforced
- [ ] Input validation on all commands

### Before Beta

- [ ] Cache integrity verification
- [ ] Cache directory permissions
- [ ] CSP configured for Tauri
- [ ] OS keychain for secrets
- [ ] Multi-STUN verification
- [ ] Security audit completed

### Before Production

- [ ] Penetration test passed
- [ ] TOFU or certificate pinning
- [ ] Encrypted cache (optional)
- [ ] Audit logging
- [ ] Incident response plan
- [ ] CVE monitoring process

---

## Security Contacts

- **Security Issues**: security@wormhole.app
- **Bug Bounty**: (Future) hackerone.com/wormhole

---

## Changelog

| Date | Version | Changes |
|------|---------|---------|
| 2024-01-01 | 0.1.0 | Initial security model |
