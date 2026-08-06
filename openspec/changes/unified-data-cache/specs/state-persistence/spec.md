# State Persistence — Delta Spec (state-persistence)

Change: unified-data-cache

## ADDED Requirements

### Requirement: REQ-01 — Helper atómico reutilizable

El sistema DEBE (MUST) extraer el patrón temp+rename+mutex (hoy en `src/lib/cache/containers.ts`) a un módulo compartido ANTES de eliminar la file cache. El helper DEBE (MUST) exponer una API tipo `writeFileAtomic(filePath, data)` que: (1) escriba a un archivo temporal en el MISMO directorio, (2) reemplace el destino con un rename atómico, y (3) serialice escrituras concurrentes con un mutex por archivo.

### Requirement: REQ-02 — Aplicación a los stores legítimos

`saveState` (`src/lib/app-state.ts`) DEBE (MUST) usar el helper para escribir `data/dashboard-state.json`. `saveReferenceUrls` (`src/lib/reference-url-manager.ts`) DEBE (MUST) usar el helper para `data/reference-urls.json`. La escritura directa con `fs.writeFile` sobre esos archivos DEBE (MUST) desaparecer.

### Requirement: REQ-03 — Manejo en Windows (rename con destino abierto)

El helper DEBE (MUST) reintentar el rename cuando falle por destino abierto (EPERM/EACCES en Windows), con reintentos acotados y pequeño backoff, y DEBE (MUST) propagar el error si agota los reintentos. El mutex DEBE (MUST) liberarse incluso cuando el guardado falla.

### Requirement: REQ-04 — Conservación del formato y sin migración

El helper DEBE (MUST) producir `JSON.stringify(state, null, 2)` en UTF-8 con el esquema intacto. El sistema NO DEBE (MUST NOT) migrar el backend de almacenamiento ni cambiar el esquema o la ubicación de los archivos.

### Requirement: REQ-05 — Fallos propagados

Los errores de escritura (p. ej. EACCES por bind mount) DEBEN (MUST) propagarse al llamador. El helper NO DEBE (MUST NOT) tragarse errores ni dejar un archivo parcial que parezca estado válido.

Spec base: `openspec/specs/state-persistence/spec.md` (contenido completo con escenarios ESC-01..ESC-08).
