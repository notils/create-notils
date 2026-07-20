# Auth and shared API client (transport core built; providers not yet built)

Status: **`@notils/api-client`'s transport core is built** at
[`packages/api-client`](../packages/api-client) — ported verbatim from
`rn-monorepo`'s `packages/api-client/src/http.ts`, renamed to the
`@notils/api-client` specifier, typechecks clean standalone and across the
whole workspace. It ships only the platform-neutral half: `createHttpClient`,
`HttpError`, and the `AuthProvider` contract type (plus `anonymousAuthProvider`).
`rn-monorepo`'s `auth/jwt.ts` (the RN-specific `SecureStore`-backed provider)
was deliberately **not** ported — it's platform-specific by construction and
belongs in a future RN-targeting provider package, not the shared core. No
provider (Better Auth or custom-backend) exists yet, and the package is not
yet wired into `apps/app` — that happens once the first provider needs to call
it for real.

## Goal

Two client platforms will eventually share one API-calling story:

- **Web** (`create-notils` output) — Next.js, session lives in an httpOnly
  cookie, browser sends it automatically.
- **React Native** (`create-rnstack` output, merge target) — no cookie jar,
  session must be a token fetched, stored (SecureStore/Keychain), and
  attached to every request manually.

`create-rnstack` already has this solved for RN in
`packages/api-client/src/http.ts`: an auth-agnostic `HttpClient` (typed
`get/post/put/patch/delete`, `HttpError`, query params, JSON body handling)
that delegates *only* token retrieval/refresh to an injected `AuthProvider`,
with single-flight refresh-and-retry on 401.

Better Auth's default web model is cookie sessions, not bearer tokens — its
own client (`createAuthClient`) already does session fetch/refresh/CSRF. So
the web side doesn't need the RN client's refresh machinery; it needs the
*transport* half (typed wrapper, `HttpError`, params) with a thin
`AuthProvider` that reads Better Auth's session instead of a stored token.

## Strategy: same shape as the monorepo/standalone split — one core, two providers

Don't fork the client per platform. Split what's already proven in
`http.ts` into:

1. **Transport core** (platform-neutral, move into `@notils/api-client`
   unchanged): `buildUrl`, `parseBody`, `HttpError`, `HttpClient` type,
   `createHttpClient`'s method helpers. This code has zero RN-specific or
   web-specific logic today — it's already portable.
2. **`AuthProvider`** (platform-specific, one implementation per platform):

   | | RN (`create-rnstack`, existing) | Web (`create-notils`, new) |
   |---|---|---|
   | `getAccessToken()` | read token from SecureStore | no-op — cookie sent automatically by `fetch` |
   | `refresh()` | call refresh endpoint, store new token | call Better Auth's session refresh, or no-op if Better Auth handles it transparently |
   | `onAuthError()` | clear stored token, redirect to login | redirect to login |
   | Authorization header | `Bearer <token>`, set manually | none — cookie does the work |

   The web `AuthProvider` is likely a thin no-op/pass-through shim, since
   Better Auth + cookies removes most of what the RN provider exists to do.
   Confirm this once Better Auth is wired up — don't assume in advance.

3. **Package boundary** (mirrors the existing boundary-map discipline in
   [cli-monorepo-vs-standalone.md](cli-monorepo-vs-standalone.md)): only
   ever cross from app code into the shared client via the `HttpClient` and
   `AuthProvider` types. If a platform needs something the core doesn't
   expose, extend the core's contract — don't reach around it.

## Open questions to resolve when building (not now)

- Does the web app need `Authorization`-header calls at all (e.g. a separate
  backend service Better Auth doesn't front), or is it cookie-only end to
  end? This decides whether the web `AuthProvider` is a real implementation
  or a permanent no-op.
- Does Better Auth's session need proactive refresh, or does it renew
  transparently per-request? Determines whether `refreshOnce()`'s
  single-flight logic is needed on web or is RN-only.
- ~~Package name/location: `@notils/api-client` under `packages/`, following
  the same `@notils/ui` / `@notils/config` convention.~~ **Resolved:** built at
  `packages/api-client`, exact convention match.

## Non-negotiable when it's built

Same golden-build discipline as the monorepo/standalone transform: once
`@notils/api-client` exists, scaffold both an RN app and a Next.js app
against it in CI and confirm both build/typecheck — the shared core must not
silently assume a browser (`fetch` global availability aside) or a native
storage API.
