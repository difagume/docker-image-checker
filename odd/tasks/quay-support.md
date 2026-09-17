# Quay.io support (Registry V2 anónimo)

## Objetivo

Soportar imágenes `quay.io/{ns}/{repo}[:tag]` en el check de updates para que
dejen de mostrar "Imagen desconocida" cuando el repo y el tag existen.

## Problema (verificado puntual, no re-explorado de cero)

- `src/lib/registry-updates.ts:129-151` — `checkImageUpdateRaw` solo ramifica
  `ghcr.io` + proxies de Hub (`lscr.io`, `docker.hyperdx.io`, `docker.io`,
  `registry-1.docker.io`). Todo lo demás cae al endpoint de Hub
  `https://hub.docker.com/v2/repositories/{repo}/tags`, que para
  `quay.io/ns/repo` (3 segmentos) devuelve 400/404 → sin `latestDigest` →
  `resolveUpdateStatus` devuelve `unknown` (`registry-updates.ts:42-50`).
- `src/lib/image-name.ts:16-38` — `parseImageReference` no separa registry
  (devuelve `repository` con host incluido); la rama Quay debe hacer
  `strip quay.io/` ella misma, igual que hace la rama GHCR
  (`registry-updates.ts:293-295`).
- Superficie del síntoma: `src/components/container-card.tsx:407-408` +
  `es.json:34` ("Imagen desconocida").
- Herencia confirmada: `src/lib/notifications/notification-service.ts`
  usa `checkImageUpdateRaw` como checker por defecto y
  `getContainerUpdateStates` (`registry-updates.ts:487-560`) llama a
  `checkImageUpdate` (cached → `checkImageUpdateRaw`), así que ambos heredan
  la rama Quay sin cambios.

## Por qué

Quay V2 anónimo es suficiente para repos públicos y no requiere token.
Autorizado por el usuario: "Implementar Quay V2" (Registry V2 anónimo,
sin token).

## Alcance autorizado

- SOLO `quay.io` público vía Registry V2 anónimo. Sin `QUAY_TOKEN`, sin env
  nueva.
- Sin renombrar `dockerHubUrl` (solo limpieza mínima si el diff lo exige).
- Sin tocar inventario del daemon (`src/lib/docker-inventory.ts`).
- Un solo writer, sin writers paralelos.
- Push NO (queda bajo policy ordinaria del repo).

## Constraints

- Reutilizar `fetchWithTimeout` (8s), `classifyRegistryError`,
  `UNKNOWN_TAG_STRATEGY` y `evaluatePolicies` (gemela de la rama GHCR).
- Flujo V2: `GET https://quay.io/v2/{ns}/{repo}/tags/list` con bearer de
  `https://quay.io/v2/auth?service=quay.io&scope=repository:{ns}/{repo}:pull`
  (anónimo para repos públicos); luego
  `GET /v2/{ns}/{repo}/manifests/{tag}` con `Accept: docker v2 + oci index`
  para `Docker-Content-Digest` + fecha. Mapear a `RemoteTag[]`, pasar por
  `evaluatePolicies`, view URL `https://quay.io/repository/{ns}/{repo}`.
- Wrapper cacheado igual que `checkGhcrUpdate` (`cacheLife`/`cacheTag`
  registry).
- Estilo Biome: tabs, single quotes, sin semicolons, LF, organizeImports.

## Runner TDD (fuente + comando exacto)

- Fuente: `package.json:15` (`"test": "vitest run"`) + `bun.lock` presente.
  La contradicción citada (AGENTS.md `bun run test` vs memoria vieja
  `pnpm test`) se resuelve a favor de `package.json` + lockfile:
  **runner real `bun run test`** (= `vitest run` vía Bun).
- Modo: ODD sin ceremonia RED-GREEN obligatoria; checks funcionales
  ordinarios + tests espejo de registry-updates para quay.

## Checks aplicables

1. `bun run test` (suite Vitest completa; incluye espejo quay nuevo).
2. `bunx biome lint src/lib/registry-updates.ts src/lib/registry-updates.test.ts`
3. `bunx biome format src/lib/registry-updates.ts src/lib/registry-updates.test.ts`
   (check-only; si el repo usa otro modo, registrar el comando real usado).

## Criterios de aceptación

1. `quay.io/thefrenchghosty/openchamber` (u otro repo público con tag
   existente) ya no da `unknown` cuando repo y tag existen (mock o live
   según red): tag existente ⇒ `available`/`updated` con digest.
2. Tag inexistente ⇒ `unknown` (vía `UNKNOWN_TAG_STRATEGY`, sin digest).
3. Link apunta a `https://quay.io/repository/{ns}/{repo}`.
4. Sin regresión en ghcr/hub (suite verde).

## Checklist

- [x] **T1** — Feature doc + mirror Engram (`odd/tasks/quay-support.md`,
  topic `odd/quay-support/tasks`). 5 tareas. Commits: —
- [x] **T2** — Rama `feat/quay-support` + `checkQuayUpdateRaw` en
  `src/lib/registry-updates.ts` (rama `quay.io/` + wrapper cacheado
  `checkQuayUpdate`). Commits: —
- [x] **T3** — Tests espejo quay en `src/lib/registry-updates.test.ts`
  (tag existente ⇒ digest + available/updated; tag inexistente ⇒ unknown).
  Commits: —
- [x] **T4** — Verificación (`bun run test` + biome lint/format) con
  resultados observados registrados aquí. Commits: —
- [x] **T5** — Commit(s) work-unit + actualización final del doc y mirror.
  Commits: `45afd35` feat + docs de cierre (ver abajo).

## Estrategia de entrega

`ask-on-risk` por defecto: si aparece riesgo fuera del alcance autorizado
(auth privada, cambio de inventario, renombrado de campos), parar y preguntar
antes de continuar.

## Forecast inicial

Heurística advisory (~400 líneas authored por tarea): se espera muy por
debajo — estimación ~120-180 líneas authored totales (implementación
~80-110 + tests ~40-70, excluye generados). Si la solución clara supera
~400, se explica el porqué y se continúa; nunca se borran espacios/
comentarios ni se omiten tests para ahorrar líneas.

## Log de outcomes (solo resultados observados)

- T1: doc creado con 5 tareas antes del primer write en `src/`; mirror Engram
  `odd/quay-support/tasks` guardado (id obs, `judgment_required: false`).
- T2: rama `feat/quay-support` creada desde `master`;
  `checkQuayUpdateRaw` + rama `quay.io/` + wrapper `checkQuayUpdate`
  añadidos en `src/lib/registry-updates.ts` (+195 líneas).
- T3: 4 tests espejo quay añadidos en
  `src/lib/registry-updates.test.ts` (+129 líneas): routing V2 sin Hub,
  tag existente ⇒ digest + URL + available/updated, tag inexistente ⇒
  UNKNOWN_TAG_STRATEGY/unknown, repo 404 ⇒ unknown no-transient.
- T4: `bun run test` ⇒ 42 files / 322 tests passed. `bunx biome lint`
  (2 ficheros) ⇒ 0 errores en código nuevo; 4 warnings preexistentes
  `noNonNullAssertion` en B-01 (líneas 20-24, no tocadas). `bunx biome format`
  ⇒ 1 diff aplicado a bloque nuevo del test; re-check limpio y suite verde.
- T5: (pendiente identidad de commits)
- T5: `45afd35` feat(registry) con impl + tests + doc (T1-T4). Este cierre
  del doc viaja en commit docs separado. Push NO (policy ordinaria).
