# E2E Auth & Cert Pinning — Implementation Plan

**Branch:** `feat/e2e-auth-pake` · **Status:** crypto foundation landed; network wiring pending review.

## Goal
Make the advertised guarantee real: only a peer that knows the join code can mount
a share, and the QUIC connection is pinned to the host's real certificate so a
malicious/curious signal server (or network MITM) cannot impersonate the host or
read traffic. Today the host grants full access after only a protocol-version
check, and all clients use a skip-verification TLS endpoint — so neither holds.

## Why not the "simpler" design
A first instinct was to MAC the cert fingerprint with `BLAKE3(join_code)` and send
it through the signal server. That is **insecure**: the join code is ~2^30 entropy,
and the attacker sees `peer_id`, the fingerprint, and the MAC — enough to brute-force
the code offline in seconds. SPAKE2 exists precisely so the on-wire transcript does
**not** enable an offline dictionary attack. So all binding/proof must be keyed by the
**PAKE-derived key K**, never by the code directly.

## Landed in this branch (verifiable now, no network/CI needed)
`crates/teleport-core/src/crypto.rs` — key confirmation, fingerprint binding, session proof:
- `auth_tag(key, label, parts)` — keyed-BLAKE3 over length-prefixed, domain-separated inputs.
- `verify_tag(a, b)` — constant-time tag comparison.
- `host_confirmation` / `client_confirmation` — bind the PAKE transcript (both PAKE
  messages) + the host cert fingerprint under K.
- `hello_proof(key, session_id)` — client's QUIC-Hello proof of K, bound to the session.
- Adversarial unit tests: wrong code rejected, swapped fingerprint rejected, hello
  proof requires correct key + can't be replayed across sessions.

**Key fact driving the design:** `spake2::finish()` returns a key even on a wrong
password (the two sides just get *different* keys). Confirmation is the step that
rejects a wrong code — it is not optional.

## Remaining work (this is the reviewed PR's scope)

### 1. Wire real PAKE over the relay — `rendezvous.rs`
- Replace the "simulated" local key derivation in `connect()` (both sides deriving
  from the code) with a real exchange: client and host send their `outbound_message()`
  to each other via `SignalMessage::Relay`/`Relayed` (the relay now works post-Phase 8),
  then each calls `finish(peer_msg)` → K.
- After `finish`, exchange and verify confirmation tags (`host_confirmation` /
  `client_confirmation`). Abort on mismatch — this rejects a wrong code and a swapped
  fingerprint. Return K **and** the verified fingerprint in `RendezvousResult`.

### 2. Deliver + bind the cert fingerprint
- Add `cert_fingerprint: Option<[u8;32]>` (hex string on the wire) to `PeerInfo`
  (`teleport-signal/messages.rs`); the host fills it from `create_server_endpoint`.
- The fingerprint is *trusted only after* `host_confirmation` verifies under K (so the
  untrusted signal server cannot substitute it).

### 3. Pin the certificate — `client.rs` / `net.rs`
- Replace `create_client_endpoint()` (skip-verify) on the mount path with
  `create_client_endpoint_with_pinned_cert(fingerprint)` using the confirmed fingerprint.
- Thread the fingerprint + K from `rendezvous` → `wormhole-mount` (today the mount
  process is spawned with only `host_addr`; K and fp are dropped — must be passed,
  e.g. via env/stdin, not argv, to avoid leaking K in the process table).

### 4. Authenticate the QUIC Hello — `host.rs` / `client.rs`
- Client includes `hello_proof(K, session_id)` in (or immediately after) `Hello`.
  Note the host currently picks `session_id` in the HelloAck; reorder so the client
  can prove against a host-chosen nonce, or have the host send a nonce first.
- Host verifies the proof with `verify_tag` before serving; reject (close) otherwise.
  This replaces the version-only check and binds the QUIC session to the PAKE.

### 5. Online-guessing defenses — `teleport-signal`
- Per-IP rate limit + backoff on `JoinRoom` (audit finding F4: none today).
- Short room/code TTL tied to host presence.

## Testing (required before merge)
- In-process integration test (mirror `client.rs::e2e_host_serve_client_read_over_quic`):
  full join-code → PAKE → confirm → pinned QUIC → authenticated Hello → read, byte-exact.
- **Adversarial** integration tests: wrong code cannot mount; a client that skips the
  proof is rejected; a server presenting a different cert fails the pin.
- `security-review` skill against `docs/development/02-security-guide.md`.

## Merge gating
Do **not** solo-merge. A subtly-wrong version is worse than today's honest "no auth"
because it makes the E2E claim look true while false. Requires: restored GitHub Actions
(cross-platform CI is currently disabled) + human security review.
