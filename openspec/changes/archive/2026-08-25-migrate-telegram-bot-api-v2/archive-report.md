# Archive Report: migrate-telegram-bot-api-v2

**Change**: migrate-telegram-bot-api-v2 (Telegram transport migration to node-telegram-bot-api v2)
**Capability**: `telegram-update-actions`
**Branch**: `chore/migrate-to-bun`
**Archived to**: `openspec/changes/archive/2026-08-25-migrate-telegram-bot-api-v2/`
**Archived on**: 2026-08-25
**Status**: COMPLETE
**Artifact store**: hybrid (OpenSpec filesystem + Engram)

## Final State at Close

- **Implementation**: 14/14 tasks complete (`tasks.md`, all `[x]`, 0 unchecked — Task Completion Gate passed).
- **Implementation commit**: `fdf7071` (`feat(notifications): migrar el transporte de Telegram a node-telegram-bot-api v2`) on `chore/migrate-to-bun`. No source code changed during archive.
- **Verification**: verdict **PASS**, zero blockers, zero CRITICAL findings. Validator `gentle-ai sdd-verify-validate` admitted the report envelope (`gentle-ai.verify-result/v1`, valid: true, verdict: pass, evidence_revision `sha256:81efc962b6ca5b0ceb6be0858c07df3d9f73a1a1c38bfafe28006378bc40e41e`), requirements 5/5, scenarios 9/9.
- **Gates** (independently re-run at `fdf7071`, clean tree): `bun run test` exit 0 (13 files / 79 passed, incl. the v2 benign-edit regression), `bunx tsc --noEmit` exit 0, `bunx biome check .` exit 0 (126 files), `bun run build` exit 0.

## Real-token smoke results (at verification time)

Secrets never printed. Boot gating proven with flags off/on; exactly one polling start per process; outbound v2 `bot.api.sendMessage` delivered a real notification end-to-end; forced-kill restart after ≥60 s settle showed zero 409/conflict lines (immediate-restart one-shot 409 documented as an operational caveat of the pre-existing class, not a migration regression).

### Post-report confirmation (2026-08-25, maintainer-executed)

Both deferred human items from the verify report are **CLOSED** by maintainer-run E2E with pasted server logs:

1. Button tap E2E (R5 flow): fresh redis notification delivered; tap drove the shared pipeline end-to-end — pull `redis:8.4.0` → `8.10.1`, old container removed, new container created, `/api/internal/revalidate` returned 200.
2. Graceful stop/restart path exercised in the same session without unexpected conflicts.

The verify report carries a "Post-report confirmation" section recording this; this archive report adopts it as final state per the Final-State Authority hierarchy (orchestrator final-state facts outrank intermediate snapshot deferrals).

## Findings disposition

- WARNING — Next.js `router-server.js` "Error handling upgrade request TypeError": analyzed post-report; classified **benign/pre-existing dev-only HMR noise** (originates in Next's upgrade handler, not the Telegram stack; node-telegram-bot-api v2 ships zero dependencies — no `ws` in tree).
- WARNING — `answerCallbackQuery failed 400 query is too old`: analyzed post-report; classified as the **designed stale-tap path** (`safeAnswer` catches and continues), triggered by tapping a pre-restart button whose callback query ID had expired.
- SUGGESTION (exploration): assert env flag truthiness, not just key existence, in future explores.

## Follow-ups (OPEN at close)

1. Consider adding `"query is too old"` to the benign-error list alongside `"message is not modified"` (post-archive hardening suggestion; cosmetic — current behavior already degrades gracefully).

## Review Gate

`reviewGate` is structurally absent for this candidate — no review artifact was ever discovered (status reports all review topics missing; native attempt ledger complete:true). Archive proceeds under ordinary repository policy. Pre-archive dispatcher state showed `nextRecommended: verify` / `dependencies.archive: blocked` with **empty `blockedReasons`** — stale DAG bookkeeping superseded by the admitted verify envelope and orchestrator final-state facts; no native gate refused any archive operation.

## Specs Synced (delta → canonical)

Delta merged into `openspec/specs/telegram-update-actions/spec.md` (MODIFIED R4, MODIFIED R15, Non-functional table update):

| Requirement | Action | Details |
|---|---|---|
| R4 | MODIFIED | v2 client wording (`Bot`, explicit `startPolling()` with stored promise, single-object params via `bot.api`); scenarios R4.1–R4.2 preserved; **R4.3 + R4.4 added** |
| R15 | MODIFIED | `stop()` once + await stored polling promise; R15.1 THEN updated; **R15.2 added** |
| N1 | MODIFIED | pin updated to `node-telegram-bot-api@^2.1.0` |
| N8 | ADDED | accepted default retry behavior (`maxRetries: 2`) |
| N2–N7 | PRESERVED | verbatim |
| R1–R3, R5–R14 | PRESERVED | verbatim (zero hunks touch them in the sync diff) |

Result: 15 functional requirements, 29 scenarios (+3), 8 NFRs (+1). The delta's "(Previously: …)" annotations do NOT appear in the canonical spec (verified: zero matches). Footer provenance line updated to record the amendment. Per `rules.archive` ("Warn before merging destructive deltas"): this merge is non-destructive — nothing was removed; all changes are in-place expansions or additions.

## Mechanical Copy Verification (readback)

- **Archive move**: recursive pre-move snapshot taken to `%TEMP%\sdd-archive-bc18cb8f20c04c86ad4ae0b714196db2`; `git mv openspec/changes/migrate-telegram-bot-api-v2 openspec/changes/archive/2026-08-25-migrate-telegram-bot-api-v2`; source directory confirmed absent; readback `git diff --no-index --stat <snapshot>\source openspec/changes/archive/2026-08-25-migrate-telegram-bot-api-v2` → **empty output, exit 0** (byte-identical); snapshot deleted.
- **Main-spec sync**: performed as a model-mediated delta merge (existing-spec merge path); verified by `git diff -U1` showing exactly the six intended hunks (R4 body, +R4.3/+R4.4, R15 body/R15.1, +R15.2, N1 row, +N8 row, footer) and nothing else.
- This file (`archive-report.md`) is additive-only and excluded from the source/destination comparison (it did not exist in the source change folder).

## Archived Contents

- `proposal.md` ✅
- `exploration.md` ✅
- `specs/telegram-update-actions/spec.md` ✅ (delta, preserved as audit trail)
- `design.md` ✅
- `tasks.md` ✅ (14/14 tasks complete)
- `verify-report.md` ✅ (incl. Post-report confirmation section)
- `archive-report.md` ✅ (additive)

The active changes directory no longer contains `migrate-telegram-bot-api-v2`.

## Engram Observations (hybrid persistence)

Observation IDs read for traceability:

- #695 `sdd/migrate-telegram-bot-api-v2/explore`
- #696 `sdd/migrate-telegram-bot-api-v2/proposal`
- #697 `sdd/migrate-telegram-bot-api-v2/spec`
- #698 `sdd/migrate-telegram-bot-api-v2/design`
- #700 `sdd/migrate-telegram-bot-api-v2/tasks`
- #701 `sdd/migrate-telegram-bot-api-v2/apply-progress`

Note: no Engram observation exists for this change's verify-report; the filesystem `verify-report.md` (admitted envelope) is authoritative for that artifact. This archive report is persisted to Engram as topic `sdd/migrate-telegram-bot-api-v2/archive-report`.

## SDD Cycle Complete

The change was planned, implemented (14/14), verified (PASS, envelope admitted), confirmed E2E by the maintainer, and archived. Ready for the next change.
