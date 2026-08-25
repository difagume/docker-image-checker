# Exploration: migrate-telegram-bot-api-v2

Change: `migrate-telegram-bot-api-v2` — upgrade dependency `node-telegram-bot-api` from `^1.2.0` to `^2.1.0`.
Store: hybrid (openspec + engram). Date: 2026-08-24.

## Current State (verified in code)

The app uses `node-telegram-bot-api@1.2.0` (installed; already a dual ESM+CJS TypeScript rewrite) for exactly two roles: an **outbound, non-polling** notifier and an **inbound long-polling** bot that turns inline-button taps into container updates.

### Touchpoint inventory

**`package.json`**
- `"node-telegram-bot-api": "^1.2.0"` (dependencies). Runtime: Bun >= 1.4 (`--bun` scripts), `engines.node >= 26`. No other package imports it.

**`src/lib/notifications/providers/telegram.ts` (~173 lines) — outbound provider**
- `import type { SendMessageParams }` and default-imports `TelegramBot`.
- Constructor: `new TelegramBot(token, { polling: false })` — outbound-only by design (single-poller rule).
- Builds `Omit<SendMessageParams, 'chat_id' | 'text'>` with `parse_mode: 'Markdown'`, `link_preview_options: { is_disabled: true }`, and a plain-object `reply_markup.inline_keyboard` with `callback_data: 'u:<shortId>'`.
- Sends via positional call `bot.sendMessage(chatId, text, options)`; reads `sent.chat.id` / `sent.message_id` from the resolved Message to persist message coordinates.
- No event listeners, no polling here.

**`src/lib/notifications/telegram-polling.ts` (~441 lines) — inbound poller**
- Type-imports `CallbackQuery`, `InlineKeyboardMarkup`; default-imports `TelegramBot`.
- `PollerHandle { bot: TelegramBot; running: boolean }` stored on `globalThis.__docker_telegram_poller__` — dev-HMR singleton guard preventing a second `getUpdates` loop (Telegram answers duplicates with HTTP 409).
- Test seam: `CallbackBot = Pick<TelegramBot, 'editMessageText' | 'answerCallbackQuery'>`.
- `bot.editMessageText(text, { chat_id, message_id, parse_mode, link_preview_options, reply_markup? })` — v1 signature: text first, options object second.
- `bot.answerCallbackQuery(callbackQueryId, text ? { text } : {})` — v1 signature: id first, options second.
- `isBenignEditError()` swallows "message is not modified" by matching `/message is not modified/i` against either `error.message` or the v1 ETELEGRAM shape `error.response?.body?.description`.
- Startup: `new TelegramBot(token, { polling: true })`, then `bot.on('callback_query', query => handleCallbackQuery(bot, query))` (EventEmitter dispatch, raw CallbackQuery as payload).
- Shutdown: fire-and-forget `handle.bot.stopPolling().catch(...)`.

**`src/instrumentation.ts` (36 lines)**
- Dynamically imports `initTelegramPolling`/`stopTelegramPolling` under `NEXT_RUNTIME === 'nodejs'`; wires SIGTERM/SIGINT to `stopTelegramPolling()`. Zero direct library usage → no changes required here.

**`src/lib/notifications/telegram-polling.test.ts` (~371 lines)**
- Type-imports `CallbackQuery`; builds literal query objects cast through `as unknown as CallbackQuery`.
- Structural mock `{ editMessageText: vi.fn(), answerCallbackQuery: vi.fn() }` satisfies `CallbackBot`.
- Assertion helpers read **positional call shapes**, e.g. `(bot.editMessageText.mock.calls as [string, unknown][])` extracting `call[0]` as text and checking `call[1].chat_id/message_id/reply_markup`.

**`src/lib/notifications/notification-callbacks.ts` (249 lines)** — pure filesystem store with mutex. Zero library usage → unaffected.

## v2 Package Surface (verified against the published 2.1.0 tarball)

npm metadata for `node-telegram-bot-api@2.1.0`: description "runtime-agnostic TypeScript client", `type: module`, dual ESM+CJS via `exports` map with three entry points:
- `.` → `dist/core/index.js` (web-standard core: Bot, Api, longPoll, errors, types)
- `./node` → re-exports core plus Node-only sugar (`fromPath`, webhook server, managed `run()`, DEBUG tracing)
- `./types` → generated Telegram schema types
- `engines.node >= 18`; developed/tested with Bun ^1.4. Compatible with this app's Node 26 / Bun >= 1.4 runtime and identical packaging model to installed v1 (no bundler/config churn).

### API mapping table (v1 → v2), all verified from dist `.d.ts`

| Current usage (v1) | v2 replacement (verified) |
|---|---|
| `import TelegramBot from 'node-telegram-bot-api'` | Named export: `import { Bot } from 'node-telegram-bot-api'` |
| `new TelegramBot(token, { polling: false })` | `new Bot(token)` — constructor takes only `(token, TransportOptions?)`. The `polling:false` concept disappears; the outbound provider physically cannot start a poll loop. |
| `new TelegramBot(token, { polling: true })` | `new Bot(token)` then `bot.startPolling(): Promise<void>` — resolves when the pump is stopped/aborted; rejects only on fail-loud boundary throw. Not re-entrant (throws if already running). Default source is `longPoll(api)` with `timeout: 30`, `retry: true` (resumes through transient network/5xx/429 errors keeping offset). |
| `bot.stopPolling(): Promise` | `bot.stop(): void` (aborts the internal AbortController); companion `bot.isRunning(): boolean`. Graceful stop = `stop()` then await the stored `startPolling()` promise. |
| `bot.sendMessage(chatId, text, opts): Message` | `bot.api.sendMessage(params: SendMessageParams): Promise<SendMessageResult>` where `SendMessageResult = Message` — single params object `{ chat_id, text, parse_mode?, link_preview_options?, reply_markup? }`. `sent.chat.id` / `sent.message_id` reads remain valid. |
| `bot.editMessageText(text, { chat_id, ... })` | `bot.api.editMessageText(params?: EditMessageTextParams)` — one flat object `{ chat_id?, message_id?, text, parse_mode?, link_preview_options?, reply_markup? }` (all fields confirmed present in the generated type). |
| `bot.answerCallbackQuery(id, { text })` | `bot.api.answerCallbackQuery({ callback_query_id, text? })` or, inside a handler, `ctx.answerCallbackQuery(other?)` which infers the id. |
| `bot.on('callback_query', (query) => …)` | Middleware dispatch: `bot.on('callback_query', (ctx) => …)`; the raw query is exposed as typed getter `ctx.callbackQuery: CallbackQuery \| undefined` (discriminated-union read of the update). Errors thrown in handlers route to `bot.catch((err, ctx) => …)` boundary (default: log via console.error and consume the update; polling never stops). |
| Error shape `ETELEGRAM` / `error.response?.body?.description` | Typed hierarchy: base `TelegramBotError` (stable `.code` string, preserves cause); `TelegramApiError extends TelegramBotError` with structured `.errorCode: number`, `.description: string`, `.parameters`, getter `.retryAfter`; also `NetworkError`, `TimeoutError`, `ParseError`. "message is not modified" detection becomes `err instanceof TelegramApiError && /message is not modified/i.test(err.description)`. |
| Types `SendMessageParams`, `CallbackQuery`, `InlineKeyboardMarkup` | Same names exist in v2 (`./types` schemas re-exported through core index). Shapes verified compatible: `SendMessageParams` keeps chat_id/text/parse_mode/link_preview_options/reply_markup; `CallbackQuery` keeps id/from/message/data (message is now union `MaybeInaccessibleMessage = Message \| InaccessibleMessage`, but both variants carry `chat` and `message_id`, so existing `query.message?.chat.id` / `?.message_id` access stays valid); `InlineKeyboardMarkup` unchanged (`inline_keyboard: InlineKeyboardButton[][]`). Plain-object reply_markup literals remain supported ("any structured field is just a plain object"). |
| — (not used) | Optional low-level path: `longPoll(api, LongPollOptions, AbortSignal): AsyncGenerator<Update>` — not needed since `startPolling()` fits the long-lived instrumentation process. |
| — (not used) | Managed runner `run(bot)` from `./node` installs its own SIGINT/SIGTERM handlers — **must NOT be adopted** because `instrumentation.ts` already owns shutdown wiring. |

Proxy/fetch customization (noted, unused today): `TransportOptions` exposes `apiRoot`, injectable `fetch?: typeof fetch`, `timeoutMs`, `maxRetries` (default 2, auto-retries 429 honoring retry_after), `retryBackoffMs`, `maxRetryAfterMs`, opt-in `rateLimit`.

Env check: `.env` has TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TELEGRAM_ENABLED, NOTIFICATIONS_ENABLED, NOTIFICATIONS_CRON_SCHEDULE all SET (values not inspected); TELEGRAM_CALLBACKS_FILE unset (default path applies).

## Approaches

1. **Direct seam-preserving migration (recommended)** — swap `TelegramBot`→`Bot`, keep the pure `handleCallbackQuery(botApi, query)` handler but re-type the seam to `Pick<Api, 'editMessageText' | 'answerCallbackQuery'>` (pass `bot.api` instead of `bot`), rewrite the two wrapper calls to single-object params, replace the error-shape sniffing with `TelegramApiError.description`, wire handlers via `bot.on('callback_query', ctx => handleCallbackQuery(ctx.callbackQuery…))` + explicit `bot.catch()` logger, store the `startPolling()` promise in `PollerHandle` so `stop()` can be awaited.
   - Pros: smallest diff; pure-handler testability preserved; structural mock pattern survives; singleton guard untouched.
   - Cons: test assertion plumbing must move from positional `[text, opts]` shapes to `[{ text, chat_id, … }]`.
   - Effort: Medium-low.

2. **Adopt middleware-native design** — move allowed-chat filtering into `bot.use()` middleware, answer via `ctx.answerCallbackQuery()`, drive edits off `ctx.api`.
   - Pros: idiomatic v2.
   - Cons: scatters business logic across middleware; breaks the pure-function handler tests that assert exact edit sequences; larger diff for zero behavioral gain.
   - Effort: Medium-high.

## Recommendation

Approach 1. The app's architecture (pure handler + narrow structural seam + globalThis singleton + env gates) maps cleanly onto v2's `Bot`/`api` split; only signatures and error typing change, not behavior.

## Risks

- **WARNING — Single-poller invariant (HTTP 409)**: `startPolling()` is not re-entrant and Telegram 409s duplicate pollers. The existing `globalThis` guard covers dev HMR, but the proposal must specify storing the pump promise and calling `stop()` exactly once per handle.
- **WARNING — Silent benign-edit regression**: if `isBenignEditError` is not migrated to `TelegramApiError.description`, racy duplicate taps will spam edit-error logs after the upgrade (the old `response.body.description` path never matches v2 errors).
- **WARNING — Shutdown wiring conflict**: v2's `run()` helper installs its own SIGINT/SIGTERM listeners; using it would double-register shutdown alongside `instrumentation.ts`. Must use `startPolling()`/`stop()` directly.
- **SUGGESTION — New retry behavior**: v2 auto-retries 429/transient failures by default (`maxRetries: 2`) — behavior change vs v1, harmless but should be documented.
- **SUGGESTION — DEBUG tracing** requires importing `node-telegram-bot-api/node`; optional follow-up, not required for parity.

## Changed-lines estimate vs 800-line review budget

- `providers/telegram.ts`: ~25 lines (imports, constructor, send body)
- `telegram-polling.ts`: ~70–90 lines (imports, seam type, safeEdit/safeAnswer, isBenignEditError, init/stop/handler wiring, PollerHandle promise)
- `telegram-polling.test.ts`: ~60–80 lines (mock call shapes, editTexts helper, coordinate assertions)
- `package.json` + lockfile: ~1 authored line (+generated lockfile churn)
- Total authored: **~160–200 changed lines — comfortably within the 800-line budget.**

## Open questions for the proposal

1. Confirm `sent.chat.id` / `sent.message_id` narrowing compiles under strict TS given `SendMessageResult = Message` (expected fine).
2. Whether to import from `.` (core-only, sufficient) or `./node` (adds DEBUG tracing support) — recommend `.` for minimal surface.
3. Whether `stopTelegramPolling` should await the stored pump promise (currently fire-and-forget is accepted by R15; awaiting is a cheap improvement).

## Ready for Proposal

Yes — all touchpoints inventoried, v2 surface verified against the published tarball, mapping table complete, risks identified.
