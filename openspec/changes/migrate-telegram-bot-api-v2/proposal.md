# Proposal: Migrate node-telegram-bot-api to v2

## Intent

The `node-telegram-bot-api@^1.2.0` line is frozen upstream; 2.x is the maintained lineage (runtime-agnostic TypeScript client, dual ESM/CJS, Bun 1.4-tested). Upgrade to `^2.1.0` staying on a supported line with **identical behavior**: outbound notifications with inline "Update" button, inbound long-polling callback handler driving container updates, dev-HMR singleton guard, single-poller-per-token invariant, graceful SIGTERM/SIGINT shutdown via `src/instrumentation.ts`.

## Scope

**In**
- Dependency bump to `^2.1.0`; named `{ Bot }` import from `.` core entry.
- Outbound provider (`providers/telegram.ts`): `new Bot(token)` (polling concept removed), single-object `bot.api.sendMessage(params)`; keep Markdown, disabled previews, inline keyboard `u:<shortId>`, `sent.chat.id`/`message_id` reads.
- Poller (`telegram-polling.ts`): seam re-typed to `Pick<Api, 'editMessageText' | 'answerCallbackQuery'>`, passing `bot.api`; single-object params; error detection via `TelegramApiError.description`; `startPolling()` promise stored in `PollerHandle` and awaited after `stop()`; explicit `bot.catch()` logger.
- Unit tests migrated from positional `[text, opts]` shapes to params-object shapes.

**Out (explicit non-goals)**
- Middleware redesign (`bot.use()`, `ctx.answerCallbackQuery()`), rich/ephemeral messages, webhook mode, `run()` helper (double-registers shutdown), `./node` DEBUG tracing, any change to callback store, update core, i18n, or message content.

## Capabilities

**New:** None.
**Modified:**
- `telegram-update-actions`: R4/R15 reference v1 APIs (`new TelegramBot(token, { polling })`, `stopPolling()`); delta rewords them to v2 equivalents (`new Bot(token)` + `startPolling()`/`stop()` awaited). N1 pin `^1.2.0` → `^2.1.0`. Document new default retry behavior. Behavioral outcomes unchanged.

## Approach

Exploration **Approach 1 (seam-preserving)**: only signatures and error typing change, not behavior. Pure handler + narrow structural seam + globalThis singleton survive. Rejected Approach 2 (middleware-native): scatters business logic across middleware, breaks exact-sequence edit assertions, larger diff, zero behavioral gain.

Open-question decisions:
1. Import from `.` core-only — sufficient and minimal.
2. Stop awaits the stored pump promise — cheap correctness improvement.
3. `SendMessageResult = Message` narrowing expected to compile under strict TS; verify at design/apply, add local narrowing only if needed.

## Parity Requirements

- Benign-edit fix **required**: replace v1 `ETELEGRAM` sniffing with `err instanceof TelegramApiError && /message is not modified/i.test(err.description)` — the old path never matches v2 errors.
- Documented behavior change: v2 auto-retries transient/429 failures (`maxRetries: 2`, honors `retry_after`). Accepted as harmless.
- `stop()` exactly once per handle; no second poller.

## Affected Areas

| Area | Impact |
|---|---|
| `package.json` + lockfile | Dep bump |
| `src/lib/notifications/providers/telegram.ts` | ~25 lines |
| `src/lib/notifications/telegram-polling.ts` | ~70–90 lines |
| `src/lib/notifications/telegram-polling.test.ts` | ~60–80 lines |

Total authored ≈160–200 lines (within budget; no chained PRs).

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Duplicate poller → HTTP 409 | High impact / Low likelihood | globalThis guard kept; one stored pump promise, single `stop()` |
| Benign-edit regression missed | High | Mandatory `TelegramApiError.description` migration + regression test |
| Shutdown conflict via `run()` | Medium | Forbidden; `startPolling()`/`stop()` only |

## Rollback

Single revert: restore dependency pin and the four touched files. No schema/data migrations; callback store format untouched.

## Verification

- Migrated Vitest suite passes (`bun run test`); typecheck clean (`bunx tsc --noEmit`); `bun run build`; `bunx biome check .` clean.
- Manual smoke with the real `.env` bot token (secrets never printed/logged):
  1. Start server with `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` set; confirm poller starts once.
  2. Trigger a real update notification; confirm message renders with inline button.
  3. Tap the button; observe edits: "updating…" → success/error/already-up-to-date state.
  4. Send SIGTERM; confirm graceful stop and clean restart without 409.

## Success Criteria

- [ ] Tests, typecheck, build, lint all pass on v2
- [ ] Real-token smoke: notification delivered, tap edits message end-to-end, graceful stop verified
- [ ] Zero behavioral drift beyond documented `maxRetries: 2`
