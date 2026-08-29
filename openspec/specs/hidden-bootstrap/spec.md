# hidden-bootstrap Specification

## Purpose

Server-injected hidden/ignored bootstrap eliminates the 681 ms client-side flash. No new storage; no `instant=false`.

## Requirements

### Requirement: HB-01 — Server-injected initial state

`DashboardContent` MUST fetch `getHiddenContainerIds()`, `getIgnoredNotificationContainerIds()`, and `getReferenceUrls()` server-side in parallel with `getContainerUpdateStates()` and pass them as `initialHiddenIds` / `initialIgnoredIds` / `initialReferenceUrls` to `DashboardProvider`. Fetches MUST be inside the existing `DashboardGate` Suspense subtree so `src/app/page.tsx` stays static.

#### Scenario: HB-01a — Parallel server fetch

- GIVEN authenticated render of `/`
- WHEN `DashboardContent` renders
- THEN it fetches hidden, ignored, and reference URLs in parallel with update states
- AND passes all three as `initial*` props to `DashboardProvider`

#### Scenario: HB-01b — Static shell preserved

- GIVEN `cacheComponents: true`
- WHEN `pnpm build` runs
- THEN `src/app/page.tsx` has zero `instant=false` and prerenders as static shell
- AND hidden bootstrap adds no opt-out

### Requirement: HB-02 — Provider seeded state, no hidden fetch

`DashboardProvider` MUST seed `hiddenContainerIds` / `ignoredNotificationIds` / `referenceUrls` from `initial*` props via `useState(initial*)`. It MUST NOT fetch hidden/ignored via `useEffect` when `initial*` is provided. Reference URLs MAY still sync via existing action if needed but MUST NOT overwrite seeded hidden state.

#### Scenario: HB-02a — Seeded no-fetch

- GIVEN `DashboardProvider` receives `initialHiddenIds=["abc"]`
- WHEN it mounts
- THEN `hiddenContainerIds` equals `["abc"]` on first render without client fetch
- AND no `getHiddenContainerIdsAction` call is issued on mount

#### Scenario: HB-02b — Toggle-only contract

- GIVEN seeded provider
- WHEN grepping `src/contexts/dashboard-context.tsx`
- THEN `getHiddenContainerIdsAction` / `getIgnoredNotificationContainerIdsAction` appear only in toggle paths, not in mount `useEffect`

### Requirement: HB-03 — Zero flash first paint

First paint MUST render correct hidden/visible filtering and ignored badges without intermediate unhidden flash or second-pass correction. The 681 ms `useEffect` flash MUST be eliminated.

#### Scenario: HB-03a — Correct first paint

- GIVEN persisted `hiddenContainerIds=["id-1"]`
- WHEN `/` renders
- THEN first paint hides `id-1` and shows remaining containers
- AND no frame renders `id-1` as visible before hiding

#### Scenario: HB-03b — Empty initial

- GIVEN no persisted hidden/ignored ids
- WHEN `/` renders with `initialHiddenIds=[]`
- THEN first paint shows all containers and provider state is `[]`
