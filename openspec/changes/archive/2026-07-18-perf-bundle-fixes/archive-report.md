# Archive Report: Perf & Bundle Fixes

**Archived at**: 2026-07-18
**Previous location**: `openspec/changes/perf-bundle-fixes/`
**Archive location**: `openspec/changes/archive/2026-07-18-perf-bundle-fixes/`

## Artifact Inventory

| Artifact | Source | Status |
|----------|--------|--------|
| Proposal | engram #495 + openspec | ✅ archived |
| Spec | N/A | ⏭️ skipped (pure refactor, no behavioral spec) |
| Design | N/A | ⏭️ skipped (surgical fixes, no architecture design) |
| Tasks | engram #496 | ✅ archived (stale checkboxes reconciled) |
| State | engram #497 | ✅ archived |
| Verify Report | engram #500 | ✅ archived |

## Stale Checkbox Reconciliation

The tasks artifact persisted all 8 items as `- [ ]` (unchecked) because `sdd-apply` did not update the persisted artifact after implementation. The orchestrator explicitly instructed archive to proceed with reconciliation backed by the verify report which proves all tasks complete and a clean build (Next.js 16.2.2 Turbopack, exit 0). This is an **intentional-with-warnings** archive per SDD archive policy.

## Files Changed

| File | Change |
|------|--------|
| `src/components/ui/button.tsx` | Barrel import → `@radix-ui/react-slot` |
| `src/components/ui/alert-dialog.tsx` | Barrel import → `@radix-ui/react-alert-dialog` |
| `package.json` | Removed `radix-ui` dependency |
| `next.config.ts` | Added `optimizePackageImports: ['lucide-react']` |
| `src/components/dashboard-content.tsx` | Removed `'use server'` directive |
| `src/lib/i18n/dictionaries.ts` | Wrapped `getDictionary` with `React.cache()` |
| `src/components/container-dashboard.tsx` | Dual responsive inputs + direct prop comparison |

## Engram Observation IDs

| Topic Key | ID |
|-----------|-----|
| `sdd/perf-bundle-fixes/proposal` | 495 |
| `sdd/perf-bundle-fixes/tasks` | 496 |
| `sdd/perf-bundle-fixes/state` | 497 |
| `sdd/perf-bundle-fixes/verify-report` | 500 |
| `sdd/perf-bundle-fixes/archive-report` | (current) |

## SDD Cycle Complete

The change has been fully planned, implemented, verified, and archived.
