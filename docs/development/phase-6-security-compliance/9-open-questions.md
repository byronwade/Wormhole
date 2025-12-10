# Phase 6 Open Questions - RESOLVED

## Q1: Do we add TURN/relay fallback for symmetric NATs, and when?

**Decision:**
- **Phase 6:** Yes, implement TURN fallback
- **Default:** Off (direct connection preferred)
- **Trigger:** Auto-enable after 3 failed direct connection attempts

**Implementation:**
```
Connection Flow:
1. Try direct QUIC (using ICE candidates from STUN)
2. If fails → Try QUIC with hole punching
3. If fails → Offer TURN relay with user consent
```

**TURN considerations:**
- Self-hosted TURN server (coturn) for production
- ~10-20% of corporate networks have symmetric NATs
- Relay adds latency but ensures connectivity
- Bandwidth costs for relayed traffic

**Config:**
```toml
[network]
allow_relay = true
relay_servers = ["turn:relay.wormhole.run:3478"]
```

---

## Q2: Preferred production signal host and TLS termination strategy?

**Decision:**

**Signal server deployment:**
- **Primary:** signal.wormhole.run (Fly.io, multi-region)
- **Fallback:** Self-hosted option for enterprise users
- **TLS:** Terminated at Fly.io edge (Let's Encrypt)

**Architecture:**
```
┌─────────────────────────────────────────────┐
│                  Fly.io                      │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐     │
│  │ SJC     │  │ IAD     │  │ AMS     │     │
│  │ Signal  │  │ Signal  │  │ Signal  │     │
│  │ Server  │  │ Server  │  │ Server  │     │
│  └─────────┘  └─────────┘  └─────────┘     │
│       ↓           ↓           ↓            │
│     Anycast routing to nearest region      │
└─────────────────────────────────────────────┘
```

**Why Fly.io:**
- Global anycast = low latency
- WebSocket support out of the box
- Automatic TLS
- Easy horizontal scaling
- Free tier covers MVP

---

## Q3: Code format/policy (length, charset, TTL) and rate limits to prevent abuse?

**Decision:**

**Join code format:**
- **Length:** 6 characters
- **Charset:** `23456789ABCDEFGHJKLMNPQRSTUVWXYZ` (no 0/O/1/l confusion)
- **Format:** `XXX-XXX` (dash for readability)
- **TTL:** 5 minutes (configurable up to 24 hours)

**Rate limits:**
| Action | Limit | Window |
|--------|-------|--------|
| Create room | 10 | per minute |
| Join attempts | 5 | per minute per code |
| Failed joins | 20 | per hour per IP |
| WebSocket connections | 50 | concurrent per IP |

**Abuse prevention:**
- Codes expire after TTL
- Failed attempts rate-limited
- IP-based throttling
- Optional CAPTCHA for public signal servers

**Config:**
```toml
[join_code]
length = 6
ttl_minutes = 5
max_attempts = 5
```

---

## Q4: How to persist/join with codes securely across app restarts? Should codes rotate?

**Decision:**

**Persistence:**
- **Codes:** Stored in OS keychain (Keyring on macOS/Windows, libsecret on Linux)
- **Connection state:** SQLite database (encrypted at rest)
- **On restart:** Re-authenticate with stored credentials

**Rotation policy:**
- **Host codes:** Rotate on each session start
- **Persistent rooms:** Optional static code (requires host approval)
- **Compromised code:** Revoke via signal server

**Implementation:**
```rust
// Store in keychain
keyring::set_password("wormhole", "join_code", &code)?;

// Retrieve on restart
let code = keyring::get_password("wormhole", "join_code")?;

// Validate still active
signal_server.validate_code(&code).await?;
```

**Security considerations:**
- Never store codes in plain text config files
- Codes are short-lived by default (5 min)
- Long-lived codes require explicit user action
- Revocation propagates immediately via signal server
