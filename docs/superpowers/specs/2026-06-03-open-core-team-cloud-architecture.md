# Wormhole Open-Core Team Cloud — Architecture Vision

**Date:** 2026-06-03
**Status:** Vision (fixes the big decisions; per-component specs come later)
**Scope:** High-level architecture for the paid team/cloud product, plus the dev strategy to build its frontend now against `fakebase`.

---

## 1. The decision in one paragraph

Wormhole goes **open-core, Strapi-style**: the free OSS core stays exactly what it is today — self-hosted P2P sharing, your own signal server, manual/keyless team setup. A **paid hosted product** layers on the full team experience: real accounts and auth, managed team/member/seat administration, "log in once → mount on any computer," an admin console, audit logs, and billing. Crucially, **both tiers issue the same kind of signed mount token**, so a host never has to know which tier authorized a client. We build the paid frontend *now* against `fakebase` (a Supabase-compatible in-process mock) and swap in the real backend later.

## 2. Open-core tiers

| Concern | Free / OSS core (today) | Paid / Cloud (full product) |
|---|---|---|
| Identity | Keyless grants, signed manually | Real accounts + auth system |
| Teams | DIY (share a team key) | Managed: invite members, roles, seats |
| Mounts | Per-machine join codes | `wormhole login` once → mount on any device you're signed into |
| Signal server | Self-host your own | Hosted rendezvous |
| Admin | None | Web admin console, audit logs, billing |
| Price | $0 forever | Pro $8/seat, Team $15/seat, Enterprise custom |

The paid tier is the engine behind the already-planned Team/Enterprise tiers in `docs/marketing/08-monetization-strategy.md` (admin console, team management, audit logs, SSO/SAML).

## 3. Non-negotiable principle: control plane only

**File bytes never touch our servers — in either tier.** The cloud is a *control plane*: auth, team membership, token issuance, and rendezvous. The **data plane stays P2P and E2E-encrypted.** This is the core brand promise ("files never touch third-party servers") *and* what keeps hosting cost near-zero, which the monetization model depends on. Breaking it = becoming Dropbox. Any feature that would route file bytes through our infra is out of scope by definition.

## 4. The unifying primitive: a signed mount token

A host always trusts a **team public key** and verifies that an incoming mount token is: (a) signed by that key, (b) unexpired, (c) not revoked, (d) scoped to the requested share. That single check is tier-agnostic:

- **Free/OSS:** the admin signs grants manually (`wormhole team grant`).
- **Paid/Cloud:** after you authenticate, the cloud signs the *same kind of token* for you automatically.

Revocation: medium-TTL tokens (≈30d in free, short-lived + refresh in paid) **plus** an optional revocation list the host polls from a configurable source. This shared primitive is what makes open-core one system instead of two.

## 5. Paid-cloud architecture (hybrid)

```
┌─ Self-hostable BaaS (fakebase mock) ┐     ┌─ Rust cloud crate (teleport-cloud) ──┐
│ Auth: email / OAuth / SSO           │     │ • validates JWT from BaaS            │
│ Postgres: teams, members, seats,    │────▶│ • looks up team + permissions        │
│   audit log   (RLS in real backend) │     │ • SIGNS short-lived mount token ◀─── security boundary stays in our code
│ Prefer: Supabase self-host /        │     │ • serves team pubkey + revoke list   │
│ Appwrite / Postgres single-binary   │     └───────────────┬──────────────────────┘
└─────────────────────────────────────┘                     │
        ▲                                                    │ issues token
        │ Polar (Apache-2.0) per-seat + optional             ▼
        │ relay usage meters                    wormhole CLI on any device
   web admin console (apps/web)                 (login once → mount anywhere)
```

**Why hybrid:** don't reinvent auth/identity/billing, but prefer **open / self-hostable pieces** (Postgres BaaS you can run + [Polar](https://polar.sh) for seats/tax) over pure SaaS lock-in. Keep the **security-critical mount-authorization path — token signing and verification — in our own Rust code**. Full stack evolution: `docs/development/16-bleeding-edge-oss-modernization.md`.

**Billing default:** Polar first (OSS-friendly MoR, seat + usage meters). Stripe remains an escape hatch if needed for enterprise procurement — not the default greenfield choice.

## 6. Dev strategy: fakebase now, real backend later

`fakebase` is a Supabase-compatible mock that mirrors `@supabase/supabase-js` call shapes (`from().select().eq()`, auth, storage, realtime, RPC) with zero setup. We build the entire paid frontend against it, then migrate with near-zero rewrite (`fakebase migrate export` → generate `database.types.ts` → swap `createClient` to real `@supabase/supabase-js`).

**The Supabase client API is the swappable seam** — do *not* wrap it in a second bespoke abstraction (that would defeat the one-line migration fakebase is bought for).

Constraints fakebase imposes on the "now" phase (its docs flag OAuth/MFA/RLS as partial/dev-only):
- Auth: **email/password (+ mock magic-link)** now; OAuth/SSO at the real-Supabase swap.
- Authorization: **RLS deferred** to the real backend; enforce in UI/app logic for the mock.
- Token signing: the Rust `teleport-cloud` service is **stubbed** (e.g. a fakebase RPC returning a fake token) until it's built.

**Wiring (resolved):** fakebase is an in-process npm package — `@byronwade/fakebase` (bundles `@byronwade/core`, `client`, `adapter-memory`, `auth`). It exposes `createClient` + `createMemoryKernel(schema)`, and a **`@byronwade/fakebase/next` subpath that mirrors `@supabase/ssr`** — `createBrowserClient(url, key, { kernel })` and `createServerClient(url, key, { kernel, cookies })`. So migration to real Supabase = swap the import `@byronwade/fakebase/next` → `@supabase/ssr`, drop the `kernel` option, point at the real URL/key. Schema is defined as a `ProjectSchemaIR` (tables/columns); auth uses the Supabase-shaped client (`auth.signInWithPassword`, `signUp`, `getSession`, `onAuthStateChange`).

## 7. Sequencing

1. **This doc** — fix the vision. ✅
2. **Frontend on fakebase** *(the current focus)* — build the paid team/auth experience in `apps/web`: login, team & member management, devices/mounts, billing UI, admin console. Supabase-shaped client against fakebase. → its own plan via `writing-plans` + `frontend-design`.
3. **Deferred, each its own spec later:**
   - Rust grant/token primitive in `teleport-core` (keypair, signed token, sign/verify, revoke list) + host handshake verification.
   - Free-tier CLI: `wormhole identity`, `wormhole team {init,grant,revoke}`, `--team`/`--grant` on host/mount.
   - `teleport-cloud` crate (real JWT validation + token signing + revoke endpoint).
   - Real BaaS migration (self-host Supabase/Appwrite-class), Polar billing, OAuth/SSO, RLS.
   - Optional iroh-relay hosting for paid NAT fallback (bytes still E2E; see modernization doc).

## 8. Out of scope

- Routing file bytes through cloud infra (violates §3).
- Real auth providers, RLS, billing, and the Rust signing service in the "now" phase (stubbed via fakebase).
- Enterprise SSO/SAML (post-MVP, real-backend phase).
