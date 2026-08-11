# Inventory Cache — Delta Spec (inventory-cache)

Change: unified-data-cache

## ADDED Requirements

### Requirement: REQ-01 — Capa única de caché

El sistema DEBE (MUST) exponer el inventario Docker (contenedores, imágenes, conectividad) y los registry checks mediante wrappers `"use cache"` con `cacheLife` y `cacheTag` explícitos, como ÚNICA capa de caché. El sistema DEBE (MUST) eliminar `unstable_cache` y toda opción `next.revalidate` en fetch (CERO apariciones en `src/`).

### Requirement: REQ-02 — TTLs por perfil cacheLife

`getContainers` y `getImages` DEBEN (MUST) usar el perfil `cacheLife('minutes')`. `getDockerConnected` DEBE (MUST) usar un perfil corto (`cacheLife('seconds')`, ≤15 s), quedando como dynamic hole. Todo scope `"use cache"` DEBE (MUST) declarar su `cacheLife` explícito; el perfil `default` implícito NO DEBE (MUST NOT) usarse.

### Requirement: REQ-03 — Tags de invalidación y refresh read-your-writes

Los wrappers DEBEN (MUST) etiquetar con `cacheTag`: `docker:containers`, `docker:images`, `docker:connection` y `registry:checks`. La acción refresh DEBE (MUST) invalidar vía `updateTag` los 4 tags.

### Requirement: REQ-04 — Registry checks con cacheTag

Los fetch de registry DEBEN (MUST) eliminar `next: { revalidate: 900 }` y ejecutarse dentro de un scope `"use cache"` con `cacheTag('registry:checks')` y `cacheLife` explícito (objetivo ≈15 min, sin exceder 1 h). El soporte GHCR/PAT y registries proxy (lscr.io, hyperdx) DEBE (MUST) mantenerse.

### Requirement: REQ-05 — Readers crudos sin caché

`listContainersRaw`, `listImagesRaw` y `pingDockerRaw` DEBEN (MUST) permanecer sin caché (siempre fresh, throw on error) y NO DEBEN (MUST NOT) llevar `"use cache"`, de modo que el scheduler los use directamente.

### Requirement: REQ-06 — Fin de la file cache

El sistema DEBE (MUST) eliminar `data/containers-cache.json`, `src/lib/cache/containers.ts`, `src/actions/container-cache.ts`, las escrituras cliente del caché (`src/hooks/use-container-updates.ts`) y la lógica `isStale` (`src/components/dashboard-content.tsx`). CERO referencias a `containers-cache.json`.

Spec base: `openspec/specs/inventory-cache/spec.md` (contenido completo con escenarios ESC-01..ESC-09).
