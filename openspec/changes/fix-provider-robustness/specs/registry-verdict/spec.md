# Delta for Registry Verdict

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
