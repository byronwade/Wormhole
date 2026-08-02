# ADR-016: postcard superseding bincode

## Status
**Accepted** (2026-08-02)

## Context
bincode 1.x is legacy; we need a maintained compact codec with dual-decode.

## Decision
- Prefer **postcard** (`WireCodec::Postcard`) negotiated via `codec:postcard` capability
- Keep bincode encode/decode for Hello bootstrap and legacy peers
- Protocol version bumped to **2**

## Consequences
- `serialize_with_codec` / `deserialize_with_codec` in `teleport-core`
- Daemon advertises postcard in host/client capabilities
