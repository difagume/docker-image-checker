# Tasks: Update Docker Images from Telegram (Long Polling + Inline Buttons)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1,400–1,700 (F1 ~330, F2 ~550, F3 ~550, F4 ~180) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 → PR 2 → PR 3 → PR 4 (feature-branch-chain) |
| Delivery strategy | auto-chain |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| F1 | Outbound IDs + callback store | PR 1 | `pnpm test notification-callbacks` | N/A (unit; no bot) | Revert; outbound-only |
| F2 | Shared core + web delegation | PR 2 | `pnpm test container-update-task` | N/A (mocked dockerode) | Revert; action unchanged |
| F3 | Tunnel + poller + instrumentation | PR 3 | `pnpm test revalidate` | Manual: real tap | Revert; env-gated |
| F4 | i18n + docs + env | PR 4 | `pnpm test` (dict parity) | N/A (docs/env) | Revert |

## Phase 1: Outbound Plumbing + Callback Store

- [x] 1.1 `src/types/app-state.ts`: add `dockerContainerId`/`fullImageName` to `ContainerUpdate`/`NotificationMessage`; add `update*` keys (R1, R14)
- [x] 1.2 `src/lib/notifications/notification-service.ts`: populate real `container.Id`/`container.Image`; drop `containerId: ''` (R1.1, R1.2)
- [x] 1.3 New `src/lib/notifications/notification-callbacks.ts`: fs-atomic, shortId, TTL 24h, cap 1000; store/get/remove/clear/count (R3, N4, N6)
- [x] 1.4 Test `notification-callbacks.test.ts`: TTL, cap eviction, clear, `Promise.all` no-corruption (R3.2, R3.3)

## Phase 2: Shared Core + Web Action Refactor

- [ ] 2.1 New `src/lib/container-update-task.ts`: `runContainerUpdateTask(id, image, { revalidate, onPhase })` → `{ taskId, done }`; move `doUpdateContainerImage`/`OnPhaseCallback`; dedup throw (R6, R7)
- [ ] 2.2 Core wiring: createTask/register, fire-and-forget, setResult/setError, revalidate + clearContainerCallbacks on success, cleanup (R6.1, R11, R10)
- [ ] 2.3 `src/actions/docker.ts`: `triggerContainerUpdate` delegates with `updateTag(REFRESH_TAGS)` revalidator; re-export `updateContainerImage` (R6.2)
- [ ] 2.4 Unit test `container-update-task.test.ts`: dedup, revalidator called, clearCallbacks, cleanup (R7.1, R10.1, R11.1)

## Phase 3: Tunnel + Polling + Instrumentation

- [ ] 3.1 New `src/lib/notifications/revalidate-tunnel.ts`: URL env|`127.0.0.1:${PORT\|3000}`, `requestRevalidation`, `getRevalidateNonce` (R12)
- [ ] 3.2 New `src/app/api/internal/revalidate/route.ts`: nonce + loopback guard, `revalidateTag(tag,{expire:0})`, 403/400 (R12.1, R12.3, N3)
- [ ] 3.3 Unit test URL derivation: env override, PORT fallback (R12)
- [ ] 3.4 Integration test route: nonce ok, 403, 400 (R12.1, R12.3)
- [ ] 3.5 New `src/lib/notifications/telegram-polling.ts`: singleton, env-gated init/stop/status (R4, R15)
- [ ] 3.6 Callback: shortId + chat checks, answer, edits, swallow benign errors (R5, R7, R8, R9, R10, R13)
- [ ] 3.7 Unit test chat parsing: single/comma/whitespace (R13)
- [ ] 3.8 `providers/telegram.ts`: storeCallbackData + inline keyboard, polling:false + link_preview kept (R2, N5)
- [ ] 3.9 `src/instrumentation.ts`: start poller beside scheduler, SIGTERM/SIGINT stop (R4.2, R15.1)

## Phase 4: i18n + Docs + Env

- [ ] 4.1 `en/es/pt-BR.json`: add 5 `update*` keys each, parity (R14.2)
- [ ] 4.2 Rewrite `docs/telegram-image-update-implementation.md` for polling
- [ ] 4.3 `.env.example` + compose: `TELEGRAM_CHAT_ID` commas, `INTERNAL_REVALIDATE_URL`
- [ ] 4.4 Gate: `pnpm build` + `pnpm test` green, Biome clean (N2)
