# Design: Update Docker Images from Telegram (Long Polling + Inline Buttons)

Change: `telegram-update-imagenes` | Capability: `telegram-update-actions` | Branch: `feat/telegram-update-imagenes`

## Technical Approach

One-tap Docker image updates from Telegram. The outbound update notification gains an inline **Update** button (`callback_data = u:{shortId}`); a long-polling inbound bot (same Node process, started from `src/instrumentation.ts` `register()` next to `initScheduler()`) receives the tap and runs the **same update pipeline as the web** through a new request-agnostic shared core `runContainerUpdateTask`. Because `updateTag`/`revalidateTag` throw outside the App Router request context (probe below: E872/E263), the polling path revalidates the cache through a loopback-only internal route handler `/api/internal/revalidate` that calls `revalidateTag(tag, { expire: 0 })` — the documented pattern for third-party/loopback callers needing immediate expiration. The message is edited `updating… → success | error | already-up-to-date` with friendly text, never stack traces. Covers spec R1–R15, N1–N7; no webhook, no slash commands, no new dependencies, no exposed ports.

## Probe: Cache Revalidation Outside Request Context (evidence)

Scratch probe (next@16.3.0, temporary file at repo root, deleted after run) importing `next/cache`:

| Call | Context | Result | Evidence |
|---|---|---|---|
| `revalidateTag('docker:containers', { expire: 0 })` | no request store | **THROWS** | E263 `Invariant: static generation store missing in revalidateTag docker:containers` |
| `updateTag('docker:containers')` | no request store | **THROWS** | E872 `updateTag can only be called from within a Server Action...` |
| `revalidateTag('docker:containers')` (1-arg) | no request store | **THROWS** + deprecation warning | E263 |

Source read (`node_modules/next/dist/server/web/spec-extension/revalidate.js`): `revalidate()` demands `workAsyncStorage.getStore().incrementalCache` else E263; `updateTag()` rejects `!workStore || workStore.page.endsWith('/route')` (E872); route handlers run with `workUnitStore.phase === 'request'` → allowed (`case 'request'`). Docs (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidateTag.md`): *"For webhooks or third-party services that need immediate expiration, you can pass `{ expire: 0 }` … This pattern is necessary when external systems call your Route Handlers."* `{ expire: 0 }` passed profile validation (`validateAndNormalizeCacheLifeProfile`) before the store check — only the missing store threw.

**Decision: loopback tunnel is PRIMARY and the only supported in-process-callable path.** No simpler in-process alternative exists: the missing piece is `store.incrementalCache`, which only exists inside a real request context; fabricating the AsyncLocalStorage work store is an unstable internal API — rejected. Guarded try/catch + natural `cacheLife` expiry (inventory ≤ 1 h, connection ≤ 1 min) + scheduler raw readers remain the fallback (R12.2).

## Architecture Decisions

| # | Option | Tradeoff | Decision |
|---|---|---|---|
| D1 Revalidation transport | (a) loopback tunnel `/api/internal/revalidate`; (b) direct in-process call; (c) none | (a) documented + source-verified, real request context; (b) E263, internal-API hack; (c) dashboard stale ≤ 1 h | **Tunnel (a)** primary; (c) as guarded fallback |
| D2 Shared core | Extract `src/lib/container-update-task.ts` vs reuse `triggerContainerUpdate` verbatim | One core prevents web/Telegram behavioral drift (N/A risk); web action keeps `updateTag` semantics | **Extract core**; action becomes thin wrapper |
| D3 Progress wiring | In-process promise + `onPhase` callback vs SSE vs store polling | Poller is already in-process; promise resolves at terminal phase; zero HTTP | **Promise + onPhase**, no SSE for Telegram |
| D4 Poller singleton | `globalThis.__telegram_poller__` guard vs module scope | Dev HMR double `getUpdates` → Telegram 409 for the token | **globalThis guard**, created once in `register()` |
| D5 Callback writes | fs-atomic `writeFileAtomic` vs old sync `writeFileSync` | fs-atomic: temp+rename same dir, per-file mutex (last-writer-wins), EPERM/EACCES retry (Windows), tests exist (`fs-atomic.test.ts`) | **fs-atomic**, serialized read-modify-write |
| D6 Revalidate URL | `INTERNAL_REVALIDATE_URL` env override, else `http://127.0.0.1:${PORT\|3000}` | Dockerfile sets `PORT=3000`, `HOSTNAME=0.0.0.0`; loopback must hit own server | **Derived with env override** |
| D7 Edit errors | Ignore benign Telegram edit failures | Racy taps / identical text (`message is not modified`) must not surface | **try/catch, swallow benign codes** |
| D8 callback_data | `u:` + 8-char hex shortId = 10 bytes | Telegram limit 64 bytes; store maps shortId → full payload | **10-byte payload**; TTL 24 h, cap 1000 |
| D9 Nonce sharing | `globalThis.__docker_revalidate_nonce__` vs module constant | Turbopack/webpack may instantiate shared lib per bundle; `globalThis` unifies across bundles in the same process (same pattern as `progressStore`) | **globalThis lazily-created UUID** |
| D10 Chat validation | `Set` parsed from comma-separated `TELEGRAM_CHAT_ID` | Defense-in-depth on top of shortId store; unknown chats ignored (R13) | **Parsed set**, whitespace-trimmed |

## Data Flow

Tap sequence:

    Telegram user taps "Update"
      │ callback_query { data: "u:ab12cd34", message.chat.id }
      ▼
    telegram-polling (singleton, long polling)
      │ 1. parse shortId → getCallbackData (fs-atomic read) → {containerId, fullImageName, locale}
      │ 2. chat.id ∈ allowedChatIds(TELEGRAM_CHAT_ID set)? else answer + ignore (R13)
      │ 3. answerCallbackQuery (dismiss spinner)
      │ 4. editMessageText "updating…" (locale i18n)
      │ 5. isContainerUpdating? → edit "already in progress", return (R7)
      │ 6. raw readers: container missing → edit friendly error, remove callback (R9)
      │    container.Image === fullImageName → edit "already up to date", remove callback (R8)
      │ 7. runContainerUpdateTask(containerId, image, { revalidate: tunnelFetch, onPhase })
      │      onPhase (throttled) → editMessageText per phase
      │      ├─ success → requestRevalidation(REFRESH_TAGS) → edit success → remove callback (R5/R12)
      │      ├─ error   → edit friendly error → cleanup progress → remove callback (R10)
      ▼
    terminal message state

Revalidation flow (post-success, outside request context):

    polling path ──fetch──▶ http://127.0.0.1:PORT/api/internal/revalidate
        headers: x-revalidate-nonce: <globalThis nonce>        body: { tags: REFRESH_TAGS }
    route: nonce matches? (primary) + loopback IP when available (best-effort)
        → revalidateTag(t, { expire: 0 }) × 4 → 200 { revalidated: true }
        else → 403 (nonce) / 400 (bad body). Failure → log; fallback = natural expiry (R12.2)

## File Changes

| File | Action | Description |
|---|---|---|
| `src/types/app-state.ts` | Modify | `+dockerContainerId`, `+fullImageName` on `ContainerUpdate`/`NotificationMessage`; `+update/updating/updateStatusSuccess/updateStatusError/updateStatusAlready` on `NotificationTranslations` |
| `src/lib/notifications/notification-service.ts` | Modify | Populate real `container.Id` / `container.Image`; drop `containerId: ''` (R1) |
| `src/lib/notifications/providers/telegram.ts` | Modify | `storeCallbackData` + inline keyboard (Telegram only, R2); keep `link_preview_options` |
| `src/lib/notifications/notification-callbacks.ts` | New | fs-atomic callback store (R3) |
| `src/lib/container-update-task.ts` | New | Shared core `runContainerUpdateTask` (R6); `doUpdateContainerImage` + `OnPhaseCallback` moved here |
| `src/actions/docker.ts` | Modify | `triggerContainerUpdate` delegates to core with `updateTag` revalidator (R6, web unchanged); re-export `updateContainerImage`/`OnPhaseCallback` |
| `src/lib/notifications/telegram-polling.ts` | New | Poller singleton, callback handler, message edits, chat validation (R4/R5/R7/R8/R9/R10/R13) |
| `src/lib/notifications/revalidate-tunnel.ts` | New | `requestRevalidation`, `getInternalRevalidateUrl`, nonce getter (R12) |
| `src/app/api/internal/revalidate/route.ts` | New | Nonce + loopback-guarded route → `revalidateTag(tag, { expire: 0 })` (R12) |
| `src/instrumentation.ts` | Modify | Start poller next to `initScheduler()` (R4/R15) |
| i18n `en/es/pt-BR.json` | Modify | `notifications.update*` keys, dict parity (R14) |
| `docs/telegram-image-update-implementation.md` | Modify | Rewrite for polling |
| `.env.example` + compose files | Modify | Document comma-separated `TELEGRAM_CHAT_ID`, optional `INTERNAL_REVALIDATE_URL` |

## Interfaces / Contracts

```ts
// src/lib/container-update-task.ts
export type UpdateRevalidator = (tags: readonly string[]) => Promise<void> | void
export type OnPhaseCallback = (phase: UpdatePhase, data?: { statusText?: string; layerProgress?: {...} }) => void
export interface UpdateTaskHandle { taskId: string; done: Promise<UpdateTaskResult> }
export interface UpdateTaskResult { success: boolean; error?: string; newContainerId?: string; newImageId?: string }
export async function runContainerUpdateTask(containerId: string, newImageName: string, opts: { revalidate?: UpdateRevalidator; onPhase?: OnPhaseCallback }): Promise<UpdateTaskHandle>
// dedup (isContainerUpdating → throw), createTask/registerContainer, fire-and-forget doUpdateContainerImage
// feeding progressStore, success → revalidate?.() + clearContainerCallbacks(containerId) (R11),
// setResult/setError, cleanup() always. done resolves at terminal phase.

// src/lib/notifications/notification-callbacks.ts  (all fs-atomic, async)
storeCallbackData(containerId, fullImageName, locale): Promise<string>   // returns 8-char shortId
getCallbackData(shortId): Promise<CallbackData | null>                   // TTL-expired → null (+ purge)
removeCallbackData(shortId): Promise<void>
clearContainerCallbacks(containerId): Promise<number>                    // R11
getPendingCallbacksCount(): Promise<number>

// src/lib/notifications/telegram-polling.ts
export function initTelegramPolling(): void    // env-gated + globalThis singleton (R4/R4.2)
export function stopTelegramPolling(): void    // R15 (SIGTERM/SIGINT)
export function getTelegramPollingStatus(): { enabled: boolean; running: boolean }

// src/lib/notifications/revalidate-tunnel.ts
export function getInternalRevalidateUrl(): string                       // env override | 127.0.0.1:PORT|3000
export async function requestRevalidation(tags: readonly string[]): Promise<boolean>
export function getRevalidateNonce(): string                             // globalThis.__docker_revalidate_nonce__

// src/app/api/internal/revalidate/route.ts  (POST { tags: string[] })
// requires header x-revalidate-nonce === getRevalidateNonce(); loopback best-effort; 403/400 otherwise
```

Web action contract (unchanged for consumers): `triggerContainerUpdate(containerId, newImageName): Promise<{ taskId: string }>` — calls core, does not await `done`, returns `taskId` (same fire-and-forget + read-your-writes semantics as today; `use-container-updates.ts` untouched).

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Unit | `notification-callbacks` (store/TTL/cap-1000/clear) | vitest with temp dirs; assert no-corruption under `Promise.all` (mirror `fs-atomic.test.ts`) |
| Unit | `container-update-task` (dedup throw, injected revalidator called on success, clearContainerCallbacks on success, cleanup) | vitest with mocked dockerode + progressStore |
| Unit | Chat-id parsing (single/comma/whitespace) | vitest |
| Unit | Revalidate URL derivation (env override, PORT fallback) | vitest |
| Integration | Internal revalidate route (nonce ok → revalidates; wrong/missing nonce → 403; bad body → 400) | vitest route handler with mocked `revalidateTag` |
| E2E | `pnpm build` + `pnpm test` green; Biome clean (N2) | verify phase |

## Threat Matrix

N/A — no shell, subprocess, VCS/PR automation, executable-classification, or process-integration boundary. The internal revalidate route is plain HTTP handled by Next's own routing (the auth proxy matcher already excludes `/api`); its security gate (in-process nonce + best-effort loopback) is covered by the integration tests above, not by this matrix.

## Migration / Rollout

No migration required. Fully env-gated: no `TELEGRAM_BOT_TOKEN`/`NOTIFICATIONS_ENABLED` → poller and keyboard never start; web update flow unchanged if the core refactor regresses (action still delegates with same semantics). Rollback = revert commits; delete `data/telegram-callbacks.json` to drop pending buttons.

## Open Questions

- None blocking. Non-blocking notes: `TELEGRAM_CHAT_ID` may hold any token format (numeric private/group ids, `@username`); parser accepts all — validation only rejects non-members.
