# Registry Verdict Specification

## Purpose

Deterministic pipeline that parses image references, resolves local digests without fabrication, evaluates 5 policy states, and maps to 4 UI statuses with an explicit `unknown` domain and candidate-based year guard. Closes B-01, B-05, B-10, B-13.

## Requirements

### Requirement: Image Reference Parsing

The system MUST parse image references via `parseImageReference` (covers `host:port/repo:tag` and `name@sha256:digest`) and MUST NOT use naive `split(':')` for repo/tag. `originalRepo` before `library/` prefixing MUST be retained for 404 classification and `dockerHubUrl`.

#### Scenario: Registry port reference

- GIVEN image `registry.local:5000/myrepo:1.2.3`
- WHEN `parseImageReference` is called
- THEN `repository` is `registry.local:5000/myrepo` and `tag` is `1.2.3`

#### Scenario: Digest-pinned reference

- GIVEN image `myorg/app@sha256:abc123`
- WHEN parsing
- THEN `isDigest` is true and `tag` is `sha256:abc123`

#### Scenario: Bare name defaults to latest

- GIVEN image `nginx`
- WHEN parsing
- THEN tag is `latest` and repository is `nginx`

#### Scenario: Proxied registries preserve original

- GIVEN image `lscr.io/linuxserver/nginx:latest`
- WHEN Hub request is built
- THEN stripped repo `linuxserver/nginx` is fetched but 404 logic uses original `lscr.io/linuxserver/nginx`

### Requirement: Local Digest Resolution

The system MUST resolve `localDigest` exclusively via `resolveLocalDigest(image)` → `RepoDigests[0]?.split('@')[1]` or `undefined` when absent; it MUST NOT fallback to `container.ImageID`. The helper MUST be shared by `registry-updates.ts` and `notification-service.ts`.

#### Scenario: Empty RepoDigests yields undefined

- GIVEN `localImage.RepoDigests` is `[]` or `undefined`
- WHEN `resolveLocalDigest` is called
- THEN result is `undefined` and `checkImageUpdate(image, undefined)` is invoked

#### Scenario: No fabricated CONTENT_UPDATED

- GIVEN a `FROM scratch` image with no `RepoDigests` and `currentTag=latest`
- WHEN `evaluatePolicies` runs with `currentDigest=""`
- THEN result MUST NOT be `CONTENT_UPDATED`

### Requirement: Explicit Unknown Domain

When `evaluatePolicies` returns `UNKNOWN_TAG_STRATEGY`, the system MUST NOT fallback to `remoteTags[0]`; it MUST leave `latestDigest` and `lastUpdated` as `undefined`. The mapper `isLocal ? local : latestDigest ? hasUpdate?available:updated : unknown` MUST emit `unknown`. Hub and GHCR branches MUST apply the guard identically.

#### Scenario: Custom tag absent paints unknown (Hub) — B-10

- GIVEN `redis:tag-inventado` with `remoteTags` not containing `tag-inventado`
- WHEN Hub check completes
- THEN `policy.state` is `UNKNOWN_TAG_STRATEGY`, `latestDigest` is `undefined`, `updateStatus` is `unknown`

#### Scenario: GHCR parity

- GIVEN `ghcr.io/owner/repo:unknown-tag` absent from GHCR versions
- WHEN GHCR check completes
- THEN `latestDigest` is `undefined` and `updateStatus` is `unknown` (identical to Hub)

#### Scenario: Undefined digest never renders green

- GIVEN result with `latestDigest=undefined` and `isLocal=false`
- WHEN status mapper runs
- THEN `updateStatus` is `unknown`, never `updated` or `available`

### Requirement: Candidate-Based Year Guard

The system MUST filter candidates where `t.ver.major > 2000 && t.ver.parts === 1` regardless of `currentVer.parts`. Filtering is per candidate, not per current shape.

#### Scenario: Single-segment pin blocks year major — B-13

- GIVEN `currentTag=16-alpine` (`parts=1, major 16`) and remote `["2024.0"]`
- WHEN `evaluateSemverPolicy` runs
- THEN `2024.0` is excluded and result is `NO_CHANGES`

#### Scenario: Legitimate compatible still surfaces

- GIVEN `currentTag=16-alpine` and remote `["16.13-alpine","2024.0"]`
- WHEN evaluation runs
- THEN `latestCompatible` is `16.13-alpine` and `2024.0` stays filtered

### Requirement: 404 Classification and Scheduler Parity

Docker Hub 404 MUST map to `isLocal=true` only when `originalRepo` contains no `/`; otherwise it MUST be `unknown`. The scheduler (`notification-service.ts`) MUST reuse `resolveLocalDigest` and the unknown guard.

#### Scenario: Simple-name typo remains local

- GIVEN Hub returns 404 for `nginix` (no slash)
- WHEN classified
- THEN `isLocal=true` and `updateStatus=local`

#### Scenario: Namespaced unknown is not local

- GIVEN Hub returns 404 for `myorg/missing:custom`
- WHEN classified
- THEN `isLocal=false`, `latestDigest=undefined`, `updateStatus=unknown`

#### Scenario: Scheduler shares helper

- GIVEN scheduler checks a container with empty `RepoDigests`
- WHEN `checkAndNotify` resolves digest
- THEN it calls `resolveLocalDigest` and skips notify when `latestDigest` is `undefined`
## ADDED Requirements

### Requirement: Transient Failure Distinction

When a registry check fails due to a transient condition — request timeout, HTTP rate-limit response, or network error — the check result MUST carry a distinct transient verdict, classified in the error handling path of each registry branch (Docker Hub and GHCR alike). A transient verdict MUST NOT be collapsed into the generic `unknown` status or into the not-found classification. The 404 classification rules pinned in this spec MUST be unchanged: 404 handling remains not-found, never transient.

#### Scenario: Registry timeout surfaces transient

- GIVEN a Docker Hub or GHCR request that exceeds its timeout
- WHEN the check completes via the error path
- THEN the result carries a transient verdict (not `unknown`, not not-found)
- AND the corresponding container status is rendered as a distinct transient state in the UI

#### Scenario: Rate limit surfaces transient

- GIVEN the registry responds with a rate-limit (HTTP 429) failure
- WHEN classified
- THEN the verdict is transient

#### Scenario: Network error surfaces transient

- GIVEN a DNS/connection failure against the registry
- WHEN classified
- THEN the verdict is transient

#### Scenario: 404 not-found behavior unchanged

- GIVEN Hub returns 404 for `myorg/missing:custom`
- WHEN classified
- THEN the verdict follows the existing 404 rules (namespaced → unknown), NOT transient

#### Scenario: Transient result cached like other results

- GIVEN a transient verdict was produced for an image
- WHEN the cached result is read within the cache lifetime
- THEN the transient verdict is preserved with the same TTL and cache tags as other verdicts
