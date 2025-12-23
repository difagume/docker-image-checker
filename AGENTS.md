# AGENTS.md

This file provides guidance to Qoder (qoder.com) when working with code in this repository.

## Project Overview

This is a Next.js dashboard application for monitoring Docker containers and checking for image updates. The application connects to the local Docker daemon to list containers and images, and queries Docker Hub to determine if container images have updates available.

## Architecture

- **Frontend**: Next.js 16 with App Router
- **UI Components**: Custom UI components using Radix UI and Tailwind CSS
- **Backend**: Server Actions for Docker operations
- **Docker Integration**: Dockerode library for Docker daemon communication
- **Authentication**: Session-based authentication using htpasswd with HTTP-only cookies
- **State Management**: React Server Components with server-side data fetching
- **Styling**: Tailwind CSS with custom configuration

### Key Components

1. **Main Dashboard** (`src/app/[lang]/page.tsx`):
   - Displays list of Docker containers with status information
   - Shows update status for each container's image
   - Provides refresh functionality
   - Shows authentication logout button when auth is enabled

2. **Docker Actions** (`src/actions/docker.ts`):
   - `getContainers()`: Lists all Docker containers
   - `getImages()`: Lists all Docker images
   - `checkImageUpdate()`: Checks Docker Hub for image updates
   - `checkDockerConnection()`: Verifies Docker connectivity

3. **Docker Library** (`src/lib/docker.ts`):
   - Singleton Dockerode instance with platform-specific socket configuration
   - Handles both Windows (named pipe) and Unix (socket) Docker connections
   - Supports DOCKER_HOST environment variable for TCP connections

4. **Authentication System** (`src/actions/auth.ts`, `src/lib/htpasswd.ts`):
   - Session-based authentication using htpasswd format
   - HTTP-only cookies for secure session management
   - Supports MD5 (APR1), Bcrypt, and SHA1 hash formats
   - Optional authentication (disabled if AUTH_HTPASSWD is not set)

5. **Authentication API** (`src/app/api/htpasswd-hash/route.ts`):
   - Provides API endpoint to generate htpasswd hashes
   - Supports APR1 (MD5), Bcrypt, and SHA1 formats
   - POST endpoint to generate hashes, GET for documentation

6. **Secure Proxy** (`src/proxy.ts`):
   - Middleware to protect routes when authentication is enabled
   - Redirects unauthenticated users to login page
   - Handles authentication state

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

## Environment Variables

- `AUTH_HTPASSWD`: Optional htpasswd string for authentication (if not set, authentication is disabled)
- `DOCKER_HOST`: Optional Docker daemon host (uses socket by default)
- `NODE_ENV`: Environment mode (development/production)

## Authentication Setup

The application supports optional authentication using htpasswd format:

1. Generate htpasswd entry using the API (`/api/htpasswd-hash`) or external tools
2. Set the `AUTH_HTPASSWD` environment variable with the htpasswd entry
3. When enabled, users will be redirected to `/login` page for authentication

## Testing

This project currently does not have a test suite configured. When adding tests, they would likely use Jest or Vitest for unit tests and Playwright or Cypress for end-to-end tests.

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

5. **Security Features**:
   - HTTP-only cookies for session management
   - Authentication middleware to protect routes
   - Secure cookie settings (secure flag in production)
   - Support for Docker socket proxy for enhanced security