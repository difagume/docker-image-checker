# Feature: stats-visible-hidden-counts

## Objective
Distinguir en las 3 stat cards entre contenedores visibles y ocultos (A + toque C).

## Problem
`dynamicStats` cuenta sobre `containers` completo; la lista filtra ocultos. Resultado: "11 actualizaciones" con solo 4 cards visibles.

## Why
Evitar confusión conteo vs visible. Verificado en `container-dashboard.tsx:93-105` vs `:115-148`.

## Scope
- `src/components/container-dashboard.tsx` — dividir memo en visible/hidden por status
- `src/components/stats-summary.tsx` — sublínea `+N ocultas` + badge clicable que activa showHiddenMode, con aria-label completo
- i18n: reutilizar `dict.stats` existente; si falta clave, fallback ES/EN inline sin romper tipos

## Constraints
- NO commits (orden explícita del usuario). No push, no PR.
- Sin cambios backend. Solo cliente, datos ya disponibles (`containers` + `hiddenContainerIds`).
- Evitar botón-dentro-de-botón: el subtexto clicable debe ser span con onClick + teclado o botón hermano, no `<button>` anidado.
- Route: delegated direct (writer trigger: 2 archivos). Trigger evidence: 2 non-trivial files.

## Tasks
- [x] T1 Dividir `dynamicStats` en `{visible, hidden, total}` por `updated/available/unknown`, usando `hiddenContainerIds.includes(Id)` consistente con `filteredContainers`
- [x] T2 Render en `StatFilterCard`: número grande = visible (o total cuando `showHiddenMode=true`), sublínea `+N ocultas · M total` en `text-xs`, badge clicable `EyeOff` → `onToggleShowHidden`, `aria-label` con desglose, sin romper `aria-pressed`/filtros
- [x] T3 Verificación: `bunx tsc --noEmit` (o `bun run build` si tsc no aislado) + `bunx biome check` en archivos tocados + readback visual vía snapshot

## Authorized scope
Implementación autorizada por usuario 2026-09-22: opción A+C, sin commits.

## Acceptance criteria
- Con ocultos y `showHiddenMode=false`: card disponible muestra `4` grande + `+7 ocultas · 11 total` (números según datos reales).
- Con `showHiddenMode=true`: grande pasa a total (11) y sublínea indica modo o se oculta si hidden=0.
- Si hidden=0 en una categoría, no mostrar sublínea (evitar ruido).
- Click en sublínea/badge de ocultas activa vista de ocultos sin romper filtro de status.
- Sin regresión: filtros status, search, sort, `showHiddenMode` toggle existente siguen funcionando.

## TDD
- Mode: off (UI sin tests existentes para estos componentes; blast radius confirma no tests en 3 saltos). Source: sin config TDD en repo + sin elección explícita.
- Checks aplicables: typecheck + biome + readback, no RED/GREEN.

## Progress
- 2026-09-22: doc creado, pendiente T1.
- 2026-09-22: T1+T2 implementados. Evidencia: `bunx tsc --noEmit` limpio; `bunx biome check src/components/container-dashboard.tsx src/components/stats-summary.tsx` limpio (tras 1 fix de formato). Decisiones: `StatCounts {visible,hidden,total}` como struct único (sin proliferar boolean props); `StatsSummary` recibe `updated/available/unknown: StatCounts` + `locale` y resuelve singular/plural con el conteo mostrado; sublínea solo si `hidden>0`; i18n sin tocar JSON (helpers inline es/en/pt con `Locale`); accesibilidad con botón hermano (la card raíz pasó de `<button>` a `<div>` con dos `<button>` hermanos: filtro con `aria-pressed` intacto + toggle de ocultos con `aria-label` de desglose) tras descartar `span role=button` anidado (biome `useSemanticElements` + parse JSX). Sin commits.

## Next step
- Completado 2026-09-22: parent spot-check `bunx biome check` limpio (2 files, 16ms) + readback estructural del diff (split + botones hermanos + aria). Sin commits por orden explícita. Pendiente solo comprobación visual manual en dashboard con datos reales.
