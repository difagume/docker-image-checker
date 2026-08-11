# Proposal: Unified Data Cache (Cache Components nativo)

## Intent

Tres capas compiten por el mismo dato: `unstable_cache`, file cache `containers-cache.json` (escrita cliente) y `next.revalidate: 900` en server actions (no-op): 3 TTLs, 4 updateTags, round-trip cliente→disco, doc drift. Meta: una capa server-side (`cacheLife`/`cacheTag`) + escritura atómica en stores.

## Scope

### In Scope
- Migrar `unstable_cache` → `"use cache"` + `cacheLife('minutes')` + `cacheTag` (docker:containers/images/connection + registry:checks); quitar `next.revalidate`.
- Eliminar file cache (`containers-cache.json`, `src/lib/cache/containers.ts`, `container-cache.ts`), escrituras cliente, `isStale`.
- Escritura atómica (temp+rename+mutex) en `app-state.ts`.
- `/` y `/login` sin `instant=false`: gate auth en `<Suspense>` → shell estático con datos.
- Doc drift: `notifications-state` → `dashboard-state`.
- Unit tests Vitest (Strict TDD): helper atómico + tags.

### Out of Scope
- Migrar stores de estado (dedupe, reference-urls) a otro backend.
- Rediseñar scheduler (sigue con readers crudos).
- Reducir latencia del daemon; reescribir policies/i18n/auth.

## Capabilities

`openspec/specs/` vacío → todas nuevas.

### New Capabilities
- `inventory-cache`: caché única de inventario Docker + registry checks (`cacheLife`/`cacheTag`).
- `state-persistence`: escritura atómica de stores; fin del file cache.
- `static-shell-prerender`: shell estático en `/`/`/login` con gates `<Suspense>`.

### Modified Capabilities
- None — sin specs previas; SWR ya cubierto por `refresh-data-caching`.

## Approach

Readers-crudos + wrappers `"use cache"` (throw en error, sin cachear); registry checks vía `cacheTag('registry:checks')`; refresh con 3 `revalidateTag`. Fuera file cache y round-trip cliente; stores con escritura atómica.

## Affected Areas

| Área | Impacto |
|------|---------|
| `src/lib/docker-inventory.ts` | `use cache` + tags |
| `src/actions/docker.ts` | Quitar `next.revalidate` + `'use server'` redundante |
| `src/lib/cache/*`, `container-cache.ts`, `data/containers-cache.json` | Eliminados |
| `use-container-updates.ts`, `dashboard-content.tsx` | Sin escritura cliente / `isStale` |
| `src/lib/app-state.ts` | Escritura atómica |
| `page.tsx`, `login/page.tsx` | Quitar `instant=false`; `<Suspense>` |
| `AGENTS.md`, `NOTIFICATIONS.md`, `PRODUCT.md` | Doc drift |

## Risks

| Riesgo | Prob. | Mitigación |
|--------|-------|------------|
| `cacheComponents` rompe rutas con cookies/headers (Gate 2.4 ya falló) | Med | Gates probados; validar sin client providers; fallback `unstable_cache` |
| Rename atómico falla en Windows | Med | Reusar temp+rename+mutex con retry |
| Fix del no-op de registry altera updates | Med | Tags idénticos; smoke + tests |
| Refresh invalida de más | Baja | Mismos 3 tags que hoy |

## Rollback Plan

`git revert`; cortes: F1 `use cache` (tags idénticos), F2 file cache, F3 atómico, F4 `<Suspense>` por ruta.

## Dependencies

Sin npm nuevas: `next/cache` + Vitest.

## Success Criteria

- [ ] `pnpm build` OK; opt-outs 3 → 1 (layout).
- [ ] Cero `unstable_cache`, `next.revalidate` en actions y refs a `containers-cache.json`.
- [ ] Refresh vía 3 `revalidateTag`; primer paint con datos.
- [ ] Sin round-trip cliente→disco; Vitest verde.
- [ ] Docs sin `notifications-state.json`.
