# Shell Estático en `/` y `/login` (static-shell-prerender)

## Purpose

Eliminar `export const instant = false` de `/` (`src/app/page.tsx`) y `/login` (`src/app/login/page.tsx`) moviendo el gate de autenticación (cookies/headers) dentro de `<Suspense>`, de modo que el shell (layout + cabecera + fallback) sea estático y prefeteachable. La seguridad NO depende del gate de render: `src/proxy.ts` (middleware) sigue siendo la barrera que redirige no-auth. `src/app/layout.tsx` mantiene su Block documentado (nonce CSP + locale). Opt-outs de build: 3 → 1.

## Requirements

### Requirement: REQ-01 — `/` sin instant=false

`src/app/page.tsx` NO DEBE (MUST NOT) declarar `instant = false` ni ningún otro opt-out de Cache Components. Las lecturas dinámicas (`checkAuth` → cookies, `getLocale` → headers) DEBEN (MUST) moverse dentro del subtree envuelto en `<Suspense>`; el shell exterior NO DEBE (MUST NOT) depender de cookies ni headers.

#### Scenario: ESC-01 — Dashboard con primer paint inmediato

- GIVEN sesión autenticada válida
- WHEN un usuario navega a `/`
- THEN el shell estático se sirve de inmediato (primer paint) y el contenido (`DashboardContent`) se resuelve tras el gate auth dentro del Suspense
- AND el dashboard muestra los datos cacheados sin regresión respecto al render actual

#### Scenario: ESC-02 — Usuario no autenticado (seguridad)

- GIVEN un usuario sin sesión
- WHEN solicita `/` (navegación real, no prefetch)
- THEN el middleware (`src/proxy.ts`) lo redirige a `/login` ANTES del render
- AND el shell estático y su payload NO contienen datos de inventario (el dato está tras el gate en el Suspense)

### Requirement: REQ-02 — `/login` sin instant=false

`src/app/login/page.tsx` NO DEBE (MUST NOT) declarar `instant = false`. El gate (`checkAuth` → cookies, `redirect` si autenticado) DEBE (MUST) moverse dentro de `<Suspense>`. El shell estático (formulario/fallback) queda fuera del gate.

#### Scenario: ESC-03 — Login estático

- GIVEN `AUTH_HTPASSWD` configurado y usuario sin sesión
- WHEN se navega a `/login`
- THEN el shell estático renderiza de inmediato y el gate dentro del Suspense no redirige (no autenticado)
- AND el formulario de login funciona tras la hidratación

#### Scenario: ESC-04 — Autenticado visita /login

- GIVEN un usuario con sesión activa
- WHEN solicita `/login` (navegación real)
- THEN el middleware lo redirige a `/` ANTES del render
- AND el gate dentro del Suspense actúa como defensa en profundidad (redirect server-side)

### Requirement: REQ-03 — Sin regresión de seguridad

El sistema DEBE (MUST) mantener `src/proxy.ts` como barrera principal: redirige no-auth de `/` a `/login` y autenticados de `/login` a `/`, incluyendo la CSP con nonce. El shell estático y su prefetch NO DEBEN (MUST NOT) contener datos de contenedores ni estado sensible; los datos se resuelven exclusivamente tras el gate dentro del Suspense.

#### Scenario: ESC-05 — Prefetch del shell

- GIVEN una navegación cliente desde otra página con `<Link>` hacia `/`
- WHEN el navegador prefetchea
- THEN se entrega el shell estático (HTML/RSC del shell + fallback), sin datos de inventario
- AND el contenido dinámico carga al resolver el gate en la navegación real

### Requirement: REQ-04 — layout.tsx mantiene su Block; opt-outs 3 → 1

`src/app/layout.tsx` DEBE (MUST) conservar su Block documentado (nonce CSP + locale). El número de opt-outs de build DEBE (MUST) pasar de 3 a 1, quedando únicamente el Block del layout.

#### Scenario: ESC-06 — Build con opt-outs reducidos

- GIVEN `cacheComponents: true`
- WHEN se ejecuta `pnpm build`
- THEN el build reporta 1 único opt-out (layout, Block documentado)
- AND `/` y `/login` se prerenderizan como shell estático (sin `instant = false`)

### Requirement: REQ-05 — Gate server-side sin client providers

La decisión de auth DEBE (MUST) permanecer server-side (cookies/headers) y NO DEBE (MUST NOT) introducir client providers ni trasladar la autenticación al cliente. El primer paint del shell NO DEBE (MUST NOT) esperar a la resolución del daemon ni del registry; el contenido cacheado se muestra en el primer paint del subtree o su fallback (skeleton), sin bloquear el shell.

#### Scenario: ESC-07 — Gate server-side sin providers

- GIVEN la ruta con el nuevo patrón `<Suspense>`
- WHEN se renderiza la ruta
- THEN la decisión de auth ocurre en el servidor dentro del Suspense
- AND no hay client provider nuevo ni fuga de datos en el payload estático

## Criterios de aceptación (medibles)

- `pnpm build` OK y opt-outs = 1 (solo layout)
- `rg "instant\s*=\s*false" src/app` → 0 coincidencias
- El HTML estático prerenderizado de `/` y `/login` NO contiene datos de contenedores (verificación smoke)
- Middleware intacto: redirecciones de `/` y `/login` sin cambios
