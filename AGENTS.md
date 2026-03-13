# AGENTS.md

This file provides guidance to Qoder (qoder.com) when working with code in this repository.

## Project Overview

This is a Next.js dashboard application for monitoring Docker containers and checking for image updates. The application connects to the local Docker daemon to list containers and images, and queries Docker Hub to determine if container images have updates available.

## Architecture

- **Frontend**: Next.js 16 with App Router
- **UI Components**: Custom UI components using Radix UI and Tailwind CSS
- **Backend**: Server Actions for Docker operations
- **Docker Integration**: Dockerode library for Docker daemon communication
- **Authentication**: Session-based authentication using htpasswd with iron-session
- **State Management**: React Server Components with server-side data fetching
- **Styling**: Tailwind CSS with custom configuration
- **Notification System**: Background scheduler using node-cron with support for Telegram, ntfy, and Discord notifications

### Key Components

1. **Main Dashboard** (`src/app/page.tsx`):
   - Displays list of Docker containers with status information
   - Shows update status for each container's image
   - Provides refresh functionality
   - Shows authentication logout button when auth is enabled
   - Internationalization support with language detection

2. **Docker Actions** (`src/actions/docker.ts`):
   - `getContainers()`: Lists all Docker containers
   - `getImages()`: Lists all Docker images
   - `checkImageUpdate()`: Checks Docker Hub for image updates
   - `checkDockerConnection()`: Verifies Docker connectivity
   - Handles GitHub Container Registry (GHCR) images with optional PAT support
   - Supports special registries like lscr.io and docker.hyperdx.io that proxy Docker Hub

3. **Docker Library** (`src/lib/docker.ts`):
   - Singleton Dockerode instance with platform-specific socket configuration
   - Handles both Windows (named pipe) and Unix (socket) Docker connections
   - Supports DOCKER_HOST environment variable for TCP connections
   - Uses global singleton pattern to prevent multiple connections in development mode

4. **Authentication System** (`src/actions/auth.ts`, `src/lib/htpasswd.ts`):
   - Session-based authentication using htpasswd format
   - HTTP-only cookies for secure session management via iron-session
   - Supports MD5 (APR1), Bcrypt, and SHA1 hash formats
   - Optional authentication (disabled if AUTH_HTPASSWD is not set)
   - Includes login page at `/login` and logout functionality

5. **Authentication API** (`src/app/api/htpasswd-hash/route.ts`):
   - Provides API endpoint to generate htpasswd hashes
   - Supports APR1 (MD5), Bcrypt, and SHA1 formats
   - POST endpoint to generate hashes, GET for documentation
   - Supports custom salt for APR1 and custom rounds for Bcrypt

6. **Secure Proxy** (`src/proxy.ts`):
   - Middleware to protect routes when authentication is enabled
   - Redirects unauthenticated users to login page
   - Handles authentication state

7. **Notification System** (`src/lib/notifications/`):
   - Background scheduler using node-cron for update checks
   - Supports Telegram, ntfy, and Discord notifications
   - Deduplication to avoid repeated notifications for same updates
   - Internationalization support (EN, ES, PT)
   - Persistent state in `data/notifications-state.json`
   - Integration with dashboard "hide notifications" feature
   - Initialized in `src/instrumentation.ts`

8. **Health Check API** (`src/app/api/health/route.ts`):
   - Detailed health endpoint at `/api/health` for monitoring tools
   - Returns JSON status of application and Docker connection
   - Designed for use with Uptime Kuma and similar monitoring tools

9. **Policy Engine** (`src/lib/policies/`):
   - Semantic versioning comparison logic
   - Update policy evaluation (major, minor, patch version handling)
   - Version prioritization (stable over release candidates/beta)

10. **Internationalization** (`src/lib/i18n/`):
    - Multi-language support (English, Spanish, Portuguese)
    - Language detection from browser or environment
    - Dictionary-based translation system

## Development Commands

### Starting the Development Server
```bash
pnpm dev
```

### Building the Application
```bash
pnpm build
```

### Starting the Production Server
```bash
pnpm start
```

### Code Formatting and Linting
This project uses Biome for code formatting and linting:

```bash
# Format code
pnpm exec biome format --write .

# Lint code
pnpm exec biome lint .

# Format and lint together
pnpm exec biome check --apply .
```

### Testing
This project currently does not have a test suite configured. When adding tests, they would likely use Jest or Vitest for unit tests and Playwright or Cypress for end-to-end tests.

## Environment Variables

### Core Variables
- `AUTH_HTPASSWD`: Optional htpasswd string for authentication (if not set, authentication is disabled)
- `AUTH_SESSION_PASSWORD`: Optional password for encrypting sessions (if not set, uses AUTH_HTPASSWD, must be at least 32 characters)
- `DOCKER_HOST`: Optional Docker daemon host (uses socket by default)
- `NODE_ENV`: Environment mode (development/production)
- `TZ`: Timezone for scheduler (e.g., America/Guayaquil)

### Notification System Variables
- `NOTIFICATIONS_ENABLED`: Enable or disable the entire notification system (default: false)
- `NOTIFICATIONS_LANGUAGE`: Default language for notifications (en, es, pt) (default: en)
- `NOTIFICATIONS_CRON_SCHEDULE`: Cron expression for update checks (default: "0 */6 * * *")
- `TZ`: Timezone for the scheduler (e.g., America/Guayaquil)

### Notification Provider Variables
- `TELEGRAM_ENABLED`: Enable Telegram notifications
- `TELEGRAM_BOT_TOKEN`: Telegram bot token from @BotFather
- `TELEGRAM_CHAT_ID`: Chat ID for notifications
- `NTFY_ENABLED`: Enable ntfy notifications
- `NTFY_TOPIC`: ntfy topic name
- `NTFY_SERVER`: Optional custom ntfy server (default: https://ntfy.sh)
- `NTFY_TOKEN`: Optional ntfy authentication token
- `DISCORD_ENABLED`: Enable Discord notifications
- `DISCORD_WEBHOOK_URL`: Discord webhook URL

### GitHub Container Registry Support
- `GITHUB_GHCR_TOKEN`: GitHub Personal Access Token with read:packages permission for better GHCR image information

## Authentication Setup

The application supports optional authentication using htpasswd format:

1. Generate htpasswd entry using the API (`/api/htpasswd-hash`) or external tools
2. Set the `AUTH_HTPASSWD` environment variable with the htpasswd entry
3. Optionally set `AUTH_SESSION_PASSWORD` with a secure password of at least 32 characters
4. When enabled, users will be redirected to `/login` page for authentication

### Authentication API Usage
```bash
# Generate hash in format Bcrypt
curl -X POST http://localhost:3000/api/htpasswd-hash \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "mipassword", "format": "bcrypt"}'
```

## Notification System Configuration

The application includes a configurable notification system for Docker image updates:

### Providers Supported
- **Telegram**: Requires bot token and chat ID
- **ntfy**: Requires topic name, supports custom servers
- **Discord**: Requires webhook URL

### Persistent Storage
- Notification state is stored in `data/notifications-state.json`
- When using Docker, mount this directory as a volume to persist state across restarts

### Health Check
- Check notification system status at `/api/notifications/health`
- Trigger manual check with POST to `/api/notifications/check`

## Docker Deployment

### Direct Connection (compose.prod.yaml)
- Mounts `/var/run/docker.sock` directly to container
- Requires proper user/group permissions (user: "1001:988" format)
- More direct but requires Docker socket access

### Proxy Connection (compose.proxy.yaml)
- Uses tecnativa/docker-socket-proxy for security
- Only allows read operations (CONTAINERS=1, IMAGES=1, POST=0)
- Safer as it doesn't expose full Docker socket to application

### Multi-architecture Builds
- Supports amd64 and arm64 platforms
- Use `docker buildx` for building and pushing to Docker Hub

## Key Implementation Details

1. **Docker Connection Handling**:
   - Uses singleton pattern to prevent multiple connections in development mode
   - Platform-specific Docker socket configuration (Windows named pipe vs Unix socket)
   - Supports DOCKER_HOST environment variable for remote Docker daemons

2. **Image Update Checking**:
   - Queries Docker Hub API to compare local image digests with remote versions
   - Parses semantic versioning information from Docker tags
   - Prioritizes stable versions over release candidates or beta versions
   - Handles local/private images that don't exist on Docker Hub
   - Supports GitHub Container Registry with optional PAT for better information
   - Handles special registries like lscr.io and docker.hyperdx.io that proxy Docker Hub

3. **Server-Side Data Fetching**:
   - Uses React Server Components for data fetching
   - Implements `dynamic = 'force-dynamic'` to prevent caching of Docker information
   - Uses Next.js cache revalidation for Docker Hub API calls

4. **UI Features**:
   - Responsive card-based layout for container information
   - Status badges for container states (running, stopped, etc.)
   - Direct links to Docker Hub for images with available updates
   - Debug information via collapsible JSON views
   - Statistics summary showing update status counts
   - Internationalization support with language detection

5. **Security Features**:
   - HTTP-only cookies for session management via iron-session
   - Authentication middleware to protect routes
   - Secure cookie settings (secure flag in production)
   - Support for Docker socket proxy for enhanced security
   - Salted password hashes with multiple supported formats

6. **Notification Scheduler**:
   - Initialized via Next.js instrumentation API (`src/instrumentation.ts`)
   - Runs background checks based on cron schedule
   - Includes initial check after startup (30 seconds delay)
   - Validates provider configurations before starting

## Additional Notes

- The application uses Dockerode for Docker daemon communication with platform-specific socket handling
- It supports multiple registry types including Docker Hub, GitHub Container Registry (GHCR), and special proxy registries
- The policy engine handles semantic versioning logic to determine appropriate update recommendations
- Notification deduplication prevents repeated alerts for the same updates
- The application is designed to work with monitoring tools like Uptime Kuma via the health endpoint