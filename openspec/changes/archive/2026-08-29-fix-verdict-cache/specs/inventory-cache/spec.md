# Delta for inventory-cache

## MODIFIED Requirements

### Requirement: REQ-03 — Tags de invalidación y refresh read-your-writes

Wrappers MUST tag with `cacheTag`: `docker:containers`, `docker:images`, `docker:connection`, and `registry:checks`. The refresh action MUST invalidate all 4 tags via `updateTag` (Next 16) to guarantee read-your-writes for inventory and registry verdicts. The cache key for `registry:checks` MUST include `localDigest` where `undefined` (absent `RepoDigests`) is distinct from any string digest; absent digests MUST cache as `unknown` (with `latestDigest=undefined`) until `updateTag`, and MUST NOT emit `CONTENT_UPDATED` or `updated`.
(Previously: tags/refresh without absent-digest semantics; cache key did not distinguish absent digest and could cache fabricated ImageID as CONTENT_UPDATED/updated)

#### Scenario: ESC-05 — Refresh read-your-writes

- GIVEN inventory and registry checks cached
- WHEN user triggers refresh (server action)
- THEN action invalidates the 4 tags with `updateTag`
- AND next render re-queries daemon and registry and shows fresh data

#### Scenario: ESC-06 — Actualización del registry

- GIVEN remote digest of an image changed on Docker Hub/GHCR/proxy
- WHEN registry check runs (refresh invalidated `registry:checks` or TTL expired)
- THEN verifiable update status reflects new digest with same tags

#### Scenario: ESC-05b — Absent digest cached as unknown, recoverable on refresh (B-01/B-10)

- GIVEN container with empty `RepoDigests` cached as `unknown` with `latestDigest=undefined`
- WHEN user pulls image (new digest appears) and triggers refresh (`updateTag(registry:checks)`)
- THEN cache key miss (`undefined` vs new string) forces fresh fetch and status re-evaluates correctly

#### Scenario: ESC-05c — Poison window bounded by updateTag (cache poisoning mitigation)

- GIVEN a stale `unknown` cached for 900s revalidate
- WHEN refresh calls `updateTag(CACHE_TAGS.registry)`
- THEN stale entry is purged without waiting for expiry

### Requirement: REQ-04 — Registry checks con cacheTag

Registry fetches MUST NOT use `next: { revalidate: 900 }` and MUST run inside `"use cache"` with `cacheTag('registry:checks')` and explicit `cacheLife` (`revalidate≈900` / `expire≤3600`). Existing GHCR/PAT and proxy-registry support (lscr.io, hyperdx) MUST be preserved. When policy is `UNKNOWN_TAG_STRATEGY`, the cached value MUST store `latestDigest=undefined` so consumers render `unknown` (shared with `registry-verdict`).

(Previously: registry cache without explicit unknown domain; absent tags could be cached with fabricated remoteTags[0] digest)

#### Scenario: ESC-07 — Registry dentro de TTL

- GIVEN registry check cached at T0 with `latestDigest` or `undefined` for unknown
- WHEN another check occurs within TTL and same `localDigest` key
- THEN cached result (including `unknown`) is served without hitting registry
- AND refresh invalidates tag and forces real re-check

#### Scenario: ESC-07b — Unknown not cached as updated (GHCR parity)

- GIVEN GHCR image with custom tag absent from remote
- WHEN cached under `registry:checks`
- THEN entry stores `latestDigest=undefined` and `updateStatus=unknown`, identical to Hub
