# PRD - Docker Image Checker

## 1. Resumen Ejecutivo

**Docker Image Checker** es una aplicación web moderna desarrollada en Next.js que permite monitorear contenedores Docker locales y verificar la disponibilidad de actualizaciones para sus imágenes. La aplicación se conecta directamente al daemon de Docker para obtener información en tiempo real sobre el estado de los contenedores y consulta Docker Hub y GitHub Container Registry (GHCR) para detectar actualizaciones disponibles.

El problema principal que resuelve esta herramienta es la necesidad de los administradores de sistemas y desarrolladores de mantener sus contenedores Docker actualizados sin tener que verificar manualmente cada imagen en los registros. La aplicación proporciona una interfaz visual intuitiva que muestra el estado de cada contenedor, la versión actual de su imagen y si existe una actualización disponible.

Entre las características principales se incluyen: verificación automática de actualizaciones con políticas de versionado semántico, sistema de notificaciones multi-canal (Telegram, ntfy, Discord), autenticación opcional basada en htpasswd, soporte para múltiples registros de contenedores, e internacionalización completa en inglés, español y portugués.

---

## 2. Declaraciones del Problema

Los entornos contenerizados modernos suelen acumular contenedores con imágenes desactualizadas, lo cual representa un riesgo de seguridad significativo. Los administradores enfrentan múltiples desafíos al intentar mantener sus infraestructuras actualizadas:

**Problema 1: Falta de visibilidad centralizada.** Los usuarios deben verificar manualmente cada contenedor o utilizar múltiples herramientas para conocer el estado de actualización de sus imágenes. No existe una vista unificada que muestre todos los contenedores y su estado de actualización en un solo lugar.

**Problema 2: Proceso manual de verificación.** Verificar actualizaciones en Docker Hub requiere acceder a la API o al sitio web para cada imagen individualmente, lo cual es tedioso y propenso a errores cuando se administran múltiples contenedores.

**Problema 3: Políticas de versionado inconsistentes.** Las herramientas existentes no consideran las políticas de versionado semántico (semver), lo que genera alertas excesivas sobre actualizaciones menores o de desarrollo que los usuarios no desean aplicar.

**Problema 4: Ausencia de notificaciones proactivas.** Sin un sistema de notificaciones integrado, los administradores dependen de verificaciones manuales periódicas, lo que retrasa la aplicación de actualizaciones críticas de seguridad.

**Problema 5: Actualización manual de contenedores.** Incluso cuando se detecta una actualización, el proceso de actualizar la imagen y recrear el contenedor requiere conocimientos técnicos y varios pasos manuales.

---

## 3. Objetivos del Producto

El objetivo principal de Docker Image Checker es proporcionar una solución integral que permita a los administradores de sistemas monitorear, detectar y aplicar actualizaciones de contenedores Docker de manera eficiente y segura.

**Objetivo 1: Monitoreo centralizado.** Crear una interfaz web unificada que muestre todos los contenedores Docker del sistema local, incluyendo su estado actual (ejecutando, detenido, pausado), la imagen utilizada y la versión específica de cada imagen.

**Objetivo 2: Detección inteligente de actualizaciones.** Implementar un sistema que verifique automáticamente las actualizaciones en Docker Hub y GHCR, utilizando políticas de versionado semántico para filtrar actualizaciones relevantes y evitar alertas innecesarias sobre versiones de desarrollo oRelease Candidates.

**Objetivo 3: Notificaciones proactivas.** Desarrollar un sistema de notificaciones configurable que alerte a los usuarios a través de múltiples canales cuando se detecten actualizaciones disponibles, con soporte para deduplicación y persistencia de estado.

**Objetivo 4: Actualización integrada.** Permitir la actualización de contenedores directamente desde la interfaz web, con soporte para recrear contenedores manteniendo su configuración (variables de entorno, puertos, volúmenes, redes).

**Objetivo 5: Seguridad y acceso controlado.** Ofrecer un sistema de autenticación opcional que proteja el acceso al dashboard mediante credenciales htpasswd, con sesiones seguras basadas en cookies HTTP-only.

---

## 4. Propuesta de Valor

Docker Image Checker ofrece una propuesta de valor diferenciada para diferentes perfiles de usuarios:

**Para desarrolladores individuales:** Proporciona una manera simple de mantener actualizados los contenedores de sus entornos de desarrollo locales, con alertas visuales inmediatas y la capacidad de actualizar con un solo clic.

**Para administradores de sistemas:** Ofrece una consola centralizada para monitorear múltiples contenedores, con notificaciones automáticas que eliminan la necesidad de verificaciones manuales periódicas y soporte para implementaciones de producción con autenticación.

**Para equipos DevOps:** La integración con proxies de socket Docker permite implementaciones seguras en entornos production-ready, mientras que el soporte para GitHub Container Registry facilita la gestión de imágenes privadas.

---

## 5. Historias de Usuario

### Historia de Usuario 1: Visualización de contenedores

Como administrador de sistemas, quiero ver una lista de todos los contenedores Docker en mi sistema con su estado actual, para tener una visión general de mi infraestructura contenerizada.

**Criterios de aceptación:**

- La aplicación muestra todos los contenedores Docker (activos e inactivos)
- Cada contenedor muestra: nombre, imagen con tag, estado, puertos expuestos
- Los contenedores se pueden filtrar por nombre o imagen
- El estado se actualiza al refrescar la página

### Historia de Usuario 2: Verificación de actualizaciones

Como usuario, quiero que la aplicación verifique automáticamente si existen actualizaciones disponibles para las imágenes de mis contenedores.

**Criterios de aceptación:**

- Para cada contenedor, la aplicación consulta Docker Hub o GHCR
- Se muestra claramente si hay una actualización disponible
- Las actualizaciones se clasifican por tipo: parche, menor, mayor
- Se muestran los enlaces directos a Docker Hub para cada imagen

### Historia de Usuario 3: Políticas de versionado

Como usuario consciente de la estabilidad, quiero que las actualizaciones se filtren según políticas de versionado para evitar actualizaciones no deseadas.

**Criterios de aceptación:**

- Las etiquetas "latest" se actualizan automáticamente cuando hay cambios
- Las versiones semánticas (1.0.0) solo notifican actualizaciones compatibles (minor/patch)
- Las versiones de desarrollo (master, edge, nightly) notifican cambios de contenido
- Los usuarios pueden configurar qué tipos de actualizaciones desean recibir

### Historia de Usuario 4: Notificaciones

Como administrador ocupado, quiero recibir notificaciones cuando haya actualizaciones disponibles para no tener que verificar manualmente.

**Criterios de aceptación:**

- Soporte para múltiples canales: Telegram, ntfy, Discord
- Las notificaciones son multilenguaje (EN, ES, PT)
- No se notifica dos veces por la misma actualización (deduplicación)
- Los contenedores ocultos en el dashboard no reciben notificaciones

### Historia de Usuario 5: Actualización de contenedores

Como usuario, quiero poder actualizar la imagen de un contenedor directamente desde la interfaz.

**Criterios de aceptación:**

- Botón de actualización en cada contenedor con actualización disponible
- Confirmación antes de actualizar (si el contenedor está ejecutándose)
- Se mantiene la configuración existente del contenedor
- El contenedor se reinicia automáticamente si estaba en ejecución

### Historia de Usuario 6: Autenticación

Como administrador de producción, quiero proteger el acceso al dashboard con autenticación.

**Criterios de aceptación:**

- Autenticación opcional configurable mediante variable de entorno
- Formato de contraseñas compatible con htpasswd
- Sesiones seguras con cookies HTTP-only
- Página de login dedicada con redirección automática

---

## 6. Requisitos Funcionales

### RF-001: Listado de contenedores

La aplicación debe mostrar una lista de todos los contenedores Docker presentes en el sistema local.

**Descripción técnica:**

- Utiliza la biblioteca Dockerode para conectarse al daemon de Docker
- Lista todos los contenedores (activos e inactivos) mediante el método `listContainers({ all: true })`
- Muestra información que incluye: ID del contenedor, nombres, imagen, estado, puertos, fecha de creación
- La actualización de datos se realiza mediante Next.js Server Actions con revalidación de caché

### RF-002: Verificación de actualizaciones en Docker Hub

La aplicación debe consultar la API de Docker Hub para cada imagen de contenedor y determinar si existen actualizaciones disponibles.

**Descripción técnica:**

- Consulta el endpoint `https://hub.docker.com/v2/repositories/{repo}/tags` para obtener las etiquetas disponibles
- Compara el digest local de la imagen con el digest remoto
- Utiliza un sistema de timeout (8 segundos) para evitar bloqueos
- Implementa caché con revalidación de 1 hora para reducir llamadas a la API

### RF-003: Soporte para GitHub Container Registry (GHCR)

La aplicación debe soportar la verificación de imágenes almacenadas en GHCR.

**Descripción técnica:**

- Detecta imágenes con prefijo `ghcr.io/`
- Utiliza la API de GitHub: `https://api.github.com/users/{owner}/packages/container/{package}/versions`
- Requiere un token de acceso personal (GITHUB_GHCR_TOKEN) con permiso `read:packages`
- Maneja errores de token inválido y muestra feedback al usuario

### RF-004: Políticas de versionado semántico

La aplicación debe evaluar las actualizaciones según políticas de versionado para filtrar notificaciones irrelevantes.

**Descripción técnica:**

- **LatestPolicy**: Para etiquetas "latest", notifica cualquier cambio de contenido
- **SemverPolicy**: Para versiones semánticas (v1.2.3), notifica solo actualizaciones compatibles (misma major) y mayores disponibles
- **DevTagPolicy**: Para etiquetas de desarrollo (master, edge, nightly), notifica cambios de contenido
- **CustomTagPolicy**: Para otras etiquetas, notifica si el digest ha cambiado

### RF-005: Sistema de notificaciones

La aplicación debe enviar notificaciones a través de múltiples canales cuando se detecten actualizaciones.

**Proveedores soportados:**

- **Telegram**: Utiliza node-telegram-bot-api para enviar mensajes
- **ntfy**: Implementación de notificaciones push mediante HTTP
- **Discord**: Envío de mensajes mediante webhooks

**Características:**

- Programador basado en cron (node-cron) con configuración personalizable
- Deduplicación para evitar notificaciones repetidas
- Persistencia de estado en archivo JSON
- Integración con el sistema de ocultamiento de contenedores del dashboard
- Internacionalización de mensajes (EN, ES, PT)

### RF-006: Actualización de contenedores

La aplicación debe permitir actualizar la imagen de un contenedor desde la interfaz.

**Descripción técnica:**

- Descarga la nueva imagen mediante `docker.pull()`
- Si el contenedor está en ejecución: lo detiene, elimina, recrea con la nueva imagen e inicia
- Si el contenedor está detenido: solo actualiza la imagen localmente
- Preserva la configuración existente: variables de entorno, puertos, volúmenes, redes, política de reinicio

### RF-007: Autenticación de usuarios

La aplicación debe proporcionar un sistema de autenticación opcional.

**Descripción técnica:**

- Autenticación deshabilitada por defecto si no se define AUTH_HTPASSWD
- Validación de credenciales contra formato htpasswd (APR1, Bcrypt, SHA1)
- Gestión de sesiones mediante iron-session con cookies HTTP-only
- Página de login dedicada en `/login`
- Middleware de protección de rutas que redirige a login si no está autenticado

### RF-008: Gestión de contenedores ocultos

La aplicación debe permitir ocultar contenedores del dashboard.

**Descripción técnica:**

- Los contenedores ocultos se almacenan en el estado de la aplicación
- No aparecen en la vista principal pero son visibles en una sección separada
- Los contenedores ocultos también son excluidos de las notificaciones

### RF-009: Referencias de actualización

La aplicación debe permitir agregar URLs de referencia personalizadas para cada imagen.

**Descripción técnica:**

- Sistema de gestión de URLs de referencia por nombre de imagen
- Las URLs se muestran en las notificaciones y en el dashboard
- Persistencia en el estado de la aplicación

### RF-010: Health check

La aplicación debe proporcionar un endpoint de salud para monitoreo.

**Descripción técnica:**

- Endpoint en `/api/health`
- Verifica el estado de la aplicación y la conexión a Docker
- Formato compatible con Uptime Kuma y otras herramientas de monitoreo

---

## 7. Requisitos No Funcionales

### RNF-001: Rendimiento

La aplicación debe ser responsiva y eficiente en el uso de recursos.

- El tiempo de carga inicial no debe exceder 3 segundos en condiciones normales
- Las consultas a Docker Hub deben tener un timeout de 8 segundos para evitar bloqueos
- El caché de respuestas de Docker Hub debe ser de 1 hora para reducir latencia

### RNF-002: Disponibilidad

La aplicación debe funcionar correctamente en diferentes condiciones de red.

- Debe manejar gracefully los errores de conexión a Docker
- Debe mostrar estados claros cuando Docker no está disponible
- Debe funcionar sin acceso a internet (excepto para verificaciones de actualizaciones)

### RNF-003: Seguridad

La aplicación debe proteger la información sensible.

- Las contraseñas y tokens nunca deben exponerse en logs o respuestas
- Las sesiones deben ser seguras (HTTP-only cookies en producción)
- La autenticación htpasswd soporta algoritmos seguros (Bcrypt)

### RNF-004: Usabilidad

La aplicación debe ser intuitiva y accesible.

- Interfaz de usuario clara con estados visuales para cada contenedor
- Mensajes de error descriptivos en el idioma del usuario
- Diseño responsive para diferentes tamaños de pantalla

### RNF-005: Mantenibilidad

El código debe ser mantenible y extensible.

- Estructura modular con separación de responsabilidades
- Documentación de API y configuración
- Soporte para extensiones futuras (nuevos proveedores de notificaciones)

---

## 8. Arquitectura del Sistema

### Arquitectura General

La aplicación sigue una arquitectura de Next.js con App Router, utilizando React Server Components para la obtención de datos y Server Actions para las mutaciones.

```
┌─────────────────────────────────────────────────────────────-┐
│                      Cliente (Browser)                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐   │
│  │  Dashboard  │  │ Login Page  │  │ API Routes (REST)   │   │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘   │
└─────────┼────────────────┼──────────────────-─┼──────────────┘
          │                │                    │
          ▼                ▼                    ▼
┌─────────────────────────────────────────────────────────────┐
│                    Next.js Server                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ Server       │  │ Server       │  │ API Routes       │   │
│  │ Components   │  │ Actions      │  │ (health,         │   │
│  │ (fetch)      │  │ (mutations)  │  │  notifications)  │   │
│  └──────┬──────-┘  └──────┬───────┘  └────────┬─────────┘   │
└─────────┼──────────────--─┼───────────────────┼───────────--┘
          │                 │                   │
          ▼                 ▼                   ▼
┌────────────────────────────────────────────────────────────┐
│                    Capa de Servicios                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ Docker       │  │ Auth         │  │ Notifications    │  │
│  │ Integration  │  │ (htpasswd)   │  │ (Scheduler)      │  │
│  └──────┬───────┘  └──────────────┘  └────────┬─────────┘  │
└─────────┼─────────────────────────────────────┼────────────┘
          │                                     │
          ▼                                     ▼
┌──────────────────┐               ┌──────────────────────────┐
│ Docker Daemon    │               │ Notificaciones           │
│ (local/socket)   │               │ (Telegram/ntfy/Discord)  │
└──────────────────┘               └──────────────────────────┘
```

### Stack Tecnológico

**Frontend:**

- Next.js 16 con App Router
- React 19 para componentes de interfaz
- Tailwind CSS para estilos
- Radix UI para componentes accesibles
- Shadcn/ui para componentes pre-diseñados
- Framer Motion para animaciones
- Lucide React para iconos

**Backend:**

- Next.js Server Actions para lógica de servidor
- Dockerode para comunicación con Docker
- Iron-session para gestión de sesiones
- Node-cron para programador de tareas

**Infraestructura:**

- Docker y Docker Compose para despliegue
- Soporte para socket proxy (tecnativa/docker-socket-proxy)

### Estructura de Directorios

```
src/
├── actions/              # Server Actions de Next.js
│   ├── auth.ts         # Autenticación (login/logout)
│   ├── docker.ts       # Operaciones Docker
│   ├── container-cache.ts
│   └── app-state.ts
├── app/                # Páginas y rutas de Next.js
│   ├── page.tsx       # Dashboard principal
│   ├── login/         # Página de login
│   ├── api/           # Endpoints de API
│   │   ├── health/
│   │   ├── notifications/
│   │   └── htpasswd-hash/
│   └── layout.tsx
├── components/         # Componentes React
│   ├── ui/            # Componentes base (shadcn)
│   ├── dashboard-content.tsx
│   ├── container-dashboard.tsx
│   └── ...
├── lib/               # Bibliotecas y utilities
│   ├── docker.ts      # Cliente Dockerode
│   ├── htpasswd.ts   # Validación htpasswd
│   ├── session.ts    # Sesiones iron
│   ├── policies/     # Motor de políticas
│   ├── notifications/# Sistema de notificaciones
│   └── i18n/         # Internacionalización
├── types/             # Definiciones de tipos
└── instrumentation.ts # Inicialización de notificaciones
```

---

## 9. Especificación de APIs

### Endpoints REST

**GET /api/health**

Endpoint de salud para monitoreo.

```json
// Respuesta exitosa
{
  "status": "ok",
  "timestamp": "2025-12-28T02:40:42.021Z",
  "components": {
    "app": { "status": "up" },
    "docker": { "status": "up" }
  }
}

// Respuesta degradada
{
  "status": "degraded",
  "timestamp": "2025-12-28T02:40:42.021Z",
  "components": {
    "app": { "status": "up" },
    "docker": { "status": "down", "error": "Connection refused" }
  }
}
```

**POST /api/htpasswd-hash**

Genera hashes htpasswd para autenticación.

```json
// Request
{
  "username": "admin",
  "password": "mipassword",
  "format": "bcrypt",
  "rounds": 10
}

// Response
{
  "hash": "admin:$2y$10$..."
}
```

**GET /api/notifications/health**

Estado del sistema de notificaciones.

```json
{
  "enabled": true,
  "nextCheck": "2025-12-28T08:00:00.000Z",
  "language": "es",
  "providers": {
    "telegram": { "enabled": true, "connected": true },
    "ntfy": { "enabled": false },
    "discord": { "enabled": true, "connected": true }
  }
}
```

**POST /api/notifications/check**

Fuerza una verificación manual de actualizaciones.

```bash
# Requiere autenticación si AUTH_HTPASSWD está configurado
curl -X POST http://localhost:3000/api/notifications/check
```

---

## 10. Variables de Entorno

### Configuración General

| Variable | Descripción | Valor por defecto |
|----------|-------------|-------------------|
| `NODE_ENV` | Entorno de ejecución | `development` |
| `TZ` | Zona horaria | Sistema |
| `DOCKER_HOST` | Host de Docker (opcional) | Socket local |

### Autenticación

| Variable | Descripción | Valor por defecto |
|----------|-------------|-------------------|
| `AUTH_HTPASSWD` | Credenciales htpasswd | No establecido (sin auth) |
| `AUTH_SESSION_PASSWORD` | Clave de sesión (mínimo 32 caracteres) | AUTH_HTPASSWD |

### GitHub Container Registry

| Variable | Descripción | Valor por defecto |
|----------|-------------|-------------------|
| `GITHUB_GHCR_TOKEN` | Token PAT con permiso `read:packages` | No establecido |

### Notificaciones

| Variable | Descripción | Valor por defecto |
|----------|-------------|-------------------|
| `NOTIFICATIONS_ENABLED` | Habilitar sistema de notificaciones | `false` |
| `NOTIFICATIONS_LANGUAGE` | Idioma (en, es, pt) | `en` |
| `NOTIFICATIONS_CRON_SCHEDULE` | Expresión cron | `0 */6 * * *` |

#### Telegram

| Variable | Descripción |
|----------|-------------|
| `TELEGRAM_ENABLED` | Habilitar Telegram |
| `TELEGRAM_BOT_TOKEN` | Token del bot |
| `TELEGRAM_CHAT_ID` | Chat ID |

#### ntfy

| Variable | Descripción |
|----------|-------------|
| `NTFY_ENABLED` | Habilitar ntfy |
| `NTFY_TOPIC` | Nombre del topic |
| `NTFY_SERVER` | Servidor (default: https://ntfy.sh) |
| `NTFY_TOKEN` | Token opcional |

#### Discord

| Variable | Descripción |
|----------|-------------|
| `DISCORD_ENABLED` | Habilitar Discord |
| `DISCORD_WEBHOOK_URL` | URL del webhook |

---

## 11. Despliegue

### Método Directo (compose.prod.yaml)

Montaje directo del socket de Docker al contenedor:

```yaml
services:
  image-checker:
    image: usuario/image-checker:latest
    container_name: image-checker
    user: "1001:988"
    restart: always
    ports:
      - "3000:3000"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./data:/app/data
    environment:
      - NODE_ENV=production
      - TZ=America/Guayaquil
```

### Método Seguro con Proxy (compose.proxy.yaml)

Utiliza tecnativa/docker-socket-proxy para exponer solo operaciones de lectura:

```yaml
services:
  docker-socket-proxy:
    image: tecnativa/docker-socket-proxy
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    environment:
      - CONTAINERS=1
      - IMAGES=1
      - POST=0

  image-checker:
    depends_on:
      - docker-socket-proxy
    environment:
      - DOCKER_HOST=tcp://docker-socket-proxy:2375
```

### Construcción Multi-arquitectura

```bash
docker buildx create --name image-checker --use
docker buildx build --platform linux/amd64,linux/arm64 \
  -t usuario/image-checker:latest \
  --push .
```

---

## 12. Casos de Prueba Principales

### CP-001: Dashboard sin contenedores

**Precondición:** No hay contenedores Docker en el sistema.

**Resultado esperado:** Mensaje informativo indicando que no se encontraron contenedores.

### CP-002: Dashboard con contenedores

**Precondición:** Existen contenedores Docker en el sistema.

**Resultado esperado:** Lista de contenedores con estado, imagen y versión visible.

### CP-003: Actualización detectada

**Precondición:** Un contenedor usa una imagen con tag desactualizado.

**Resultado esperado:** Badge de "Actualización disponible" con la nueva versión mostrada.

### CP-004: Actualización mayor disponible

**Precondición:** Existe una nueva versión mayor disponible (ej: 1.x.x → 2.0.0).

**Resultado esperado:** Badge específico indicando "Nueva versión mayor disponible".

### CP-005: Actualización de contenedor ejecutándose

**Precondición:** Contenedor en estado "running" con actualización disponible.

**Resultado esperado:** Confirmación de downtime, contenedor detenido, recreado con nueva imagen e iniciado.

### CP-006: Notificación Telegram

**Precondición:** Telegram configurado y contenedor con actualización.

**Resultado esperado:** Mensaje de notificación en Telegram con detalles de la actualización.

### CP-007: Autenticación habilitada

**Precondición:** AUTH_HTPASSWD configurado.

**Resultado esperado:** Redirección a /login, acceso solo después de credenciales válidas.

### CP-008: Contenedor oculto

**Precondición:** Contenedor marcado como oculto.

**Resultado esperado:** No visible en dashboard principal, excluido de notificaciones.

---

## 13. Limitaciones Conocidas

1. **Rate limiting de Docker Hub:** La API de Docker Hub puede aplicar límites de tasa en ambientes con muchas imágenes. El sistema implementa timeouts pero no manejo avanzado de rate limits.

2. **Imágenes privadas no-Docker Hub:** El sistema no soporta verificación de imágenes en registros privados más allá de GHCR.

3. **Actualización de contenedores con dependencias:** El sistema no maneja automáticamente contenedores que dependen de otros ni crea dependencias en el orden de actualización.

4. **Persistencia de estado en memoria:** En implementaciones serverless o con múltiples instancias, el estado de notificaciones debe almacenarse en un volumen persistente.

5. **Soporte de plataformas:** La aplicación requiere Node.js 18+ y acceso al daemon de Docker; no funciona en entornos sin soporte de socket Docker.

---

## 14. Roadmap Futuro

### Fase 1 (Completado)

- Dashboard de contenedores básico
- Verificación de actualizaciones Docker Hub
- Soporte para GHCR
- Políticas de versionado semántico

### Fase 2 (Completado)

- Sistema de notificaciones (Telegram, ntfy, Discord)
- Autenticación htpasswd
- Internacionalización (EN, ES, PT)
- Actualización de contenedores desde UI

### Fase 3 (Sugeridos)

- Soporte para más registros (Google Container Registry, Amazon ECR)
- Dashboard con gráficos de actualizaciones históricas
- Integración con sistemas de CI/CD
- Webhooks personalizados
- API REST completa para integración con terceros

---

## 15. Glosario

| Término | Definición |
|---------|------------|
| **Daemon de Docker** | Servicio en segundo plano de Docker que gestiona contenedores |
| **Docker Hub** | Registro público de imágenes Docker mantenido por Docker Inc. |
| **GHCR** | GitHub Container Registry, registro de contenedores de GitHub |
| **Semver** | Versionado semántico (major.minor.patch) |
| **Digest** | Hash único que identifica una imagen específica |
| **Tag** | Etiqueta que identifica una versión específica de una imagen |
| **Socket proxy** | Proxy que expone operaciones de solo lectura del daemon Docker |
| **htpasswd** | Formato de archivo de contraseñas usado por Apache |
| **Iron-session** | Biblioteca para gestión de sesiones cifradas |

---

*Documento generado el 30 de marzo de 2026*
