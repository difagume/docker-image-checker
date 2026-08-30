# Proposal: Fix Provider & Registry Robustness

## Intent

Three confirmed defects degrade reliability: (B-08, #20) notification provider sends (Telegram/ntfy/Discord) have no timeout — a hung server freezes the whole check round and blocks subsequent rounds; (B-04, #16) every registry-check error collapses to the "Unknown image" verdict, hiding transient failures (timeout, rate limit, network) from users; (B-12, #24) refresh accessibility strings are hard-coded English outside the i18n dictionary. B-15 partial cleanup rides along (Discord `validate()` parity, dead "Checking update..." state).

## Scope

### In Scope
- Per-send deadline (reuse the 8s `FETCH_TIMEOUT` pattern from `src/lib/registry-updates.ts`): wrap `provider.send()` in `checkAndNotify` (`src/lib/notifications/notification-service.ts:179`) so one hung send cannot block the round; log and continue with remaining providers/messages.
- Transient-failure verdict: in `src/lib/registry-updates.ts` catch blocks (Hub ~L219, GHCR ~L361) and non-404 HTTP failures, distinguish transient from not-found and surface it in `CheckImageUpdateResult` → `ContainerUpdateState.updateStatus` mapping (~L446).
- i18n: move sr-only strings (`src/components/refresh-button.tsx:25,31`) into dictionaries (`src/lib/i18n/dictionaries/*.json`) for EN/ES/PT-BR.
- B-15a: `DiscordNotificationProvider.validate()` returns `false` when disabled, matching Telegram/ntfy (`src/lib/notifications/providers/discord.ts:30-33`).
- B-15b: remove dead "checking" status — no producer exists; remove `container.checking` dict key, `StatusChecking` branch (`container-card.tsx:402`), and `checking` references (`container-dashboard.tsx`, `src/types/app-state.ts`).

### Out of Scope
- Retry/backoff for notification sends or registry checks.
- Provider-level refactor or new notification channels.
- Full transient-retry UI or automatic re-check scheduling.

## Capabilities

### New Capabilities
- `notification-send-resilience`: per-send deadline and fail-continuation for Telegram/ntfy/Discord dispatch; provider `validate()` parity when disabled.

### Modified Capabilities
- `registry-verdict`: transient failures (timeout, rate limit, network error) MUST map to a distinct transient verdict instead of the `unknown`/not-found collapse; confirm the status mapper never emits the dead `checking` state.
- `notification-dedup`: no requirement change — deadline work must preserve ND-01 reserve-before-send and NOTIF-07 (failed sends stay marked).
- `static-shell-prerender`: no requirement change; i18n strings stay server-rendered dictionary lookups (no new time APIs / prerender hazards).

## Approach

Extract a shared `fetchWithTimeout`-style helper (or `withDeadline`) and apply `AbortSignal.timeout` to ntfy/Discord `fetch` calls and Telegram via grammy bot config/handler wrapper; wrap the `Promise.allSettled` dispatch in `checkAndNotify`. Add `transientError?: boolean` (or equivalent verdict field) to `CheckImageUpdateResult`, set in catch blocks by error classification, and map it to a dedicated `FilterStatus` value rendered distinctly. Threads `updateStatus` typing changes through `src/types/app-state.ts`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/lib/registry-updates.ts` | Modified | Transient vs not-found verdict classification |
| `src/lib/notifications/notification-service.ts` | Modified | Per-send deadline, continue on failure |
| `src/lib/notifications/providers/*.ts` | Modified | Send timeouts; Discord validate parity |
| `src/components/refresh-button.tsx` | Modified | Dictionary-driven sr-only strings |
| `src/lib/i18n/dictionaries/*.json` | Modified | New refresh keys; removed `checking` key |
| `src/components/container-card.tsx`, `container-dashboard.tsx` | Modified | Remove dead `checking` state |
| `src/types/app-state.ts` | Modified | `FilterStatus` adjustments |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Telegram deadline misapplied (grammy API shape) | Med | Wrapper at send boundary, not per-API-call; unit test with hung mock |
| Transient verdict cached ~15min like other results | Low | Cache key/tag unchanged; document TTL in spec |
| Dictionary key removal breaks a consumer missed by grep | Low | Vitest suite + `bun run build` type check |

## Rollback Plan

Single-feature reverts: each deliverable is independently committable; `git revert` the specific commit. No persisted-state or schema migration involved — dedup state format is untouched.

## Dependencies

- None external. Verification: `bun run test` (~122 vitest tests), `bunx biome check`, `bun run build`.

## Success Criteria

- [ ] A hung provider endpoint cannot block a check round beyond the per-send deadline; remaining messages still send.
- [ ] Registry timeout/rate-limit/network errors surface as a distinct transient verdict, not "Unknown image"; 404 not-found behavior unchanged.
- [ ] Refresh sr-only strings come from dictionaries in EN/ES/PT-BR.
- [ ] Discord `validate()` returns `false` when disabled; no `checking` status remains in code or dictionaries.
- [ ] `bun run test`, biome, and `tsc --noEmit` all pass.
