# Tasks: Refresh Data Caching

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~180-240 |
| 400-line budget risk | Medium |
| Chained PRs recommended | No (single change, fases secuenciales) |
| Suggested split | Single PR con fases verificables |
| Delivery strategy | single-pr |

Decision needed before apply: Sí — Gate tras Fase 2 (¿`cacheComponents` estable o degradar a `unstable_cache`?).
Chain strategy: size-exception
400-line budget risk: Medium

## Phase 1 — Extraer readers del daemon (refactor neutro, sin cambio de comportamiento)

- [x] 1.1 Crear `src/lib/docker-inventory.ts` (SIN `'use server'`) con readers crudos que hacen `throw` en error:
  - `listContainersRaw(): Promise<ContainerInfo[]>` → `docker.listContainers({ all: true })` + `JSON.parse(JSON.stringify(...))`, `catch` → `throw`.
  - `listImagesRaw(): Promise<ImageInfo[]>` → `docker.listImages()` + serialize, `catch` → `throw`.
  - `pingDockerRaw(): Promise<boolean>` → equivalente al `checkDockerConnection()` actual (mover la lógica de `docker.ts:321`).
- [x] 1.2 En `src/actions/docker.ts`: eliminar los cuerpos de `getContainers`/`getImages`/`checkDockerConnection` (líneas ~46, ~56, ~321). Mantener el archivo `'use server'` solo para Actions (mutaciones + `checkImagesUpdatesBatch` + refresh helpers).
- [x] 1.3 Actualizar consumidores no-UI para importar los `*Raw` con `try/catch` local:
  - `src/lib/notifications/scheduler.ts` (líneas 3, 51-52, 70-71) → `listContainersRaw`/`listImagesRaw`.
  - `src/app/api/notifications/test/route.ts` (líneas 2, 27-28) → idem.
- [x] 1.4 `pnpm build` — verificar que compila con los readers movidos (aún sin `use cache`). Este es el checkpoint de refactor neutro.

## Phase 2 — Habilitar caché + tags (aquí cambia el comportamiento)

- [x] 2.1 `next.config.ts` — añadir `cacheComponents: true` (top-level, junto a `output`/`experimental`). NO tocar `experimental.optimizePackageImports`.
- [x] 2.2 En `src/lib/docker-inventory.ts` añadir wrappers cacheados (arriba `import { cacheTag, cacheLife } from 'next/cache'`):
  - `getContainers()` → `'use cache'`; `cacheLife('minutes')`; `cacheTag('docker:containers')`; `return listContainersRaw()`.
  - `getImages()` → `'use cache'`; `cacheLife('minutes')`; `cacheTag('docker:images')`; `return listImagesRaw()`.
  - `getDockerConnected()` → `'use cache'`; `cacheLife('seconds')`; `cacheTag('docker:connection')`; `return pingDockerRaw()`.
- [x] 2.3 `src/components/dashboard-content.tsx` — cambiar imports de `@/actions/docker` a `@/lib/docker-inventory` (`getContainers`, `getImages`, `getDockerConnected`). Reemplazar `checkDockerConnection()` por `getDockerConnected()` en el `Promise.all` (línea 27). `loadContainersCache()` y `getDashboardSettings()` quedan igual (sin cache).
- [x] 2.4 **GATE de decisión** (`design.md` Decisión 1-bis): `pnpm build`. Si `cacheComponents` rompe build por runtime APIs y no se resuelve con Fase 3 en ≤ medio día → degradar: quitar `cacheComponents`, quitar directivas `'use cache'`, envolver los tres readers con `unstable_cache(fn, [key], { tags:[...], revalidate })`. Mantener el resto del plan igual.
  - **Resultado**: Falló con incompatibilidad entre `cacheComponents` y client providers en layout (ThemeProvider, TooltipProvider, etc.). Se degradó a `unstable_cache`.

## Phase 3 — Adaptar `page.tsx` a Cache Components + refresh por tag

- [x] 3.1 `src/app/page.tsx` — eliminar `export const dynamic = 'force-dynamic'` (línea 12).
- [x] 3.2 Cambiar la Server Action `refresh()` (líneas 23-26): reemplazar `revalidatePath('/')` por `revalidateTag('docker:containers')`, `revalidateTag('docker:images')`, `revalidateTag('docker:connection')`. Ajustar import: `revalidateTag` desde `next/cache`.
- [x] 3.3 Verificar que `getLocale()` y `checkAuth()` (líneas 15-20) quedan en cuerpo dinámico, NUNCA dentro de un scope `use cache`. El `<Suspense>` existente (líneas 70-92) ya cubre `DashboardContent`.
- [x] 3.4 Auditar rutas que leen runtime bajo `cacheComponents`: `src/app/login/*`, `src/app/layout.tsx`, `src/app/api/*`. Envolver en `<Suspense>` lo que Next marque como dinámico no cubierto. Route Handlers `/api/*` no requieren cambio de modelo.
- [x] 3.5 `pnpm build` — cero errores en TODAS las rutas.

## Phase 4 — Rewire del progress bar (una sola fuente, sin reinicio a 0)

- [x] 4.1 `src/components/refresh-progress-bar.tsx` — eliminar la llamada `set(value)` que parte de `0` al iniciar la fase de check. Mantener `lastValueRef` monótono: al pasar de `formPending` → check, continuar desde el valor actual (no reiniciar). Conservar el debounce de `stop()` (400ms) para puentear el gap entre fases.
- [x] 4.2 `src/components/loading-events.tsx` — confirmar que el store consolida `formPending` (refresh explícito) + `checkProgress` en un único `active`/`ratio`. Ajustar si el rewire lo requiere.
- [x] 4.3 `src/components/refresh-button.tsx` — verificar que sigue publicando `formPending` y suscrito a `isChecking`; sin cambios de fondo salvo los que exija 4.2.
- [x] 4.4 Prueba manual en `pnpm dev`: refresh muestra la barra UNA sola vez, avanzando de forma monótona (sin volver a 0) entre fase servidor y fase check.

## Phase 5 — Verificación

- [x] 5.1 Recargar `/` (sin botón refresh): los contenedores aparecen desde caché sin esperar el escaneo del daemon.
- [x] 5.2 Botón refresh: invalida tags → re-escaneo del daemon + recheck client-side, con progress bar única.
- [x] 5.3 Cambiar contenedores en el daemon (start/stop) y verificar que refresh los refleja; que una carga normal los refleja tras expirar TTL.
- [x] 5.4 Scheduler / `api/notifications/test`: datos frescos (no cacheados).
- [x] 5.5 Login/logout e idioma sin regresión.
- [x] 5.6 Con daemon caído: el dashboard NO cachea `[]`; muestra estado de error y se recupera al volver el daemon.

## Implementation Order

1 → 2 (GATE) → 3 → 4 → 5. La Fase 1 es refactor neutro (reversible sin cambio de comportamiento). El comportamiento cambia en Fase 2; el GATE 2.4 decide el mecanismo definitivo (`use cache` vs `unstable_cache`) antes de invertir en Fases 3-4.
