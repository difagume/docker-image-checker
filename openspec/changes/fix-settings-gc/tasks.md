# Tasks: fix-settings-gc

- [x] 1.1 RED: `use-settings-sync.test.ts` — source contract: first-run guard (`hydrated` ref) before any `setDashboardSettingsAction`; effect returns early on first run.
- [x] 1.2 GREEN: add `useRef` guard in `src/hooks/use-settings-sync.ts`.
- [x] 2.1 RED: extend `use-container-updates.test.ts` — GC actions invoked WITHOUT client-supplied liveIds.
- [x] 2.2 GREEN: hook calls `gcHiddenIdsAction()`/`gcIgnoredIdsAction()` no-arg; remove client `liveIds` memo.
- [x] 2.3 GREEN: `collectLiveContainerIds()` in `src/lib/app-state.ts` (wraps `listContainersRaw`); actions derive ids server-side.
- [x] 3.1 Full suite green.
- [x] 3.2 Live verify: mtime stable on load (INV-05→pass); live id survives stale-cache load (B-16); INV-04 still passes.
