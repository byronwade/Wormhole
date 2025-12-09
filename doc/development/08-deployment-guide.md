# Wormhole Deployment Guide

This guide covers deploying Wormhole components for production use.

---

## Table of Contents

1. [Deployment Overview](#1-deployment-overview)
2. [Signal Server Deployment](#2-signal-server-deployment)
3. [Desktop App Distribution](#3-desktop-app-distribution)
4. [Enterprise Deployment](#4-enterprise-deployment)
5. [Monitoring & Observability](#5-monitoring--observability)
6. [Backup & Recovery](#6-backup--recovery)
7. [Security Hardening](#7-security-hardening)
8. [Scaling](#8-scaling)

---

## 1. Deployment Overview

### Architecture Components

```
┌─────────────────────────────────────────────────────────────────┐
│                     WORMHOLE DEPLOYMENT                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐                        ┌──────────────┐      │
│  │  Signal      │◄──────WebSocket───────►│  Signal      │      │
│  │  Server 1    │                        │  Server 2    │      │
│  └──────────────┘                        └──────────────┘      │
│         │                                       │               │
│         └───────────────┬───────────────────────┘               │
│                         │                                       │
│                   ┌─────▼─────┐                                │
│                   │  Load     │                                │
│                   │  Balancer │                                │
│                   └─────┬─────┘                                │
│                         │                                       │
│         ┌───────────────┼───────────────┐                      │
│         │               │               │                      │
│    ┌────▼────┐    ┌────▼────┐    ┌────▼────┐                  │
│    │ Client  │    │ Client  │    │  Host   │                  │
│    │  (UI)   │    │  (UI)   │    │  (UI)   │                  │
│    └────┬────┘    └────┬────┘    └────┬────┘                  │
│         │               │               │                      │
│         └───────────QUIC P2P────────────┘                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### What Needs Deployment

| Component | Type | Required |
|-----------|------|----------|
| **Signal Server** | Backend service | Yes (for NAT traversal) |
| **Desktop App** | Client binary | Yes |
| **STUN Servers** | Can use public | Optional |
| **TURN Servers** | Relay fallback | Optional (Enterprise) |

---

## 2. Signal Server Deployment

### Option A: Docker (Recommended)

```dockerfile
# Dockerfile
FROM rust:1.75-slim as builder

WORKDIR /app
COPY . .
RUN cargo build --release -p teleport-signal

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/teleport-signal /usr/local/bin/

EXPOSE 8080
CMD ["teleport-signal", "--bind", "0.0.0.0:8080"]
```

```yaml
# docker-compose.yml
version: '3.8'
services:
  signal:
    build: .
    ports:
      - "8080:8080"
    environment:
      - RUST_LOG=info
      - SIGNAL_MAX_ROOMS=10000
      - SIGNAL_ROOM_TIMEOUT=3600
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

```bash
# Deploy
docker-compose up -d

# View logs
docker-compose logs -f signal
```

### Option B: Kubernetes

```yaml
# signal-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: wormhole-signal
  labels:
    app: wormhole-signal
spec:
  replicas: 2
  selector:
    matchLabels:
      app: wormhole-signal
  template:
    metadata:
      labels:
        app: wormhole-signal
    spec:
      containers:
      - name: signal
        image: wormhole/signal:latest
        ports:
        - containerPort: 8080
        env:
        - name: RUST_LOG
          value: "info"
        - name: SIGNAL_MAX_ROOMS
          value: "10000"
        resources:
          requests:
            memory: "64Mi"
            cpu: "100m"
          limits:
            memory: "256Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: wormhole-signal
spec:
  selector:
    app: wormhole-signal
  ports:
  - port: 80
    targetPort: 8080
  type: ClusterIP
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: wormhole-signal
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  tls:
  - hosts:
    - signal.wormhole.dev
    secretName: signal-tls
  rules:
  - host: signal.wormhole.dev
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: wormhole-signal
            port:
              number: 80
```

```bash
# Deploy
kubectl apply -f signal-deployment.yaml

# Check status
kubectl get pods -l app=wormhole-signal
kubectl logs -l app=wormhole-signal -f
```

### Option C: Fly.io (Easiest)

```toml
# fly.toml
app = "wormhole-signal"
primary_region = "sjc"

[build]
  dockerfile = "Dockerfile"

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = false
  auto_start_machines = true

[[services]]
  protocol = "tcp"
  internal_port = 8080

  [[services.ports]]
    port = 443
    handlers = ["tls", "http"]

  [[services.ports]]
    port = 80
    handlers = ["http"]

[env]
  RUST_LOG = "info"
  SIGNAL_MAX_ROOMS = "10000"
```

```bash
# Deploy
fly launch
fly deploy

# Scale
fly scale count 2
fly scale vm shared-cpu-1x
```

### Option D: AWS/GCP/Azure

#### AWS ECS

```json
{
  "family": "wormhole-signal",
  "containerDefinitions": [
    {
      "name": "signal",
      "image": "wormhole/signal:latest",
      "portMappings": [
        {
          "containerPort": 8080,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {"name": "RUST_LOG", "value": "info"}
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/wormhole-signal",
          "awslogs-region": "us-west-2",
          "awslogs-stream-prefix": "signal"
        }
      }
    }
  ],
  "requiresCompatibilities": ["FARGATE"],
  "networkMode": "awsvpc",
  "cpu": "256",
  "memory": "512"
}
```

### TLS Configuration

```bash
# Using Let's Encrypt with certbot
sudo certbot certonly --standalone -d signal.wormhole.dev

# Signal server with TLS
teleport-signal \
  --bind 0.0.0.0:443 \
  --tls-cert /etc/letsencrypt/live/signal.wormhole.dev/fullchain.pem \
  --tls-key /etc/letsencrypt/live/signal.wormhole.dev/privkey.pem
```

---

## 3. Desktop App Distribution

### Building for Distribution

```bash
# Build Tauri app for all platforms
cd apps/teleport-ui

# macOS (Universal binary)
pnpm tauri build --target universal-apple-darwin

# Windows
pnpm tauri build --target x86_64-pc-windows-msvc

# Linux
pnpm tauri build --target x86_64-unknown-linux-gnu
```

### Code Signing

#### macOS

```bash
# 1. Get Developer ID from Apple Developer Program

# 2. Sign the app
codesign --sign "Developer ID Application: Your Name (TEAMID)" \
  --options runtime \
  --entitlements entitlements.plist \
  target/release/bundle/macos/Wormhole.app

# 3. Notarize
xcrun notarytool submit target/release/bundle/macos/Wormhole.dmg \
  --apple-id "your@email.com" \
  --team-id "TEAMID" \
  --password "app-specific-password" \
  --wait

# 4. Staple
xcrun stapler staple target/release/bundle/macos/Wormhole.dmg
```

#### Windows

```powershell
# Using signtool with EV certificate
signtool sign /tr http://timestamp.digicert.com /td sha256 /fd sha256 ^
  /a target/release/bundle/msi/Wormhole.msi
```

### Auto-Update Configuration

```json
// tauri.conf.json
{
  "tauri": {
    "updater": {
      "active": true,
      "endpoints": [
        "https://releases.wormhole.dev/{{target}}/{{current_version}}"
      ],
      "dialog": true,
      "pubkey": "YOUR_PUBLIC_KEY_HERE"
    }
  }
}
```

### Distribution Channels

| Channel | Platform | Notes |
|---------|----------|-------|
| **GitHub Releases** | All | Primary distribution |
| **Homebrew** | macOS | `brew install wormhole` |
| **Winget** | Windows | `winget install wormhole` |
| **Snap** | Linux | `snap install wormhole` |
| **Flatpak** | Linux | `flatpak install wormhole` |
| **AUR** | Arch Linux | `yay -S wormhole` |

---

## 4. Enterprise Deployment

### MDM Distribution (macOS)

```xml
<!-- wormhole.mobileconfig -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>PayloadContent</key>
    <array>
        <dict>
            <key>PayloadType</key>
            <string>com.apple.system-extension-policy</string>
            <key>AllowedSystemExtensions</key>
            <dict>
                <key>TEAMID</key>
                <array>
                    <string>com.wormhole.macfuse</string>
                </array>
            </dict>
        </dict>
    </array>
    <key>PayloadDisplayName</key>
    <string>Wormhole Configuration</string>
</dict>
</plist>
```

### Group Policy (Windows)

```
# GPO settings for Wormhole
Computer Configuration
└── Administrative Templates
    └── Wormhole
        ├── Signal Server URL: signal.company.com
        ├── Default Cache Size: 10GB
        ├── Allowed Share Paths: C:\Shares\*
        └── Disable Auto-Update: No
```

### Configuration Management

```yaml
# ansible/roles/wormhole/tasks/main.yml
- name: Install Wormhole
  package:
    name: wormhole
    state: present

- name: Configure Wormhole
  template:
    src: wormhole.toml.j2
    dest: /etc/wormhole/config.toml
    mode: '0644'

- name: Enable Wormhole service
  systemd:
    name: wormhole
    enabled: yes
    state: started
```

```toml
# wormhole.toml.j2
[network]
signal_url = "{{ wormhole_signal_url }}"

[cache]
l1_size = {{ wormhole_cache_size }}
l2_path = "{{ wormhole_cache_path }}"

[security]
allowed_paths = {{ wormhole_allowed_paths | to_json }}
```

---

## 5. Monitoring & Observability

### Prometheus Metrics

```rust
// Signal server exposes metrics at /metrics
// Metrics include:
// - wormhole_active_rooms
// - wormhole_total_connections
// - wormhole_messages_relayed
// - wormhole_connection_duration_seconds
```

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'wormhole-signal'
    static_configs:
      - targets: ['signal.wormhole.dev:8080']
    metrics_path: /metrics
```

### Grafana Dashboard

```json
{
  "dashboard": {
    "title": "Wormhole Signal Server",
    "panels": [
      {
        "title": "Active Rooms",
        "type": "stat",
        "targets": [
          {"expr": "wormhole_active_rooms"}
        ]
      },
      {
        "title": "Connections/min",
        "type": "graph",
        "targets": [
          {"expr": "rate(wormhole_total_connections[5m]) * 60"}
        ]
      },
      {
        "title": "Message Rate",
        "type": "graph",
        "targets": [
          {"expr": "rate(wormhole_messages_relayed[5m])"}
        ]
      }
    ]
  }
}
```

### Logging

```rust
// Structured logging with tracing
// Log format: JSON for production

// Example log output:
{"timestamp":"2024-01-15T10:30:00Z","level":"INFO","target":"teleport_signal","message":"Room created","room_id":"abc123","peer_count":2}
```

```yaml
# Loki configuration for log aggregation
# docker-compose.yml
services:
  loki:
    image: grafana/loki:latest
    ports:
      - "3100:3100"
    volumes:
      - ./loki-config.yml:/etc/loki/config.yml

  promtail:
    image: grafana/promtail:latest
    volumes:
      - /var/log:/var/log
      - ./promtail-config.yml:/etc/promtail/config.yml
```

### Alerting

```yaml
# alertmanager rules
groups:
  - name: wormhole
    rules:
      - alert: SignalServerDown
        expr: up{job="wormhole-signal"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Signal server is down"

      - alert: HighRoomCount
        expr: wormhole_active_rooms > 9000
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High number of active rooms"

      - alert: HighErrorRate
        expr: rate(wormhole_errors_total[5m]) > 10
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High error rate on signal server"
```

---

## 6. Backup & Recovery

### What to Backup

| Component | Data | Frequency |
|-----------|------|-----------|
| Signal Server | Room state (ephemeral) | Not needed |
| Desktop App | User settings | On change |
| Desktop App | Cache | Not needed |
| Enterprise | Policies, configs | Daily |

### User Settings Backup

```bash
# Backup locations
# Linux: ~/.config/wormhole/
# macOS: ~/Library/Application Support/Wormhole/
# Windows: %APPDATA%\Wormhole\

# Backup command
tar -czf wormhole-backup.tar.gz ~/.config/wormhole/
```

### Recovery Procedure

```bash
# 1. Install Wormhole
brew install wormhole

# 2. Restore settings
tar -xzf wormhole-backup.tar.gz -C ~/

# 3. Verify
wormhole doctor
```

---

## 7. Security Hardening

### Signal Server Hardening

```bash
# Run as non-root user
useradd -r -s /bin/false wormhole
chown -R wormhole:wormhole /opt/wormhole

# Systemd hardening
[Service]
User=wormhole
Group=wormhole
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadOnlyPaths=/
ReadWritePaths=/var/log/wormhole
```

### Network Security

```bash
# Firewall rules (ufw)
sudo ufw default deny incoming
sudo ufw allow 443/tcp  # HTTPS/WSS
sudo ufw allow 51820/udp  # QUIC (if using fixed port)
sudo ufw enable

# Rate limiting with iptables
iptables -A INPUT -p tcp --dport 443 -m state --state NEW \
  -m recent --set --name wormhole
iptables -A INPUT -p tcp --dport 443 -m state --state NEW \
  -m recent --update --seconds 60 --hitcount 100 \
  --name wormhole -j DROP
```

### TLS Configuration

```toml
# Recommended TLS settings
[tls]
min_version = "1.3"
ciphersuites = [
  "TLS_AES_256_GCM_SHA384",
  "TLS_AES_128_GCM_SHA256",
  "TLS_CHACHA20_POLY1305_SHA256"
]
```

---

## 8. Scaling

### Horizontal Scaling (Signal Server)

```yaml
# Signal servers are stateless - scale horizontally
# Use sticky sessions for WebSocket connections

# AWS ALB target group
resource "aws_lb_target_group" "signal" {
  name     = "wormhole-signal"
  port     = 8080
  protocol = "HTTP"
  vpc_id   = aws_vpc.main.id

  stickiness {
    type            = "lb_cookie"
    cookie_duration = 86400
  }

  health_check {
    path                = "/health"
    healthy_threshold   = 2
    unhealthy_threshold = 10
  }
}
```

### Geographic Distribution

```
                    ┌─────────────────────┐
                    │   Global DNS        │
                    │   (Route 53/CF)     │
                    └──────────┬──────────┘
                               │
           ┌───────────────────┼───────────────────┐
           │                   │                   │
    ┌──────▼──────┐     ┌──────▼──────┐     ┌──────▼──────┐
    │  US-West    │     │  EU-West    │     │  AP-East    │
    │  Signal     │     │  Signal     │     │  Signal     │
    └─────────────┘     └─────────────┘     └─────────────┘
```

### Capacity Planning

| Users | Signal Instances | Memory/Instance | CPU/Instance |
|-------|------------------|-----------------|--------------|
| 1,000 | 1 | 256 MB | 0.5 vCPU |
| 10,000 | 2 | 512 MB | 1 vCPU |
| 100,000 | 4 | 1 GB | 2 vCPU |
| 1,000,000 | 10+ | 2 GB | 4 vCPU |

---

## Deployment Checklist

### Pre-Production
- [ ] Signal server deployed and reachable
- [ ] TLS certificates configured
- [ ] Monitoring and alerting set up
- [ ] Backup procedures documented
- [ ] Security hardening applied
- [ ] Load testing completed

### Production Launch
- [ ] DNS configured
- [ ] CDN configured (for app downloads)
- [ ] Auto-scaling configured
- [ ] Runbooks documented
- [ ] On-call rotation set up

### Post-Launch
- [ ] Monitor error rates
- [ ] Monitor latency
- [ ] Collect user feedback
- [ ] Plan capacity for growth
