# Spec Delta: fix-settings-gc — state-persistence (modified)

## MODIFIED — Dashboard settings sync (B-14)

### Requirement: SS-01 — No write on hydration
The dashboard settings sync (`useSettingsSync`) MUST NOT call `setDashboardSettingsAction` during its first effect run (hydration); server-rendered settings already reflect the persisted file.
- Scenario: load dashboard with zero interaction → state file mtime unchanged, log has no `setDashboardSettingsAction`.
- Scenario: user toggles a chip after load → persistence happens as before (≤~300 ms debounce).

## MODIFIED — Orphan GC liveness source (B-16)

### Requirement: SS-02 — GC validates against the daemon
`gcHiddenIdsAction`/`gcIgnoredIdsAction` MUST derive the live-id list from the Docker daemon (`listContainersRaw`, `all: true`) server-side, and MUST NOT trust client-supplied ids.
- Scenario: hidden id of a live container + stale cached inventory → id survives page load.
- Scenario: daemon unreachable → actions throw; hook's catch skips GC; nothing is pruned.
- Scenario: container recreated externally → its stale id is still purged (GC behavior preserved).
