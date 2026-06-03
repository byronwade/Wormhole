# Phase 2 Open Questions - RESOLVED

## Q1: Should we keep a persistent QUIC connection vs reconnect per request for MVP?

**Decision:** **Persistent connection**

**Rationale:**
- QUIC handshake adds 1-2 RTT latency (0-RTT resumption requires prior connection)
- Persistent connections enable server-push features (cache invalidation)
- Connection multiplexing allows many concurrent streams over one connection
- Reconnect on error with exponential backoff (1s → 2s → 4s → max 30s)

**Implementation:**
- Single QUIC connection maintained by network actor
- Multiple streams opened for concurrent requests
- Keepalive via Ping/Pong every 30 seconds
- Automatic reconnection on ConnectionError

---

## Q2: Default cluster size and whether to adapt by RTT/bandwidth?

**Decision:**
- **Default:** 4 concurrent chunk fetches (streams)
- **Adaptation:** Not for MVP; fixed at 4

**Rationale:**
- 4 streams × 128KB chunks = 512KB in flight
- On 100Mbps link with 50ms RTT: saturates ~80% of bandwidth
- Adaptive streaming adds complexity; defer to Phase 4 optimizations
- Too many streams can overwhelm slow links; too few underutilizes fast ones

**Future (Phase 4):**
- Dynamic window based on measured throughput
- Consider BBR-like congestion control awareness

---

## Q3: Max allowed len and server-side rate limits per client?

**Decision:**
- **Max message size:** 1 MB (MAX_MESSAGE_SIZE constant)
- **Max chunk size:** 128 KB (CHUNK_SIZE constant)
- **Rate limits (per client):**
  - Metadata requests: 100/second
  - Chunk requests: 50/second
  - Connection attempts: 10/minute

**Rationale:**
- 1 MB max message handles large directory listings without fragmentation
- 128 KB chunks balance memory, latency, and throughput
- Rate limits prevent abuse while allowing normal high-throughput transfers
- A 1 Gbps sustained transfer needs ~1000 chunks/second; 50/client × 20 clients = 1000
