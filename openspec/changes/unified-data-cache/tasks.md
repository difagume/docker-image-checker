# Tasks: Unified Data Cache (Cache Components nativo)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1850 (additions+deletions; ~280 son MOVE docker.ts→registry-updates.ts, ~190 borrado de dead code F2) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes (como cortes de verificación; SIN PRs por override del usuario) |
| Suggested split | F1 → F2 → F3 → F4 (cortes naturales del design, secuenciales en un único working tree) |
| Delivery strategy | override usuario: SIN commits ni PRs; implementar en working tree con checkpoint build/test por fase |

```
Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High
```

> Nota: `delivery_strategy` recibido = "SIN PRs NI COMMITS" (override explícito del usuario, fuera del dominio de 4 valores). No se crean commits ni PRs; los cortes F1-F4 son checkpoints de verificación (`pnpm build`/`pnpm test`/rg) en un mismo working tree. Chain strategy irrelevante → `pending`.

### Suggested Work Units (cortes, sin PR)

| Corte | Goal | Checkpoint de verificación | Runtime harness | Rollback boundary |
|-------|------|----------------------------|-----------------|-------------------|
| F1 | Capa única server-side (tags + wrappers + registry-updates + docker.ts) | `pnpm build` OK (opt-outs 3); `rg "unstable_cache|revalidate:\s*\d" src` → 0 | `pnpm dev`: dashboard con datos cacheados + refresh | Revertir F1 = `git revert` del corte; tags idénticos a hoy |
| F2 | Fin file cache + atómico (helper → stores → borrado → hook/content → loading) | `pnpm test` verde; `rg "containers-cache|fs\.writeFile\(|checkImagesUpdatesBatch|isStale" src` → 0 | `pnpm dev`: refresh sin round-trip cliente→disco | helper extraído ANTES de borrar `cache/containers.ts`; cortes F2a/F2b independientes |
| F3 | Shell estático `/` (page.tsx + dashboard-gate + skeleton) | `pnpm build` opt-outs 3 → 2; `rg "instant\s*=\s*false" src/app/page.tsx` → 0 | `pnpm dev`: primer paint inmediato; prefetch sin datos | Restaurar `instant = false` en page.tsx restaura el comportamiento previo |
| F4 | Shell `/login` + doc drift | `pnpm build` opt-outs 2 → 1; rg en las 2 páginas → 0; `rg "notifications-state" *.md` → 0 | `pnpm dev`: `/login` HTML estático sin datos; middleware intacto | Revertir login-gate; doc drift reversible |

## Decisiones de Open Questions (resueltas en tasks)

- **OQ-1 (criterio REQ-04)**: CONFIRMADA la interpretación adoptada. El rg `instant\s*=\s*false` se acota a `src/app/page.tsx` y `src/app/login/page.tsx` → 0; el layout conserva su Block (`layout.tsx:16`, nonce CSP + locale, sin hijo que envolver en Suspense); el build reporta 1 único opt-out. Evidencia: grep de `instant = false` en `src/` → solo 3 archivos.
- **OQ-2 (header duplicado / flash EN→locale)**: DECIDIDO — **shell sin header**; TODO el header (título localizado + logout + form refresh con 4 updateTag) vive en `DashboardGate`, que resuelve auth+locale (lectura de cookie, ~ms) y renderiza el header con un `<Suspense>` ANIDADO alrededor de `DashboardContent` (el daemon data no bloquea el header). Justificación: (1) elimina por completo el flash EN→locale para usuarios es/pt; (2) evita markup duplicado (2 headers que mantener en sync: drift); (3) cumple REQ-01 (shell sin cookies/headers: ni siquiera `getDictionary(defaultLocale)`) y REQ-05 (sin client providers); (4) el header aparece en el primer render del subtree resuelto, antes que los datos. Delta vs design: +`src/components/dashboard-skeleton.tsx` (fallback compartido para los 2 Suspense); el shell ya no renderiza título estático.
- **OQ-3 (checkImagesUpdatesBatch)**: DECIDIDO — **ELIMINAR**. Evidencia: grep muestra que su ÚNICO consumidor es `src/hooks/use-container-updates.ts:136`, dentro del efecto `fetchUpdates` que F2b.4 elimina (no hay otro caller en `src/`). `getContainerUpdateStates` cubre primer render y post-refresh (cacheTag `registry:checks` + updateTag); `verifyContainerUpdate` se CONSERVA (consumidor vivo: verify post-update en `handleUpdateClick`, use-container-updates.ts:433). Delta vs design (que decía "conserva checkImagesUpdatesBatch").
- **OQ-4 (loading-events/refresh-progress-bar)**: DECIDIDO — **sí, simplificar a solo `formPending`**. Evidencia: el único escritor de `checkProgress`/`checkTotal` es el efecto `fetchUpdates` eliminado → `checkTotal` nunca volvería a ser > 0; `RefreshProgressBar` y `RefreshButton` dependen de ese estado muerto. Se reduce `loading-events.tsx` a `{ formPending }`, `RefreshProgressBar` a start/stop por formPending (sin `set()`/ratio/monotonic) y `RefreshButton` a `useFormStatus().pending`. Delta vs design: +3 archivos modificados.

## Mapeo REQ/ESC → Tasks

| Spec | REQ | Tasks |
|------|-----|-------|
| inventory-cache | REQ-01 (capa única; sin unstable_cache/next.revalidate) | F1.4, F1.6 (ESC-01, ESC-02) |
| inventory-cache | REQ-02 (TTL por perfil cacheLife) | F1.4 (ESC-03, ESC-04) |
| inventory-cache | REQ-03 (tags + refresh 4 updateTag) | F1.3, F1.7 (ESC-05; ESC-06 smoke) |
| inventory-cache | REQ-04 (registry cacheTag ~15min; GHCR/proxy) | F1.5 (ESC-07) |
| inventory-cache | REQ-05 (readers crudos sin caché) | F1.4 (ESC-08) |
| inventory-cache | REQ-06 (fin file cache, cero refs) | F2b.1–F2b.4 (ESC-09) |
| state-persistence | REQ-01 (helper atómico antes del borrado) | F2a.1, F2a.2 (ESC-01/02/03) |
| state-persistence | REQ-02 (aplicación a stores) | F2a.3, F2a.4 (ESC-04, ESC-05) |
| state-persistence | REQ-03 (retry Windows) | F2a.2 (ESC-06) |
| state-persistence | REQ-04 (formato preservado) | F2a.2, F2a.3 (ESC-07) |
| state-persistence | REQ-05 (fallos propagados) | F2a.2, F2a.3 (ESC-08) |
| static-shell | REQ-01 (`/` sin instant=false) | F3.2, F3.3 (ESC-01, ESC-02) |
| static-shell | REQ-02 (`/login` sin instant=false) | F4.1, F4.2 (ESC-03, ESC-04) |
| static-shell | REQ-03 (proxy barrera principal) | F3.3, F4.2 (ESC-05) |
| static-shell | REQ-04 (layout Block; opt-outs 3→1) | F4.2 + layout intacto (ESC-06) |
| static-shell | REQ-05 (gate server-side sin providers) | F3.2, F4.1 (ESC-07) |

Decisiones del design: D-1→F1.4 · D-2→F1.5/F1.6 · D-3→F1.7 · D-4→F2a · D-5→F3/F4.

## Fase F1 — inventory-cache (capa única server-side)

- [x] F1.1 Crear `src/lib/cache-tags.ts` (constantes puras, sin imports de next/cache): `CACHE_TAGS` (containers/images/connection/registry = `docker:containers` etc.), `REFRESH_TAGS` (exactamente esos 4), `INVENTORY_CACHE_PROFILE='minutes'`, `CONNECTION_CACHE_PROFILE='seconds'`, `REGISTRY_REVALIDATE_SECONDS=900`, `REGISTRY_EXPIRE_SECONDS=3600`. Done: contrato del design intacto. (~20 ln)
- [x] F1.2 (RED, Strict TDD) Crear `src/lib/cache-tags.test.ts`: 4 tags únicos; `REFRESH_TAGS.length===4` y = tags declarados; perfiles explícitos. Done: `pnpm test` falla (módulo no existe). (~40 ln)
- [x] F1.3 Crear `src/lib/cache-tags.ts` (si no en F1.1) → `pnpm test` verde (GREEN). (0 ln extra si F1.1 ya creado)
- [x] F1.4 Reescribir wrappers en `src/lib/docker-inventory.ts`: `getContainers`/`getImages` → `async function` con `'use cache'` + `cacheLife(INVENTORY_CACHE_PROFILE)` + `cacheTag(CACHE_TAGS.containers/images)`; `getDockerConnected` → `cacheLife(CONNECTION_CACHE_PROFILE)` (dynamic hole) + `cacheTag(CACHE_TAGS.connection)`. Raw readers (`listContainersRaw`/`listImagesRaw`/`pingDockerRaw`) INTACTOS sin `'use cache'` (REQ-05/ESC-08). Eliminar `unstable_cache` y `cacheKey`. Done: mismas firmas exportadas; `rg "unstable_cache" src` → 0. (~60 ln)
- [x] F1.5 Crear `src/lib/registry-updates.ts` (sin `'use server'`): mover `checkImageUpdate`/`checkGhcrUpdate` desde docker.ts (mismo cuerpo, retorno tipado `CheckImageUpdateResult` exportado, GHCR/PAT/lscr.io/hyperdx intactos, mover `fetchWithTimeout`+`FETCH_TIMEOUT`+imports policies) con `'use cache'` function-level + `cacheTag(CACHE_TAGS.registry)` + `cacheLife({revalidate: REGISTRY_REVALIDATE_SECONDS, expire: REGISTRY_EXPIRE_SECONDS})`. Añadir `getContainerUpdateStates(): Promise<ContainerUpdateState[]>` `'use cache'` (mismo cacheLife/tag) que resuelve `getContainers()`+`getImages()` (scopes anidados, outer con cacheLife explícito) y ejecuta checks en paralelo. Done: `pnpm build` compila directivas. (~290 ln, mayormente MOVE)
- [x] F1.6 Limpiar `src/actions/docker.ts`: eliminar `next: { revalidate: 900 }` (2 fetch), los cuerpos movidos, `checkImagesUpdatesBatch`, imports policies no usados y el `'use server'` inline redundante de `verifyContainerUpdate` (línea 662). `verifyContainerUpdate` delega en `checkImageUpdate` de registry-updates; re-exportar `checkImageUpdate` para `notification-service.ts` (import intacto). Conservar wrappers `getContainers`/`getImages`/`checkDockerConnection` y flujo update (`updateContainerImage`/`triggerContainerUpdate`). Done: `rg "revalidate:\s*\d" src` → 0; `pnpm build` OK. (~-330 ln)
- [x] F1.7 Refresh 4 updateTag: en `src/app/page.tsx` reemplazar los 4 `updateTag('...')` literales por `for (const tag of REFRESH_TAGS) updateTag(tag)` (mismo read-your-writes, D-3, ESC-05). Done: loop sobre REFRESH_TAGS en page.tsx; `pnpm build` OK. (~10 ln)
- [x] F1-CHECK Verificación F1: `pnpm build` OK (opt-outs siguen 3); `pnpm exec tsc --noEmit` OK; `rg "unstable_cache|revalidate:\s*\d" src` → 0; smoke `pnpm dev`: dashboard sirve datos cacheados, refresh read-your-writes (ESC-01/03/05), scheduler con readers crudos (ESC-08). (checkpoint)

## Fase F2 — fin file cache + atómico

### F2a — helper atómico (ANTES del borrado)

- [x] F2a.1 (RED, Strict TDD) Crear `src/lib/fs-atomic.test.ts` (tmp dir real en `os.tmpdir()`): happy path temp+rename con JSON válido y SIN `.tmp` residual (ESC-01); crash simulado: destino previo intacto si muere entre temp y rename (ESC-02); mutex serializa 2 writes concurrentes → último completo, sin corrupción (ESC-03); retry EPERM/EACCES con backoff (mock `fs.rename`) (ESC-06); error propagado sin temp huérfano (ESC-08); formato `JSON.stringify(state, null, 2)` (ESC-07). Done: `pnpm test` falla (helper no existe). (~130 ln)
- [x] F2a.2 Crear `src/lib/fs-atomic.ts`: `writeFileAtomic(filePath, data)` con mutex por archivo (`Map<string, Promise>`), temp `${basename}.${pid}.${ts}.tmp` en el MISMO directorio, `mkdir` recursive, `writeFile` utf-8, `renameWithRetry` (5 intentos, backoff 25ms·n, EPERM/EACCES), limpieza del temp en error, errores propagados, slot del mutex nunca rechaza. Done: `pnpm test` verde. (~80 ln)
- [x] F2a.3 Aplicar en `src/lib/app-state.ts`: `saveState` → `writeFileAtomic(STATE_FILE_PATH, JSON.stringify(state, null, 2))` conservando el catch EACCES con el tip de permisos actual (REQ-04/05, ESC-07/08). Done: `rg "fs\.writeFile\(" src/lib/app-state.ts` → 0. (~6 ln)
- [x] F2a.4 Aplicar en `src/lib/reference-url-manager.ts`: `saveReferenceUrls` → `writeFileAtomic` (mismo formato, REQ-02, ESC-05). Done: `rg "fs\.writeFile\(" src/lib/reference-url-manager.ts` → 0. (~5 ln)

### F2b — fin file cache y round-trip cliente

- [x] F2b.1 Eliminar `src/lib/cache/containers.ts` y `src/actions/container-cache.ts` (el helper ya está extraído). Done: `rg "containers-cache|@/lib/cache/containers|@/actions/container-cache" src` → 0. (~-126 ln)
- [x] F2b.2 Eliminar `data/containers-cache.json` del disco (runtime, gitignored por `.gitignore` → `data`; sin cambio VCS). Done: `Test-Path data/containers-cache.json` → false. (0 ln diff)
- [x] F2b.3 Reescribir `src/components/dashboard-content.tsx`: quitar `loadContainersCache`/`getCacheKey`/`isStale`/`'checking'`; añadir `getContainerUpdateStates()` a `Promise.all` y mapear `processedContainers` desde el estado de updates (por `containerId`), conservando `getDashboardSettings`/`getDockerConnectionInfo`. Done: `rg "isStale|loadContainersCache|getCacheKey|checking" src/components/dashboard-content.tsx` → 0; `pnpm build` OK. (~85 ln)
- [x] F2b.4 Simplificar `src/hooks/use-container-updates.ts`: eliminar el efecto `fetchUpdates` (check inicial + `checkImagesUpdatesBatch`), build de `finalCache`, `saveAllContainersCacheAction`/`updateContainerCacheAction`, `isStale` (campo de `ContainerData` incluido) y `checkProgress`; CONSERVAR `handleUpdateClick` + `verifyContainerUpdate` post-update (OQ-3). Done: `rg "checkImagesUpdatesBatch|saveAllContainersCacheAction|updateContainerCacheAction|isStale|checkProgress" src` → 0; `pnpm build` OK. (~195 ln)
- [x] F2b.5 (OQ-4) Simplificar a solo `formPending`: `src/components/loading-events.tsx` → estado `{ formPending }` y eliminar `setCheckProgress`; `src/components/refresh-progress-bar.tsx` → start/stop por `formPending` (sin `set()`/ratio/lastValue monotonic; mantener stop debounced); `src/components/refresh-button.tsx` → solo `useFormStatus().pending` (quitar subscribe/isChecking). Done: `rg "checkTotal|checkCurrent|broadcastCheckProgress|setCheckProgress" src` → 0; `pnpm build` OK. (~80 ln)
- [x] F2-CHECK Verificación F2: `pnpm test` verde; `pnpm build` OK (opt-outs 3); `pnpm exec tsc --noEmit` OK; `rg "containers-cache|fs\.writeFile\(|checkImagesUpdatesBatch|isStale" src` → 0; smoke: refresh sin round-trip cliente→disco (ESC-09). (checkpoint)

## Fase F3 — shell `/`

- [x] F3.1 Crear `src/components/dashboard-skeleton.tsx` extrayendo el fallback inline actual de page.tsx (grid de 6 cards `animate-pulse`). Done: componente compartido importado en page.tsx y dashboard-gate (sin markup duplicado). (~45 ln)
- [x] F3.2 Crear `src/components/dashboard-gate.tsx` (server component, D-5/OQ-2): `checkAuth()` (solo si `AUTH_HTPASSWD`) → `redirect('/login')` si no-auth; `getLocale()`; header localizado COMPLETO (título + descripción + form logout + form refresh con action inline `'use server'` de 4 updateTag vía REFRESH_TAGS); `<Suspense fallback={<DashboardSkeleton/>}><DashboardContent locale={locale}/></Suspense>` ANIDADO (header no espera al daemon; ESC-01). Done: `pnpm build` compila; sin client providers nuevos (REQ-05/ESC-07). (~120 ln)
- [x] F3.3 Reescribir `src/app/page.tsx`: quitar `instant = false` y su comentario Block; shell estático SIN header (OQ-2): `<div>` + `<Suspense fallback={<DashboardSkeleton/>}><DashboardGate/></Suspense>`; quitar imports de `checkAuth`/`getLocale`/`logout`/`RefreshButton`/`DashboardContent`; conservar `metadata`. Done: `rg "instant\s*=\s*false" src/app/page.tsx` → 0; `pnpm build` opt-outs 3 → 2; smoke: primer paint inmediato (ESC-01), proxy redirige no-auth sin datos en el payload (ESC-02), prefetch sin datos (ESC-05). (~125 ln)
- [x] F3-CHECK Verificación F3: `pnpm build` OK con 2 opt-outs; `rg "getLocale\(|checkAuth\(" src/app/page.tsx` → 0 (shell sin runtime API). (checkpoint)

## Fase F4 — shell `/login` + doc drift

- [x] F4.1 Crear `src/components/login-gate.tsx` (server component): `redirect('/')` si `!process.env.AUTH_HTPASSWD`; `checkAuth()` → `redirect('/')` si autenticado (defensa en profundidad, ESC-04); `getLocale()` + dict; render `<LoginForm dict={dict.login}/>`. Done: `pnpm build` compila; sin client providers (REQ-05). (~50 ln)
- [x] F4.2 Reescribir `src/app/login/page.tsx`: quitar `instant = false` y su comentario; shell sin cookies/headers + `<Suspense fallback={null}><LoginGate/></Suspense>`. Done: `rg "instant\s*=\s*false" src/app/login/page.tsx` → 0; `pnpm build` opt-outs 2 → 1 (layout). (~50 ln)
- [x] F4.3 Doc drift: reemplazar `data/notifications-state.json` → `data/dashboard-state.json` en `AGENTS.md` (2 refs), `NOTIFICATIONS.md` (2 refs) y `PRODUCT.md` (2 refs); ajustar el tip de permisos `notifications-data` → `data` donde aplique. Done: `rg "notifications-state" -g "*.md" .` → 0. (~12 ln)
- [x] F4-CHECK Verificación final: `pnpm build` OK con 1 único opt-out (layout, Block documentado — ESC-06); `pnpm test` verde; `pnpm exec tsc --noEmit` OK; `rg "instant\s*=\s*false" src/app` → 1 (solo layout); `rg "unstable_cache|revalidate:\s*\d|containers-cache|notifications-state" src` → 0 (y 0 en *.md); smoke: `/login` HTML estático sin datos (ESC-03), middleware intacto, refresh read-your-writes. (checkpoint)
