# Design: migrate-telegram-bot-api-v2

## Technical Approach

Seam-preserving migration of `node-telegram-bot-api` ^1.2.0 → ^2.1.0 (exploration Approach 1): the pure `handleCallbackQuery` handler, narrow structural seam, `globalThis` singleton, and env gates survive untouched. Only import names, call signatures, error typing, and polling-lifecycle plumbing change. Behavioral outcomes match delta spec R4/R15/N1/N8; R5's outcome is unchanged, its detection mechanism is redesigned below.

## Architecture Decisions

### D1 — Import entry point
**Choice**: Named imports `{ Bot, Api, TelegramApiError }` from the core entry `.` (plus type-only `SendMessageParams`, `CallbackQuery`, `InlineKeyboardMarkup`). **Alternatives**: `./node` (adds DEBUG tracing, webhook sugar). **Rationale**: minimal surface; nothing from `./node` is used.

### D2 — Outbound provider instantiation
**Choice**: `new Bot(token)` in the provider constructor; send via `this.bot.api.sendMessage(...)`. **Alternatives**: share one `Bot` across provider/poller. **Rationale**: v2 removes the `polling:false` concept — the provider physically cannot start a poll loop (R4.3 by construction); separate instances preserve the single-poller invariant trivially.

### D3 — Startup stays non-blocking
**Choice**: `initTelegramPolling(): void` remains synchronous; `register()` in `instrumentation.ts` is UNTOUCHED. Inside init: build `Bot`, wire handlers, store the handle on `globalThis` FIRST, then `const polling = bot.startPolling(); handle.polling = polling.catch((error) => { console.error('[telegram-polling] polling failed:', error); g[POLLER_GLOBAL_KEY] = undefined })` — fire-and-forget with logging; a loud pump failure clears the singleton so a later HMR re-init can retry. Do NOT await in the register path. **Alternatives**: make register await startup. **Rationale**: preserves today's fast boot semantics; `startPolling()` resolving means the pump ended, which shutdown cares about, not startup.

### D4 — Graceful stop (R15)
**Choice**: `stopTelegramPolling()` synchronously: read handle → clear the globalThis key immediately (idempotence; prevents double-stop and restart races) → `handle.running = false` → `handle.bot.stop()` exactly once (v2 `stop(): void` aborts the internal AbortController) → fire-and-forget internal async step that awaits the stored `handle.polling` promise under a 5 s timeout guard (`Promise.race`), swallowing rejection. **Alternatives**: keep fire-and-forget `stop()` with nothing awaited (today's behavior); adopt `run()`. **Rationale**: awaiting the stored pump promise guarantees the in-flight long-poll fully terminates before exit (R15.1 → no 409 on restart, R15.2); `run()` installs its own signal handlers and would conflict with `instrumentation.ts` (forbidden by proposal).

### D5 — Handler seam and dispatch
**Choice**: `export type CallbackBot = Pick<Api, 'editMessageText' | 'answerCallbackQuery'>`; production passes `bot.api`. Dispatch: `bot.on('callback_query', (ctx) => { const q = ctx.callbackQuery; if (!q) return; handleCallbackQuery(bot.api, q).catch((e) => console.error('[telegram-polling] callback handler failed:', e)) })`, plus an explicit `bot.catch((err) => console.error('[telegram-polling] bot error:', err))` boundary (v2 routes thrown handler errors there instead of crashing the pump). **Alternatives**: middleware-native redesign (`bot.use()`, `ctx.answerCallbackQuery()`). **Rationale**: rejected in proposal — scatters business logic and breaks exact-sequence edit assertions.

### D6 — Benign-edit error detection (R5 mechanism)
**Choice**:
```ts
function isBenignEditError(error: unknown): boolean {
	const description =
		error instanceof TelegramApiError
			? error.description
			: error instanceof Error
				? error.message
				: undefined
	return typeof description === 'string' && /message is not modified/i.test(description)
}
```
Delete the dead `response?.body?.description` sniffing (never matches v2 typed errors). **Rationale**: `TelegramApiError.description` is v2's structured field; keeping the `Error.message` fallback is cheap defensive parity.

### D7 — Retry behavior (N8)
Accept v2 defaults: `maxRetries: 2`, honors `retry_after` on 429/transient failures. Documented, no opt-out config.

## API Call Rewrites (exact signatures)

```ts
// providers/telegram.ts — keeps building Omit<SendMessageParams,'chat_id'|'text'>
const sent = await this.bot.api.sendMessage({ chat_id: this.chatId, text, ...options })
// sent.chat.id / sent.message_id reads unchanged (SendMessageResult = Message)

// telegram-polling.ts — safeEditMessage: one flat object
await bot.editMessageText({
	chat_id: chatId,
	message_id: messageId,
	text,
	parse_mode: 'Markdown',
	link_preview_options: { is_disabled: true },
	...(options?.reply_markup ? { reply_markup: options.reply_markup } : {})
})

// safeAnswer
await bot.answerCallbackQuery({ callback_query_id: callbackQueryId, ...(text ? { text } : {}) })
```

## Type Compatibility

`CallbackQuery.message` becomes the `MaybeInaccessibleMessage` union; both variants carry `chat` and `message_id`, so the existing optional-chained access (`query.message?.chat.id`) stays valid. `SendMessageResult = Message` is expected to compile under strict TS; if `tsc` complains, annotate locally: `const sent: Message = await …`. `SendMessageParams`/`InlineKeyboardMarkup` shapes unchanged — plain-object `reply_markup` literals remain supported.

## Data Flow

```
instrumentation.register()                      (unchanged file)
  └─ initTelegramPolling()                       sync, non-blocking
       ├─ env gates (R4.2) + globalThis singleton (R4.1)
       ├─ new Bot(token) ─ on('callback_query') ─ bot.catch(log)
       ├─ handle.polling = bot.startPolling()    (.catch → log + clear key)
       └─ SIGTERM/SIGINT → stopTelegramPolling()
            └─ clear key → bot.stop() ×1 → await handle.polling (≤5 s, swallow)
tap → longPoll update → ctx.callbackQuery → handleCallbackQuery(bot.api, q)
  └─ safeAnswer / safeEditMessage                (single-object params)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `package.json` | Modify | Pin `node-telegram-bot-api@^2.1.0` |
| `bun.lock` | Modify | Generated lockfile churn |
| `src/lib/notifications/providers/telegram.ts` | Modify | Imports, `new Bot(token)`, `bot.api.sendMessage({...})` (~25 ln) |
| `src/lib/notifications/telegram-polling.ts` | Modify | Imports, seam type, params objects, error migration, `PollerHandle.polling`, start/stop/dispatch wiring (~70–90 ln) |
| `src/lib/notifications/telegram-polling.test.ts` | Modify | Param-object assertions + benign-edit regression test (~60–80 ln) |

`src/instrumentation.ts`: **untouched** — dynamic imports and signal wiring carry over verbatim.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | All existing handler scenarios (R5, R8, R9, R13…) | Vitest; structural mock unchanged: `{ editMessageText: vi.fn(), answerCallbackQuery: vi.fn() } as unknown as CallbackBot` |
| Unit | NEW benign-edit regression (mandatory) | Mock rejects with a real `TelegramApiError` (description "Bad Request: message is not modified"); assert swallowed, no error log spam, flow reaches terminal edit |
| Gates | Typecheck/build/lint | `bun run test`, `bunx tsc --noEmit`, `bun run build`, `bunx biome check .` |
| E2E | Real-token smoke (below) | Manual |

### Assertion migrations (enumerated)
1. `editTexts()` helper: `(calls as [string, unknown][]).map(c => c[0])` → single-object: `c[0].text` (typed as the params object). Every `texts[]` consumer keeps working.
2. Success-keyboard test: `calls[last][0]` / `calls[last][1].reply_markup` → `last.text` / `last.reply_markup` (each call arg IS the params object).
3. Fallback-coords test: `for (const [, o] of calls) o.chat_id/o.message_id` → iterate `c[0].chat_id/c[0].message_id`.
4. Call-count / `not.toHaveBeenCalled` assertions: unchanged.

### Manual smoke protocol (user-approved; NEVER print/log secret values)
1. Confirm `.env` contains `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`/`TELEGRAM_ENABLED=true`/`NOTIFICATIONS_ENABLED=true` (check existence only).
2. `bun run dev` (or `dev:node`): exactly ONE `[telegram-polling] long polling started`; an HMR re-init logs "already running".
3. Trigger a real notification (startup initial check ≈30 s, or `POST /api/notifications/check`): Markdown message with inline "Update" button arrives.
4. Tap the button end-to-end: edits "🔄 Updating…" → ✅/❌/ℹ️ terminal state, keyboard cleared.
5. Stop via **Ctrl+C** (Windows terminal sends the interrupt that hits the SIGINT handler): graceful-stop logged, clean exit; restart server → no HTTP 409.

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary changes. Signal wiring lives in `instrumentation.ts`, which this change does not touch.

## Migration / Rollout

No data/schema migration; callback store format untouched. Rollback = restore the `^1.2.0` pin and revert the three source/test files + lockfile. No feature flags needed.

## Dependency Mechanics

`bun add node-telegram-bot-api@^2.1.0` updates `package.json` + `bun.lock`. Package is dual ESM/CJS via `exports` — resolved natively by Bun/Next/Turbopack, zero bundler config changes. `engines.node >= 18` satisfied (project pins `>= 26`).

## Requirement Mapping

| Delta requirement | Satisfied by |
|---|---|
| R4 — v2 instantiation, explicit `startPolling()`, stored promise, single-object params, provider never polls | D1–D3, D5, API Call Rewrites, Data Flow |
| R15 — `stop()` once + awaited pump | D4 |
| N1 — pin `^2.1.0` | Dependency Mechanics |
| N8 — documented `maxRetries: 2` | D7 |
| R5 mechanism-note — benign-edit detection | D6 + Unit regression test |

## Open Questions

- [ ] Exact `TelegramApiError` public constructor signature for the regression-test fixture — read the installed `.d.ts` at apply time (non-blocking; fallback: `Object.setPrototypeOf` on a plain object carrying `description`).
