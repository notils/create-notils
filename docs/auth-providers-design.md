# Auth: one UI, many providers, many backends

The requirement, in the user's words: *"I don't want to have multiple flows for
the same thing."* One set of auth components that works whether the project uses
Better Auth, its own Rust backend, or an Express API — and works when the same
person uses different answers on different projects.

This document is the requirements and the decisions. Status per item lives in
[ROADMAP.md](ROADMAP.md).

## The scenarios this has to serve

These are real, from the author, and they are the acceptance criteria:

1. **Existing auth server, business logic in Next.js.** An auth API already
   exists (Rust). The app is Next.js with Drizzle. Auth is remote; everything
   else is local.
2. **Existing auth server, business logic in a separate service.** A POS backend
   is consumed by mobile, desktop, and web — so it cannot live in Next.js. Auth
   is the same remote server as (1).
3. **Better Auth for speed.** A hackathon project. No backend to write; Better
   Auth handles auth in-process with Next.js route handlers and a Drizzle/Prisma
   adapter.
4. **Someone else's stack entirely.** A team exposes auth endpoints from Express,
   Go, whatever. They configure the URLs and schemas and use our components.

**What varies:** where auth runs, and what talks to it.
**What must not vary:** the components, and the shape the app codes against.

## The split that makes this work

Two things are routinely conflated and must stay separate:

| | what it is | examples |
| --- | --- | --- |
| **Auth provider** | *how the app authenticates* | Better Auth, a custom REST backend, Clerk later |
| **Business-logic backend** | *where the app's own data lives* | Next.js + Drizzle, a Rust service, an Express API |

They are **independent axes**. Scenario 1 is remote-auth + local-logic;
scenario 3 is local-auth + local-logic; scenario 2 is remote-auth +
remote-logic. Any combination is legitimate, so nothing in the auth packages may
assume where business logic lives — and nothing in the data layer may assume how
auth works.

This is why `api-client` exists separately from `auth-custom`: transport is not
auth. A project can use `api-client` to talk to its POS service while Better Auth
handles login, and that has to be unremarkable.

## `AuthContract` is the seam

Everything the UI needs, and nothing about how it's implemented:

```ts
type AuthContract<TUser, TSignIn, TSignUp> = {
  useSession: () => AuthSession<TUser>;
  signIn: (input: TSignIn) => Promise<AuthResult>;
  signUp: (input: TSignUp) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<AuthResult>;
};
```

No HTTP, no endpoints, no Better Auth. A provider is anything that satisfies it.
`auth-ui` imports it **as a type only**, so the components have zero runtime
coupling to any provider.

### Decision: `AuthContract` lives in `@notils/auth-core`

It was originally in `auth-custom`, which meant `auth-ui` depended on the
**custom-backend provider** just to import a type. A Better Auth user would
install a package for talking to a REST API they don't have.

`auth-core` is types only — no runtime dependencies at all. The graph becomes:

```
                 auth-core  (types only)
                 ↑    ↑    ↑
          auth-ui  auth-custom  auth-better-auth
                        ↑
                   api-client        (transport — used by auth-custom,
                                      and independently for business APIs)
```

**Providers never depend on each other.** Install `auth-ui` plus exactly one
provider. That is the structural change that makes "one flow" true in the package
graph rather than only in principle.

## Where Better Auth UI fits — and where it doesn't

[better-auth-ui](https://better-auth-ui.com/docs/shadcn) is a separate library
built on Better Auth. It is genuinely good, and it is **not** a competitor to
`auth-ui`:

- **Tier 1** (sign-in, sign-up, forgot-password, session, route gating) — our
  `auth-ui` covers this for *every* provider. A Better Auth adapter satisfying
  `AuthContract` means the same `<SignInForm/>` works unchanged. This is the
  "one flow" requirement.
- **Tier 2** (2FA, passkeys, magic links, SSO, organizations, device sessions) —
  provider-specific by nature. A custom REST backend usually doesn't implement
  these, and when it does, not the same way. **We do not wrap or re-implement
  these.** A Better Auth user who wants them uses `better-auth-ui` directly,
  alongside our components.

That boundary is deliberate: `AuthContract` stays small enough that a hand-rolled
Rust backend can satisfy it. Pushing Tier 2 into the contract would make it
unimplementable for exactly the users `auth-custom` exists for.

**Known risk to verify, not assume:** `better-auth-ui`'s shadcn variant appears
to target Radix, while this stack is Base UI (composition via `render`, not
`asChild`). If a user mixes both libraries, they get two composition APIs in one
project. That's tolerable — but we should not claim they interoperate seamlessly
until it's tested.

## What a Better Auth provider must prove

Before `@notils/auth-better-auth` is worth building, spike these. Each is a real
possible mismatch, not a formality:

1. **`useSession` shape.** Better Auth's client hook returns its own
   `{ data, isPending, error }`. `AuthSession` is `{ status, user }`. Adaptable,
   but confirm the loading/refetch semantics survive translation.
2. **Server-side session.** Better Auth's strength is server components and route
   handlers. `AuthContract` is a client-side hook contract. Determine whether the
   provider needs a server-side surface too, or whether `ProtectedRoute`'s
   client gating is enough — this is the most likely place the contract proves
   too narrow.
3. **Errors.** `auth-custom` deliberately distinguishes a `ZodError` (schema
   mismatch — a bug, throws) from an `HttpError` (network/credential failure —
   returned as `AuthResult`). Better Auth's error surface must map onto that
   split without collapsing it.
4. **Sign-up field mismatch.** `AuthContract` is generic over the caller's Zod
   schemas. Better Auth has its own field expectations. Confirm the generics
   still infer without hand-written annotations at the call site.

If (2) forces a server-side addition to the contract, that is worth knowing
**before** writing the provider, because it changes `auth-core`.

## Non-goals

- **A universal auth abstraction.** `AuthContract` covers Tier 1 deliberately.
  Provider-specific power is reached by using that provider directly, not through
  a lowest-common-denominator wrapper.
- **Choosing a business-logic backend.** Orthogonal, by design (see the split
  above).
- **Re-implementing `better-auth-ui`.** Their Tier 2 components are theirs.
