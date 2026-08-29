```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:0f5cd5dc3e44486d1b743877e5e9d721794f82331f973c312dd8755f36026d18
verdict: pass_with_warnings
blockers: 0
critical_findings: 0
requirements: 7/7
scenarios: 21/21
test_command: npx vitest run --reporter=verbose
test_exit_code: 0
test_output_hash: sha256:7fc6806adc9604987f9e30b42bb0cddd6800ebb76284f879ef8c13ffb74eb2ca
build_command: npx next build
build_exit_code: 0
build_output_hash: sha256:29a229e520fe345a12f50fbb5ee883fb05bc550247b8c6a495c5a15db35815e6
```

## Verification Report

**Change**: fix-verdict-cache
**Version**: N/A (delta specs)
**Mode**: Strict TDD

### Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 18 |
| Tasks complete | 18 |
| Tasks incomplete | 0 |

> Note: `openspec/changes/fix-verdict-cache/tasks.md` checkboxes remain unchecked (`- [ ]`) in the working tree, but `apply-progress.md` plus commit evidence proves all 18 tasks (Phase1 1.1-1.5, Phase2 2.1-2.6, Phase3 3.1-3.4, Phase4 4.1-4.3) are implemented. File ticking is a documentation debt, not a code gap.

### Build & Tests Execution

**Build**: ✅ Passed (exit 0)
```text
npx next build — Turbopack, Cache Components enabled
Compiled successfully in 2.3s, TypeScript OK
Health check ENOENT /var/run/docker.sock warnings are pre-existing (no daemon in CI)
Routes: /, /_not-found, /api/health, /api/htpasswd-hash, /api/containers/[id]/logs, /api/internal/revalidate, /api/notifications/*, /login, Proxy middleware
```

**Tests**: ✅ 90 passed / ❌ 0 failed / ⚠️ 0 skipped (14 files, 2.71s)
```text
npx vitest run --reporter=verbose
Test Files 14 passed (14)
Tests 90 passed (90)
Key suites: registry-updates.test.ts 7/7, engine.test.ts 6/6 (B-13), fs-atomic, cache-tags, htpasswd, container-update-task, notification-callbacks, telegram-polling, revalidate-tunnel, image-name
pnpm test fails pre-test (pnpm approve-builds guard, exit 1 from install step) — not a test failure; npx vitest run is the authoritative runner (vitest 4.1.11)
```

**Coverage**: ➖ Not available (coverage_threshold 0, no coverage tool configured)

### TDD Compliance

| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | ⚠️ Partial | apply-progress narrates RED→GREEN and 6 RED failures, but no structured "TDD Cycle Evidence" table per strict-tdd-verify.md |
| All tasks have tests | ✅ | 18/18 tasks map to tests (B-01/B-10/B-13/B-05 in registry-updates.test.ts + engine.test.ts) |
| RED confirmed (tests exist) | ✅ | 7/7 registry-updates.test.ts + 2 B-13 engine tests exist on disk |
| GREEN confirmed (tests pass) | ✅ | All 9 new tests pass now (90/90 overall); apply-progress RED claims triangulated with current GREEN |
| Triangulation adequate | ✅ | B-01 2 cases, B-05 3 cases, B-10 2 cases (Hub+GHCR), B-13 2 cases — distinct expectations per scenario |
| Safety Net for modified files | ⚠️ | engine.test.ts had existing 4 tests as safety net (not explicitly tabled) |

**TDD Compliance**: 4/6 checks passed (2 partial — missing structured table, not missing tests)

---

### Test Layer Distribution

| Layer | Tests | Files | Tools |
|-------|-------|-------|-------|
| Unit | 9 | 2 | vitest |
| Integration | 0 | 0 | not installed |
| E2E | 0 | 0 | not installed |
| **Total (change-related)** | **9** | **2** | |
| **Total (repo)** | **90** | **14** | vitest 4.1.11 |

---

### Changed File Coverage

Coverage analysis skipped — no coverage tool detected (config coverage: false, vitest --coverage not configured)

---

### Assertion Quality

| File | Line | Assertion | Issue | Severity |
|------|------|-----------|-------|----------|
| — | — | — | — | — |

**Assertion quality**: ✅ All assertions verify real behavior (no tautologies, no ghost loops, no type-only-alone, no smoke-only; B-01/B-10 assertions check `latestDigest undefined` + mapper `unknown`, B-13 checks `NO_CHANGES` vs `NEW_COMPATIBLE_VERSION_AVAILABLE`, B-05 checks `repository`/`tag`/`isDigest` and fetched URL)

---

### Quality Metrics

**Linter**: ⚠️ 4 warnings / ✅ No errors — `npx biome lint .` exit 0, 4× `style/noNonNullAssertion` FIXABLE in `src/lib/registry-updates.test.ts:13-16` (`fn!` in dynamic-import guard, acceptable per apply-progress)
**Type Checker**: ✅ No errors — `npx next build` TypeScript passed (1008ms), `tsc --noEmit` implicit via build

---

### Spec Compliance Matrix

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| **registry-verdict / Image Reference Parsing** | Registry port reference (`registry.local:5000/myrepo:1.2.3` → repo `registry.local:5000/myrepo` tag `1.2.3`) | `registry-updates.test.ts > B-05 > parses registry with port` + `checkImageUpdateRaw uses parseImageReference for port repo` | ✅ COMPLIANT |
|  | Digest-pinned reference (`myorg/app@sha256:abc123` → isDigest true, tag digest) | `registry-updates.test.ts > B-05 > parses digest-pinned reference` | ✅ COMPLIANT |
|  | Bare name defaults to latest (`nginx` → tag latest) | `image-name.test.ts > parseImageReference > defaults to latest without tag` (existing, not change-scoped) | ✅ COMPLIANT |
|  | Proxied registries preserve original (`lscr.io/linuxserver/nginx:latest` stripped for fetch but 404 uses original `lscr.io/...`) | Static evidence: `registry-updates.ts:105-114` does `parseImageReference` → `originalRepo` → `repo` only after prefix strip, `isLocal = !originalRepo.includes('/')` | ✅ COMPLIANT |
| **registry-verdict / Local Digest Resolution** | Empty RepoDigests yields undefined | `registry-updates.test.ts > B-01 > returns undefined for empty RepoDigests` | ✅ COMPLIANT |
|  | No fabricated CONTENT_UPDATED (`FROM scratch` latest + "" → not CONTENT_UPDATED) | `registry-updates.test.ts > B-01 > FROM scratch with latest and empty digest must NOT be CONTENT_UPDATED` | ✅ COMPLIANT |
| **registry-verdict / Explicit Unknown Domain** | Custom tag absent paints unknown (Hub) — B-10 `redis:tag-inventado` → UNKNOWN, latestDigest undefined, updateStatus unknown | `registry-updates.test.ts > B-10 > redis:tag-inventado absent` | ✅ COMPLIANT |
|  | GHCR parity (`ghcr.io/owner/repo:unknown-tag` absent → same unknown) | `registry-updates.test.ts > B-10 > GHCR parity` | ✅ COMPLIANT |
|  | Undefined digest never renders green (`latestDigest=undefined` + isLocal=false → unknown) | Covered by same B-10 tests via mapper `isLocal?local:latestDigest?available:updated:unknown` assertion | ✅ COMPLIANT |
| **registry-verdict / Candidate-Based Year Guard** | Single-segment pin blocks year major — `16-alpine` vs `["2024.0"]` → NO_CHANGES | `engine.test.ts > B-13 > 16-alpine vs only 2024.0` | ✅ COMPLIANT |
|  | Legitimate compatible still surfaces — `16-alpine` vs `["16.13-alpine","2024.0"]` → 16.13-alpine | `engine.test.ts > B-13 > 16-alpine vs [16.13-alpine,2024.0]` | ✅ COMPLIANT |
| **registry-verdict / 404 Classification and Scheduler Parity** | Simple-name typo remains local (`nginix` 404 no slash → isLocal true, local) | Static: `registry-updates.ts:128-130` `isLocal = !originalRepo.includes('/')`; existing GHCR `parts.length<2 → isLocal true` | ✅ COMPLIANT |
|  | Namespaced unknown is not local (`myorg/missing:custom` 404 → isLocal false, unknown) | Static: same `!originalRepo.includes('/')` guard + UNKNOWN `latestDigest undefined` path; B-10 Hub test proves namespaced absent stays unknown | ✅ COMPLIANT |
|  | Scheduler shares helper (empty RepoDigests → resolveLocalDigest, skip notify) | Static: `notification-service.ts:66-67` `resolveLocalDigest(localImage)` + `updateInfo.latestDigest` skip (79-80); no ImageID fallback remaining | ✅ COMPLIANT |
| **inventory-cache / REQ-03 — Tags de invalidación y refresh read-your-writes** | ESC-05 Refresh read-your-writes (4 tags via updateTag) | Static: `dashboard-gate.tsx:29-35` loops `REFRESH_TAGS` (4 tags including `registry:checks`) via `updateTag(tag)` | ✅ COMPLIANT |
|  | ESC-06 Actualización del registry (remote digest change reflected after refresh/TTL) | Static: `registry-updates.ts:372-382` `checkImageUpdate` `'use cache'` + `cacheTag(registry:checks)` + `cacheLife(900/3600)`; key includes `localDigest` | ✅ COMPLIANT |
|  | ESC-05b Absent digest cached as unknown, recoverable on refresh (undefined vs string key miss) | Static: `checkImageUpdate(name, localDigest?:string)` distinct undefined; Hub/GHCR UNKNOWN stores `latestDigest undefined` + mapper unknown; `getContainerUpdateStates` uses `resolveLocalDigest` (undefined) → cache as unknown; refresh `updateTag` purges | ✅ COMPLIANT |
|  | ESC-05c Poison window bounded by updateTag | Static: same `updateTag(CACHE_TAGS.registry)` purge (ESC-05) | ✅ COMPLIANT |
| **inventory-cache / REQ-04 — Registry checks con cacheTag** | ESC-07 Registry dentro de TTL (cached unknown served, refresh forces re-check) | Static: `registry-updates.ts:372-399` `'use cache'` + `cacheTag(registry:checks)` + `cacheLife` (no `next: revalidate`) — GHCR parity identical | ✅ COMPLIANT |
|  | ESC-07b Unknown not cached as updated (GHCR parity — latestDigest undefined, unknown) | `registry-updates.test.ts > B-10 > GHCR parity` proves `latestDigest undefined` + `unknown`; static GHCR `checkGhcrUpdate` same cache wrapper | ✅ COMPLIANT |

**Compliance summary**: 21/21 scenarios compliant (all have passing covering tests or deterministic static evidence for cache/404 paths; runtime registry fetch paths mocked in tests)

### Correctness (Static Evidence)

| Requirement | Status | Notes |
|-------------|--------|-------|
| Image Reference Parsing (B-05) | ✅ Implemented | `parseImageReference` handles `host:port` + `@sha256`, replaces `split(':')`; `rg split(':')` → 0 in registry-updates.ts; `originalRepo` retained for 404 + dockerHubUrl |
| Local Digest Resolution (B-01) | ✅ Implemented | `resolveLocalDigest` in `image-name.ts:43-47` = `RepoDigests[0]?.split('@')[1]`; shared by `registry-updates.ts:431` + `notification-service.ts:67`; no ImageID fallback (verified `rg ImageID` only finds `img.Id` lookup) |
| Explicit Unknown Domain (B-10) | ✅ Implemented | Hub `167-178` + GHCR `310-321` guard `state === UNKNOWN_TAG_STRATEGY` → `latestDigest undefined, lastUpdated undefined, latestVersion tag`; mapper `440-446` `isLocal?local:latestDigest?available:updated:unknown` never renders green when undefined |
| Candidate-Based Year Guard (B-13) | ✅ Implemented with deviation | `engine.ts:110-113` filters `t.ver.major >2000` (broadened from design `>2000 && parts===1`); satisfies `16-alpine vs 2024.0` (parts=2) spec scenario; see WARNING |
| 404 Classification | ✅ Implemented | Hub `128-130` `!originalRepo.includes('/')` → local only for simple names; GHCR `229-230` same; preserves pre-fix contract |
| Cache key distinct undefined | ✅ Implemented | `checkImageUpdate(name, localDigest?:string)` + `checkGhcrUpdate` same — Next `use cache` args distinguish undefined vs string; ESC-05b miss on pull proven statically |
| updateTag revalidate | ✅ Implemented | `dashboard-gate.tsx:29-35` `for (tag of REFRESH_TAGS) updateTag(tag)` covers all 4 tags including `registry:checks`; `CACHE_TAGS` single source in `cache-tags.ts` |
| GHCR parity | ✅ Implemented | GHCR UNKNOWN guard identical to Hub; same mapper; same cache wrapper |
| Proxy stripping | ✅ Implemented | `lscr.io/` + `docker.hyperdx.io/` stripped before `parseImageReference` but after originalRepo capture; classification still uses originalRepo |

### Coherence (Design)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| Image reference parsing via parseImageReference | ✅ Yes | Exact design choice; trades split for tested parser |
| Local digest via resolveLocalDigest()->undefined shared | ✅ Yes | Single source fixes dashboard+scheduler |
| Unknown domain — skip remoteTags[0], latestDigest undefined | ✅ Yes | Guard in both Hub and GHCR branches + mapper |
| Year guard candidate-based | ⚠️ Broadened | Design: `t.major>2000 && t.parts===1`; Impl: `t.major>2000` (drops parts check) to cover `2024.0` (parts=2) per spec scenario; documented in apply-progress |
| Cache key string|undefined distinct + use cache + cacheTag + cacheLife + updateTag(REFRESH_TAGS) | ✅ Yes | Matches design; key via args, TTL 900/3600 |
| File changes (registry-updates, engine, image-name, notification-service, tests) | ✅ Yes | All files in design File Changes table touched; cache-tags referenced no-change as designed |

### Issues Found

**CRITICAL**: None

**WARNING**:
- W1 — `openspec/changes/fix-verdict-cache/tasks.md` checkboxes remain unchecked despite 18/18 tasks implemented (commits 1e03bb0 + 22ce14f, 90/90 tests). Triage: tick tasks or archive will carry unchecked state. Not code-blocking but breaks SDD task completeness signal.
- W2 — Year guard broadened: spec `t.ver.major>2000 && t.ver.parts===1` and design `parts===1` would NOT filter `2024.0` (parts=2), yet spec scenario requires `2024.0` filtered. Implementation `t.ver.major>2000` (no parts gate) satisfies the scenario but could over-filter legitimate year-versioned products with 2-part versions. Apply-progress documents this as intentional with allowlist as future mitigant; monitor per design Open Questions.
- W3 — `pnpm test` wrapper fails on `pnpm approve-builds` (exit 1 before vitest) while `npx vitest run` (authoritative runner per config `runner_command: pnpm test`, runner: vitest) passes. CI using `pnpm test` will red unless `pnpm approve-builds` is acknowledged. Not a code defect but a runner UX issue.
- W4 — Biome lint 4 warnings (`style/noNonNullAssertion` in `registry-updates.test.ts:13-16` `fn!` guards for dynamic import). Acceptable per apply-progress; no errors. Could be silenced with `// biome-ignore`.

**SUGGESTION**:
- S1 — Consider adding explicit unit tests for `B-01` absent-digest cache-as-unknown and `ESC-05c` poison-window purge by asserting `checkImageUpdate` second call within TTL returns cached `unknown` (mock fetch count) then `updateTag` simulation forces re-fetch. Currently covered statically but not runtime-proven.
- S2 — Tick tasks.md and ensure apply-progress TDD Cycle Evidence structured table for strict-TDD audit tooling to parse automatically in future changes.
- S3 — Document year guard deviation (major >2000 regardless of parts) in design.md Open Questions resolution or as spec amendment for next delta, to avoid reintroducing `parts===1` on a future revert.

### Verdict

**PASS WITH WARNINGS** — 21/21 scenarios compliant, 90/90 tests pass, build passes, all 5 design decisions followed (one broadened intentionally to satisfy spec). Warnings are documentation/strictness items (unchecked tasks.md, year guard broadening, pnpm wrapper UX, biome style warnings) with no failing or untested required scenarios. Safe to archive; address W1-W4 as cleanup before or during archive.

### Next Recommended

archive

### Risks

- Cache poisoning window bounded but still 900s if user never triggers refresh and stale unknown lingers — mitigated by TTL expiry and refresh gate proven (W2 notes over-filter low likelihood).
- Year guard over-filter for legitimate year-versioned images (e.g. product versioning `2024.0` as real semver) — allowlist noted as future work in design Open Questions.
- Simple-name 404 `nginix` intentionally stays `local` (no slash) per spec — if later spec wants `unknown` for all 404s, classification will need revisiting.

### Skill Resolution

fallback-path — loaded `C:\Users\USER\.config\opencode\skills\sdd-verify\SKILL.md` via SKILL: Load directive, plus `_shared/sdd-phase-common.md`, `references/report-format.md`, and `strict-tdd-verify.md` (Strict TDD active, runner vitest). No `skill-registry` search needed (orchestrator provided explicit path).

