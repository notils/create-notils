# @notils/auth-better-auth

[Better Auth](https://better-auth.com) as a provider for the shared auth UI, plus
Better Auth's own server-side session helpers.

Design and rationale:
[docs/auth-providers-design.md](../../docs/auth-providers-design.md).

## What this is for

Better Auth handles authentication in-process with your Next.js app — its own
routes, its own database adapter (Drizzle, Prisma, …), no separate auth server to
write. Ideal when you want robust auth fast, or want to use Next.js server-side
properly.

This package adapts it to `AuthContract`, so **the same `<SignInForm/>`,
`<SignUpForm/>`, `<ProtectedRoute/>` and `<SessionStatus/>` from
`@notils/auth-ui` work unchanged** — the identical components a project using its
own Rust or Express auth server renders through `@notils/auth-custom`. One UI,
either provider.

Install `auth-ui` plus **one** provider. Never both.

## Client: the contract

```ts
// lib/auth.ts
"use client";
import { createAuthClient } from "better-auth/react";
import { createBetterAuthContract } from "@notils/auth-better-auth";
import { z } from "zod";

const userSchema = z.object({ id: z.string(), email: z.string(), name: z.string() });

const client = createAuthClient({ baseURL: process.env.NEXT_PUBLIC_APP_URL });

export const auth = createBetterAuthContract({
  client,
  // Better Auth's user carries more fields than most apps want, and plugins
  // widen it further — so you narrow it to the shape you code against.
  mapUser: (user) => userSchema.parse(user),
  resetPasswordRedirectTo: "/reset-password",
});
```

Then the components, exactly as with any other provider:

```tsx
<SignInForm contract={auth} signInSchema={signInSchema} />
```

The client is **injected, not constructed here** — that is where you wire Better
Auth's plugins (two-factor, organization, passkey). Constructing it internally
would either drop those or force this package to proxy every plugin option.

## Server: outside the contract, on purpose

`AuthContract` is a client-side hook contract, so it has no server surface. But
server-side sessions are much of why you'd choose Better Auth, so those helpers
live here instead of being forced through the contract:

```ts
// app/dashboard/page.tsx
import { headers } from "next/headers";
import { getServerSession } from "@notils/auth-better-auth/server";
import { redirect } from "next/navigation";

const user = await getServerSession(auth, await headers(), (u) => userSchema.parse(u));
if (!user) redirect("/login");
```

`hasServerSession(auth, headers)` is the boolean form for guards.

Headers are passed in rather than read internally: `next/headers` is Next-specific
and importing it would make this package unusable in any other server runtime
Better Auth supports.

> **Middleware:** Better Auth recommends checking the session *cookie* in
> middleware rather than calling `getSession`, since middleware runs on every
> request and a DB round-trip each time is expensive. Use these helpers in route
> handlers and server components.

## What's deliberately not here

**Tier 2 flows** — 2FA, passkeys, magic links, SSO, organizations, device
sessions. They are reached through Better Auth's own client and plugins, or
through [better-auth-ui](https://better-auth-ui.com), which is built for exactly
that and is worth using alongside these components.

They are not squeezed into `AuthContract` because that contract also has to be
implementable by a hand-rolled Rust backend. Keeping it small is what makes one UI
serve every provider.

> Note if you mix in `better-auth-ui`: its shadcn variant appears to target Radix,
> while this stack is Base UI (composition via `render`, not `asChild`). Both can
> coexist, but you will have two composition APIs in one project.

## What's inside

```
src/
├── contract.ts  # createBetterAuthContract — the AuthContract adapter
├── server.ts    # getServerSession, hasServerSession — outside the contract
├── config.ts    # BetterAuthContractConfig, BetterAuthClient
└── index.ts     # public exports
```

## Error handling

Better Auth returns errors rather than throwing, and each one is a runtime
condition the UI should render — wrong password, email in use, rate limit — so
they all become `{ ok: false, error }`.

This differs from `@notils/auth-custom`, which throws on a `ZodError` (the
backend's response didn't match its declared schema — a bug) and returns on an
`HttpError` (a real runtime failure). That split exists there because the caller
*asserts* the response shape and can be wrong about it. Here Better Auth owns both
ends of the wire, so there is no schema to mismatch.
