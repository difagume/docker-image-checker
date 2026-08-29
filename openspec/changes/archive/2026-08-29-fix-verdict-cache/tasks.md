# Tasks: fix-verdict-cache

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 300-350 |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR (optional 2-PR chain: PR1 B-01+B-10, PR2 B-13+B-05 if reviewer requests) |
| Delivery strategy | auto-chain |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | B-01+B-10 digest/unknown fix (registry-updates, image-name, notification-service) | PR 1 | `pnpm test src/lib/registry-updates.test.ts` | `pnpm dev` + container with empty RepoDigests / `redis:tag-inventado` | Revert `resolveLocalDigest` + UNKNOWN guard, cache expires 900s |
| 2 | B-13+B-05 year guard + parseImageReference port/digest | PR 2 | `pnpm test src/lib/policies/engine.test.ts` | `pnpm dev` + `difagume/year-bug-test:16-alpine` vs `2024.0` | Revert `engine.ts:100-109` + `parseImageReference` usage |

## Phase 1: RED — Failing Repros (strict TDD)

- [x] 1.1 Create `src/lib/registry-updates.test.ts` RED B-01: `resolveLocalDigest([]) => undefined` not `ImageID`; mock empty RepoDigests + `latest` -> assert no `CONTENT_UPDATED`
- [x] 1.2 RED B-10 Hub: `redis:tag-inventado` absent from `remoteTags` -> `policy UNKNOWN` + `latestDigest undefined` + `updateStatus unknown` (not `updated`)
- [x] 1.3 RED B-10 GHCR parity: `ghcr.io/owner/repo:unknown-tag` absent -> same `unknown` assertions as 1.2
- [x] 1.4 RED B-05 parse: `registry.local:5000/myrepo:1.2.3` -> repo `registry.local:5000/myrepo` tag `1.2.3`; `myorg/app@sha256:abc` -> `isDigest true`
- [x] 1.5 RED B-13 extend `src/lib/policies/engine.test.ts`: `16-alpine` vs `["2024.0"]` -> `NO_CHANGES`; `16-alpine` vs `["16.13-alpine","2024.0"]` -> `latestCompatible 16.13-alpine`

## Phase 2: GREEN — Core Fixes

- [x] 2.1 Add `export function resolveLocalDigest(img: ImageInfo|undefined): string|undefined` to `src/lib/image-name.ts` (`RepoDigests[0]?.split('@')[1]`)
- [x] 2.2 Fix `src/lib/policies/engine.ts:100-109` year guard to candidate-based `t.ver.major>2000 && t.ver.parts===1` (drop `currentVer.parts>=2` check)
- [x] 2.3 Fix `src/lib/registry-updates.ts:113-119,199` replace `split(':')` with `parseImageReference`; keep `originalRepo` before `library/` prefix for 404 + `dockerHubUrl`
- [x] 2.4 Guard `src/lib/registry-updates.ts:167-173` + `288-289` Hub/GHCR: if `UNKNOWN_TAG_STRATEGY` skip `targetRemote` fallback, leave `latestDigest/lastUpdated undefined`
- [x] 2.5 Fix `src/lib/registry-updates.ts:378-382,391-396` use `resolveLocalDigest` and mapper `isLocal?local:latestDigest?hasUpdate?available:updated:unknown`
- [x] 2.6 Fix `src/lib/notifications/notification-service.ts:66-71` reuse `resolveLocalDigest`; remove `ImageID` fallback; keep `updateInfo.latestDigest` skip logic

## Phase 3: Integration — Cache & Scheduler Parity

- [x] 3.1 Verify `src/lib/cache-tags.ts` no change; cache key `checkImageUpdate(name, localDigest?: string)` treats `undefined` distinct from string
- [x] 3.2 Verify `src/components/dashboard-gate.tsx:29-35` `refresh()` calls `updateTag` for all `REFRESH_TAGS` including `registry:checks` (ESC-05/ESC-05c)
- [x] 3.3 Assert ESC-05b: absent digest caches as `unknown` with `latestDigest undefined`; refresh `updateTag` + new digest -> cache miss + re-evaluate
- [x] 3.4 Verify GHCR proxy registries `lscr.io`/`docker.hyperdx.io` stripping still uses `parseImageReference` + originalRepo classification

## Phase 4: Verification & Cleanup

- [x] 4.1 Run GREEN: `pnpm test` (Vitest) — all RED from Phase 1 now pass; `pnpm test src/lib/policies/engine.test.ts src/lib/registry-updates.test.ts`
- [x] 4.2 Run `bunx biome lint .` and `pnpm build` pass; confirm no `split(':')` remains in `registry-updates.ts`
- [x] 4.3 Work-unit commits: commit 1 (B-01+B-10) + commit 2 (B-13+B-05) with TDD repro evidence; rollback = revert commits, cache 900s expiry
