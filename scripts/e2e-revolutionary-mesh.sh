#!/usr/bin/env bash
# Smoke-test playhead prefetch, project aperture, and magnet/CAS helpers.
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

echo "==> magnet parse / fetch missing"
set +e
"${BIN[@]}" fetch blake3:0000000000000000000000000000000000000000000000000000000000000001
FETCH_RC=$?
set -e
test "$FETCH_RC" -ne 0

echo "==> unit tests (aperture / magnet / governor / host CAS)"
cargo test -q -p teleport-daemon --lib -- \
  aperture magnet governor build_file_manifest handle_manifest dispatch_manifest

echo "E2E revolutionary mesh OK"
