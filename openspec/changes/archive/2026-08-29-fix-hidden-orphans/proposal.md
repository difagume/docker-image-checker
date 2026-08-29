# Proposal: fix-hidden-orphans

## Intent

Fix B-02 (681 ms flash — `DashboardProvider` fetches `hiddenContainerIds` client-side via `useEffect`) and B-03 (orphan lists — `hidden`/`ignored` keyed by `container.Id` orphan on recreate `stop→remove→create→start`, unbounded growth).

## Scope

### In Scope
- Delta `hidden-bootstrap` (B-02, approach A — server-inject)
- Delta `orphan-remap` (B-03, approach A — Id migration + GC in `use-container-updates`)
- Strict TDD, 400-line budget, `interactive`/`both`/`auto-chain`

### Out of Scope
- Delta C — re-key to `containerName` (follow-up, needs uniqueness audit)
- Storage migration (`data/dashboard-state.json` unchanged)
- `inventory-cache` / `registry-verdict` logic

## Capabilities

### New Capabilities
- `hidden-bootstrap`: server-injected hidden/ignored bootstrap, no client fetch
- `orphan-remap`: Id migration + orphan GC on recreate

### Modified Capabilities
- `state-persistence`: extend `REQ-02` — `setHiddenContainerIds`/`setIgnoredNotificationContainerIds` handle remap + GC

## Approach

**A for both; C deferred.**

- **B-02 A:** `DashboardContent` fetches `getHiddenContainerIds()` + `getIgnoredNotificationContainerIds()` parallel to `getContainerUpdateStates()`, passes `initialHiddenIds`/`initialIgnoredIds`. Provider seeds `useState` from props, drops `useEffect` load.
- **B-03 A:** On `phase:done` with `newContainerId !== containerId`, replace old Id with new Id in hidden/ignored (preserve order). `gcHiddenIds(liveIds)` on mount/refresh intersects persisted lists with live Ids.
- **C follow-up:** Re-key to `containerName` — deferred, needs migration.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/components/dashboard-content.tsx` | Modified | Fetch hidden/ignored server-side, pass `initial*` |
| `src/contexts/dashboard-context.tsx` | Modified | Seed from props, remove hidden/ignored `useEffect` |
| `src/hooks/use-container-updates.ts` | Modified | Remap + GC on done |
| `src/lib/app-state.ts` | Modified | `remapHiddenIds`/`gcOrphanIds` helpers |
| `src/actions/app-state.ts` | Modified | Expose remap/GC (or reuse setters) |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Breaks static shell | Low | Inject inside existing Suspense, no `instant=false` |
| Recreate race | Med | Remap atomic, GC idempotent |
| C collision | Low | Defer C |
| Timing flake | Med | Fake timers |

## Rollback Plan

1. Revert `dashboard-content.tsx` props → `useEffect` fetch returns (flash only).
2. Revert `use-container-updates.ts` remap — GC safe to keep.
3. No migration — `dashboard-state.json` stays valid.
4. Gate: `HIDDEN_BOOTSTRAP !== 'false'`.

## Dependencies

- `state-persistence` atomic helper
- `static-shell-prerender` (opt-outs = 1)
- `inventory-cache` live Ids

## Success Criteria

- [ ] First paint correct hidden state — no flash
- [ ] Recreate migrates Id — no duplicate/orphan
- [ ] GC shrinks list after removal
- [ ] `rg "getHiddenContainerIdsAction" src/contexts/dashboard-context.tsx` → toggle-only
- [ ] Vitest green, `pnpm build` ok
