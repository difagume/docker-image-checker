# Tasks: fix-hidden-orphans

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~180 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | single PR |
| Delivery strategy | auto-chain |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Fix B-02 flash + B-03 orphan growth (server-inject + remap/GC under runExclusive) | PR 1 (single) | `bun run test -- src/lib/app-state.test.ts` | `pnpm build && rg "getHiddenContainerIdsAction" src/contexts` / first-paint manual check | Revert `dashboard-content.tsx` props, `dashboard-context.tsx` useEffect, `use-container-updates.ts` remap/GC, `app-state.ts` helpers — no migration, `dashboard-state.json` stays valid |

## Phase 1: Foundation — idsEqual + runExclusive contract

- [ ] 1.1 RED: Add `src/lib/app-state.test.ts` (or `src/lib/container-id.test.ts` if extracted) failing tests for `idsEqual(a,b)` — 64===64, 64 vs 12 prefix, 12 vs 64, no-match, empty strings
- [ ] 1.2 GREEN: Implement `idsEqual(a,b)` in `src/lib/app-state.ts` as `a===b || a.startsWith(b) || b.startsWith(a)`; export for `dashboard-context.tsx` and GC; optionally extract to `src/lib/container-id.ts` (<30 lines) if circular import risk
- [ ] 1.3 RED: Add failing tests for `runExclusive` — concurrent `Promise.all([toggle, remap])` serialises (last wins, no interleave) + `EACCES` failure releases mutex (next op succeeds)
- [ ] 1.4 GREEN: Verify/keep `runExclusive` in `src/lib/app-state.ts` (`mutex.then(op)`, chain `catch(()=>{})`) and `writeFileAtomic` in `src/lib/fs-atomic.ts` as second layer; no new mutex needed

## Phase 2: Orphan helpers — remap + GC (strict TDD)

- [ ] 2.1 RED: Failing tests for `remapHiddenIds(old,new)` — preserves order `["a","old","c"]→["a","new","c"]`, deduplicates `["old","new"]→["new"]`, no-op when absent/equal, 12-char old matches 64-char live and stores canonical 64-char newId
- [ ] 2.2 GREEN: Implement `remapHiddenIds` + `remapIgnoredIds` in `src/lib/app-state.ts` via `runExclusive{ loadState→find via idsEqual→splice canonical newId→saveState iff changed }`
- [ ] 2.3 RED: Failing tests for `gcHiddenIds(liveIds)`/`gcIgnoredIds` — shrinks `["live","orphan"]` with `live=["live"]` to `["live"]`, idempotent no-write-if-clean, empty live `[]` → `[]`, prefix-aware 12 vs 64
- [ ] 2.4 GREEN: Implement `gcHiddenIds`/`gcIgnoredIds` in `src/lib/app-state.ts` via `runExclusive{ load→filter via idsEqual against liveIds→saveState iff mutated, return boolean }`

## Phase 3: Hidden bootstrap — server-inject + provider seeding

- [ ] 3.1 RED: Failing test for `src/components/dashboard-content.tsx` — asserts `Promise.all` parallel fetch of `getHiddenContainerIds` + `getIgnoredNotificationContainerIds` + `getReferenceUrls` alongside `getContainerUpdateStates` inside `DashboardGate` Suspense, passing `initialHiddenIds`/`initialIgnoredIds`/`initialReferenceUrls` to `DashboardProvider`
- [ ] 3.2 GREEN: Modify `src/components/dashboard-content.tsx` — add parallel fetch and prop injection; keep `src/app/page.tsx` with zero `instant=false`
- [ ] 3.3 RED: Failing test for `src/contexts/dashboard-context.tsx` — mount with `initialHiddenIds=["abc"]` asserts first-render state `["abc"]` with zero `getHiddenContainerIdsAction` calls on mount
- [ ] 3.4 GREEN: Modify `src/contexts/dashboard-context.tsx` — seed `useState(initial*)`, delete `useEffect` mount fetch for hidden/ignored, keep `toggleHideContainer`/`toggleIgnoreNotification` via `set*Action`; make `isHidden`/`isIgnored` use `idsEqual`; seed `referenceUrls` from `initialReferenceUrls`

## Phase 4: Wiring — hook remap/GC + actions

- [ ] 4.1 RED: Failing test for `src/hooks/use-container-updates.ts` — SSE `phase:done {containerId:old, result:{newContainerId:new}}` with `new!==old` triggers `remapHiddenIds(old,new)` and `remapIgnoredIds`
- [ ] 4.2 GREEN: Modify `src/hooks/use-container-updates.ts` — on `phase:done` call remap helpers after optimistic `setContainers` Id swap; guard `newContainerId !== containerId`
- [ ] 4.3 RED: Failing test for GC trigger — derived `liveIds=processedContainers.map(c=>c.container.Id)` causes `gcHiddenIds(liveIds)` on mount and on `processedContainers` change (refresh)
- [ ] 4.4 GREEN: Wire `gcHiddenIds`/`gcIgnoredIds` in same hook on mount + effect watching `processedContainers`; expose `liveIds` from hook if needed
- [ ] 4.5 GREEN: Expose `remapHiddenIdsAction`/`gcHiddenIdsAction` (and ignored variants) in `src/actions/app-state.ts` guarded by `requireAuthIfEnabled`, or document reuse of `set*Action` if remap implemented via setters

## Phase 5: Verification — build and guards

- [ ] 5.1 Verify `pnpm build` static shell stays 1 opt-out (`src/app/layout.tsx` only); `rg "instant=false" src/app/page.tsx` zero hits; `rg "getHiddenContainerIdsAction" src/contexts/dashboard-context.tsx` toggle-only
- [ ] 5.2 Verify `bun run test` green, no `fs.writeFile` direct on `data/dashboard-state.json` (only `writeFileAtomic` via `runExclusive`), fake timers stable, `dashboard-state.json` idempotent on rerun
