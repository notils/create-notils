# @notils/api-client

Platform-neutral HTTP transport core, shared across every JS/TS runtime `create-notils` targets — web today; React Native and others later. See [docs/auth-and-api-client-design.md](../../docs/auth-and-api-client-design.md) for the full design rationale.

Depends only on `fetch`/`Headers`/`URL`/`AbortController` — no `window`, no `document`, no Node-only APIs. The same core runs unchanged in a browser, React Native, Node 18+, Bun, or an edge runtime.

## What's inside

```
src/
├── http.ts        # createHttpClient, HttpError, HttpClient/HttpClientConfig types
├── auth/types.ts  # the AuthProvider seam — token retrieval/refresh, auth-agnostic
└── index.ts        # public exports
```

The client never owns auth. It asks an injected `AuthProvider` for a token before each request and, on a 401, asks it to refresh — refreshes are single-flight, so a burst of concurrent 401s triggers exactly one refresh call, not one per request.

## Usage

```ts
import { createHttpClient } from "@notils/api-client/http";
import { anonymousAuthProvider } from "@notils/api-client/auth/types";

const api = createHttpClient({
  baseUrl: "https://api.example.com",
  auth: anonymousAuthProvider, // or your own AuthProvider
});

const user = await api.get<User>("/users/me");
await api.post("/users", { name: "Ada" });
```

## Providers

This package ships **no real `AuthProvider`** beyond the anonymous no-op — providers are platform- and backend-specific and live in their own packages:

- [`@notils/auth-custom`](../auth-custom) — a user-supplied backend (bearer tokens, configurable endpoints)
- A Better Auth provider and an RN-targeting provider are not yet built (see [docs/ROADMAP.md](../../docs/ROADMAP.md))

## Status

Transport core only, no consumer wired in yet — not imported by `apps/app`. It becomes part of the scaffolded template once a provider needs it for real.

## Verify

```bash
bun run typecheck   # from this package, or from the repo root for the whole workspace
```
