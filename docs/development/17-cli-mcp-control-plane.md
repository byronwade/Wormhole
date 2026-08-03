# CLI + MCP Control Plane

Wormhole exposes the **same session feature surface** through:

| Surface | Binary | Transport |
|---------|--------|-----------|
| Desktop | Tauri app | in-process `AppState` |
| Control CLI | `wormhole-ctl` | Unix socket JSON control plane |
| MCP | `wormhole-mcp` / `wormhole mcp` | MCP stdio tools |
| Classic CLI | `wormhole` | host/mount helpers + delegates status/mcp |

## Quick start

```bash
# Terminal A — long-lived session manager
cargo run -p teleport-service --bin wormhole-ctl -- serve

# Terminal B — host + probe (no FUSE)
wormhole-ctl host start ./renders --id studio
wormhole-ctl probe 127.0.0.1:<port>
wormhole-ctl mount start 127.0.0.1:<port> --data-plane-only
wormhole-ctl status

# MCP (Claude / Cursor)
cargo run -p teleport-mcp
# or: wormhole mcp
```

### MCP client config

```json
{
  "mcpServers": {
    "wormhole": {
      "command": "wormhole-mcp",
      "args": []
    }
  }
}
```

## Feature parity

Canonical matrix: `teleport_service::FEATURE_SURFACE` (`crates/teleport-service/src/parity.rs`).

Every desktop feature has `cli: true` and `mcp: true`. CI and unit tests fail if that drifts.

## Testing

```bash
# Library + integration e2e
cargo test -p teleport-service -p teleport-mcp

# Scripted control-plane e2e
./scripts/e2e-cli-mcp.sh
```

## Production notes

- Prefer `data_plane_only` / `WORMHOLE_NO_FUSE=1` in CI and agent environments.
- Control socket default: platform data dir `…/wormhole/control.sock` (override with `WORMHOLE_CONTROL_SOCK`).
- MCP logs go to **stderr** only; stdout is the protocol.
- `wormhole status` shells out to `wormhole-ctl status` when the control plane is up.
