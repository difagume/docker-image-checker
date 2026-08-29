# Archive Report: fix-verdict-cache

## Change Archived

**Change**: fix-verdict-cache
**Archived to**: `openspec/changes/archive/2026-08-29-fix-verdict-cache/` (hybrid) + Engram `sdd/fix-verdict-cache/archive-report` obs-305e9fa5cd1838fd
**Date**: 2026-08-29
**Mode**: hybrid
**Preflight**: interactive, both, auto-chain, 400, strict_tdd true

## Final-State Authority

Hierarchy: (1) persisted tasks 18/18, (2) orchestrator final-state facts, (3) intermediate snapshots. No unrankable contradictions.

- Final-state facts: apply 2 commits 361 lines (1e03bb0 + 22ce14f), verify 21/21 scenarios pass, no critical, year guard broadened to major>2000 (covers 2024.0 parts=2), cache poison bounded by updateTag, tasks 18 done, tests 90/90, issues #13 #22 #25 closed via fix.
- Tasks: 18/18 ticked after reconciliation; apply-progress + verify + commits prove completion.
- Snapshots: verify-report pass_with_warnings @2026-08-29T14:16, apply-progress @2026-08-29T13:58; warnings attributed to verification time, fixed at close.

## Specs Synced

| Domain | Action | Details |
|--------|--------|---------|
| registry-verdict | Created | NEW spec with 5 states, parseImageReference, resolveLocalDigest, explicit unknown, candidate-based year guard, 404 classification, scheduler parity |
| inventory-cache | Updated | REQ-03/REQ-04 MODIFIED: distinct undefined cache key, absent digest unknown until updateTag (ESC-05b/c), no next.revalidate inside use cache + cacheTag registry:checks + cacheLife 900/3600, UNKNOWN_TAG_STRATEGY latestDigest undefined + unknown (GHCR parity ESC-07b). Preserved REQ-01/02/05/06. |

Source of truth:
- openspec/specs/registry-verdict/spec.md (new, mechanical cp diff 0)
- openspec/specs/inventory-cache/spec.md (merged)

### Mechanical Verification

Registry-verdict mechanical copy:
```
diff cp->temp status 0 (empty)
diff source->target status 0 (empty)
```
Archive move:
```
cp -R source -> snapshot/source status 0
git mv status 0
diff snapshot/source -> destination status 0 (empty) - PASS
```
Verbatim empty diff only passing evidence. Archive-report additive-only excluded.

## Archive Contents

- proposal.md ✅ obs-8afdde31373bf74c
- specs/registry-verdict/spec.md ✅
- specs/inventory-cache/spec.md ✅
- design.md ✅ obs-d1bd077447da13df
- tasks.md ✅ 18/18 obs-de47b16315aac56e reconciled
- exploration.md ✅ obs-6077192c6697cfec
- apply-progress.md ✅ filesystem 2026-08-29T13:58
- verify.md ✅ 21/21 obs-64221e04d4ac5d5a
- spec source sdd/fix-verdict-cache/spec obs-4341184d42800e0c

Checks: active changes no longer has fix-verdict-cache; archive contains all artifacts; tasks.md no unchecked.

## Task Completion Gate

PASSED 18/18 [x]. Reconciliation: stale - [ ] remained despite proof via commits 1e03bb0/22ce14f and 90/90 tests; orchestrator facts confirm done. Recorded per strict policy.

## Verification Final State

- Tests 90/90, 14 files, npx vitest run --reporter=verbose
- Build next build passed
- Scenarios 21/21, Blockers 0, Critical 0
- Warnings fixed at close: W1 ticked, W2 intentional broadening, W3 pnpm wrapper noted, W4 biome 0 errors
- No split(':') remains
- Issues #13 #22 #25 closed via fix

## Engram Traceability

733 explore, 734 proposal, 735 spec, 736 design, 737 tasks, 738 verify-report, 739 archive-report (this)

## SDD Cycle Complete

Planned, implemented (strict TDD), verified, archived. Specs are source of truth.

## Next Recommended

none

## Risks

- 900s poison if no refresh, bounded by TTL/updateTag (low)
- Year guard over-filter for legitimate year-versioned (allowlist future)
- Simple-name 404 nginix stays local per spec

## Skill Resolution

Loaded C:\Users\USER\.config\opencode\skills\sdd-archive\SKILL.md via SKILL directive, hybrid mode, no registry search needed.
