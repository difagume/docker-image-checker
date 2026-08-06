# Proposal: Refresh Data Caching (Next 16 Cache Components)

## Intent

Hoy el dashboard usa `export const dynamic = 'force-dynamic'` en `page.tsx` y `revalidatePath('/')` en el refresh. Eso obliga a re-ejecutar en CADA carga y CADA refresh el bloque `Promise.all([getContainers(), getImages(), loadContainersCache(), getDashboardSettings(), checkDockerConnection()])` de `dashboard-content.tsx`, cuyo cuello de botella son las llamadas al daemon (`docker.listContainers` / `docker.listImages`) — medido en ~14.4s contra un daemon remoto.

Además, las lecturas del daemon viven en `src/actions/docker.ts`, que es un archivo `'use server'`: todas sus exports son Server Actions (endpoints POST que además se serializan uno a uno), un antipatrón para lecturas desde Server Components.

El objetivo es **desacoplar "mostrar datos" de "refrescar datos"** (stale-while-revalidate): que las cargas normales pinten al instante desde caché en memoria, que el escaneo caro del daemon ocurra solo bajo demanda (botón refresh) o al expirar el TTL, y que el estado de carga tenga una sola fuente de verdad.

## Scope

### In Scope
1. Habilitar Cache Components (`cacheComponents: true`) en `next.config.ts`.
2. Extraer las lecturas del daemon a un módulo NO-`'use server'` (`src/lib/docker-inventory.ts`) con readers crudos (throw en error) + wrappers `'use cache'` con `cacheTag`/`cacheLife`.
3. Migrar `dashboard-content.tsx` para consumir los readers cacheados.
4. Cambiar el refresh de `revalidatePath('/')` a `revalidateTag(...)` sobre los tags de inventario.
5. Quitar `dynamic = 'force-dynamic'` de `page.tsx` y adaptar las lecturas de runtime (`cookies`/`headers` vía `checkAuth`/`getLocale`) al modelo de Cache Components (Suspense / no dentro de `use cache`).
6. Reconectar el "pegamento" del progress bar (loading-events + refresh-button + refresh-progress-bar) a una sola fuente de verdad y eliminar el reinicio visual a 0.
7. Actualizar consumidores no-UI (`scheduler.ts`, `api/notifications/test/route.ts`) para usar readers crudos (datos frescos).

### Out of Scope
- Reducir la latencia intrínseca del daemon remoto (~14s). El caching la oculta, no la elimina.
- Migrar a SWR/TanStack Query + SSE (esa era la Opción C, descartada).
- Reescribir el sistema de notificaciones o la lógica de policies.
- Tests automatizados (el proyecto no tiene suite).

## Capabilities

Cambio de comportamiento observable (SWR): las cargas/navegaciones sirven datos cacheados al instante; el escaneo del daemon solo corre en refresh explícito o al expirar el TTL. Sin cambios en la API pública ni en el formato de datos.

## Approach

Ver `design.md` para las decisiones de arquitectura (mecanismo de caché, tags, TTL, manejo de runtime APIs bajo Cache Components, y el fallback con `unstable_cache`). Ver `tasks.md` para el desglose ejecutable por fases.

## Affected Areas

| Area | Impact |
|------|--------|
| `next.config.ts` | `cacheComponents: true` |
| `src/lib/docker-inventory.ts` | NUEVO — readers crudos + wrappers `use cache` con tags |
| `src/actions/docker.ts` | Quitar/reexportar lecturas; mantener solo Actions (mutaciones + refresh) |
| `src/app/page.tsx` | Quitar `force-dynamic`; refresh → `revalidateTag`; adaptar auth/locale |
| `src/components/dashboard-content.tsx` | Consumir readers cacheados; envolver zonas dinámicas en Suspense |
| `src/lib/notifications/scheduler.ts` | Usar readers crudos (fresco) |
| `src/app/api/notifications/test/route.ts` | Usar readers crudos (fresco) |
| `src/components/loading-events.tsx` | Fuente única de loading |
| `src/components/refresh-progress-bar.tsx` | Quitar reinicio a 0; una sola fase |
| `src/components/refresh-button.tsx` | Reconectar a la nueva fuente |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `cacheComponents` rompe rutas con `cookies()`/`headers()` (login, dashboard, api) | High | Migración explícita en tasks: Suspense sobre lo dinámico, leer runtime fuera de `use cache`; verificar `pnpm build` por ruta |
| Cachear `[]` de un error del daemon "congela" el dashboard vacío | Medium | Readers crudos hacen `throw`; el wrapper `use cache` NO cachea throws; TTL corto de respaldo |
| Scheduler/notificaciones leen datos stale | Medium | Consumen readers crudos (sin `use cache`) |
| `revalidateTag` fuerza miss → refresh vuelve a bloquear ~14s | Medium | Es intención explícita del usuario (con progress bar); las cargas NO-refresh sirven stale al instante |
| Migración global demasiado disruptiva | Medium | Fallback documentado en `design.md`: `unstable_cache` + tags sin `cacheComponents` |

## Rollback Plan

`git revert` del change completo. Punto de corte reversible por fase: Fase 1 (extracción de readers) es un refactor neutro sin cambio de comportamiento; el comportamiento cambia recién en Fase 2 (habilitar cache + tags).

## Dependencies

Ninguna nueva dependencia npm. Usa APIs nativas de Next 16 (`next/cache`: `cacheTag`, `cacheLife`, `revalidateTag`). `@bprogress/next` ya instalado.

## Success Criteria

- [ ] `pnpm build` sin errores con `cacheComponents: true` (todas las rutas).
- [ ] Recarga de `/` sin refresh: pinta contenedores desde caché sin esperar el escaneo del daemon.
- [ ] Botón refresh: invalida tags, re-escanea daemon y muestra progreso una sola vez (sin reinicio a 0).
- [ ] Scheduler y `api/notifications/test` obtienen datos frescos (no cacheados).
- [ ] Sin regresión en login/logout ni en detección de idioma.
