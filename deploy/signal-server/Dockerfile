# Wormhole Signal Server Dockerfile
# Multi-stage build for minimal image size

# Build stage
FROM rust:1.83-slim as builder

# Install build dependencies
RUN apt-get update && apt-get install -y \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy workspace files
COPY Cargo.toml Cargo.lock ./
COPY crates/teleport-core ./crates/teleport-core
COPY crates/teleport-signal ./crates/teleport-signal

# Build only the signal server binary
RUN cargo build --release --bin wormhole-signal

# Runtime stage
FROM debian:bookworm-slim

# Install runtime dependencies (minimal)
RUN apt-get update && apt-get install -y \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user for security
RUN useradd -m -u 1000 wormhole
USER wormhole

WORKDIR /app

# Copy the built binary
COPY --from=builder /app/target/release/wormhole-signal /app/wormhole-signal

# Expose WebSocket port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Default command
ENTRYPOINT ["/app/wormhole-signal"]
CMD ["--port", "8080", "--bind", "0.0.0.0"]
