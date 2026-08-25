# Tasks: migrate-telegram-bot-api-v2

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~160–200 authored (+ generated `bun.lock` churn, excluded from review count) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR (one work unit) |
| Delivery strategy | auto-chain |
| Chain strategy | pending (chaining N/A) |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Work Units

| Unit | Goal | PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|----|----------------------|-----------------|-------------------|
| WU1 | Full v2 migration: dep bump + provider + poller + tests | PR 1 | `bun run test` | Real-token smoke protocol (design Manual smoke 1–5) | Revert pin + revert 4 touched files |

Committable work-unit marker: tasks 1.1–3.5 are intermediate WU1 states (tree intentionally RED between Phase 2 and Phase 3 per TDD); the ONLY commit happens after Phase 4 gates pass.

## Phase 1: Foundation

- [x] 1.1 Bump dep: `bun add node-telegram-bot-api@^2.1.0`. AC: package.json pins `^2.1.0` (N1); clean reinstall; zero bundler config (Design: Dependency Mechanics). Files: `package.json`, `bun.lock`. ~2 ln. Deps: —
- [x] 1.2 Read installed `.d.ts`: resolve exact `TelegramApiError` public constructor for the 2.2 fixture (documented fallback `Object.setPrototypeOf`). AC: fixture recipe recorded; resolves Design open question. Files: none (read-only). Deps: 1.1

## Phase 2: Test Migration (RED)

- [x] 2.1 Migrate assertions (Design: Assertion migrations 1–4): `editTexts()` → `c[0].text`; success-keyboard → `last.text`/`last.reply_markup`; fallback-coords → iterate `c[0].chat_id`/`c[0].message_id`; call-count assertions unchanged; mocks stay structural `as unknown as CallbackBot`. AC: file compiles; suite RED vs v1 source (R4.4). File: `src/lib/notifications/telegram-polling.test.ts`. ~35 ln. Deps: 1.1
- [x] 2.2 NEW mandatory benign-edit regression: mock `editMessageText` rejects with a real `TelegramApiError("Bad Request: message is not modified")` (fixture from 1.2); assert error swallowed, no error-log spam, flow reaches terminal edit. AC: RED before migration (old sniffing never matches v2 errors), GREEN after 3.2 (R5 mechanism-note, D6). ~20 ln. Deps: 1.2, 2.1

## Phase 3: Source Migration (GREEN)

- [x] 3.1 Provider `src/lib/notifications/providers/telegram.ts`: core-entry `{ Bot }` import; ctor builds `new Bot(token)`; send `bot.api.sendMessage({ chat_id, text, ...options })`; keep `Omit<SendMessageParams,'chat_id'\|'text'>` builder, Markdown, disabled previews, `u:<shortId>` inline keyboard, `sent.chat.id`/`sent.message_id` reads; NEVER call `startPolling()`. AC: R4.3 + R4.4 (D2). ~25 ln. Deps: 1.1
- [x] 3.2 Poller imports/seam/errors `src/lib/notifications/telegram-polling.ts`: named `{ Bot, Api, TelegramApiError }` + type-only `SendMessageParams`/`CallbackQuery`/`InlineKeyboardMarkup`; re-type `CallbackBot = Pick<Api, 'editMessageText' \| 'answerCallbackQuery'>`; delete dead `response?.body?.description` sniffing; add `isBenignEditError` exactly per D6 (regex `/message is not modified/i`, `Error.message` fallback). AC: turns 2.2 GREEN (R4.4). ~25 ln. Deps: 2.2
- [x] 3.3 Single-object params: `safeEditMessage` flat object (`parse_mode:'Markdown'`, `link_preview_options:{is_disabled:true}`, conditional `reply_markup` spread); `safeAnswer` with conditional `text` spread — exact Design "API Call Rewrites" signatures. AC: R4.4. ~15 ln. Deps: 3.2
- [x] 3.4 Startup/dispatch (D3, D5): `PollerHandle { bot, running, polling? }`; env gates + `globalThis` singleton kept; store handle BEFORE `startPolling()`; `handle.polling = bot.startPolling().catch(log + clear singleton key)` fire-and-forget; init stays sync/un-awaited; `instrumentation.ts` untouched; dispatch `bot.on('callback_query', ctx)` reading `ctx.callbackQuery` into `handleCallbackQuery(bot.api, q)`; explicit `bot.catch` logger. AC: R4.1, R4.2, R4.4, D3. ~35 ln. Deps: 3.2, 3.3
- [x] 3.5 Graceful stop (D4): `stopTelegramPolling()` clears `globalThis` key immediately → `running=false` → `handle.bot.stop()` exactly once → fire-and-forget await of stored `handle.polling` under ≤5 s `Promise.race`, swallowing rejection. AC: R15.1, R15.2; idempotent double-stop. ~12 ln. Deps: 3.4

## Phase 4: Verification Gates

- [x] 4.1 `bun run test` all green incl. 2.2 regression. Deps: 3.1–3.5
- [x] 4.2 `bunx tsc --noEmit` clean; `MaybeInaccessibleMessage` optional chains valid; local `const sent: Message` narrowing ONLY if tsc complains (Design: Type Compatibility). Deps: 3.1
- [x] 4.3 `bun run build` succeeds (dual ESM/CJS exports resolve natively). Deps: 4.2
- [x] 4.4 `bunx biome check .` clean (tabs, single quotes, no semicolons). Deps: 3.1
- [x] 4.5 Surface design Manual smoke protocol (real token; never print/log secrets) for execution during sdd-verify. Deps: 4.3
