# Spec Delta: fix-notify-race — notification-dedup (via state-persistence scope)

## MODIFIED — Dedup at send time (B-07)

### Requirement: ND-01 — Reserva atómica antes del envío
`checkAndNotify` MUST consult dedup state freshly (under `runExclusive`) and reserve the notification (`markAsNotified`) BEFORE dispatching to providers, as one atomic decide-and-reserve step. Round-start snapshots MUST NOT gate sends.
- Scenario (B-07 overlap): round A slow (network), round B starts while A in flight → B's decide-and-reserve sees A's reservation → zero duplicate sends for the same digest.
- Scenario (NOTIF-07 preserved): provider send fails → the entry is already marked; next round does not resend.

### Requirement: ND-02 — Fresh gate helper
`alreadyNotifiedFresh(update)` in `src/lib/app-state.ts` MUST re-read the state under `runExclusive` and evaluate `hasBeenNotified` against fresh data.
- Scenario: after `markAsNotified(update)`, `alreadyNotifiedFresh(update)` is true even if the caller holds an older snapshot.
