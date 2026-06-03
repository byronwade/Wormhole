# Team Dashboard Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **UI-building tasks (Phase 2+) MUST invoke `frontend-design`** to generate the actual markup — this plan specifies the *contract* (route, data, states, components, acceptance criteria), not pixel-level JSX, because frontend-design produces higher-quality UI than inlined snippets. All UI MUST follow `AGENTS.md` (repo root).

**Goal:** Build the logged-in web app shell for Wormhole's paid team product in `apps/web` — auth, team management, devices/mounts, and a billing scaffold — fully wired to the in-process `@byronwade/fakebase` mock, so the UI/UX can be built before the real backend exists.

**Architecture:** Next.js 15 App Router (React 19, RSC). A `@byronwade/fakebase` in-memory kernel + seed data backs a Supabase-shaped client (`@byronwade/fakebase/next`, which mirrors `@supabase/ssr`). Data flows through small typed data-access modules and a `TeamProvider` (split data/actions contexts + `useReducer`, mirroring `src/lib/comms-store.tsx`). Migration to real Supabase later = swap the import and drop the `{ kernel }` option. File transfer stays out of scope — this is control-plane UI only (see `docs/superpowers/specs/2026-06-03-open-core-team-cloud-architecture.md`).

**Tech Stack:** Next 15.5.7, React 19.1, TypeScript 5, Tailwind v4, byronwade-ui/shadcn (`src/components/ui/*`), react-hook-form + zod, recharts, sonner, lucide-react, next-themes. Tests: Vitest + @testing-library/react + happy-dom (added in Phase 0).

---

## File Structure

**New data layer (`apps/web/src/lib/fakebase/`):**
- `schema.ts` — `ProjectSchemaIR` (tables: `teams`, `team_members`, `devices`, `mounts`, `audit_log`, `subscriptions`).
- `seed.ts` — deterministic seed data (one team, members, devices, mounts, audit entries, a subscription).
- `kernel.ts` — singleton `createMemoryKernel(schema)` seeded from `seed.ts`.
- `client.ts` — `createBrowserClient(url, key, { kernel })` factory (client components).
- `server.ts` — `createServerClient(url, key, { kernel, cookies })` factory (server components / route handlers), reading Next.js `cookies()`.
- `types.ts` — hand-written row types (`Team`, `TeamMember`, `Device`, `Mount`, `AuditEntry`, `Subscription`) until real `database.types.ts` is generated.

**Data access (`apps/web/src/lib/data/`):** one module per entity, each a thin typed wrapper over the supabase-shaped client.
- `auth.ts`, `teams.ts`, `members.ts`, `devices.ts`, `mounts.ts`, `billing.ts`.

**State (`apps/web/src/lib/team-store.tsx`):** `TeamProvider`, `useTeam()`, `useTeamActions()` — mirrors `comms-store.tsx`.

**Routes (`apps/web/src/app/`):**
- `(auth)/login/page.tsx`, `(auth)/signup/page.tsx`, `(auth)/layout.tsx` — centered auth shell.
- `onboarding/page.tsx` — create-or-join team.
- `(app)/layout.tsx` — auth-gated shell (sidebar + topbar).
- `(app)/dashboard/page.tsx` — Overview.
- `(app)/team/page.tsx` — Members.
- `(app)/devices/page.tsx` — Devices & mounts.
- `(app)/billing/page.tsx` — Billing scaffold.
- `(app)/settings/page.tsx` — stub.
- `middleware.ts` (web root `apps/web/`) — redirect unauthenticated `(app)` requests to `/login`.

**Shell components (`apps/web/src/components/app/`):** `app-sidebar.tsx`, `app-topbar.tsx`, `team-switcher.tsx`, `user-menu.tsx`, `nav-items.ts`.

**Env:** `apps/web/.env.local` — `NEXT_PUBLIC_FAKEBASE_URL=local`, `NEXT_PUBLIC_FAKEBASE_KEY=dev-key`.

---

## Phase 0 — Tooling & fakebase install

### Task 0.1: Install test runner + fakebase

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/vitest.config.ts`
- Create: `apps/web/vitest.setup.ts`

- [ ] **Step 1: Install dependencies**

Run from `apps/web/`:
```bash
pnpm add @byronwade/fakebase
pnpm add -D vitest @testing-library/react @testing-library/user-event @testing-library/jest-dom happy-dom @vitejs/plugin-react
```
Expected: packages added to `apps/web/package.json`.

- [ ] **Step 2: Add test scripts**

In `apps/web/package.json` `"scripts"`, add:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Create `apps/web/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "happy-dom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
```

- [ ] **Step 4: Create `apps/web/vitest.setup.ts`**

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 5: Smoke test the runner**

Create `apps/web/src/lib/fakebase/__tests__/smoke.test.ts`:
```ts
import { describe, it, expect } from "vitest";
describe("vitest", () => {
  it("runs", () => expect(1 + 1).toBe(2));
});
```
Run: `pnpm test` (from `apps/web/`)
Expected: 1 passing test.

- [ ] **Step 6: Commit**

```bash
git add apps/web/package.json apps/web/pnpm-lock.yaml apps/web/vitest.config.ts apps/web/vitest.setup.ts apps/web/src/lib/fakebase/__tests__/smoke.test.ts
git commit -m "chore(web): add vitest + testing-library + fakebase"
```

> **Note:** Before Phase 1, confirm the exact `@byronwade/fakebase` API by reading its installed types: `cat apps/web/node_modules/@byronwade/fakebase/dist/index.d.ts` and `.../dist/next.d.ts`. Adjust `createMemoryKernel` / `createServerClient` / `createBrowserClient` call shapes in Phase 1 to match the real signatures. The shapes below reflect the published `.d.ts` (see spec §6) but verify before relying on them.

---

## Phase 1 — Data layer (TDD)

### Task 1.1: Schema IR + row types

**Files:**
- Create: `apps/web/src/lib/fakebase/types.ts`
- Create: `apps/web/src/lib/fakebase/schema.ts`
- Test: `apps/web/src/lib/fakebase/__tests__/schema.test.ts`

- [ ] **Step 1: Write the failing test**

`schema.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { schema } from "../schema";

describe("schema", () => {
  it("defines the team-product tables", () => {
    const names = schema.tables.map((t) => t.name).sort();
    expect(names).toEqual(
      ["audit_log", "devices", "mounts", "subscriptions", "team_members", "teams"].sort()
    );
  });

  it("team_members has a role column", () => {
    const tm = schema.tables.find((t) => t.name === "team_members")!;
    expect(tm.columns.map((c) => c.name)).toContain("role");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/fakebase/__tests__/schema.test.ts`
Expected: FAIL — cannot find module `../schema`.

- [ ] **Step 3: Write `types.ts`**

```ts
export type Role = "owner" | "admin" | "member";
export type MemberStatus = "active" | "invited" | "suspended";
export type DeviceStatus = "online" | "offline";
export type Permission = "ro" | "rw";
export type MountStatus = "mounted" | "stale" | "error";
export type Plan = "free" | "pro" | "team";

export interface Team { id: string; name: string; slug: string; plan: Plan; seats_total: number; owner_id: string; created_at: string; }
export interface TeamMember { id: string; team_id: string; user_id: string | null; email: string; role: Role; status: MemberStatus; invited_at: string | null; joined_at: string | null; }
export interface Device { id: string; team_id: string; user_id: string; name: string; platform: string; status: DeviceStatus; last_seen_at: string; }
export interface Mount { id: string; team_id: string; device_id: string; share_name: string; path: string; permission: Permission; status: MountStatus; mounted_at: string; }
export interface AuditEntry { id: string; team_id: string; actor_id: string; action: string; target: string; created_at: string; }
export interface Subscription { id: string; team_id: string; plan: Plan; seats: number; status: "active" | "past_due" | "canceled"; current_period_end: string; }
```

- [ ] **Step 4: Write `schema.ts`**

Use the `ProjectSchemaIR`/`TableIR`/`ColumnIR` types exported by `@byronwade/fakebase`. Define the 6 tables with columns matching `types.ts` (pk `id` text, fks as text, timestamps as text/timestamptz, enums as text). Shape:
```ts
import type { ProjectSchemaIR } from "@byronwade/fakebase";

const col = (name: string, type = "text", opts: Record<string, unknown> = {}) => ({ name, type, ...opts });

export const schema: ProjectSchemaIR = {
  tables: [
    { name: "teams", columns: [col("id", "text", { primaryKey: true }), col("name"), col("slug"), col("plan"), col("seats_total", "int4"), col("owner_id"), col("created_at", "timestamptz")] },
    { name: "team_members", columns: [col("id", "text", { primaryKey: true }), col("team_id"), col("user_id"), col("email"), col("role"), col("status"), col("invited_at", "timestamptz"), col("joined_at", "timestamptz")] },
    { name: "devices", columns: [col("id", "text", { primaryKey: true }), col("team_id"), col("user_id"), col("name"), col("platform"), col("status"), col("last_seen_at", "timestamptz")] },
    { name: "mounts", columns: [col("id", "text", { primaryKey: true }), col("team_id"), col("device_id"), col("share_name"), col("path"), col("permission"), col("status"), col("mounted_at", "timestamptz")] },
    { name: "audit_log", columns: [col("id", "text", { primaryKey: true }), col("team_id"), col("actor_id"), col("action"), col("target"), col("created_at", "timestamptz")] },
    { name: "subscriptions", columns: [col("id", "text", { primaryKey: true }), col("team_id"), col("plan"), col("seats", "int4"), col("status"), col("current_period_end", "timestamptz")] },
  ],
} as ProjectSchemaIR;
```
> If `ProjectSchemaIR`'s actual field names differ from `tables`/`columns`/`name`/`type` (verify against the `.d.ts`), adjust to match; keep the test's `schema.tables.map(t => t.name)` contract by exposing a `tables` array, or update the test to the real shape.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test src/lib/fakebase/__tests__/schema.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/fakebase/types.ts apps/web/src/lib/fakebase/schema.ts apps/web/src/lib/fakebase/__tests__/schema.test.ts
git commit -m "feat(web): fakebase schema + row types"
```

### Task 1.2: Seed data

**Files:**
- Create: `apps/web/src/lib/fakebase/seed.ts`
- Test: `apps/web/src/lib/fakebase/__tests__/seed.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { seed } from "../seed";

describe("seed", () => {
  it("has one team with an owner among its members", () => {
    expect(seed.teams).toHaveLength(1);
    const owner = seed.team_members.find((m) => m.role === "owner");
    expect(owner).toBeDefined();
    expect(owner!.team_id).toBe(seed.teams[0].id);
  });

  it("every mount references a seeded device", () => {
    const deviceIds = new Set(seed.devices.map((d) => d.id));
    for (const m of seed.mounts) expect(deviceIds.has(m.device_id)).toBe(true);
  });

  it("has an active subscription for the team", () => {
    expect(seed.subscriptions.some((s) => s.team_id === seed.teams[0].id && s.status === "active")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/fakebase/__tests__/seed.test.ts`
Expected: FAIL — cannot find module `../seed`.

- [ ] **Step 3: Write `seed.ts`**

Export `seed` as `{ teams: Team[]; team_members: TeamMember[]; devices: Device[]; mounts: Mount[]; audit_log: AuditEntry[]; subscriptions: Subscription[] }`. Use **fixed string ids and ISO timestamps** (no `Date.now()`/`Math.random()` — deterministic). Include: 1 team (`team-1`, plan `team`, `seats_total: 10`, `owner_id: user-1`); ~5 `team_members` (1 owner, 1 admin, 2 active members, 1 `invited`); ~4 `devices` across 2 users (mix online/offline, platforms macos/windows/linux); ~5 `mounts` (mix ro/rw, statuses); ~8 `audit_log` entries; 1 `subscriptions` row (active, seats 5). Import types from `./types`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/fakebase/__tests__/seed.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/fakebase/seed.ts apps/web/src/lib/fakebase/__tests__/seed.test.ts
git commit -m "feat(web): deterministic fakebase seed data"
```

### Task 1.3: Kernel + client factories

**Files:**
- Create: `apps/web/src/lib/fakebase/kernel.ts`
- Create: `apps/web/src/lib/fakebase/client.ts`
- Create: `apps/web/src/lib/fakebase/server.ts`
- Create: `apps/web/.env.local`
- Test: `apps/web/src/lib/fakebase/__tests__/kernel.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { getBrowserClient } from "../client";

describe("fakebase client", () => {
  it("queries seeded teams through the supabase-shaped client", async () => {
    const supabase = getBrowserClient();
    const { data, error } = await supabase.from("teams").select("*");
    expect(error).toBeNull();
    expect(data?.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/fakebase/__tests__/kernel.test.ts`
Expected: FAIL — cannot find module `../client`.

- [ ] **Step 3: Create `.env.local`**

```
NEXT_PUBLIC_FAKEBASE_URL=local
NEXT_PUBLIC_FAKEBASE_KEY=dev-key
```

- [ ] **Step 4: Write `kernel.ts`**

```ts
import { createMemoryKernel } from "@byronwade/fakebase";
import { schema } from "./schema";
import { seed } from "./seed";

let _kernel: ReturnType<typeof createMemoryKernel> | null = null;

export function getKernel() {
  if (!_kernel) {
    _kernel = createMemoryKernel(schema);
    // Seed: load each table. Use the kernel's seeding API — verify exact method
    // name against the .d.ts (e.g. kernel.seed(seed) or per-table insert).
    // Pseudocode contract: for each [table, rows] in seed → insert rows.
  }
  return _kernel;
}
```
> Replace the seed-loading comment with the kernel's real seeding call once confirmed from the installed `.d.ts`. If the kernel accepts initial data in `createMemoryKernel(schema, { seed })`, prefer that.

- [ ] **Step 5: Write `client.ts`**

```ts
"use client";
import { createBrowserClient } from "@byronwade/fakebase/next";
import { getKernel } from "./kernel";

export function getBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_FAKEBASE_URL!,
    process.env.NEXT_PUBLIC_FAKEBASE_KEY!,
    { kernel: getKernel() }
  );
}
```

- [ ] **Step 6: Write `server.ts`**

```ts
import { cookies } from "next/headers";
import { createServerClient } from "@byronwade/fakebase/next";
import { getKernel } from "./kernel";

export async function getServerClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_FAKEBASE_URL!,
    process.env.NEXT_PUBLIC_FAKEBASE_KEY!,
    {
      kernel: getKernel(),
      cookies: {
        get: (name) => cookieStore.get(name)?.value,
        set: (name, value, options) => cookieStore.set(name, value, options),
        remove: (name, options) => cookieStore.set(name, "", { ...options, maxAge: 0 }),
      },
    }
  );
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `pnpm test src/lib/fakebase/__tests__/kernel.test.ts`
Expected: PASS. (If the kernel seeding API differs, fix `kernel.ts` until green.)

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/lib/fakebase/kernel.ts apps/web/src/lib/fakebase/client.ts apps/web/src/lib/fakebase/server.ts apps/web/src/lib/fakebase/__tests__/kernel.test.ts apps/web/.env.local
git commit -m "feat(web): fakebase kernel + browser/server client factories"
```

### Task 1.4: Data-access modules (TDD)

**Files:**
- Create: `apps/web/src/lib/data/members.ts`, `devices.ts`, `mounts.ts`, `teams.ts`, `billing.ts`
- Test: `apps/web/src/lib/data/__tests__/members.test.ts` (+ one per module)

For each module, write functions that take a supabase-shaped client and wrap queries with typed returns. Example contract for `members.ts`:
```ts
import type { TeamMember, Role } from "@/lib/fakebase/types";
type Client = ReturnType<typeof import("@/lib/fakebase/client").getBrowserClient>;

export async function listMembers(c: Client, teamId: string): Promise<TeamMember[]> {
  const { data, error } = await c.from("team_members").select("*").eq("team_id", teamId);
  if (error) throw error;
  return (data ?? []) as TeamMember[];
}
export async function inviteMember(c: Client, teamId: string, email: string, role: Role): Promise<TeamMember> { /* insert status:'invited' */ }
export async function updateMemberRole(c: Client, memberId: string, role: Role): Promise<void> { /* update */ }
export async function removeMember(c: Client, memberId: string): Promise<void> { /* delete */ }
```

- [ ] **Step 1: Write the failing test for `members.ts`**

`members.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { getBrowserClient } from "@/lib/fakebase/client";
import { listMembers, inviteMember } from "../members";
import { seed } from "@/lib/fakebase/seed";

const teamId = seed.teams[0].id;

describe("members data access", () => {
  it("lists seeded members for a team", async () => {
    const members = await listMembers(getBrowserClient(), teamId);
    expect(members.length).toBeGreaterThanOrEqual(4);
  });
  it("invite adds a member with status invited", async () => {
    const c = getBrowserClient();
    const m = await inviteMember(c, teamId, "new@example.com", "member");
    expect(m.status).toBe("invited");
    const after = await listMembers(c, teamId);
    expect(after.some((x) => x.email === "new@example.com")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/data/__tests__/members.test.ts`
Expected: FAIL — module `../members` not found.

- [ ] **Step 3: Implement `members.ts`** (per contract above; generate a UUID-like id with a deterministic counter or `crypto.randomUUID()` — note: `crypto.randomUUID()` is allowed in app/test runtime, just not in Workflow scripts).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/data/__tests__/members.test.ts`
Expected: PASS.

- [ ] **Step 5: Repeat Steps 1–4 for `devices.ts` (listDevices, listMountsForDevice), `mounts.ts` (listMounts, unmount), `teams.ts` (getTeam, createTeam, listMyTeams), `billing.ts` (getSubscription, updateSeats).** Each gets its own test file with a list + one mutation assertion.

- [ ] **Step 6: Run the full suite**

Run: `pnpm test`
Expected: all data-access tests PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/data
git commit -m "feat(web): typed data-access modules over fakebase (TDD)"
```

### Task 1.5: TeamProvider (mirror comms-store)

**Files:**
- Create: `apps/web/src/lib/team-store.tsx`
- Test: `apps/web/src/lib/__tests__/team-store.test.tsx`

Mirror `src/lib/comms-store.tsx`: split `DataCtx` (current team, members, devices, mounts, subscription) and `ActionsCtx` (invite, removeMember, updateRole, refresh), `useReducer`, a `commit()` latency helper. Hooks `useTeam()` / `useTeamActions()` throw if used outside `<TeamProvider>`. Provider accepts an optional `seed`-style initial snapshot prop for tests/storybook (default = real data via data-access on mount).

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { TeamProvider, useTeam, useTeamActions } from "../team-store";

function Probe() {
  const { members } = useTeam();
  return <div>members:{members.length}</div>;
}

describe("TeamProvider", () => {
  it("provides members from initial snapshot", () => {
    render(
      <TeamProvider initial={{ team: null, members: [{ id: "m1" } as any], devices: [], mounts: [], subscription: null }}>
        <Probe />
      </TeamProvider>
    );
    expect(screen.getByText("members:1")).toBeInTheDocument();
  });

  it("useTeam throws outside provider", () => {
    expect(() => render(<Probe />)).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — Run: `pnpm test src/lib/__tests__/team-store.test.tsx` → FAIL (module missing).

- [ ] **Step 3: Implement `team-store.tsx`** per the comms-store pattern + the contract above.

- [ ] **Step 4: Run test to verify it passes** — Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/team-store.tsx apps/web/src/lib/__tests__/team-store.test.tsx
git commit -m "feat(web): TeamProvider state (split contexts + reducer)"
```

---

## Phase 2 — Auth flow & guard

> **Auth uses the supabase-shaped client directly** (`supabase.auth.signUp`, `signInWithPassword`, `getSession`, `signOut`, `onAuthStateChange`). Email/password only (fakebase OAuth/MFA are dev-only — deferred). All forms use react-hook-form + zod and MUST follow `AGENTS.md` form rules (inline errors, focus first error, submit stays enabled until request starts, loading spinner keeps label, autocomplete/inputmode set, allow paste).

### Task 2.1: Auth data module (TDD)

**Files:**
- Create: `apps/web/src/lib/data/auth.ts`
- Test: `apps/web/src/lib/data/__tests__/auth.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { getBrowserClient } from "@/lib/fakebase/client";
import { signUp, signIn, getSession } from "../auth";

describe("auth", () => {
  it("sign up then sign in establishes a session", async () => {
    const c = getBrowserClient();
    await signUp(c, "alice@example.com", "password123");
    await signIn(c, "alice@example.com", "password123");
    const session = await getSession(c);
    expect(session?.user?.email).toBe("alice@example.com");
  });
});
```

- [ ] **Step 2: Run → FAIL** (`../auth` missing). Run: `pnpm test src/lib/data/__tests__/auth.test.ts`.

- [ ] **Step 3: Implement `auth.ts`**

```ts
type Client = ReturnType<typeof import("@/lib/fakebase/client").getBrowserClient>;
export async function signUp(c: Client, email: string, password: string) {
  const { data, error } = await c.auth.signUp({ email, password });
  if (error) throw error; return data;
}
export async function signIn(c: Client, email: string, password: string) {
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error; return data;
}
export async function getSession(c: Client) {
  const { data } = await c.auth.getSession(); return data.session;
}
export async function signOut(c: Client) { await c.auth.signOut(); }
```
> Verify `auth` method names against `@byronwade/auth`/`@byronwade/fakebase` `.d.ts`; adjust if the mock names them differently.

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Commit** — `git add apps/web/src/lib/data/auth.ts apps/web/src/lib/data/__tests__/auth.test.ts && git commit -m "feat(web): auth data module over fakebase"`

### Task 2.2: Login & signup screens

**Files:**
- Create: `apps/web/src/app/(auth)/layout.tsx`, `(auth)/login/page.tsx`, `(auth)/signup/page.tsx`
- Create: `apps/web/src/components/app/auth-form.tsx`
- Test: `apps/web/src/components/app/__tests__/auth-form.test.tsx`

**Contract (delegate visuals to `frontend-design`):**
- `(auth)/layout.tsx`: centered, branded auth shell (Wormhole purple `#7C3AED` accent, theme-aware), `<title>` per page, reuse `centered-focal.tsx` if it fits.
- `auth-form.tsx`: client component, props `{ mode: "login" | "signup"; onSubmit: (v: {email; password}) => Promise<void> }`. Uses `src/components/ui/form.tsx` + react-hook-form + zod (`email().min`, `password min 8`). States: idle, submitting (spinner, label kept), error (inline + toast via sonner). Email `type="email" autocomplete="email" inputmode="email"`; password `autocomplete={mode==="login"?"current-password":"new-password"}`. Submit stays enabled until request starts. Link to the other mode.
- `login/page.tsx` / `signup/page.tsx`: wire `auth-form` → `signIn`/`signUp` via `getBrowserClient()`, on success `router.push("/onboarding")` (signup) or `/dashboard` (login).

- [ ] **Step 1: Invoke `frontend-design`** to build `(auth)/layout.tsx`, `auth-form.tsx`, and the two pages per the contract above and `AGENTS.md`.

- [ ] **Step 2: Write an interaction test** `auth-form.test.tsx`:
```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthForm } from "../auth-form";

describe("AuthForm", () => {
  it("shows validation error for bad email and submits valid input", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<AuthForm mode="login" onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText(/email/i), "nope");
    await userEvent.type(screen.getByLabelText(/password/i), "password123");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
    expect(await screen.findByText(/valid email/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
    await userEvent.clear(screen.getByLabelText(/email/i));
    await userEvent.type(screen.getByLabelText(/email/i), "a@b.com");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
    expect(onSubmit).toHaveBeenCalledWith({ email: "a@b.com", password: "password123" });
  });
});
```

- [ ] **Step 3: Run → adjust until PASS.** Run: `pnpm test src/components/app/__tests__/auth-form.test.tsx`.

- [ ] **Step 4: Manual check** — `pnpm dev`, visit `/login` and `/signup`; verify keyboard nav, focus ring, error focus, dark/light.

- [ ] **Step 5: Commit** — `git add apps/web/src/app/\(auth\) apps/web/src/components/app/auth-form.tsx apps/web/src/components/app/__tests__/auth-form.test.tsx && git commit -m "feat(web): login + signup screens on fakebase auth"`

### Task 2.3: Route guard middleware

**Files:**
- Create: `apps/web/middleware.ts`

- [ ] **Step 1: Implement middleware** that protects `(app)` routes (`/dashboard`, `/team`, `/devices`, `/billing`, `/settings`). Read the fakebase session from cookies via the server client; if absent, redirect to `/login?next=<path>`. Use a `matcher` config excluding static assets, `/login`, `/signup`, marketing routes.
```ts
import { NextResponse, type NextRequest } from "next/server";
import { getServerClient } from "@/lib/fakebase/server"; // or inline cookie read if middleware can't use next/headers

const PROTECTED = ["/dashboard", "/team", "/devices", "/billing", "/settings"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!PROTECTED.some((p) => pathname.startsWith(p))) return NextResponse.next();
  // Read session cookie name set by fakebase auth; if missing, redirect.
  const hasSession = Boolean(req.cookies.get(/* fakebase session cookie name */ "fb-access-token"));
  if (!hasSession) {
    const url = req.nextUrl.clone(); url.pathname = "/login"; url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}
export const config = { matcher: ["/dashboard/:path*", "/team/:path*", "/devices/:path*", "/billing/:path*", "/settings/:path*"] };
```
> Confirm the actual session cookie name fakebase sets (check `auth` cookie helpers / `.d.ts`); `next/headers` `cookies()` is unavailable in middleware, so read from `req.cookies` directly.

- [ ] **Step 2: Manual check** — logged out, visit `/dashboard` → redirected to `/login?next=/dashboard`. Log in → reach `/dashboard`.

- [ ] **Step 3: Commit** — `git add apps/web/middleware.ts && git commit -m "feat(web): auth route guard middleware"`

---

## Phase 3 — App shell

### Task 3.1: Nav config + sidebar + topbar

**Files:**
- Create: `apps/web/src/components/app/nav-items.ts`, `app-sidebar.tsx`, `app-topbar.tsx`, `team-switcher.tsx`, `user-menu.tsx`

**Contract (delegate visuals to `frontend-design`; use existing ui primitives + `--sidebar-*` tokens):**
- `nav-items.ts`: `export const NAV = [{ href: "/dashboard", label: "Overview", icon: LayoutDashboard }, { href: "/team", label: "Team", icon: Users }, { href: "/devices", label: "Devices", icon: MonitorSmartphone }, { href: "/billing", label: "Billing", icon: CreditCard }, { href: "/settings", label: "Settings", icon: Settings }]` (lucide icons).
- `app-sidebar.tsx`: vertical nav using `NAV`, active state from `usePathname()`, links are real `<Link>` (Cmd/middle-click work), icon + label, `aria-current`, collapses on mobile (use `sheet.tsx`). Wormhole wordmark at top.
- `app-topbar.tsx`: `team-switcher` (left), spacer, `theme-toggle` (reuse `src/components/theme-toggle.tsx`), `user-menu` (right).
- `team-switcher.tsx`: `dropdown-menu.tsx` listing `useTeam().team` (+ "create team"); current team name + `gradient-avatar`.
- `user-menu.tsx`: avatar → dropdown with email, Settings link, Sign out (calls `signOut` then `router.push("/login")`).

- [ ] **Step 1: Invoke `frontend-design`** to build the five files per contract + `AGENTS.md`.
- [ ] **Step 2: Smoke test** `app-sidebar.test.tsx`: render within a router/provider, assert all 5 nav labels present and links have correct `href`.
- [ ] **Step 3: Run → PASS.**
- [ ] **Step 4: Commit** — `git commit -m "feat(web): app sidebar + topbar shell components"`

### Task 3.2: `(app)` layout with guard + providers

**Files:**
- Create: `apps/web/src/app/(app)/layout.tsx`

**Contract:** Server component. Fetch session via `getServerClient()`; if none, `redirect("/login")`. Fetch the current team + initial snapshot (members/devices/mounts/subscription) server-side, pass into a client `<TeamProvider initial={...}>`. Render `<AppSidebar />` + `<AppTopbar />` + `<main>{children}</main>` in a responsive grid (sidebar fixed, content scrolls; respect safe areas; no unwanted scrollbars per `AGENTS.md`).

- [ ] **Step 1: Invoke `frontend-design`** for the layout structure per contract.
- [ ] **Step 2: Manual check** — `/dashboard` shows shell with nav; resizing collapses sidebar to sheet on mobile.
- [ ] **Step 3: Commit** — `git commit -m "feat(web): (app) authed layout with TeamProvider"`

---

## Phase 4 — Onboarding

### Task 4.1: Create-or-join team

**Files:**
- Create: `apps/web/src/app/onboarding/page.tsx`
- Create: `apps/web/src/components/app/create-team-form.tsx`

**Contract:** Authed but team-less users land here after signup. Two paths: **Create team** (`create-team-form`: name → slug auto-derived, calls `teams.createTeam`, then makes the user `owner` in `team_members`, redirect `/dashboard`) and **Join team** (input an invite code/email — stubbed: show "Ask your admin for an invite" empty state since invites are mocked). Forms follow `AGENTS.md`. Use `field.tsx`/`form.tsx`.

- [ ] **Step 1: Invoke `frontend-design`** for `onboarding/page.tsx` + `create-team-form.tsx`.
- [ ] **Step 2: Interaction test** for `create-team-form`: typing a name derives a slug; submit calls the passed `onCreate` with `{ name, slug }`.
- [ ] **Step 3: Run → PASS.** **Step 4: Manual check** — signup → onboarding → create team → dashboard. **Step 5: Commit** — `git commit -m "feat(web): team onboarding (create/join)"`

---

## Phase 5 — Area screens (wired where simple, stubbed where deep)

> Each screen is a server component that reads via `getServerClient()` + data modules for initial data, then hydrates interactive bits through `TeamProvider`. Every screen MUST implement loading (skeletons mirroring content), empty, and error states (`AGENTS.md`). Use `page-header.tsx`, `stat-card.tsx`, `metric-stat.tsx`, `table.tsx`, `empty-state.tsx`.

### Task 5.1: Overview (`/dashboard`)

**Files:** Create `apps/web/src/app/(app)/dashboard/page.tsx`

**Contract:** Top: `page-header` ("Overview"). Row of `stat-card`s: members count, online devices, active mounts, plan/seats used. A recent-activity list from `audit_log` (last 8, locale-aware relative times via date-fns) using `event-timeline.tsx`/`timeline-rail.tsx`. Optional small `recharts` sparkline of mounts over time (can use seeded static points). Empty state if no activity.

- [ ] **Step 1: Invoke `frontend-design`** per contract. **Step 2:** smoke test asserts the 4 stat labels render. **Step 3:** run → PASS. **Step 4:** manual check. **Step 5:** commit `feat(web): dashboard overview`.

### Task 5.2: Team members (`/team`) — fully wired

**Files:** Create `apps/web/src/app/(app)/team/page.tsx`, `apps/web/src/components/app/invite-member-dialog.tsx`, `member-row-actions.tsx`

**Contract:** `table.tsx` of members (avatar via `gradient-avatar`, email, role `badge`/`select`, status `status-pill`, joined date). Header action "Invite member" → `invite-member-dialog` (`dialog.tsx` + form: email + role select → `members.inviteMember` → optimistic add via `useTeamActions`, sonner toast). Row actions (`dropdown-menu`): change role (`members.updateMemberRole`), remove (`alert-dialog.tsx` confirm → `members.removeMember`). Invited members show "Pending" + "Resend"(stub). Reflect filters/role in URL per `AGENTS.md`. Seats: show "5 of 10 seats used"; block invite past `seats_total` with a clear message.

- [ ] **Step 1: Invoke `frontend-design`** per contract. **Step 2: Interaction test** `team` page: inviting `x@y.com` adds a row with status "Pending"; removing a member shows confirm then removes the row. **Step 3:** run → PASS. **Step 4:** manual check (keyboard, focus return after dialog close). **Step 5:** commit `feat(web): team members management (wired)`.

### Task 5.3: Devices & mounts (`/devices`)

**Files:** Create `apps/web/src/app/(app)/devices/page.tsx`

**Contract:** Two sections. **Devices**: `table` (name, platform icon, owner, `status-dot` online/offline, last seen relative). **Mounts**: `table` (share name, device, path, permission `badge` ro/rw, `status-pill`, mounted-at). Read-only this phase (the "log in once → mount anywhere" story is illustrated, not actuated — file plane is out of scope). Empty states for no devices / no mounts.

- [ ] **Step 1: Invoke `frontend-design`** per contract. **Step 2:** smoke test asserts seeded device + mount names render. **Step 3:** run → PASS. **Step 4:** manual check. **Step 5:** commit `feat(web): devices & mounts view`.

### Task 5.4: Billing scaffold (`/billing`)

**Files:** Create `apps/web/src/app/(app)/billing/page.tsx`

**Contract:** Current plan card (plan name, `seats` used / `seats_total`, renewal date from `subscriptions.current_period_end`). Plan comparison (Free/Pro/Team — pull copy from `docs/marketing/08-monetization-strategy.md`) with a disabled "Upgrade" CTA labelled "Coming soon" (Stripe deferred). Invoices section = `empty-state` "No invoices yet". Make clear this is a scaffold.

- [ ] **Step 1: Invoke `frontend-design`** per contract. **Step 2:** smoke test asserts plan name + "seats" text render. **Step 3:** run → PASS. **Step 4:** manual check. **Step 5:** commit `feat(web): billing scaffold`.

### Task 5.5: Settings stub (`/settings`)

**Files:** Create `apps/web/src/app/(app)/settings/page.tsx`

**Contract:** `page-header` + sections (Profile, Team) with disabled/stub fields and a clear "Coming soon" note. Keeps the nav target non-dead-end (`AGENTS.md`).

- [ ] **Step 1: Build** (small enough to do directly, still follow `AGENTS.md`). **Step 2:** commit `feat(web): settings stub`.

---

## Phase 6 — Final verification

### Task 6.1: Full check

- [ ] **Step 1:** `pnpm test` (from `apps/web/`) → all green.
- [ ] **Step 2:** `pnpm typecheck` → no errors.
- [ ] **Step 3:** `pnpm lint` → clean.
- [ ] **Step 4:** `pnpm build` → succeeds.
- [ ] **Step 5: Manual walkthrough** — signup → onboarding → create team → dashboard → invite member → change role → remove member → devices → billing → settings → sign out → guard redirect. Verify dark/light, mobile sidebar, keyboard nav, empty/error states.
- [ ] **Step 6: Commit** any fixes — `git commit -m "test(web): green build + typecheck + lint for team dashboard shell"`

---

## Deferred (own specs later — see architecture vision §7)

- Rust grant/token primitive in `teleport-core` + host handshake verification.
- Free-tier CLI: `wormhole identity`, `wormhole team {init,grant,revoke}`, `--team`/`--grant`.
- `teleport-cloud` crate (real Supabase JWT validation + token signing + revoke endpoint).
- Real Supabase migration (`fakebase migrate export` → `database.types.ts` → swap `@byronwade/fakebase/next` → `@supabase/ssr`), Stripe billing, OAuth/SSO, RLS, real invites/resend, actuated mounts.
