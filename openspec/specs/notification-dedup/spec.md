# Deduplicación de Notificaciones (notification-dedup)

## Purpose

Garantizar que cada novedad (contenedor:imagen:digest) notifique como máximo una vez, incluso con rondas de chequeo solapadas del scheduler.

## Requirements

### Requirement: ND-01 — Reserva atómica antes del envío

`checkAndNotify` MUST consultar el estado de dedup fresco (bajo `runExclusive`) y reservar la notificación (`markAsNotified`) ANTES de despachar a los proveedores, como paso atómico decidir-y-reservar. La foto de estado tomada al inicio de la ronda MUST NOT gobernar envíos.

(Previously: la marca se escribía al cierre de la ronda — las rondas solapadas duplicaban envíos; B-07 confirmado en vivo 2026-08-30 con 24 duplicados.)

#### Scenario: ESC-01 — Rondas solapadas no duplican

- GIVEN la ronda A en vuelo (red lenta, envío de larga duración)
- WHEN la ronda B decide sobre la misma novedad
- THEN la puerta fresca ve la reserva de A y B omite el envío
- AND el total de envíos por digest es exactamente 1

#### Scenario: ESC-02 — Fallo de proveedor mantiene la marca (NOTIF-07)

- GIVEN la reserva escrita antes del envío
- WHEN todos los proveedores fallan
- THEN la entrada permanece marcada
- AND la ronda siguiente no reenvía ese digest

### Requirement: ND-02 — Puerta fresca bajo mutex

`alreadyNotifiedFresh(update)` en `src/lib/app-state.ts` MUST releer el estado bajo `runExclusive` y evaluar `hasBeenNotified` contra datos frescos.

#### Scenario: ESC-03 — Lectura fresca tras marca concurrente

- GIVEN un llamador con snapshot anterior a la marca
- WHEN `markAsNotified(update)` completa
- THEN `alreadyNotifiedFresh(update)` devuelve true
