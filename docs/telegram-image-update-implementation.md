# Implementación de Actualización de Imágenes vía Telegram

> **Estado**: Esta implementación fue desarrollada pero no pasó a producción.
> **Fecha de documentación**: Marzo 2026
> **Propósito**: Documentación para referencia futura si se requiere volver a implementar.

---

## Resumen Ejecutivo

Esta implementación permite a los usuarios actualizar contenedores Docker directamente desde las notificaciones de Telegram recibidas cuando se detecta una nueva versión de imagen. El usuario hace clic en un botón inline "Actualizar" y el sistema ejecuta automáticamente el proceso de actualización del contenedor.

---

## Arquitectura General

### Componentes Principales

| Componente | Archivo | Responsabilidad |
|------------|---------|-----------------|
| Webhook de Telegram | `src/app/api/telegram/webhook/route.ts` | Recibe y procesa callback queries |
| Proveedor de Notificaciones | `src/lib/notifications/providers/telegram.ts` | Envía mensajes con botones inline |
| Almacenamiento de Callbacks | `src/lib/notifications/notification-callbacks.ts` | Persiste datos de contenedores |
| Debounce | `src/lib/notifications/webhook-debounce.ts` | Previene actualizaciones duplicadas |
| Acción de Actualización | `src/actions/docker.ts` | Ejecuta la actualización real del contenedor |

---

## Flujo Completo

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  1. DETECCIÓN DE ACTUALIZACIÓN                                              │
│     El scheduler de notificaciones detecta que una imagen tiene update      │
│     └── TelegramNotificationProvider.send()                                 │
│          └── storeCallbackData() → data/telegram-callbacks.json             │
│               └── Envía mensaje con botón inline: "Actualizar"              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  2. USUARIO HACE CLIC EN "Actualizar"                                       │
│     Telegram envía POST /api/telegram/webhook?secret=...                    │
│     └── route.ts POST handler                                               │
│          ├── validateSecret() - valida secret del webhook                   │
│          ├── parseCallbackData("u:abc12345")                                │
│          │    └── getCallbackData("abc12345") → {containerId, ...}          │
│          ├── isUpdateInProgress() → verificación debounce                   |
│          └── markUpdateInProgress() → bloqueo de 30 segundos                │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  3. UI ACTUALIZACIÓN "Actualizando..."                                      │
│     └── setMessageToUpdating()                                              │
│          └── bot.editMessageText(..., "🔄 Actualizando...")                 │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  4. EJECUCIÓN DE ACTUALIZACIÓN DEL CONTENEDOR                               │
│     └── updateContainerImage(containerId, fullImageName)                    │
│          ├── docker.pull(newImageName)                                      │
│          ├── Si está corriendo: docker.stop() → docker.remove() →           │
│          │                  docker.createContainer() → docker.start()       │
│          └── Retorna { success, newContainerId, alreadyUpToDate }           │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  5. UI ACTUALIZACIÓN FINAL                                                  │
│     ├── Éxito: updateMessageWithStatus("✅ Actualizado exitosamente")       │
│     │    └── clearUpdateProgress(), removeCallbackData()                    │
│     ├── Ya actualizado: updateMessageWithStatus("ℹ️ Ya está actualizado")    │
│     └── Error: updateMessageWithStatus("❌ Error en actualización")         │
│          └── answerCallback() → cierra spinner de carga de Telegram         │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Variables de Entorno Requeridas

```bash
# Habilitar Telegram
TELEGRAM_ENABLED=true

# Token del bot de Telegram (obtenido de @BotFather)
TELEGRAM_BOT_TOKEN=<tu-bot-token>

# Chat ID donde se enviarán las notificaciones
TELEGRAM_CHAT_ID=<tu-chat-id>

# Secret para validar webhooks (generar string aleatorio seguro)
TELEGRAM_WEBHOOK_SECRET=<secret-aleatorio>

# URL pública del webhook (para referencia, no necesario configurar)
TELEGRAM_WEBHOOK_URL=https://tu-dominio.com/api/telegram/webhook
```

---

## Configuración del Webhook de Telegram

### Registro del Webhook

Para que Telegram envíe las callback queries al servidor, se debe registrar el webhook:

```bash
# Usando curl (nota: ?secret= debe estar codificado como %3F)
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -d "url=https://TU_DOMINIO/api/telegram/webhook%3Fsecret=TU_SECRET"

# O simplemente visitar en navegador (la API acepta GET)
https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=https://TU_DOMINIO/api/telegram/webhook%3Fsecret=TU_SECRET
```

**Importante**: El secret debe incluirse como query parameter en la URL del webhook para que el servidor pueda validar que la solicitud proviene de Telegram.

### Verificación del Webhook

```bash
# Ver estado actual del webhook
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getWebhookInfo"
```

---

## Detalle de Implementación por Archivo

### 1. Webhook Handler (`src/app/api/telegram/webhook/route.ts`)

#### Validación de Seguridad

```typescript
// Validación del secret en query params
const secret = searchParams.get('secret')
if (!secret || secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
  return NextResponse.json({ error: 'Invalid or missing secret' }, { status: 401 })
}
```

#### Procesamiento del Callback Query

1. **Extracción de datos**: Parse del `callback_data` que tiene formato `u:<shortId>`
2. **Recuperación de datos**: Obtiene containerId, fullImageName, locale del almacenamiento
3. **Debounce**: Verifica si hay una actualización en progreso (30 segundos de ventana)
4. **Feedback inmediato**: Cambia el mensaje a "🔄 Actualizando..."
5. **Ejecución**: Llama a `updateContainerImage()`
6. **Resultado**: Actualiza el mensaje con el estado final

### 2. Almacenamiento de Callbacks (`src/lib/notifications/notification-callbacks.ts`)

#### Formato de Almacenamiento

```json
// data/telegram-callbacks.json
{
  "abc12345": {
    "containerId": "container-uuid",
    "fullImageName": "nginx:latest",
    "locale": "es",
    "createdAt": 1743244800000,
    "expiresAt": 1743331200000
  }
}
```

#### Características:
- **TTL**: 24 horas
- **Máximo**: 1000 entradas
- **Short ID**: 8 caracteres (UUID prefix) para cumplir límite de 64 bytes de Telegram

### 3. Proveedor de Telegram (`src/lib/notifications/providers/telegram.ts`)

#### Envío de Notificación con Botón

```typescript
const shortId = storeCallbackData(containerId, fullImageName, locale)
const callbackData = `u:${shortId}`  // Formato: "u:<8-char-id>"

const inlineKeyboard = [[{
  text: t.update,  // "Actualizar" (ES), "Update" (EN), "Atualizar" (PT)
  callback_data: callbackData
}]]

await this.bot.sendMessage(chatId, text, {
  reply_markup: { inline_keyboard }
})
```

### 4. Debounce (`src/lib/notifications/webhook-debounce.ts`)

#### Propósito
Previene actualizaciones duplicadas cuando el usuario hace clic múltiples veces en el botón.

#### Implementación
- **Ventana de tiempo**: 30 segundos
- **Almacenamiento**: En memoria (Map)
- **Clave**: containerId

```typescript
// Ejemplo de uso
if (isUpdateInProgress(containerId)) {
  // Ya hay una actualización en progreso, ignorar
  return
}
markUpdateInProgress(containerId)
// ... ejecutar actualización
clearUpdateProgress(containerId)
```

### 5. Actualización del Contenedor (`src/actions/docker.ts`)

#### Función: `updateContainerImage(containerId, fullImageName)`

**Flujo de ejecución**:

1. **Obtener información del contenedor actual**
   ```typescript
   const container = docker.getContainer(containerId)
   const info = await container.inspect()
   ```

2. **Verificar si ya está actualizado**
   - Compara el digest local con el digest remoto
   - Si son iguales, retorna `alreadyUpToDate: true`

3. **Si el contenedor está corriendo**:
   - Detener el contenedor (`docker.stop()`)
   - Eliminar el contenedor (`docker.remove()`)
   - Crear nuevo contenedor con la nueva imagen (`docker.createContainer()`)
   - Iniciar el nuevo contenedor (`docker.start()`)
   - Retorna `newContainerId`

4. **Si el contenedor está detenido**:
   - Solo hace pull de la nueva imagen
   - No recreate el contenedor

**Valor de retorno**:
```typescript
{
  success: boolean,
  error?: string,           // Mensaje de error si falló
  newContainerId?: string,   // ID del nuevo contenedor (solo si se recreó)
  alreadyUpToDate?: boolean   // Si la imagen ya estaba actualizada
}
```

---

## Internacionalización (i18n)

Los textos de los botones y mensajes soporta múltiples idiomas:

| Clave | English | Español | Português |
|-------|---------|---------|-----------|
| `notification.update` | Update | Actualizar | Atualizar |
| `notification.updating` | Updating... | Actualizando... | Atualizando... |
| `notification.updateSuccess` | Updated successfully | Actualizado exitosamente | Atualizado com sucesso |
| `notification.updateFailed` | Update failed | Error en actualización | Falha na atualização |
| `notification.alreadyUpToDate` | Image is already up to date | La imagen ya está actualizada | A imagem já está atualizada |

---

## Archivos Modificados/Creados para Esta Funcionalidad

```
src/
├── app/
│   └── api/
│       └── telegram/
│           └── webhook/
│               └── route.ts          # Webhook handler
├── lib/
│   └── notifications/
│       ├── notification-callbacks.ts # Almacenamiento de callbacks
│       ├── webhook-debounce.ts      # Mecanismo debounce
│       └── providers/
│           └── telegram.ts          # Proveedor de notificaciones
├── actions/
│   └── docker.ts                    # updateContainerImage()
└── types/
    └── app-state.ts                 # Tipos de TypeScript
```

---

## Problemas Conocidos y Soluciones

### "Invalid or missing secret"

**Causa**: El secret en la URL del webhook no coincide con `TELEGRAM_WEBHOOK_SECRET`

**Solución**:
1. Verificar que `TELEGRAM_WEBHOOK_SECRET` está configurado en el entorno
2. Asegurarse de que el webhook fue registrado con el secret correcto
3. El secret en la URL debe usar `%3F` en lugar de `?` al configurar con curl

### Actualizaciones duplicadas

**Causa**: El usuario hace clic múltiples veces en el botón

**Solución**: El mecanismo de debounce (30s) previene esto. Si ocurre, revisar que `webhook-debounce.ts` está funcionando correctamente.

### El contenedor no se recrea

**Causa**: La imagen se descargó pero el contenedor no se recreó

**Solución**: Verificar que el contenedor estaba corriendo antes de la actualización. Los contenedores detenidos solo hacen pull de la imagen.

---

## Reactivación en Producción

Para volver a activar esta implementación:

1. **Configurar variables de entorno**:
   ```bash
   TELEGRAM_ENABLED=true
   TELEGRAM_BOT_TOKEN=...
   TELEGRAM_CHAT_ID=...
   TELEGRAM_WEBHOOK_SECRET=...
   ```

2. **Registrar el webhook**:
   ```bash
   curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
     -d "url=https://tu-dominio.com/api/telegram/webhook%3Fsecret=TU_SECRET"
   ```

3. **Reiniciar la aplicación** para cargar las nuevas variables

4. **Verificar**:
   - Enviar una notificación de prueba
   - Hacer clic en el botón de actualización
   - Verificar que el contenedor se actualice correctamente

---

## Consideraciones de Seguridad

1. **Webhook Secret**: Usar un secret aleatorio de al menos 32 caracteres
2. **Validación**: Siempre validar el secret en el handler
3. **TTL de callbacks**: Los datos de callback expiran en 24 horas
4. **Debounce**: Previene ataques de actualización repetitiva

---

## Referencias

- [API de Telegram Bot](https://core.telegram.org/bots/api)
- [Documentación de Dockerode](https://github.com/docker/dockerode)
- [Inline Keyboard Markups](https://core.telegram.org/bots/api#inlinekeyboardmarkup)
- [Callback Queries](https://core.telegram.org/bots/api#callbackquery)
