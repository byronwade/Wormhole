#!/bin/bash
#
# Wormhole Installation Script
#
# This script downloads and installs the Wormhole CLI tool.
# It automatically detects your platform and installs the appropriate binary.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/wormhole-team/wormhole/main/scripts/install.sh | bash
#
# Or with a specific version:
#   curl -fsSL https://raw.githubusercontent.com/wormhole-team/wormhole/main/scripts/install.sh | bash -s -- --version v0.1.0
#

set -euo pipefail

# Configuration
GITHUB_OWNER="${GITHUB_OWNER:-wormhole-team}"
GITHUB_REPO="${GITHUB_REPO:-wormhole}"
INSTALL_DIR="${INSTALL_DIR:-/usr/local/bin}"
VERSION="${VERSION:-latest}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
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

# Detect platform
detect_platform() {
    local os
    local arch

    os="$(uname -s)"
    arch="$(uname -m)"

    case "$os" in
        Linux*)
            OS="linux"
            ;;
        Darwin*)
            OS="macos"
            ;;
        CYGWIN*|MINGW*|MSYS*)
            OS="windows"
            ;;
        *)
            log_error "Unsupported operating system: $os"
            exit 1
            ;;
    esac

    case "$arch" in
        x86_64|amd64)
            ARCH="x86_64"
            ;;
        arm64|aarch64)
            ARCH="aarch64"
            ;;
        *)
            log_error "Unsupported architecture: $arch"
            exit 1
            ;;
    esac

    PLATFORM="${OS}-${ARCH}"
    log_info "Detected platform: $PLATFORM"
}

# Check for FUSE
check_fuse() {
    case "$OS" in
        linux)
            if ! command -v fusermount &> /dev/null && ! command -v fusermount3 &> /dev/null; then
                log_warn "FUSE not found. Installing wormhole, but you'll need FUSE to mount filesystems."
                log_info "Install with: sudo apt-get install fuse3 (Debian/Ubuntu) or sudo dnf install fuse3 (Fedora)"
            else
                log_success "FUSE found"
            fi
            ;;
        macos)
            if [ ! -d "/Library/Filesystems/macfuse.fs" ]; then
                log_warn "macFUSE not found. Installing wormhole, but you'll need macFUSE to mount filesystems."
                log_info "Install with: brew install --cask macfuse"
            else
                log_success "macFUSE found"
            fi
            ;;
    esac
}

# Get latest version from GitHub
get_latest_version() {
    log_info "Fetching latest version..."

    local release_url="https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest"

    if command -v curl &> /dev/null; then
        VERSION=$(curl -fsSL "$release_url" | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/')
    elif command -v wget &> /dev/null; then
        VERSION=$(wget -qO- "$release_url" | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/')
    else
        log_error "Neither curl nor wget found. Please install one of them."
        exit 1
    fi

    if [ -z "$VERSION" ]; then
        log_error "Failed to fetch latest version. Check your internet connection."
        exit 1
    fi

    log_info "Latest version: $VERSION"
}

# Download and install
download_and_install() {
    local version_num="${VERSION#v}"
    local artifact_name="wormhole-${PLATFORM}"
    local download_url="https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/${VERSION}/${artifact_name}.tar.gz"
    local tmp_dir

    tmp_dir="$(mktemp -d)"
    trap 'rm -rf "$tmp_dir"' EXIT

    log_info "Downloading from: $download_url"

    if command -v curl &> /dev/null; then
        curl -fsSL "$download_url" -o "$tmp_dir/wormhole.tar.gz"
    elif command -v wget &> /dev/null; then
        wget -q "$download_url" -O "$tmp_dir/wormhole.tar.gz"
    fi

    log_info "Extracting..."
    tar -xzf "$tmp_dir/wormhole.tar.gz" -C "$tmp_dir"

    # Install binaries
    log_info "Installing to $INSTALL_DIR..."

    if [ -w "$INSTALL_DIR" ]; then
        mv "$tmp_dir/wormhole" "$INSTALL_DIR/"
        [ -f "$tmp_dir/wormhole-signal" ] && mv "$tmp_dir/wormhole-signal" "$INSTALL_DIR/"
        [ -f "$tmp_dir/wormhole-mount" ] && mv "$tmp_dir/wormhole-mount" "$INSTALL_DIR/"
    else
        log_info "Elevated permissions required. Please enter your password:"
        sudo mv "$tmp_dir/wormhole" "$INSTALL_DIR/"
        [ -f "$tmp_dir/wormhole-signal" ] && sudo mv "$tmp_dir/wormhole-signal" "$INSTALL_DIR/"
        [ -f "$tmp_dir/wormhole-mount" ] && sudo mv "$tmp_dir/wormhole-mount" "$INSTALL_DIR/"
    fi

    chmod +x "$INSTALL_DIR/wormhole"
    [ -f "$INSTALL_DIR/wormhole-signal" ] && chmod +x "$INSTALL_DIR/wormhole-signal"
    [ -f "$INSTALL_DIR/wormhole-mount" ] && chmod +x "$INSTALL_DIR/wormhole-mount"

    log_success "Installation complete!"
}

# Verify installation
verify_installation() {
    if command -v wormhole &> /dev/null; then
        log_success "Wormhole installed successfully!"
        echo
        wormhole version
        echo
        log_info "Run 'wormhole --help' to get started"
    else
        log_error "Installation verification failed. Make sure $INSTALL_DIR is in your PATH."
        exit 1
    fi
}

# Parse arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --version|-v)
                VERSION="$2"
                shift 2
                ;;
            --dir|-d)
                INSTALL_DIR="$2"
                shift 2
                ;;
            --help|-h)
                echo "Wormhole Installation Script"
                echo
                echo "Usage: $0 [options]"
                echo
                echo "Options:"
                echo "  --version, -v VERSION    Install specific version (default: latest)"
                echo "  --dir, -d DIR            Install to specific directory (default: /usr/local/bin)"
                echo "  --help, -h               Show this help message"
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                exit 1
                ;;
        esac
    done
}

# Main
main() {
    echo "====================================="
    echo "   Wormhole Installation Script"
    echo "====================================="
    echo

    parse_args "$@"
    detect_platform
    check_fuse

    if [ "$VERSION" = "latest" ]; then
        get_latest_version
    fi

    download_and_install
    verify_installation

    echo
    log_success "Done! Enjoy Wormhole!"
}

main "$@"
