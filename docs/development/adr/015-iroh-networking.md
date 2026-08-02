# ADR-015: iroh as networking substrate

## Status
**Accepted** (2026-08-02)

## Context
Custom quinn + STUN + WebSocket signal reinvented NAT traversal and discovery.

## Decision
Use **iroh 1.0** (`teleport-net`) for dial-by-key QUIC, relays, and address lookup. Keep Wormhole ALPN `wormhole/1` and `NetMessage` framing. Classic quinn path remains during migration.

## Consequences
- MSRV ≥ 1.91
- Self-hostable relays via `deploy/iroh-relay`
- Join codes still use SPAKE2; Endpoint IDs exchanged after PAKE
