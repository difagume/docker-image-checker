# Proposal: fix-notify-race

## Intent

Fix **B-07 (issue #19)**, confirmed live in the tenth verification pass (WSL2 + toxiproxy): overlapping scheduler rounds duplicate notifications. Round A ran 64 s and only wrote `notifiedUpdates` at the END; round B started with a stale (empty) state snapshot and re-sent all 24 notifications. Root cause: `notification-service` reads the state once at round start (`runCheck`), and `markAsNotified` results only persist per-round — dedup compares against a snapshot that concurrent rounds cannot see.

## Scope

### In Scope
- Re-read `notifiedUpdates` (under `runExclusive`) immediately before each provider send; skip sends already marked since the round started.
- Concurrency unit test: two `runCheck` passes overlapping with a slow provider assert no duplicate sends for the same digest.

### Out of Scope
- A scheduler-level mutex preventing round overlap (defense-in-depth, deferred).
- Provider timeouts/abort (B-08, separate).

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `notification-dedup` (if exists in openspec/specs; else `state-persistence` + notifications spec): dedup check MUST consult fresh state at send time, not only the round-start snapshot.

## Approach

In `src/lib/notifications/notification-service.ts`, before sending each notification (per container update), call a new `alreadyNotifiedFresh(update)` (wraps `loadState()` inside `runExclusive`) and skip if the digest was marked by a concurrent round. Keep the in-memory snapshot for logging/planning; the fresh read is the send gate.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/lib/notifications/notification-service.ts` | Modified | fresh dedup gate before each send |
| `src/lib/app-state.ts` | Modified | add `alreadyNotifiedFresh()` under `runExclusive` |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Extra file reads per notification | Low | one small JSON read per candidate send, already serialized |
| Skips legitimate resend after state rollback | Low | dedup keys are digest-scoped; rollback is out of product scope |

## Rollback Plan

Revert the commit; no schema changes.

## Success Criteria

- [ ] Concurrency test: overlapping rounds with slow provider produce zero duplicate sends for the same digest.
- [ ] Existing dedup behavior (NOTIF-11) unchanged; suite green.
