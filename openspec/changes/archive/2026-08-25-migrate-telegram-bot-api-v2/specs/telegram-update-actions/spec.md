# Delta for telegram-update-actions

Change: migrate-telegram-bot-api-v2 | Base spec: `openspec/specs/telegram-update-actions/spec.md`

## Purpose of this delta

Upgrade the Telegram transport from frozen `node-telegram-bot-api@^1.2.0` to maintained `^2.1.0`. Behavioral outcomes are unchanged; only v1 API wording, the N1 dependency pin, and one documented retry note change. R1–R3, R5–R14 and N2–N7 are NOT touched by this delta (R5's benign-edit outcome is unchanged; its v2 detection mechanism is a design-level concern, not a spec change).

## MODIFIED Requirements

### Requirement: R4 — Long-polling transport, single poller (High)

The poller MUST run in-process using the v2 client — `Bot` imported from the package core entry, instantiated as `new Bot(token)` (the v1 `polling` constructor option no longer exists) — with polling started explicitly via `startPolling()`, whose returned polling promise MUST be stored on the poller handle. It MUST start from `instrumentation.ts` `register()` next to `initScheduler()`, guarded by `NEXT_RUNTIME === 'nodejs'` and a `globalThis` singleton. All Telegram API calls MUST use the v2 single-object params form via `bot.api`. The outbound provider MUST build its own `new Bot(token)` instance and MUST NOT call `startPolling()` on it. No webhook, no exposed port.
(Previously: v1 `new TelegramBot(token, { polling: true })`; outbound provider kept `polling: false`; no polling promise stored.)

#### Scenario: R4.1 — Single poller per process

- GIVEN dev HMR re-runs `register()`
- WHEN the poller is created again
- THEN the `globalThis` singleton prevents a second `getUpdates` loop (no Telegram 409)

#### Scenario: R4.2 — Gated by env

- GIVEN `TELEGRAM_BOT_TOKEN` or `NOTIFICATIONS_ENABLED` is not set
- WHEN the server starts
- THEN the poller is never started

#### Scenario: R4.3 — Outbound provider never polls

- GIVEN the notification provider sends a message via `bot.api.sendMessage`
- WHEN the send completes
- THEN `startPolling()` was never called on the provider's `Bot` instance and no `getUpdates` loop exists for it

#### Scenario: R4.4 — Single-object params everywhere

- GIVEN any Telegram API call (send message, edit message text, answer callback query)
- WHEN it is issued through `bot.api`
- THEN arguments travel as one params object (no v1 positional `[text, options]` shape)

### Requirement: R15 — Polling lifecycle (Low)

On SIGTERM/SIGINT the poller MUST call `stop()` exactly once per handle and then await the stored polling promise, so the in-flight long-poll is fully terminated before exit; natural process end is otherwise acceptable.
(Previously: v1 `stopPolling()` call with nothing stored to await.)

#### Scenario: R15.1 — Graceful shutdown

- GIVEN the server receives SIGTERM/SIGINT
- WHEN shutdown begins
- THEN the poller calls `stop()` once, awaits the stored polling promise, and no updates are lost or re-pulled

#### Scenario: R15.2 — Clean restart after shutdown

- GIVEN a graceful stop completed
- WHEN the server restarts and polls again with the same token
- THEN no HTTP 409 conflict occurs (the prior long-poll was fully terminated)

### Requirement: N1 — Dependency line (Non-functional, High), N8 added

N1 is updated and one row (N8) is appended; N2–N7 are reproduced verbatim so the archive step can replace the whole Non-functional Requirements table.
(Previously: N1 pinned `node-telegram-bot-api@^1.2.0`; v2 retry behavior undocumented.)

| ID | Priority | Requirement |
|----|----------|-------------|
| N1 | High | No new exposed ports, no webhook endpoint, no new dependencies (`node-telegram-bot-api@^2.1.0`, upgraded from `^1.2.0`). |
| N2 | High | `pnpm build` and `pnpm test` MUST pass; Biome lint clean. |
| N3 | High | Cache Components compatibility: the polling path MUST NOT call cached wrappers or `updateTag`/`revalidateTag` outside request context (avoid E279/E872/E263); it MUST use raw readers and the request-context tunnel for revalidation. |
| N4 | High | Callback store writes MUST be fs-atomic (temp+rename+mutex, Windows retry) and serialize concurrent writes. |
| N5 | High | `callback_data` MUST stay ≤ 64 bytes (`u:` + 8-char shortId). |
| N6 | Medium | Callback store MUST persist in `data/` (volume-mounted) with TTL 24 h and cap 1000. |
| N7 | Low | Outbound notifications MUST remain single-chat (`TELEGRAM_CHAT_ID`); no multi-chat fan-out. |
| N8 | Medium | Accepted behavior change: the v2 client retries failed Telegram API calls by default (`maxRetries: 2`, honoring `retry_after` on 429/transient failures). Documented and accepted; no opt-out configuration is required. |

Archive target: merge the MODIFIED blocks above into `openspec/specs/telegram-update-actions/spec.md`.
