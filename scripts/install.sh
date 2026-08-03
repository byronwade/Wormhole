#!/bin/bash
#
# Wormhole Installation Script
#
# Downloads and installs the Wormhole CLI from GitHub Releases.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/byronwade/Wormhole/main/scripts/install.sh | bash
#
# Or with a specific version:
#   curl -fsSL https://raw.githubusercontent.com/byronwade/Wormhole/main/scripts/install.sh | bash -s -- --version v0.1.0
#

set -euo pipefail

GITHUB_OWNER="${GITHUB_OWNER:-byronwade}"
GITHUB_REPO="${GITHUB_REPO:-Wormhole}"
INSTALL_DIR="${INSTALL_DIR:-/usr/local/bin}"
VERSION="${VERSION:-latest}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

detect_platform() {
    local os arch
    os="$(uname -s)"
    arch="$(uname -m)"

    case "$os" in
        Linux*) OS="linux" ;;
        Darwin*) OS="macos" ;;
        CYGWIN*|MINGW*|MSYS*) OS="windows" ;;
        *)
            log_error "Unsupported operating system: $os"
            exit 1
            ;;
    esac

    case "$arch" in
        x86_64|amd64) ARCH="x64" ;;
        arm64|aarch64) ARCH="arm64" ;;
        *)
            log_error "Unsupported architecture: $arch"
            exit 1
            ;;
    esac

    PLATFORM="${OS}-${ARCH}"
    log_info "Detected platform: $PLATFORM"
}

check_fuse() {
    case "$OS" in
        linux)
            if ! command -v fusermount &> /dev/null && ! command -v fusermount3 &> /dev/null; then
                log_warn "FUSE not found. Install with: sudo apt-get install fuse3"
            else
                log_success "FUSE found"
            fi
            ;;
        macos)
            if [ ! -d "/Library/Filesystems/macfuse.fs" ]; then
                log_warn "macFUSE not found. Install with: brew install --cask macfuse"
                log_warn "Full host/mount on macOS requires the Desktop DMG from GitHub Releases."
            else
                log_success "macFUSE found"
            fi
            ;;
    esac
}

get_latest_version() {
    log_info "Fetching latest version..."
    local release_url="https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest"

    if command -v curl &> /dev/null; then
        VERSION=$(curl -fsSL "$release_url" | grep '"tag_name":' | head -1 | sed -E 's/.*"([^"]+)".*/\1/')
    elif command -v wget &> /dev/null; then
        VERSION=$(wget -qO- "$release_url" | grep '"tag_name":' | head -1 | sed -E 's/.*"([^"]+)".*/\1/')
    else
        log_error "Neither curl nor wget found."
        exit 1
    fi

    if [ -z "$VERSION" ]; then
        log_error "Failed to fetch latest version."
        exit 1
    fi

    log_info "Latest version: $VERSION"
}

# Map platform → release asset name produced by .github/workflows/release.yml
artifact_name() {
    local version_num="${VERSION#v}"
    case "$PLATFORM" in
        linux-x64) echo "Wormhole-${version_num}-linux-x64.tar.gz" ;;
        linux-arm64) echo "Wormhole-${version_num}-linux-arm64.tar.gz" ;;
        macos-x64) echo "Wormhole-${version_num}-macos-x64.tar.gz" ;;
        macos-arm64) echo "Wormhole-${version_num}-macos-arm64.tar.gz" ;;
        windows-x64) echo "Wormhole-${version_num}-windows-x64.zip" ;;
        *)
            log_error "No CLI package mapping for $PLATFORM"
            exit 1
            ;;
    esac
}

download_and_install() {
    local artifact
    local download_url
    local tmp_dir
    artifact="$(artifact_name)"
    download_url="https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/${VERSION}/${artifact}"
    tmp_dir="$(mktemp -d)"
    # Clean temp on return from this function (not shell EXIT — avoids unbound var with set -u)
    trap 'rm -rf "'"$tmp_dir"'"' RETURN

    mkdir -p "$INSTALL_DIR"

    log_info "Downloading: $download_url"

    if command -v curl &> /dev/null; then
        if ! curl -fsSL "$download_url" -o "$tmp_dir/pkg"; then
            log_error "Download failed. Check that ${VERSION} has a ${artifact} asset."
            log_info "Releases: https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases"
            exit 1
        fi
    else
        wget -q "$download_url" -O "$tmp_dir/pkg"
    fi

    log_info "Extracting..."
    case "$artifact" in
        *.zip)
            if command -v unzip &> /dev/null; then
                unzip -q "$tmp_dir/pkg" -d "$tmp_dir"
            else
                log_error "unzip is required for Windows packages on this platform"
                exit 1
            fi
            ;;
        *)
            tar -xzf "$tmp_dir/pkg" -C "$tmp_dir"
            ;;
    esac

    # macOS CLI packages may only include wormhole-signal
    local has_cli=0
    if [ -f "$tmp_dir/wormhole" ] || [ -f "$tmp_dir/wormhole.exe" ]; then
        has_cli=1
    fi

    if [ "$has_cli" -eq 0 ]; then
        if [ "$OS" = "macos" ]; then
            log_warn "This macOS archive does not include the full wormhole CLI."
            log_info "Download the desktop DMG instead:"
            log_info "  https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/tag/${VERSION}"
            if [ -f "$tmp_dir/wormhole-signal" ]; then
                log_info "Installing wormhole-signal only..."
            else
                exit 1
            fi
        else
            log_error "Archive missing wormhole binary"
            exit 1
        fi
    fi

    log_info "Installing to $INSTALL_DIR..."
    install_bin() {
        local src="$1"
        local name
        name="$(basename "$src")"
        if [ -w "$INSTALL_DIR" ]; then
            mv "$src" "$INSTALL_DIR/$name"
            chmod +x "$INSTALL_DIR/$name"
        else
            sudo mv "$src" "$INSTALL_DIR/$name"
            sudo chmod +x "$INSTALL_DIR/$name"
        fi
    }

    for bin in wormhole wormhole.exe wormhole-mount wormhole-mount.exe wormhole-signal wormhole-signal.exe; do
        if [ -f "$tmp_dir/$bin" ]; then
            install_bin "$tmp_dir/$bin"
        fi
    done

    log_success "Installation complete!"
}

verify_installation() {
    if [ -x "$INSTALL_DIR/wormhole" ]; then
        log_success "Wormhole CLI installed to $INSTALL_DIR/wormhole"
        "$INSTALL_DIR/wormhole" --help | head -5 || true
        if ! command -v wormhole &> /dev/null; then
            log_warn "Add $INSTALL_DIR to your PATH to run 'wormhole' from anywhere"
        fi
        log_info "Run '$INSTALL_DIR/wormhole --help' to get started"
    elif [ -x "$INSTALL_DIR/wormhole-signal" ]; then
        log_success "wormhole-signal installed to $INSTALL_DIR/wormhole-signal"
        log_warn "Full CLI not in this package — use the desktop app for host/mount on macOS"
    else
        log_error "Installation verification failed under $INSTALL_DIR"
        exit 1
    fi
}

parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --version|-v) VERSION="$2"; shift 2 ;;
            --dir|-d) INSTALL_DIR="$2"; shift 2 ;;
            --help|-h)
                echo "Wormhole Installation Script"
                echo "Usage: $0 [--version vX.Y.Z] [--dir DIR]"
                exit 0
                ;;
            *) log_error "Unknown option: $1"; exit 1 ;;
        esac
    done
}

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
