# Telegram Update Actions — Specification (telegram-update-actions)

Change: telegram-update-imagenes | Branch: feat/telegram-update-imagenes

## Purpose

Enable **one-tap Docker image updates from Telegram**. Update notifications gain an inline button; tapping it runs the same update pipeline as the web dashboard (dedup, phases, config preservation), with the message edited to show progress and final state. Transport is **long polling** — no webhook, no slash commands, no exposed ports. This is a NEW capability (no delta over existing specs).

## Functional Requirements

### Requirement: R1 — Real container identity on notifications (High)

`ContainerUpdate` and `NotificationMessage` MUST carry the real `dockerContainerId` and `fullImageName` for containers with updates. `notification-service` MUST populate them from `ContainerInfo.Id` / `container.Image` and MUST NOT emit the synthetic `containerId: ''`.

#### Scenario: R1.1 — Notification carries real IDs

- GIVEN a container has an available update
- WHEN the scheduler builds the `NotificationMessage`
- THEN `dockerContainerId` equals the container's real Docker ID and `fullImageName` equals its image reference

#### Scenario: R1.2 — No synthetic empty id

- GIVEN a notification is produced for any container
- THEN `dockerContainerId` is never the empty string

### Requirement: R2 — Inline update button, Telegram only (High)

The Telegram provider MUST append to each update notification an inline keyboard with a single button labeled by the i18n `update` key and `callback_data` = `u:{shortId}` (8-char shortId, total ≤ 64 bytes). ntfy and Discord providers MUST NOT emit keyboards.

#### Scenario: R2.1 — Button on Telegram message

- GIVEN the Telegram provider sends an update notification
- WHEN the message is delivered
- THEN it includes one inline button with `callback_data` starting with `u:` and ≤ 64 bytes

#### Scenario: R2.2 — Other providers untouched

- GIVEN the same update is sent via ntfy or Discord
- WHEN the message is delivered
- THEN no inline keyboard or callback data is present

### Requirement: R3 — Callback store with TTL and cap (High)

The system MUST persist a shortId → `{ containerId, fullImageName, locale }` mapping in `data/telegram-callbacks.json` via fs-atomic writes. Entries MUST expire after 24 h TTL and the store MUST cap at 1000 entries (evict oldest).

#### Scenario: R3.1 — Store persists

- GIVEN the Telegram provider sends a notification with a button
- WHEN the provider stores the callback data
- THEN the mapping is persisted to `data/telegram-callbacks.json` and resolvable by `u:{shortId}`

#### Scenario: R3.2 — TTL expiry

- GIVEN a callback entry is older than 24 h
- WHEN it is looked up
- THEN it is treated as expired and MUST NOT trigger an update

#### Scenario: R3.3 — Cap enforcement

- GIVEN the store already holds 1000 entries
- WHEN a new callback is stored
- THEN the oldest entry is evicted and the new one is retained

### Requirement: R4 — Long-polling transport, single poller (High)

The poller MUST run in-process via `new TelegramBot(token, { polling: true })`, started from `instrumentation.ts` `register()` next to `initScheduler()`, guarded by `NEXT_RUNTIME === 'nodejs'` and a `globalThis` singleton. The outbound provider MUST stay `polling: false`. No webhook, no exposed port.

#### Scenario: R4.1 — Single poller per process

- GIVEN dev HMR re-runs `register()`
- WHEN the poller is created again
- THEN the `globalThis` singleton prevents a second `getUpdates` loop (no Telegram 409)

#### Scenario: R4.2 — Gated by env

- GIVEN `TELEGRAM_BOT_TOKEN` or `NOTIFICATIONS_ENABLED` is not set
- WHEN the server starts
- THEN the poller is never started

### Requirement: R5 — One-tap update UX with message edits (High)

Tapping the button MUST: validate the shortId and chat, `answerCallbackQuery`, edit the message to "updating…", run the shared update core, then edit to the final state — success (`updateStatusSuccess`), friendly error (`updateStatusError`), or "already up to date". No stack traces. Benign Telegram edit errors ("message not modified") MUST be ignored.

#### Scenario: R5.1 — Happy path

- GIVEN a valid callback for an updatable container
- WHEN the user taps the button
- THEN the message is edited to "updating…", then to the success state, and the callback is deleted

#### Scenario: R5.2 — Friendly errors

- GIVEN the update fails (pull error, missing image)
- WHEN the core reports the error
- THEN the message is edited to `updateStatusError` with no stack trace, and the callback is deleted

### Requirement: R6 — Shared update core, same pipeline as web (High)

The system MUST run the Telegram update through a request-agnostic core (`runContainerUpdateTask(containerId, image, { revalidate, onPhase })`) that reuses `doUpdateContainerImage` + `progressStore` wiring with identical phase and config-preservation semantics. The web action `triggerContainerUpdate` MUST become a thin wrapper over the same core.

#### Scenario: R6.1 — Same pipeline

- GIVEN a callback tap triggers an update
- WHEN the core runs
- THEN phases (pulling → stopping → recreating → starting → verifying) and config preservation match the dashboard flow exactly

#### Scenario: R6.2 — Web flow unchanged

- GIVEN a user updates from the dashboard
- WHEN the action runs
- THEN behavior is unchanged (read-your-writes revalidation via `updateTag`)

### Requirement: R7 — Dedup per container (High)

Concurrent updates of the same container MUST be prevented via `progressStore.isContainerUpdating` (non-terminal phases block). A second tap while an update is in flight MUST NOT start a second pull.

#### Scenario: R7.1 — Double tap blocked

- GIVEN an update for container X is in progress (non-terminal phase)
- WHEN a second tap on container X arrives
- THEN it is answered without starting a second update (e.g. "already updating")

### Requirement: R8 — Already up to date (Medium)

Before pulling, the core MUST compare the container's current image/digest against the target; if already up to date, the system MUST edit the message to the "already up to date" state and delete the callback without pulling.

#### Scenario: R8.1 — Container already on target

- GIVEN the container already runs the target image/digest
- WHEN the button is tapped
- THEN no pull occurs, the message shows "already up to date", and the callback is deleted

### Requirement: R9 — Container removed (Medium)

When the resolved container no longer exists, the system MUST answer with a friendly expired/error state, edit the message, and purge the callback.

#### Scenario: R9.1 — Stale container

- GIVEN the callback's container was removed from Docker
- WHEN the button is tapped
- THEN the message shows a friendly error, no pull is attempted, and the callback is purged

### Requirement: R10 — Image not found / pull error (Medium)

Pull failures (image not found, registry error) MUST surface as the friendly `updateStatusError` state, clean up the progress store entry, and delete the callback.

#### Scenario: R10.1 — Pull fails

- GIVEN `docker.pull` fails for the target image
- WHEN the core reports the failure
- THEN the message is edited to `updateStatusError`, the progress entry is cleaned up, and the callback is deleted

### Requirement: R11 — Stale buttons purged after web updates (Medium)

The shared core success path MUST call `clearContainerCallbacks(containerId)` so buttons for a container updated from the dashboard cannot re-trigger a stale pull.

#### Scenario: R11.1 — Old button after dashboard update

- GIVEN the container was updated from the dashboard
- WHEN the user taps an old button for it
- THEN the callback is gone/expired, so the tap resolves to a friendly state and no pull is started

### Requirement: R12 — Cache revalidation tunnel (High)

The polling path MUST revalidate the dashboard cache via an internal loopback route (`/api/internal/revalidate`) guarded by a loopback-only check and an in-process nonce header, calling `revalidateTag(tag, { expire: 0 })` for `REFRESH_TAGS`. Failures MUST be caught with fallback to natural `cacheLife` expiry (≤ 1 h) and scheduler raw readers.

#### Scenario: R12.1 — Tunnel revalidates after success

- GIVEN a Telegram update completes successfully
- WHEN the poller calls the internal route
- THEN `REFRESH_TAGS` are revalidated and the dashboard reflects the new image promptly

#### Scenario: R12.2 — Tunnel unavailable

- GIVEN the internal route fails or is unreachable
- WHEN the poller tries to revalidate
- THEN the failure is caught and the cache still refreshes via natural expiry or the next scheduler run

#### Scenario: R12.3 — Externally unreachable

- GIVEN an external request targets the internal route
- WHEN the route validates the request
- THEN it rejects it (no valid loopback/nonce) and does not revalidate

### Requirement: R13 — Chat-id validation, defense-in-depth (Medium)

Callback queries MUST only be accepted when the originating `chat.id` is in the set parsed from `TELEGRAM_CHAT_ID` (comma-separated). Unknown chats MUST be ignored.

#### Scenario: R13.1 — Allowed chat

- GIVEN a callback from a chat in `TELEGRAM_CHAT_ID`
- WHEN it is processed
- THEN the update flow proceeds

#### Scenario: R13.2 — Unknown chat

- GIVEN a callback from a chat NOT in `TELEGRAM_CHAT_ID`
- WHEN it arrives
- THEN it is ignored and no update is triggered

### Requirement: R14 — i18n keys across dicts (Medium)

The `notifications` dict MUST include `update`, `updating`, `updateStatusSuccess`, `updateStatusError` in `en`, `es`, and `pt-BR`. Message locale MUST come from `NotificationMessage.locale`.

#### Scenario: R14.1 — Locale-correct messages

- GIVEN a notification with locale `es`
- WHEN the button is tapped and the message is edited
- THEN the labels and status texts are rendered in Spanish from the `es` dict

#### Scenario: R14.2 — Dict parity

- GIVEN all three dictionaries
- THEN all four `update*` keys exist in each with no drift

### Requirement: R15 — Polling lifecycle (Low)

The poller MUST stop polling on SIGTERM/SIGINT (`stopPolling()`); natural process end is otherwise acceptable.

#### Scenario: R15.1 — Graceful shutdown

- GIVEN the server receives SIGTERM/SIGINT
- WHEN shutdown begins
- THEN the poller calls `stopPolling()` and no updates are lost or re-pulled

## Non-functional Requirements

| ID | Priority | Requirement |
|----|----------|-------------|
| N1 | High | No new exposed ports, no webhook endpoint, no new dependencies (`node-telegram-bot-api@^1.2.0` already present). |
| N2 | High | `pnpm build` and `pnpm test` MUST pass; Biome lint clean. |
| N3 | High | Cache Components compatibility: the polling path MUST NOT call cached wrappers or `updateTag`/`revalidateTag` outside request context (avoid E279/E872/E263); it MUST use raw readers and the request-context tunnel for revalidation. |
| N4 | High | Callback store writes MUST be fs-atomic (temp+rename+mutex, Windows retry) and serialize concurrent writes. |
| N5 | High | `callback_data` MUST stay ≤ 64 bytes (`u:` + 8-char shortId). |
| N6 | Medium | Callback store MUST persist in `data/` (volume-mounted) with TTL 24 h and cap 1000. |
| N7 | Low | Outbound notifications MUST remain single-chat (`TELEGRAM_CHAT_ID`); no multi-chat fan-out. |

Spec base: none (new capability — full spec). Archive target: `openspec/specs/telegram-update-actions/spec.md`.
