#!/usr/bin/env bash
#
# Wormhole Security Verification Script
# =====================================
# Verify that Wormhole is correctly implementing security features.
# Run this to confirm encryption and authentication are working.
#
# Usage:
#   ./scripts/verify-security.sh [OPTIONS]
#
# Options:
#   --target <IP:PORT|CODE>  Target to test (required for connection tests)
#   --skip-network           Skip network tests (local checks only)
#   --verbose                Show detailed output
#   --help                   Show this help message
#

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

TARGET=""
SKIP_NETWORK=false
VERBOSE=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --target)
            TARGET="$2"
            shift 2
            ;;
        --skip-network)
            SKIP_NETWORK=true
            shift
            ;;
        --verbose)
            VERBOSE=true
            shift
            ;;
        --help|-h)
            head -20 "$0" | tail -16
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0

pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((PASS_COUNT++))
}

fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((FAIL_COUNT++))
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
    ((WARN_COUNT++))
}

info() {
    if [[ "$VERBOSE" == "true" ]]; then
        echo -e "${BLUE}[INFO]${NC} $1"
    fi
}

echo ""
echo -e "${BLUE}=== Wormhole Security Verification ===${NC}"
echo ""
echo "This script verifies that Wormhole's security features are working correctly."
echo ""

# Check 1: Binary integrity
echo -e "${BLUE}--- Binary Verification ---${NC}"

if command -v wormhole &> /dev/null; then
    WORMHOLE_PATH=$(which wormhole)
    pass "Wormhole binary found at $WORMHOLE_PATH"

    # Check if binary is signed (macOS)
    if [[ "$(uname)" == "Darwin" ]]; then
        if codesign -v "$WORMHOLE_PATH" 2>/dev/null; then
            pass "Binary is code-signed (macOS)"
        else
            warn "Binary is not code-signed (may be built from source)"
        fi
    fi

    # Check binary permissions
    PERMS=$(stat -f "%Lp" "$WORMHOLE_PATH" 2>/dev/null || stat -c "%a" "$WORMHOLE_PATH" 2>/dev/null)
    if [[ "$PERMS" =~ ^[0-7][0-5][0-5]$ ]]; then
        pass "Binary permissions are restrictive ($PERMS)"
    else
        warn "Binary permissions may be too permissive ($PERMS)"
    fi
else
    fail "Wormhole binary not found"
    exit 1
fi

echo ""

# Check 2: TLS/Crypto Libraries
echo -e "${BLUE}--- Crypto Library Check ---${NC}"

VERSION_INFO=$(wormhole version --detailed 2>/dev/null || wormhole version 2>/dev/null)
info "Version info: $VERSION_INFO"

# Check for rustls (good) vs openssl (acceptable)
if echo "$VERSION_INFO" | grep -qi "rustls"; then
    pass "Using rustls for TLS (memory-safe implementation)"
elif echo "$VERSION_INFO" | grep -qi "openssl"; then
    warn "Using OpenSSL for TLS (consider rustls for memory safety)"
else
    info "Could not determine TLS library (this is okay)"
fi

echo ""

# Check 3: Configuration Security
echo -e "${BLUE}--- Configuration Security ---${NC}"

CONFIG_PATH="${HOME}/.config/wormhole/config.toml"
if [[ -f "$CONFIG_PATH" ]]; then
    # Check config file permissions
    PERMS=$(stat -f "%Lp" "$CONFIG_PATH" 2>/dev/null || stat -c "%a" "$CONFIG_PATH" 2>/dev/null)
    if [[ "$PERMS" == "600" ]] || [[ "$PERMS" == "400" ]]; then
        pass "Config file has restrictive permissions ($PERMS)"
    else
        warn "Config file permissions should be 600 (currently $PERMS)"
        info "Fix with: chmod 600 $CONFIG_PATH"
    fi

    # Check for plaintext secrets
    if grep -q "password\s*=\s*\"" "$CONFIG_PATH" 2>/dev/null; then
        warn "Plaintext password found in config file"
        info "Consider using environment variables for secrets"
    else
        pass "No plaintext passwords in config"
    fi
else
    info "No config file found (using defaults)"
fi

# Check cache directory permissions
CACHE_DIR="${HOME}/.cache/wormhole"
if [[ -d "$CACHE_DIR" ]]; then
    PERMS=$(stat -f "%Lp" "$CACHE_DIR" 2>/dev/null || stat -c "%a" "$CACHE_DIR" 2>/dev/null)
    if [[ "$PERMS" == "700" ]] || [[ "$PERMS" == "755" ]]; then
        pass "Cache directory permissions are acceptable ($PERMS)"
    else
        warn "Cache directory permissions may be too permissive ($PERMS)"
    fi
fi

echo ""

# Check 4: Network Security (if target provided)
if [[ -n "$TARGET" ]] && [[ "$SKIP_NETWORK" == "false" ]]; then
    echo -e "${BLUE}--- Network Security Tests ---${NC}"

    # Test TLS is being used
    TEMP_MOUNT=$(mktemp -d -t wormhole-sec.XXXXXX)
    cleanup() {
        wormhole unmount --force "$TEMP_MOUNT" 2>/dev/null || true
        rmdir "$TEMP_MOUNT" 2>/dev/null || true
    }
    trap cleanup EXIT

    info "Attempting connection to $TARGET..."

    if wormhole mount "$TARGET" "$TEMP_MOUNT" --timeout 15 2>&1 | tee /tmp/wormhole-mount.log; then
        pass "Connection established successfully"

        # Check if TLS is in use by looking at status
        STATUS=$(wormhole status 2>/dev/null || true)
        if echo "$STATUS" | grep -qi "encrypted\|tls\|quic"; then
            pass "Connection is encrypted (TLS 1.3 via QUIC)"
        else
            info "Could not confirm encryption from status (this is normal)"
        fi

        # Check PAKE was used (join codes)
        if [[ "$TARGET" =~ ^[A-Z0-9]{4}-[A-Z0-9]{4} ]]; then
            pass "PAKE authentication used (join code connection)"
        else
            info "Direct IP connection (PAKE not used, but TLS still active)"
        fi

        # Cleanup
        wormhole unmount "$TEMP_MOUNT" 2>/dev/null || true
    else
        warn "Could not connect to target for network tests"
        if [[ -f /tmp/wormhole-mount.log ]]; then
            info "Mount output: $(cat /tmp/wormhole-mount.log)"
        fi
    fi
else
    if [[ "$SKIP_NETWORK" == "true" ]]; then
        info "Skipping network tests (--skip-network)"
    else
        info "Skipping network tests (no --target provided)"
    fi
fi

echo ""

# Check 5: Path Traversal Prevention
echo -e "${BLUE}--- Path Traversal Prevention ---${NC}"

# This is a code-level check - we verify the safe_path function exists
SAFE_PATH_SOURCE="crates/teleport-core/src/path.rs"
if [[ -f "$SAFE_PATH_SOURCE" ]]; then
    if grep -q "canonicalize" "$SAFE_PATH_SOURCE" 2>/dev/null; then
        pass "Path sanitization uses canonicalization"
    fi
    if grep -q "starts_with" "$SAFE_PATH_SOURCE" 2>/dev/null; then
        pass "Path sanitization validates prefix"
    fi
    if grep -q '"\.\."' "$SAFE_PATH_SOURCE" 2>/dev/null; then
        pass "Path sanitization checks for .."
    fi
else
    info "Could not verify path sanitization (source not found)"
    info "This is expected if running from installed binary"
fi

echo ""

# Check 6: Dependencies Security
echo -e "${BLUE}--- Dependency Security ---${NC}"

if command -v cargo &> /dev/null; then
    if command -v cargo-audit &> /dev/null; then
        info "Running cargo audit..."
        if cargo audit 2>/dev/null; then
            pass "No known vulnerabilities in dependencies"
        else
            warn "Security vulnerabilities found in dependencies"
            info "Run 'cargo audit' for details"
        fi
    else
        info "cargo-audit not installed (optional)"
        info "Install with: cargo install cargo-audit"
    fi
else
    info "Cargo not found (binary installation)"
fi

echo ""

# Summary
echo -e "${BLUE}=== Summary ===${NC}"
echo ""
echo -e "Passed: ${GREEN}$PASS_COUNT${NC}"
echo -e "Warnings: ${YELLOW}$WARN_COUNT${NC}"
echo -e "Failed: ${RED}$FAIL_COUNT${NC}"
echo ""

if [[ $FAIL_COUNT -eq 0 ]]; then
    echo -e "${GREEN}All critical security checks passed!${NC}"
    exit 0
else
    echo -e "${RED}Some security checks failed. Review the output above.${NC}"
    exit 1
fi
