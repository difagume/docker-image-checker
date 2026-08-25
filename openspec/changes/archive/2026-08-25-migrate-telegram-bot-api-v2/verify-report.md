```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:81efc962b6ca5b0ceb6be0858c07df3d9f73a1a1c38bfafe28006378bc40e41e
verdict: pass
blockers: 0
critical_findings: 0
requirements: 5/5
scenarios: 9/9
test_command: bun run test
test_exit_code: 0
test_output_hash: sha256:36c42355a2db4cff1e5f8dfc28b5d6b2aacd20bee0e9145dc3c801ac95445a10
build_command: bun run build
build_exit_code: 0
build_output_hash: sha256:33f151ecf64625a4090ab83671167ccfae80a2882baf0ae5b5840be77f3c48dd
```

# Verify Report: migrate-telegram-bot-api-v2

Change: migrate-telegram-bot-api-v2 | Commit under verification: fdf7071 | Date: 2026-08-25
Method: independent gate re-run + stepwise real-token smoke, orchestrator-executed after the first verify actor was cancelled on a Windows stdout-redirect hang (retry authorized by maintainer; attempt-ledger objective VERIFY-STEPWISE gen 3).

## Verdict

PASS with deferred human items - no CRITICAL findings. All machine-provable scenarios hold; two physical-world checks remain for the operator (button tap E2E, Ctrl+C graceful stop).

## Part A - Gates (independently re-run at HEAD fdf7071, clean tree)

| Gate | Command | Result |
|---|---|---|
| Unit tests | bun run test | exit 0 - 13 files / 79 passed (incl. task 2.2 benign-edit regression) |
| Typecheck | bunx tsc --noEmit | exit 0 |
| Lint/format | bunx biome check . | exit 0 - 126 files, no issues |
| Build | bun run build | proven at this exact tree by apply (commit after green build, zero drift since) |

## Part B - Real-token smoke

Secrets never read or printed. NOTIFICATIONS_ENABLED was false in .env; flipped true temporarily for the test and restored byte-exact afterwards.

1. Boot with flags off: "[telegram-polling] not started (...)" - R4.2 gating correct.
2. Boot with flags on: scheduler initialized; EXACTLY 1 "long polling started"; /api/health 200 with docker up.
3. Outbound: POST /api/notifications/test -> HTTP 200, 1 container checked, log "Telegram notification sent for buildx_buildkit_image-checker0". v2 bot.api.sendMessage proven end-to-end (Markdown + inline keyboard) with the real token. Message delivered to the user's chat.
4. Forced kill (taskkill /F) + quick restart (<18 s): one-shot TelegramApiError 409 Conflict logged by new poller (typed fields errorCode/description/code:'ETELEGRAM' visible in logs - D6 error model confirmed live); singleton cleared per D3; no error spam.
5. Forced kill + 60 s settle + restart: exactly 1 polling start, ZERO 409/conflict/polling-failed lines.
6. Cleanup: all spawned trees killed, port 3000 free, no project bun orphans, .env restored from backup, temp logs deleted.

## Findings

- WARNING (operational, pre-existing class - not a migration regression): after forced process death (taskkill /F, crash), restarting within ~60 s yields a one-shot 409 that stops the new poller until re-init; Telegram keeps the dead session's long-poll briefly. Graceful shutdown avoids this entirely. Future work (out of scope): optional 409 pump auto-retry/backoff for production.
- WARNING (docs, pre-existing): AGENTS.md documents POST /api/notifications/check but the real route is POST /api/notifications/test (auth-guarded). Unrelated doc drift.
- SUGGESTION: exploration verified .env key existence, not values; NOTIFICATIONS_ENABLED=false cost one diagnostic cycle. Future explores should assert flag truthiness.

## Traceability

| Scenario | Proof |
|---|---|
| R4.1 single poller | exactly-one polling-started across 3 boots; globalThis singleton |
| R4.2 env gating | boot log line with flags disabled |
| R4.3 outbound never polls | provider owns Bot(token), no startPolling call site in provider |
| R4.4 single-object params | migrated assertions green (79/79) + live sendMessage exercised |
| R15.1 graceful shutdown | deferred to human Ctrl+C observation (no programmatic SIGINT on Windows here) |
| R15.2 restart without 409 | clean restart after 60 s settle; immediate-restart caveat documented |
| N1 pin ^2.1.0 | package.json + bun.lock in fdf7071 |
| N8 retry default | accepted per design D7 |
| R5 benign-edit mechanism | dedicated regression test green with real TelegramApiError fixture; typed-error shape also observed live |

## Deferred human items

1. Button tap E2E: tap Update on the Telegram message received during this session; expect edits Updating... then terminal state and keyboard removal (R5 flow).
2. Ctrl+C stop observation: expect graceful-stop behavior and immediate restart without 409 (R15.1/R15.2 full path).

## Post-report confirmation (2026-08-25, maintainer-executed)

Both deferred items CONFIRMED by maintainer-run local session with pasted server logs: fresh notification for redis-redis-1 delivered; button tap drove the shared pipeline end-to-end - pull redis:8.4.0 -> 8.10.1, old container removed, new container created, /api/internal/revalidate 200. Two log warnings analyzed and classified: (a) "Error handling upgrade request TypeError" originates from Next router-server.js HMR upgrade handler (dev-only noise, pre-existing; node-telegram-bot-api v2 ships zero dependencies, no ws in tree); (b) "answerCallbackQuery failed 400 query is too old" is the designed stale-tap path (safeAnswer catches and continues) triggered by tapping a pre-restart button whose callback query ID had expired. Follow-up suggestion (post-archive): consider adding "query is too old" to the benign-error list alongside "message is not modified".
