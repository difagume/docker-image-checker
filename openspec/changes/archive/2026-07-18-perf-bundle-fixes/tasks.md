# Tasks: Perf & Bundle Fixes

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~50-70 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | single-pr |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low

## Phase 1: Dependencies & Imports (Barrel → Individual)

- [x] 1.1 `src/components/ui/button.tsx` — cambiar `import { Slot } from "radix-ui"` → `import { Slot } from "@radix-ui/react-slot"`
- [x] 1.2 `src/components/ui/alert-dialog.tsx` — instalar `@radix-ui/react-alert-dialog` vía `pnpm add @radix-ui/react-alert-dialog`, luego cambiar `import { AlertDialog as AlertDialogPrimitive } from "radix-ui"` → `import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog"`
- [x] 1.3 `package.json` — eliminar `"radix-ui": "^1.4.3"` de dependencies y ejecutar `pnpm install` para limpiar lockfile (solo si ningún otro archivo importa de `radix-ui`; verificado: solo estos dos)

## Phase 2: Config & Directivas

- [x] 2.1 `next.config.ts` — añadir `experimental: { optimizePackageImports: ['lucide-react'] }` (sin `radix-ui` porque ya no hay barrel imports)
- [x] 2.2 `src/components/dashboard-content.tsx` — eliminar la línea 1 `'use server'` (Server Component, no Server Action)

## Phase 3: Cache & Rendering

- [x] 3.1 `src/lib/i18n/dictionaries.ts` — añadir `import { cache } from "react"` y envolver `getDictionary` con `cache()`: `export const getDictionary = cache((locale: Locale): Dictionary => {...})`

## Phase 4: Dashboard (container-dashboard.tsx)

- [x] 4.1 Eliminar `const [placeholder, setPlaceholder] = useState(...)` (línea 201) y el `useEffect` de resize (líneas 548-563); reemplazar el `<Input>` único (línea 805) por dos inputs condicionales que comparten `searchQuery`/`setSearchQuery`:
  - Mobile: `<Input placeholder={dict.filter.placeholderMobile} className="... md:hidden ..." />`
  - Desktop: `<Input placeholder={dict.filter.placeholder} className="... hidden md:block ..." />`
- [x] 4.2 Reemplazar la comparación `JSON.stringify(lastSyncedSettings) === JSON.stringify(nextSettings)` (línea 570) con comparación directa de props: `lastSyncedSettings.activeFilters.length === nextSettings.activeFilters.length && lastSyncedSettings.activeFilters.every((f, i) => f === nextSettings.activeFilters[i]) && lastSyncedSettings.showHiddenMode === nextSettings.showHiddenMode`

## Implementation Order

1 → 2 → 3 → 4. Cada fase es independiente pero conviene hacer imports primero (Fase 1) porque desbloquea el build y permite verificar que no se pierde nada al remover `radix-ui`. Las fases 2-4 son cambios ortogonales sobre archivos distintos.

---

*Stale checkboxes reconciled at archive time: all 8 tasks verified as complete by verify-report and clean build. See verify-report.md for evidence.*
