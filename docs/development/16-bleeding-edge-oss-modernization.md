# Wormhole Bleeding-Edge OSS Modernization

**Date:** 2026-08-02  
**Status:** Accepted — Waves A–E landed in tree (2026-08-02+). Production paths: session postcard after Hello, hybrid cache content-store dual-write, CLI `--transport iroh`, mDNS via `iroh-mdns-address-lookup`, desktop React 19 / Tailwind 4 + `@wormhole/shared` JoinCodePanel. Optional: `teleport-blobs` feature `iroh-blobs` for ticket helpers; full FUSE-over-iroh mount wiring continues.  
**Audience:** Engineering + product  
**Related:** `00-master-implementation-plan.md`, `03-architecture-decisions.md`, `docs/superpowers/specs/2026-06-03-open-core-team-cloud-architecture.md`

---

## 1. Verdict in one paragraph

Wormhole’s concept is still right — **mount-as-drive + join codes + P2P + $0 core** — but the *implementation surface* should stop reinventing networking, signaling, and blob transfer. Adopt **iroh 1.0** for dial-by-key QUIC + NAT + relays, **iroh-blobs** for BLAKE3 verified streaming, **postcard** (and selective **rkyv**) instead of aging bincode, keep **FUSE/WinFSP** as the UX shell, move the paid control plane to **self-hostable open backends + Polar**, and evolve the product story from “AirDrop meets SMB” to **content-addressed P2P mounts with optional live sync**. File bytes still never touch our servers.

---

## 2. What stays sacred

| Principle | Why |
|-----------|-----|
| Data plane is P2P + E2E | Brand promise + unit economics |
| Join-code UX | Beats Syncthing’s config tax |
| Mount-as-drive | Differentiator vs Dropbox / Frame.io |
| Open-core: free forever for self-host | Viral loop |
| Control plane optional | Studios that want SSO still pay |

Do **not** break these while modernizing.

---

## 3. Concept upgrade (product)

### 3.1 From code-only to identity + content

| Today | Next |
|-------|------|
| Ephemeral join codes share a folder | Codes still work for one-shot shares |
| Host identified by IP / signal room | Host identified by **Endpoint ID** (public key) |
| Files = paths on disk | Files = paths *plus* **content hashes** (BLAKE3) |
| Remount = re-fetch | Remount = **resume from local content cache** |
| Sync = whole-file / chunk rewrite | Sync = **delta + content-aware dedup** |

### 3.2 Positioning refresh

**Old:** “AirDrop meets network drive.”  
**New:** “Content-addressed folders that mount like local disks — connect by code or key, stream verified bytes, keep a cache that survives reconnects.”

Tagline can stay. Elevator pitch should emphasize **verified streaming** and **no re-upload of unchanged chunks**.

### 3.3 Tier story (open-source pricing, not cloud rent)

Keep Free / Pro $8 / Team $15 / Enterprise, but clarify what people pay for:

| Money buys | Money never buys |
|------------|------------------|
| Hosted rendezvous + token signing | Storage of file bytes |
| Team seats, SSO, audit, admin UI | Encryption keys (user-held) |
| Priority relays / geo presence | Lock-in to proprietary protocol |

Optional OSS-friendly pricing tweaks:

- **Self-host Team** — free forever if you run your own control plane (Polar/GitHub Sponsors for support only).
- **Hosted Team** — $15/seat for managed auth + relays (current plan).
- **Relay credits** — optional metered relay bandwidth for hard NATs (Polar usage meters), still E2E encrypted.

---

## 4. Stack modernization matrix

### 4.1 Networking & discovery

| Layer | Current | Replace / upgrade with | Why |
|-------|---------|------------------------|-----|
| Transport | Custom `quinn` + hand-rolled STUN/rendezvous | **[iroh](https://iroh.computer) 1.0** | Dial by public key; hole punch + relay fallback; QUIC streams/datagrams; Apache-2.0 / MIT |
| Signal server | Custom WebSocket rooms (`teleport-signal`) | **iroh relays** (self-host `iroh-relay`) + optional DNS/Pkarr lookup | Deletes most of Phase 6 custom NAT code; still self-hostable |
| LAN discovery | Manual IP / join code | iroh **mDNS** neighbors + keep join codes | “Same Wi‑Fi, no code” when wanted |
| Blob transfer | Custom 128KB chunk protocol | **iroh-blobs** (BLAKE3 verified streaming) | Industry-grade verified ranges; natural dedup |
| Live sync (optional later) | Custom sync engine | Evaluate **iroh-docs / iroh-gossip** for CRDT metadata | Only for Phase 7+ collab; keep path/VFS layer ours |

**Migration posture:** Keep `NetMessage` as an ALPN protocol on iroh connections first (thin adapter). Then migrate chunk payloads to blob hashes incrementally — additive, not big-bang.

### 4.2 Protocol & serialization

| Concern | Current | Next | Notes |
|---------|---------|------|-------|
| Control messages | `bincode` 1.3 | **`postcard`** (+ `serde`) | Compact, actively maintained, no_std-friendly; bincode lineage is stale |
| Hot metadata views | Clone into structs | **`rkyv`** for inode maps / cache indexes | Zero-copy reads; watch alignment |
| File bytes | Framed in messages | **Raw QUIC stream / blob tickets** | Don’t serialize 128KB through serde |
| Schema evolution | `Option<T>` fields | postcard + explicit **protocol version** in handshake | Still additive |

### 4.3 Crypto & auth

| Use case | Current | Next |
|----------|---------|------|
| Ephemeral join codes (P2P) | SPAKE2 (`spake2`) | Keep SPAKE2 **or** upgrade to **CPace / SPAKE2+** via [`pakery`](https://github.com/djx-y-z/pakery) — still balanced PAKE |
| Cloud account login | (planned OPAQUE-ish / Supabase) | **`opaque-ke` (RFC 9807)** for password → session without server seeing password |
| Peer identity | TLS certs via `rcgen` | **iroh Endpoint ID (Ed25519)** as primary identity; join codes derive session keys on top |
| Chunk integrity | BLAKE3 (good) | Keep; align with iroh-blobs hash trees |

OPAQUE is for **asymmetric** (client↔server) auth. Do **not** replace join-code SPAKE2 with OPAQUE — wrong threat model.

### 4.4 Filesystem UX

| Platform | Keep | Add later |
|----------|------|-----------|
| Linux / macOS | `fuser` + macFUSE | Optional **NFS / WebDAV** sidecar for apps that hate FUSE |
| Windows | WinFSP | Same |
| VMs / containers | — | **virtiofs** guest agent path for CI/render farms |
| Browser | — | Read-only **WebTransport** mount explorer (marketing + light preview) |

FUSE remains the product. Do not chase kernel modules.

### 4.5 Desktop & web

| Area | Current gap | Upgrade |
|------|-------------|---------|
| Desktop UI | React 18, Tailwind 3, Zustand absent in package.json patterns vary | Align with web: **React 19**, **Tailwind 4**, Vitest, shared UI package |
| Desktop shell | Tauri 2 (keep) | Stay on Tauri — still the best OSS thin-native choice vs Electron |
| Web admin | Next 15 + fakebase → Supabase | Prefer **self-hostable** control plane (see §5) |
| Shared types | Duplicated TS/Rust | `ts-rs` or `specta` / Tauri specta for command types |

### 4.6 Control plane & billing (open-source pieces)

Current vision: Supabase + Stripe + `teleport-cloud` signing.

**Proposed default:**

```
┌─ Self-hostable BaaS (Postgres) ─────────┐     ┌─ teleport-cloud (Rust) ──┐
│ Auth + teams + audit (RLS)              │────▶│ JWT validate + mount     │
│ Candidates: Supabase self-host,         │     │ token sign/verify        │
│ Appwrite, or single-binary Postgres     │     │ (security boundary)      │
│ BaaS (Allyourbase / Fluxbase-class)     │     └───────────┬──────────────┘
└─────────────────────────────────────────┘                 │
┌─ Polar (Apache-2.0, OSS-friendly MoR) ──┐                 ▼
│ Seats, checkout, tax, usage meters      │         wormhole CLI / app
└─────────────────────────────────────────┘
```

| Paid SaaS today | OSS / OSS-friendly replacement | Role |
|-----------------|--------------------------------|------|
| Hosted Supabase only | Self-host Supabase **or** Appwrite / PocketBase (small) / Postgres BaaS binary | Auth, DB, realtime |
| Stripe Billing | **[Polar](https://polar.sh)** (Apache-2.0) | Seats + optional relay metering; MoR for tax |
| Custom signal | Self-host **iroh-relay** | Rendezvous / relay |
| Proprietary analytics | **OpenTelemetry + Grafana / Prometheus** | Metrics you own |
| Paid CI minutes abuse | **GitHub Actions + cargo-nextest + sccache** | Faster OSS CI |

`fakebase` remains valid for frontend velocity — keep the Supabase-shaped client seam so you can point at self-hosted Supabase **or** any compatible layer later.

### 4.7 Dev tooling (make development better)

| Tooling | Adopt | Benefit |
|---------|-------|---------|
| Linker | `mold` / `lld` | Faster Rust link times |
| Cache | `sccache` or `cargo-cache` | CI + local rebuilds |
| Tests | `cargo-nextest` | Parallel, clearer failures |
| Env | `mise` or Nix flake | One-command toolchain (Rust, Node, pnpm, fuse libs) |
| Lint | `clippy -D warnings` + `cargo deny` | License + advisory gate |
| Frontend monorepo | Shared `@wormhole/ui` package | Desktop ↔ web parity |
| Protocol fixtures | golden files + postcard version tags | Compat tests stay honest |

---

## 5. Target architecture (after modernization)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ UI: Tauri 2 + React 19 (desktop) │ Next (web admin) │ CLI (clap)         │
├──────────────────────────────────────────────────────────────────────────┤
│ teleport-daemon — VFS, FUSE/WinFSP, cache, locks, prefetch                │
├──────────────────────────────────────────────────────────────────────────┤
│ Protocol ALPN — Wormhole control (postcard) + iroh-blobs tickets          │
├──────────────────────────────────────────────────────────────────────────┤
│ iroh Endpoint — dial-by-key, mDNS, relay fallback, QUIC multiplex         │
├──────────────────────────────────────────────────────────────────────────┤
│ Optional control plane — self-host BaaS + Polar + teleport-cloud tokens   │
└──────────────────────────────────────────────────────────────────────────┘
         ▲                                      ▲
         │ never carries file bytes             │ mount tokens only
         └──────────────────────────────────────┘
```

Crate sketch:

```
crates/
  teleport-core/     # types, postcard protocol, PAKE, mount tokens
  teleport-net/      # NEW: iroh endpoint wrapper, ALPN router
  teleport-blobs/    # NEW: thin facade over iroh-blobs + local disk root
  teleport-daemon/   # FUSE + host/client (uses teleport-net)
  teleport-signal/   # DEPRECATED → thin wrapper or iroh-relay deploy docs
  teleport-cloud/    # NEW: JWT → signed mount grant (paid tier)
```

---

## 6. Phased adoption (no calendar estimates)

Ordered by leverage and risk, not by weeks.

### Wave A — Foundations (low product risk)

1. Bump MSRV toward what iroh needs (track crate MSRV; today iroh 1.0 wants a recent stable).
2. Introduce `postcard` dual-decode alongside bincode (handshake negotiates codec).
3. Add `cargo deny`, `nextest`, mold/sccache to CI.
4. Extract shared frontend tokens/components between `apps/desktop` and `apps/web`.

### Wave B — Networking leap

1. Add `teleport-net` with iroh Endpoint; implement existing host/mount over iroh ALPN.
2. Self-hostable relay compose file (`deploy/iroh-relay`).
3. Keep join codes: code → SPAKE2 session → exchange Endpoint IDs → dial.
4. Deprecate custom STUN/WebSocket room path behind a feature flag.

### Wave C — Content-addressed data plane

1. Map 128KB chunks to blob hashes; populate L2 disk cache by hash.
2. Dedup across files/peers (Phase 8 goals get cheaper).
3. Resume mounts after reboot without full re-list when merkle/root known.

### Wave D — Open control plane

1. Keep mount-token primitive from open-core spec.
2. Prefer Polar for seat checkout; keep Stripe only if already integrated deeply.
3. Document self-host stack: Postgres BaaS + `teleport-cloud` + iroh-relay.
4. Free tier remains keyless grants + DIY team key.

### Wave E — Product differentiators

1. LAN zero-code discovery (mDNS).
2. QR join + clipboard paste (UX research doc already prioritizes this).
3. Pipeline hooks (Unreal/watch folders) on top of content hashes.
4. Optional CRDT metadata for multi-writer studios — only after locks are solid.

---

## 7. ADR updates required

| ADR | Change |
|-----|--------|
| ADR-001 QUIC/quinn | **Amend:** quinn remains under iroh; app code prefers iroh Endpoint API |
| ADR-002 bincode | **Supersede:** postcard default; rkyv for local zero-copy indexes |
| ADR-007 SPAKE2 | **Amend:** keep for join codes; add OPAQUE for cloud passwords; evaluate CPace |
| New ADR-0xx | iroh as networking substrate |
| New ADR-0xx | Polar + self-host BaaS for open-core billing |
| Open-core cloud spec | Swap “Stripe default” → Polar; keep Supabase-shaped client, prefer self-host |

---

## 8. What we explicitly do **not** do

- Route file bytes through Wormhole cloud (still forbidden).
- Replace Tauri with Electron.
- Replace FUSE with a sync-folder UX (that’s Dropbox).
- Adopt every iroh high-level app protocol blindly — **VFS semantics stay ours**.
- Chase RDMA/kernel modules for v1 differentiators.
- Rewrite working Phase 1–5 code in one PR — adapter layers first.

---

## 9. Success metrics

| Metric | Signal we’re right |
|--------|---------------------|
| Time-to-first-byte on WAN | Match or beat current after iroh migrate |
| Hard-NAT connect success | ↑ via relay fallback without custom STUN maze |
| Duplicate bytes on wire | ↓ via content hashes |
| Lines in `rendezvous`/`stun` | ↓ sharply |
| Self-host install steps | Signal + relay + optional BaaS in one compose |
| Dev loop | Clean rebuild and test wall-clock ↓ with mold/nextest/sccache |
| Vendor lock-in | Auth DB = Postgres you can dump; billing = Polar with export path |

---

## 10. Immediate next actions

1. Accept this vision (or amend §4 choices).
2. Land ADR amendments for iroh + postcard.
3. Spike: host/mount hello-world over iroh ALPN with existing FUSE unchanged.
4. Spike: postcard round-trip for `NetMessage` with version byte.
5. Update open-core cloud doc billing default to Polar; document self-host compose.

---

## References

- [iroh](https://iroh.computer) / [n0-computer/iroh](https://github.com/n0-computer/iroh) — P2P QUIC, dial-by-key, relays  
- [iroh-blobs](https://github.com/n0-computer/iroh) — BLAKE3 verified streaming  
- [postcard](https://crates.io/crates/postcard) — compact serde format  
- [rkyv](https://rkyv.org) — zero-copy deserialization  
- [opaque-ke](https://crates.io/crates/opaque-ke) — RFC 9807 OPAQUE  
- [pakery](https://github.com/djx-y-z/pakery) — CPace / SPAKE2 / SPAKE2+ / OPAQUE suite  
- [Polar](https://polar.sh) — Apache-2.0 billing / MoR for OSS products  
- Internal: open-core architecture, Phase 8 high-perf transfers, feature research analysis
