# Tasks: Fix Provider & Registry Robustness

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 320–430 |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single change commit on master (precedent: fix-verdict-cache, fix-hidden-orphans, fix-notify-race) |
| Delivery strategy | auto-chain |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Send deadline + Discord parity | Same commit | `bun run test src/lib/notifications` | hung local http server in test | revert send-deadline.ts + service/provider edits |
| 2 | Transient verdict + status swap | Same commit | `bun run test src/lib/registry-updates.test.ts` | N/A — pure functions | revert registry-updates/types/component edits |
| 3 | Refresh i18n + dict cleanup | Same commit | `bun run test` + `bun run build` | N/A — static strings | revert dictionary/component edits |

TDD: RED → GREEN per deliverable; runner `bun run test` (vitest); Biome tabs/single quotes/no semicolons.

## Phase 1: Send Deadline Foundation (B-08)

- [x] 1.1 RED: create `src/lib/notifications/send-deadline.test.ts` — `withDeadline` resolves under deadline, rejects at it (fake timers), timer cleared on settle.
- [x] 1.2 GREEN: create `src/lib/notifications/send-deadline.ts` — `withDeadline<T>(promise, ms, label)` via `Promise.race` + `setTimeout` rejection.
- [x] 1.3 RED: in `notification-service.test.ts` — hung endpoint (local `http.createServer` accepts TCP, never responds): send fails within deadline, round completes, remaining providers still sent, dedup entry stays marked (ND-01/NOTIF-07).
- [x] 1.4 GREEN: `notification-service.ts` (~L179) — wrap sends in `withDeadline(p.send(message), timeout, p.name)`; `NOTIFICATIONS_SEND_TIMEOUT_MS` env (default 8000).
- [x] 1.5 GREEN: `providers/ntfy.ts` + `providers/discord.ts` — `AbortSignal.timeout(ms)` on `fetch`; Telegram covered by boundary wrap only.
- [x] 1.6 RED+GREEN: `providers/discord.ts:30` — `validate()` returns `false` when disabled (parity with Telegram/ntfy).

## Phase 2: Transient Registry Verdict (B-04)

- [x] 2.1 RED: create `src/lib/registry-updates.test.ts` — `classifyRegistryError`: "Timeout after" → true; `TypeError` → true; 429 → true; 404-shaped result → false.
- [x] 2.2 GREEN: `registry-updates.ts` — export `classifyRegistryError(error): boolean`; add `transient?: boolean` to `CheckImageUpdateResult`.
- [x] 2.3 GREEN: set `transient: classifyRegistryError(error)` in Hub catch (~L218) and GHCR catch (~L361); classify GHCR 429 before `invalid_token` fallback; 404 paths untouched.
- [x] 2.4 RED+GREEN: transient verdict flows through `'use cache'` scopes with same TTL/tags as other results.

## Phase 3: Status Mapping, UI, i18n (B-04 UI, B-12, B-15b)

- [x] 3.1 RED: property test — mapper over input combinations never emits `checking`; transient verdict → `'transient'`.
- [x] 3.2 GREEN: mapper branch `result.transient ? 'transient' : 'unknown'`; `src/types/app-state.ts` FilterStatus: `'checking'` → `'transient'`.
- [x] 3.3 GREEN: `container-card.tsx` — delete `StatusChecking`/`case 'checking'`, add amber `StatusTransient`; `container-dashboard.tsx` L91/L107 → `transient` in degraded detection; confirm `stats-summary.tsx` handling (display-only).
- [x] 3.4 RED+GREEN: `dictionaries.test.ts` — `container.transient` present, `container.checking` absent; `dashboard.refreshAriaLabel`/`refreshing`/`upToDate` present in en/es/pt-BR.
- [x] 3.5 GREEN: add dict keys; `refresh-button.tsx` L25/L31 strings replaced by `dict.dashboard.*` props from `dashboard-gate.tsx` (type-level fallback via `typeof en.json`).

## Phase 4: Verification, Cleanup, Docs

- [x] 4.1 Run `bun run test`, `bunx biome check .`, `bun run build` — all green; type check confirms no `checking` consumer missed. (vitest 143/143 in 21 files; tsc --noEmit exit 0; biome clean on changed code, 8 errors/5 warnings all pre-existing in untouched files; `bun run build` fails PRE-EXISTING on clean baseline — turbopack dynamic fs.readFile — type gate satisfied via tsc)
- [x] 4.2 Grep sweep: no `checking` status key/branch/type reference in src or dictionaries. (only comments and negative-assertion tests remain)
- [x] 4.3 Update bug-triage.md (product-description repo): B-08 (#20), B-04 (#16), B-12 (#24), B-15 partial → fixed, referencing this change. (B-15 items already noted in its existing status line)
- [x] 4.4 Commit single change on master; verify independent revertability (no persisted-state format touched).
