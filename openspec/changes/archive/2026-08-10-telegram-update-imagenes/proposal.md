# Proposal: Update Docker Images from Telegram (Long Polling + Inline Buttons)

## Intent

Notifications are **outbound-only**: the bot sends update alerts but the user must open the dashboard to pull the update. Gap: `NotificationMessage` carries no real Docker `containerId` (only a synthetic dedup key, `containerId: ''` hardcoded in `notification-service.ts:99`), so a notification cannot trigger an action. Goal: **one-tap update from Telegram** — each update notification carries an inline button; tapping it runs the same update pipeline as the web flow (`doUpdateContainerImage` + `progressStore`), with the message edited to show progress and final state. No webhook, no slash commands, no exposed ports.

## Scope

### In Scope
- Outbound plumbing: `dockerContainerId` + `fullImageName` on `ContainerUpdate`/`NotificationMessage` (`src/types/app-state.ts`), inline keyboard (Telegram provider only) with `callback_data` `u:{shortId}`.
- Callbacks store: `src/lib/notifications/notification-callbacks.ts` (shortId 8 chars, TTL 24 h, cap 1000, `data/telegram-callbacks.json`) — reuse old-branch module, upgrade writes to `fs-atomic`.
- **Shared update core** `src/lib/container-update-task.ts`: request-agnostic `runContainerUpdateTask(containerId, image, { revalidate, onPhase })` = dedup (`progressStore.isContainerUpdating`) + task wiring + fire-and-forget `doUpdateContainerImage` + `setResult`/`setError` + `clearContainerCallbacks(containerId)`. `triggerContainerUpdate` (action) becomes a thin wrapper injecting an `updateTag(REFRESH_TAGS)` revalidator (web, read-your-writes, unchanged semantics).
- Long-polling module `src/lib/notifications/telegram-polling.ts`: `new TelegramBot(token, { polling: true })` started from `src/instrumentation.ts` `register()` next to `initScheduler()` (guarded `NEXT_RUNTIME === 'nodejs'` + `globalThis` singleton); handles `callback_query`, `answerCallbackQuery`, message edits (updating → success/error, "already up to date").
- **Cache revalidation tunnel**: internal route `src/app/api/internal/revalidate/route.ts` (loopback-only + in-process nonce header) calling `revalidateTag(tag, { expire: 0 })` for `REFRESH_TAGS`; polling path fetches it after success; guarded try/catch with fallback = natural `cacheLife` expiry (≤1 h) + scheduler raw readers.
- i18n `notifications` keys `update/updating/updateStatusSuccess/updateStatusError` in `en/es/pt-BR`; docs rewrite `docs/telegram-image-update-implementation.md` for polling; `.env.example` note (single chat id; validation set parses commas).

### Out of Scope
- Webhook transport, webhook secret env, slash commands.
- Auto-update / unattended pulls of new images.
- Multi-chat outbound fan-out (outbound stays single `TELEGRAM_CHAT_ID` string as today).
- Reusing `webhook-debounce.ts` (obsolete — `progressStore` dedups).
- Ports exposure / TLS.

## Capabilities

### New Capabilities
- `telegram-update-actions`: inbound long polling + callback handling + one-tap update UX + callback store + out-of-context cache revalidation tunnel + chat-id validation + lifecycle.

### Modified Capabilities
- None. `inventory-cache` refresh semantics (`updateTag` ×4 in Server Actions) unchanged; the tunnel is an additive revalidation path. `state-persistence` conventions (fs-atomic) are reused, not changed.

## Approach

Transport: **long polling** (user decision). Flow: scheduler `checkAndNotify` builds message with real `dockerContainerId` + `fullImageName`; Telegram provider stores `{containerId, fullImageName, locale}` in the callbacks file and appends the inline button. Tap → callback query received by poller → validate shortId (TTL/cap) + chat id ∈ parsed `TELEGRAM_CHAT_ID` set → `answerCallbackQuery` → edit message to "updating…" → run `runContainerUpdateTask` with a revalidator that loopback-fetches the internal revalidate route → edit message to success/error, delete callback. Dedup via `progressStore`; stale buttons purged via `clearContainerCallbacks` in the shared core success path (covers web + Telegram).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/types/app-state.ts` | Modified | `+dockerContainerId`, `+fullImageName` on `ContainerUpdate`/`NotificationMessage` |
| `src/lib/notifications/notification-service.ts` | Modified | Populate real `container.Id`; drop `containerId: ''` |
| `src/lib/notifications/providers/telegram.ts` | Modified | Inline keyboard (Telegram-only), `storeCallbackData`, keep `link_preview_options` |
| `src/lib/notifications/notification-callbacks.ts` | New | Callback store + `clearContainerCallbacks(containerId)` (fs-atomic writes) |
| `src/lib/container-update-task.ts` | New | Shared core (dedup + progress + revalidate injectable + clearCallbacks) |
| `src/actions/docker.ts` | Modified | `triggerContainerUpdate` delegates to core; `doUpdateContainerImage` moved to core lib |
| `src/lib/notifications/telegram-polling.ts` | New | Polling singleton, callback handler, message edits |
| `src/instrumentation.ts` | Modified | Start poller next to scheduler |
| `src/app/api/internal/revalidate/route.ts` | New | Loopback tunnel → `revalidateTag(..., { expire: 0 })` |
| i18n `en/es/pt-BR.json` | Modified | `notifications.update*` keys |
| `docs/telegram-image-update-implementation.md` | Modified | Rewrite for polling |
| `src/hooks/use-container-updates.ts`, `container-dashboard.tsx` | None | No client hook changes (cleanup is server-side in core) |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `updateTag`/`revalidateTag` throw outside request context (E872/E263, verified in source) | High | Tunnel route (request context) + guarded try/catch; fallback natural expiry; probe at design |
| Second `getUpdates` poller → Telegram 409 | Med | `globalThis` singleton guard; provider stays `polling: false` |
| Message-edit races / benign edit errors | Med | try/catch + ignore "message not modified" |
| Callbacks file corruption (concurrent writes) | Med | fs-atomic writes; serialize per-operation |
| Stale button after web update re-triggers pull | Med | `clearContainerCallbacks` in shared core success path |
| Behavioral drift web vs Telegram update | Low | Single shared core; action is thin wrapper |
| Tunnel route reachable externally | Low | Loopback-only check + in-process nonce header; no ports exposed in compose proxy |
| i18n drift across 3 dicts | Low | Verify step; existing tests/Biome |

## Rollback Plan

Revert commit(s) on `feat/telegram-update-imagenes`. Feature is gated by existing env: no `TELEGRAM_BOT_TOKEN`/`NOTIFICATIONS_ENABLED` → poller and keyboard never start; web update flow unchanged if the shared-core refactor regresses (action still delegates with same semantics). Delete `data/telegram-callbacks.json` to drop pending buttons.

## Dependencies

- `node-telegram-bot-api@^1.2.0` (already present). No new deps.
- Docker daemon reachable (existing requirement).

## Success Criteria

- [ ] Tapping the inline button updates the container via the same pipeline as the dashboard (phases, dedup, config preservation).
- [ ] Message edits: updating… → success/error/"already up to date"; no stack traces.
- [ ] Dashboard reflects the update (tunnel revalidates; fallback ≤1 h expiry).
- [ ] Stale buttons (updated from dashboard or container removed) answer with a friendly "expired/already updated" state and are purged.
- [ ] `pnpm build` + `pnpm test` green; no new exposed ports.

## Open Questions / Assumptions

No product questions remain (user decided polling + inline buttons). Declared assumptions:
- Single-chat outbound preserved; callback validation accepts comma-separated `TELEGRAM_CHAT_ID` (parsed set).
- Long polling lifecycle: natural end acceptable; `stopPolling()` on SIGTERM/SIGINT as cheap insurance.
- Revalidation via tunnel is primary; if the design probe shows a simpler in-process path, adopt it — tunnel is the documented fallback.
