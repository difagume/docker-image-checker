# Apply Progress: Unified Data Cache (Cache Components nativo)

**Status**: ✅ COMPLETADO — implementado en working tree (F1 → F4), SIN commits ni PRs (override del usuario).

**Delivery strategy**: SIN PRs NI COMMITS; checkpoints de verificación por fase en un único working tree.

## Resumen ejecutivo

Capa única server-side `"use cache"` + `cacheLife` + `cacheTag` implementada. Reemplaza `unstable_cache` (docker-inventory), la file cache escrita desde el cliente (`containers-cache.json` + actions) y el `next: { revalidate: 900 }` no-op de los fetch de registry. El helper `writeFileAtomic` se extrajo del patrón de la file cache ANTES de eliminarla y se aplicó a los stores legítimos. Los gates de auth se movieron dentro de `<Suspense>` en `/` y `/login` para shells estáticos (opt-outs `instant = false`: 3 → 1, solo layout).

## Estado por fase

### F1 — inventory-cache ✅
- `src/lib/cache-tags.ts` + `cache-tags.test.ts` (Strict TDD RED→GREEN, 4 tests): `CACHE_TAGS` (docker:containers/images/connection, registry:checks), `REFRESH_TAGS` (4), perfiles `INVENTORY_CACHE_PROFILE='minutes'`, `CONNECTION_CACHE_PROFILE='seconds'`, `REGISTRY_REVALIDATE_SECONDS=900`, `REGISTRY_EXPIRE_SECONDS=3600`.
- `src/lib/docker-inventory.ts`: wrappers `unstable_cache` → funciones con `'use cache'` + `cacheLife` + `cacheTag`. Raw readers (`listContainersRaw`/`listImagesRaw`/`pingDockerRaw`) intactos sin caché (REQ-05, scheduler).
- `src/lib/registry-updates.ts` (nuevo): `checkImageUpdate`/`checkGhcrUpdate` (variantes `Raw` sin cache + wrappers `'use cache'`), `getContainerUpdateStates()`; `fetchWithTimeout` movido SIN time APIs (`Temporal.Now` eliminado → blocking-prerender-current-time).
- `src/actions/docker.ts`: sin `next.revalidate`, sin cuerpos de registry, sin `'use server'` inline redundante en `verifyContainerUpdate` (delega en `checkImageUpdate` cacheado), sin `checkImagesUpdatesBatch`.
- `src/app/page.tsx`: refresh con loop sobre `REFRESH_TAGS` (4 `updateTag`, read-your-writes).
- `src/lib/notifications/notification-service.ts`: **DEVIACIÓN acotada** — import cambia a `checkImageUpdateRaw` (ver riesgos).
- **CHECK F1**: `pnpm build` OK (opt-outs 3); `pnpm exec tsc --noEmit` OK; `rg "unstable_cache|revalidate:\s*\d" src` → 0; `pnpm test` 8/8.

### F2 — fin file cache + atómico ✅
- **F2a**: `src/lib/fs-atomic.ts` + `fs-atomic.test.ts` (Strict TDD RED→GREEN, 6 tests): temp+rename mismo directorio, mutex por archivo, retry EPERM/EACCES (5 intentos, backoff 25ms·n), limpieza de temp en error, errores propagados. Aplicado a `saveState` (app-state.ts) y `saveReferenceUrls` (reference-url-manager.ts) con formato `JSON.stringify(state, null, 2)`.
- **F2b**: eliminados `src/lib/cache/containers.ts`, `src/actions/container-cache.ts`, `data/containers-cache.json` (gitignored). `dashboard-content.tsx` usa `getContainerUpdateStates()` (sin file cache/isStale/'checking'). `use-container-updates.ts` sin efecto `fetchUpdates`/`checkProgress`/cache actions (conserva `handleUpdateClick` + `verifyContainerUpdate`). OQ-4: `loading-events`/`refresh-progress-bar`/`refresh-button` → solo `formPending`.
- **CHECK F2**: `pnpm test` 14/14; `pnpm build` OK (opt-outs 3); `pnpm exec tsc --noEmit` OK; `rg "containers-cache|checkImagesUpdatesBatch|isStale|checkTotal|checkCurrent|broadcastCheckProgress|setCheckProgress" src` → 0; `fs.writeFile(` solo en el helper (intencional).

### F3 — shell `/` ✅
- `src/components/dashboard-skeleton.tsx` (nuevo): grid 6 cards `animate-pulse` compartido.
- `src/components/dashboard-gate.tsx` (nuevo): `checkAuth` + `getLocale` dentro del Suspense → `redirect('/login')` si no-auth; header localizado COMPLETO (título + descripción + logout + form refresh inline con 4 `updateTag` vía `REFRESH_TAGS`); `<Suspense>` ANIDADO alrededor de `DashboardContent` (el daemon no bloquea el header).
- `src/app/page.tsx`: sin `instant = false`; shell estático SIN header (OQ-2); `metadata` conservado.
- **CHECK F3**: `pnpm build` OK (opt-outs 2); `rg "instant\s*=\s*false" src/app/page.tsx` → 0; `rg "getLocale\(|checkAuth\(" src/app/page.tsx` → 0.

### F4 — shell `/login` + doc drift ✅
- `src/components/login-gate.tsx` (nuevo): `redirect('/')` si `!AUTH_HTPASSWD` o autenticado; `getLocale` + `LoginForm`.
- `src/app/login/page.tsx`: sin `instant = false`; shell + `<Suspense fallback={null}><LoginGate/></Suspense>`.
- Doc drift: `data/notifications-state.json` → `data/dashboard-state.json` en `AGENTS.md` (2), `NOTIFICATIONS.md` (2), `PRODUCT.md` (2). No hay refs `notifications-data` en .md.
- **CHECK F4**: `pnpm build` OK con 1 único opt-out (layout, Block documentado); `pnpm test` 14/14; `pnpm exec tsc --noEmit` OK; `rg "instant\s*=\s*false" src/app` → 1 (layout); `rg "unstable_cache|revalidate:\s*\d|containers-cache|notifications-state" src` → 0; idem en `*.md` → 0; Biome limpio en los 20 archivos tocados.

## Desviaciones vs tasks (documentadas)

1. **F1.6 / notification-service.ts**: la task pedía "re-exportar `checkImageUpdate` para `notification-service.ts` (import intacto)". Se cambió el import a `checkImageUpdateRaw` (variante sin `'use cache'` en registry-updates). Motivo: el wrapper `"use cache"` compilado lanza **E279** (`'"use cache" cannot be used outside of App Router. Expected a WorkStore.'`, verificado en `node_modules/next/dist/server/use-cache/use-cache-wrapper.js:1055`) cuando se ejecuta sin request context. `checkAndNotify` corre vía scheduler node-cron (instrumentation.ts, sin WorkStore) → con el import intacto las notificaciones fallarían en runtime (catch por contenedor). La variante `Raw` preserva el comportamiento sin caché.
2. **checkImagesUpdatesBatch**: se conservó como wrapper transitorio en F1 (delegando a `checkImageUpdate` cacheado) porque su único consumidor (`use-container-updates.ts` efecto `fetchUpdates`) se elimina en F2b.4; borrado definitivo en F2b. Sin esta decisión el build de F1 rompería (import colgado). OQ-3 respetado: eliminado al cerrar F2.
3. **Criterio rg `fs.writeFile\(`**: la única ocurrencia restante es el propio `fs-atomic.ts` (helper, intencional); los stores quedan limpios.

## Resultados de verificación (checkpoints ejecutados)

| Checkpoint | Resultado |
|---|---|
| `pnpm test` | 14/14 (4 baseline + 4 cache-tags + 6 fs-atomic) |
| `pnpm exec tsc --noEmit` | OK |
| `pnpm build` (F1→F4) | OK (9/9 pages); opt-outs `instant=false` 3 → 2 → 1 |
| `pnpm exec biome check` (20 archivos tocados) | Sin errores |
| `rg` de leftovers (unstable_cache, revalidate, containers-cache, checkImagesUpdatesBatch, isStale, checkProgress, notifications-state) | 0 |

Notas del build: warning pre-existente `Health check failed: connect ENOENT /var/run/docker.sock` (daemon no alcanzable durante el build — no relacionado con el cambio). `prerender-manifest.json` muestra `/` y `/login` como `PARTIALLY_STATIC` con `compute: blocking`: el `instant = false` del layout (Block documentado, D-5) bloquea el árbol; el observable por fase es el rg de opt-outs + build OK. `_global-error` queda prerendered completo (htmlSize 9233).

## Pendiente / Next recommended

- **sdd-verify**: ejecutar la fase verify contra specs `inventory-cache`, `state-persistence`, `static-shell-prerender` (REQ/ESC mapping de tasks).
- **Smoke manual** (requiere daemon Docker): `pnpm dev` → dashboard con datos cacheados; refresh read-your-writes (4 updateTag); scheduler con readers crudos (`listContainersRaw`/`listImagesRaw` + `checkImageUpdateRaw` en notifications); primer paint del shell inmediato; `/login` HTML estático sin datos; middleware/proxy intacto.

## Riesgos

- El scheduler de notificaciones depende ahora de la variante `Raw` (sin caché): cada cron re-consulta el registry (comportamiento idéntico al pre-cambio — `next.revalidate` era no-op).
- `getContainerUpdateStates` ejecuta N checks de registry en paralelo por contenedor (cache hit tras el primer render; miss inicial puede tardar — cubierto por el skeleton del Suspense anidado).
- El layout conserva `instant = false` (Block documentado: nonce CSP + locale); cualquier intento futuro de prerender completo del shell top-level requiere revisar ese opt-out.
