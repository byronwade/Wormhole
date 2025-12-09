#!/bin/bash
#
# Wormhole Uninstallation Script
#
# This script removes the Wormhole CLI tool from your system.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/wormhole-team/wormhole/main/scripts/uninstall.sh | bash
#

set -euo pipefail

# Configuration
INSTALL_DIR="${INSTALL_DIR:-/usr/local/bin}"
CONFIG_DIR="${HOME}/.config/wormhole"
CACHE_DIR="${HOME}/.cache/wormhole"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Remove binaries
remove_binaries() {
    log_info "Removing binaries from $INSTALL_DIR..."

    local files=("wormhole" "wormhole-signal" "wormhole-mount")

    for file in "${files[@]}"; do
        local path="$INSTALL_DIR/$file"
        if [ -f "$path" ]; then
            if [ -w "$path" ]; then
                rm -f "$path"
            else
                sudo rm -f "$path"
            fi
            log_success "Removed $path"
        fi
    done
}

# Remove config
remove_config() {
    if [ -d "$CONFIG_DIR" ]; then
        read -p "Remove configuration directory ($CONFIG_DIR)? [y/N] " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            rm -rf "$CONFIG_DIR"
            log_success "Removed $CONFIG_DIR"
        else
            log_info "Keeping configuration directory"
        fi
    fi
}

# Remove cache
remove_cache() {
    if [ -d "$CACHE_DIR" ]; then
        read -p "Remove cache directory ($CACHE_DIR)? [y/N] " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            rm -rf "$CACHE_DIR"
            log_success "Removed $CACHE_DIR"
        else
            log_info "Keeping cache directory"
        fi
    fi
}

# Main
main() {
    echo "====================================="
    echo "   Wormhole Uninstallation Script"
    echo "====================================="
    echo

    remove_binaries
    remove_config
    remove_cache

    echo
    log_success "Wormhole has been uninstalled."
    log_info "Thank you for using Wormhole!"
}

main "$@"
