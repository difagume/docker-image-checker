# Docker Image Checker

Un panel moderno para monitorear y actualizar contenedores Docker con soporte para versiones semánticas.

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
