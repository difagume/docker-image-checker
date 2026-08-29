# Delta for state-persistence

## MODIFIED Requirements

### Requirement: REQ-02 — Aplicación a los stores legítimos + remap y GC

`saveState` (`src/lib/app-state.ts`) MUST use `writeFileAtomic` for `data/dashboard-state.json` and `saveReferenceUrls` MUST use it for `data/reference-urls.json`; direct `fs.writeFile` on those paths MUST disappear. Additionally, `setHiddenContainerIds` / `setIgnoredNotificationContainerIds` MUST support atomic Id migration (`remapHiddenIds(oldId→newId)`) and orphan GC (`gcHiddenIds(liveIds)` intersecting with live `container.Id`s, prefix-aware 12 vs 64). All mutations MUST run inside `runExclusive` so concurrent load→mutate→save cycles serialise; `writeFileAtomic` serialises writes but NOT the read-modify-write cycle.

(Previously: only atomic save via writeFileAtomic; no remap or GC behaviour specified)

#### Scenario: ESC-04 — Guardado del dashboard-state

- GIVEN scheduler marks an update as notified (`markAsNotified` → `saveState`)
- WHEN it saves via helper
- THEN `data/dashboard-state.json` updates atomically
- AND concurrent readers see a complete old or new version

#### Scenario: ESC-05 — Guardado de reference-urls

- GIVEN dashboard registers a reference URL (`saveReferenceUrl` → `saveReferenceUrls`)
- WHEN it saves via helper
- THEN `data/reference-urls.json` updates atomically without losing entries

#### Scenario: ESC-04b — Remap atómico preserva orden y deduplica

- GIVEN `hiddenContainerIds=["a","old-64","c"]` y `phase:done {old-64→new-64}`
- WHEN `remapHiddenIds` runs inside `runExclusive`
- THEN list becomes `["a","new-64","c"]`
- AND if `new-64` already present result deduplicates to single `new-64`

#### Scenario: ESC-05b — GC contra Ids vivos

- GIVEN `hidden=["live-64","orphan-64"]` with live ids `["live-64"]`
- WHEN `gcHiddenIds(liveIds)` runs
- THEN persisted `hiddenContainerIds` shrinks to `["live-64"]`
- AND GC is idempotent on re-run with same live set

#### Scenario: ESC-05c — Truncation 12 vs 64

- GIVEN stored id is 12-char prefix and live id is 64-char
- WHEN comparing for `isHidden` or GC
- THEN they match when one is prefix of the other
- AND remap stores canonical 64-char `newContainerId`

## ADDED Requirements

### Requirement: REQ-06 — runExclusive como contrato de atomicidad para hidden/ignored

Every mutation of `hiddenContainerIds` / `ignoredNotificationIds` (toggle, remap, GC) MUST execute via `runExclusive` so the full `loadState → mutate → saveState` cycle is serialised. `writeFileAtomic` alone MUST NOT be considered sufficient. Failures MUST propagate and mutex MUST release.

#### Scenario: ESC-09 — Serialización de mutaciones concurrentes

- GIVEN two concurrent toggles on `hiddenContainerIds`
- WHEN both invoke the store
- THEN `runExclusive` serialises them and final file reflects the last complete mutation

#### Scenario: ESC-10 — Mutex no envenenado tras fallo

- GIVEN a GC write fails with `EACCES`
- WHEN error propagates
- THEN mutex is released and next mutation can proceed
- AND no partial file is presented as valid state
