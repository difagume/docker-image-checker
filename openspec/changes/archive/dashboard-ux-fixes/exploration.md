## Exploration: dashboard-ux-fixes

### Current State

The dashboard is a Next.js App Router application using React Server Components for initial data fetching and client-side hooks for real-time updates. Docker operations are handled via server actions (`src/actions/docker.ts`). The UI displays container cards with status, ports, image info, and update availability. Authentication is optional via htpasswd.

### Affected Areas

#### 1. Docker connection status on load
- `src/actions/docker.ts` — `getContainers()` and `getImages()` return empty arrays on error
- `src/components/dashboard-content.tsx` — Shows "noContainers" message when arrays are empty
- `src/lib/docker.ts` — Docker connection initialization

#### 2. Fix port display
- `src/components/dashboard-content.tsx` — Line 30: `${p.PrivatePort}:${p.PublicPort}` (incorrect order)
- `src/components/container-card.tsx` — Renders ports string

#### 3. Progress bar during check
- `src/hooks/use-container-updates.ts` — `checkProgress` state exists (lines 56-59) but not destructured in `container-dashboard.tsx` line 53-58
- `src/components/container-dashboard.tsx` — Does not render progress bar

#### 4. Fix image name parsing
- `src/actions/docker.ts` — Line 94: `imageName.split(':')` breaks on `registry.example.com:5000/image:tag`
- `src/actions/container-cache.ts` — Line 38: `imageName.split(':')[1]`
- `src/components/dashboard-content.tsx` — Line 33: `container.Image.split(':')[1]`
- `src/components/container-card.tsx` — Lines 481, 484, 486, 489, 501: `container.Image.split(':')[0]`
- `src/hooks/use-container-updates.ts` — Lines 163, 230, 334: `split(':')[1]` and `split(':')[0]`
- `src/lib/notifications/notification-service.ts` — Line 75: `container.Image.split(':')`

#### 5. Container Start/Stop/Restart controls
- `src/components/container-card.tsx` — No lifecycle controls currently
- `src/actions/docker.ts` — `updateContainerImage()` shows Dockerode API patterns for container operations
- `src/lib/docker.ts` — Docker singleton instance

#### 6. Rate limiting on /api/htpasswd-hash
- `src/app/api/htpasswd-hash/route.ts` — POST endpoint with no rate limiting or authentication
- `src/proxy.ts` — Middleware excludes `/api` routes from auth (line 72)

### Approaches

#### 1. Docker connection status
- **Approach A**: Modify `getContainers()`/`getImages()` to throw on error instead of returning empty arrays
  - Pros: Simple, forces error handling
  - Cons: Breaking change, requires updating all callers
  - Effort: Low

- **Approach B**: Add connection check before fetching, return structured error
  - Pros: Non-breaking, provides specific error state
  - Cons: Extra API call, slightly more complex
  - Effort: Medium

#### 2. Port display fix
- **Approach**: Simple string reorder in `dashboard-content.tsx`
  - Pros: One-line fix, no side effects
  - Cons: None
  - Effort: Low

#### 3. Progress bar
- **Approach**: Destructure `checkProgress` from hook and render progress bar component
  - Pros: Already implemented in hook, just needs UI
  - Cons: Need to design progress bar component
  - Effort: Low

#### 4. Image name parsing
- **Approach A**: Create utility function `parseImageName(image: string): { name: string, tag: string }`
  - Pros: Centralized logic, handles edge cases
  - Cons: Need to update all call sites
  - Effort: Medium

- **Approach B**: Use Docker API or existing library for parsing
  - Pros: Battle-tested logic
  - Cons: Additional dependency
  - Effort: Medium

#### 5. Container lifecycle controls
- **Approach**: Add server actions for `startContainer`, `stopContainer`, `restartContainer` using Dockerode
  - Pros: Leverages existing Docker singleton, follows current patterns
  - Cons: Need to add UI buttons, handle async operations, error states
  - Effort: Medium

#### 6. Rate limiting
- **Approach A**: Implement in-memory rate limiting (e.g., sliding window)
  - Pros: No external dependencies
  - Cons: Not distributed, resets on restart
  - Effort: Low

- **Approach B**: Add authentication check to endpoint
  - Pros: Leverages existing auth system
  - Cons: May break current usage patterns
  - Effort: Low

### Dependencies between items

1. **Port display fix** (2) is independent
2. **Image name parsing** (4) affects multiple files but is independent of other items
3. **Progress bar** (3) depends on existing hook structure (already implemented)
4. **Docker connection status** (1) could affect how other Docker operations handle errors
5. **Container lifecycle controls** (5) is independent but follows same patterns as image update
6. **Rate limiting** (6) is independent

### Risks and edge cases

1. **Image name parsing**: Registry URLs with ports (e.g., `registry.example.com:5000/image:tag`) must be handled correctly. Also consider images without tags (defaults to `latest`), images with multiple colons in path (unlikely but possible).

2. **Docker connection**: Must handle Docker daemon not running, socket permission issues, remote Docker host unreachable. Should provide meaningful error messages.

3. **Port display**: Some containers may have no ports, or ports without host bindings (PrivatePort only). Need to handle empty PublicPort.

4. **Progress bar**: Must handle cancellation, network errors, and provide visual feedback for long-running operations.

5. **Container lifecycle**: Operations can fail (e.g., container in invalid state). Need proper error handling and user feedback. Consider adding confirmation dialogs for destructive operations.

6. **Rate limiting**: Must not break existing functionality. Should allow sufficient requests for legitimate use while preventing abuse.

### Recommended implementation order

1. **Port display fix** (2) — Quick win, no dependencies
2. **Image name parsing** (4) — Core bug affecting multiple areas
3. **Docker connection status** (1) — Improves error handling foundation
4. **Progress bar** (3) — Already partially implemented
5. **Rate limiting** (6) — Security improvement
6. **Container lifecycle controls** (5) — Feature addition, most complex

### Ready for Proposal
Yes — all items are well-defined with clear affected files and approaches. The changes are independent enough to be implemented in any order, but the recommended sequence addresses foundational issues first.

**Status**: success
**Summary**: Explored 6 dashboard UX improvements, identified affected files, assessed complexity, and recommended implementation order.
**Artifacts**: Engram `sdd/dashboard-ux-fixes/explore` | `openspec/changes/dashboard-ux-fixes/exploration.md`
**Next**: sdd-propose
**Risks**: Image name parsing edge cases with registry ports; Docker connection error handling; rate limiting must not break existing auth flow
**Skill Resolution**: paths-injected — sdd-explore skill loaded