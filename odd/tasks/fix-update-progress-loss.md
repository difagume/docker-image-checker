# Fix: visual loss of container update progress

## Objective

Ensure an in-flight update never looks "cancelled" in the UI when a second
update is triggered or the page is reloaded, as long as the task still lives
on the server.

## Problem / Why

User report: pressed "Update" on a container and, without it finishing,
pressed "Update" again; the previous update appeared to cancel.

Diagnosis (verified by reading the code, before any change):

- The server never cancels: `runContainerUpdateTask`
  (`src/lib/container-update-task.ts:330`) is fire-and-forget and only blocks
  the **same** container via `isContainerUpdating`.
- The bug was client-side: `updatingContainerId` was a **scalar**
  (`src/hooks/use-container-updates.ts:51`) and
  `setUpdatingContainerId(containerId)` (line 194) overwrote the previous id.
  `container-card.tsx:171-197` only shows spinner/progress while `isUpdating`
  is true, so the first card fell back to the normal button → it looked
  cancelled.
- Second symptom: pressing that card again made the server throw
  `ContainerUpdateInProgressError`, and the client `catch`
  (`use-container-updates.ts:206-219`) **deleted** `updatePhases[id]` and
  cleared the spinner → the progress disappeared entirely.
- Underlying gap: no reconnection to active tasks; on reload the cleanup
  `useEffect` closed every `EventSource` (`use-container-updates.ts:222-233`)
  and nothing re-attached the `taskId`.

## Scope (approved by the user: "Full fix")

IN:

1. Per-container "updating" state (no global scalar).
2. Do not destroy progress state when the error is
   `ContainerUpdateInProgressError` (expected error, not a failure).
3. Reconnection to active tasks on mount: read-only endpoint listing
   non-terminal tasks in `progressStore` + `EventSource` re-attachment in the
   hook.

OUT:

- Changes to the update pipeline (`container-update-task.ts`).
- Real cancellation of server tasks.
- Changes to notifications/Telegram.

## Constraints

- Technical artifacts in English (code, comments, UI copy, tests).
- Do not break the existing `triggerContainerUpdate` → SSE → `done` flow.
- `src/actions/docker.test.ts` and `src/lib/container-update-task.test.ts`
  must keep passing.
- Authentication: the new endpoint must use `unauthorizedResponseIfEnabled`,
  same as `src/app/api/update-progress/route.ts`.

## Checklist

- [x] T1 — Replace `updatingContainerId: string | null` with per-container
      state (map/set) or derive it from `updatePhases`; propagate the change
      to `container-dashboard.tsx` and `container-card.tsx`.
      Route: delegated (writer trigger: 3+ non-trivial files).
- [x] T2 — In the `catch` of `handleUpdateClick`, distinguish
      `ContainerUpdateInProgressError` (keep phases/spinner) from genuine
      failures (previous behavior). Includes surfacing that error type to the
      client (the server action already throws it).
- [x] T3 — GET endpoint for active tasks + mount-time reconnection in the
      hook (re-attach the `EventSource` for every non-terminal task of the
      container).
- [x] T4 — Verification (2026-09-23). Exact commands and results:
      - `bun run test` → 25 test files, 196 tests: **195 passed, 1 failed**.
        The single failure is `src/lib/format-relative-time.test.ts`
        ("49h => días"), a pre-existing wall-clock-dependent test in files
        untouched by this change (byte-identical to `HEAD`; it passes under
        `TZ=UTC` and fails under local UTC-5 after 20:00, because
        `format-relative-time.ts` mixes the UTC calendar date of the sample
        with the local calendar date of "now"). All 14 tests added by this
        change pass (`update-progress-client` 12, `update-progress-store`
        +1, `update-in-progress` +1); baseline was 24 files / 182 tests.
      - `bunx tsc --noEmit` → exit 0.
      - `bunx biome check <each touched file>` → `Checked 8 files in …ms.
        No fixes applied.` — 0 diagnostics on every file touched by this
        change and its review fixes.
      - Repo-wide `bunx biome check .` → 1075 pre-existing errors identical
        to HEAD (1067 in `diagrams/`, 8 in `src/`), verified with
        `git stash`; 0 attributable to this change. Tracked as separate
        `chore` debt.
- [x] Review-finding fixes (2026-09-23) — 16 of 18 review findings fixed;
      R1-004 and R1-005 accepted (see "Accepted review findings"). Extracted
      the hook's pure decision logic into `src/lib/update-progress-client.ts`
      (+ tests): failed-trigger outcome table (`attach` /
      `surface-no-task` / `surface-failure`), update-context resolution with
      an explicit `hasContext: false` fallback for missing containers, and
      the active-task lookup with an injected `fetch` and a 1.5 s
      `AbortController` timeout; a single `isTerminalUpdatePhase` predicate
      shared by the store, the card, and the hook; latest-ref handlers now
      refreshed in an effect instead of during render; `T1`/`T2`/`T3`
      markers removed from source comments; key-scoped store assertions; the
      in-progress message match changed from substring to exact; bounded
      reconnection (max 3 lookup attempts, 2 s/4 s/8 s backoff) with a
      cancellation flag, pending-timer cleanup, and no `EventSource` opened
      after unmount; stale-stream events ignored via a `taskId` guard;
      `console.warn` on every active-task lookup failure branch; and the
      stale-phase path now shows a calm `toast.info`
      ("No update is running for this container right now.") instead of
      returning silently.
- [x] T5 — Fix the wall-clock-dependent format-relative-time test
      (2026-09-24): `format-relative-time.ts` derived the sample's
      calendar date in UTC (`toISOString`) while `now` came from the local
      zone, so a 49h age collapsed to "hace 1 día" in negative-offset zones
      (e.g. America/Guayaquil, UTC-5) after 20:00 while daytime showed the
      correct "hace 2 días". Both sides now use the local frame; the suite
      was verified under `TZ=UTC`, `America/Guayaquil` and `Asia/Tokyo`.
      Tracked per review finding R4-001.

## Acceptance criteria

- Two updates on different containers: both cards show their own progress
  until `done`.
- Second click on a container already updating: does not wipe the visible
  progress; no generic error toast for this case.
- Page reload with tasks in flight: progress resumes (or finishes as `done`)
  without user intervention.

## Checks / TDD

- TDD: off (no evidence of strict_tdd for this project in the session; the
  existing tests are the safety net).
- Runner: `bun run test` (vitest) — timezone-independent since T5 was
  fixed (2026-09-24); `TZ=UTC` is no longer required. Historical note:
  before T5 the suite had to run under `TZ=UTC` because of the
  wall-clock-dependent `src/lib/format-relative-time.test.ts` (see T4).
  Lint/format: `bunx biome check .`.

## Delivery strategy

- Originally recorded as `delivery_strategy: ask-on-risk` (forecast
  ~250-350 authorized lines, below the 400 threshold).
- Real authored changed-line count for slices 1–4: **1213 changed
  lines across 14 files (1091 insertions, 122 deletions)** — measured as
  `git diff --shortstat master` (737 insertions, 122 deletions over 12
  tracked files: feature commit plus review fixes) plus the two new files
  `src/lib/update-progress-client.ts` (145 lines) and
  `src/lib/update-progress-client.test.ts` (209 lines).
- The real count exceeds the ask-on-risk forecast, so the strategy was
  updated: `delivery_strategy: ask-on-risk` →
  `chain_strategy: stacked-to-main`. ACTUAL delivery — 5 stacked slices:
  1. **`pr/1-foundation`** — `7ca9330` — store + error marker +
     active-tasks endpoint (243 lines).
  2. **`pr/2-client-helpers`** — `8bac0b2` — pure client helpers + tests
     (354 lines).
  3. **`pr/3-hook-ui`** — `560715c` — hook rewrite + components (434
     lines).
  4. **`pr/4-docs`** — `01b9713` — this record (182 lines).
  5. **`pr/5-review-fixes`** — `2dd23c9` — advisory-finding fixes A–D.
- Additional debt (advisory R3-001, open): no automated non-UTC test run
  pins the timezone-independent relative-time behaviour; under fixed-UTC
  the suite stays green even if frame-mixing regresses. Track a TZ-matrix
  script or CI entry as a separate `chore`.

## Review record

Slices 1–4 each passed native RDD review inline with burned authority:

- Slice 1 (`7ca9330`): 4 lenses, 11 SUGGESTION.
- Slice 2 (`8bac0b2`): 4 lenses, 1 WARNING + 10 SUGGESTION.
- Slice 3 (`560715c`): 1 lens, 1 WARNING + 3 SUGGESTION.
- Slice 4 (`01b9713`): 4 lenses, 3 WARNING + 7 SUGGESTION.

Zero blocking findings, no corrections required. The 4 WARNINGs (review
ids A–D — lookup-failure vs confirmed-no-task, hard-coded toast strings,
stale delivery-strategy record, and the TZ=UTC test flake) are what the
`pr/5-review-fixes` changeset fixes.

### Post-delivery fix (T5)

- `61a3c0c` — timezone-independent calendar frame in relative time
  (branch `fix/relative-time-calendar-frame`, base `b9ea6b4`).
  Reviewed inline per session rule (no review-* sub-agents): lineage
  `review-2a87d3b6e47595b5`, 4 lenses admitted, approved, authority
  burned (2026-09-24). Advisory findings, all informational: R1-001
  (SUGGESTION, `~19:00` threshold — corrected to 20:00), R2-001
  (WARNING, `(T5)` marker in the source comment — removed) and
  R4-001 (SUGGESTION, PlainDate branch contract — documented) resolved
  in this follow-up commit; R3-001 (WARNING, no automated non-UTC
  test/CI matrix) recorded as open debt under Delivery strategy.

## Accepted review findings

- **R1-004** — The new `GET /api/update-progress/active` endpoint only
  exposes the containerId → taskId enumeration when `AUTH_HTPASSWD` is
  unset: the same posture as the existing SSE route
  (`src/app/api/update-progress/route.ts`). Fixing it properly requires
  per-session task scoping, which is out of scope for this change.
- **R1-005** — The `**/.kilo/worktrees/**` vitest exclusion in
  `vitest.config.ts` is a deliberate stale-worktree flake fix (a stale
  nested checkout ran the same tests against the same
  `data/dashboard-state.json` and produced 2 intermittent failures unrelated
  to this change). Kept as-is.

## Progress

- [x] Diagnosis completed (code reading, 2026-09-23).
- [x] T1 completed: `updatingContainerId` removed; every card derives
      `isUpdating` from a non-terminal phase in `updatePhases[id]`
      (`container-dashboard.tsx`, `container-card.tsx`).
- [x] T2 completed: `ContainerUpdateInProgressError` tagged with a `digest`
      and classified in layers (digest → name → message → corroboration
      against the active-task endpoint); in that case phases are kept and no
      error toast is shown.
- [x] T3 completed: `progressStore.listActive()`,
      `GET /api/update-progress/active` (with `unauthorizedResponseIfEnabled`)
      and mount-time reconnection in the hook (one `EventSource` per
      container).
- [x] `vitest.config.ts`: excludes `.kilo/worktrees/**`; a stale copy of the
      repo ran the same tests against the same `data/dashboard-state.json`
      and produced 2 intermittent failures unrelated to the change.
- [x] T4 completed: results recorded in the checklist above.
- [x] Review-finding fixes completed (2026-09-23): 16 findings fixed,
      2 accepted (R1-004, R1-005).
- [x] Advisory-finding fixes A–D completed (2026-09-23), pending RDD
      review of this changeset.
- [x] T5 completed (2026-09-24): calendar frame unified (local on both
      sides of the comparison); suite green under `TZ=UTC`,
      `America/Guayaquil` and `Asia/Tokyo`.

Next step: create the 5 stacked PRs (PR1 → master, PR2 → PR1, PR3 →
PR2, PR4 → PR3, PR5 → PR4), pending (a) a size decision for PR3 (434
lines > the 400-line review budget) and (b) explicit remote
authorization. The biome-debt `chore` (1067 in `diagrams/`, 8 in
`src/`) is still NOT filed yet.
