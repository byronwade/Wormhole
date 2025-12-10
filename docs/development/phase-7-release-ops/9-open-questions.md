# Phase 7 Open Questions - RESOLVED

## Q1: Lock policy: duration/renewal/timeout; what to do on client crash?

**Decision:**

**Lock parameters:**
| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Default duration | 30 seconds | Long enough for most edits |
| Max duration | 5 minutes | Prevents indefinite locks |
| Renewal interval | 10 seconds | Before lock expires |
| Grace period | 5 seconds | After expected renewal |

**Lock lifecycle:**
```
┌─────────────────────────────────────────────────────────────┐
│ ACQUIRE (30s) → RENEW (10s) → RENEW (10s) → ... → RELEASE │
└─────────────────────────────────────────────────────────────┘
                     ↓ (if client crashes)
              GRACE (5s) → EXPIRED → available
```

**Client crash handling:**
1. Host detects missed renewal (10s + 5s grace = 15s max)
2. Lock auto-releases after grace period
3. Host broadcasts `Invalidate` message to other clients
4. Other clients can now acquire lock

**Implementation:**
```rust
struct LockEntry {
    token: LockToken,
    holder: ClientId,
    lock_type: LockType,
    acquired_at: Instant,
    expires_at: Instant,
    last_renewed: Instant,
}

// Background task
async fn gc_expired_locks(locks: &mut HashMap<Inode, LockEntry>) {
    let now = Instant::now();
    locks.retain(|_, lock| lock.expires_at > now);
}
```

---

## Q2: Conflict handling: add versioning or OT/CRDT in future phases?

**Decision:**
- **Phase 7 (MVP):** Last-write-wins with lock enforcement
- **Future:** Consider CRDT for collaborative editing (Phase 8+)

**MVP conflict handling:**
1. Writes require lock
2. Lock ensures single writer
3. No concurrent modifications possible
4. Simple, predictable behavior

**Future options (not for MVP):**
- **Versioning:** Vector clocks for conflict detection
- **OT (Operational Transform):** For real-time collaborative editing
- **CRDT:** For eventually consistent distributed state

**Why defer:**
- OT/CRDT adds massive complexity
- Lock-based model covers most use cases
- Can add collaborative features later as optional mode
- Focus on reliability first

---

## Q3: Upload reliability: batching vs per-chunk; retry/backoff strategy?

**Decision:**

**Upload strategy:**
- **Batching:** No batching for MVP; write chunks as they're ready
- **Parallelism:** Up to 4 concurrent chunk uploads
- **Ordering:** Chunks can upload out-of-order; final size update after last chunk

**Retry policy:**
| Attempt | Delay | Total elapsed |
|---------|-------|---------------|
| 1 | 0s | 0s |
| 2 | 1s | 1s |
| 3 | 2s | 3s |
| 4 | 4s | 7s |
| 5 | 8s | 15s |
| 6 | Fail | - |

**Implementation:**
```rust
async fn upload_chunk_with_retry(chunk: &[u8]) -> Result<(), Error> {
    let mut delay = Duration::from_secs(1);
    for attempt in 1..=5 {
        match upload_chunk(chunk).await {
            Ok(_) => return Ok(()),
            Err(e) if e.is_transient() => {
                tokio::time::sleep(delay).await;
                delay *= 2;
            }
            Err(e) => return Err(e),
        }
    }
    Err(Error::MaxRetriesExceeded)
}
```

**Failure modes:**
- Network error: Retry with backoff
- Lock expired: Re-acquire lock, retry
- Checksum mismatch: Re-upload (don't retry same data)
- Disk full on host: Fail immediately, notify user

---

## Q4: Should writes require lock strictly, or allow optimistic writes with merge?

**Decision:** **Strict lock requirement for MVP**

**Rationale:**
- Simplicity: No merge conflicts to handle
- Predictability: Users understand "editing" vs "viewing"
- Safety: No data loss from concurrent writes
- Matches user expectations from traditional file systems

**Behavior:**
```
┌─────────────────────────────────────────────────────────────┐
│  User opens file for writing                                │
│                    ↓                                        │
│  Client requests EXCLUSIVE lock                             │
│                    ↓                                        │
│  If granted → Write succeeds                                │
│  If denied → Show "File is being edited by X" error        │
└─────────────────────────────────────────────────────────────┘
```

**Future consideration:**
- Could add "force write" with user confirmation
- Could implement merge for text files
- Could add "copy as" for read-only access during lock

**Config:**
```toml
[write]
require_lock = true     # Strict mode (default)
# require_lock = false  # Optimistic mode (future)
```
