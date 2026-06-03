#!/bin/bash
#
# Wormhole - macOS Gatekeeper Fix
#
# This script removes the quarantine attribute from Wormhole.app,
# allowing it to run without the "unidentified developer" warning.
#
# WHY IS THIS NEEDED?
# Apple charges $99/year for a Developer ID certificate. Without it,
# macOS shows a security warning. This is a code signing issue, not
# a safety issue - Wormhole is open source and you can verify the code.
#
# WHAT THIS SCRIPT DOES:
# Removes the "com.apple.quarantine" extended attribute that macOS
# adds to downloaded applications.
#
# Usage:
#   ./macos-fix-gatekeeper.sh
#
# Or run directly:
#   curl -fsSL https://raw.githubusercontent.com/byronwade/Wormhole/main/scripts/macos-fix-gatekeeper.sh | bash
#

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}"
echo "╔════════════════════════════════════════════════════════════╗"
echo "║           Wormhole - macOS Gatekeeper Fix                  ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Common locations to check
APP_LOCATIONS=(
    "/Applications/Wormhole.app"
    "$HOME/Applications/Wormhole.app"
    "$HOME/Downloads/Wormhole.app"
    "/Volumes/Wormhole/Wormhole.app"
)

APP_PATH=""

# Find the app
echo -e "${BLUE}[1/3]${NC} Looking for Wormhole.app..."

for loc in "${APP_LOCATIONS[@]}"; do
    if [ -d "$loc" ]; then
        APP_PATH="$loc"
        echo -e "  ${GREEN}Found:${NC} $APP_PATH"
        break
    fi
done

# If not found in common locations, ask user
if [ -z "$APP_PATH" ]; then
    echo -e "  ${YELLOW}Not found in common locations.${NC}"
    echo ""
    echo -e "  Please drag Wormhole.app into this terminal window,"
    echo -e "  or type the full path, then press Enter:"
    echo ""
    read -r -p "  Path: " USER_PATH

    # Remove quotes if present
    USER_PATH="${USER_PATH%\"}"
    USER_PATH="${USER_PATH#\"}"
    USER_PATH="${USER_PATH%\'}"
    USER_PATH="${USER_PATH#\'}"

    if [ -d "$USER_PATH" ]; then
        APP_PATH="$USER_PATH"
    else
        echo -e "${RED}[ERROR]${NC} Could not find app at: $USER_PATH"
        exit 1
    fi
fi

# Check quarantine status
echo ""
echo -e "${BLUE}[2/3]${NC} Checking quarantine status..."

QUARANTINE_ATTR=$(xattr -l "$APP_PATH" 2>/dev/null | grep "com.apple.quarantine" || true)

if [ -z "$QUARANTINE_ATTR" ]; then
    echo -e "  ${GREEN}No quarantine attribute found.${NC}"
    echo -e "  The app should already work! Try opening it."
    echo ""
    echo -e "  If you still see a warning, try:"
    echo -e "  ${CYAN}Right-click → Open → Click 'Open' in the dialog${NC}"
    exit 0
fi

echo -e "  ${YELLOW}Quarantine attribute found.${NC} Removing..."

# Remove quarantine
echo ""
echo -e "${BLUE}[3/3]${NC} Removing quarantine attribute..."

# Try without sudo first
if xattr -cr "$APP_PATH" 2>/dev/null; then
    echo -e "  ${GREEN}Success!${NC} Quarantine removed."
else
    echo -e "  ${YELLOW}Need elevated permissions...${NC}"
    sudo xattr -cr "$APP_PATH"
    echo -e "  ${GREEN}Success!${NC} Quarantine removed."
fi

# Verify
QUARANTINE_CHECK=$(xattr -l "$APP_PATH" 2>/dev/null | grep "com.apple.quarantine" || true)

if [ -z "$QUARANTINE_CHECK" ]; then
    echo ""
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                    All Done!                               ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "  You can now open Wormhole normally."
    echo ""
    echo -e "  ${CYAN}Opening Wormhole...${NC}"
    open "$APP_PATH" 2>/dev/null || true
else
    echo -e "${RED}[ERROR]${NC} Failed to remove quarantine. Try running:"
    echo -e "  ${CYAN}sudo xattr -cr \"$APP_PATH\"${NC}"
fi

echo ""
echo -e "${BLUE}Why did this happen?${NC}"
echo "  Apple charges \$99/year for code signing certificates."
echo "  Wormhole is free, open-source software - we can't justify that cost."
echo "  The app is safe - verify at: https://github.com/byronwade/Wormhole"
echo ""
