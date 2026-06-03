# byronwade-ui Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate `apps/web` and `apps/desktop` from stock shadcn/ui (Radix) to the byronwade-ui design system (Base UI), keeping the Wormhole purple brand and all existing layouts.

**Architecture:** Install the byronwade-ui registry (`@byronwade` namespace → `https://ui.byronwade.com/r/{name}.json`). Install `foundation` (token base, owns `:root`/`@theme`), override `--brand` to `#7C3AED`, then install all primitives — overwriting the Radix-based `components/ui/*`. Named exports are preserved, so most consumer JSX is unchanged; the surgical fixes are Radix `asChild` → Base UI `render={<X/>}` and per-component prop drift, found via TypeScript. Desktop additionally requires a Tailwind v3→v4 upgrade as a prerequisite.

**Tech Stack:** Next.js 15 (web), Tauri 2 + Vite 6 (desktop), React 19/18, Base UI `@base-ui/react@^1.5`, Tailwind v4, shadcn CLI.

**Spec:** `docs/superpowers/specs/2026-06-03-byronwade-ui-migration-design.md`

**Reference values (use verbatim):**

Wormhole purple `--brand` override (replaces foundation green `oklch(0.6 0.17 148)`):
```
/* light */   --brand: oklch(0.539 0.246 293); --brand-foreground: oklch(0.99 0.002 95); --brand-muted: oklch(0.96 0.03 293);
/* dark  */   --brand: oklch(0.62 0.21 293);  --brand-foreground: oklch(0.985 0.001 95); --brand-muted: oklch(0.32 0.06 293);
```
(Foundation maps `--ring: var(--brand)` and brand utilities off `--brand`; `--primary` stays a dark neutral by design.)

Registry namespace block for `components.json`:
```json
"registries": {
  "@byronwade": "https://ui.byronwade.com/r/{name}.json"
}
```

---

## File Structure

**Phase 0 (pre-work):** git branch only.

**Phase A — web (`apps/web`):**
- Modify: `apps/web/components.json` (add `registries`)
- Modify: `apps/web/src/app/globals.css` (foundation tokens + purple `--brand` override)
- Overwrite: `apps/web/src/components/ui/*.tsx` (~52 files, via registry)
- Modify: 11 consumer pages (asChild→render) — listed in Task A4
- Modify: `apps/web/package.json` (add `@base-ui/react`, prune unused `@radix-ui/*`)

**Phase B — desktop (`apps/desktop`):**
- Modify: `apps/desktop/package.json` (Tailwind v4 deps, `@base-ui/react`, prune Radix)
- Replace: `apps/desktop/postcss.config.js`, delete `tailwind.config.js` (v4 is CSS-first)
- Rewrite: `apps/desktop/src/index.css` (v4 `@import` + `@theme` + foundation tokens)
- Overwrite: `apps/desktop/src/components/ui/*.tsx` (17 files, via registry)
- Modify: `apps/desktop/src/App.tsx:1069` (asChild→render)
- Modify: `apps/desktop/components.json` (add `registries`)

---

## Phase 0 — Branch hygiene

### Task 0: Clean branch for the migration

**Files:** none (git only)

- [ ] **Step 1: Confirm current state**

Run: `git -C /Users/byronwade/Wormhole status --short | head` and `git -C /Users/byronwade/Wormhole branch --show-current`
Expected: branch `fix/deps-security-robustness` with many modified files.

- [ ] **Step 2: Stash unrelated work, branch clean from it**

The design spec is already committed (587e215). Create the feature branch from current HEAD so committed history is preserved, then stash the working-tree changes so the migration starts clean.

```bash
cd /Users/byronwade/Wormhole
git stash push -u -m "deps-security-robustness WIP (pre byronwade-ui migration)"
git checkout -b feat/byronwade-ui-migration
git status --short
```
Expected: clean working tree on `feat/byronwade-ui-migration`.

> NOTE: If the user wants the deps work kept on its branch instead of stashed, commit it on `fix/deps-security-robustness` first, then branch. Confirm with the user before stashing if unsure.

---

## Phase A — Web app

### Task A1: Register the `@byronwade` namespace (web)

**Files:** Modify: `apps/web/components.json`

- [ ] **Step 1: Add the `registries` mapping**

Replace the existing `"registries": {}` line in `apps/web/components.json` with:
```json
  "registries": {
    "@byronwade": "https://ui.byronwade.com/r/{name}.json"
  }
```

- [ ] **Step 2: Verify the CLI resolves the namespace**

Run: `cd apps/web && npx shadcn@latest view @byronwade/button 2>&1 | head -5`
Expected: prints button registry item metadata (no "unknown registry" error).

- [ ] **Step 3: Commit**

```bash
git add apps/web/components.json
git commit -m "chore(web): register @byronwade ui registry namespace"
```

### Task A2: Install foundation + override brand to purple (web)

**Files:** Modify: `apps/web/src/app/globals.css`, `apps/web/package.json`

- [ ] **Step 1: Install the foundation tokens**

Run: `cd apps/web && npx shadcn@latest add @byronwade/foundation --yes --overwrite`
Expected: merges foundation `@theme`/`:root`/`.dark` cssVars into `src/app/globals.css`, adds `tw-animate-css` dep. The default `--brand` will be green `oklch(0.6 0.17 148)`.

- [ ] **Step 2: Override `--brand` to Wormhole purple**

In `apps/web/src/app/globals.css`, find the foundation-injected `:root { ... }` block and set the light-mode brand tokens (replace whatever green values were injected):
```css
  --brand: oklch(0.539 0.246 293);
  --brand-foreground: oklch(0.99 0.002 95);
  --brand-muted: oklch(0.96 0.03 293);
```
Then in the `.dark { ... }` block set:
```css
  --brand: oklch(0.62 0.21 293);
  --brand-foreground: oklch(0.985 0.001 95);
  --brand-muted: oklch(0.32 0.06 293);
```

- [ ] **Step 3: Remove duplicate/legacy Wormhole token blocks**

The old file had hand-written `:root`/`.dark` token blocks (the "Wormhole Brand Colors" comment, neutral `--primary` etc.). Delete the *legacy* duplicates so only the foundation-managed blocks (with your purple override) remain. Keep any genuinely Wormhole-specific custom properties that foundation does not define; move them below the foundation block.

- [ ] **Step 4: Verify it compiles**

Run: `cd apps/web && pnpm typecheck`
Expected: PASS (no CSS import errors; tokens are CSS so typecheck mainly confirms nothing broke).

Run: `cd apps/web && pnpm build 2>&1 | tail -20`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/globals.css apps/web/package.json apps/web/pnpm-lock.yaml
git commit -m "feat(web): install byronwade-ui foundation, override brand to Wormhole purple"
```

### Task A3: Install all byronwade-ui primitives (web)

**Files:** Overwrite: `apps/web/src/components/ui/*.tsx`; Modify: `apps/web/package.json`

- [ ] **Step 1: Install the full primitive set**

Run: `cd apps/web && npx shadcn@latest add @byronwade/all --yes --overwrite`
Expected: overwrites `src/components/ui/*` with Base UI versions, installs `@base-ui/react`. Also writes higher-level block files (hero-section, page-header, etc.) — that is fine; they are unused for now.

- [ ] **Step 2: Confirm Base UI landed and Radix slot is gone from primitives**

Run: `cd apps/web && grep -rl "@radix-ui" src/components/ui | head`
Expected: empty (primitives no longer import Radix).

Run: `cd apps/web && grep -rl "@base-ui/react" src/components/ui | wc -l`
Expected: a non-zero count.

- [ ] **Step 3: Commit the primitive swap (pre-reconcile checkpoint)**

```bash
git add apps/web/src/components/ui apps/web/package.json apps/web/pnpm-lock.yaml
git commit -m "feat(web): swap shadcn primitives for byronwade-ui (Base UI)"
```

### Task A4: Reconcile consumers — `asChild` → `render` (web)

**Files:** Modify these 11 files:
`apps/web/src/app/about/page.tsx`, `apps/web/src/app/changelog/page.tsx`, `apps/web/src/app/page.tsx`, `apps/web/src/app/docs/page.tsx`, `apps/web/src/app/docs/layout.tsx`, `apps/web/src/app/docs/installation/page.tsx`, `apps/web/src/app/download/macos/page.tsx`, `apps/web/src/app/download/windows/page.tsx`, `apps/web/src/app/download/linux/page.tsx`, `apps/web/src/app/pricing/page.tsx`, `apps/web/src/app/j/[code]/page.tsx`

- [ ] **Step 1: See the failure list**

Run: `cd apps/web && pnpm typecheck 2>&1 | head -60`
Expected: TypeScript errors about `asChild` not existing on Base UI component props (e.g. on `Button`, `DialogTrigger`, etc.). This is the worklist.

- [ ] **Step 2: Convert each `asChild` usage to `render`**

Base UI replaces Radix's `asChild` + child-element pattern with a `render` prop. Transform pattern:

```tsx
// BEFORE (Radix)
<Button asChild>
  <Link href="/download">Download</Link>
</Button>

// AFTER (Base UI)
<Button render={<Link href="/download" />}>Download</Button>
```

Rules:
- The element that *was* the single child becomes the `render={<El .../>}` value (self-closing, no children).
- Text/inner content stays as children of the wrapper component.
- For `<Button>` rendering a non-`<button>` (e.g. a `Link`/`a`), the byronwade `Button` already infers `nativeButton={false}` from the render target — no manual prop needed.
- Same transform applies to any `DialogTrigger asChild` / `DropdownMenuTrigger asChild` / `TooltipTrigger asChild`, etc.

Apply this to every `asChild` occurrence flagged in Step 1 across the 11 files.

- [ ] **Step 3: Verify typecheck is clean for asChild**

Run: `cd apps/web && pnpm typecheck 2>&1 | grep -i "aschild" | head`
Expected: empty (no more asChild errors). Other prop-drift errors may remain — handled in A5.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app
git commit -m "fix(web): migrate asChild to Base UI render prop"
```

### Task A5: Reconcile remaining prop drift + prune Radix deps (web)

**Files:** Modify: consumer files flagged by typecheck; `apps/web/package.json`

- [ ] **Step 1: Get the remaining error list**

Run: `cd apps/web && pnpm typecheck 2>&1 | tail -80`
Expected: any residual Base UI prop differences (e.g. controlled `open`/`onOpenChange` shape, `Select` value props, `defaultValue` typing). If empty, skip to Step 3.

- [ ] **Step 2: Fix each flagged error against Base UI's API**

For each error, open the byronwade-ui component (`src/components/ui/<name>.tsx`) to see the exact prop names it forwards, and adjust the call site to match. Fix one component family at a time, re-running `pnpm typecheck` after each until clean. Do **not** suppress with `any`/`@ts-ignore`.

- [ ] **Step 3: Prune now-unused Radix packages**

Run: `cd apps/web && for p in $(node -e "const d=require('./package.json').dependencies;console.log(Object.keys(d).filter(k=>k.startsWith('@radix-ui/')).join(' '))"); do grep -rq "$p" src && echo "KEEP $p" || echo "REMOVE $p"; done`
Then remove every package printed as `REMOVE` from `apps/web/package.json` dependencies and run `pnpm install`.
Expected: only Radix packages still imported in `src` remain.

- [ ] **Step 4: Full verification gate**

Run: `cd apps/web && pnpm typecheck && pnpm build 2>&1 | tail -20`
Expected: typecheck PASS, build succeeds.

- [ ] **Step 5: Visual smoke check**

Run: `cd apps/web && pnpm dev` and load `/`, `/pricing`, `/download/macos`, `/docs`, `/j/test`.
Expected: pages render, buttons are pill-shaped, brand accents/links are purple (not green), dark mode correct. Note any visual regressions for follow-up.

- [ ] **Step 6: Commit**

```bash
git add apps/web/package.json apps/web/pnpm-lock.yaml apps/web/src
git commit -m "fix(web): reconcile Base UI prop drift, prune unused Radix deps"
```

---

## Phase B — Desktop app

### Task B1: Upgrade desktop to Tailwind v4 (prerequisite)

**Files:** Modify: `apps/desktop/package.json`, `apps/desktop/postcss.config.js`; Delete: `apps/desktop/tailwind.config.js`; Rewrite: `apps/desktop/src/index.css`

- [ ] **Step 1: Swap Tailwind toolchain deps**

In `apps/desktop/package.json` devDependencies: remove `tailwindcss@^3.4.15`, `tailwindcss-animate`, `autoprefixer`, `postcss`. Add `"tailwindcss": "^4"`, `"@tailwindcss/postcss": "^4"`, `"tw-animate-css": "^1.4.0"`. Then:
```bash
cd apps/desktop && pnpm install
```

- [ ] **Step 2: Convert PostCSS config to v4**

Replace `apps/desktop/postcss.config.js` contents with:
```js
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
```

- [ ] **Step 3: Delete the v3 config**

Run: `rm apps/desktop/tailwind.config.js`
(Tailwind v4 is CSS-first; the `content` glob is auto-detected and theme moves to `@theme` in CSS. The custom `wormhole.*` colors are re-added in Step 4.)

- [ ] **Step 4: Rewrite `index.css` for v4 with foundation-ready structure**

Replace the top of `apps/desktop/src/index.css`. Remove the `@tailwind base/components/utilities` directives and the `@layer base { :root { --background: <HSL triplet> ... } }` blocks (foundation will own tokens in B3). Start the file with:
```css
@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

/* Wormhole-specific custom colors preserved from the old tailwind.config.js */
@theme {
  --color-wormhole-hunter: #355E3B;
  --color-wormhole-hunter-light: #4A7C59;
  --color-wormhole-hunter-dark: #2D4F32;
  --color-wormhole-off-black: #0d0d0d;
  --color-wormhole-off-white: #f5f5f5;
}
```
Keep any other app-specific rules that lived lower in the file.

- [ ] **Step 5: Verify v4 builds BEFORE touching components**

Run: `cd apps/desktop && pnpm build 2>&1 | tail -25`
Expected: `tsc && vite build` succeeds with Tailwind v4. (Some token-based utility classes may visually regress because foundation tokens are not installed yet — that is expected and fixed in B3. The build must still pass.)

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/package.json apps/desktop/pnpm-lock.yaml apps/desktop/postcss.config.js apps/desktop/src/index.css
git rm apps/desktop/tailwind.config.js
git commit -m "chore(desktop): upgrade Tailwind v3 -> v4 (byronwade-ui prerequisite)"
```

### Task B2: Register the `@byronwade` namespace (desktop)

**Files:** Modify: `apps/desktop/components.json`

- [ ] **Step 1: Add the `registries` mapping and clear stale tailwind.config reference**

Add to `apps/desktop/components.json`:
```json
  "registries": {
    "@byronwade": "https://ui.byronwade.com/r/{name}.json"
  }
```
Also set `"tailwind": { ..., "config": "" }` (was `"tailwind.config.js"`, now deleted).

- [ ] **Step 2: Verify resolution**

Run: `cd apps/desktop && npx shadcn@latest view @byronwade/button 2>&1 | head -5`
Expected: prints button item metadata.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/components.json
git commit -m "chore(desktop): register @byronwade ui registry namespace"
```

### Task B3: Install foundation + brand override (desktop)

**Files:** Modify: `apps/desktop/src/index.css`, `apps/desktop/package.json`

- [ ] **Step 1: Install foundation**

Run: `cd apps/desktop && npx shadcn@latest add @byronwade/foundation --yes --overwrite`
Expected: merges foundation `@theme`/`:root`/`.dark` tokens into `src/index.css`.

- [ ] **Step 2: Override `--brand` to purple**

Apply the same purple `--brand`/`--brand-foreground`/`--brand-muted` overrides as Task A2 Step 2 (light `:root` and `.dark`), using the values from the Reference block at the top of this plan.

- [ ] **Step 3: Verify build**

Run: `cd apps/desktop && pnpm build 2>&1 | tail -20`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/index.css apps/desktop/package.json apps/desktop/pnpm-lock.yaml
git commit -m "feat(desktop): install byronwade-ui foundation, override brand to purple"
```

### Task B4: Install primitives (desktop)

**Files:** Overwrite: `apps/desktop/src/components/ui/*.tsx`; Modify: `apps/desktop/package.json`

- [ ] **Step 1: Install the full primitive set**

Run: `cd apps/desktop && npx shadcn@latest add @byronwade/all --yes --overwrite`
Expected: overwrites the 17 existing ui components with Base UI versions, installs `@base-ui/react`.

- [ ] **Step 2: Confirm swap**

Run: `cd apps/desktop && grep -rl "@radix-ui" src/components/ui | head`
Expected: empty.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/components/ui apps/desktop/package.json apps/desktop/pnpm-lock.yaml
git commit -m "feat(desktop): swap shadcn primitives for byronwade-ui (Base UI)"
```

### Task B5: Reconcile consumers + prune Radix (desktop)

**Files:** Modify: `apps/desktop/src/App.tsx`; consumer files flagged by typecheck; `apps/desktop/package.json`

- [ ] **Step 1: Convert the one `asChild` usage**

In `apps/desktop/src/App.tsx` around line 1069, convert:
```tsx
// BEFORE
<ContextMenuTrigger asChild>
  <SomeChild ... />
</ContextMenuTrigger>
// AFTER
<ContextMenuTrigger render={<SomeChild ... />} />
```
(Move the child element into `render={...}` as a self-closing element; keep any text content as children of the trigger.)

- [ ] **Step 2: Get remaining error list**

Run: `cd apps/desktop && pnpm typecheck 2>&1 | tail -60`
Expected: residual Base UI prop-drift errors (if any). Fix each against the installed component's API, one family at a time, re-running typecheck until clean. No `any`/`@ts-ignore`.

- [ ] **Step 3: Prune unused Radix deps**

Run: `cd apps/desktop && for p in $(node -e "const d=require('./package.json').dependencies;console.log(Object.keys(d).filter(k=>k.startsWith('@radix-ui/')).join(' '))"); do grep -rq "$p" src && echo "KEEP $p" || echo "REMOVE $p"; done`
Remove every `REMOVE` package from `apps/desktop/package.json` (note: `@radix-ui/react-icons` may still be imported — keep if so), then `pnpm install`.

- [ ] **Step 4: Full verification gate**

Run: `cd apps/desktop && pnpm typecheck && pnpm test:run && pnpm build 2>&1 | tail -20`
Expected: typecheck PASS, vitest PASS, build succeeds.

- [ ] **Step 5: Tauri runtime smoke check**

Run: `cd apps/desktop && pnpm tauri dev`
Expected: app launches; Homepage, SetupWizard, TransferProgress, context menus, dialogs render; brand accents purple; window controls intact.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src apps/desktop/package.json apps/desktop/pnpm-lock.yaml
git commit -m "fix(desktop): reconcile Base UI prop drift, prune unused Radix deps"
```

---

## Final verification

### Task C: Cross-app sanity

- [ ] **Step 1: Both apps build clean from scratch**

```bash
cd /Users/byronwade/Wormhole/apps/web && pnpm typecheck && pnpm build 2>&1 | tail -5
cd /Users/byronwade/Wormhole/apps/desktop && pnpm typecheck && pnpm test:run && pnpm build 2>&1 | tail -5
```
Expected: all PASS.

- [ ] **Step 2: Confirm no stray Radix primitive imports remain in either ui dir**

Run: `grep -rl "@radix-ui/react-slot\|@radix-ui/react-dialog" apps/web/src/components/ui apps/desktop/src/components/ui`
Expected: empty.

- [ ] **Step 3: Confirm brand is purple, not green, in both token files**

Run: `grep -n "148" apps/web/src/app/globals.css apps/desktop/src/index.css`
Expected: no remaining `--brand` set to a hue-148 (green) value. (Foundation chart tokens may legitimately use other hues — only `--brand*` must be purple `293`.)

- [ ] **Step 4: Push the branch**

```bash
cd /Users/byronwade/Wormhole && git push -u origin feat/byronwade-ui-migration
```
(Only after the user confirms they want it pushed.)

---

## Notes / open items

- **Blocks deferred:** `@byronwade/all` installs higher-level blocks (hero-section, page-header, stat-card, morph-dock, etc.) into `components/ui/`. They are unused now per the "primitives + tokens only" decision. A follow-up plan can adopt them page-by-page.
- **If `shadcn add @byronwade/all` does not overwrite cleanly** (e.g. prompts), run per-family: `npx shadcn@latest add @byronwade/button @byronwade/card @byronwade/dialog ... --yes --overwrite`. Git is the diff baseline since the branch is clean.
- **Charts/Three.js (web):** if any chart/three component hard-codes colors, re-point to the new `--chart-*` tokens during A5 visual smoke.
