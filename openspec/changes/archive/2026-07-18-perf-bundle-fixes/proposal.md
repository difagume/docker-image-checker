# Proposal: Perf & Bundle Fixes

## Intent

Bundle bloat, directivas incorrectas y overhead innecesario detectados en una auditoría contra Vercel React Best Practices. Código que funciona pero penaliza bundle, renderizado y mantenibilidad.

## Scope

### In Scope
1. Barrel imports de `radix-ui` → paquetes individuales (`react-slot`, `react-dialog`)
2. `optimizePackageImports` para `lucide-react` en `next.config.ts`
3. Eliminar `'use server'` de `dashboard-content.tsx` (Server Component, no Action)
4. `React.cache()` para `getDictionary` — deduplicar llamadas en el request
5. Placeholder responsive con JS+resize → dos inputs con `md:hidden`/`hidden md:block`
6. `JSON.stringify` para comparación → comparación directa de props

### Out of Scope
Refactors mayores, tests, accesibilidad, sistema de notificaciones.

## Capabilities

None — sin cambios de comportamiento observable. Refactor interno únicamente.

## Approach

6 intervenciones quirúrgicas, una por archivo:

1. `button.tsx`: `radix-ui` → `@radix-ui/react-slot`
2. `alert-dialog.tsx`: `radix-ui` → `@radix-ui/react-dialog`
3. `package.json`: `pnpm remove radix-ui` si queda huérfano
4. `next.config.ts`: `experimental: { optimizePackageImports: ['lucide-react'] }`
5. `dashboard-content.tsx`: borrar línea `'use server'`
6. `dictionaries.ts`: `import { cache } from 'react'; export const getDictionary = cache(...)`
7. `container-dashboard.tsx`: dos inputs condicionales + comparación directa de props

## Affected Areas

| Area | Impact |
|------|--------|
| `src/components/ui/button.tsx` | Import path |
| `src/components/ui/alert-dialog.tsx` | Import path |
| `package.json` | Remove dep |
| `next.config.ts` | Add optimize config |
| `src/components/dashboard-content.tsx` | Remove directive |
| `src/lib/i18n/dictionaries.ts` | Wrap with cache() |
| `src/components/container-dashboard.tsx` | Responsive + comparison |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `radix-ui` usado en otro lugar | Low | `pnpm ls radix-ui` post-cambio |
| `'use server'` eliminada expone algo | Medium | Verificar que el componente solo renderiza JSX |
| `optimizePackageImports` no soportado | Low | Estable desde Next 14 |

## Rollback Plan

`git checkout` por archivo individual. Cada fix es independiente.

## Dependencies

Ninguna. `@radix-ui/react-slot` y `@radix-ui/react-dialog` ya instalados.

## Success Criteria

- [ ] `pnpm build` sin errores
- [ ] Dashboard funcional en `pnpm dev`
- [ ] Sin barrel-warnings de `radix-ui` en build
- [ ] Placeholder responsive sin resize listener
