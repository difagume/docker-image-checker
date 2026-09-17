# Quay.io card time (alimentar `lastUpdated` vía API v1 + fallback config-blob)

## Objetivo

Que las cards Quay (p. ej. `quay.io/thefrenchghosty/openchamber`) muestren el
tiempo relativo cuando hay update: alimentar `publishedAt`/`lastUpdated` para
Quay sin tocar engine ni card salvo bug.

## Problema (verificado puntual, no re-explorado de cero)

- `src/lib/registry-updates.ts:525-548` — `checkQuayUpdateRaw` resuelve cada
  tag a su digest vía `GET /v2/{ns}/{repo}/manifests/{tag}` y solo toma fecha
  del header `Last-Modified`, que Quay casi nunca sirve → `RemoteTag`
  sin `publishedAt` → `lastUpdated` undefined en el resultado (`:602`).
- `src/components/container-card.tsx:134` — la card ya oculta el tiempo con
  `{lastUpdated && (... <RelativeTime/> ...)}`; por eso con update pero sin
  fecha no se muestra nada. Card correcta, no tocar.
- `src/lib/policies/engine.ts` — decide por tags/digests; la fecha solo se
  propaga (`publishedAt` → `lastUpdated`). Engine correcto, no tocar.
- Superficie del síntoma: card Quay con update disponible pero sin
  `RelativeTime` porque `lastUpdated` es undefined.

## Por qué

Quay V2 no da fecha en headers, pero la API pública v1 sí expone
`last_modified` por tag, y el config-blob expone `created`. Con ambas fuentes
la card muestra el tiempo sin cambiar engine ni UI.

## Alcance autorizado

- SOLO alimentar `publishedAt`/`lastUpdated` para Quay vía API v1
  (`GET https://quay.io/api/v1/repository/{ns}/{repo}/tag/?specificTag={t}`
  o con limit y mapeo por nombre, campo `last_modified`) + fallback 2:
  manifest → `config.digest` → GET blob → campo `created`; mantiene
  `Last-Modified` del manifest como best-effort.
- Sin tocar `policies/engine.ts` ni `container-card.tsx` (ya correctos;
  card solo si bug bloqueante).
- Sin env nueva, sin cambiar Hub/GHCR.
- Un solo writer, sin writers paralelos.
- Push NO (queda bajo policy ordinaria del repo).

## Constraints

- Reutilizar `fetchWithTimeout` (8s) y el flujo V2 existente (bearer anónimo,
  `tags/list`, manifests con `Accept: docker v2 + oci index`).
- API v1 pública sin auth; un solo request con limit + mapeo por nombre de
  preferencia (fallback a `specificTag` por tag solo si hace falta).
- Fallback config-blob solo lazy para el tag objetivo (evita N fetches):
  re-fetch del manifest objetivo → `config.digest` (o `manifests[0].digest`
  → manifest hijo → `config.digest` en índices) →
  `GET /v2/{ns}/{repo}/blobs/{digest}` con bearer → campo `created`.
- Todo best-effort: si una fuente falla/404/429, se continúa con la
  siguiente; nunca se convierte un fallo de fecha en error del check.
- Estilo Biome: tabs, single quotes, sin semicolons, LF, organizeImports.

## Runner TDD (fuente + comando exacto)

- Fuente: `package.json:15` (`"test": "vitest run"`) + `bun.lock` presente
  (verificado en vivo, no memoria vieja). Runner real **`bun run test`**
  (= `vitest run` vía Bun).
- Modo: ODD sin ceremonia RED-GREEN obligatoria; checks funcionales
  ordinarios + tests espejo de registry-updates para fecha Quay.

## Checks aplicables

1. `bun run test -- src/lib/registry-updates.test.ts` (slice Quay-fecha).
2. `bun run test` (suite Vitest completa; sin regresión Hub/GHCR).
3. `bunx biome lint src/lib/registry-updates.ts src/lib/registry-updates.test.ts`
4. `bunx biome format src/lib/registry-updates.ts src/lib/registry-updates.test.ts`
   (check-only; si el repo usa otro modo, registrar el comando real usado).

## Criterios de aceptación

1. Con `last_modified` disponible (API v1) ⇒ `lastUpdated` definido y la
   card muestra el tiempo (card ya renderiza `RelativeTime` cuando hay fecha).
2. Sin fechas en ninguna fuente (ni v1, ni `Last-Modified`, ni blob) ⇒
   `lastUpdated` undefined y la UI oculta el tiempo como hoy.
3. Sin regresión en Hub/GHCR (suite verde).

## Checklist

- [x] **T1** — Feature doc + mirror Engram (`odd/tasks/quay-time.md`,
  topic `odd/quay-time/tasks`). Commits: `2057448` docs(odd) T1.
- [x] **T2** — `checkQuayUpdateRaw` en `src/lib/registry-updates.ts`: fecha
  por tag vía API v1 (`last_modified` → `publishedAt`) + fallback 2
  config-blob (`created`) + best-effort `Last-Modified`. Commits: `754cad5`
  feat(registry).
- [x] **T3** — Tests espejo fecha Quay en `src/lib/registry-updates.test.ts`
  (manifest sin Last-Modified + v1 con last_modified ⇒ definido; sin ambas
  ⇒ undefined; + bonus fallback blob). Commits: —
- [x] **T4** — Verificación (slice + suite + biome lint/format) con
  resultados observados registrados aquí. Commits: —
- [x] **T5** — Commit(s) work-unit + actualización final del doc y mirror.
  Commits: `2057448` docs T1 + `754cad5` feat T2 + `12eeb89` test T3-T4
  (+ este cierre docs). Push NO (policy ordinaria).
- [x] **T6** — Fix fecha push Quay (diagnóstico usuario 16/09 vs `06/09`
  mostrado): v1 a
  `GET /api/v1/repository/{ns}/{repo}/tag/?onlyActiveTags=true&limit=100`
  (o lazy `?specificTag={targetTag}&onlyActiveTags=true`) parseando
  `{name, manifest_digest, last_modified, start_ts}`; join por digest contra
  el Docker-Content-Digest del targetTag (duplicados: el que iguale digest
  o max `start_ts` activo). Sin `config-blob.created` como `lastUpdated`:
  si v1 falla (400/401) ⇒ `lastUpdated` undefined (card oculta tiempo).
  Sin tocar Hub/GHCR ni engine/card. Aceptación: con v1 ok la fecha cuadra
  con History (push 16/09); con v1 400/401 no se muestra build-time.
   Commits: `4972cd1` fix T6 (+ este cierre docs). Push NO.
- [x] **T7** — Precisión <48h en `src/lib/format-relative-time.ts`: <48h ⇒
  "hace X horas" (floor; 17h ⇒ 17 horas, no 1 día); >=48h comportamiento
  actual día/mes/año; i18n es/en/pt intacto; sin tocar registry ni card.

## Estrategia de entrega

`ask-on-risk` por defecto: si aparece riesgo fuera del alcance autorizado
(auth privada, cambio de engine/card, env nueva, regresión Hub/GHCR), parar
y preguntar antes de continuar.

## Forecast inicial

Heurística advisory (~400 líneas authored por tarea): solo guía, no cap ni
motivo de recorte. Se espera muy por debajo — estimación ~100-160 líneas
authored totales (implementación ~60-90 + tests ~40-70, excluye generados).
Si la solución clara supera ~400, se explica el porqué y se continúa; nunca
se borran espacios/comentarios ni se omiten tests para ahorrar líneas.

## Log de outcomes (solo resultados observados)

- T1: doc creado con 5 tareas antes del primer write en `src/`; mirror Engram
  `odd/quay-time/tasks` guardado (id obs 896, `judgment_required: false`);
  rama `feat/quay-time` creada desde `master`; commit `2057448`. Runner real
  verificado en vivo: `package.json:15` + `bun.lock` ⇒ `bun run test`.
- T2: helper `resolveQuayConfigCreated` + paso 2b API v1 (`?limit=100`,
  mapeo por nombre) + prioridad v1 → `Last-Modified` + fallback lazy solo
  tag objetivo. Engine sin `publishedAt` en decisiones (solo `types.ts:11`
  lo declara) ⇒ fallback lazy seguro. `engine.ts` y `container-card.tsx`
  intactos.
- T3: 3 tests nuevos en `src/lib/registry-updates.test.ts` (+~130 líneas):
  v1 con last_modified ⇒ definido; sin fuentes ⇒ undefined (+digest intacto);
  bonus fallback blob ⇒ `created` definido.
- T4: `bun run test -- src/lib/registry-updates.test.ts` ⇒ 22 passed.
  `bun run test` ⇒ 21 files / 166 passed (sin regresión Hub/GHCR).
  `bunx biome lint` (2 ficheros) ⇒ 0 errores en código nuevo; 4 warnings
  preexistentes `noNonNullAssertion` en B-01 (líneas 20-24, no tocadas).
  `bunx biome format` ⇒ 1 diff aplicado a bloque nuevo del test; re-check
  limpio y slice re-verde 22/22.
- T5: doc y mirror actualizados tras cada tarea; `engine.ts` y
  `container-card.tsx` intactos (`git status` solo muestra los 3 ficheros
  del alcance). Push NO.
- T6: v1 con `onlyActiveTags=true&limit=100` + join por digest
  (`manifest_digest` == Docker-Content-Digest; duplicados ⇒ digest o max
  `start_ts`); helper `resolveQuayConfigCreated` eliminado del path
  `lastUpdated` (blob `created` es build-time, no push). Slice
  `src/lib/registry-updates.test.ts` ⇒ 23 passed; suite ⇒ 21 files /
  167 passed; `bunx biome check --write` ⇒ 1 format aplicado al test;
   re-slice verde; lint solo 4 warnings preexistentes `noNonNullAssertion`
   B-01. Commit fix `4972cd1`. Push NO.
- T7: diff por `Instant` (epoch ms, UTC) antes del calendario; <48h ⇒
  minutos/horas floor (17h ⇒ "hace 17 horas"); >=48h calendario intacto.
  Slice nuevo `format-relative-time.test.ts` ⇒ 5 passed; suite ⇒ 22 files /
  172 passed; biome lint/format limpios. Registry y card intactos. Push NO.
- Cierre: PR #33 (https://github.com/difagume/docker-image-checker/pull/33)
  `feat/quay-time` → `master`, merge commit `3d1c0ec4fa6a9790316f60819d84178a066ed97a`
  (merge --merge, precedente PR #32). Rama local conservada, no borrada.
