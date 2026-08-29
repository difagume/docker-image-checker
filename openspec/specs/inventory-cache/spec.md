# Inventario Docker — Caché Única Server-Side (inventory-cache)

## Purpose

Una sola capa de caché server-side (Cache Components: `"use cache"` + `cacheLife` + `cacheTag`) reemplaza las tres capas que hoy compiten por el mismo dato: `unstable_cache` (300 s), file cache `data/containers-cache.json` escrita desde el cliente, y `next: { revalidate: 900 }` en fetch de server actions (no-op). Los readers crudos del daemon permanecen sin caché para el scheduler.

## Requirements

### Requirement: REQ-01 — Capa única de caché

El sistema DEBE (MUST) exponer el inventario Docker (contenedores, imágenes, conectividad) y los registry checks mediante wrappers `"use cache"` con `cacheLife` y `cacheTag` explícitos, como ÚNICA capa de caché. El sistema DEBE (MUST) eliminar `unstable_cache` y toda opción `next.revalidate` en fetch (CERO apariciones en `src/`).

#### Scenario: ESC-01 — Primer render con datos cacheados

- GIVEN caché de inventario vacía (primer arranque)
- WHEN un usuario autenticado renderiza `/`
- THEN los wrappers consultan el daemon, almacenan el resultado con sus tags y el render lo muestra
- AND los siguientes renders dentro del TTL sirven desde la caché sin tocar el daemon

#### Scenario: ESC-02 — Fallo del daemon no se cachea

- GIVEN el daemon no responde y la caché está expirada
- WHEN el wrapper ejecuta el reader crudo
- THEN el wrapper PROPAGA el error (throw) y NO almacena ningún estado de error
- AND el dashboard muestra el estado de error/desconexión actual

### Requirement: REQ-02 — TTLs por perfil cacheLife

`getContainers` y `getImages` DEBEN (MUST) usar el perfil `cacheLife('minutes')` (≈5 min con stale-while-revalidate, equivalente al `revalidate: 300` actual). `getDockerConnected` DEBE (MUST) usar un perfil corto (`cacheLife('seconds')`, ≤15 s), quedando como dynamic hole (excluido del shell estático). Todo scope `"use cache"` DEBE (MUST) declarar su `cacheLife` explícito; el perfil `default` implícito NO DEBE (MUST NOT) usarse.

#### Scenario: ESC-03 — TTL de inventario

- GIVEN un render que popular la caché en T0 con el perfil minutes
- WHEN un segundo render ocurre dentro de la ventana fresh/stale
- THEN se sirve el resultado cacheado (SWR) sin re-consultar el daemon

#### Scenario: ESC-04 — TTL de conectividad

- GIVEN el perfil corto de `getDockerConnected`
- WHEN el daemon cae tras el último ping cacheado
- THEN dentro de la ventana corta se sirve el último valor y luego el wrapper vuelve a lanzar error
- AND la ruta NO queda bloqueada por el contenido de vida corta (dynamic hole)

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

### Requirement: REQ-05 — Readers crudos sin caché

`listContainersRaw`, `listImagesRaw` y `pingDockerRaw` DEBEN (MUST) permanecer sin caché (siempre fresh, throw on error) y NO DEBEN (MUST NOT) llevar `"use cache"`, de modo que el scheduler los use directamente.

#### Scenario: ESC-08 — Scheduler con readers crudos

- GIVEN el scheduler de notificaciones activo (node-cron en `src/instrumentation.ts`)
- WHEN ejecuta su chequeo periódico
- THEN usa `listContainersRaw`/`listImagesRaw` directamente, sin pasar por los wrappers cacheados
- AND el TTL y los tags de la capa de caché NO se ven afectados por el scheduler

### Requirement: REQ-06 — Fin de la file cache

El sistema DEBE (MUST) eliminar `data/containers-cache.json`, `src/lib/cache/containers.ts`, `src/actions/container-cache.ts`, las escrituras cliente del caché (`src/hooks/use-container-updates.ts`) y la lógica `isStale` (`src/components/dashboard-content.tsx`). El repositorio DEBE (MUST) quedar con CERO referencias a `containers-cache.json`.

#### Scenario: ESC-09 — Sin round-trip cliente→disco

- GIVEN el dashboard con datos cacheados server-side
- WHEN el cliente navega o refresca
- THEN ningún código cliente escribe ni lee `containers-cache.json`
- AND el estado fresco proviene únicamente de la capa `"use cache"` server-side

## Criterios de aceptación (medibles)

- `rg "unstable_cache|revalidate:\s*\d|containers-cache\.json" src` → 0 coincidencias
- La action refresh invoca exactamente 4 `updateTag`: `docker:containers`, `docker:images`, `docker:connection`, `registry:checks`
- Tests Vitest (Strict TDD) verdes: tags emitidos por los wrappers y TTL de perfiles
- `pnpm build` OK
