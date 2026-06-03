# byronwade-ui Migration — Design

**Date:** 2026-06-03
**Author:** Byron Wade (with Claude)
**Status:** Approved (design); pending implementation plan

## Goal

Migrate both frontends — `apps/web` (Next.js 15) and `apps/desktop` (Tauri + Vite) — from
stock shadcn/ui (Radix-based, "new-york" style) to the **byronwade-ui** design system,
distributed as a shadcn registry at `https://ui.byronwade.com/r/{name}.json`.

## Key facts established during discovery

- **byronwade-ui is built on Base UI (`@base-ui/react` v1.5.0)**, not Radix (`@radix-ui/*`).
  This is a primitive re-platform, not a token-only re-skin.
- **Base UI supports React 17/18/19** → desktop's React 18.3 needs **no** React upgrade.
- **Named exports are preserved** (`Dialog`, `DialogTrigger`, `DialogContent`, `Button`,
  `buttonVariants`, etc.), so the bulk of consuming JSX is unaffected.
- **Composition API differs.** Main consumer-facing break: Radix `asChild` →
  Base UI `render={<X/>}`. Affects **11 web files + 1 desktop file**. Additional
  controlled-prop drift (Select/Dialog/etc.) handled per TypeScript compile error.
- **`@byronwade/all` = 62 registry items**: primitives + a token `foundation` (owns
  `:root`/`@theme`) + higher-level blocks (`hero-section`, `page-header`, `stat-card`,
  `morph-dock`, …). This migration installs everything but **only adopts primitives +
  tokens**; blocks are deferred.
- **`foundation` is Tailwind v4-native** (`@theme` cssVars, `tw-animate-css`).
  - `apps/web` is already Tailwind v4 → compatible.
  - `apps/desktop` is Tailwind v3 (`^3.4.15` + `tailwindcss-animate`) → **blocked on a
    v3→v4 upgrade** as a prerequisite.
- `registries` is `{}` in both `components.json` → the `@byronwade` namespace must be
  configured before the CLI can resolve `@byronwade/all`.

## Decisions (locked)

| Decision | Choice |
|----------|--------|
| Brand color | **Keep Wormhole purple `#7C3AED`** — install `foundation`, override `--brand` (and derived `--brand-foreground`/`--brand-muted`) so the system re-skins to purple. |
| Scope | **Both apps, sequentially** — web first, then desktop (incl. Tailwind v4 upgrade). |
| Depth | **Primitives + tokens only** — keep existing page layouts/structure. Blocks deferred to a follow-up. |

## Strategy

In-place primitive swap + token foundation, layouts preserved. Per app:

1. **Register namespace** — add `@byronwade` → `https://ui.byronwade.com/r/{name}.json` to
   `registries` in `components.json`.
2. **Install `foundation`** (owns `:root`/`@theme` tokens); override `--brand` → `#7C3AED`.
   Primary/accent map onto brand.
3. **Install `@byronwade/all` primitives** into `components/ui/`, overwriting the Radix-based
   ones.
4. **Reconcile consumer breakages**: `asChild`→`render`, Base UI controlled-prop drift,
   prune now-unused `@radix-ui/*` deps.
5. **Verify**: typecheck + build + existing tests green per app.

## Phasing

**Pre-work — branch hygiene:** commit/stash the unrelated work currently on
`fix/deps-security-robustness`, then branch clean (`feat/byronwade-ui-migration`).

### Phase A — Web app (Tailwind v4 already; lowest risk)
- A1. Configure `@byronwade` registry namespace in `apps/web/components.json`.
- A2. Install `foundation`; override `--brand` → purple in `globals.css`; reconcile with
  existing `tw-animate-css` setup.
- A3. Install `@byronwade/all` primitives (overwrite `components/ui/*`).
- A4. Fix consumers: `asChild`→`render` (11 files), Base UI prop drift, prune `@radix-ui/*`.
- A5. Verify: `pnpm typecheck && pnpm build` + visual smoke of key pages.

### Phase B — Desktop app (gated on Tailwind v4 upgrade)
- B1. Upgrade desktop Tailwind v3→v4: switch to `@tailwindcss/postcss`, migrate `index.css`
  to `@import "tailwindcss"` + `@theme`, replace `tailwindcss-animate`→`tw-animate-css`.
  **Verify v4 builds before touching components.**
- B2. Configure `@byronwade` namespace in `apps/desktop/components.json`.
- B3. Install `foundation` + purple `--brand` override.
- B4. Install `@byronwade/all` primitives (overwrite the 17 existing ones).
- B5. Fix consumers: `asChild`→`render` (1 file), prop drift, prune Radix deps.
- B6. Verify: `pnpm typecheck && pnpm test:run && pnpm tauri build` (or `vite build`).

## Risks & mitigations

- **Base UI prop drift beyond `asChild`.** Migrate one primitive family at a time; use
  TypeScript compile errors as the worklist. No bulk-install-and-pray.
- **Token collisions** between `foundation` and existing `globals.css`/`index.css` vars.
  Foundation owns base tokens; keep only Wormhole-specific additions, layered after.
- **Three.js / charts** in web reference colors → re-point to new chart tokens.
- **Verification gate per phase:** typecheck + build + tests must pass before advancing;
  no phase declared done on assertion alone.

## Out of scope

- Higher-level byronwade-ui blocks (`hero-section`, `page-header`, `stat-card`,
  `morph-dock`, etc.) — deferred to a follow-up redesign pass.
- Page layout/IA changes.
- React version changes (desktop stays on React 18.3).
