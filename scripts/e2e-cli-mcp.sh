#!/usr/bin/env bash
# Extreme E2E: wormhole-ctl control plane + host/probe/mount + MCP binary smoke.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SOCK="${WORMHOLE_CONTROL_SOCK:-/tmp/wormhole-e2e-control.sock}"
export WORMHOLE_CONTROL_SOCK="$SOCK"
export WORMHOLE_NO_FUSE=1
rm -f "$SOCK"

echo "==> Building wormhole-ctl + wormhole-mcp + wormhole"
cargo build -q -p teleport-service -p teleport-mcp -p teleport-daemon

CTL="$ROOT/target/debug/wormhole-ctl"
MCP="$ROOT/target/debug/wormhole-mcp"
WH="$ROOT/target/debug/wormhole"

SHARE="$(mktemp -d)"
trap 'rm -rf "$SHARE"; "$CTL" shutdown >/dev/null 2>&1 || true; rm -f "$SOCK"' EXIT
echo "hello e2e" >"$SHARE/note.txt"
mkdir -p "$SHARE/clips"
echo "clip" >"$SHARE/clips/01.txt"

echo "==> Feature matrix"
"$CTL" features | grep -q host_start

echo "==> Doctor (offline)"
"$CTL" doctor | grep -q protocol

echo "==> Start control plane"
"$CTL" serve &
SERVE_PID=$!
for i in $(seq 1 50); do
  if [[ -S "$SOCK" ]]; then break; fi
  sleep 0.1
done
[[ -S "$SOCK" ]] || { echo "control socket missing"; exit 1; }

echo "==> Ping"
"$CTL" ping | grep -q pong

echo "==> Host start"
HOST_JSON="$("$CTL" host start "$SHARE" --id e2e-host --name e2e)"
echo "$HOST_JSON"
PORT="$(echo "$HOST_JSON" | python3 -c 'import sys,json; print(json.load(sys.stdin)["port"])')"
CODE="$(echo "$HOST_JSON" | python3 -c 'import sys,json; print(json.load(sys.stdin)["join_code"])')"
[[ -n "$PORT" && -n "$CODE" ]]

echo "==> Probe"
PROBE="$("$CTL" probe "127.0.0.1:$PORT")"
echo "$PROBE" | grep -q note.txt
echo "$PROBE" | grep -q clips

echo "==> Mount data-plane"
"$CTL" mount start "127.0.0.1:$PORT" --id e2e-mount --data-plane-only | grep -q e2e-mount

echo "==> Status via wormhole-ctl"
"$CTL" status | grep -q e2e-host

echo "==> Status via wormhole (delegates when ctl available)"
PATH="$(dirname "$CTL"):$PATH" env -u NO_COLOR "$WH" status | grep -q e2e-host

echo "==> List hosts/mounts"
"$CTL" host list | grep -q e2e-host
"$CTL" mount list | grep -q e2e-mount

echo "==> Cache + generate code"
"$CTL" cache stats >/dev/null
CODE_OUT="$("$CTL" generate-code)"
echo "$CODE_OUT" | grep -Eq '[A-Z0-9]{3}-[A-Z0-9]{3}'

echo "==> MCP binary present"
test -x "$MCP"

echo "==> Stop sessions"
"$CTL" mount stop e2e-mount >/dev/null
"$CTL" host stop e2e-host >/dev/null
"$CTL" shutdown >/dev/null || true
# Control plane should exit; don't hang the suite if it doesn't.
for _ in $(seq 1 30); do
  if ! kill -0 "$SERVE_PID" 2>/dev/null; then break; fi
  sleep 0.1
done
kill "$SERVE_PID" 2>/dev/null || true
wait "$SERVE_PID" 2>/dev/null || true

echo "E2E CLI/MCP OK"
