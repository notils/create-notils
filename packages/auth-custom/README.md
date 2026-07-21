# @notils/auth-custom

The **custom-backend auth provider** — for a project that already has its own backend handling auth and just needs a typed, schema-validated client. No server is scaffolded here; this package only talks to endpoints you already have. See [docs/packages-and-providers-architecture.md](../../docs/packages-and-providers-architecture.md) for how this fits alongside the (not yet built) Better Auth provider.

Built on [`@notils/api-client`](../api-client) for transport and [Zod](https://zod.dev/) for response/input validation.

## What's inside

```
src/
├── contract.ts   # AuthContract<TUser, TSignIn, TSignUp> — the Tier 1 shape UI components call
├── config.ts     # CustomBackendAuthConfig — endpoint paths + Zod schemas you define, no defaults
├── provider.ts   # createCustomBackendAuthProvider — the AuthProvider api-client's client consumes
├── use-auth.ts   # createAuthContract — implements AuthContract against your config
└── index.ts      # public exports
```

## Why fully explicit, no assumed defaults

There is no `/auth/login` or `{ accessToken, user }` guess baked in anywhere. Every endpoint path and every response/input shape is a config field you fill in — because there's no default that's actually safe to guess across arbitrary backends, and a wrong guess would fail silently in a worse way than asking you to be explicit upfront.

Every response is validated against a Zod schema you provide, not a hand-rolled type assertion:

- A **`ZodError`** (the response didn't match your schema) throws — it's a bug to fix, not a runtime condition to swallow, so it fails loudly at the exact mismatched field.
- An **`HttpError`** (network/API failure — wrong password, 500, etc.) is caught and returned as `{ ok: false, error }`, per `AuthContract`'s own return type — an expected runtime outcome, not a bug.

`TUser`, `TSignIn`, `TSignUp` are inferred from your schemas — there's no hand-declared `AuthUser` type that can drift out of sync with what your backend actually returns.

## Usage

```ts
import { z } from "zod";
import { createHttpClient } from "@notils/api-client/http";
import { createCustomBackendAuthProvider } from "@notils/auth-custom/provider";
import { createAuthContract } from "@notils/auth-custom/use-auth";
import type { CustomBackendAuthConfig } from "@notils/auth-custom/config";

const userSchema = z.object({ id: z.string(), email: z.string() });
const tokenEnvelope = z.object({
  accessToken: z.string(),
  refreshToken: z.string().optional(),
  user: userSchema,
});
const signInSchema = z.object({ email: z.string(), password: z.string() });
const signUpSchema = z.object({ email: z.string(), password: z.string(), name: z.string() });

const config: CustomBackendAuthConfig<
  z.infer<typeof userSchema>,
  z.infer<typeof signInSchema>,
  z.infer<typeof signUpSchema>
> = {
  loginPath: "/auth/login",
  registerPath: "/auth/register",
  refreshPath: "/auth/refresh",
  sessionPath: "/auth/session",
  loginResponseSchema: tokenEnvelope,
  registerResponseSchema: tokenEnvelope,
  refreshResponseSchema: tokenEnvelope,
  sessionResponseSchema: userSchema,
  signInInputSchema: signInSchema,
  signUpInputSchema: signUpSchema,
  storage: {
    /* getAccessToken / getRefreshToken / setTokens / clearTokens —
       SecureStore on RN, cookies/localStorage on web, etc. */
  },
};

const anonymousHttp = createHttpClient({ baseUrl: "https://api.example.com" });
const authProvider = createCustomBackendAuthProvider(config, anonymousHttp);
const authedHttp = createHttpClient({ baseUrl: "https://api.example.com", auth: authProvider });

const auth = createAuthContract(config, anonymousHttp, authedHttp);
// auth.useSession(), auth.signIn(), auth.signUp(), auth.signOut(), auth.requestPasswordReset()
```

## Status

Provider logic is built and typechecked; not yet wired into `apps/app`, and there are no UI components (`<SignInForm/>` etc.) yet — those are next (see [docs/ROADMAP.md](../../docs/ROADMAP.md)). The `bunx create-notils add` command that will prompt for `CustomBackendAuthConfig` interactively doesn't exist yet either — for now, this config is written by hand.

## Verify

```bash
bun run typecheck   # from this package, or from the repo root for the whole workspace
```
