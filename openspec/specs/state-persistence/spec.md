# Persistencia de Estado — Escritura Atómica (state-persistence)

## Purpose

Los stores de estado legítimos (`data/dashboard-state.json`, `data/reference-urls.json`) se escriben hoy con `fs.writeFile` directo (no atómico): un crash puede dejar JSON truncado. Esta spec exige un helper de escritura atómica (temp+rename+mutex) reutilizable, extraído del patrón existente en `src/lib/cache/containers.ts` ANTES de eliminar la file cache. NO se migra el backend de almacenamiento: los stores siguen siendo archivos JSON en `data/` con el mismo esquema.

## Requirements

### Requirement: REQ-01 — Helper atómico reutilizable

El sistema DEBE (MUST) extraer el patrón temp+rename+mutex (hoy en `src/lib/cache/containers.ts`) a un módulo compartido, y DEBE (MUST) extraerlo ANTES de eliminar la file cache. El helper DEBE (MUST) exponer una API tipo `writeFileAtomic(filePath, data)` que: (1) escriba a un archivo temporal en el MISMO directorio que el destino (mismo filesystem), (2) reemplace el destino con un rename atómico, y (3) serialice escrituras concurrentes con un mutex por archivo.

#### Scenario: ESC-01 — Escritura atómica feliz

- GIVEN un store cargado en memoria
- WHEN se guarda vía `writeFileAtomic`
- THEN el temp se escribe completo, el rename reemplaza el destino y el archivo final es un JSON válido
- AND NO queda ningún archivo `.tmp` residual

#### Scenario: ESC-02 — Crash a mitad de escritura

- GIVEN el proceso muere tras escribir el temp y antes del rename
- WHEN se reinicia y se lee el store
- THEN el destino conserva el estado previo íntegro (nunca un archivo truncado/parcial)
- AND `loadState`/`loadReferenceUrls` lo parsean sin error

#### Scenario: ESC-03 — Concurrencia serializada

- GIVEN dos guardados concurrentes sobre el mismo archivo
- WHEN ambos invocan `writeFileAtomic`
- THEN el mutex los serializa y el archivo final refleja el último guardado completo
- AND no hay contenido interleaved ni corrupción

### Requirement: REQ-02 — Aplicación a los stores legítimos

`saveState` (`src/lib/app-state.ts`) DEBE (MUST) usar el helper para escribir `data/dashboard-state.json`. `saveReferenceUrls` (`src/lib/reference-url-manager.ts`) DEBE (MUST) usar el helper para `data/reference-urls.json`. La escritura directa con `fs.writeFile` sobre esos archivos DEBE (MUST) desaparecer.

#### Scenario: ESC-04 — Guardado del dashboard-state

- GIVEN el scheduler marca un update como notificado (`markAsNotified` → `saveState`)
- WHEN se guarda con el helper
- THEN `data/dashboard-state.json` se actualiza atómicamente
- AND los lectores concurrentes (dashboard, dedupe) ven una versión completa, vieja o nueva

#### Scenario: ESC-05 — Guardado de reference-urls

- GIVEN el dashboard registra un reference URL (`saveReferenceUrl` → `saveReferenceUrls`)
- WHEN se guarda con el helper
- THEN `data/reference-urls.json` se actualiza atómicamente sin pérdida de entradas existentes

### Requirement: REQ-03 — Manejo en Windows (rename con destino abierto)

El helper DEBE (MUST) reintentar el rename cuando falle por destino abierto (EPERM/EACCES en Windows), con reintentos acotados y pequeño backoff, y DEBE (MUST) propagar el error si agota los reintentos. El mutex DEBE (MUST) liberarse incluso cuando el guardado falla, para no dejar el archivo bloqueado.

#### Scenario: ESC-06 — Destino abierto en Windows

- GIVEN Windows y otro proceso/lector tiene abierto `data/dashboard-state.json`
- WHEN `writeFileAtomic` intenta el rename
- THEN el primer intento falla con EPERM/EACCES y el helper reintenta
- AND el guardado completa, o lanza un error controlado tras agotar reintentos sin dejar estado bloqueante ni temp huérfano activo

### Requirement: REQ-04 — Conservación del formato y sin migración

El helper DEBE (MUST) producir el mismo contenido que hoy: `JSON.stringify(state, null, 2)` en UTF-8, con el esquema `NotificationState` (`dashboard-state.json`) y `ReferenceUrlState` (`reference-urls.json`) intactos. El sistema NO DEBE (MUST NOT) migrar el backend de almacenamiento ni cambiar el esquema o la ubicación de los archivos.

#### Scenario: ESC-07 — Formato preservado

- GIVEN un `data/dashboard-state.json` existente en el formato actual (pretty, 2 espacios)
- WHEN `saveState` escribe con el helper
- THEN el archivo sigue siendo JSON pretty de 2 espacios con el mismo esquema
- AND el tooling existente (scheduler, dedupe, dashboard) lo lee sin cambios

### Requirement: REQ-05 — Fallos propagados

Los errores de escritura (p. ej. EACCES por bind mount sin permisos) DEBEN (MUST) propagarse al llamador, conservando el mensaje/tip de permisos actual de `saveState`. El helper NO DEBE (MUST NOT) tragarse errores ni dejar un archivo parcial que parezca estado válido.

#### Scenario: ESC-08 — Permisos de bind mount

- GIVEN `data/` con permisos insuficientes (EACCES)
- WHEN se guarda un store
- THEN la escritura del temp falla y el error se propaga al llamador
- AND no queda un archivo parcial presentado como estado válido

## Criterios de aceptación (medibles)

- Tests Vitest (Strict TDD) verdes: helper atómico (temp+rename, mutex, retry en Windows, formato)
- `rg "fs\.writeFile\(" src/lib/app-state.ts src/lib/reference-url-manager.ts` → 0 coincidencias (solo el temp dentro del helper)
- Sin archivos `*.tmp` residuales tras operaciones normales
- Esquema JSON y ubicación `data/*.json` sin cambios
