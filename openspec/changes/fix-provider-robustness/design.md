# Design: Fix Provider & Registry Robustness

## Technical Approach

Bounded, fail-continuing provider dispatch in `checkAndNotify`; error-classified `transient` verdict threaded through `CheckImageUpdateResult` → `ContainerUpdateState.updateStatus` → UI; dictionary-driven refresh sr-only strings; B-15 cleanup. Covers all four delta specs.

## Architecture Decisions

### D1: Per-send deadline location
| Option | Tradeoff | Decision |
|---|---|---|
| Wrap `provider.send()` at dispatch in `checkAndNotify` | One wrap covers all 3 providers incl. Telegram, which uses `node-telegram-bot-api` (`Bot.sendMessage` — no AbortSignal support) | **Chosen** (proposal said grammy; actual code is node-telegram-bot-api — boundary wrap is the only viable spot for Telegram) |
| AbortSignal inside each provider | Clean abort for ntfy/Discord fetch, impossible for Telegram | Rejected as primary |

**Choice**: New `withDeadline<T>(promise, ms, label)` helper in `src/lib/notifications/send-deadline.ts` (`Promise.race` against a `setTimeout` rejection; clears timer on settle). Applied in `checkAndNotify` (`notification-service.ts:179`): `providers.map((p) => withDeadline(p.send(message), SEND_TIMEOUT, p.name))`. Additionally pass `AbortSignal.timeout(SEND_TIMEOUT)` as `signal` to ntfy/Discord `fetch` calls (defense-in-depth, aborts the socket). **Config**: `NOTIFICATIONS_SEND_TIMEOUT_MS`, default `8000` (mirrors `FETCH_TIMEOUT` in `registry-updates.ts:19`). **Behavior on fire**: rejection lands in the existing `Promise.allSettled` failure logging (line 184) — log, continue with remaining providers/messages. `markAsNotified` stays before dispatch → ND-01 reserve-before-send and NOTIF-07 preserved unchanged.

### D2: Transient verdict shape and classification
| Option | Tradeoff | Decision |
|---|---|---|
| `transient?: boolean` on `CheckImageUpdateResult` | Minimal, serializes cleanly through `'use cache'` | **Chosen** |
| Enum verdict field | Over-modeled for one distinction | Rejected |

**Choice**: add `transient?: boolean` (`src/lib/registry-updates.ts:21`). Classification via exported helper `classifyRegistryError(error: unknown): boolean` in the same file: `true` for abort/timeout errors ("Timeout after" from `fetchWithTimeout`), `TypeError` (fetch network/DNS), and HTTP 429 (Hub: check `tagsResponse.status === 429` before the generic throw at L138; GHCR: track status in the endpoint loop, classify 429 as transient before the `invalid_token` fallback). Set `transient: classifyRegistryError(error)` in both catch blocks (~L218 Hub, ~L361 GHCR) instead of the silent `{ hasUpdate: false, isLocal: false }` collapse. 404 paths untouched.

### D3: Transient verdicts ARE cached at registry TTL
Transient results flow through `checkImageUpdate`/`checkGhcrUpdate` `'use cache'` scopes unchanged (revalidate 900s / expire 1h, tag `registry:checks` — `src/lib/cache-tags.ts`). **Rationale**: plain-boolean results serialize fine; a short-lived stale "transient" is acceptable and self-heals on manual refresh (`updateTag` revalidates the tag); special-casing would require bypassing the cache and re-introduces per-request registry hits. Spec scenario "transient result cached like other results" satisfied by construction.

### D4: Status mapping and closed vocabulary
`getContainerUpdateStates` mapper (`registry-updates.ts:446`): add branch `result.transient ? 'transient' : 'unknown'` in the no-latestDigest case; remove nothing else. `FilterStatus` (`src/types/app-state.ts`): replace `'checking'` with `'transient'` (closed set: local, updated, available, unknown, transient, local-filter). `container-card.tsx`: delete `StatusChecking` (L215-226) and the `case 'checking'` (L402), add `StatusTransient` (amber/warning styling, reusing the existing status-span pattern). `container-dashboard.tsx` L91/L107: `checking` comparisons → `transient` (include in degraded-status detection where `unknown` is handled); default filter lists unchanged. Dictionary: add `container.transient`, remove `container.checking` in all three JSONs.

### D5: Refresh i18n via server-passed props
`RefreshButton` is a client component with no dict access; `DashboardGate` already has `dict`. **Choice**: add `dict.dashboard.refreshAriaLabel`, `refreshing`, `upToDate` keys (en/es/pt-BR) and pass them as props from `dashboard-gate.tsx:69`. Fallback is type-level (`Dictionary = typeof en.json` — missing key in es/pt fails `tsc`), matching the existing `LogoutButton ariaLabel={dict.login.logout}` pattern. No new client dictionary plumbing, no prerender hazard.

### D6: Discord validate parity
`providers/discord.ts:30`: change `if (!this.enabled) return true` → `return false`, matching Telegram/ntfy. `send()` already throws when invalid; no behavior change when enabled.

## Data Flow

    checkUpdate (raw | 'use cache')
      ├─ catch: classifyRegistryError → transient?: boolean
      ▼
    getContainerUpdateStates ── updateStatus: 'transient' ──▶ ContainerCard (StatusTransient)
      ▼
    checkAndNotify: markAsNotified → Promise.allSettled(withDeadline(p.send)) → log & continue

## File Changes

| File | Action |
|------|--------|
| `src/lib/notifications/send-deadline.ts` | Create — `withDeadline` helper |
| `src/lib/notifications/notification-service.ts` | Modify — wrap sends, env timeout |
| `src/lib/notifications/providers/ntfy.ts`, `discord.ts` | Modify — fetch signal; Discord validate |
| `src/lib/registry-updates.ts` | Modify — `transient`, classifier, 429, mapper |
| `src/types/app-state.ts` | Modify — FilterStatus swap |
| `src/components/container-card.tsx`, `container-dashboard.tsx` | Modify — status states |
| `src/components/refresh-button.tsx`, `dashboard-gate.tsx` | Modify — dict props |
| `src/lib/i18n/dictionaries/{en,es,pt-BR}.json` | Modify — +refresh keys, +transient, −checking |
| Tests: `notification-service.test.ts`, new `registry-updates.test.ts`, new `send-deadline.test.ts`, `dictionaries.test.ts` | Create/Modify |

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Unit (vitest) | `withDeadline` resolves under deadline, rejects at it | fake timers |
| Unit | Hung endpoint: local `http.createServer` that accepts TCP and never responds; provider send against it fails within deadline; remaining providers still sent; dedup mock stays marked | extends `notification-service.test.ts` mock pattern |
| Unit | `classifyRegistryError`: timeout error, `TypeError`, 429 → transient; 404-shaped result → not transient; mapper never emits `checking` (property loop over inputs) | pure-function tests |
| Unit | Discord validate disabled→false; dictionary keys present in all 3 locales | existing test files |

Verification: `bun run test`, `bunx biome check`, `bun run build` (type check catches missed `checking` consumers).

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary.

## Migration / Rollout

No migration; dedup state format untouched. Each deliverable independently committable/revertable.

## Open Questions

- None blocking. (Note: `FilterStatus` also feeds `stats-summary.tsx` filters — implementation will confirm `transient` is display-only, not a filter chip, or add it deliberately; decided in tasks.)
