# Docker Image Checker

Un panel moderno para monitorear y actualizar contenedores Docker con soporte para versiones semánticas.

## 🔐 Autenticación

El panel incluye soporte para autenticación con sesión usando htpasswd y iron-session. La autenticación se configura mediante las variables de entorno `HTPASSWD` y opcionalmente `AUTH_SESSION_PASSWORD`.

### Configuración de Autenticación

1. Genera una entrada htpasswd usando una herramienta como [htpasswd generator](https://www.htaccesstools.com/htpasswd-generator/) o la API incluida en esta aplicación
2. Establece la variable de entorno `HTPASSWD` con el contenido generado
3. Opcionalmente, define `AUTH_SESSION_PASSWORD` con una contraseña segura de al menos 32 caracteres para encriptar las sesiones (si no se define, se usará `HTPASSWD`)
4. Si no se establece la variable `HTPASSWD`, el acceso será automático (sin autenticación)

> [!IMPORTANT]
> Si estás usando la variable de entorno `HTPASSWD` en un archivo `.env`, recuerda que el carácter `$` debe ser escapado con `\` (doble barra invertida) para evitar que el shell interprete variables. Por ejemplo: `HTPASSWD="usuario:\$2y\$10\$LX4B3Vt2v9Vj2v9Vj2v9V.3v9Vj2v9Vj2v9Vj2v9Vj2v9Vj2v9Vj2"`

> [!IMPORTANT]
> Para `AUTH_SESSION_PASSWORD`, asegúrate de usar una contraseña segura de al menos 32 caracteres. Puedes generar una contraseña segura usando un generador como [1Password](https://1password.com/password-generator/) o con el siguiente comando:
> ```bash
> openssl rand -base64 32
> ```

Ejemplo de contenido para las variables de entorno:
```
HTPASSWD=usuario:$2y$10$LX4B3Vt2v9Vj2v9Vj2v9V.3v9Vj2v9Vj2v9Vj2v9Vj2v9Vj2v9Vj2
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

> [!TIP]
> Si no configuras el token, la aplicación intentará obtener la información mediante scraping HTML, lo cual es menos fiable y más lento.

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
      - HTPASSWD=usuario:$2y$10$LX4B3Vt2v9Vj2v9Vj2v9V.3v9Vj2v9Vj2v9Vj2v9Vj2v9Vj2v9Vj2
```

## 🚀 Construcción y Publicación (Multi-Arquitectura)

Para generar la imagen compatible con **amd64** (Intel/AMD) y **arm64** (Apple Silicon/Raspberry) y subirla a Docker Hub:

### 1. Preparación (Solo una vez)
```bash
docker login
docker buildx create --name image-checker --use
docker buildx inspect --bootstrap
```

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

## 📝 Notas de Permisos
Si usas la **Opción A (Directa)** y recibes un error `EACCES`:
1. Revisa los IDs de tu sistema con el comando `id`.
2. Verifica el dueño del socket con `ls -ln /var/run/docker.sock`.
3. Ajusta la línea `user: "UID:GID"` en tu archivo `compose.prod.yaml`.

Si usas la **Opción B (Proxy)**, no necesitas preocuparte por los permisos de usuario, ya que el proxy maneja la conexión.
