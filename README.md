# Docker Image Checker

Un panel moderno para monitorear contenedores Docker y verificar actualizaciones de imágenes disponibles.

## 🔌 Conexión a Docker

Por defecto, la aplicación se conecta al daemon de Docker usando el socket del sistema:
- **Windows**: Named pipe `//./pipe/docker_engine`
- **Unix/Linux**: Socket `/var/run/docker.sock`

### Variable DOCKER_HOST

Puedes especificar una conexión remota usando la variable `DOCKER_HOST`:

```
# Conexión TCP a un host remoto
DOCKER_HOST=tcp://192.168.1.100:2375
```

## 🔐 Autenticación

El panel incluye soporte para autenticación con sesión usando htpasswd y iron-session. La autenticación se configura mediante las variables de entorno `AUTH_HTPASSWD` y opcionalmente `AUTH_SESSION_PASSWORD`.

### Configuración de Autenticación

1. Genera una entrada htpasswd usando una herramienta como [htpasswd generator](https://www.htaccesstools.com/htpasswd-generator/) o la API incluida en esta aplicación
2. Establece la variable de entorno `AUTH_HTPASSWD` con el contenido generado
3. Opcionalmente, define `AUTH_SESSION_PASSWORD` para encriptar las cookies de sesión. Si no se define, se usará `AUTH_HTPASSWD` como secreto de sesión
4. Si no se establece la variable `AUTH_HTPASSWD`, el acceso será automático (sin autenticación)

> [!IMPORTANT]
> Si estás usando la variable de entorno `AUTH_HTPASSWD` en un archivo `.env`, recuerda que el carácter `$` debe ser escapado con `\` (doble barra invertida) para evitar que el shell interprete variables. Por ejemplo: `AUTH_HTPASSWD="usuario:\$2y\$10\$LX4B3Vt2v9Vj2v9Vj2v9V.3v9Vj2v9Vj2v9Vj2v9Vj2v9Vj2v9Vj2"`

> [!IMPORTANT]
> Si usas autenticación (`AUTH_HTPASSWD`), define explícitamente `AUTH_SESSION_PASSWORD` para separar credenciales de login y secreto de sesión. Puedes generar una contraseña segura con [1Password](https://1password.com/password-generator/) o con el siguiente comando:
> ```bash
> openssl rand -base64 32
> ```

Ejemplo de contenido para las variables de entorno:
```
AUTH_HTPASSWD=usuario:$2y$10$LX4B3Vt2v9Vj2v9Vj2v9V.3v9Vj2v9Vj2v9Vj2v9Vj2v9Vj2v9Vj2
AUTH_SESSION_PASSWORD=TuContrasenaSeguraDe32CaracteresOMasXXXXXXXXXX
GITHUB_GHCR_TOKEN=ghp_TuGitHubTokenAqui
```

### 📦 GitHub Container Registry (GHCR)

Para obtener información precisa sobre imágenes alojadas en `ghcr.io` (como el hash exacto y versiones disponibles), se recomienda configurar un **Personal Access Token (PAT)**.

#### Cómo obtener tu token:
1. Ve a [GitHub Settings >Tokens](https://github.com/settings/tokens) (o Settings > Developer settings > Personal access tokens > Tokens (classic)).
2. Haz clic en **Generate new token (classic)**.
3. Ponle un nombre (ej: `Docker Image Checker`).
4. Selecciona el permiso: `read:packages`.
5. Haz clic en **Generate token** y cópialo.
6. Agrégalo a tu archivo `.env` como `GITHUB_GHCR_TOKEN`.

### API para Generar Hashes htpasswd

La aplicación incluye una API para generar hashes htpasswd directamente. La API soporta los siguientes formatos: APR1 (MD5), Bcrypt y SHA1.

#### Endpoint

- `POST /api/htpasswd-hash` - Genera un hash htpasswd
- `GET /api/htpasswd-hash` - Muestra la documentación de la API

#### Ejemplo de uso con curl:

```bash
# Generar hash en formato APR1 (por defecto)
curl -X POST http://localhost:3000/api/htpasswd-hash \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "mipassword", "format": "apr1"}'

# Generar hash en formato Bcrypt
curl -X POST http://localhost:3000/api/htpasswd-hash \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "mipassword", "format": "bcrypt"}'

# Generar hash en formato SHA1
curl -X POST http://localhost:3000/api/htpasswd-hash \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "mipassword", "format": "sha1"}'
```

#### Parámetros

- `username` (requerido): Nombre de usuario
- `password` (requerido): Contraseña
- `format` (opcional): Formato de hash (apr1/md5, bcrypt, sha/sha1) - por defecto apr1
- `salt` (opcional): Salt personalizado para APR1 (generado automáticamente si no se proporciona)
- `rounds` (opcional): Número de rondas para Bcrypt - por defecto 10

### Características de la autenticación

- **Página de login**: La aplicación ahora incluye una página de login en `/login`
- **Sesiones basadas en cookies**: Se utilizan cookies HTTP-only para manejar las sesiones de forma segura
- **Cierre de sesión**: Disponible a través del botón "Logout" en la esquina superior derecha
- **Redirección automática**: Usuarios no autenticados son redirigidos a la página de login

### Ejemplo de uso con Docker Compose

```yaml
services:
  image-checker:
    image: TU_USUARIO/image-checker:latest
    container_name: image-checker
    user: "1001:988"
    restart: always
    ports:
      - "3000:3000"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    environment:
      - NODE_ENV=production
      - TZ=America/Guayaquil
      - AUTH_HTPASSWD=usuario:$2y$10$LX4B3Vt2v9Vj2v9Vj2v9V.3v9Vj2v9Vj2v9Vj2v9Vj2v9Vj2v9Vj2
```

## 📊 Monitoreo (Uptime Kuma)

La aplicación incluye un endpoint de salud detallado en `/api/health` diseñado para ser utilizado con herramientas de monitoreo como [Uptime Kuma](https://github.com/louislam/uptime-kuma).

### Endpoint de Salud
- **Ruta**: `/api/health`
- **Método**: `GET`
- **Respuesta**: JSON detallado con el estado de la aplicación y la conexión al daemon de Docker.

#### Ejemplo de respuesta exitosa (200 OK):
```json
{
  "status": "ok",
  "timestamp": "2025-12-28T02:40:42.021Z",
  "components": {
    "app": { "status": "up" },
    "docker": { "status": "up" }
  }
}
```

#### Ejemplo de respuesta degradada (500 Internal Server Error):
Si el servicio de Docker no está disponible, el endpoint devolverá un código 500 para alertar al sistema de monitoreo.
```json
{
  "status": "degraded",
  "timestamp": "...",
  "components": {
    "app": { "status": "up" },
    "docker": { "status": "down", "error": "..." }
  }
}
```

### Configuración en Uptime Kuma

Para monitorear esta aplicación en Uptime Kuma:

1. **Tipo de monitor**: HTTP(s)
2. **URL**: `https://tu-dominio.com/api/health`
3. **Intervalo**: 60 segundos
4. **Códigos de estado aceptados**: 200

Esto garantiza que recibas alertas si la aplicación se cae o si pierde la comunicación con el motor de Docker.

## 📢 Sistema de Notificaciones

La aplicación incluye un sistema de notificaciones configurable para alertar sobre actualizaciones de imágenes Docker disponibles.

### Características
- **Múltiples canales**: Soporte para Telegram, ntfy y Discord.
- **Sincronización de idioma**: Notificaciones en el idioma de tu navegador o configurables por variable de entorno.
- **Exclusión inteligente**: No notifica sobre contenedores que hayas marcado como ocultos en el dashboard.
- **Deduplicación**: Evita alertas repetitivas para la misma actualización.

### Variables de Entorno

#### Configuración General
- `NOTIFICATIONS_ENABLED`: Habilitar o deshabilitar el sistema de notificaciones (default: false)
- `NOTIFICATIONS_LANGUAGE`: Idioma por defecto para notificaciones (en, es, pt) (default: en)
- `NOTIFICATIONS_CRON_SCHEDULE`: Expresión cron para verificaciones de actualizaciones (default: "0 */6 * * *")
- `TZ`: Zona horaria para el programador (ej: America/Guayaquil)

#### Telegram
- `TELEGRAM_ENABLED`: Habilitar notificaciones Telegram
- `TELEGRAM_BOT_TOKEN`: Token del bot de Telegram (@BotFather)
- `TELEGRAM_CHAT_ID`: Chat ID para notificaciones

#### ntfy
- `NTFY_ENABLED`: Habilitar notificaciones ntfy
- `NTFY_TOPIC`: Nombre del tema de ntfy
- `NTFY_SERVER`: Servidor ntfy personalizado (default: https://ntfy.sh)
- `NTFY_TOKEN`: Token de autenticación opcional para ntfy

#### Discord
- `DISCORD_ENABLED`: Habilitar notificaciones Discord
- `DISCORD_WEBHOOK_URL`: URL del webhook de Discord

Para detalles adicionales sobre configuración y despliegue, consulta la [Documentación de Notificaciones](NOTIFICATIONS.md).

## 🚀 Construcción y Publicación (Multi-Arquitectura)

Para generar la imagen compatible con **amd64** (Intel/AMD) y **arm64** (Apple Silicon/Raspberry) y subirla a Docker Hub:

### 1. Preparación (Solo una vez)
```bash
docker login
docker buildx create --name image-checker --use
docker buildx inspect --bootstrap
```

> [!NOTE]
> Si ya existe una instancia llamada "image-checker", puedes usar `docker buildx use image-checker` para seleccionarla o eliminarla y volver a crearla con `docker buildx rm image-checker && docker buildx create --name image-checker --use`.

### 2. Construir y Publicar
Reemplaza `TU_USUARIO` con tu cuenta de Docker Hub:
```bash
docker buildx build --platform linux/amd64,linux/arm64 \
  -t TU_USUARIO/image-checker:latest \
  -t TU_USUARIO/image-checker:1.0.0 \
  --push .
```

## 🛠️ Despliegue en Producción

Crea un archivo `compose.prod.yaml` basado en la plantilla del proyecto:

```yaml
services:
  image-checker:
    image: TU_USUARIO/image-checker:1.0.0
    container_name: image-checker
    user: "1001:988" # Ajusta el GID (988) según el dueño de /var/run/docker.sock en tu host
    restart: always
    ports:
      - "3000:3000"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    environment:
      - NODE_ENV=production
      - TZ=America/Guayaquil
```

### Iniciar el contenedor:
```bash
docker compose -f compose.prod.yaml up -d
```

### Opción B: Despliegue Seguro (Con Proxy)
Esta opción es más segura ya que no expone el socket de Docker directamente a la aplicación, sino a través de un proxy que solo permite lecturas.

#### Iniciar con Proxy:
```bash
docker compose -f compose.proxy.yaml up -d
```

#### Parámetros del Proxy (docker-socket-proxy)

El archivo `compose.proxy.yaml` usa variables de entorno para configurar los permisos del proxy:

| Variable | Valor | Descripción |
|----------|-------|-------------|
| `CONTAINERS=1` | ✅ | Permite listar y ver información de contenedores |
| `IMAGES=1` | ✅ | Permite listar imágenes |
| `POST=1` | ✅ | Permite hacer pull de imágenes (necesario para actualizar) |

## 📝 Notas de Permisos
Si usas la **Opción A (Directa)** y recibes un error `EACCES`:
1. Revisa los IDs de tu sistema con el comando `id`.
2. Verifica el dueño del socket con `ls -ln /var/run/docker.sock`.
3. Ajusta la línea `user: "UID:GID"` en tu archivo `compose.prod.yaml`.

Si usas la **Opción B (Proxy)**, no necesitas preocuparte por los permisos de usuario, ya que el proxy maneja la conexión.
