#!/usr/bin/env bash
# Smoke-test playhead prefetch, project aperture, magnet/CAS helpers, peers mesh, playhead IPC.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BIN=(cargo run -q -p teleport-daemon --bin wormhole --)
unset NO_COLOR || true

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "==> wormhole init (aperture)"
"${BIN[@]}" init "$TMP"
test -f "$TMP/.wormhole/aperture.toml"
test -f "$TMP/.wormhole/config.toml"

echo "==> wormhole open"
"${BIN[@]}" open "$TMP" | grep -q "playhead_prefetch: true"
"${BIN[@]}" open "$TMP" | grep -q "content_addressed: true"

echo "==> wormhole playhead"
OUT="$("${BIN[@]}" playhead --inode 1 --offset 1310720)"
echo "$OUT" | grep -q "index=10"
echo "$OUT" | grep -q "index=11"

echo "==> wormhole playhead --apply (may warn if no mount)"
"${BIN[@]}" playhead --inode 1 --offset 0 --apply || true

echo "==> peers add / list / show / remove"
# Use a disposable peers.json via HOME override if needed; default registry is fine for smoke.
PEERS_HOME="$TMP/home"
mkdir -p "$PEERS_HOME"
export HOME="$PEERS_HOME"
export XDG_DATA_HOME="$PEERS_HOME/.local/share"
"${BIN[@]}" peers add 127.0.0.1:9 --name dummy
"${BIN[@]}" peers list | grep -q "127.0.0.1:9"
"${BIN[@]}" peers show 127.0.0.1:9 | grep -q "dummy"
"${BIN[@]}" peers remove 127.0.0.1:9

echo "==> magnet parse / fetch missing"
set +e
"${BIN[@]}" fetch blake3:0000000000000000000000000000000000000000000000000000000000000001
FETCH_RC=$?
set -e
test "$FETCH_RC" -ne 0

echo "==> unit tests (aperture / magnet / governor / host CAS / peers / playhead_ipc)"
cargo test -q -p teleport-daemon --lib -- \
  aperture magnet governor build_file_manifest handle_manifest dispatch_manifest \
  peers playhead_ipc mesh_prefers

echo "E2E revolutionary mesh OK"
# Optional remote fetch --from is skipped in CI (requires live host); use:
#   wormhole host <dir> &; wormhole fetch --from 127.0.0.1:<port> blake3:…
