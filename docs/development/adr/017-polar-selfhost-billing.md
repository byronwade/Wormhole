# ADR-017: Polar + self-host BaaS for open-core billing

## Status
**Accepted** (2026-08-02)

## Context
Open-core cloud needs seats/billing without locking file bytes into SaaS storage.

## Decision
- **Polar** (Apache-2.0) for seat checkout / webhooks (`teleport-cloud`)
- Self-host Postgres BaaS for auth/teams; Supabase-shaped client seam retained
- Mount tokens (`teleport-core::mount_token`) are the unifying grant primitive

## Consequences
- `deploy/self-host/docker-compose.yml` documents the stack
- Stripe remains an escape hatch, not the default
