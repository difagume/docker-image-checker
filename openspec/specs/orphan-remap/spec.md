# orphan-remap Specification

## Purpose

Id migration and orphan GC for `hiddenContainerIds` / `ignoredNotificationIds` keyed by `container.Id` (64-char). Recreate (`stop→remove→create→start`) orphans old Ids; GC bounds growth.

## Requirements

### Requirement: OR-01 — Id migration on recreate

On `phase:done` where `newContainerId` exists and `newContainerId !== containerId`, the system MUST atomically replace `containerId` with `newContainerId` in both lists, preserving order. If `newContainerId` already present, the old entry MUST be removed (deduplicate, no duplicate). No-op when ids equal or absent.

#### Scenario: OR-01a — Hidden remap preserves order, deduplicates

- GIVEN `hidden=["a","old-64","c"]` and `phase:done {containerId:"old-64", newContainerId:"new-64"}`
- WHEN handler runs
- THEN `hidden` becomes `["a","new-64","c"]`
- AND ignored list is updated identically if it contained `old-64`

#### Scenario: OR-01b — Already contains new Id

- GIVEN `hidden=["old-64","new-64"]` and remap `old-64→new-64`
- WHEN handler runs
- THEN result is `["new-64"]` with no duplicate

#### Scenario: OR-01c — Truncation (12 vs 64)

- GIVEN stored id is 12-char prefix `abc123def456` and live id is `abc123def456...64`
- WHEN comparing or remapping
- THEN ids match if one is prefix of the other (12 prefix equals 64)
- AND migration stores the canonical 64-char `newContainerId`

### Requirement: OR-02 — Orphan GC against live Ids

The system MUST expose `gcHiddenIds(liveIds)` / `gcIgnoredIds(liveIds)` (or unified helper) that intersects persisted lists with the current live `container.Id` set. GC MUST run on mount and on refresh completion and MUST be idempotent. GC MUST use prefix-aware matching (12 vs 64).

#### Scenario: OR-02a — Shrinks after removal

- GIVEN `hidden=["live-64","orphan-64"]` and live ids `["live-64"]`
- WHEN GC runs
- THEN `hidden` becomes `["live-64"]`
- AND orphan is removed from ignored as well

#### Scenario: OR-02b — Idempotent

- GIVEN GC already ran with same live set
- WHEN GC runs again
- THEN lists remain unchanged and no extra write occurs if already clean

#### Scenario: OR-02c — Empty live set

- GIVEN all containers removed, live ids `[]`
- WHEN GC runs
- THEN both lists become `[]`

### Requirement: OR-03 — Atomicity via runExclusive

Remap and GC MUST execute inside `runExclusive` (load→mutate→`saveState` via `writeFileAtomic`) so concurrent scheduler or dashboard writes cannot interleave. Writes MUST serialize; last writer wins without interleaved corruption.

#### Scenario: OR-03a — Concurrent remap and toggle serialised

- GIVEN concurrent `toggleHide(newId)` and `remap(old→new)`
- WHEN both call the store
- THEN `runExclusive` serialises them and final list contains `new` exactly once

#### Scenario: OR-03b — GC races scheduler

- GIVEN scheduler `markAsNotified` runs concurrently with GC
- WHEN both commit
- THEN no notified update is lost and GC result is consistent
