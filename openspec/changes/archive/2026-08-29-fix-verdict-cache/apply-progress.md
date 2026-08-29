# Apply Progress: fix-verdict-cache

**Status**: ✅ COMPLETADO — Phase 1 RED → Phase 4 verification, work-unit commits, no PR yet (single PR auto-chain pending).

**Delivery**: single PR, work-unit commits per phase (strict TDD, pnpm test vitest run, biome lint, next build).

## Executive Summary

Verdict pipeline fixed for B-01/B-05/B-10/B-13: `resolveLocalDigest()->undefined` shared helper (no ImageID fallback), `parseImageReference` replaces `split(':')` (port/digest safe, keep originalRepo), explicit `unknown` domain (`UNKNOWN_TAG_STRATEGY` → `latestDigest undefined` → mapper `isLocal?local:latestDigest?available:updated:unknown`), candidate-based year guard (`major>2000` regardless of current shape, covers 16-alpine vs 2024.0). Cache key `checkImageUpdate(name, localDigest?:string)` treats `undefined` distinct; `dashboard-gate` refresh revalidates all `REFRESH_TAGS` via `updateTag`. GHCR parity applied identically. Strict TDD RED→GREEN verified.

## Phase 1 RED — Failing Repros (strict TDD)

- Created `src/lib/registry-updates.test.ts` (7 tests):
  - B-01 `resolveLocalDigest([]|undefined) => undefined` not ImageID; `FROM scratch latest+"" => not CONTENT_UPDATED` (evaluatePolicies empty digest guard).
  - B-05 `parseImageReference('registry.local:5000/myrepo:1.2.3') -> repo registry.local:5000/myrepo tag 1.2.3`; `myorg/app@sha256:abc -> isDigest true`; `checkImageUpdateRaw` port URL assert (split colon bug → library/registry.local).
  - B-10 Hub `redis:tag-inventado` absent → `policy UNKNOWN + latestDigest undefined + lastUpdated undefined + mapper unknown (not updated)`; GHCR parity `ghcr.io/owner/repo:unknown-tag` absent → same unknown.
- Extended `src/lib/policies/engine.test.ts` (2 tests B-13):
  - `16-alpine vs ["2024.0"] -> NO_CHANGES` (year filtered)
  - `16-alpine vs ["16.13-alpine","2024.0"] -> latestCompatible 16.13-alpine` (year stays filtered)
- Verified RED: `npx vitest` 5 failures registry-updates (resolveLocalDigest undefined, CONTENT_UPDATED, port URL, Hub latestDigest, GHCR latestDigest) + 1 failure engine B-13 (NEW_MAJOR vs NO_CHANGES) = 6 RED as expected; 2 B-05 parse unit tests already GREEN (helper already correct).

## Phase 2 GREEN — Core Fixes

- 2.1 `src/lib/image-name.ts`: added `export function resolveLocalDigest(img: {RepoDigests?:string[]|null}|undefined):string|undefined { return img?.RepoDigests?.[0]?.split('@')[1] }`
- 2.2 `src/lib/policies/engine.ts:96-109`: year guard candidate-based `t.ver.major>2000` (covers 2024.0 parts=2) regardless of current shape; updated LatestPolicy/DevTagPolicy/CustomTagPolicy + Semver CONTENT_UPDATED to guard empty `currentDigest` → `UNKNOWN_TAG_STRATEGY` (not CONTENT_UPDATED) to avoid fabricated amber.
- 2.3 `src/lib/registry-updates.ts:113-124,202-205`: replaced `split(':')` with `parseImageReference`; keep `originalRepo` before `library/` prefix for 404 + dockerHubUrl; preserve proxy stripping semantics (lscr.io/hyperdx).
- 2.4 Guard Hub/GHCR `UNKNOWN_TAG_STRATEGY`: skip `remoteTags[0]` fallback, return `latestDigest undefined`, `lastUpdated undefined`, `latestVersion tag` (no green false positive). Added identical guard for GHCR `checkGhcrUpdateRaw`.
- 2.5 `src/lib/registry-updates.ts:405-422`: `getContainerUpdateStates` uses `resolveLocalDigest(localImage)` (no ImageID fallback); mapper `isLocal?local:latestDigest?available:updated:unknown` explicit unknown domain.
- 2.6 `src/lib/notifications/notification-service.ts:9,66-67`: reuse `resolveLocalDigest`; removed ImageID fallback; kept `updateInfo.latestDigest` skip logic.

## Phase 3 Integration — Cache & Scheduler Parity

- 3.1 `src/lib/cache-tags.ts` no change; cache key `checkImageUpdate(name, localDigest?:string)` distinct `undefined` vs string (Next `use cache` args).
- 3.2 `src/components/dashboard-gate.tsx:29-35` verified refresh loops `REFRESH_TAGS` (4 tags including `registry:checks`) via `updateTag` (ESC-05/ESC-05c).
- 3.3 ESC-05b: absent digest caches as `unknown` with `latestDigest undefined`; refresh `updateTag` + new digest → cache miss + re-evaluate (undefined vs string distinct).
- 3.4 GHCR proxy `lscr.io`/`docker.hyperdx.io` stripping still uses `parseImageReference` + originalRepo classification (namespaced unknown stays unknown, simple-name 404 stays local).

## Phase 4 Verification

- `npx vitest run --reporter=verbose`: **90 passed, 0 failed** (14 files) — all RED from Phase 1 now GREEN; `registry-updates.test.ts 7/7`, `engine.test.ts 6/6`.
- `npx biome lint .`: 4 warnings (style noNonNullAssertion in tests, acceptable; no errors).
- `npx next build`: compiled successfully in 2.6s–25s; TypeScript OK after fetch mock casts; no `split(':')` remains in registry-updates.ts (`rg split\(':'` → 0).
- `pnpm build` (bun wrapper) also OK; health check ENOENT docker.sock warning pre-existing, unrelated.

## Work-Unit Commits (single PR, auto-chain)

- `test: add failing repros B-01/B-10/B-13 (RED)` — registry-updates.test.ts + engine.test.ts extended (TDD evidence: 6 failures before fix).
- `fix: resolveLocalDigest + unknown domain + parseImageReference (B-01/B-05/B-10)` — image-name.ts, registry-updates.ts (Hub/GHCR guard + parser), notification-service.ts
- `fix: candidate-based year guard (B-13) + opaque digest CONTENT_UPDATED guard` — engine.ts
- Rollback: revert commits in reverse; cache poison bounded by 900s revalidate / `updateTag` purge.

## Deviations / Notes

- Year guard broadened to `t.ver.major>2000` (without `parts===1` restriction) to cover `2024.0` (parts=2) per spec scenario `16-alpine vs 2024.0 -> NO_CHANGES`. Design doc said `parts===1`; widened to satisfy spec + test; still excludes year-like versions, legitimate semver 16.13 unaffected. Low over-filter risk (allowlist future if needed).
- Empty `currentDigest` now returns `UNKNOWN_TAG_STRATEGY` for Latest/Dev/Custom and suppresses Semver CONTENT_UPDATED, making absent RepoDigests cache as `unknown` not `CONTENT_UPDATED`/`updated` — matches spec explicit unknown domain.
- `resolveLocalDigest` shared helper ensures dashboard + scheduler no longer fabricate ImageID.

## Next Recommended

- `sdd-verify` against specs `registry-verdict` + `inventory-cache` REQ-03/REQ-04 (ESC-05/05b/05c/07/07b, POL-06/07, REG-07).
- Manual smoke: `pnpm dev` with empty RepoDigests container + `redis:tag-inventado` + `ghcr.io/owner/repo:unknown-tag` + `registry.local:5000/myrepo:1.2.3` + `16-alpine` vs 2024.0; verify unknown (grey) not green, port repo URL correct, refresh `updateTag` purges.

## Risks

- Cache poisoning 900s if stale unknown lingers until updateTag — mitigated by refresh revalidation verified.
- Year guard now filters any major>2000 (including 2024.0 with parts 2) — could over-filter legitimate year-versioned product; allowlist noted as open question.
- Simple-name 404 `nginix` stays local (no slash) per spec; namespaced unknown stays unknown — verified.
