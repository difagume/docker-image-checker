# Static Shell Prerender — Delta Spec (static-shell-prerender)

Change: unified-data-cache

## ADDED Requirements

### Requirement: REQ-01 — `/` sin instant=false

`src/app/page.tsx` NO DEBE (MUST NOT) declarar `instant = false` ni ningún otro opt-out de Cache Components. Las lecturas dinámicas (`checkAuth` → cookies, `getLocale` → headers) DEBEN (MUST) moverse dentro del subtree envuelto en `<Suspense>`; el shell exterior NO DEBE (MUST NOT) depender de cookies ni headers.

### Requirement: REQ-02 — `/login` sin instant=false

`src/app/login/page.tsx` NO DEBE (MUST NOT) declarar `instant = false`. El gate (`checkAuth` → cookies, `redirect` si autenticado) DEBE (MUST) moverse dentro de `<Suspense>`. El shell estático (formulario/fallback) queda fuera del gate.

### Requirement: REQ-03 — Sin regresión de seguridad

El sistema DEBE (MUST) mantener `src/proxy.ts` como barrera principal (redirige no-auth de `/` a `/login` y autenticados de `/login` a `/`). El shell estático y su prefetch NO DEBEN (MUST NOT) contener datos de contenedores ni estado sensible.

### Requirement: REQ-04 — layout.tsx mantiene su Block; opt-outs 3 → 1

`src/app/layout.tsx` DEBE (MUST) conservar su Block documentado (nonce CSP + locale). El número de opt-outs de build DEBE (MUST) pasar de 3 a 1, quedando únicamente el Block del layout.

### Requirement: REQ-05 — Gate server-side sin client providers

La decisión de auth DEBE (MUST) permanecer server-side (cookies/headers) y NO DEBE (MUST NOT) introducir client providers ni trasladar la autenticación al cliente. El primer paint del shell NO DEBE (MUST NOT) esperar a la resolución del daemon ni del registry.

Spec base: `openspec/specs/static-shell-prerender/spec.md` (contenido completo con escenarios ESC-01..ESC-07).
