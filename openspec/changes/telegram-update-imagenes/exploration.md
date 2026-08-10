# Exploration: Update Docker Images from Telegram (Long Polling)

Change: `telegram-update-imagenes` | Branch: `feat/telegram-update-imagenes`
Product decision (already made by the user): implement image updates FROM Telegram via **long polling** (option B) + inline keyboard buttons on update notifications. No webhook, no slash commands.

## Current State

### Outbound-only Telegram bot
- `src/lib/notifications/providers/telegram.ts` — `TelegramNotificationProvider` builds `new TelegramBot(token, { polling: false })` (node-telegram-bot-api `^1.2.0`, confirmed in `package.json`). It is **outbound only**: `send()` calls `bot.sendMessage(chatId, text, { parse_mode: 'Markdown', link_preview_options: { is_disabled: true } })`. No `getUpdates` loop, no message/callback handlers, no webhook route, no inline keyboard.
- The bot is created inside the provider constructor only when `TELEGRAM_ENABLED === 'true'` and `validate()` passes (`TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` present).

### Notification pipeline (scheduler, outside request context)
- `src/instrumentation.ts` `register()` runs once per server start; guarded by `process.env.NEXT_RUNTIME === 'nodejs'` it dynamically imports `src/lib/notifications/scheduler.ts` and calls `initScheduler()`.
- `scheduler.ts` gates on `NOTIFICATIONS_ENABLED === 'true'`, validates providers, schedules a cron (`NOTIFICATIONS_CRON_SCHEDULE`, default `0 */6 * * *`) plus an initial check after 30 s. It uses the **raw readers** `listContainersRaw()` / `listImagesRaw()` (`src/lib/docker-inventory.ts`) and `checkAndNotify(containers, images)` because it runs outside the App Router request context where `'use cache'` scopes throw E279.
- `notification-service.ts` `checkAndNotify()` builds a `NotificationMessage` and **hardcodes `containerId: ''`** (line 99) — the `ContainerUpdate`/`NotificationMessage` types (`src/types/app-state.ts`) carry **no `containerId` and no `fullImageName`** today. `NotificationTranslations` only has `title/container/image/current/latest/updated/viewReference/viewOnRegistry`.
- i18n `notifications` dict (`en/es/pt-BR`) has **no** `update`, `updating`, `updateStatusSuccess`, `updateStatusError`, `webhook` keys (confirmed in `en.json`). Note: keys like `updating.*` and `updateDialog.*` exist elsewhere in the dicts — the missing ones are specific to the Telegram update flow.

### Web update flow (request context + Cache Components)
- `src/actions/docker.ts` (`'use server'`):
  - `doUpdateContainerImage(containerId, newImageName, onPhase?)` — pulls via `docker.pull` + `modem.followProgress` (layer progress callbacks), then stop/remove/recreate/start preserving config (Env minus `PORT=`/`HOST_PORT=`, Binds, PortBindings, RestartPolicy, NetworkMode, networks, labels, exposed ports). Emits phases `pulling → stopping → recreating → starting → verifying`. Returns `{ success, error?, newContainerId?, newImageId? }`.
  - `updateContainerImage(containerId, newImageName)` — thin exported wrapper (no progress callbacks).
  - `triggerContainerUpdate(containerId, newImageName) → { taskId }` — dedups via `progressStore.isContainerUpdating(containerId)`, creates a task, registers the container→task mapping, then runs `doUpdateContainerImage` **fire-and-forget** feeding `progressStore.updatePhase`. On success: `progressStore.setResult` + revalidates all `REFRESH_TAGS` via `updateTag(tag)` from `next/cache`. On error: `progressStore.setError`. Always `cleanup()`.
- `src/lib/update-progress-store.ts` — in-memory global singleton (`globalThis.__docker_progress_store__` pattern), TTL 5 min sweep, phases `pulling/stopping/recreating/starting/verifying/done/error`, `isContainerUpdating()` blocks only non-terminal phases. The dashboard consumes progress via SSE at `/api/update-progress?taskId=...`; `src/components/use-container-updates.ts` drives the UI.
- `src/lib/cache-tags.ts` — `CACHE_TAGS = { containers: 'docker:containers', images: 'docker:images', connection: 'docker:connection', registry: 'registry:checks' }`; `REFRESH_TAGS` = all four; profiles `minutes` (inventory) and `seconds` (connection).

### Auth
- `src/proxy.ts` `matcher` excludes `/api`, so an API route is not gated by htpasswd and must self-secure. With long polling this is moot — nothing is exposed.

## Key Findings from the Abandoned Branch (`a1ecc53`, never merged, pre-Cache-Components)

`git show a1ecc53 --stat` confirms the full inventory (17 files, +1154/-19):

| File | Role | Reuse value |
|---|---|---|
| `src/app/api/telegram/webhook/route.ts` (321 lines) | Webhook receiving `callback_query`, `?secret=` validation, `callback_data` format `u:{shortId}`, edits the message with status states (updating / success / error, no technical details), "already up to date" case | Reference for callback parsing + message editing UX; transport itself is replaced by polling |
| `src/lib/notifications/notification-callbacks.ts` (189 lines) | Persistent JSON store `data/telegram-callbacks.json`, shortId 8 chars, TTL 24 h, cap 1000 entries (fits Telegram's 64-byte `callback_data` limit) | **Reusable as-is** (file-based, no request context) |
| `src/lib/notifications/webhook-debounce.ts` (34 lines) | 30 s debounce to avoid concurrent updates of the same container | Likely obsolete — `progressStore.isContainerUpdating` already provides dedup (and it's request-agnostic) |
| `src/lib/notifications/providers/telegram.ts` (diff) | Added `storeCallbackData(...)`, inline keyboard `[[{ text: t.update, callback_data: 'u:'+shortId }]]`, `disable_web_page_preview: true` | **Key reference**; must be updated: `disable_web_page_preview` is deprecated in node-telegram-bot-api 1.2.0 → `link_preview_options: { is_disabled: true }`; keyboard must only be sent by the Telegram provider, not ntfy/Discord |
| `src/lib/notifications/notification-service.ts` (diff) | `+containerId`, `+fullImageName` on `ContainerUpdate`/`NotificationMessage`, extra translations | **Reusable pattern**; `containerId` is available from `ContainerInfo.Id` and `fullImageName` from `container.Image` |
| `src/actions/docker.ts` (+49) | `updateContainerImage` + `alreadyUpToDate` handling + `clearContainerCallbacks` | `clearContainerCallbacks` still relevant (stale callbacks after a manual dashboard update); `alreadyUpToDate` logic maps to `progressStore`/digest comparison today |
| i18n `en/es/pt-BR` (+13 each) | `update`, `updating`, `updateStatusSuccess`, `updateStatusError` | **Reusable keys** (repo still lacks them) |
| `docs/telegram-image-update-implementation.md` (355) | Setup docs (webhook secret, env vars, flow) | Needs rewriting for polling |

**Obsolete in the old branch** (pre-Cache-Components world): webhook route + secret env, debounce module, `disable_web_page_preview`, old direct `updateContainerImage` call without progress phases (today's `triggerContainerUpdate` + `progressStore` gives phase-level progress for free), and the dashboard callback-cleanup wiring may need re-checking against current components.

## Feature Requirements

1. **Inline update button** on Telegram notifications: each update notification carries one inline button (label from i18n `update`) with `callback_data` = `u:{shortId}` (≤ 64 bytes).
2. **One-tap UX with state feedback**: tapping the button immediately edits the message to an "updating…" state, then a final state — success (no technical details) or a friendly error (no stack traces). Include the "already up to date" case.
3. **Long polling transport**: bot receives callback queries via `getUpdates` polling started in the Node process — **no exposed ports, no webhook URL, no secret env var**.
4. **Full update pipeline reuse**: the tap must run the same update logic as the web flow (`doUpdateContainerImage` via `triggerContainerUpdate`/`progressStore`), including Docker pull + followProgress + recreate and cache revalidation, adapted for the out-of-request-context path.
5. **Dedup**: no concurrent updates of the same container (reuse `progressStore.isContainerUpdating`).
6. **i18n**: new keys in `en/es/pt-BR` (`update`, `updating`, `updateStatusSuccess`, `updateStatusError`).
7. **Chat security**: only accept callbacks whose `shortId` resolves in the callbacks store (TTL 24 h, cap 1000). Optionally validate `chat.id`/`from.id` against the configured `TELEGRAM_CHAT_ID` as defense-in-depth.

## Transport Decision: Long Polling (confirmed)

| Option | Pros | Cons | Complexity |
|---|---|---|---|
| **B. Long polling** (chosen) | No exposed ports / no webhook URL / no secret; works behind NAT and in the compose proxy setup; same process as the scheduler via `instrumentation.ts`; `node-telegram-bot-api` `{ polling: true }` handles `getUpdates` loop + offset bookkeeping + callback auto-answer | Long-lived in-process loop (dev double-instance risk, handled by the existing global-singleton pattern); runs outside request context (must use raw readers + a request-context-free update path); polling starts/stops with the server | Medium |
| A. Webhook (abandoned branch) | Telegram pushes immediately; standard approach | Requires public URL + TLS + `?secret=` self-security; conflicts with the compose proxy deployment (no exposed ports wanted); this is what the user rejected | Medium |

Recommendation: **Long polling**, as already decided. The polling loop is started from `src/instrumentation.ts` `register()` next to `initScheduler()` (guarded by `NEXT_RUNTIME === 'nodejs'`), protected by the same `globalThis` singleton pattern used by `src/lib/docker.ts` and `progressStore` to avoid a double instance in dev.

## Technical Considerations

- **64-byte `callback_data` limit**: payload = `u:` + 8-char shortId; full `{ containerId, fullImageName, locale }` resolved from `data/telegram-callbacks.json` (TTL 24 h, cap 1000). Reuse `notification-callbacks.ts` nearly as-is (it is file-based, works outside request context).
- **Out-of-request-context path (E279)**: the polling handler runs in the Node process outside the App Router request context:
  - It MUST resolve the update via raw readers (`listContainersRaw` / `listImagesRaw` from `src/lib/docker-inventory.ts`) if it needs fresh container/image data.
  - It MUST NOT call cached wrappers (`checkImageUpdate` cached scope). `doUpdateContainerImage` itself is cache-free; the risk is `triggerContainerUpdate`'s `updateTag()` (from `next/cache`) — **open question**: does `updateTag` throw outside a request context (like `cacheTag` E279)? Mitigation options: (a) verify at design/apply time; (b) wrap revalidation in try/catch and rely on the next scheduler run / dashboard refresh to re-validate; (c) run the update through a request-context tunnel (e.g., an internal fetch to a route handler) — more complex, last resort.
  - Best candidate: extract/reuse `triggerContainerUpdate`-equivalent logic that writes progress to `progressStore` (in-memory global, request-agnostic) but makes `updateTag` revalidation optional/guarded for the polling path.
- **Progress feedback to the user**: since Telegram is pull-only, the one-tap UX edits the original message: tap → edit to "updating…", then edit to final state when `progressStore` reaches `done`/`error` (poll the store in-process or hook the `onPhase` callback; a per-container in-process promise is simplest, no SSE needed for Telegram).
- **Dedup**: `progressStore.isContainerUpdating(containerId)` already blocks concurrent updates and works outside request context. The old `webhook-debounce.ts` becomes redundant — do not port it.
- **Dev double instance**: `new TelegramBot(token, { polling: true })` starts a `getUpdates` loop; in dev, HMR can create a second instance → reuse the `globalThis.__<key>__` singleton pattern (as `docker.ts` and `progressStore` do) and guard creation.
- **Bot lifecycle**: the bot instance lives in the polling module (singleton), separate from the provider's outbound `TelegramBot`; both share the same token — `polling: true` on the inbound one is fine (only one poller per token must exist; the provider stays `polling: false`).
- **Already-up-to-date case**: after resolving `containerId`, compare the container's current image/digest (raw readers) before pulling; if already on the target image, answer the callback with the "already up to date" message and delete the stored callback.
- **Stale callbacks**: reuse `clearContainerCallbacks` concept — when a container is updated from the dashboard, purge its pending callbacks so an old button tap can't re-trigger a stale update (old branch had this; verify against current dashboard components).
- **i18n**: add `update`, `updating`, `updateStatusSuccess`, `updateStatusError` to the `notifications` dict in `en.json`, `es.json`, `pt-BR.json`; `locale` is already carried per-message (`NotificationMessage.locale`) — new: carry `containerId` + `fullImageName` on `NotificationMessage`/`ContainerUpdate`.
- **Provider isolation**: the inline keyboard is Telegram-only; `ntfy`/`Discord` providers must be untouched (`BaseNotificationProvider`/`provider-factory` separation already isolates this).
- **Security**: callbacks self-secured by the shortId store (TTL + cap). Defense-in-depth: optionally ignore callbacks whose `message.chat.id` ≠ `TELEGRAM_CHAT_ID` (note `TELEGRAM_CHAT_ID` may hold multiple comma-separated IDs — check parsing).
- **`node-telegram-bot-api` 1.2.0 API**: use `link_preview_options: { is_disabled: true }`, not `disable_web_page_preview`; `answerCallbackQuery` to dismiss the button spinner.

## Risks

- **`updateTag` outside request context** may throw (parallel to the E279 `cacheTag` restriction). If unverified, cache revalidation from the Telegram path silently fails → stale dashboard. Needs an explicit design decision + guarded code.
- **Second `getUpdates` poller** if the singleton guard is missed (dev HMR, or the provider accidentally switched to `polling: true`) → Telegram `409 Conflict` errors for the token.
- **Long-running pulls block the event loop / overlap with scheduler**: `docker.pull` + followProgress is async but heavy; concurrent updates of different containers could stack. Dedup only guards per-container.
- **Message edit races**: rapid callback taps or multiple phases editing the same message can race (`editMessageText` with wrong `message_id` / text not modified errors) — need `try/catch` + ignore benign Telegram edit errors.
- **`data/telegram-callbacks.json` growth / partial writes**: file-based store with sync writes (old pattern); concurrent writes could corrupt — keep the old module's sync read-modify-write or serialize writes. Also `data/` must stay on a persistent volume in Docker (it already is, per AGENTS.md).
- **i18n drift** if keys are added only to `en.json` (3 dicts must stay in sync; existing tests may catch, otherwise Biome/verify step).
- **Behavioral drift between web and Telegram update paths**: two call sites for `doUpdateContainerImage` must keep the same config-preservation guarantees.

## Open Questions

1. Does `updateTag` (or `revalidateTag`) from `next/cache` work in the long-polling context (non-request), or does it throw like `cacheTag` E279? (Verify during design with a minimal probe; fallback = guarded try/catch + rely on scheduler/manual refresh.)
2. Should the Telegram flow reuse `triggerContainerUpdate` verbatim (accepting the `updateTag` risk), or extract a request-agnostic core (`doUpdateContainerImage` + `progressStore` wiring) that both call sites share? (Lean: extract a shared core in `src/lib/`.)
3. `TELEGRAM_CHAT_ID` parsing — single vs comma-separated — to scope chat-id validation for callbacks.
4. Does `clearContainerCallbacks` need wiring into the current dashboard update flow, and which current component owns that hook (`use-container-updates.ts` / `container-dashboard.tsx`)?
5. Polling start/stop lifecycle: stop on shutdown (SIGTERM/SIGINT) or let the process end naturally? (Self-hosted long-running container: natural end is fine; note it.)

## Ready for Proposal

**Yes.** The exploration is complete: transport (long polling), reuse surface (callback store, keyboard pattern, i18n keys, `triggerContainerUpdate` core), and the main open question (request-context `updateTag`) are identified. Tell the user the proposal phase will define the shared update core and the cache-revalidation strategy for the polling path.
