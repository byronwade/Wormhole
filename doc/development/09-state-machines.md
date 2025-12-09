# State Machines Specification

This document defines the formal state machines for all stateful components in Wormhole.

---

## Table of Contents

1. [Connection State Machine](#1-connection-state-machine)
2. [Lock State Machine](#2-lock-state-machine)
3. [Cache Entry State Machine](#3-cache-entry-state-machine)
4. [Inode Lifecycle State Machine](#4-inode-lifecycle-state-machine)
5. [Write Transaction State Machine](#5-write-transaction-state-machine)
6. [Host Session State Machine](#6-host-session-state-machine)
7. [NAT Traversal State Machine](#7-nat-traversal-state-machine)

---

## 1. Connection State Machine

### States

```
┌─────────────┐
│ Disconnected│ ◄────────────────────────────────────┐
└──────┬──────┘                                      │
       │ connect()                                   │
       ▼                                             │
┌─────────────┐                                      │
│ Connecting  │ ─── timeout/error ───────────────────┤
└──────┬──────┘                                      │
       │ TCP/QUIC established                        │
       ▼                                             │
┌─────────────┐                                      │
│Authenticating│ ─── auth_failed ───────────────────┤
└──────┬──────┘                                      │
       │ HelloAck received                           │
       ▼                                             │
┌─────────────┐                                      │
│   Ready     │ ◄─── reconnected ───┐               │
└──────┬──────┘                     │               │
       │ connection_lost            │               │
       ▼                            │               │
┌─────────────┐                     │               │
│Reconnecting │ ─── success ────────┘               │
└──────┬──────┘                                      │
       │ max_retries_exceeded                        │
       └─────────────────────────────────────────────┘
```

### State Definitions

| State | Description | Entry Actions | Exit Actions |
|-------|-------------|---------------|--------------|
| **Disconnected** | No connection | Clear session data | - |
| **Connecting** | QUIC handshake in progress | Start timeout timer | Cancel timer |
| **Authenticating** | Sending Hello, awaiting HelloAck | Send Hello message | - |
| **Ready** | Fully connected, can send/receive | Notify listeners | Flush pending ops |
| **Reconnecting** | Connection lost, attempting recovery | Start retry timer | Cancel timer |

### Transitions

| From | Event | To | Actions |
|------|-------|-----|---------|
| Disconnected | `connect()` | Connecting | Initiate QUIC connection |
| Connecting | `quic_established` | Authenticating | Send Hello |
| Connecting | `timeout(10s)` | Disconnected | Log error |
| Connecting | `error` | Disconnected | Log error, notify UI |
| Authenticating | `hello_ack` | Ready | Store session, notify UI |
| Authenticating | `auth_failed` | Disconnected | Log error, notify UI |
| Authenticating | `timeout(5s)` | Disconnected | Log timeout |
| Ready | `connection_lost` | Reconnecting | Start retry sequence |
| Ready | `goodbye` | Disconnected | Clean shutdown |
| Ready | `disconnect()` | Disconnected | Send Goodbye |
| Reconnecting | `reconnected` | Ready | Restore session |
| Reconnecting | `max_retries(5)` | Disconnected | Notify UI |

### Retry Strategy

```rust
struct ReconnectConfig {
    initial_delay: Duration,      // 1 second
    max_delay: Duration,          // 30 seconds
    multiplier: f64,              // 2.0
    max_retries: u32,             // 5
    jitter: f64,                  // 0.1 (10%)
}

// Delay calculation
fn next_delay(attempt: u32, config: &ReconnectConfig) -> Duration {
    let base = config.initial_delay.as_millis() as f64;
    let delay = base * config.multiplier.powi(attempt as i32);
    let capped = delay.min(config.max_delay.as_millis() as f64);
    let jitter = capped * config.jitter * (random::<f64>() - 0.5);
    Duration::from_millis((capped + jitter) as u64)
}

// Retry sequence: 1s, 2s, 4s, 8s, 16s (capped at 30s)
```

---

## 2. Lock State Machine

### States

```
┌──────────┐
│ Unlocked │ ◄────────────────────────────┐
└────┬─────┘                              │
     │ acquire()                          │
     ▼                                    │
┌──────────┐                              │
│ Waiting  │ ─── timeout ─────────────────┤
└────┬─────┘                              │
     │ lock_granted                       │
     ▼                                    │
┌──────────┐                              │
│  Held    │ ─── release() ───────────────┤
└────┬─────┘                              │
     │ expired/revoked                    │
     ▼                                    │
┌──────────┐                              │
│ Released │ ─────────────────────────────┘
└──────────┘
```

### State Definitions

| State | Description | Timeout |
|-------|-------------|---------|
| **Unlocked** | No lock held or requested | - |
| **Waiting** | Lock request sent, awaiting response | 30s |
| **Held** | Lock acquired, token valid | 30s (must refresh) |
| **Released** | Lock released or expired | Immediate → Unlocked |

### Lock Types

```rust
#[derive(Clone, Copy)]
pub enum LockType {
    /// Multiple readers allowed
    Shared,
    /// Single writer, no readers
    Exclusive,
}

#[derive(Clone, Copy)]
pub enum LockScope {
    /// Lock specific file
    File(Inode),
    /// Lock directory (prevents child modifications)
    Directory(Inode),
    /// Lock subtree (recursive)
    Subtree(Inode),
}
```

### Lock Compatibility Matrix

| Held \ Requested | Shared | Exclusive |
|------------------|--------|-----------|
| **None** | ✅ Grant | ✅ Grant |
| **Shared** | ✅ Grant | ❌ Wait |
| **Exclusive** | ❌ Wait | ❌ Wait |

### Lock Token Structure

```rust
pub struct LockToken {
    /// Random 128-bit identifier
    id: [u8; 16],
    /// When lock was granted
    granted_at: u64,
    /// When lock expires
    expires_at: u64,
    /// What's locked
    scope: LockScope,
    /// Lock type
    lock_type: LockType,
    /// Owner identifier
    owner: ClientId,
}

impl LockToken {
    pub fn is_expired(&self) -> bool {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs() > self.expires_at
    }

    pub fn remaining(&self) -> Duration {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();
        Duration::from_secs(self.expires_at.saturating_sub(now))
    }
}
```

### Lock Refresh Protocol

```
Client                                Host
   │                                    │
   │ ─── AcquireLock(inode) ──────────► │
   │                                    │
   │ ◄─── LockResponse(token, 30s) ──── │
   │                                    │
   │        [25 seconds pass]           │
   │                                    │
   │ ─── RefreshLock(token) ──────────► │
   │                                    │
   │ ◄─── LockResponse(token, 30s) ──── │
   │                                    │
   │        [client done writing]       │
   │                                    │
   │ ─── ReleaseLock(token) ──────────► │
   │                                    │
   │ ◄─── ReleaseResponse(ok) ───────── │
```

---

## 3. Cache Entry State Machine

### States

```
┌─────────┐
│ Unknown │ ───── request ─────┐
└─────────┘                    │
                               ▼
                        ┌───────────┐
              ┌──────── │ Fetching  │ ◄─────── refetch ───┐
              │         └─────┬─────┘                     │
              │               │ data_received             │
         error│               ▼                           │
              │         ┌───────────┐                     │
              │         │  Cached   │ ─── invalidate ─────┤
              │         └─────┬─────┘                     │
              │               │ ttl_expired               │
              │               ▼                           │
              │         ┌───────────┐                     │
              └───────► │   Stale   │ ─── access ─────────┘
                        └─────┬─────┘
                              │ evict
                              ▼
                        ┌───────────┐
                        │  Evicted  │ ───────► [removed]
                        └───────────┘
```

### State Definitions

| State | Description | Data Present | Network Fetch |
|-------|-------------|--------------|---------------|
| **Unknown** | Never fetched | No | On access |
| **Fetching** | Request in flight | No | In progress |
| **Cached** | Valid data in cache | Yes (fresh) | No |
| **Stale** | TTL expired, data may be outdated | Yes (stale) | On access |
| **Evicted** | Removed from cache | No | On access |

### Cache Entry Structure

```rust
pub struct CacheEntry {
    /// Chunk identifier
    chunk_id: ChunkId,
    /// Cached data
    data: Arc<Vec<u8>>,
    /// When data was fetched
    fetched_at: Instant,
    /// Last access time (for LRU)
    last_access: Instant,
    /// Number of accesses
    access_count: u64,
    /// Data checksum
    checksum: [u8; 32],
    /// Current state
    state: CacheState,
}

pub enum CacheState {
    Fetching { waiter: broadcast::Sender<Result<Arc<Vec<u8>>>> },
    Cached,
    Stale,
}
```

### TTL Configuration

| Data Type | Default TTL | Configurable |
|-----------|-------------|--------------|
| File chunk | 5 minutes | Yes |
| Directory listing | 1 second | Yes |
| File attributes | 1 second | Yes |
| Negative (not found) | 5 seconds | Yes |

### Eviction Policy

```rust
/// LRU eviction with access frequency consideration
pub struct EvictionPolicy {
    /// Maximum L1 cache size
    l1_max_size: usize,
    /// Maximum L2 cache size
    l2_max_size: u64,
    /// Eviction batch size (evict multiple at once)
    batch_size: usize,
    /// Target fill ratio after eviction
    target_ratio: f64,  // 0.8 = evict down to 80%
}

impl EvictionPolicy {
    /// Score for eviction priority (lower = evict first)
    fn eviction_score(&self, entry: &CacheEntry) -> f64 {
        let age = entry.last_access.elapsed().as_secs_f64();
        let frequency = entry.access_count as f64;

        // LRU-K variant: recent access + frequency
        frequency / (age + 1.0)
    }
}
```

---

## 4. Inode Lifecycle State Machine

### States

```
┌───────────┐
│ Available │ ◄─────────────────────────────────┐
└─────┬─────┘                                   │
      │ allocate(path)                          │
      ▼                                         │
┌───────────┐                                   │
│ Allocated │ ─── lookup_failed ────────────────┤
└─────┬─────┘                                   │
      │ lookup_success                          │
      ▼                                         │
┌───────────┐                                   │
│  Active   │ ─── forget(nlookup=0) ────────────┤
└─────┬─────┘                                   │
      │ remote_deleted                          │
      ▼                                         │
┌───────────┐                                   │
│  Orphan   │ ─── all_handles_closed ───────────┘
└───────────┘
```

### State Definitions

| State | Description | In VFS Map | Ref Count |
|-------|-------------|------------|-----------|
| **Available** | Inode number can be reused | No | 0 |
| **Allocated** | Inode assigned to path | Yes | 0 |
| **Active** | In use by kernel/application | Yes | >0 |
| **Orphan** | Deleted but handles open | Yes | >0 |

### Inode Allocation Strategy

```rust
pub struct InodeAllocator {
    /// Next inode to try
    next: AtomicU64,
    /// Recycled inodes (from forget)
    free_list: Mutex<Vec<u64>>,
    /// Reserved inodes
    reserved: HashSet<u64>,
}

impl InodeAllocator {
    /// Reserved inodes
    const ROOT_INODE: u64 = 1;
    const FIRST_USER_INODE: u64 = 2;

    pub fn allocate(&self) -> u64 {
        // Try free list first
        if let Some(inode) = self.free_list.lock().pop() {
            return inode;
        }
        // Otherwise increment
        self.next.fetch_add(1, Ordering::SeqCst)
    }

    pub fn release(&self, inode: u64) {
        if inode >= Self::FIRST_USER_INODE {
            self.free_list.lock().push(inode);
        }
    }
}
```

### Path ↔ Inode Mapping

```rust
pub struct VfsMap {
    /// Inode → Entry (path, attrs, children)
    entries: RwLock<HashMap<u64, VfsEntry>>,
    /// Path → Inode (for reverse lookup)
    path_to_inode: RwLock<HashMap<PathBuf, u64>>,
    /// Inode allocator
    allocator: InodeAllocator,
}

pub struct VfsEntry {
    pub inode: u64,
    pub path: PathBuf,
    pub attrs: FileAttr,
    pub children: Option<Vec<u64>>,  // For directories
    pub nlookup: AtomicU64,          // Reference count
}
```

---

## 5. Write Transaction State Machine

### States (Phase 7)

```
┌──────────┐
│   Idle   │ ◄─────────────────────────────────┐
└────┬─────┘                                   │
     │ begin_write(inode)                      │
     ▼                                         │
┌──────────┐                                   │
│ Locking  │ ─── lock_failed ──────────────────┤
└────┬─────┘                                   │
     │ lock_acquired                           │
     ▼                                         │
┌──────────┐                                   │
│ Writing  │ ─── abort() ──────────────────────┤
└────┬─────┘                                   │
     │ all_chunks_written                      │
     ▼                                         │
┌──────────┐                                   │
│Committing│ ─── commit_failed ────────────────┤
└────┬─────┘                                   │
     │ commit_success                          │
     ▼                                         │
┌──────────┐                                   │
│ Complete │ ─────────────────────────────────►│
└──────────┘                                   │
```

### Transaction Structure

```rust
pub struct WriteTransaction {
    /// Transaction ID
    id: Uuid,
    /// Target file
    inode: u64,
    /// Lock token
    lock: LockToken,
    /// Written chunks (not yet committed)
    pending_chunks: Vec<ChunkId>,
    /// Original file size (for rollback)
    original_size: u64,
    /// Transaction state
    state: WriteState,
    /// Started at
    started_at: Instant,
    /// Timeout
    timeout: Duration,
}

pub enum WriteState {
    Locking,
    Writing { chunks_written: usize, chunks_total: usize },
    Committing,
    Complete,
    Aborted { reason: String },
}
```

### Commit Protocol

```
Client                                Host
   │                                    │
   │ ─── AcquireLock ─────────────────► │
   │ ◄─── LockResponse(token) ───────── │
   │                                    │
   │ ─── WriteChunk(0, token) ────────► │
   │ ◄─── WriteChunkResponse ────────── │
   │                                    │
   │ ─── WriteChunk(1, token) ────────► │
   │ ◄─── WriteChunkResponse ────────── │
   │                                    │
   │ ─── CommitWrite(token, size) ────► │
   │                                    │  [Host: update metadata]
   │                                    │  [Host: fsync data]
   │ ◄─── CommitResponse(ok) ────────── │
   │                                    │
   │ ─── ReleaseLock(token) ──────────► │
   │ ◄─── ReleaseResponse ───────────── │
```

---

## 6. Host Session State Machine

### States

```
┌───────────┐
│  Stopped  │ ◄────────────────────────────────┐
└─────┬─────┘                                  │
      │ start(path)                            │
      ▼                                        │
┌───────────┐                                  │
│ Scanning  │ ─── scan_error ──────────────────┤
└─────┬─────┘                                  │
      │ scan_complete                          │
      ▼                                        │
┌───────────┐                                  │
│ Listening │ ─── stop() ──────────────────────┤
└─────┬─────┘                                  │
      │ client_connected                       │
      ▼                                        │
┌───────────┐                                  │
│  Hosting  │ ─── stop() ──────────────────────┤
└─────┬─────┘                                  │
      │ last_client_disconnected               │
      ▼                                        │
┌───────────┐                                  │
│   Idle    │ ─── client_connected ─► Hosting  │
└─────┬─────┘                                  │
      │ stop()                                 │
      └────────────────────────────────────────┘
```

### State Definitions

| State | Description | Accepting Connections |
|-------|-------------|----------------------|
| **Stopped** | Not hosting | No |
| **Scanning** | Building file index | No |
| **Listening** | Ready, no clients | Yes |
| **Hosting** | Active clients connected | Yes |
| **Idle** | No clients, still listening | Yes |

---

## 7. NAT Traversal State Machine

### States

```
┌───────────┐
│  Initial  │
└─────┬─────┘
      │ start_traversal()
      ▼
┌───────────┐
│  Probing  │ ─── all_failed ──────► DirectFailed
└─────┬─────┘
      │ stun_response
      ▼
┌───────────┐
│Candidates │ ─── timeout ─────────► RelayFallback
└─────┬─────┘
      │ hole_punch_success
      ▼
┌───────────┐
│ Connected │
└───────────┘
```

### NAT Type Detection

```rust
pub enum NatType {
    /// No NAT, public IP
    None,
    /// Full cone - any external host can send
    FullCone,
    /// Restricted cone - only replied-to hosts
    RestrictedCone,
    /// Port restricted - only replied-to host:port
    PortRestricted,
    /// Symmetric - different mapping per destination
    Symmetric,
    /// Unknown / detection failed
    Unknown,
}

impl NatType {
    /// Can we hole-punch with this NAT type pair?
    pub fn can_punch(&self, other: &NatType) -> bool {
        use NatType::*;
        match (self, other) {
            (None, _) | (_, None) => true,
            (FullCone, _) | (_, FullCone) => true,
            (RestrictedCone, RestrictedCone) => true,
            (RestrictedCone, PortRestricted) => true,
            (PortRestricted, RestrictedCone) => true,
            (PortRestricted, PortRestricted) => true,
            (Symmetric, Symmetric) => false,  // Need relay
            (Symmetric, _) | (_, Symmetric) => {
                // May work with birthday attack
                true
            }
            _ => false,
        }
    }
}
```

### ICE Candidate Types

```rust
pub enum CandidateType {
    /// Direct host address
    Host,
    /// Server-reflexive (STUN)
    ServerReflexive,
    /// Peer-reflexive (discovered during connectivity checks)
    PeerReflexive,
    /// Relayed (TURN)
    Relay,
}

pub struct IceCandidate {
    pub candidate_type: CandidateType,
    pub ip: IpAddr,
    pub port: u16,
    pub priority: u32,
    pub foundation: String,
}

impl IceCandidate {
    /// Priority calculation per RFC 5245
    pub fn calculate_priority(candidate_type: CandidateType, local_pref: u16) -> u32 {
        let type_pref = match candidate_type {
            CandidateType::Host => 126,
            CandidateType::PeerReflexive => 110,
            CandidateType::ServerReflexive => 100,
            CandidateType::Relay => 0,
        };
        (type_pref << 24) | ((local_pref as u32) << 8) | 255
    }
}
```

---

## State Machine Implementation Pattern

All state machines should follow this pattern:

```rust
pub struct StateMachine<S, E> {
    state: S,
    listeners: Vec<Box<dyn Fn(&S, &E)>>,
}

impl<S: Clone, E> StateMachine<S, E> {
    pub fn transition(&mut self, event: E, next: S) {
        for listener in &self.listeners {
            listener(&next, &event);
        }
        self.state = next;
    }

    pub fn state(&self) -> &S {
        &self.state
    }
}

// Usage
enum ConnState { Disconnected, Connecting, Ready }
enum ConnEvent { Connect, Connected, Disconnect }

let mut sm = StateMachine::new(ConnState::Disconnected);
sm.on_transition(|state, event| {
    tracing::info!(?state, ?event, "connection state changed");
});
sm.transition(ConnEvent::Connect, ConnState::Connecting);
```
