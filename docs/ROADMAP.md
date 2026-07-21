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
- [ ] Tier 1 UI components in `@notils/ui` style: `<SignInForm/>`,
      `<SignUpForm/>`, `<ForgotPasswordForm/>`, session/sign-out affordance,
      protected-route wrapper — calling the `AuthContract` returned by
      `createAuthContract()` only, no provider-specific code.
- [ ] Wire `@notils/api-client` + `@notils/auth-custom` into `apps/app` for
      real (first real consumer — currently built, typechecked, but
      unconsumed by any app).
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
