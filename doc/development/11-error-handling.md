# Error Handling Specification

This document defines error types, error codes, recovery strategies, and error handling patterns for Wormhole.

---

## Table of Contents

1. [Error Hierarchy](#1-error-hierarchy)
2. [Error Types by Crate](#2-error-types-by-crate)
3. [FUSE Error Mapping](#3-fuse-error-mapping)
4. [Network Error Handling](#4-network-error-handling)
5. [Recovery Strategies](#5-recovery-strategies)
6. [Retry Policies](#6-retry-policies)
7. [Error Logging](#7-error-logging)
8. [User-Facing Errors](#8-user-facing-errors)

---

## 1. Error Hierarchy

```
WormholeError (top-level)
├── ProtocolError (teleport-core)
│   ├── InvalidMessage
│   ├── PathTraversal
│   ├── Serialization
│   └── ChecksumMismatch
├── NetworkError (teleport-daemon)
│   ├── ConnectionFailed
│   ├── Timeout
│   ├── StreamClosed
│   └── TlsError
├── FsError (teleport-daemon)
│   ├── NotFound
│   ├── PermissionDenied
│   ├── NotADirectory
│   ├── NotAFile
│   └── IoError
├── CacheError (teleport-daemon)
│   ├── CorruptedEntry
│   ├── DiskFull
│   └── IndexError
├── LockError (teleport-daemon)
│   ├── NotHeld
│   ├── Expired
│   └── Conflict
└── ConfigError (teleport-daemon)
    ├── ParseError
    ├── MissingField
    └── InvalidValue
```

---

## 2. Error Types by Crate

### teleport-core (Library Errors)

```rust
use thiserror::Error;

/// Protocol-level errors
///
/// These errors indicate protocol violations or security issues.
/// They should NOT contain sensitive information.
#[derive(Error, Debug, Clone)]
pub enum ProtocolError {
    #[error("invalid message type: {0}")]
    InvalidMessage(u8),

    #[error("path traversal attempt blocked")]
    PathTraversal,

    #[error("serialization failed: {0}")]
    Serialization(String),

    #[error("deserialization failed: {0}")]
    Deserialization(String),

    #[error("checksum mismatch (expected {expected}, got {actual})")]
    ChecksumMismatch {
        expected: String,  // hex
        actual: String,    // hex
    },

    #[error("message too large: {size} bytes (max {max})")]
    MessageTooLarge { size: usize, max: usize },

    #[error("protocol version mismatch (expected {expected}, got {actual})")]
    VersionMismatch { expected: u32, actual: u32 },

    #[error("unsupported capability: {0}")]
    UnsupportedCapability(String),

    #[error("invalid chunk id: inode={inode}, index={index}")]
    InvalidChunkId { inode: u64, index: u64 },
}

/// Convert to wire error code
impl From<&ProtocolError> for ErrorCode {
    fn from(e: &ProtocolError) -> Self {
        match e {
            ProtocolError::InvalidMessage(_) => ErrorCode::ProtocolError,
            ProtocolError::PathTraversal => ErrorCode::PathTraversal,
            ProtocolError::Serialization(_) => ErrorCode::ProtocolError,
            ProtocolError::Deserialization(_) => ErrorCode::ProtocolError,
            ProtocolError::ChecksumMismatch { .. } => ErrorCode::ChecksumMismatch,
            ProtocolError::MessageTooLarge { .. } => ErrorCode::ProtocolError,
            ProtocolError::VersionMismatch { .. } => ErrorCode::ProtocolError,
            ProtocolError::UnsupportedCapability(_) => ErrorCode::NotImplemented,
            ProtocolError::InvalidChunkId { .. } => ErrorCode::ChunkOutOfRange,
        }
    }
}
```

### teleport-daemon (Application Errors)

```rust
use anyhow::{Context, Result};

/// Network-related errors
#[derive(Error, Debug)]
pub enum NetworkError {
    #[error("connection failed: {0}")]
    ConnectionFailed(String),

    #[error("connection timeout after {0:?}")]
    Timeout(Duration),

    #[error("stream closed unexpectedly")]
    StreamClosed,

    #[error("TLS error: {0}")]
    TlsError(String),

    #[error("authentication failed: {0}")]
    AuthFailed(String),

    #[error("signal server unreachable: {0}")]
    SignalUnreachable(String),

    #[error("NAT traversal failed")]
    NatTraversalFailed,

    #[error("peer disconnected")]
    PeerDisconnected,

    #[error("rate limited: retry after {retry_after:?}")]
    RateLimited { retry_after: Duration },
}

/// Filesystem errors
#[derive(Error, Debug)]
pub enum FsError {
    #[error("file not found: {0}")]
    NotFound(String),

    #[error("permission denied: {0}")]
    PermissionDenied(String),

    #[error("not a directory: {0}")]
    NotADirectory(String),

    #[error("not a file: {0}")]
    NotAFile(String),

    #[error("I/O error: {0}")]
    IoError(#[from] std::io::Error),

    #[error("file already exists: {0}")]
    AlreadyExists(String),

    #[error("directory not empty: {0}")]
    NotEmpty(String),

    #[error("name too long: {0} ({len} > {max})")]
    NameTooLong { name: String, len: usize, max: usize },

    #[error("path too long: {0}")]
    PathTooLong(String),

    #[error("invalid filename: {0}")]
    InvalidName(String),
}

/// Cache errors
#[derive(Error, Debug)]
pub enum CacheError {
    #[error("corrupted cache entry: {0}")]
    CorruptedEntry(String),

    #[error("disk full")]
    DiskFull,

    #[error("cache index error: {0}")]
    IndexError(String),

    #[error("cache miss: {0:?}")]
    Miss(ChunkId),
}

/// Lock errors
#[derive(Error, Debug)]
pub enum LockError {
    #[error("lock not held")]
    NotHeld,

    #[error("lock expired")]
    Expired,

    #[error("lock conflict: held by {holder}")]
    Conflict { holder: String },

    #[error("lock timeout")]
    Timeout,
}
```

---

## 3. FUSE Error Mapping

### Error Code Conversion

```rust
/// Map internal errors to FUSE/libc error codes
impl From<&FsError> for i32 {
    fn from(e: &FsError) -> i32 {
        match e {
            FsError::NotFound(_) => libc::ENOENT,
            FsError::PermissionDenied(_) => libc::EACCES,
            FsError::NotADirectory(_) => libc::ENOTDIR,
            FsError::NotAFile(_) => libc::EISDIR,
            FsError::IoError(e) => e.raw_os_error().unwrap_or(libc::EIO),
            FsError::AlreadyExists(_) => libc::EEXIST,
            FsError::NotEmpty(_) => libc::ENOTEMPTY,
            FsError::NameTooLong { .. } => libc::ENAMETOOLONG,
            FsError::PathTooLong(_) => libc::ENAMETOOLONG,
            FsError::InvalidName(_) => libc::EINVAL,
        }
    }
}

impl From<&NetworkError> for i32 {
    fn from(e: &NetworkError) -> i32 {
        match e {
            NetworkError::Timeout(_) => libc::ETIMEDOUT,
            NetworkError::PeerDisconnected => libc::ENOTCONN,
            _ => libc::EIO,  // Default to I/O error
        }
    }
}

impl From<&LockError> for i32 {
    fn from(e: &LockError) -> i32 {
        match e {
            LockError::NotHeld => libc::ENOLCK,
            LockError::Expired => libc::ENOLCK,
            LockError::Conflict { .. } => libc::EAGAIN,
            LockError::Timeout => libc::ETIMEDOUT,
        }
    }
}
```

### FUSE Callback Error Handling Pattern

```rust
impl Filesystem for WormholeFs {
    fn read(
        &mut self,
        _req: &Request<'_>,
        ino: u64,
        _fh: u64,
        offset: i64,
        size: u32,
        _flags: i32,
        _lock_owner: Option<u64>,
        reply: ReplyData,
    ) {
        // Never panic in FUSE callbacks!
        match self.do_read(ino, offset as u64, size) {
            Ok(data) => reply.data(&data),
            Err(e) => {
                // Log error with context
                tracing::warn!(
                    inode = ino,
                    offset = offset,
                    size = size,
                    error = ?e,
                    "read failed"
                );
                // Map to errno
                let errno = match &e {
                    WormholeError::Fs(fe) => i32::from(fe),
                    WormholeError::Network(ne) => i32::from(ne),
                    WormholeError::Protocol(pe) => libc::EIO,
                    _ => libc::EIO,
                };
                reply.error(errno);
            }
        }
    }

    fn getattr(&mut self, _req: &Request<'_>, ino: u64, reply: ReplyAttr) {
        match self.do_getattr(ino) {
            Ok(attr) => {
                let ttl = Duration::from_secs(1);
                reply.attr(&ttl, &attr);
            }
            Err(e) => {
                tracing::debug!(inode = ino, error = ?e, "getattr failed");
                reply.error(libc::ENOENT);
            }
        }
    }
}
```

### Operations That Must Not Fail

```rust
/// These FUSE operations should never return an error
/// (or kernel may misbehave)

fn init(&mut self, _req: &Request<'_>, _config: &mut KernelConfig) -> Result<(), c_int> {
    // Always succeed - kernel expects this
    Ok(())
}

fn destroy(&mut self) {
    // Best-effort cleanup, no error return
    let _ = self.cleanup();
}

fn forget(&mut self, _req: &Request<'_>, ino: u64, nlookup: u64) {
    // Best-effort, no reply expected
    self.vfs.forget(ino, nlookup);
}
```

---

## 4. Network Error Handling

### Connection Errors

```rust
/// Handle connection-level errors
async fn handle_connection_error(&self, error: quinn::ConnectionError) -> Action {
    match error {
        quinn::ConnectionError::ConnectionClosed(frame) => {
            tracing::info!(reason = ?frame.reason, "connection closed by peer");
            Action::Reconnect
        }
        quinn::ConnectionError::ApplicationClosed(frame) => {
            tracing::info!(reason = ?frame.reason, "application closed connection");
            Action::Stop
        }
        quinn::ConnectionError::Reset => {
            tracing::warn!("connection reset");
            Action::Reconnect
        }
        quinn::ConnectionError::TimedOut => {
            tracing::warn!("connection timed out");
            Action::Reconnect
        }
        quinn::ConnectionError::TransportError(e) => {
            tracing::error!(error = ?e, "transport error");
            Action::ReconnectWithBackoff
        }
        quinn::ConnectionError::LocallyClosed => {
            Action::Stop
        }
        _ => {
            tracing::error!(error = ?error, "unknown connection error");
            Action::ReconnectWithBackoff
        }
    }
}

enum Action {
    /// Continue normally
    Continue,
    /// Reconnect immediately
    Reconnect,
    /// Reconnect with exponential backoff
    ReconnectWithBackoff,
    /// Stop, don't reconnect
    Stop,
}
```

### Stream Errors

```rust
/// Handle stream-level errors
async fn handle_stream_error(&self, error: quinn::ReadError) -> StreamAction {
    match error {
        quinn::ReadError::Reset(code) => {
            tracing::debug!(code = code.into_inner(), "stream reset");
            StreamAction::Retry
        }
        quinn::ReadError::ConnectionLost(e) => {
            tracing::warn!(error = ?e, "connection lost during read");
            StreamAction::ConnectionError(e)
        }
        quinn::ReadError::UnknownStream => {
            tracing::error!("unknown stream");
            StreamAction::Fatal
        }
        quinn::ReadError::IllegalOrderedRead => {
            tracing::error!("illegal ordered read");
            StreamAction::Fatal
        }
        quinn::ReadError::ZeroRttRejected => {
            tracing::info!("0-RTT rejected, retrying");
            StreamAction::Retry
        }
    }
}

enum StreamAction {
    /// Retry the operation
    Retry,
    /// Stream is broken, fail this request
    Fail,
    /// Connection is broken
    ConnectionError(quinn::ConnectionError),
    /// Unrecoverable, bug in our code
    Fatal,
}
```

---

## 5. Recovery Strategies

### Automatic Recovery Matrix

| Error Type | Recovery Strategy |
|------------|-------------------|
| Timeout | Retry with backoff (3 attempts) |
| Connection lost | Reconnect with backoff |
| Stream reset | Retry immediately (1 attempt) |
| Checksum mismatch | Retry immediately (3 attempts) |
| Rate limited | Wait and retry |
| Auth failed | Do not retry, notify user |
| Protocol error | Do not retry, log and notify |
| Disk full | Evict cache, retry once |
| Lock conflict | Wait or fail based on timeout |

### Recovery Implementation

```rust
/// Automatic retry with exponential backoff
pub async fn with_retry<T, E, F, Fut>(
    operation: F,
    policy: RetryPolicy,
) -> Result<T, E>
where
    F: Fn() -> Fut,
    Fut: Future<Output = Result<T, E>>,
    E: std::error::Error,
{
    let mut attempt = 0;
    let mut delay = policy.initial_delay;

    loop {
        match operation().await {
            Ok(result) => return Ok(result),
            Err(e) if attempt < policy.max_retries && policy.should_retry(&e) => {
                attempt += 1;
                tracing::warn!(
                    attempt = attempt,
                    max = policy.max_retries,
                    delay = ?delay,
                    error = ?e,
                    "retrying operation"
                );
                tokio::time::sleep(delay).await;
                delay = std::cmp::min(
                    Duration::from_millis((delay.as_millis() as f64 * policy.multiplier) as u64),
                    policy.max_delay,
                );
            }
            Err(e) => return Err(e),
        }
    }
}

pub struct RetryPolicy {
    pub max_retries: u32,
    pub initial_delay: Duration,
    pub max_delay: Duration,
    pub multiplier: f64,
    pub retryable_errors: Vec<ErrorKind>,
}

impl Default for RetryPolicy {
    fn default() -> Self {
        Self {
            max_retries: 3,
            initial_delay: Duration::from_millis(100),
            max_delay: Duration::from_secs(10),
            multiplier: 2.0,
            retryable_errors: vec![
                ErrorKind::Timeout,
                ErrorKind::ConnectionReset,
                ErrorKind::ChecksumMismatch,
            ],
        }
    }
}
```

### Cache Miss Recovery

```rust
/// Handle cache misses with fallback chain
async fn read_with_fallback(&self, chunk_id: &ChunkId) -> Result<Arc<Vec<u8>>, FsError> {
    // Try L1 cache (RAM)
    if let Some(data) = self.l1_cache.get(chunk_id) {
        return Ok(data);
    }

    // Try L2 cache (disk)
    if let Some(data) = self.l2_cache.get(chunk_id).await {
        // Promote to L1
        self.l1_cache.insert(chunk_id.clone(), Arc::new(data.clone()));
        return Ok(Arc::new(data));
    }

    // Fetch from network
    let data = self.fetch_from_network(chunk_id).await?;

    // Store in both caches
    self.l1_cache.insert(chunk_id.clone(), data.clone());
    self.l2_cache.put(chunk_id.clone(), &data).await;

    Ok(data)
}
```

---

## 6. Retry Policies

### Per-Operation Policies

```rust
/// Retry policies by operation type
pub fn retry_policy_for(op: &Operation) -> RetryPolicy {
    match op {
        // Metadata operations: quick retry
        Operation::GetAttr | Operation::ListDir => RetryPolicy {
            max_retries: 2,
            initial_delay: Duration::from_millis(50),
            max_delay: Duration::from_millis(500),
            multiplier: 2.0,
            ..Default::default()
        },

        // Read operations: more retries
        Operation::ReadChunk => RetryPolicy {
            max_retries: 3,
            initial_delay: Duration::from_millis(100),
            max_delay: Duration::from_secs(5),
            multiplier: 2.0,
            ..Default::default()
        },

        // Write operations: careful retry
        Operation::WriteChunk => RetryPolicy {
            max_retries: 2,
            initial_delay: Duration::from_millis(200),
            max_delay: Duration::from_secs(2),
            multiplier: 1.5,
            ..Default::default()
        },

        // Lock operations: no retry (handled by lock timeout)
        Operation::AcquireLock | Operation::ReleaseLock => RetryPolicy {
            max_retries: 0,
            ..Default::default()
        },
    }
}
```

### Circuit Breaker

```rust
/// Circuit breaker to prevent cascading failures
pub struct CircuitBreaker {
    state: AtomicU8,
    failure_count: AtomicU32,
    last_failure: AtomicU64,
    config: CircuitBreakerConfig,
}

#[derive(Clone, Copy)]
pub struct CircuitBreakerConfig {
    /// Failures before opening circuit
    pub failure_threshold: u32,
    /// Time before trying again
    pub reset_timeout: Duration,
    /// Successful requests to close circuit
    pub success_threshold: u32,
}

impl CircuitBreaker {
    /// Check if request should be allowed
    pub fn allow_request(&self) -> bool {
        match self.state.load(Ordering::SeqCst).into() {
            CircuitState::Closed => true,
            CircuitState::Open => {
                // Check if reset timeout passed
                let last = self.last_failure.load(Ordering::SeqCst);
                let elapsed = Instant::now().duration_since(/* from last */);
                if elapsed > self.config.reset_timeout {
                    self.state.store(CircuitState::HalfOpen as u8, Ordering::SeqCst);
                    true
                } else {
                    false
                }
            }
            CircuitState::HalfOpen => true,  // Allow one request
        }
    }

    /// Record success
    pub fn record_success(&self) {
        self.failure_count.store(0, Ordering::SeqCst);
        self.state.store(CircuitState::Closed as u8, Ordering::SeqCst);
    }

    /// Record failure
    pub fn record_failure(&self) {
        let failures = self.failure_count.fetch_add(1, Ordering::SeqCst) + 1;
        self.last_failure.store(/* now */, Ordering::SeqCst);

        if failures >= self.config.failure_threshold {
            self.state.store(CircuitState::Open as u8, Ordering::SeqCst);
        }
    }
}
```

---

## 7. Error Logging

### Structured Logging

```rust
/// Log errors with full context
fn log_error(error: &WormholeError, context: &ErrorContext) {
    match error.severity() {
        Severity::Debug => tracing::debug!(
            error = ?error,
            context = ?context,
            "operation failed (debug)"
        ),
        Severity::Info => tracing::info!(
            error = %error,
            context = ?context,
            "operation failed"
        ),
        Severity::Warn => tracing::warn!(
            error = %error,
            context = ?context,
            recoverable = error.is_recoverable(),
            "operation failed"
        ),
        Severity::Error => tracing::error!(
            error = %error,
            context = ?context,
            backtrace = ?error.backtrace(),
            "operation failed"
        ),
    }
}

pub struct ErrorContext {
    pub operation: &'static str,
    pub inode: Option<u64>,
    pub path: Option<String>,
    pub peer: Option<String>,
    pub request_id: Option<u64>,
}

impl WormholeError {
    pub fn severity(&self) -> Severity {
        match self {
            // Expected conditions
            WormholeError::Fs(FsError::NotFound(_)) => Severity::Debug,
            WormholeError::Cache(CacheError::Miss(_)) => Severity::Debug,
            WormholeError::Lock(LockError::Conflict { .. }) => Severity::Debug,

            // Transient issues
            WormholeError::Network(NetworkError::Timeout(_)) => Severity::Warn,
            WormholeError::Network(NetworkError::PeerDisconnected) => Severity::Warn,

            // Potential problems
            WormholeError::Protocol(_) => Severity::Error,
            WormholeError::Cache(CacheError::CorruptedEntry(_)) => Severity::Error,

            // Default
            _ => Severity::Warn,
        }
    }

    pub fn is_recoverable(&self) -> bool {
        match self {
            WormholeError::Network(NetworkError::Timeout(_)) => true,
            WormholeError::Network(NetworkError::PeerDisconnected) => true,
            WormholeError::Cache(CacheError::Miss(_)) => true,
            WormholeError::Lock(LockError::Timeout) => true,
            WormholeError::Protocol(ProtocolError::ChecksumMismatch { .. }) => true,
            _ => false,
        }
    }
}
```

### Error Metrics

```rust
/// Prometheus metrics for errors
pub struct ErrorMetrics {
    pub errors_total: IntCounterVec,  // Labels: error_type, recoverable
    pub recovery_attempts: IntCounterVec,  // Labels: error_type, outcome
    pub circuit_breaker_state: IntGaugeVec,  // Labels: endpoint
}

impl ErrorMetrics {
    pub fn record_error(&self, error: &WormholeError) {
        self.errors_total
            .with_label_values(&[
                error.type_name(),
                &error.is_recoverable().to_string(),
            ])
            .inc();
    }

    pub fn record_recovery(&self, error_type: &str, success: bool) {
        self.recovery_attempts
            .with_label_values(&[
                error_type,
                if success { "success" } else { "failure" },
            ])
            .inc();
    }
}
```

---

## 8. User-Facing Errors

### Error Messages

```rust
/// Convert internal errors to user-friendly messages
impl WormholeError {
    pub fn user_message(&self) -> String {
        match self {
            WormholeError::Network(NetworkError::ConnectionFailed(_)) =>
                "Could not connect to the host. Check the join code and try again.".into(),

            WormholeError::Network(NetworkError::Timeout(_)) =>
                "Connection timed out. The host may be offline or unreachable.".into(),

            WormholeError::Network(NetworkError::AuthFailed(_)) =>
                "Invalid join code. Please check and try again.".into(),

            WormholeError::Network(NetworkError::NatTraversalFailed) =>
                "Could not establish a direct connection. Both devices may be behind strict firewalls.".into(),

            WormholeError::Fs(FsError::NotFound(_)) =>
                "File or folder not found.".into(),

            WormholeError::Fs(FsError::PermissionDenied(_)) =>
                "Permission denied. The host may have restricted access.".into(),

            WormholeError::Lock(LockError::Conflict { holder }) =>
                format!("File is locked by {}. Please try again later.", holder),

            WormholeError::Cache(CacheError::DiskFull) =>
                "Cache disk is full. Free up space or reduce cache size in settings.".into(),

            _ => "An unexpected error occurred. Please try again.".into(),
        }
    }

    pub fn action_hint(&self) -> Option<String> {
        match self {
            WormholeError::Network(NetworkError::ConnectionFailed(_)) =>
                Some("Verify the join code and ensure the host is sharing.".into()),

            WormholeError::Network(NetworkError::NatTraversalFailed) =>
                Some("Try connecting on the same network, or ask IT to allow UDP traffic.".into()),

            WormholeError::Cache(CacheError::DiskFull) =>
                Some("Go to Settings → Cache → Clear Cache".into()),

            _ => None,
        }
    }
}
```

### Error Codes for API/CLI

```rust
/// Exit codes for CLI
pub enum ExitCode {
    Success = 0,
    GeneralError = 1,
    ConnectionFailed = 2,
    AuthFailed = 3,
    NotFound = 4,
    PermissionDenied = 5,
    Timeout = 6,
    ConfigError = 7,
}

impl From<&WormholeError> for ExitCode {
    fn from(e: &WormholeError) -> Self {
        match e {
            WormholeError::Network(NetworkError::ConnectionFailed(_)) => ExitCode::ConnectionFailed,
            WormholeError::Network(NetworkError::AuthFailed(_)) => ExitCode::AuthFailed,
            WormholeError::Network(NetworkError::Timeout(_)) => ExitCode::Timeout,
            WormholeError::Fs(FsError::NotFound(_)) => ExitCode::NotFound,
            WormholeError::Fs(FsError::PermissionDenied(_)) => ExitCode::PermissionDenied,
            WormholeError::Config(_) => ExitCode::ConfigError,
            _ => ExitCode::GeneralError,
        }
    }
}
```

### Error Response Format (API)

```rust
/// JSON error response for Tauri/API
#[derive(Serialize)]
pub struct ErrorResponse {
    /// Machine-readable error code
    pub code: String,

    /// Human-readable message
    pub message: String,

    /// Suggested action (optional)
    pub action: Option<String>,

    /// Can the user retry?
    pub recoverable: bool,

    /// Retry after (if rate limited)
    pub retry_after_ms: Option<u64>,
}

impl From<WormholeError> for ErrorResponse {
    fn from(e: WormholeError) -> Self {
        Self {
            code: e.code().to_string(),
            message: e.user_message(),
            action: e.action_hint(),
            recoverable: e.is_recoverable(),
            retry_after_ms: e.retry_after().map(|d| d.as_millis() as u64),
        }
    }
}
```
