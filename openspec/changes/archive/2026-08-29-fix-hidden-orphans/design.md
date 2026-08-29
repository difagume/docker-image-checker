# Design: fix-hidden-orphans

## Technical Approach

Eliminate B-02 flash by moving `hidden`/`ignored` resolution from client `useEffect` to server RSC (`DashboardContent`) and fix B-03 orphan growth via prefix-aware `remap` + `GC` under `runExclusive`. No storage migration; `data/dashboard-state.json` schema unchanged; `page.tsx` remains static shell. All mutations serialize through `runExclusive` (load→mutate→`writeFileAtomic`), not `writeFileAtomic` alone.

## Architecture Decisions

| Decision | Options | Tradeoff | Choice |
|---|---|---|---|
| Hidden bootstrap | A server-inject `initial*` props vs B client `useEffect` fetch | A: zero flash, one extra parallel read per render; B: 681 ms flash | **A** — `DashboardContent` fetches `getHiddenContainerIds` + `getIgnoredNotificationContainerIds` + `getReferenceUrls` in parallel with `getContainerUpdateStates` and seeds `DashboardProvider` |
| Orphan strategy | A Id migration+GC vs C re-key to `containerName` | A: minimal diff, no uniqueness audit; C: semantic key but needs migration + collision risk | **A** — remap on `phase:done` + `gcHiddenIds(liveIds)` on mount/refresh; defer C |
| Atomicity | `runExclusive` per-file mutex vs rely on `writeFileAtomic` | `writeFileAtomic` serializes writes only; read-modify-write races remain | **runExclusive** — wraps full `loadState→mutate→saveState`; per-path mutex in `fs-atomic` retained as second layer; failures release mutex |
| Truncation | normalize to 12 vs prefix-aware compare + store 64 | Normalize loses precision; prefix-aware preserves canonical Id | **Prefix-aware `idsEqual(a,b)`** — `a===b || a.startsWith(b) || b.startsWith(a)`; remap stores canonical 64-char `newContainerId`; GC intersects via same helper |
| Cache placement | New `use cache` tag vs reuse existing Suspense | New tag adds invalidation surface; existing shell already static | **No new tag** — bootstrap reads are direct `app-state` calls inside `DashboardGate→DashboardContent` Suspense; `page.tsx` keeps zero `instant=false`; header stays decoupled via nested Suspense |

## Data Flow

### Component Boundaries

```
src/app/page.tsx (static shell, no cookies)
 └─ <Suspense>
     └─ src/components/dashboard-gate.tsx (auth+locale, reads cookies)
         ├─ header (title, logout, RefreshButton → updateTag REFRESH_TAGS)
         └─ <Suspense>
             └─ src/components/dashboard-content.tsx (RSC)
                 ├─ getContainerUpdateStates() ──→ docker-inventory / registry-updates (cached)
                 ├─ getHiddenContainerIds()      ─┐
                 ├─ getIgnoredNotificationContainerIds() ─┤ parallel Promise.all, inside Suspense
                 └─ getReferenceUrls()           ─┘
                 └─ props initialHiddenIds/initialIgnoredIds/initialReferenceUrls
                    └─ src/contexts/dashboard-context.tsx (DashboardProvider, client)
                        ├─ useState(initial*) — NO mount fetch for hidden/ignored
                        ├─ isHidden/isIgnored use prefix-aware idsEqual
                        └─ toggles → setHiddenContainerIdsAction → runExclusive → writeFileAtomic
                            └─ src/components/container-dashboard.tsx (pure presentational)

src/hooks/use-container-updates.ts (client) ─┐
  EventSource /api/update-progress phase:done  │ triggers
  └─ remapHiddenIds(old→new) ──────────────────┤→ src/actions/app-state.ts (or direct)
  └─ gcHiddenIds(liveIds) on mount + refresh ──┘  → src/lib/app-state.ts → runExclusive → saveState
```

### Sequence: Hidden Bootstrap (HB-01..03)

```
Browser → page.tsx (static shell, 200) → Suspense skeleton
  DashboardGate: checkAuth()+getLocale() → header rendered (no daemon wait)
  DashboardContent RSC ┬─ Promise.all ─┬─ getContainerUpdateStates()
                       ├───────────────┤─ getHiddenContainerIds()  \
                       └───────────────┘─ getIgnoredNotificationContainerIds() + getReferenceUrls()
  DashboardProvider seeded with initial* → first paint hides correctly (no flash)
  ContainerDashboard filters via isHidden (idsEqual aware)
```

### Sequence: Orphan Remap + GC (OR-01..03, REQ-02/REQ-06)

```
Update: docker stop→remove→create→start
  SSE phase:done {containerId:old64, newContainerId:new64}
    useContainerUpdates.onPhaseDone
      ├─ setContainers optimistic Id=new64
      └─ remapHiddenIds(old64→new64) ─→ runExclusive{ load→ idsEqual find old idx → splice new64 (dedup) → saveState }
  Mount/Refresh:
    liveIds = containers.map(c=>c.container.Id)  // 64-char
    gcHiddenIds(liveIds) ─→ runExclusive{ load→ filter ids where liveIds.some(l=>idsEqual(l,id)) → saveState iff changed }
  Concurrent toggleHide vs remap → both queue on stateStore.__appStateMutex → serialized, last wins, no interleave
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/components/dashboard-content.tsx` | Modify | Parallel fetch hidden/ignored/referenceUrls with `getContainerUpdateStates`; pass `initialHiddenIds`/`initialIgnoredIds`/`initialReferenceUrls` to provider; stays inside `DashboardGate` Suspense |
| `src/contexts/dashboard-context.tsx` | Modify | Seed `useState(initial*)`; delete `useEffect` mount fetch for hidden/ignored; keep `getReferenceUrlsAction` only if reference sync needed; `isHidden`/`isIgnored` use `idsEqual`; toggles keep `set*Action` via `runExclusive` path |
| `src/hooks/use-container-updates.ts` | Modify | On `phase:done` with `newContainerId!==containerId` call `remapHiddenIds(old,new)` + `remapIgnoredIds`; on mount and after `processedContainers` change call `gcHiddenIds(liveIds)`/`gcIgnoredIds`; expose `liveIds` from `processedContainers` |
| `src/lib/app-state.ts` | Modify | Export `idsEqual(a,b)` + `normalizeId` helper; add `remapHiddenIds(old,new)`, `gcHiddenIds(liveIds)`, symmetric `remapIgnoredIds`/`gcIgnoredIds` (or unified `remapIds`/`gcIds`); all via `runExclusive`; no `fs.writeFile` direct |
| `src/actions/app-state.ts` | Modify | Re-export remap/GC actions (`remapHiddenIdsAction`, `gcHiddenIdsAction`, etc.) guarded by `requireAuthIfEnabled`; or reuse `set*Action` if remap implemented as read-modify via setters |
| `src/lib/container-id.ts` | Create (optional, <30 lines) | If `idsEqual` grows, extract to share between `app-state.ts` and `dashboard-context.tsx` to avoid duplication; otherwise keep in `app-state.ts` and import |

## Interfaces / Contracts

```typescript
// src/lib/app-state.ts — truncation + atomic helpers
export function idsEqual(a: string, b: string): boolean;
// true if a===b || a.startsWith(b) || b.startsWith(a) — covers 12↔64

export async function remapHiddenIds(oldId: string, newId: string): Promise<void>;
// runExclusive: replace oldId (prefix-aware) with canonical newId (64), preserve order, dedup if newId present
export async function gcHiddenIds(liveIds: string[]): Promise<boolean>;
// runExclusive: intersect hiddenContainerIds with liveIds via idsEqual; return true if mutated; no write if clean
// symmetric remapIgnoredIds / gcIgnoredIds

// src/components/dashboard-content.tsx
export async function DashboardContent({ locale }: { locale: Locale }): Promise<JSX.Element>;
// fetches [updateStates, settings, dockerConnected, hiddenIds, ignoredIds, referenceUrls] inside DashboardGate Suspense

// src/contexts/dashboard-context.tsx
interface DashboardProviderProps {
  initialHiddenIds?: string[]; initialIgnoredIds?: string[];
  initialReferenceUrls?: Record<string, ReferenceUrlData>;
  notificationsEnabled?: boolean;
}
```

`runExclusive` contract: `const mutex = stateStore.__appStateMutex; result = mutex.then(op); stateStore.__appStateMutex = result.catch(()=>{})`; propagates error, never poisons chain.

`cacheComponents` placement: `cacheComponents:true` in `next.config.ts`; only `src/app/layout.tsx` has `instant=false` (CSP nonce) — count stays 1. `DashboardContent` reads are uncached file I/O inside Suspense, not `use cache` scopes; inventory/registry caches remain in `docker-inventory.ts`/`registry-updates.ts` under `CACHE_TAGS.registry`.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `idsEqual` 12↔64, remap order+dedup, GC shrink/idempotent/empty | Vitest, fake timers, temp `data/` dir; RED first per `strict_tdd` |
| Unit | `runExclusive` serialization + mutex release on `EACCES` | Concurrent `Promise.all([remap,toggle])` + error injection; assert final file = last complete mutation |
| Integration | `DashboardContent` parallel fetch injects `initial*`; build keeps `page.tsx` static | `pnpm build` assert no extra `instant=false`; grep `getHiddenContainerIdsAction` appears only in toggle paths |
| E2E | First paint no flash; recreate migrates Id without orphan | `next-browser` snapshot — first paint hides; SSE done fires remap then GC, assert `dashboard-state.json` has single `new64` |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary. File writes are `writeFileAtomic` + `runExclusive`; Docker remote via `DOCKER_HOST` untouched.

## Migration / Rollout

No migration. `dashboard-state.json` schema unchanged; stale 12-char entries auto-heal via `idsEqual` + next GC/remap stores 64. Rollback: revert `dashboard-content.tsx` props → flash returns; keep GC (safe). Gate: `HIDDEN_BOOTSTRAP !== 'false'` if needed (no flag shipped). `auto-chain` with 400-line budget → single PR (forecast: ~180 lines) unless review requests split.

## Open Questions

- [ ] Keep `getReferenceUrlsAction` mount sync or also seed-only? Proposal seeds via `initialReferenceUrls`; retain sync only if external reference edits race is observed — default seed-only.
- [ ] Extract `idsEqual` to `src/lib/container-id.ts` vs co-locate in `app-state.ts`? Prefer co-locate unless `dashboard-context.tsx` import creates circular dep.
