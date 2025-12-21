# AGENTS.md

This file provides guidance to Qoder (qoder.com) when working with code in this repository.

## Project Overview

This is a Next.js dashboard application for monitoring Docker containers and checking for image updates. The application connects to the local Docker daemon to list containers and images, and queries Docker Hub to determine if container images have updates available.

## Architecture

- **Frontend**: Next.js 16 with App Router
- **UI Components**: Custom UI components using Radix UI and Tailwind CSS
- **Backend**: Server Actions for Docker operations
- **Docker Integration**: Dockerode library for Docker daemon communication
- **State Management**: React Server Components with server-side data fetching
- **Styling**: Tailwind CSS with custom configuration

### Key Components

1. **Main Dashboard** (`src/app/page.tsx`):
   - Displays list of Docker containers with status information
   - Shows update status for each container's image
   - Provides refresh functionality

2. **Docker Actions** (`src/actions/docker.ts`):
   - `getContainers()`: Lists all Docker containers
   - `getImages()`: Lists all Docker images
   - `checkImageUpdate()`: Checks Docker Hub for image updates
   - `checkDockerConnection()`: Verifies Docker connectivity

3. **Docker Library** (`src/lib/docker.ts`):
   - Singleton Dockerode instance with platform-specific socket configuration
   - Handles both Windows (named pipe) and Unix (socket) Docker connections

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

## Testing

This project currently does not have a test suite configured. When adding tests, they would likely use Jest or Vitest for unit tests and Playwright or Cypress for end-to-end tests.

## Key Implementation Details

1. **Docker Connection Handling**:
   - Uses singleton pattern to prevent multiple connections in development mode
   - Platform-specific Docker socket configuration (Windows named pipe vs Unix socket)

2. **Image Update Checking**:
   - Queries Docker Hub API to compare local image digests with remote versions
   - Parses semantic versioning information from Docker tags
   - Prioritizes stable versions over release candidates or beta versions

3. **Server-Side Data Fetching**:
   - Uses React Server Components for data fetching
   - Implements `dynamic = 'force-dynamic'` to prevent caching of Docker information
   - Uses Next.js cache revalidation for Docker Hub API calls

4. **UI Features**:
   - Responsive card-based layout for container information
   - Status badges for container states (running, stopped, etc.)
   - Direct links to Docker Hub for images with available updates
   - Debug information via collapsible JSON views