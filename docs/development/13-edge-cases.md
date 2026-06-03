# Edge Cases Specification

This document defines how Wormhole handles edge cases, boundary conditions, and unusual scenarios.

---

## Table of Contents

1. [File System Edge Cases](#1-file-system-edge-cases)
2. [Network Edge Cases](#2-network-edge-cases)
3. [Concurrency Edge Cases](#3-concurrency-edge-cases)
4. [Cache Edge Cases](#4-cache-edge-cases)
5. [Platform Edge Cases](#5-platform-edge-cases)
6. [Security Edge Cases](#6-security-edge-cases)
7. [Resource Limits](#7-resource-limits)

---

## 1. File System Edge Cases

### Empty Files

**Scenario:** File with size 0 bytes.

```rust
/// Empty files have no chunks but valid metadata
fn handle_empty_file(inode: u64) -> FileAttr {
    FileAttr {
        inode,
        file_type: FileType::File,
        size: 0,
        // Other attrs...
    }
}

/// Read from empty file returns empty data
fn read_empty_file(offset: u64, size: u32) -> Vec<u8> {
    Vec::new()  // Always empty, regardless of offset/size
}
```

**Behavior:**
- `getattr`: Returns size=0
- `read`: Returns empty data for any offset/size
- `open`: Succeeds normally
- Cache: No chunks stored (nothing to cache)

### Very Large Files

**Scenario:** Files larger than 4GB (u32::MAX) or approaching u64::MAX.

```rust
/// Maximum supported file size
pub const MAX_FILE_SIZE: u64 = u64::MAX - CHUNK_SIZE as u64;

/// Validate file size
fn validate_file_size(size: u64) -> Result<(), FsError> {
    if size > MAX_FILE_SIZE {
        return Err(FsError::FileTooLarge { size, max: MAX_FILE_SIZE });
    }
    Ok(())
}

/// Calculate chunk count safely
fn chunk_count(size: u64) -> u64 {
    if size == 0 {
        0
    } else {
        (size - 1) / CHUNK_SIZE as u64 + 1
    }
}
```

**Behavior:**
- Theoretical max: ~16 exabytes (u64 limit)
- Practical max: Limited by disk/network
- Chunk indices: u64, no overflow risk
- Tested with: 1TB files

### Empty Directories

**Scenario:** Directory with no children.

```rust
/// Empty directory vs non-existent
fn readdir_empty(inode: u64) -> ReaddirResult {
    // Empty directory returns . and .. only
    ReaddirResult {
        entries: vec![
            DirEntry::new(".", inode, FileType::Directory),
            DirEntry::new("..", parent_inode, FileType::Directory),
        ],
        has_more: false,
    }
}
```

**Behavior:**
- `readdir`: Returns `.` and `..` entries only
- `getattr`: Returns with size=0 (or platform convention)
- Distinguishable from "not found" by successful `lookup`

### Directories with Many Files

**Scenario:** Directory containing 10,000+ files.

```rust
/// Paginated directory listing
const READDIR_BATCH_SIZE: u32 = 1000;

fn readdir_paginated(inode: u64, offset: u64) -> ReaddirResult {
    let entries = get_entries(inode);

    if offset as usize >= entries.len() {
        return ReaddirResult { entries: vec![], has_more: false };
    }

    let end = std::cmp::min(
        offset as usize + READDIR_BATCH_SIZE as usize,
        entries.len()
    );

    ReaddirResult {
        entries: entries[offset as usize..end].to_vec(),
        has_more: end < entries.len(),
    }
}
```

**Behavior:**
- Pagination: 1000 entries per request
- Memory: Stream entries, don't load all at once
- Cache: Cache directory listing, invalidate on change
- Tested with: 100,000 files

### Long File Names

**Scenario:** Filenames at or exceeding limits.

```rust
/// Maximum filename length (bytes, UTF-8)
pub const MAX_FILENAME_LEN: usize = 255;

/// Maximum path length (bytes)
pub const MAX_PATH_LEN: usize = 4096;

fn validate_filename(name: &str) -> Result<(), FsError> {
    let len = name.len();
    if len == 0 {
        return Err(FsError::InvalidName("empty filename".into()));
    }
    if len > MAX_FILENAME_LEN {
        return Err(FsError::NameTooLong {
            name: name[..50].into(),
            len,
            max: MAX_FILENAME_LEN,
        });
    }
    // Check for invalid characters
    if name.contains('/') || name.contains('\0') {
        return Err(FsError::InvalidName(name.into()));
    }
    Ok(())
}

fn validate_path(path: &str) -> Result<(), FsError> {
    if path.len() > MAX_PATH_LEN {
        return Err(FsError::PathTooLong(path[..50].into()));
    }
    // Validate each component
    for component in path.split('/') {
        if !component.is_empty() {
            validate_filename(component)?;
        }
    }
    Ok(())
}
```

**Behavior:**
- Max filename: 255 bytes (UTF-8)
- Max path: 4096 bytes
- Exceeding: Return `ENAMETOOLONG`
- Unicode: Counted in bytes, not characters

### Special Characters in Names

**Scenario:** Filenames with unicode, spaces, or special characters.

```rust
/// Allowed filename characters
fn is_valid_filename_char(c: char) -> bool {
    // Disallow control characters and path separators
    !c.is_control() && c != '/' && c != '\0'
}

/// Windows-specific restrictions
#[cfg(target_os = "windows")]
fn is_valid_filename_windows(name: &str) -> bool {
    // Reserved characters on Windows
    const RESERVED: &[char] = &['<', '>', ':', '"', '/', '\\', '|', '?', '*'];
    const RESERVED_NAMES: &[&str] = &[
        "CON", "PRN", "AUX", "NUL",
        "COM1", "COM2", "COM3", "COM4",
        "LPT1", "LPT2", "LPT3", "LPT4",
    ];

    !name.chars().any(|c| RESERVED.contains(&c))
        && !RESERVED_NAMES.contains(&name.to_uppercase().as_str())
}
```

**Behavior:**
- Unicode: Fully supported (UTF-8)
- Spaces: Allowed
- Dots: Allowed (including leading dots)
- Platform-specific: Validated per OS

### Symbolic Links

**Scenario:** Symlinks in shared directory.

```rust
/// Symlink handling mode
pub enum SymlinkMode {
    /// Skip symlinks entirely
    Skip,
    /// Follow symlinks (resolve to target)
    Follow,
    /// Preserve as symlinks
    Preserve,
}

fn handle_symlink(path: &Path, mode: SymlinkMode) -> Option<ScanEntry> {
    match mode {
        SymlinkMode::Skip => {
            tracing::debug!(path = ?path, "skipping symlink");
            None
        }
        SymlinkMode::Follow => {
            // Resolve and check if within root
            match path.canonicalize() {
                Ok(target) if target.starts_with(&root) => {
                    Some(scan_path(&target))
                }
                Ok(_) => {
                    tracing::warn!(path = ?path, "symlink escapes root, skipping");
                    None
                }
                Err(e) => {
                    tracing::warn!(path = ?path, error = ?e, "broken symlink");
                    None
                }
            }
        }
        SymlinkMode::Preserve => {
            // Return symlink metadata (Phase 7+)
            Some(ScanEntry::Symlink { path: path.into(), target: read_link(path)? })
        }
    }
}
```

**Behavior:**
- Default: Skip symlinks (security)
- Follow mode: Resolve but stay within root
- Escape attempts: Log and skip
- Broken symlinks: Skip with warning

### Files That Change During Read

**Scenario:** File modified on host while client is reading.

```rust
/// Detect stale reads
fn read_with_version_check(
    chunk_id: &ChunkId,
    expected_mtime: u64,
) -> Result<Vec<u8>, FsError> {
    let data = fetch_chunk(chunk_id)?;
    let current_mtime = get_attr(chunk_id.inode)?.mtime;

    if current_mtime != expected_mtime {
        // File changed, invalidate cache
        invalidate_inode(chunk_id.inode);
        return Err(FsError::StaleData);
    }

    Ok(data)
}
```

**Behavior:**
- Detection: Compare mtime before/after read
- On change: Invalidate cache, retry
- Notification: Host can push invalidation messages
- Consistency: Eventual consistency (not strict)

### Files Deleted During Read

**Scenario:** File deleted on host while client has open handle.

```rust
/// Handle deleted file with open handles
fn handle_deleted_file(inode: u64) {
    // Mark as orphan
    if let Some(entry) = vfs.get_mut(inode) {
        entry.state = InodeState::Orphan;
    }

    // Allow existing handles to complete
    // New operations will fail with ENOENT/ESTALE
}

fn read_orphan_file(inode: u64, offset: u64, size: u32) -> Result<Vec<u8>, i32> {
    // Try to serve from cache
    if let Some(cached) = cache.get_range(inode, offset, size) {
        return Ok(cached);
    }

    // No cache, file is gone
    Err(libc::ESTALE)
}
```

**Behavior:**
- Existing handles: Continue working (from cache)
- New opens: Fail with `ENOENT`
- Cached data: Served until evicted
- Network fetch: Fails with `ESTALE`

---

## 2. Network Edge Cases

### Connection Lost Mid-Transfer

**Scenario:** Network drops during large file read.

```rust
/// Resumable read with chunk tracking
struct ResumableRead {
    inode: u64,
    total_size: u64,
    chunks_received: HashSet<u64>,
    last_offset: u64,
}

impl ResumableRead {
    fn resume(&mut self, connection: &Connection) -> Result<(), NetworkError> {
        // Request only missing chunks
        let missing: Vec<_> = (0..self.chunk_count())
            .filter(|i| !self.chunks_received.contains(i))
            .collect();

        for chunk_idx in missing {
            let data = connection.request_chunk(self.inode, chunk_idx)?;
            self.chunks_received.insert(chunk_idx);
        }

        Ok(())
    }
}
```

**Behavior:**
- Resume: Request only missing chunks
- Retry: 3 attempts with backoff
- Fallback: Serve partial from cache if available
- User: Show reconnecting state

### Very High Latency

**Scenario:** Network latency >1 second.

```rust
/// Adaptive timeout based on RTT
fn adaptive_timeout(rtt: Duration) -> Duration {
    // Timeout = 3 * RTT + margin
    let base = rtt * 3;
    let margin = Duration::from_secs(5);
    std::cmp::min(base + margin, Duration::from_secs(60))
}

/// Prefetch more aggressively on high latency
fn prefetch_distance(rtt: Duration) -> usize {
    if rtt < Duration::from_millis(50) {
        2  // LAN: small prefetch
    } else if rtt < Duration::from_millis(200) {
        4  // WAN: medium prefetch
    } else {
        8  // High latency: aggressive prefetch
    }
}
```

**Behavior:**
- Timeouts: Scale with measured RTT
- Prefetch: More aggressive on high latency
- Batching: Combine multiple requests
- UI: Show latency indicator

### Host Goes Offline

**Scenario:** Host machine shuts down or loses network.

```rust
/// Offline detection
async fn detect_offline(connection: &Connection) -> bool {
    // Ping timeout = offline
    match timeout(Duration::from_secs(10), connection.ping()).await {
        Ok(Ok(_)) => false,  // Online
        _ => true,           // Offline
    }
}

/// Graceful degradation to cache
fn handle_offline() {
    // Switch to offline mode
    set_state(ConnectionState::Offline);

    // Serve from cache
    enable_cache_only_mode();

    // Notify user
    notify("Host is offline. Cached files are available.");

    // Start reconnection loop
    spawn_reconnect_loop();
}
```

**Behavior:**
- Detection: Ping timeout (10s no response)
- Cache mode: Serve cached files only
- New files: Return `ETIMEDOUT` or `ENETUNREACH`
- Reconnect: Automatic with backoff

### Multiple Simultaneous Connections

**Scenario:** Same folder mounted on multiple clients.

```rust
/// Connection tracking
struct ClientRegistry {
    clients: RwLock<HashMap<ClientId, ClientInfo>>,
    max_clients: usize,
}

impl ClientRegistry {
    fn accept(&self, client: ClientInfo) -> Result<(), HostError> {
        let mut clients = self.clients.write();

        if clients.len() >= self.max_clients {
            return Err(HostError::TooManyClients);
        }

        clients.insert(client.id, client);
        Ok(())
    }
}
```

**Behavior:**
- Max clients: Configurable (default 100)
- Resource sharing: Fair queuing per client
- Conflict: See "Concurrent Write" below
- Notification: Clients see peer count

---

## 3. Concurrency Edge Cases

### Concurrent Read Same File

**Scenario:** Multiple clients reading same file simultaneously.

```rust
/// Shared chunk with reference counting
fn read_chunk_shared(chunk_id: &ChunkId) -> Arc<Vec<u8>> {
    // Single in-flight request per chunk
    let pending = pending_requests.entry(chunk_id.clone());

    match pending {
        Entry::Occupied(entry) => {
            // Wait for existing request
            entry.get().subscribe().recv().await
        }
        Entry::Vacant(entry) => {
            // Start new request
            let (tx, _) = broadcast::channel(1);
            entry.insert(tx.clone());

            let data = fetch_chunk(chunk_id).await?;
            tx.send(Arc::new(data)).ok();
            // ...
        }
    }
}
```

**Behavior:**
- Deduplication: Single network request per chunk
- Sharing: All clients get same cached data
- Consistency: All see same version (within TTL)

### Concurrent Write Same File (Phase 7)

**Scenario:** Two clients try to write same file.

```rust
/// Exclusive lock for writes
async fn write_with_lock(
    inode: u64,
    data: &[u8],
) -> Result<(), WriteError> {
    // Acquire exclusive lock
    let lock = acquire_lock(inode, LockType::Exclusive).await?;

    match lock {
        LockResult::Granted(token) => {
            // Perform write
            do_write(inode, data, &token).await?;
            release_lock(token).await?;
            Ok(())
        }
        LockResult::Conflict { holder } => {
            Err(WriteError::Conflict { holder })
        }
    }
}
```

**Behavior:**
- Locking: Mandatory exclusive lock for writes
- Conflict: Second writer gets error
- Resolution: First-come-first-served
- User: Show "File locked by [user]"

### Rename During Read

**Scenario:** Parent directory renamed while file is being read.

```rust
/// Handle path change
fn handle_rename(old_path: &Path, new_path: &Path) {
    // Update VFS mapping
    if let Some(inode) = vfs.path_to_inode(old_path) {
        let mut entry = vfs.get_mut(inode);
        entry.path = new_path.to_path_buf();
        vfs.update_path_index(old_path, new_path, inode);
    }

    // Cache remains valid (keyed by inode, not path)
}
```

**Behavior:**
- Inode stable: Reads continue working
- Path update: VFS mapping updated
- Cache valid: Keyed by inode
- New lookups: Use new path

---

## 4. Cache Edge Cases

### Cache Full

**Scenario:** L1 or L2 cache reaches capacity.

```rust
/// Eviction under pressure
fn evict_for_space(needed: usize) -> bool {
    let mut freed = 0;

    // Sort by eviction score (LRU-K)
    let mut candidates: Vec<_> = entries.iter().collect();
    candidates.sort_by(|a, b| a.score().partial_cmp(&b.score()).unwrap());

    for (chunk_id, entry) in candidates {
        if freed >= needed {
            break;
        }
        freed += entry.size;
        evict(chunk_id);
    }

    freed >= needed
}
```

**Behavior:**
- L1 full: Evict LRU entries
- L2 full: Evict oldest entries, warn user
- Emergency: Drop prefetch data first
- Notification: "Cache full" in logs

### Cache Corruption

**Scenario:** Cached data doesn't match checksum.

```rust
/// Verify cached chunk
fn verify_chunk(chunk_id: &ChunkId, data: &[u8], expected: &[u8; 32]) -> bool {
    let actual = blake3::hash(data);
    actual.as_bytes() == expected
}

/// Handle corruption
fn handle_corrupt_chunk(chunk_id: &ChunkId) {
    tracing::error!(chunk = ?chunk_id, "cache corruption detected");

    // Remove corrupted entry
    l1_cache.remove(chunk_id);
    l2_cache.remove(chunk_id);

    // Increment corruption counter
    metrics.cache_corruptions.inc();

    // Refetch from network
    // (caller will retry)
}
```

**Behavior:**
- Detection: Checksum verification on read
- Recovery: Remove corrupted entry, refetch
- Logging: Error-level log
- Metrics: Track corruption rate

### Disk Full (L2)

**Scenario:** Disk runs out of space for cache.

```rust
/// Handle disk full
async fn handle_disk_full() -> CacheAction {
    // Try emergency eviction
    let freed = emergency_evict(1024 * 1024 * 100).await;  // 100MB

    if freed > 0 {
        tracing::warn!(freed = freed, "emergency cache eviction");
        CacheAction::Retry
    } else {
        // Disable L2 cache
        tracing::error!("disk full, disabling L2 cache");
        CacheAction::DisableL2
    }
}

/// Emergency eviction
async fn emergency_evict(target: u64) -> u64 {
    let mut freed = 0;

    // Delete oldest first (faster than LRU scan)
    let oldest = index.query("SELECT * FROM chunks ORDER BY accessed_at LIMIT 1000")?;

    for entry in oldest {
        if freed >= target {
            break;
        }
        freed += entry.size;
        remove_chunk(&entry.path).await;
        index.delete(entry.chunk_id);
    }

    freed
}
```

**Behavior:**
- Detection: Write fails with `ENOSPC`
- Recovery: Emergency eviction
- Fallback: Disable L2, L1 only
- User: Notify "Disk full"

---

## 5. Platform Edge Cases

### macOS: System Integrity Protection

**Scenario:** Mounting in protected locations.

```rust
/// Check if path is SIP protected
#[cfg(target_os = "macos")]
fn is_sip_protected(path: &Path) -> bool {
    const PROTECTED: &[&str] = &[
        "/System",
        "/usr",
        "/bin",
        "/sbin",
        "/var",
    ];

    PROTECTED.iter().any(|p| path.starts_with(p))
}

/// Suggest alternative
fn suggest_mount_point() -> PathBuf {
    // Safe locations
    let candidates = [
        dirs::home_dir().map(|h| h.join("Wormhole")),
        Some(PathBuf::from("/Volumes/Wormhole")),
        Some(PathBuf::from("/tmp/wormhole")),
    ];

    candidates.into_iter()
        .flatten()
        .find(|p| !is_sip_protected(p))
        .unwrap_or_else(|| PathBuf::from("/tmp/wormhole"))
}
```

**Behavior:**
- Detection: Check path before mount
- Error: Clear message about SIP
- Suggestion: Offer alternative location

### Windows: Drive Letter Conflicts

**Scenario:** Requested drive letter already in use.

```rust
/// Find available drive letter
#[cfg(target_os = "windows")]
fn find_available_drive() -> Option<char> {
    let used: HashSet<char> = get_logical_drives();

    // Prefer W for "Wormhole"
    if !used.contains(&'W') {
        return Some('W');
    }

    // Try Z, Y, X... down to D
    ('D'..='Z').rev().find(|c| !used.contains(c))
}
```

**Behavior:**
- Preferred: W: drive
- Fallback: First available from Z: down
- Error: "No drive letters available"

### Linux: FUSE Permissions

**Scenario:** User not in fuse group.

```rust
/// Check FUSE permissions
#[cfg(target_os = "linux")]
fn check_fuse_permissions() -> Result<(), SetupError> {
    // Check /dev/fuse access
    let fuse_dev = Path::new("/dev/fuse");
    if !fuse_dev.exists() {
        return Err(SetupError::FuseNotInstalled);
    }

    // Check group membership
    let groups = get_user_groups();
    if !groups.contains("fuse") {
        return Err(SetupError::NotInFuseGroup {
            hint: "Run: sudo usermod -aG fuse $USER".into(),
        });
    }

    Ok(())
}
```

**Behavior:**
- Check: Verify /dev/fuse access
- Error: Clear message with fix instructions
- Auto-fix: Offer to run setup command (with sudo prompt)

---

## 6. Security Edge Cases

### Path Traversal Attempt

**Scenario:** Malicious path like `../../../etc/passwd`.

```rust
/// Strict path validation
fn validate_path_strict(root: &Path, requested: &str) -> Result<PathBuf, SecurityError> {
    // Check for traversal patterns
    if requested.contains("..") {
        return Err(SecurityError::PathTraversal {
            path: requested.into(),
            reason: "contains '..'".into(),
        });
    }

    if requested.starts_with('/') {
        return Err(SecurityError::PathTraversal {
            path: requested.into(),
            reason: "absolute path".into(),
        });
    }

    // Even after joining, verify containment
    let full = root.join(requested);
    let canonical = full.canonicalize()
        .map_err(|_| SecurityError::InvalidPath(requested.into()))?;

    let root_canonical = root.canonicalize()
        .map_err(|_| SecurityError::InvalidPath(root.display().to_string()))?;

    if !canonical.starts_with(&root_canonical) {
        return Err(SecurityError::PathTraversal {
            path: requested.into(),
            reason: "escapes root".into(),
        });
    }

    Ok(canonical)
}
```

**Behavior:**
- Reject: Any path with `..`
- Reject: Absolute paths
- Verify: Final path stays within root
- Log: Security event

### Malformed Protocol Messages

**Scenario:** Invalid or malicious network messages.

```rust
/// Safe deserialization with limits
fn deserialize_message(bytes: &[u8]) -> Result<NetMessage, ProtocolError> {
    // Check size limit
    if bytes.len() > MAX_MESSAGE_SIZE {
        return Err(ProtocolError::MessageTooLarge {
            size: bytes.len(),
            max: MAX_MESSAGE_SIZE,
        });
    }

    // Deserialize with bounds checking
    let config = bincode::options()
        .with_limit(MAX_MESSAGE_SIZE as u64)
        .with_fixint_encoding();

    config.deserialize(bytes)
        .map_err(|e| ProtocolError::Deserialization(e.to_string()))
}

/// Validate message contents
fn validate_message(msg: &NetMessage) -> Result<(), ProtocolError> {
    match msg {
        NetMessage::ListDirResponse(resp) => {
            // Limit entries per response
            if resp.entries.len() > 10_000 {
                return Err(ProtocolError::InvalidMessage(
                    "too many directory entries".into()
                ));
            }
            // Validate each entry
            for entry in &resp.entries {
                validate_filename(&entry.name)?;
            }
            Ok(())
        }
        // ... other variants
        _ => Ok(())
    }
}
```

**Behavior:**
- Size limits: Reject oversized messages
- Validation: Check all fields
- Isolation: Don't crash on bad input
- Logging: Log malformed messages

### Resource Exhaustion Attack

**Scenario:** Client requests excessive resources.

```rust
/// Per-client rate limiting
struct RateLimiter {
    buckets: RwLock<HashMap<ClientId, TokenBucket>>,
    config: RateLimitConfig,
}

struct RateLimitConfig {
    requests_per_second: u32,
    burst_size: u32,
    max_concurrent_requests: u32,
}

impl RateLimiter {
    fn check(&self, client: &ClientId) -> RateLimitResult {
        let mut buckets = self.buckets.write();
        let bucket = buckets.entry(client.clone())
            .or_insert_with(|| TokenBucket::new(&self.config));

        if bucket.try_acquire() {
            RateLimitResult::Allowed
        } else {
            RateLimitResult::Limited {
                retry_after: bucket.time_until_available(),
            }
        }
    }
}
```

**Behavior:**
- Rate limit: Per-client request limits
- Concurrent: Max requests in flight
- Response: 429 with retry-after
- Escalation: Disconnect repeat offenders

---

## 7. Resource Limits

### Memory Limits

| Resource | Limit | Configurable |
|----------|-------|--------------|
| L1 cache | 256 MB (default) | Yes |
| VFS entries | ~10 MB typical | No (scales with files) |
| Pending requests | 100 × chunk size | No |
| Connection buffers | 2 MB per connection | Yes |

### File System Limits

| Resource | Limit | Source |
|----------|-------|--------|
| Max file size | u64::MAX | Protocol |
| Max filename | 255 bytes | OS limit |
| Max path | 4096 bytes | OS limit |
| Max open files | OS limit | ulimit |
| Max inodes | u64::MAX | Protocol |

### Network Limits

| Resource | Limit | Configurable |
|----------|-------|--------------|
| Max clients | 100 | Yes |
| Max streams | 100 per connection | Yes |
| Max message | 1 MB | No |
| Request timeout | 30 seconds | Yes |
| Connection timeout | 60 seconds | Yes |

### Implementation

```rust
/// Enforce all limits
pub struct ResourceLimits {
    pub max_l1_cache: usize,
    pub max_l2_cache: u64,
    pub max_clients: usize,
    pub max_streams: usize,
    pub max_message_size: usize,
    pub max_filename_len: usize,
    pub max_path_len: usize,
}

impl Default for ResourceLimits {
    fn default() -> Self {
        Self {
            max_l1_cache: 256 * 1024 * 1024,
            max_l2_cache: 10 * 1024 * 1024 * 1024,
            max_clients: 100,
            max_streams: 100,
            max_message_size: 1024 * 1024,
            max_filename_len: 255,
            max_path_len: 4096,
        }
    }
}
```
