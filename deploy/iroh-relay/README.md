# Self-hosted iroh relay

Wormhole’s iroh transport uses relays as a **fallback** when UDP hole punching fails. Relays forward encrypted QUIC packets only — they cannot read file bytes.

## Quick start

```bash
docker compose -f deploy/iroh-relay/docker-compose.yml up -d
```

Expose UDP/TCP `3340` on your firewall. Configure peers with your public relay URL (e.g. `https://relay.example.com`).

## With full self-host stack

See `deploy/self-host/docker-compose.yml` for relay + optional Postgres BaaS + `teleport-cloud` token service.
