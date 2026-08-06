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

Los wrappers DEBEN (MUST) etiquetar con `cacheTag`: `docker:containers`, `docker:images`, `docker:connection` y `registry:checks` (estos últimos en los registry checks). La acción refresh DEBE (MUST) invalidar vía `updateTag` (Next 16, equivalente a `revalidateTag`) los 4 tags — los 3 de inventario y `registry:checks` — idénticos a los actuales en `src/app/page.tsx`, garantizando read-your-writes del inventario y del estado de updates.

#### Scenario: ESC-05 — Refresh read-your-writes

- GIVEN inventario y registry checks cacheados
- WHEN el usuario pulsa refrescar (server action)
- THEN la acción invalida los 4 tags con `updateTag`
- AND el siguiente render re-consulta el daemon y el registry y muestra datos nuevos, sin round-trip cliente→disco

#### Scenario: ESC-06 — Actualización del registry

- GIVEN el digest remoto de una imagen cambió en Docker Hub/GHCR/proxy
- WHEN se ejecuta un registry check (refresh invalida `registry:checks`, o expira su TTL)
- THEN el estado de update disponible refleja el nuevo digest con los mismos tags que hoy
- AND el fix del no-op de `next.revalidate` NO altera la semántica de detección de updates

### Requirement: REQ-04 — Registry checks con cacheTag

Los fetch de registry DEBEN (MUST) eliminar `next: { revalidate: 900 }` y ejecutarse dentro de un scope `"use cache"` con `cacheTag('registry:checks')` y `cacheLife` explícito (objetivo ≈15 min, sin exceder 1 h). El soporte existente de GHCR/PAT y registries proxy (lscr.io, hyperdx) DEBE (MUST) mantenerse.

#### Scenario: ESC-07 — Registry dentro de TTL

- GIVEN un registry check cacheado en T0
- WHEN otro check ocurre dentro de su TTL
- THEN se sirve el resultado cacheado sin pegar al registry
- AND el refresh invalida el tag y fuerza un re-check real

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
