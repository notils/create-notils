# Roadmap

Working list of what's built, what's next, and in what order. This is the
concrete/checkbox counterpart to the [README's phased roadmap](../README.md#roadmap)
— that one communicates direction to users; this one tracks execution.

Update this file as items complete or scope changes — it's meant to answer
"what's next" at a glance, not to be reconstructed from git log each time.

## Now: Auth (custom-backend provider first)

Rationale: this is the author's actual day-to-day need (existing stable
backend, no reason to stand up Better Auth's server), it validates the
`AuthContract`/Tier-1-UI design before the harder Better Auth/Base UI
integration, and it has zero external unknowns to de-risk.

- [x] `@notils/api-client` transport core — `createHttpClient`, `HttpError`,
      `AuthProvider` contract type, `anonymousAuthProvider`. Ported from
      `rn-monorepo`'s `http.ts`. ([docs/auth-and-api-client-design.md](auth-and-api-client-design.md))
- [x] Define `AuthContract<TUser, TSignIn, TSignUp>` (Tier 1: `useSession`,
      `signIn`, `signUp`, `signOut`, `requestPasswordReset`) as a concrete,
      **generic** TS type, parameterized by whatever the caller's own Zod
      schemas resolve to — no hand-declared `AuthUser` shape to drift out of
      sync with what a backend actually returns —
      [`packages/auth-custom/src/contract.ts`](../packages/auth-custom/src/contract.ts).
- [x] `packages/auth-custom` — custom-backend provider:
  - [x] `createAuthContract()` implementing `AuthContract` on top of
        `@notils/api-client` ([`use-auth.ts`](../packages/auth-custom/src/use-auth.ts))
  - [x] `createCustomBackendAuthProvider()` — token storage + refresh
        ([`provider.ts`](../packages/auth-custom/src/provider.ts)), using the
        RN client's single-flight-refresh pattern via `AuthProvider.refresh()`
  - [x] Config is **fully explicit, no assumed defaults, Zod-schema-validated**
        — every endpoint path and a Zod schema per response
        (`loginResponseSchema`/`registerResponseSchema`/`refreshResponseSchema`/
        `sessionResponseSchema`) and per input (`signInInputSchema`/
        `signUpInputSchema`) is supplied by the caller via
        `CustomBackendAuthConfig<TUser, TSignIn, TSignUp>`
        ([`config.ts`](../packages/auth-custom/src/config.ts)). A response
        that doesn't match its schema throws a `ZodError` at the call site
        (a bug to fix, not a runtime condition to swallow); an `HttpError`
        (network/API failure, e.g. wrong password) is caught and turned into
        `AuthResult` per the contract's return type — the two failure classes
        are handled deliberately differently, not both swallowed or both
        thrown. Verified end-to-end: a throwaway config + `createAuthContract`
        call typechecks with full inference and no manual type annotations
        at the call site.
  - [ ] Add-time `add` command prompts to fill in `CustomBackendAuthConfig`
        interactively (blocked on the `add` command itself, next section)
- [x] **`@notils/form-builder`** — a recursive Zod-schema-to-form renderer,
      built from scratch after research found no existing library targets
      Base UI (every shadcn-ecosystem form generator found —`@rjsf/shadcn`,
      AutoForm, `@json-render/shadcn` — is Radix-coupled or young/beta; see
      [packages-and-providers-architecture.md](packages-and-providers-architecture.md)
      for the research summary). `walkSchema` (schema → `FieldDescriptor`
      tree: object/array/discriminated-union/enum/primitives, fully
      recursive) is primitive-agnostic; `field-renderer.tsx` (the
      swappable half) renders via `@notils/ui`'s Base UI components.
      `<SchemaForm/>` wires `react-hook-form` + `zodResolver` + the renderer
      together. Verified end-to-end via a real Next.js production build.
  - [x] **`uiHints`** — per-field conditional visibility (`showWhen`), style
        overrides (`className`), and full custom render, keyed by field
        path. Added while replicating a real hand-built contact form
        (`apps/app/src/app/contact-form-replica.tsx`) that hides
        email/country/message until an enquiry type is picked. Cross-field
        *validation* (as opposed to visibility) needed no form-builder
        change — a Zod `.superRefine()` writing `ctx.addIssue({path})`
        already resolves to the right field's error via `zodResolver`.
  - [x] **`layout`** — groups top-level fields into rows (e.g.
        `[["firstName","lastName"], ["email"]]`) for multi-column forms,
        without forking rendering code per form. Deliberately chosen over a
        codegen approach (schema → generated `.tsx` file): codegen gives
        arbitrary layout freedom but forks on generation — a bug fix in the
        generator never reaches an already-generated file. `layout` +
        `uiHints` stays inside form-builder's single fixable/reusable core;
        revisit codegen only if a real form needs something this genuinely
        can't express.
  - [x] Base UI `Select` bugs found and fixed while building the contact-form
        replica: (1) controlled/uncontrolled warning from defaulting an
        unset field's `value` to `undefined` instead of `""`; (2)
        `alignItemWithTrigger` (Base UI's default select-popup behavior,
        which overlaps the popup with the trigger to align the *selected*
        item) reserving wrong/excess vertical space before a real selection
        exists — fixed by passing `alignItemWithTrigger={false}`.
- [x] Tier 1 UI components — **`@notils/auth-ui`**: `<SignInForm/>`,
      `<SignUpForm/>`, `<ForgotPasswordForm/>`, `<SessionStatus/>` (session +
      sign-out), `<ProtectedRoute/>` (framework-agnostic gating; redirect is
      the caller's job via `onUnauthenticated`) — all driven only by
      `AuthContract`, built on `@notils/form-builder`'s `<SchemaForm/>`, no
      provider-specific code. Verified end-to-end (all five components)
      against a fake `AuthContract` via a real Next.js production build.
- [ ] Wire `@notils/api-client` + `@notils/auth-custom` + `@notils/auth-ui`
      into `apps/app` for real (first real consumer — currently built,
      typechecked, and build-verified via throwaway smoke tests, but not
      yet part of the actual scaffolded template).
- [ ] Extend the golden build test: scaffold with auth added, confirm
      build/typecheck, confirm no unmapped `@notils/` specifiers survive
      standalone flatten (same discipline as existing boundary map).

## Next: `bunx create-notils add` command

Rationale: needed before a second provider (Better Auth) is worth adding —
without `add`, every provider has to be baked into the initial scaffold
prompts, which doesn't scale and doesn't serve "add auth to a project I
already scaffolded."

- [ ] `add` command skeleton: detect project shape (monorepo vs standalone,
      via existing `turbo.json`/`packages/` markers), fetch a provider's
      template fragment via the same `tiged`-then-transform pipeline already
      used for the main scaffold, scoped to a subdirectory.
- [ ] Splice provider files into the right location per shape, merge
      `package.json` deps, run the specifier-aware import rewrite.
- [ ] `add auth` prompts for provider (`better-auth` | `custom`), or
      `add auth:custom` / `add auth:better-auth` to skip the prompt.
- [ ] Decide + build (or defer) a providers-lock manifest (alongside the
      existing `skills-lock.json` pattern) so `add` can detect "auth already
      installed with provider X."

## Then: Better Auth provider

Rationale: the novel integration risk (Better Auth UI likely assumes Radix;
`@notils/ui` is Base UI) is real and worth confirming hands-on before
committing the CLI to it — sequenced after `add` exists so this doesn't have
to also invent the delivery mechanism.

- [ ] Spike: does Better Auth UI's shadcn variant work against Base UI
      primitives, or does it require re-porting components onto
      `@notils/ui`? Resolves the open question in
      [packages-and-providers-architecture.md](packages-and-providers-architecture.md).
- [ ] `packages/auth-better-auth` — provider:
  - [ ] Server routes + DB adapter scaffold
  - [ ] `useAuth()` implementing the same `AuthContract` (Tier 1), wrapping
        `createAuthClient()`
  - [ ] Tier 2 components (2FA, passkey, magic link, SSO, sessions/devices)
        as provider-specific, not forced through `AuthContract`
- [ ] Scaffold-time prompt: `Add authentication? (No / Better Auth / Custom backend)`
- [ ] Golden build test extended to cover this provider too.

## Later (Phase 3/4 territory — not sequenced in detail yet)

These follow the same capability/provider pattern once auth proves it out.
Order within this group is not decided:

- [ ] Database + ORM (PostgreSQL + Drizzle, per README's current "planned" stack)
- [ ] Docker + CI/CD scaffolding
- [ ] Email capability (provider-pluggable, same pattern as auth)
- [ ] Storage capability
- [ ] `create-rnstack` merge — react-native app target, `@notils/api-client`
      proves out as genuinely platform-agnostic (not just web) once an RN
      `AuthProvider` is built against it
- [ ] Community templates (SaaS/AI/dashboard/API presets)

## Explicitly not planned

Recorded so it isn't re-litigated:

- **No multi-provider-at-once for a single capability.** One auth provider
  active per project. Runtime provider-switching is a distinct, later
  design problem if ever needed.
- **No standalone npm publish for `@notils/api-client` or provider
  packages.** They're copied source into user repos, same as `@notils/ui`/
  `@notils/config` — never an installed dependency. Only `create-notils`
  itself is a published package.
