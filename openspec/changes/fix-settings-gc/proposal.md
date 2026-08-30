# Proposal: fix-settings-gc

## Intent

Fix two state-persistence defects confirmed live during the eighth product-description verification pass (2026-08-29):

- **B-14 (#26):** `useSettingsSync` has no first-run guard; every dashboard hydration rewrites `dashboard-state.json` (mtime churn, log noise) even with zero user interaction. Live repro: INV-05 fail.
- **B-16 (#28):** the hidden/ignored GC (`gcHiddenIdsAction`/`gcIgnoredIdsAction`) trusts a client-supplied `liveIds` list derived from the cached inventory. Within the `cacheComponents` stale window the list misses recently created containers, so GC silently purges valid preferences of LIVE containers. Live repro: pd-major's hidden id purged against a stale 1-container cache.

## Scope

### In Scope
- First-run guard in `src/hooks/use-settings-sync.ts` (skip the hydration-triggered sync).
- GC actions derive liveness server-side from the Docker daemon (`listContainersRaw`) instead of trusting the client list; hook calls them with no arguments.
- Unit tests (source-contract style, matching existing patterns) for both.

### Out of Scope
- B-07/B-09 (NOTIF-09, GHCR token surfacing) — separate change.
- Notification scheduler paths (untouched).

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `state-persistence`: dashboard settings sync MUST NOT persist during the hydration pass; orphan GC MUST validate liveness against the daemon, never against a client/cache-derived list.

## Approach

1. `useRef` guard in `useSettingsSync`: first effect run (hydration) returns early; subsequent dep changes persist as before (INV-04 behavior preserved).
2. New `collectLiveContainerIds()` in `src/lib/app-state.ts` wrapping `listContainersRaw()`; `gcHiddenIdsAction()`/`gcIgnoredIdsAction()` become no-arg, compute daemon-fresh ids, and fail safe (daemon down ⇒ throw ⇒ hook's `.catch` skips GC, nothing pruned).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/hooks/use-settings-sync.ts` | Modified | first-run guard (B-14) |
| `src/hooks/use-container-updates.ts` | Modified | call GC actions without client liveIds |
| `src/actions/app-state.ts` | Modified | GC actions compute liveIds server-side (B-16) |
| `src/lib/app-state.ts` | Modified | add `collectLiveContainerIds()` |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| GC never runs if daemon down | Low | acceptable: fail-safe (no pruning) is the desired direction |
| Extra `docker ps` per page load | Low | single local-daemon call, ~ms |
| Skipping first sync hides real drift | Low | values come from server props reading the same file |

## Rollback Plan

Revert the single commit; no storage format changes (`dashboard-state.json` schema untouched).

## Dependencies

- None new (`listContainersRaw` already exists in `src/lib/docker-inventory.ts`).

## Success Criteria

- [ ] Fresh dashboard load with zero interaction does NOT rewrite `dashboard-state.json` (mtime stable) — INV-05 re-verified pass.
- [ ] Hidden/ignored id of a live container survives a page load served from a stale inventory cache — B-16 scenario.
- [ ] INV-04 (chip persistence) still passes; full suite green.
