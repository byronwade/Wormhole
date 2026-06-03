# Phase 1 Open Questions - RESOLVED

## Q1: Default limits for metadata depth/size and how to paginate if needed?

**Decision:**
- **Directory depth limit:** No hard limit, but readdir is paginated to 1000 entries per request
- **Max path length:** 4096 bytes (MAX_PATH_LEN constant)
- **Max filename length:** 255 bytes (MAX_FILENAME_LEN constant)
- **Pagination:** ListDirRequest includes `offset` and `limit` fields; ListDirResponse includes `has_more` and `next_offset`

**Rationale:** These match POSIX limits and prevent memory exhaustion on large directories. The 1000-entry page size balances latency (single RTT for most dirs) with memory (bounded allocation per request).

---

## Q2: When to replace permissive TLS verifier with proper trust/onboarding?

**Decision:**
- **Phase 1-3 (Development):** Use SkipServerVerification for self-signed certs
- **Phase 6 (Security):** Implement TOFU (Trust On First Use) with certificate pinning
- **Production:** Support both TOFU and optional CA-signed certificates

**Rationale:** Security is not the focus of early phases. TOFU mirrors SSH's model and works well for peer-to-peer connections where peers are introduced via join codes. The join code + SPAKE2 key exchange provides the trust anchor.

---

## Q3: Minimum target performance on high-latency links for metadata fetch?

**Decision:**
- **Target:** < 500ms for any single metadata operation on 200ms RTT links
- **Acceptable:** < 1s for directory listings up to 1000 entries
- **Strategy:** Batch where possible, cache aggressively (TTL: 1-5 seconds)

**Rationale:** 200ms RTT represents intercontinental links. A single round-trip for metadata plus protocol overhead should stay under 500ms. Caching means subsequent accesses are instant.
