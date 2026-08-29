# Exploration: fix-verdict-cache

## Current State

The dashboard resolves container update verdicts in two layers: `src/lib/registry-updates.ts` fetches remote candidates (Docker Hub `GET /v2/repositories/{repo}/tags?page_size=70` or GHCR `/packages/container/{pkg}/versions`) and `src/lib/policies/engine.ts` evaluates them via a 4-policy chain (`LatestPolicy` -> `SemverPolicy` -> `DevTagPolicy` -> `CustomTagPolicy`) into 5 states (`NO_CHANGES`, `CONTENT_UPDATED`, `NEW_COMPATIBLE_VERSION_AVAILABLE`, `NEW_MAJOR_VERSION_AVAILABLE`, `UNKNOWN_TAG_STRATEGY`). The result is cached with `cacheLife` 900s/3600s under `registry:checks` (key includes `localDigest`) and mapped in `getContainerUpdateStates()` to UI `updateStatus` (`available`/`updated`/`unknown`/`local`).

Three bugs in this slice share the verdict path and were confirmed live on `4bdc083` (see `product-description/bug-triage.md` B-01/B-10/B-13 and `verification/pipeline.md` REG-07/POL-06/POL-07):

- **B-01 (#13) — Fabricated localDigest:** `getContainerUpdateStates()` at `registry-updates.ts:378-382` and the same pattern in `notification-service.ts:66-71` falls back to `container.ImageID` when `RepoDigests` is empty (locally-built, `docker load`, `FROM scratch` images). `evaluatePolicies` then compares that config hash against manifest digests — never equal — so `CONTENT_UPDATED` fires permanently. Live repro: `nginx` built `FROM scratch` pinned to `latest` shows perpetual amber `CONTENT_UPDATED`.

- **B-10 (#22) — UNKNOWN paints green:** `evaluateCustomTagPolicy` (`engine.ts:196-208`) returns `UNKNOWN_TAG_STRATEGY` with no `details`. Callers at `registry-updates.ts:167-173` (and GHCR `288-289`) compute `targetTag = details.latestCompatible || majorAvailable || tag` -> original tag (absent from remoteTags) -> `targetRemote = remoteTags.find(...) || remoteTags[0]` (arbitrary first entry) and publish its `digest`/`publishedAt`. The mapper at `391-396` (`if isLocal -> local; else if latestDigest -> hasUpdate? available:updated`) then sees a present digest + `hasUpdate=false` -> `updated` (green). Live repro: `redis:tag-inventado` and `nginx:b01latest` render green `Updated`.

- **B-13 (#25) — Year guard disabled for single-segment pins:** `SemverPolicy` guard at `engine.ts:100-109` filters year-like majors only when `currentVer.parts >= 2 && currentVer.major < 1000 && t.ver.major > 2000 && t.ver.parts === 1`. `parseSemver("16-alpine")` yields `major=16, suffix=-alpine, parts=1` (only `match[1]` present), so the guard is off and `2024.0` (`parts=2`) passes as `NEW_MAJOR_VERSION_AVAILABLE`. Verified directly: `difagume/year-bug-test:16-alpine` vs only `2024.0` -> violet `majorAvailable:2024.0`; with `16.1` present the compatible path hides it but the bug persists.

Collateral context in this cluster: `registry-updates.ts:113-119` uses naive `imageName.split(':')` (breaks `host:5000/repo` and `image@sha256:...`) while `src/lib/image-name.ts:14-36` `parseImageReference` already handles ports/digests correctly (tested in `image-name.test.ts:21-46`); `dockerHubUrl` at `:181` interpolates `library/` into the URL (B-11); GHCR `ghcrError` is produced but dropped at `dashboard-content.tsx:51-65` (B-09, out of this slice but same caller).

Tests: only `src/lib/policies/engine.test.ts` (4 tests — suffix-disambiguation for `dockhand`/`valkey`/`redis`/`postgres` 16-alpine). No coverage for `registry-updates`, `notification-service`, `image-name` unknown paths, or the three bugs — strict TDD requires new repro tests first (`pnpm test` = `vitest run`).

## Affected Areas

- `src/lib/registry-updates.ts` — core of all three bugs: `split(':')` parsing (113-119), `targetRemote` fallback (167-173, 288-289), `ImageID` fallback (378-382), and status mapper (391-396); also GHCR raw path and cache wrappers.
- `src/lib/policies/engine.ts` — `parseSemver` parts counting (6-17), year guard (100-109), and `UNKNOWN_TAG_STRATEGY` details contract (196-208).
- `src/lib/image-name.ts` — canonical `parseImageReference` (14-36) that `registry-updates` should reuse; `withTag` sibling.
- `src/lib/notifications/notification-service.ts` — duplicates the `ImageID` fallback (66-71) and the `hasUpdate`/`latestDigest` gating (79-86); shares the B-01 surface with the scheduler (outside request context, uses raw check).
- `src/lib/policies/engine.test.ts` — existing semver regression suite; base for new TDD cases for B-13 (year guard) and indirectly B-10.
- `src/components/dashboard-content.tsx` / `src/lib/registry-updates.ts:34-52` types — mapper’s contract for `unknown` vs `updated` vs `local`; interacts with `notification-service`’s suppressed `ghcrError`.
- `src/lib/cache-tags.ts` / `src/lib/docker-inventory.ts` — cache key includes `localDigest`; changing B-01’s absent-digest semantics affects hit/miss behavior after pull.

## Approaches

1. **Minimal targeted patches (fix at each callsite)** — Keep current contracts, patch exactly the three lines in scope.

   - B-01: Remove `if (!localDigest) localDigest = container.ImageID` in both `registry-updates.ts:380-381` and `notification-service.ts:70-71`; pass `undefined`/empty `currentDigest` instead. Caller then skips digest comparison or the registry path treats absence as `unknown`/`local` (for simple-name 404 as local, else unknown). Optionally extract a shared `resolveLocalDigest(image, container)` helper to deduplicate.
   - B-10: After `evaluatePolicies`, guard the `targetRemote` fallback: if `policyResult.state === 'UNKNOWN_TAG_STRATEGY'` then `latestDigest/ lastUpdated` stay `undefined` and `latestVersion` stays the original tag; mapper at `391-396` then falls to `else -> unknown` (no green). Patch both Hub and GHCR branches identically.
   - B-13: Relax guard to `currentVer.parts >= 1` (or drop `parts` check and filter solely on candidate: `t.ver.major > 2000 && t.ver.parts === 1` when year-like) so `16-alpine` is protected. One-line change at `engine.ts:103`.
   - Pros: Lowest line count, fits 400-line budget easily; each bug maps to one diff hunk; easy to review; no API shape changes; strict-TDD repro tests are tiny.
   - Cons: Leaves `split(':')` tech debt (B-05) unaddressed; dulicated digest-resolution logic remains unless helper is added; year guard still heuristic (single-part year vs semver with suffix disambiguation).
   - Effort: Low

2. **Robust verdict redesign (use canonical parser + explicit unknown domain)** — Fix the cluster, not just the symptoms.

   - Replace `imageName.split(':')` at `registry-updates.ts:113-114` with `parseImageReference(imageName)` (already handles `@sha256:...` and `host:5000/repo`; proven by `image-name.test.ts`). Preserve `originalRepo` for the `library/` prefix and 404 classification so B-05/B-11 are closed together.
   - Redefine absent `RepoDigests` as typed absence: `resolveLocalDigest` returns `undefined`; `ImageContext.currentDigest` is `''` only when truly unknown. Adjust `LatestPolicy`/`CustomTagPolicy` to return `UNKNOWN_TAG_STRATEGY` or `NO_CHANGES` with clear semantics when `currentDigest === ''` (no false CONTENT_UPDATED), and make the mapper propagate `unknown` when `latestDigest` is absent rather than fabricating from `remoteTags[0]`. This makes B-01 and B-10 use one truth source.
   - Fix year guard based on candidate, not current: `if (t.ver.major > 2000 && t.ver.parts === 1)` regardless of `currentVer.parts`, with optional allowlist for repos that legitimately version by year. Covers `16-alpine` and `3` single-segment pins.
   - Pros: Closes B-05 alongside B-01/B-10/B-13; single helper for digest resolution eliminates duplication between `registry-updates` and `notification-service`; explicit unknown domain fixes the green lie at the type level; guard becomes correct for all single-segment pins.
   - Cons: Touches more files (import `parseImageReference`, change 404/library handling, GHCR parity); mapper semantics change needs contract check against notification dedup (`imageDigest`); slightly larger review.
   - Effort: Medium

3. **Conservative engine-only fix (least dashboard churn)** — Put all logic in `engine.ts`, keep `registry-updates.ts` fetching untouched.

   - Engine returns `details: undefined` for UNKNOWN and an extra flag `compared: false` to signal no comparison was possible; engine also internally treats empty `currentDigest` as `UNKNOWN` rather than `CONTENT_UPDATED`. Dashboard `targetRemote` unchanged but a single `if (state === UNKNOWN)` branch skips `remoteTags[0]`. Year guard relaxed to `parts >= 1` inside engine only.
   - Pros: Single-file risk (engine is already unit-tested, no cache/parser interaction); satisfies B-10/B-13 without touching the cached `getContainerUpdateStates` flow.
   - Cons: Leaves the false `localDigest = ImageID` fabrication alive — B-01’s root cause remains, and the scheduler path still fabricates; `split(':')` debt remains; B-10 fix is incomplete if raw callers ignore the new flag.
   - Effort: Low

## Recommendation

**Approach 2 (Robust verdict redesign) as primary, with Approach 1 as the minimal slice if review budget forces a split.**

Rationale: B-01/B-10/B-13 share one pipeline and one cached key; patching only the callsite for one leaves the others reproducible via the scheduler or via a port-pinned registry. Reusing `parseImageReference` (existing, tested, documented for exactly this failure) removes the naive split at negligible cost and closes B-05 for free. Making absent `RepoDigests` an explicit `unknown` domain at the mapper (`latestDigest` stays undefined) is the only way to stop the `remoteTags[0]` fallback from painting green — an engine-only flag would be ignored by raw callers. Relaxing the year guard to candidate-based (`t.ver.major > 2000 && t.ver.parts===1`) fixes the single-segment pin hole that verification hit (`16-alpine` -> 2024.0) without reintroducing false positives for legitimate `16.1` majors.

If the tasks forecast exceeds the 400-line `additions+deletions` budget, deliver as two chained PRs: PR-1 = B-01+B-10 (digest/unknown, Approach 1 shape, <100 lines + 3 TDD tests), PR-2 = B-13+B-05 (parser + guard, also <80 lines). This preserves strict-TDD order (write failing tests for each bug before fixing) and keeps each PR under the guard while still converging to Approach 2’s state.

## Risks

- **Cache poisoning on unknown:** Bad results are cached 900s. After fixing B-01/B-10 to emit `unknown` rather than `CONTENT_UPDATED`/`updated`, stale green/amber entries will linger until `updateTag(CACHE_TAGS.registry)` is triggered. Manual refresh must be validated to revalidate the registry tag (already in `dashboard-gate.tsx` REFRESH_TAGS).
- **Local vs remote unknown ambiguity:** Simple name `nginix` typo (no slash, 404) currently maps to `isLocal=true` (B-05 note: typo disguised as intention). Changing to `unknown` for absent digests may reclassify typos; proposal must decide whether simple-name 404 stays `local` (current) or becomes `unknown`.
- **GHCR parity:** Both Hub and GHCR branches have the same `targetRemote` fallback; fixing Hub without GHCR reintroduces B-10 for `ghcr.io` images. Both must be patched identically and tested.
- **Year heuristic over-filter:** Candidate-based guard (`>2000 && parts===1`) could suppress a legitimate year-versioned product that versions as `2024.0`; proposal should document the heuristic as intentional and allow an allowlist if needed.
- **Scheduler outside request context:** `notification-service` runs `checkImageUpdateRaw` (no cache) with the same digest fallback. Forgetting this file leaves B-01 alive for notifications (duplicate warnings) even when the dashboard is fixed — both files must share the helper.
- **Strict TDD ordering:** Tests must be written before fixes (`engine.test.ts` additions for year guard, new `registry-updates.test.ts` for unknown/digest cases). Editing source before a failing test violates the project’s TDD contract.

## Ready for Proposal

Yes — scope is bounded to the verdict cache: `registry-updates.ts` + `engine.ts` + `image-name.ts` + `notification-service.ts` (plus `cache-tags`/`docker-inventory` for cache-key reasoning). Next phase is `sdd-propose` to lock intent, boundaries, rollback (revert to ImageID fallback + `remoteTags[0]`), and the TDD test plan (year guard with `16-alpine` vs `2024.0`/`16.1`, local image without `RepoDigests`, custom tag absent from remote). No additional exploration needed.

## Key Learnings

1. Fabricating localDigest from container ImageID guarantees CONTENT_UPDATED false positives because config hash never equals manifest digest.
2. Falling back to remoteTags[0] when evaluatePolicies returns UNKNOWN_TAG_STRATEGY paints unknown as green updated.
3. Semver year guard requiring currentVer.parts >= 2 disables protection for common single-segment pins like 16-alpine.
4. parseImageReference already handles registry ports and digest pinned references that naive split colon breaks.
5. ContainerUpdateState mapper at 391-396 conflates presence of latestDigest with verifiable freshness and needs explicit unknown handling.
