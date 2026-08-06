# Design: Refresh Data Caching

## Context

- Next.js **16.2.11**, App Router, self-hosted (`output: 'standalone'`, Docker) → el cache de `use cache` persiste en memoria entre requests (no serverless).
- Cuello de botella: `docker.listContainers({ all: true })` + `docker.listImages()` contra daemon remoto (~14s). Es I/O runtime (no `fetch`), pero `use cache` cachea el retorno serializable de cualquier async.
- Restricción dura: dentro de `use cache` NO se puede leer `cookies()`/`headers()`. `getLocale()` y `checkAuth()` leen runtime → deben quedar FUERA de scopes cacheados.

## Goals / Non-Goals

**Goals**
- Cargas/navegaciones instantáneas desde caché (stale-while-revalidate).
- Escaneo del daemon solo en refresh explícito o expiración de TTL.
- Lecturas fuera de `'use server'` (dejar de tratar reads como Actions).
- Una sola fuente de verdad para el estado de carga del progress bar.

**Non-Goals**
- Acelerar el daemon remoto. No cambiar el enriquecimiento client-side (`use-container-updates`).

## Decision 1 — Mecanismo de caché: `use cache` (Cache Components) [PRIMARIO]

Habilitar `cacheComponents: true` en `next.config.ts` y usar la directiva `'use cache'` con `cacheTag`/`cacheLife` de `next/cache`.

**Por qué el primario:** es el idiom de Next 16 (API estable bajo la feature Cache Components), integra invalidación por tag cliente+servidor en un solo lugar, y encaja con el `<Suspense>` que ya existe en `page.tsx`.

**Fallback (Decisión 1-bis):** si habilitar `cacheComponents` desestabiliza login/api/dashboard y los arreglos time-boxed (≤ medio día) no bastan, degradar a **`unstable_cache(fn, keyParts, { tags, revalidate })`** SIN `cacheComponents`. Mismos tags y mismos puntos de invalidación; blast radius mínimo (solo envuelve los readers). Trigger explícito registrado en `tasks.md` (Gate tras Fase 2).

## Decision 2 — Separar readers crudos de wrappers cacheados

Nuevo módulo `src/lib/docker-inventory.ts` (NO lleva `'use server'`):

- `listContainersRaw()` / `listImagesRaw()` / `pingDockerRaw()`: llaman al daemon y **hacen `throw` en error** (no devuelven `[]`). Uso interno + consumidores que necesitan datos frescos.
- `getContainers()` / `getImages()` / `getDockerConnected()`: async con `'use cache'`, cada uno con su `cacheTag(...)` y `cacheLife(...)`. Envuelven a los raw. Como el raw hace throw, el wrapper NO cachea estados de error (Next no cachea throws).

**Por qué throw en vez de `[]`:** cachear `[]` de un fallo transitorio del daemon congelaría el dashboard vacío hasta la próxima invalidación. Con throw, el error sube a un Error Boundary/Suspense y la caché solo guarda resultados válidos.

`src/actions/docker.ts` (sigue `'use server'`): elimina `getContainers`/`getImages`/`checkDockerConnection` como Actions. Para no romper imports externos, se puede reexportar desde ahí los readers cacheados (una línea `export { getContainers, getImages } from '@/lib/docker-inventory'`), PERO los consumidores no-UI se apuntan directo a los `*Raw`.

## Decision 3 — Tags y TTL

| Reader | Tag | `cacheLife` (perfil) | Notas |
|--------|-----|----------------------|-------|
| `getContainers` | `docker:containers` | `minutes` (revalidate corto) | Contenedores cambian por start/stop |
| `getImages` | `docker:images` | `minutes` | Cambia al pull/update |
| `getDockerConnected` | `docker:connection` | perfil corto (segundos) | Estado de conectividad |

- Perfiles: usar los built-in (`'seconds'`, `'minutes'`, `'hours'`) o un perfil custom en `next.config.ts` (`cacheLife: { ... }`) si se necesita afinar `stale`/`revalidate`/`expire`. Decisión por defecto: built-in `'minutes'` para inventario, `'seconds'` para conexión. Afinar en verify si el stale se siente largo (el router impone mínimo 30s de stale en cliente).
- `loadContainersCache()` (archivo JSON en `data/`) y `getDashboardSettings()` NO se envuelven en `use cache`: leen disco local barato y deben reflejar cambios inmediatos.

## Decision 4 — Refresh por tag en vez de path

En `page.tsx`, la Server Action `refresh()` pasa de:
```
revalidatePath('/')
```
a:
```
revalidateTag('docker:containers')
revalidateTag('docker:images')
revalidateTag('docker:connection')
```
`revalidateTag` fuerza miss → el siguiente render re-escanea el daemon (bloqueante ~14s, pero es la intención explícita del usuario y se cubre con el progress bar). Las recargas/navegaciones que NO pasan por el botón sirven stale al instante.

> Nota: `updateTag` (Next 16) tiene semántica de "expira + refresca ya"; se documenta como alternativa si se quiere que el refresh haga swap atómico. Por defecto usamos `revalidateTag`.

## Decision 5 — Cache Components + runtime APIs (auth/locale)

Al quitar `dynamic = 'force-dynamic'` y activar `cacheComponents`, todo acceso a runtime debe estar en scope dinámico (Suspense) o marcado `use cache`; lo demás rompe el build.

- `getLocale()` y `checkAuth()` (leen headers/cookies) **NO** pueden ir dentro de `use cache`. Se mantienen en el cuerpo dinámico de `page.tsx`/componentes envueltos en `<Suspense>`.
- El `<Suspense>` que ya envuelve `DashboardContent` cubre la parte que depende del daemon.
- Verificar por ruta que no queden lecturas de runtime fuera de Suspense sin marcar (login, layout, api). Los Route Handlers (`/api/*`) son dinámicos por naturaleza y no requieren cambios de modelo.

## Decision 6 — Consumidores no-UI

`scheduler.ts` y `api/notifications/test/route.ts` cambian sus imports a `listContainersRaw`/`listImagesRaw` (datos frescos, con `try/catch` local ya que ahora hacen throw). No deben depender del caché de UI.

## Decision 7 — Rewire del progress bar (una sola fuente)

Con SWR, el refresh explícito es la única fase larga observable; el enriquecimiento client-side (`use-container-updates`) sigue publicando progreso real.

- `loading-events.tsx`: mantener el store, pero `formPending` ahora representa el refresh explícito (revalidateTag). Sigue habiendo dos entradas (formPending + checkProgress) pero se consolidan en un único `active`/`ratio`.
- `refresh-progress-bar.tsx`: **eliminar el `set(0)`** al entrar en fase de check; mantener `lastValueRef` monótono para que la barra NUNCA retroceda. Al pasar de formPending → check, continuar desde el valor actual, no desde 0. Mantener el debounce de `stop()` para puentear el gap entre fases.
- `refresh-button.tsx`: sin cambios de fondo; sigue publicando `formPending` y suscribiéndose a `isChecking`.

## Data Flow (después)

```
Carga normal de /  ──► RSC lee getContainers()/getImages() [use cache]
                        └─ HIT: pinta al instante (stale-while-revalidate)
                        └─ MISS/expira: escanea daemon en background

Botón refresh ─────► Server Action refresh(): revalidateTag(docker:*)
                        └─ re-render RSC re-escanea daemon (progress bar fase 1)
                        └─ cliente use-container-updates recheck (progress bar fase 2, sin reset)

Scheduler / api test ─► listContainersRaw()/listImagesRaw() (siempre fresco)
```

## Alternatives Considered

- **Opción A (`router.refresh()`):** menos idiomática para cachear; no resuelve el re-escaneo en cada carga. Descartada.
- **Opción C (SWR/TanStack Query + route handlers + SSE):** mejor UX a largo plazo pero reescritura grande del data layer cliente. Descartada por el usuario (prefiere refactor acotado y correcto).
- **`unstable_cache` como primario:** menor blast radius, pero API `unstable_` y fuera del idiom Next 16. Reservado como fallback (Decisión 1-bis).

## Open Questions

- Perfil exacto de `cacheLife` para inventario (`minutes` built-in vs custom): decidir en verify según sensación de staleness.
- ¿Introducir "soft refresh" (solo recheck client-side, sin re-escanear daemon) como segundo botón/gesto? Anotado como mejora futura, fuera de scope.
