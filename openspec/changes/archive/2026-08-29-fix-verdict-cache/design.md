# Design: fix-verdict-cache

## Technical Approach

Approach 2 from `exploration.md`: reuse `parseImageReference`, centralize `resolveLocalDigest()->undefined`, make `unknown` explicit (`latestDigest=undefined`), candidate-based year guard. `registry-updates.ts` fetches; `engine.ts` evaluates 5 states; mapper in `getContainerUpdateStates` emits 4 UI statuses. Cache `registry:checks` with `updateTag` revalidation. Maps to proposal intent and specs `registry-verdict` + `inventory-cache` REQ-03/REQ-04.

## Architecture Decisions

### Decision: Image reference parsing

| Option | Tradeoff | Decision |
|--------|----------|----------|
| `split(':')` | breaks `host:port`/`@sha256` | Rejected |
| `parseImageReference` (`image-name.ts`) | handles port/digest, tested, keep `originalRepo` | **Chosen** |

### Decision: Local digest (B-01)

| Option | Tradeoff | Decision |
|--------|----------|----------|
| `RepoDigests[0]\|\|ImageID` | fabrics `CONTENT_UPDATED` | Rejected |
| `resolveLocalDigest(image)->string\|undefined` shared | single source, fixes dashboard+scheduler | **Chosen** |

### Decision: Unknown domain + GHCR parity (B-10)

| Option | Tradeoff | Decision |
|--------|----------|----------|
| `remoteTags[0]` on `UNKNOWN` | paints `updated` green | Rejected |
| Guard Hub `167-173` + GHCR `288-289`: skip `targetRemote` on `UNKNOWN`, `latestDigest=undefined`, mapper `isLocal?local:latestDigest?available/updated:unknown` | **Chosen** |

### Decision: Year guard (B-13)

| Option | Tradeoff | Decision |
|--------|----------|----------|
| `current.parts>=2 && major<1000 && t.major>2000 && t.parts===1` | misses `16-alpine` (`parts=1`) | Rejected |
| `t.major>2000 && t.parts===1` candidate-based | covers single-segment pins | **Chosen** |

### Decision: Cache key + revalidation

| Option | Tradeoff | Decision |
|--------|----------|----------|
| key `localDigest\|\|ImageID` | `undefined` collision, 900s poison | Rejected |
| key `string\|undefined` distinct; `use cache`+`cacheTag(registry:checks)`+`cacheLife(900/3600)`; `updateTag(REFRESH_TAGS)` in `dashboard-gate.tsx:29-35` | **Chosen** |

## Data Flow

```
ContainerInfo -> resolveLocalDigest -> localDigest?
parseImageReference -> {repo,tag,originalRepo} -> Hub/GHCR fetch
-> ImageContext -> evaluatePolicies (Latest->Semver->Dev->Custom)
-> UNKNOWN? latestDigest=undefined : targetRemote by details
-> CheckImageUpdateResult -> mapper (local/latestDigest/unknown)
-> ContainerUpdateState cached(registry:checks) -> dashboard + notification-service
refresh: updateTag(REFRESH_TAGS) purges all 4 tags
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/lib/registry-updates.ts` | Modify | `parseImageReference` replace split `113-119,199`; keep `originalRepo`; guard Hub+GHCR `UNKNOWN`; use `resolveLocalDigest` |
| `src/lib/policies/engine.ts` | Modify | Year guard `100-109` -> `t.major>2000&&t.parts===1` |
| `src/lib/image-name.ts` | Modify | Add `resolveLocalDigest` export |
| `src/lib/notifications/notification-service.ts` | Modify | Use shared helper, drop `ImageID` fallback `66-71` |
| `src/lib/policies/engine.test.ts` | Modify | TDD year cases |
| `src/lib/registry-updates.test.ts` | Create | TDD B-01/B-10/B-05 repros |
| `src/lib/cache-tags.ts` | Referenced | No change |

## Interfaces / Contracts

```typescript
export function resolveLocalDigest(img: ImageInfo|undefined): string|undefined {
  return img?.RepoDigests?.[0]?.split('@')[1]
}
// UNKNOWN -> latestDigest=undefined, lastUpdated=undefined
// mapper: isLocal?'local':latestDigest?(hasUpdate?'available':'updated'):'unknown'
// year: t.ver.major>2000 && t.ver.parts===1
// cache: checkImageUpdate(name, localDigest?:string) distinct undefined; revalidate 900 expire 3600
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|--------------|----------|
| Unit | `resolveLocalDigest`, `parseImageReference` port/digest | Vitest TDD |
| Unit | Year guard `16-alpine` vs `2024.0` | `engine.test.ts` RED->GREEN |
| Unit | `UNKNOWN` -> `unknown` Hub+GHCR | mock remoteTags |
| Integration | `nginix` 404 local vs namespaced unknown | mock 404 |
| Integration | Cache unknown + `updateTag` purge | assert undefined, key miss |

Strict TDD: tests before fixes; `pnpm test`, `biome lint`, `pnpm build`.

## Threat Matrix

N/A — no routing/shell/subprocess/VCS/PR/executable/process integration. Registry via `fetchWithTimeout`.

## Migration / Rollout

No migration. Cache expires 900s or `updateTag` purges. Rollback reverts to `ImageID`+`remoteTags[0]`+`parts>=2`.

## Open Questions

- [ ] Allowlist for legitimate year-versioned products?
- [ ] Confirm simple-name 404 stays `local` per spec.
