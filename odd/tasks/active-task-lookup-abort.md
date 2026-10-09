# active-task-lookup-abort — Fix `active-task lookup aborted (timeout 1500ms)`

## Objective
Eliminar los 3 avisos `[Update] active-task lookup aborted (timeout 1500ms)` al cargar el dashboard en dev, sin romper el contrato "un backend muerto no estanquea ni desactiva la UI".

## Problem
`lookupActiveUpdateTasks` abortaba por timeout a los 1500 ms aunque `/api/update-progress/active` responde en ~10 ms. Causa: timer local cubría fetch+`res.json()`, presupuesto de 1500 ms demasiado estrecho para el camino de montaje durante hidratación RSC/PPR, y cleanup no cancelaba fetch en vuelo.

## Why
Hipótesis 1 (cola de hidratación) ganó en exploración: controller local + coste servidor ms + 3 warns = cadena de montaje (1+2 reintentos).

## Scope
- `src/lib/update-progress-client.ts`
- `src/hooks/use-container-updates.ts`
- `src/lib/update-progress-client.test.ts`

## Constraints
- No tocar `Route "/": ... Date.now() while prerendering` (falso positivo Turbopack).
- Contrato `null`+warn intacto.
- Corroboración (~349) mantiene 1500 ms.

## Authorized scope
Solo los 3 archivos de Scope.

## Acceptance criteria
- [x] Timer acotado a fase fetch (código + test de orden clearTimeout).
- [x] Montaje usa `ACTIVE_TASK_LOOKUP_MOUNT_TIMEOUT_MS=8000`; corroboración intacta en 1500 ms.
- [x] `bun run test` verde (25 files / 205 tests), `tsc` limpio, `biome` limpio (verificado por writer + verificador independiente + spot check del parent).
- [ ] Browser manual pendiente (usuario): cargar `/` sin los 3 warns; arrancar update, recargar, el progreso reaparece.

## Applicable checks
- `bun run test -- src/lib/update-progress-client.test.ts` → 19 passed (writer RED previo: 1 failed/15 passed en orden clearTimeout; parent spot check: 19 passed).
- `bunx tsc --noEmit` → limpio (writer + verifier TSC_EXIT:0).
- `bunx biome check <3 archivos>` → limpio tras `--write` inicial (verifier BIOME_EXIT:0).

## Delivery strategy
`single-pr` → aplicado como push directo a `master` según restricción del task original. Forecast ~108 líneas; real: 102 insertions + 6 deletions.

## Tasks
- [x] T1 — Timer acotado a fetch + constante mount. Route: delegated direct. Commit: `b0bd397`.
- [x] T2 — Montaje con timeout explícito + guard cancelled; corroboración intacta. Route: delegated direct. Commit: `b0bd397`.
- [x] T3 — 4 tests nuevos (timer-fetch, default-vs-mount, override, never-throws). Route: delegated direct. Commit: `b0bd397`.

## Route declaration
`delegated direct` con un solo writer (triggers: mapping >5 lookups, 2+ ficheros no triviales, lectura prepara escritura). Verificación: writer self-verification + verificador independiente (tier high) + spot check del parent. RDD: `on (decided by default)` pero `review status` refusa con `immutable_review_transport_unsupported` en este runtime → seguido camino RDD-off (assess `high` hot_path update, 3 paths, 108 líneas).

## Progress
- [x] Exploración, implementación, verificación independiente y spot check completos.
- Pendiente: browser check manual + push a master (este commit del doc va antes del merge).

## Verification evidence
- Writer: RED `1 failed/15 passed` → GREEN `25 files/205 tests`; `tsc` limpio; `biome` limpio tras format.
- Verifier independiente: `src/lib/update-progress-client.ts: pass` (clearTimeout línea 146, constantes 35/43, finally intacto); `use-container-updates.ts: pass` (mount 413-416, corroboración 350 intacta, cancelled 419, recovery 265-305 intacta); tests: pass; git scope: pass (108 líneas).
- Parent spot check: `bun run test -- src/lib/update-progress-client.test.ts` → 19 passed.
- Assess: `risk high (hot_path update-progress-client.test.ts)`, `changed_paths 3`, `changed_lines 108`, `review_due true/high_risk`; preflight `immutable_review_transport_unsupported` → documentado, sin bloqueo (runtime no elegible; soportados: claude-code, codex).

## Next step
Merge a `master` + push directo (autorizado por el task), luego browser check manual del usuario.

## Key decisions
- H1 → timeout por llamador (8000 ms montaje con reintentos, 1500 ms corroboración).
- H2 → `clearTimeout` tras fetch, antes de `res.json()` + `finally` como red.
- H3 → guard `cancelled` silencioso, sin compartir abort entre llamadores.
