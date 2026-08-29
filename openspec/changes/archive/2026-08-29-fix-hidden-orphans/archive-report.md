# Archive Report — fix-hidden-orphans

- **Date**: 2026-08-29
- **Status**: archived
- **Commit (implementation)**: b3514ba feat(hidden-orphans): server-inject bootstrap and orphan GC via prefix-aware idsEqual

## Migrated artifacts

- proposal.md, design.md, tasks.md, verify.md, verify-report.md
- specs/hidden-bootstrap, specs/orphan-remap, specs/state-persistence

Note: `apply-progress.md` does not exist for this change; task progress is tracked in `tasks.md`.

## Spec sync

- `openspec/specs/hidden-bootstrap/spec.md` — created (new capability, full spec).
- `openspec/specs/orphan-remap/spec.md` — created (new capability, full spec).
- `openspec/specs/state-persistence/spec.md` — REQ-02 replaced with MODIFIED delta version (atomic saves + remap `remapHiddenIds` + orphan GC `gcHiddenIds`, `runExclusive` serialization, prefix-aware 12 vs 64).
