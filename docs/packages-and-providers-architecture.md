# Package add-ons and pluggable providers (design / not yet built)

Status: **design only**. Builds on
[auth-and-api-client-design.md](auth-and-api-client-design.md) and answers the
open questions there. No `add` command or provider abstraction exists yet —
this is the contract to build against once auth work starts.

## The actual requirement

Auth is the first case, but the shape has to generalize, because the same
question will recur for database, payments, analytics, etc.:

> The user may already have a backend. Or they may not, and want one fast.
> `create-notils` must serve both without picking a side at the framework
> level.

Concretely, for auth alone there are at least two real users:

1. **New project / prototype, no backend yet** — wants Better Auth wired in
   fully: server routes, DB adapter, session, and Better Auth UI screens.
   Wants this to "just work" with minimal decisions.
2. **Existing stable backend that already does auth** (the common case for
   *this* author) — does **not** want Better Auth's server. Wants a ready-made
   client-side auth *consumer*: typed API calls, session storage, protected
   routes/hooks — pointed at their own endpoints.

Both are "auth," but they need different code generated. A single hardcoded
Better Auth integration only serves case 1. The CLI needs a **provider**
concept, where "auth" is a capability with swappable backends — Better Auth
today, custom-backend today, Clerk/Supabase/others later — and the same
applies eventually to other capabilities, not just auth.

## Two orthogonal decisions, not one

Don't conflate "which auth provider" with "how do I add it to my project."
They're separate axes:

- **Provider** — *what* implements the capability (Better Auth / custom
  backend / Clerk / Supabase / ...). Swappable, and the set grows over time.
- **Delivery mechanism** — *when/how* the code enters the project (chosen at
  `bunx create-notils` scaffold time, vs. added later via
  `bunx create-notils add <name>`). Same package, two entry points.

This mirrors the existing monorepo/standalone split in
[cli-monorepo-vs-standalone.md](cli-monorepo-vs-standalone.md): one
source of truth, projected two ways. Here: one provider implementation,
delivered two ways (inline at scaffold, or bolted on after).

## Architecture: capabilities, providers, and packages

```
capability            e.g. "auth"
  └── provider        e.g. "better-auth" | "custom-backend" | "clerk" (later)
        └── package    the actual template files + deps for that provider
```

- A **capability** is a named slot the app has (`auth`, later maybe `db`,
  `payments`, `analytics`). It defines a **contract**: the shape of code the
  rest of the app is allowed to depend on, regardless of provider.
- A **provider** is one implementation of a capability's contract. Providers
  are interchangeable from the app's point of view — swapping providers means
  swapping what's behind the contract, not rewriting call sites.
- Concretely, the auth capability's contract is close to what's already
  proven in [auth-and-api-client-design.md](auth-and-api-client-design.md):
  an `AuthProvider`-shaped interface (`getSession`/`getAccessToken`,
  `signIn`/`signOut`, `refresh`, `onAuthError`) that the platform-agnostic
  `@notils/api-client` consumes, plus whatever UI hooks/components the app
  renders against (`useSession`, `<SignInForm/>`, protected-route wrapper).

## UI and logic split: one agnostic contract for core flows only

Because the CLI **copies source into the user's repo** rather than installing
an npm package (same as `@notils/ui` today — see
[cli-monorepo-vs-standalone.md](cli-monorepo-vs-standalone.md)), the UI layer
and the provider's wiring are just separate files in the user's own codebase.
That makes "UI decoupled from provider" more than an abstraction goal here —
once scaffolded, the user can freely edit either side, or fork the contract
entirely, with no package boundary in the way. Better Auth UI, by contrast,
ships as an installed package wired directly to Better Auth's client — this
is the concrete way `create-notils` is not bound to it.

But "fully provider-agnostic UI" only holds where providers actually agree on
shape. Split the auth capability's UI into two tiers:

**Tier 1 — core flows, agnostic, generated once per capability (not per
provider).** Sign-in, sign-up, forgot-password, session display, sign-out,
protected-route wrapper. Every realistic provider — Better Auth or a custom
backend — implements *some* form of these, so one shared contract covers
both:

```ts
type AuthContract = {
  useSession: () => { user: User | null; status: "loading" | "authenticated" | "unauthenticated" };
  signIn: (input: { email: string; password: string }) => Promise<Result>;
  signUp: (input: { email: string; password: string; name?: string }) => Promise<Result>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<Result>;
};
```

The scaffolded `<SignInForm/>`, `<SignUpForm/>`, etc. are plain `@notils/ui`
components that call `useAuth()` (a hook returning `AuthContract`) — they
contain zero provider-specific code and are **identical output regardless of
which provider was chosen**. Only the `useAuth()` implementation differs:
the Better Auth provider's version wraps `createAuthClient()`; the
custom-backend provider's version wraps `@notils/api-client` calls against
the user's endpoints.

**Tier 2 — provider-specific extras, not agnostic, only scaffolded when that
provider is chosen.** 2FA challenge flows, passkey/WebAuthn ceremonies, SSO
redirects, magic-link request/consume, session/device management, org
invitations. These don't have a shared shape across providers — a custom
backend usually doesn't implement half of them, and forcing a
lowest-common-denominator contract here would either flatten Better Auth's
plugins down to plain email/password (defeating the reason to pick it) or
leak provider-specific fields into a contract that claims to be generic.
These render as additional components alongside Tier 1, present only in the
Better Auth provider's package, written directly against Better Auth UI's
hooks/primitives (re-ported onto `@notils/ui`/Base UI per the open Radix
question below) rather than through `AuthContract`.

This tiering is a scope decision, not a technical limitation to revisit
later by default — only fold a Tier 2 flow into `AuthContract` if a second
provider is actually added that implements it the same way.

### Auth capability, two providers, concretely

| | Better Auth provider | Custom-backend provider |
|---|---|---|
| Server | scaffolds Better Auth server routes + DB adapter | none — assumes user's backend already has auth endpoints |
| Session model | cookie session (web) via Better Auth's own client | whatever the user's backend does; CLI asks (bearer token vs cookie) and generates the matching `AuthProvider` |
| UI (Tier 1: core flows) | same `AuthContract`-driven `<SignInForm/>`/`<SignUpForm/>`/etc. as the custom-backend provider — identical component output, only `useAuth()` differs | same generated components, `useAuth()` wraps `@notils/api-client` against the user's endpoint shapes (prompted for at add-time: login path, token field names, refresh endpoint, etc.) |
| UI (Tier 2: 2FA/passkey/SSO/orgs/...) | provider-specific components, written directly against Better Auth's plugin hooks and re-ported onto `@notils/ui`'s Base UI primitives — **verify Better Auth UI's shadcn variant's Radix assumption against Base UI hands-on before shipping**, per the earlier open question | not scaffolded — a custom backend is not assumed to implement these; if the user's backend does, that's hand-written after scaffold, not generated |
| `AuthProvider` impl | thin — mostly delegates to Better Auth's client | the real implementation — this is where the RN `http.ts` pattern (single-flight refresh, manual token storage) is most needed |
| Backend requirement | none (Better Auth provides it) | user already has one |

This is exactly why "should we use Better Auth" isn't a yes/no for the
project — it's a per-scaffold choice the CLI prompts for, same as
"monorepo or standalone" today.

## Delivery mechanism: scaffold-time vs. `add`

Both entry points install the *same* provider package — the difference is
only when and how much prompting happens.

**At scaffold time** (`bunx create-notils`): after the existing
project-type/package-manager prompts, add capability prompts:

```
Add authentication?        (No / Better Auth / Custom backend)
  └─ if Custom backend:    Session model? (Bearer token / Cookie)
                            Base URL? (can be filled in later)
```

**After the fact** (`bunx create-notils add <name>`), inside an existing
`create-notils` project:

```
bunx create-notils add auth              # prompts provider, same as above
bunx create-notils add auth:better-auth  # skip the provider prompt
bunx create-notils add auth:custom       # skip straight to custom-backend prompts
```

`add` must detect project shape (monorepo vs. standalone, from the same
markers the flatten transform already relies on — presence of
`turbo.json`/`packages/`) and write to the right location automatically:
`packages/*` + app in monorepo, `src/*` in standalone. This reuses the
existing boundary-map discipline — adding a provider is not exempt from row
1-13 of the boundary map; if it introduces a new package, it must add rows to
that map, not invent an unmapped import shape.

## Package layout implied by this

```
packages/
  create-notils/           # the CLI itself
  ui/                       # existing, unrelated to this
  config/                   # existing, unrelated to this
  api-client/               # NEW — platform-agnostic transport core (see below)
  auth-better-auth/         # NEW — Better Auth provider template + prompts
  auth-custom/              # NEW — custom-backend provider template + prompts
```

The CLI's `add` command is really: fetch the named provider's template
fragment (same `tiged`-then-transform machinery already used for the main
template, scoped to a subdirectory), run its prompts, splice its files into
the target project, merge its `package.json` deps, and rewrite imports
through the same specifier-aware rewrite the flatten transform already does.
No new file-writing mechanism — reuse of the existing transform pipeline for
a smaller, targeted patch instead of a full scaffold.

## `@notils/api-client`: platform-agnostic, not just web+RN

Revising the earlier open question: don't scope the core to "web and RN" —
scope it to **any JS/TS runtime with `fetch`**. Concretely this constrains
implementation, not just naming:

- Depend on the `fetch`/`Headers`/`URL`/`AbortController` globals only — all
  present in browsers, RN, Node 18+, Deno, Bun, and Cloudflare Workers/edge
  runtimes. No `window`, no `document`, no Node-only APIs (`http`, `fs`) in
  the core.
- Token/session **storage** is never the core's job — it was already
  factored out to `AuthProvider` in the RN client, which is exactly right.
  Keep it that way; each environment's `AuthProvider` picks its own storage
  (SecureStore on RN, cookies via browser default on web, `localStorage` or
  in-memory for a browser extension, environment variables for a server-side
  caller).
- This means the *same* `@notils/api-client` core targets web, RN, browser
  extensions, and future "other JS framework" targets mentioned as a goal —
  the only thing that changes per target is which `AuthProvider` is plugged
  in, never the transport core.

## Non-negotiables carried over from the existing architecture docs

- **Golden build test extends, not duplicates**: CI already scaffolds
  monorepo + standalone and checks both build. Extend the matrix — for each
  shape, also scaffold with each auth provider (Better Auth, custom-backend)
  and confirm build/typecheck, plus the existing
  "no surviving `@notils/` specifier" grep for standalone.
- **Boundary map discipline applies to every new package**: `api-client`,
  `auth-better-auth`, `auth-custom` each need boundary-map rows the moment
  they're implemented, same as `ui`/`config` have today. A provider must
  cross into app code only through the capability's contract type — never a
  provider-specific shape leaking into app call sites, or swapping providers
  later stops being mechanical.
- **One provider active at a time per capability**, at least for v1 — no
  runtime multi-provider auth. If that's ever needed it's a distinct, later
  design problem, not a default to build in now.

## Open items to settle when this is actually built

- Confirm hands-on whether Better Auth UI's shadcn components assume Radix
  in a way that conflicts with `@notils/ui`'s Base UI primitives, per
  [auth-and-api-client-design.md](auth-and-api-client-design.md). If they
  conflict, the Better Auth provider ships hand-ported components against
  Base UI rather than Better Auth UI's package directly.
- Exact prompt set for the custom-backend provider (what shape of
  login/refresh/logout endpoints to assume by default, how much is
  configurable vs. requires the user to edit generated code after).
- Whether `add` needs a lockfile/manifest (similar to `skills-lock.json`,
  which already exists in this repo for skills) to track which providers are
  installed, so `add` can detect "auth is already installed with provider X"
  and refuse or offer to swap instead of double-installing.
