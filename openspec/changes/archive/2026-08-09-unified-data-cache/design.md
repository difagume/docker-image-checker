# Design: Unified Data Cache (Cache Components nativo)

## Enfoque técnico

Una única capa server-side (`"use cache"` + `cacheLife` + `cacheTag`) reemplaza `unstable_cache`, la file cache escrita desde el cliente y el `next: { revalidate: 900 }` no-op de los fetch de registry. Los readers crudos del daemon permanecen sin caché para el scheduler. Los stores legítimos (`dashboard-state.json`, `reference-urls.json`) pasan a escritura atómica vía un helper compartido extraído ANTES de eliminar la file cache. El gate de auth se mueve dentro de `<Suspense>` en `/` y `/login` para lograr shell estático (opt-outs 3 → 1). Verificado contra la doc local de Next 16.3.0 (`dist/docs/`: use-cache, cacheLife, cacheTag, migrating-to-cache-components, instant).

## Decisiones de arquitectura

### D-1: Wrappers `"use cache"` en docker-inventory.ts

| Opción | Tradeoff | Decisión |
|---|---|---|
| `unstable_cache` actual | Fuera del modelo Cache Components; 3 TTLs en competencia | Descartado |
| `"use cache"` function-level inline | Sigue la doc: `cacheLife`+`cacheTag` dentro del scope; raw readers intactos | **Elegido** |

Los wrappers son funciones de datos puras (devuelven JSON serializable, sin cookies/headers — la doc prohíbe runtime APIs dentro del scope). Los raw readers NO llevan `"use cache"` (REQ-05, scheduler).

```ts
// src/lib/docker-inventory.ts (fragmento del nuevo contrato)
import { cacheLife, cacheTag } from 'next/cache'
import { CACHE_TAGS } from '@/lib/cache-tags'

export async function getContainers(): Promise<ContainerInfo[]> {
	'use cache'
	cacheLife('minutes') // stale 5m / revalidate 1m / expire 1h → prerendered
	cacheTag(CACHE_TAGS.containers)
	return listContainersRaw()
}

export async function getDockerConnected(): Promise<boolean> {
	'use cache'
	cacheLife('seconds') // stale 30s / revalidate 1s / expire 1m → dynamic hole
	cacheTag(CACHE_TAGS.connection)
	return pingDockerRaw()
}
```

Perfil `minutes` (preset): stale 5 min / revalidate 1 min / expire 1 h — incluido en prerenders (stale ≥ 30 s, expire > 5 min). Perfil `seconds`: expire 1 min < 5 min → **dynamic hole** excluido de prerenders; `DashboardContent` (que lo llama) vive dentro de `<Suspense>`, cubriendo el fallback (ESC-04). Nota de semántica: `minutes` revalida en server cada 1 min (no 5) — más fresco que `revalidate: 300` actual; SWR preservado (ESC-03). No hay anidamiento short-lived problemático: `DashboardContent` NO es scope `"use cache"`, y `getContainerUpdateStates` declara cacheLife explícito (regla *nested short-lived caches* de la doc).

### D-2: Registry checks → módulo `src/lib/registry-updates.ts`

| Opción | Tradeoff | Decisión |
|---|---|---|
| Mantener fetch `next.revalidate` en `docker.ts` | No-op confirmado (obs #550/#581); 3ª capa de TTL | Descartado |
| Scope `"use cache"` dentro de `docker.ts` ('use server') | Directivas 'use server'/'use cache' mezcladas en un archivo: riesgo de compilación | Descartado |
| Módulo nuevo sin 'use server' con funciones `"use cache"` | Separa directivas; cache key = args serializables (imageName, localDigest) | **Elegido** |

`checkImageUpdate`/`checkGhcrUpdate` migran a `src/lib/registry-updates.ts` con `"use cache"` function-level, `cacheTag(CACHE_TAGS.registry)` y `cacheLife({ revalidate: 900, expire: 3600 })` (≈15 min, ≤1 h; `stale` hereda el default de 5 min). Soporte GHCR/PAT, lscr.io y hyperdx intacto (REQ-04/ESC-07). El cache key incluye `localDigest` → tras un pull el verify (nuevo digest) es cache miss y consulta fresh. `src/actions/docker.ts` conserva `'use server'` para `checkImagesUpdatesBatch`/`verifyContainerUpdate` y delega en el módulo; se elimina `next: { revalidate: 900 }` y el `'use server'` inline redundante de `verifyContainerUpdate` (línea 662).

**Estado de updates en el primer render** (decisión): nuevo wrapper `getContainerUpdateStates(): Promise<UpdateStateByContainer[]>` con `"use cache"` + `cacheTag(registry)` + mismo cacheLife inline; internamente resuelve `getContainers()` + `getImages()` (scopes cacheados anidados — permitido porque el outer declara cacheLife explícito) y ejecuta los checks en paralelo. `DashboardContent` lo llama server-side dentro del Suspense: cache hit → primer paint con updates ya resueltos; cache miss → el subtree espera con skeleton. Justificación: ESC-09 exige que el estado fresco provenga únicamente de la capa `"use cache"`; elimina el round-trip cliente→disco y el estado visual `'checking'` del primer render.

### D-3: Refresh con 4 `updateTag` (discrepancia 3 vs 4 resuelta)

| Fuente | Tags | Decisión |
|---|---|---|
| Proposal: "3 revalidateTag" | Inconsistente con page.tsx actual (4) | Descartado |
| Specs (obs #582) + page.tsx:39-43 | `docker:containers`, `docker:images`, `docker:connection`, `registry:checks` | **Elegido: 4** |

La action `refresh` (inline, ahora en `dashboard-gate.tsx`) invoca exactamente 4 `updateTag` (read-your-writes; la doc de Next 16 confirma `updateTag` solo dentro de Server Functions). Preserva la detección de updates (ESC-06).

### D-4: Helper `writeFileAtomic` (src/lib/fs-atomic.ts)

Extraído del patrón de `src/lib/cache/containers.ts` (temp+rename+mutex) ANTES de eliminar la file cache (REQ-01). Mejoras sobre el original: mutex por archivo (Map), temp único (`${basename}.${pid}.${ts}.tmp` — evita colisiones entre procesos en Windows), retry de rename en EPERM/EACCES con backoff acotado (5 intentos, 25 ms·n), limpieza del temp en error y mutex que nunca queda bloqueante (la cadena encolada no hereda rechazos). Errores propagados (REQ-05).

```ts
// src/lib/fs-atomic.ts — firma y esqueleto
export async function writeFileAtomic(filePath: string, data: string): Promise<void> {
	const absolutePath = path.resolve(filePath)
	const tempPath = path.join(path.dirname(absolutePath),
		`.${path.basename(absolutePath)}.${process.pid}.${Date.now()}.tmp`)
	const prev = mutexes.get(absolutePath) ?? Promise.resolve()
	const operation = prev.then(async () => {
		await fs.mkdir(path.dirname(absolutePath), { recursive: true })
		try {
			await fs.writeFile(tempPath, data, 'utf-8')
			await renameWithRetry(tempPath, absolutePath) // EPERM/EACCES → retry
		} catch (error) {
			await fs.rm(tempPath, { force: true }).catch(() => {})
			throw error
		}
	})
	mutexes.set(absolutePath, operation.catch(() => {}))
	return operation
}
```

Aplicación: `saveState` (app-state.ts) y `saveReferenceUrls` (reference-url-manager.ts) reemplazan `fs.writeFile` por el helper conservando el tip EACCES actual de `saveState` y el formato `JSON.stringify(state, null, 2)` UTF-8 (REQ-04/ESC-07).

### D-5: Shell estático en `/` y `/login` (patrón Suspense)

| Opción | Tradeoff | Decisión |
|---|---|---|
| Gate top-level + `instant = false` (actual) | Bloquea prerender del shell | Descartado |
| Gate dentro de `<Suspense>` (patrón doc: *wrap runtime data access in Suspense*) | Shell estático; redirect se difiere tras el stream (seguridad cubierta por `src/proxy.ts`, defensa en profundidad en el gate) | **Elegido** |

```tsx
// src/app/page.tsx — shell estático (sin instant=false)
export default function Dashboard() {
	const dict = getDictionary(defaultLocale) // estático, sin headers
	return (
		<div className='flex-1 p-8'>
			<div className='max-w-7xl mx-auto space-y-8'>
				<div className='flex flex-col gap-2'>
					<h1 className='text-4xl font-bold tracking-tight text-foreground'>{dict.dashboard.title}</h1>
					<p className='text-muted-foreground'>{dict.dashboard.description}</p>
				</div>
				<Suspense fallback={<DashboardSkeleton />}>
					<DashboardGate />
				</Suspense>
			</div>
		</div>
	)
}
```

`DashboardGate` (nuevo server component, `src/components/dashboard-gate.tsx`): `checkAuth()` + `getLocale()` (runtime, dentro del Suspense) → `redirect('/login')` si no-auth → dict localizado → header localizado (logout + form `refresh` con 4 `updateTag`) → `<DashboardContent locale={locale} />`. **Cabecera localizada**: el shell usa `getDictionary(defaultLocale)` como fallback estático; el gate re-renderiza el header con el locale detectado (flash EN→locale aceptable; REQ-01 exige shell sin cookies/headers). `/login`: `LoginGate` dentro de Suspense (redirect si `!AUTH_HTPASSWD` o autenticado; `getLocale` + `LoginForm`). `layout.tsx` NO se toca (Block nonce CSP + locale; `instant = false` en el layout hace que `false` en el árbol supere a cualquier `true` más profundo para la validación de static shell — doc `instant`). `DashboardContent` y el render de datos quedan tras el gate.

**Veredicto riesgo Gate 2.4**: el bloqueo NO aplica hoy. El fallo de obs #550 fue la prerenderización de `/_not-found` con client providers del layout al habilitar `cacheComponents`; ahora `cacheComponents: true` ya está activo con el layout opt-out, y los scopes `"use cache"` son funciones de datos (no componentes que rendericen providers). Los providers client (`ThemeProvider`, `ProgressProviders`, `TooltipProvider`, `Toaster`, `DashboardProvider`) permanecen fuera de cualquier scope cached. Validación empírica en F1 con `pnpm build`.

## Flujo de datos

```
[Scheduler] ── listContainersRaw/listImagesRaw ──────────► daemon (sin caché)
[Dashboard]  ── DashboardGate (auth+locale) ──► DashboardContent
                  ├─ getContainers()        'use cache' minutes  docker:containers
                  ├─ getImages()            'use cache' minutes  docker:images
                  ├─ getDockerConnected()   'use cache' seconds  docker:connection
                  └─ getContainerUpdateStates() 'use cache' 15m  registry:checks
                         └─ registry-updates.ts (checkImageUpdate/checkGhcrUpdate)
[Refresh]    ── updateTag ×4 ──► invalida {docker:* , registry:checks} → re-render fresh
[Stores]     ── writeFileAtomic(temp+rename+mutex) ──► data/dashboard-state.json,
                                                       data/reference-urls.json
```

## Cambios de archivos

| Archivo | Acción | Descripción |
|---|---|---|
| `src/lib/cache-tags.ts` | Crear | Constantes `CACHE_TAGS` (4 tags) + perfiles explícitos |
| `src/lib/registry-updates.ts` | Crear | `checkImageUpdate`/`checkGhcrUpdate`/`getContainerUpdateStates` `"use cache"` |
| `src/lib/fs-atomic.ts` | Crear | `writeFileAtomic` (temp+rename+mutex+retry) |
| `src/components/dashboard-gate.tsx` | Crear | Gate auth+locale+refresh (4 updateTag) + header localizado |
| `src/components/login-gate.tsx` | Crear | Gate de `/login` (redirects + locale + LoginForm) |
| `src/lib/docker-inventory.ts` | Modificar | Wrappers `unstable_cache` → `"use cache"`+`cacheLife`+`cacheTag` |
| `src/actions/docker.ts` | Modificar | Quitar `next.revalidate`, delegar registry a registry-updates, quitar `'use server'` redundante |
| `src/lib/app-state.ts` | Modificar | `saveState` → `writeFileAtomic` |
| `src/lib/reference-url-manager.ts` | Modificar | `saveReferenceUrls` → `writeFileAtomic` |
| `src/components/dashboard-content.tsx` | Modificar | Sin file cache/isStale/`'checking'`; usa `getContainerUpdateStates` |
| `src/hooks/use-container-updates.ts` | Modificar | Eliminar check inicial + escrituras cache + `isStale`; conservar update click/verify |
| `src/app/page.tsx` | Modificar | Quitar `instant=false`; shell estático + `<Suspense><DashboardGate/></Suspense>` |
| `src/app/login/page.tsx` | Modificar | Quitar `instant=false`; shell + `<Suspense><LoginGate/></Suspense>` |
| `src/lib/cache/containers.ts` | Eliminar | Reemplazado por `fs-atomic.ts` (helper extraído antes) |
| `src/actions/container-cache.ts` | Eliminar | Sin file cache |
| `src/lib/fs-atomic.test.ts`, `src/lib/cache-tags.test.ts` | Crear | Tests Vitest |
| `AGENTS.md`, `NOTIFICATIONS.md`, `PRODUCT.md` | Modificar | Doc drift: `notifications-state` → `dashboard-state` |
| `data/containers-cache.json` | Eliminar | Runtime, gitignored |

## Interfaces / Contratos

```ts
// src/lib/cache-tags.ts
export const CACHE_TAGS = {
	containers: 'docker:containers',
	images: 'docker:images',
	connection: 'docker:connection',
	registry: 'registry:checks'
} as const
export const REFRESH_TAGS: readonly string[] = [
	CACHE_TAGS.containers, CACHE_TAGS.images,
	CACHE_TAGS.connection, CACHE_TAGS.registry
]
export const INVENTORY_CACHE_PROFILE = 'minutes'
export const CONNECTION_CACHE_PROFILE = 'seconds'
export const REGISTRY_REVALIDATE_SECONDS = 900
export const REGISTRY_EXPIRE_SECONDS = 3600

// src/lib/registry-updates.ts
export interface ContainerUpdateState {
	containerId: string
	hasUpdate: boolean
	updateStatus: FilterStatus | 'local'
	currentVersion?: string
	displayCurrentVersion: string
	latestVersion?: string
	lastUpdated?: string
	dockerHubUrl?: string
	isUpToDate: boolean
	policyState?: PolicyState
	ghcrError?: 'invalid_token'
	ghcrImageName?: string
}
export async function checkImageUpdate(imageName: string, localDigest?: string): Promise<CheckImageUpdateResult> // 'use cache', registry tag
export async function checkGhcrUpdate(fullImageName: string, localDigest?: string): Promise<CheckImageUpdateResult> // 'use cache', registry tag
export async function getContainerUpdateStates(): Promise<ContainerUpdateState[]> // 'use cache', registry tag
```

`ContainerInfo`/`ImageInfo` ya son JSON puro (los readers hacen `JSON.parse(JSON.stringify(...))`) → argumentos/retornos serializables para `"use cache"`.

## Estrategia de testing

| Capa | Qué | Enfoque |
|---|---|---|
| Unit (Vitest) | `writeFileAtomic`: happy path (temp+rename, JSON válido, sin `.tmp` residual), mutex serializa 2 writes (último completo), retry EPERM/EACCES con backoff, error propagado sin temp huérfano, formato pretty 2 espacios | `fs-atomic.test.ts` (tmp dir real) |
| Unit (Vitest) | `cache-tags`: 4 tags únicos; `REFRESH_TAGS` = exactamente 4 = tags declarados; perfiles explícitos | `cache-tags.test.ts` |
| Build | Compilación de directivas `"use cache"` (validación de scope), opt-outs 3 → 1, static shell de `/` y `/login` | `pnpm build` |
| Smoke (manual) | Middleware intacto (redirects); HTML estático de `/` sin datos de contenedores; refresh read-your-writes; scheduler con readers crudos | `pnpm dev`/`start` |

Los scopes `"use cache"` no ejecutan en Vitest (directiva de compilación de Next); los tags se verifican vía constantes compartidas y el runtime en build/smoke.

## Threat Matrix

N/A — el cambio no introduce routing, shell, subprocess, VCS/PR automation, clasificación de ejecutables ni integración de procesos.

## Migración / Rollout (fases con verificación)

| Fase | Alcance | Verificación |
|---|---|---|
| **F1** inventory-cache | `cache-tags.ts`, wrappers `"use cache"`, `registry-updates.ts`, `docker.ts` sin `next.revalidate`, refresh 4 `updateTag` | `pnpm build` OK (opt-outs siguen 3); `rg unstable_cache src` → 0; smoke: dashboard sirve datos cacheados |
| **F2** fin file cache + atómico | F2a: `fs-atomic.ts` + tests + aplicar a stores. F2b: borrar file cache, `dashboard-content`/hook sin cache/isStale/`checking`, estado updates vía `getContainerUpdateStates` | `pnpm test` verde; `rg containers-cache src` → 0; `rg fs\.writeFile\( src/lib/app-state.ts src/lib/reference-url-manager.ts` → 0; smoke: refresh sin round-trip |
| **F3** shell `/` | `page.tsx` sin `instant=false` + `dashboard-gate.tsx` | Build opt-outs 3 → 2; smoke: primer paint del shell inmediato |
| **F4** shell `/login` | `login/page.tsx` sin `instant=false` + `login-gate.tsx` | Build opt-outs 2 → 1; `rg instant\s*=\s*false src/app/page.tsx src/app/login/page.tsx` → 0; smoke: HTML estático sin datos |

Rollback: `git revert` por fase (cortes independientes). Sin migración de datos (mismo esquema/ubicación de stores).

## Open Questions

- [ ] **Discrepancia de criterio en spec static-shell REQ-04**: "opt-outs 3 → 1 (layout)" exige conservar `instant = false` en el layout, pero el criterio "`rg instant\s*=\s*false src/app` → 0" lo contradice. Interpretación adoptada: 0 opt-outs en `page.tsx`/`login/page.tsx`, 1 total (layout); el rg se aplica solo a esas dos páginas. Validar con el orchestrator en tasks/verify.
- [ ] Header duplicado (estático default → localizado tras gate): flash EN→locale aceptable, o mover todo el header tras el gate (shell sin header). Decisión pendiente de preferencia de UX.
- [ ] `checkImagesUpdatesBatch`: se conserva en `docker.ts` (usado por verify post-update) o se elimina si `getContainerUpdateStates` cubre todos los flujos. Pendiente de tareas F2.
- [ ] Simplificar `loading-events`/`refresh-progress-bar` a solo `formPending` (checkProgress queda muerto al eliminar el check inicial).
