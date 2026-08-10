# Actualización de Imágenes Docker vía Telegram (Long Polling + Botones Inline)

> **Estado**: Implementado sobre la rama `feat/telegram-update-imagenes`.
> **Transporte**: Long polling (sin webhook, sin puertos expuestos).

---

## Resumen Ejecutivo

Las notificaciones de actualización de imagen ahora llevan un botón inline **Actualizar**. Un toque en ese botón ejecuta el **mismo pipeline de actualización que el dashboard** (dedup, fases, preservación de configuración) y el mensaje se edita para mostrar el progreso y el estado final. No hay webhook, ni comandos slash, ni puertos adicionales: el bot de entrada corre dentro del mismo proceso Node usando long polling.

---

## Arquitectura General

| Componente | Archivo | Responsabilidad |
|------------|---------|-----------------|
| Proveedor Telegram (salida) | `src/lib/notifications/providers/telegram.ts` | Envía notificación + botón inline (`callback_data = u:{shortId}`), `polling: false` |
| Almacenamiento de callbacks | `src/lib/notifications/notification-callbacks.ts` | Persiste `shortId → {containerId, fullImageName, locale}` en `data/telegram-callbacks.json` (fs-atomic, TTL 24 h, cap 1000) |
| Bot de polling (entrada) | `src/lib/notifications/telegram-polling.ts` | Singleton `new TelegramBot(token, { polling: true })`, maneja `callback_query`, edita mensajes, valida chats |
| Núcleo de actualización compartido | `src/lib/container-update-task.ts` | `runContainerUpdateTask(id, image, { revalidate, onPhase })` — pipeline único web + Telegram |
| Túnel de revalidación | `src/lib/notifications/revalidate-tunnel.ts` + `src/app/api/internal/revalidate/route.ts` | Invalida la caché del dashboard fuera del contexto de request (loopback + nonce) |
| Instrumentación | `src/instrumentation.ts` | Arranca el poller junto al scheduler; lo detiene en SIGTERM/SIGINT |

---

## Flujo Completo

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  1. DETECCIÓN DE ACTUALIZACIÓN                                              │
│     El scheduler detecta que una imagen tiene update                        │
│     └── TelegramNotificationProvider.send()                                 │
│          ├── storeCallbackData() → data/telegram-callbacks.json             │
│          └── Envía mensaje con botón inline "Actualizar" (u:ab12cd34)       │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  2. EL USUARIO TOCA "Actualizar"                                            │
│     El poller recibe el callback_query                                       │
│     ├── getCallbackData(shortId) → {containerId, fullImageName, locale}     │
│     ├── chat.id ∈ TELEGRAM_CHAT_ID (comas)? sino: ignorar (R13)             │
│     ├── answerCallbackQuery (quita el spinner)                              │
│     ├── editMessageText "🔄 Actualizando..." (locale i18n)                  │
│     ├── ¿isContainerUpdating? → ya está en curso, salir (R7)                │
│     ├── ¿contenedor eliminado? → error amigable + purgar callback (R9)      │
│     ├── ¿imagen ya es la objetivo? → "Ya está actualizado" + purgar (R8)    │
│     └── runContainerUpdateTask(containerId, image, {                        │
│           revalidate: requestRevalidation, onPhase: editMessageText         │
│         })                                                                  │
│          ├── éxito  → ✅ estado final + requestRevalidation + purgar (R5/R12)│
│          └── error  → ❌ estado final + purgar (R10)                         │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Túnel de revalidación

Fuera del contexto de request (donde `updateTag`/`revalidateTag` lanzan E872/E263), el poller revalida la caché del dashboard a través del endpoint interno:

```
poller ──fetch──▶ http://127.0.0.1:${PORT|3000}/api/internal/revalidate
    headers: x-revalidate-nonce: <nonce en proceso>
    body:    { "tags": REFRESH_TAGS }
route: nonce válido + apariencia loopback
    → revalidateTag(tag, { expire: 0 }) × N → 200 { revalidated: true }
    si no → 403/400. Cualquier fallo se captura; fallback = expiración natural
    del cacheLife (≤ 1 h) + lecturas crudas del scheduler (R12.2)
```

El nonce se comparte en `globalThis.__docker_revalidate_nonce__` (mismo patrón que `progressStore`) para que ambos lados del túnel coincidan aunque Turbopack/webpack instancien el módulo más de una vez.

---

## Variables de Entorno

```bash
# Habilitar el sistema de notificaciones y el bot de polling
NOTIFICATIONS_ENABLED=true
NOTIFICATIONS_LANGUAGE=es          # idioma por defecto (en | es | pt)
TELEGRAM_ENABLED=true
TELEGRAM_BOT_TOKEN=<tu-bot-token>   # de @BotFather

# Chat(s) autorizados para usar el botón. Varios valores separados por comas.
# Admite ids numéricos (privados/grupos) o @username. Los taps de chats no
# listados se ignoran (R13).
TELEGRAM_CHAT_ID=123456789,987654321

# URL interna de revalidación (opcional). Solo necesaria si la app NO escucha
# en 127.0.0.1. Por defecto se deriva como http://127.0.0.1:${PORT|3000}/api/internal/revalidate
INTERNAL_REVALIDATE_URL=
```

Sin `NOTIFICATIONS_ENABLED=true`, `TELEGRAM_BOT_TOKEN` o `TELEGRAM_CHAT_ID` el poller **nunca arranca** (R4.2) y el proveedor no envía nada.

---

## Detalle de Implementación por Archivo

### 1. Núcleo compartido (`src/lib/container-update-task.ts`)

`runContainerUpdateTask(containerId, newImageName, { revalidate, onPhase })`:

- **Dedup** (R7): lanza `Container update already in progress` si `progressStore.isContainerUpdating(containerId)`.
- Registra la tarea en `progressStore` (SSE del dashboard sigue funcionando) y la desregistra siempre.
- **Éxito**: `setResult` → `revalidate?.(REFRESH_TAGS)` → `clearContainerCallbacks(containerId)` (R11, purga botones viejos).
- **Error**: `setError` (R10).
- `handle.done` resuelve en la fase terminal para que el poller edite su mensaje.

`triggerContainerUpdate` (web) es un wrapper fino que inyecta un revalidador `updateTag(REFRESH_TAGS)`; el poller inyecta `requestRevalidation` (túnel). Comportamiento web inalterado (R6.2).

### 2. Proveedor (`src/lib/notifications/providers/telegram.ts`)

- `storeCallbackData(message.dockerContainerId, message.fullImageName, message.locale || 'en')` → `shortId`.
- `reply_markup.inline_keyboard` con `callback_data = 'u:' + shortId` (10 bytes ≤ 64, N5).
- Si el almacenamiento falla, envía sin botón (no rompe la notificación).
- Mantiene `polling: false` y `link_preview_options.is_disabled: true`.

### 3. Poller (`src/lib/notifications/telegram-polling.ts`)

- `initTelegramPolling()`: gate por env + singleton `globalThis.__docker_telegram_poller__` (evita doble `getUpdates` → 409 en HMR).
- `stopTelegramPolling()`: `bot.stopPolling()` en SIGTERM/SIGINT (R15).
- `parseAllowedChatIds(env)`: set limpio separado por comas (R13).
- Errores de edición benignos ("message is not modified") se ignoran; ediciones de fase se limitan a un cambio de fase o cada ~3 s.

### 4. Ruta interna (`src/app/api/internal/revalidate/route.ts`)

- Requiere header `x-revalidate-nonce` == nonce en proceso → si no, 403.
- Mejor esfuerzo loopback vía `x-forwarded-for`/`x-real-ip` → IP no loopback = 403.
- Cuerpo `{ tags: string[] }` validado (400 si no) y filtrado a `REFRESH_TAGS`.
- `revalidateTag(tag, { expire: 0 })` (patrón documentado para callers externos).

---

## Archivos Modificados/Creados

```
src/
├── app/api/internal/revalidate/route.ts   # Túnel loopback de revalidación
├── lib/
│   ├── container-update-task.ts           # Núcleo compartido web + Telegram
│   └── notifications/
│       ├── notification-callbacks.ts      # Store de callbacks (fs-atomic)
│       ├── telegram-polling.ts            # Poller singleton + handler
│       ├── revalidate-tunnel.ts           # URL/nonce/requestRevalidation
│       └── providers/telegram.ts          # Botón inline
├── actions/docker.ts                      # triggerContainerUpdate → núcleo
└── instrumentation.ts                     # Poller junto al scheduler + stop
```

---

## Problemas Conocidos y Soluciones

### "message is not modified" al editar

**Causa**: El texto del mensaje no cambió entre ediciones (taps rápidos o mismo estado).
**Solución**: Se ignora silenciosamente (D7).

### Doble tap en el botón

**Causa**: El usuario toca dos veces o una actualización web está en curso.
**Solución**: `progressStore.isContainerUpdating` bloquea el segundo pull; el mensaje queda en "Actualizando..." y el callback no se borra (sigue siendo válido).

### Botón viejo después de actualizar desde el dashboard

**Causa**: El contenedor ya se actualizó por la web.
**Solución**: El núcleo llama `clearContainerCallbacks(containerId)` en el éxito; un tap sobre un botón viejo resuelve a "ya no disponible" y no inicia ningún pull (R11).

### Contenedor eliminado

**Causa**: El contenedor del callback fue borrado de Docker.
**Solución**: El inspect falla → mensaje de error amigable + purga del callback (R9).

### Telegram 409 Conflict

**Causa**: Dos `getUpdates` para el mismo token (webhook configurado o doble poller).
**Solución**: El singleton de `globalThis` + `polling: false` en el proveedor evitan el doble loop; `getWebhookInfo` debe reportar un webhook vacío.

---

## Seguridad

1. **Nonce en proceso**: la ruta interna solo revalida si el header coincide con el nonce compartido (defensa primaria).
2. **Loopback best-effort**: cuando el header revela una IP no loopback se rechaza; nunca se exponen puertos nuevos.
3. **Chat validation (R13)**: solo los chats de `TELEGRAM_CHAT_ID` pueden disparar actualizaciones.
4. **TTL/cap de callbacks**: los botones expiran a las 24 h y el store se limita a 1000 entradas.

---

## Rollback

Revertir los commits de `feat/telegram-update-imagenes`. La feature está gateada por env: sin token/`NOTIFICATIONS_ENABLED` el poller y el botón nunca arrancan, y el flujo web no cambia (la acción delega al mismo núcleo con la misma semántica). Borrar `data/telegram-callbacks.json` elimina los botones pendientes.
