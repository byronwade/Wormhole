#!/usr/bin/env bash
#
# Wormhole Benchmark Script
# =========================
# Run performance benchmarks to verify Wormhole performance on your system.
#
# Usage:
#   ./scripts/benchmark.sh [OPTIONS]
#
# Options:
#   --target <IP:PORT|CODE>  Target host to benchmark (required)
#   --duration <seconds>     Duration for each test (default: 10)
#   --output <file>          Output file for results (default: stdout)
#   --format <text|json>     Output format (default: text)
#   --test <type>            Test type: all, read, write, latency, metadata
#   --help                   Show this help message
#
# Examples:
#   ./scripts/benchmark.sh --target 192.168.1.42:4433
#   ./scripts/benchmark.sh --target WORM-XXXX-YYYY --duration 30 --output results.json --format json
#

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Default values
TARGET=""
DURATION=10
OUTPUT=""
FORMAT="text"
TEST_TYPE="all"
MOUNT_POINT=""
TEMP_DIR=""

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --target)
            TARGET="$2"
            shift 2
            ;;
        --duration)
            DURATION="$2"
            shift 2
            ;;
        --output)
            OUTPUT="$2"
            shift 2
            ;;
        --format)
            FORMAT="$2"
            shift 2
            ;;
        --test)
            TEST_TYPE="$2"
            shift 2
            ;;
        --help|-h)
            head -30 "$0" | tail -25
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Validate target
if [[ -z "$TARGET" ]]; then
    echo -e "${RED}Error: --target is required${NC}"
    echo "Usage: $0 --target <IP:PORT|CODE> [OPTIONS]"
    exit 1
fi

# Check for wormhole binary
if ! command -v wormhole &> /dev/null; then
    echo -e "${RED}Error: wormhole command not found${NC}"
    echo "Please install wormhole first: https://wormhole.app/docs/installation"
    exit 1
fi

# Create temporary mount point
cleanup() {
    if [[ -n "$MOUNT_POINT" && -d "$MOUNT_POINT" ]]; then
        echo -e "${YELLOW}Cleaning up...${NC}"
        wormhole unmount --force "$MOUNT_POINT" 2>/dev/null || true
        rmdir "$MOUNT_POINT" 2>/dev/null || true
    fi
    if [[ -n "$TEMP_DIR" && -d "$TEMP_DIR" ]]; then
        rm -rf "$TEMP_DIR"
    fi
}
trap cleanup EXIT

MOUNT_POINT=$(mktemp -d -t wormhole-bench.XXXXXX)
TEMP_DIR=$(mktemp -d -t wormhole-bench-data.XXXXXX)

# Results storage
declare -A RESULTS

log() {
    if [[ "$FORMAT" == "text" ]]; then
        echo -e "$1"
    fi
}

# Mount the target
log "${BLUE}=== Wormhole Benchmark ===${NC}"
log ""
log "Target: ${PURPLE}$TARGET${NC}"
log "Duration: ${DURATION}s per test"
log "Mount point: $MOUNT_POINT"
log ""

log "${YELLOW}Mounting...${NC}"
MOUNT_START=$(date +%s.%N)
if ! wormhole mount "$TARGET" "$MOUNT_POINT" --cache-mode none 2>/dev/null; then
    echo -e "${RED}Error: Failed to mount target${NC}"
    exit 1
fi
MOUNT_END=$(date +%s.%N)
MOUNT_TIME=$(echo "$MOUNT_END - $MOUNT_START" | bc)
RESULTS["mount_time"]=$MOUNT_TIME
log "${GREEN}Mounted in ${MOUNT_TIME}s${NC}"
log ""

# Wait for mount to be ready
sleep 1

# Find test files
TEST_FILES=($(find "$MOUNT_POINT" -type f -size +1M 2>/dev/null | head -5))
if [[ ${#TEST_FILES[@]} -eq 0 ]]; then
    log "${YELLOW}Warning: No large files found for throughput test${NC}"
fi

# Test: Latency (ping)
run_latency_test() {
    log "${BLUE}--- Latency Test ---${NC}"

    # Get file list time (metadata latency)
    START=$(date +%s.%N)
    ls -la "$MOUNT_POINT" > /dev/null
    END=$(date +%s.%N)
    LS_TIME=$(echo "($END - $START) * 1000" | bc)
    RESULTS["ls_latency_ms"]=$LS_TIME
    log "Directory listing: ${GREEN}${LS_TIME}ms${NC}"

    # Get single file stat
    if [[ ${#TEST_FILES[@]} -gt 0 ]]; then
        START=$(date +%s.%N)
        stat "${TEST_FILES[0]}" > /dev/null
        END=$(date +%s.%N)
        STAT_TIME=$(echo "($END - $START) * 1000" | bc)
        RESULTS["stat_latency_ms"]=$STAT_TIME
        log "File stat: ${GREEN}${STAT_TIME}ms${NC}"
    fi

    log ""
}

# Test: Sequential Read
run_read_test() {
    log "${BLUE}--- Sequential Read Test ---${NC}"

    if [[ ${#TEST_FILES[@]} -eq 0 ]]; then
        log "${YELLOW}Skipped: No test files available${NC}"
        return
    fi

    TEST_FILE="${TEST_FILES[0]}"
    FILE_SIZE=$(stat -f%z "$TEST_FILE" 2>/dev/null || stat -c%s "$TEST_FILE" 2>/dev/null)
    FILE_SIZE_MB=$((FILE_SIZE / 1024 / 1024))

    log "Test file: $(basename "$TEST_FILE") (${FILE_SIZE_MB}MB)"

    START=$(date +%s.%N)
    dd if="$TEST_FILE" of=/dev/null bs=1M 2>/dev/null
    END=$(date +%s.%N)

    ELAPSED=$(echo "$END - $START" | bc)
    THROUGHPUT=$(echo "scale=2; $FILE_SIZE_MB / $ELAPSED" | bc)

    RESULTS["seq_read_mbps"]=$THROUGHPUT
    log "Sequential read: ${GREEN}${THROUGHPUT} MB/s${NC}"
    log ""
}

# Test: Random Read (small blocks)
run_random_read_test() {
    log "${BLUE}--- Random Read Test ---${NC}"

    if [[ ${#TEST_FILES[@]} -eq 0 ]]; then
        log "${YELLOW}Skipped: No test files available${NC}"
        return
    fi

    TEST_FILE="${TEST_FILES[0]}"

    # Read 100 random 4KB blocks
    START=$(date +%s.%N)
    for i in $(seq 1 100); do
        OFFSET=$((RANDOM * 1024))
        dd if="$TEST_FILE" of=/dev/null bs=4096 count=1 skip=$((OFFSET / 4096)) 2>/dev/null
    done
    END=$(date +%s.%N)

    ELAPSED=$(echo "$END - $START" | bc)
    IOPS=$(echo "scale=2; 100 / $ELAPSED" | bc)

    RESULTS["random_read_iops"]=$IOPS
    log "Random read (4KB): ${GREEN}${IOPS} IOPS${NC}"
    log ""
}

# Test: Metadata operations
run_metadata_test() {
    log "${BLUE}--- Metadata Test ---${NC}"

    # Count files
    START=$(date +%s.%N)
    FILE_COUNT=$(find "$MOUNT_POINT" -type f 2>/dev/null | wc -l | tr -d ' ')
    END=$(date +%s.%N)

    ELAPSED=$(echo "$END - $START" | bc)
    RESULTS["find_time_s"]=$ELAPSED
    RESULTS["file_count"]=$FILE_COUNT

    log "Found $FILE_COUNT files in ${GREEN}${ELAPSED}s${NC}"

    # Stat multiple files
    if [[ $FILE_COUNT -gt 0 ]]; then
        START=$(date +%s.%N)
        find "$MOUNT_POINT" -type f -exec stat {} \; 2>/dev/null | head -100 > /dev/null
        END=$(date +%s.%N)

        ELAPSED=$(echo "$END - $START" | bc)
        STAT_PER_SEC=$(echo "scale=2; 100 / $ELAPSED" | bc)
        RESULTS["stats_per_sec"]=$STAT_PER_SEC
        log "Stat operations: ${GREEN}${STAT_PER_SEC}/s${NC}"
    fi

    log ""
}

# Run tests based on type
case $TEST_TYPE in
    all)
        run_latency_test
        run_read_test
        run_random_read_test
        run_metadata_test
        ;;
    latency)
        run_latency_test
        ;;
    read)
        run_read_test
        run_random_read_test
        ;;
    metadata)
        run_metadata_test
        ;;
    *)
        log "${RED}Unknown test type: $TEST_TYPE${NC}"
        exit 1
        ;;
esac

# Summary
log "${BLUE}=== Summary ===${NC}"
log ""

if [[ "$FORMAT" == "json" ]]; then
    # Output JSON
    JSON="{"
    first=true
    for key in "${!RESULTS[@]}"; do
        if [[ "$first" == "true" ]]; then
            first=false
        else
            JSON+=","
        fi
        JSON+="\"$key\":${RESULTS[$key]}"
    done
    JSON+="}"

    if [[ -n "$OUTPUT" ]]; then
        echo "$JSON" > "$OUTPUT"
        echo "Results saved to $OUTPUT"
    else
        echo "$JSON"
    fi
else
    # Text summary
    echo "Results:"
    for key in "${!RESULTS[@]}"; do
        printf "  %-20s %s\n" "$key:" "${RESULTS[$key]}"
    done

    if [[ -n "$OUTPUT" ]]; then
        {
            echo "Wormhole Benchmark Results"
            echo "=========================="
            echo "Target: $TARGET"
            echo "Date: $(date)"
            echo ""
            for key in "${!RESULTS[@]}"; do
                printf "%-20s %s\n" "$key:" "${RESULTS[$key]}"
            done
        } > "$OUTPUT"
        echo ""
        echo "Results saved to $OUTPUT"
    fi
fi

log ""
log "${GREEN}Benchmark complete!${NC}"
