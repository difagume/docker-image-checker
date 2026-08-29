# Proposal: fix-verdict-cache

## Intent

Fix 3 pipeline verdict bugs on `4bdc083`: **B-01 (#13)** `ImageID` fallback -> perpetual `CONTENT_UPDATED`; **B-10 (#22)** `UNKNOWN`+`remoteTags[0]` -> green `updated`; **B-13 (#25)** guard `parts>=2` misses `16-alpine` -> `2024.0` major. Source: `sdd/fix-verdict-cache/explore` (engram + `openspec/changes/fix-verdict-cache/exploration.md`), `bug-triage.md`, `verification/pipeline.md` REG-07/POL-06/POL-07.

## Scope

### In Scope
- `parseImageReference` replaces `split(':')` (closes B-05).
- `resolveLocalDigest()` helper; drop `ImageID` fallback (`registry-updates.ts:378-382`, `notification-service.ts:66-71`).
- UNKNOWN explicit: no `remoteTags[0]`, `latestDigest=undefined` -> `unknown` (Hub+GHCR).
- Year guard candidate-based `t.ver.major>2000&&t.ver.parts===1`.
- Strict-TDD repros before fixes.

### Out of Scope
- Auth + remote `DOCKER_HOST` (`tcp`/`https`/`ssh`, TLS/SSH).
- `src/lib/i18n/`.
- Providers, `ghcrError` drop (B-09), `library/` (B-11).

## Capabilities

> Contract for sdd-spec.

### New Capabilities
- `registry-verdict`: 5-state chain, typed absent digest, `unknown` vs `updated`/`local`, candidate-based year guard.

### Modified Capabilities
- `inventory-cache` (REQ-03/REQ-04): absent `RepoDigests` MUST NOT emit `CONTENT_UPDATED`/`updated`; cache as `unknown` until `updateTag`.

## Approach

**Primary: Approach 2 — Robust redesign** (explore Rec). One source; `parseImageReference`; explicit `unknown`.

- `registry-updates.ts:113-119` -> `parseImageReference` (keep `originalRepo` for `library/`+404).
- `resolveLocalDigest()->undefined` if empty `RepoDigests`; mapper `391-396`: `isLocal?local:latestDigest?available/updated:unknown`.
- Hub `167-173` + GHCR `288-289`: skip `remoteTags[0]` when `UNKNOWN`.
- `engine.ts:100-109`: `t.ver.major>2000&&t.ver.parts===1` (candidate-based).
- Shared helper fixes scheduler too.

**Fallback >400 lines:** 2 chained PRs -> PR-1 B-01+B-10 (<100+3 tests), PR-2 B-13+B-05 (<80).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/lib/registry-updates.ts` | Modified | Parser, digest, UNKNOWN guard, mapper |
| `src/lib/policies/engine.ts` | Modified | `parseSemver`, year guard, UNKNOWN contract |
| `src/lib/image-name.ts` | Modified | Reuse `parseImageReference` |
| `src/lib/notifications/notification-service.ts` | Modified | Shared helper (scheduler no-cache) |
| `src/lib/policies/engine.test.ts` | Modified | Year cases |
| `src/lib/registry-updates.test.ts` | New | TDD: absent digest, custom tag UNKNOWN |
| `src/lib/cache-tags.ts` | Referenced | `CACHE_TAGS.registry` / `REFRESH_TAGS` |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Cache poisoning 900s | High | Verify `dashboard-gate.tsx` `updateTag` |
| `nginix` typo reclassified | Med | No-slash 404 -> `local`; else `unknown` |
| GHCR parity missed | Med | Patch both + test |
| Year over-filter | Low | Document; allowlist |
| Scheduler forgotten | High | Shared helper |
| TDD violation | Med | Tests-first |

## Rollback Plan

Revert commit(s); returns to `ImageID` + `remoteTags[0]` + `parts>=2`. Cache expires 900s or `refreshData()` `updateTag`. No migrations.

## Dependencies

- Vitest 4.1.10 (`pnpm test`), Biome; no new deps.
- `parseImageReference` tested (`image-name.test.ts:21-46`).

## Success Criteria

- [ ] `redis:tag-inventado`/`nginx:b01latest` -> `unknown` (REG-07/POL-06).
- [ ] `FROM scratch` without `RepoDigests` -> no `CONTENT_UPDATED` (B-01).
- [ ] `difagume/year-bug-test:16-alpine` vs `2024.0` -> no `majorAvailable` (POL-07).
- [ ] `host:5000/repo:tag` and `image@sha256:…` parse OK (B-05).
- [ ] Repros first, then green; `pnpm build`/`biome lint` pass; <400 or 2 PRs.
