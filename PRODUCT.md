# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Usuario principal: **self-hoster / homelab**. Un individuo técnico que administra sus
propios contenedores Docker en un servidor casero, NAS o VPS, normalmente para una sola
persona o un grupo pequeño. Entra al panel de forma esporádica para responder a una
pregunta concreta —"¿qué contenedores tengo, cuáles tienen actualización disponible y
puedo aplicarla sin romper nada?"— y prioriza simplicidad, despliegue Docker fácil y
comprensión de un vistazo por encima de la configuración avanzada.

Audiencias secundarias reales pero no prioritarias: administradores de sistemas que
protegen el panel con autenticación y activan notificaciones, y equipos DevOps que lo
integran mediante proxy de socket y GHCR. Las decisiones de producto se resuelven a favor
del self-hoster cuando entran en conflicto.

## Product Purpose

Docker Image Checker es un panel web que se conecta al daemon de Docker (local o remoto),
lista todos los contenedores con su estado e imagen, y consulta Docker Hub y GitHub
Container Registry para determinar si cada imagen tiene una actualización disponible.
Además permite aplicar la actualización de un contenedor desde la propia interfaz,
recreándolo y preservando su configuración.

Existe para eliminar la verificación manual, imagen por imagen, del estado de
actualización de una flota de contenedores. El éxito es que el usuario abra el panel,
entienda en segundos qué necesita atención, y actúe con confianza sin salir a consultar
cada registro por separado.

## Positioning

El diferenciador es la combinación de tres cosas en una sola herramienta autoalojada y
ligera: (1) un **motor de políticas de versionado semántico** que clasifica cada
actualización (parche / menor / mayor, estable sobre RC/beta) para filtrar ruido en lugar
de alertar por cualquier cambio; (2) **actualización de contenedores integrada** que
recrea el contenedor preservando variables de entorno, puertos, volúmenes, redes y política
de reinicio; y (3) **notificaciones multicanal con deduplicación** que respetan los
contenedores ocultos del dashboard. La detección de actualizaciones consciente de semver es
el mecanismo central que un monitor genérico de contenedores no replica de forma trivial.

## Operating Context

- Se ejecuta como contenedor Docker autoalojado (compose directo o mediante socket proxy de
  solo lectura), o localmente durante el desarrollo.
- Se conecta al daemon de Docker por socket local (named pipe en Windows, socket Unix en
  Linux) o a un daemon remoto vía `DOCKER_HOST`: `tcp://` (plano), `https://`/TCP+TLS,
  `ssh://` (puerto 22 estándar) y `unix://`/`npipe://`.
- Uso esporádico y orientado a tareas: revisión periódica del estado, reacción a una
  notificación entrante, o aplicación de una actualización concreta.
- Consulta registros externos (Docker Hub API, GitHub Packages API) con timeouts y caché;
  debe degradar con elegancia cuando Docker o la red no están disponibles.
- Se integra con herramientas de monitoreo externas (Uptime Kuma) mediante el endpoint
  `/api/health`, y con Telegram, ntfy y Discord para notificaciones.

## Capabilities and Constraints

**Capacidades confirmadas:**
- Listado de todos los contenedores (activos e inactivos) con nombre, imagen+tag, estado,
  puertos y fecha de creación; búsqueda/filtrado por nombre o imagen.
- Verificación de actualizaciones contra Docker Hub y GHCR, comparando digests y tags.
- Motor de políticas de versionado: `LatestPolicy`, `SemverPolicy`, `DevTagPolicy`,
  `CustomTagPolicy`; prioriza versiones estables sobre RC/beta.
- Actualización de contenedores desde la UI, con confirmación de downtime cuando está en
  ejecución y preservación de la configuración existente.
- Ocultar contenedores del dashboard (también excluidos de notificaciones).
- URLs de referencia personalizadas por imagen.
- Autenticación opcional htpasswd (APR1, Bcrypt, SHA1) con sesiones iron-session en cookies
  HTTP-only; API para generar hashes en `/api/htpasswd-hash`.
- Sistema de notificaciones (Telegram, ntfy, Discord) con scheduler node-cron,
  deduplicación y estado persistente en `data/dashboard-state.json`.
- Endpoint de salud `/api/health` para monitoreo.

**Restricciones técnicas:**
- Requiere acceso al daemon de Docker (Docker ≥ 18.09 para SSH `dial-stdio`); no funciona
  sin socket/daemon accesible.
- SSH remoto limitado al puerto 22 estándar (bug de construcción de URL en docker-modem con
  puertos personalizados).
- Verificación de registros privados limitada a Docker Hub y GHCR; otros registros privados
  no están soportados.
- Sujeto al rate limiting de Docker Hub; hay timeouts y caché pero no manejo avanzado de
  límites de tasa.
- El estado (notificaciones, estado del dashboard) se persiste en archivos JSON bajo
  `data/`; en despliegues con múltiples instancias requiere volumen persistente compartido.
- Stack fijo: Next.js 16 (App Router) + React 19, Server Actions, Dockerode, Tailwind CSS +
  Radix/shadcn UI. Node.js ≥ 26.

**Terminología:** digest, tag, semver, daemon, htpasswd, socket proxy, GHCR.

## Brand Commitments

- **Nombre vinculante:** el producto se llama **Docker Image Checker** y debe mantenerse en
  la interfaz y la documentación.
- **Identidad visual existente vinculante:** el logo y los íconos en `public/`
  (`logo.png`, `icon.svg`, favicons, `android-chrome-*`, `apple-touch-icon`, más
  `site.webmanifest`) son definitivos y no deben reemplazarse.
- Voz: documentación y UI predominantemente en español para el mantenedor; la interfaz de
  cara al usuario final es multilingüe (ver Accesibilidad).

## Evidence on Hand

- `PRD.md`: documento de requisitos completo (problema, objetivos, historias de usuario,
  requisitos funcionales/no funcionales, arquitectura, APIs, despliegue, casos de prueba).
- `README.md` y `NOTIFICATIONS.md`: guías de conexión, autenticación, monitoreo y
  notificaciones.
- `AGENTS.md`: descripción arquitectónica detallada del código.
- Assets de marca reales en `public/`.
- Estado de ejemplo en `data/` (`containers-cache.json`, `dashboard-state.json`,
  `dashboard-state.json`).
- No existen todavía: testimonios, métricas de uso, casos de estudio ni benchmarks de
  rendimiento verificados. El trabajo futuro no debe fabricarlos.

## Product Principles

1. **Claridad de un vistazo por encima de la exhaustividad.** El self-hoster debe entender
   qué necesita atención en segundos; el detalle avanzado queda a un nivel más profundo, no
   compitiendo por la atención inicial.
2. **Señal sobre ruido.** Las políticas de versionado existen para no alertar por cambios
   irrelevantes; toda superficie de actualización debe respetar esa filosofía de filtrado.
3. **Acción segura y reversible en la mente del usuario.** Actualizar un contenedor es una
   operación con downtime; la interfaz debe comunicar consecuencias y preservar configuración
   sin sorpresas.
4. **Degradación elegante.** Docker caído, red sin acceso o rate limit son estados normales
   esperados, no errores catastróficos; deben comunicarse con calma y claridad.
5. **Autoalojado y ligero primero.** Cada decisión debe seguir siendo fácil de desplegar y
   operar con Docker Compose por una sola persona.

## Accessibility & Inclusion

- **Idiomas obligatorios:** la interfaz debe conservar el soporte multilingüe en inglés,
  español y portugués (EN/ES/PT), con detección de idioma del navegador/entorno.
- No se ha establecido formalmente un estándar de accesibilidad (p. ej. WCAG) como requisito
  de producto vinculante más allá del soporte de idiomas.
