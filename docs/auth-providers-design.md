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

## Spike results — Better Auth against the contract

Spiked against `better-auth@1.6.26` by writing a real adapter and letting `tsc`
judge it, rather than reading types and predicting. **It typechecks clean against
the unmodified contract** — so `auth-core` needs no changes for Tier 1.

| Risk | Result |
| --- | --- |
| **`useSession` shape** | ✅ `{ data, isPending, isRefetching, error, refetch }` → `{ status, user }` is a mechanical map. `isPending` → `loading`; `data.user` present → `authenticated`. |
| **Errors** | ✅ `BetterFetchError extends Error`, so `error.message` → `AuthResult`. The throw-vs-return split (below) survives. |
| **Generics** | ✅ Inferred with no hand annotations. Better Auth's user carries extra fields; narrowing to the caller's declared shape works. |
| **Server-side session** | ⚠️ A real gap — see below. |

### The server-side gap, and the decision

`better-auth/api` exposes `getSession`, `getSessionFromCtx`, `createAuthEndpoint`,
`createAuthMiddleware`, and `APIError` — a substantial server-side surface with
**no counterpart in `AuthContract`**, which is a client-side hook contract by
construction.

This matters: Better Auth's main draw is server components and route handlers —
checking a session *before* rendering. A user going through `auth-ui` alone gets
client-side gating via `ProtectedRoute` and loses the thing they chose Better Auth
for.

**Decision: keep the contract client-only; export server helpers separately.**

```
@notils/auth-better-auth exports:
  createBetterAuthContract()   ← satisfies AuthContract (Tier 1, works with auth-ui)
  getServerSession()           ← Better Auth only, outside the contract
  createAuthHandler()          ← Better Auth only, outside the contract
```

Rejected: adding an optional `getServerSession?` to `AuthContract`. It would put a
field on every provider that a hand-rolled Rust or Express backend cannot
meaningfully implement, and `auth-ui` can't depend on something optional anyway —
so it would add surface without buying uniformity.

This mirrors the Tier 1 / Tier 2 boundary exactly: the contract carries what every
provider can implement, and provider-specific power is reached by using that
provider directly.

## Non-goals

- **A universal auth abstraction.** `AuthContract` covers Tier 1 deliberately.
  Provider-specific power is reached by using that provider directly, not through
  a lowest-common-denominator wrapper.
- **Choosing a business-logic backend.** Orthogonal, by design (see the split
  above).
- **Re-implementing `better-auth-ui`.** Their Tier 2 components are theirs.
