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
  - [ ] Add-time `add` command fills in `CustomBackendAuthConfig` (blocked on
        the `add` command itself, next section). Open question in
        [add-command-design.md](add-command-design.md): interactive prompts vs.
        a heavily-commented stub file. Leaning stub — a 12-question prompt to
        scaffold one file is worse than clear TODOs.
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
- [x] Wire `@notils/api-client` + `@notils/auth-custom` + `@notils/auth-ui`
      into `apps/app` for real — no longer just smoke tests:
  - [x] `apps/app/src/lib/mock-auth-store.ts` + `app/api/auth/*` — an
        in-memory mock backend (login/register/refresh/logout/session/
        reset-password), standing in for a real backend so the template
        demonstrates a genuine HTTP round-trip through `@notils/api-client`
        instead of a fake in-JS `AuthContract`. Explicitly documented as a
        stand-in a real project deletes and replaces with its own backend.
  - [x] `apps/app/src/lib/auth.ts` — the real `CustomBackendAuthConfig` +
        wired `AuthContract` (`localStorage`-backed token storage; a
        cookie/SecureStore-backed version is a different platform's
        concern, not this file's).
  - [x] Real routes: `/login`, `/signup`, `/forgot-password` (using
        `@notils/auth-ui`'s components against the real config above), and
        `/dashboard` — gated by `<ProtectedRoute>` with a real
        `next/navigation` `router.replace("/login")` redirect on
        `onUnauthenticated`, plus `<SessionStatus>` for sign-out.
  - [x] Verified via a real `next build` (not just typecheck): all 6 API
        routes registered dynamic, all 4 pages + `/dashboard` registered
        static, zero errors.
- [ ] Extend the golden build test: scaffold with auth added, confirm
      build/typecheck, confirm no unmapped `@notils/` specifiers survive
      standalone flatten (same discipline as existing boundary map). Not
      yet done — the manual `next build` above proves the wiring works in
      this repo, but CI doesn't yet check it automatically on every change.

## Next: the `add` command — `bunx @notils/cli add <name>`

**Design is settled: [add-command-design.md](add-command-design.md).** Read it
before starting; the decisions below are already made, not open.

**Status: BUILT** — `add`, `init`, and `list` all work, and every item in this
section is checked off. What remains is release work (`@notils/cli` has never
been published) and the two auth-specific follow-ups in the section above.

Rationale: needed before a second provider (Better Auth) is worth adding —
without `add`, every provider has to be baked into the initial scaffold
prompts, which doesn't scale and doesn't serve "add auth to a project I
already have." The **brownfield** case (someone else's existing Next.js repo,
never scaffolded by us) is the primary target and the harder constraint — it's
what makes this a product rather than a scaffolder feature.

Settled decisions: a **separate published `@notils/cli`** package run via
`bunx`, never installed into the target; a `notils.json` config (the
`components.json` equivalent) that `add` writes at scaffold time and `init`
writes for brownfield; **reuse the flatten transform** for standalone targets
rather than a prebuilt registry.

- [x] **Extracted the shared transform** into `packages/transform` (private,
      bundled into each CLI via tsup `noExternal`). `INTERNAL_PACKAGES` there is
      now the single place packages are enumerated — `LIBRARY_PACKAGE_NAMES` and
      the scaffold's fold step derive from it. Verified behavior-preserving:
      flattening a tree copy with the extracted code produces a byte-identical
      `src/` to pre-extraction.
- [x] `packages/cli` (`@notils/cli`), bin `notils`.
- [x] `notils.json` — schema + `writeProjectConfig`, written by `create-notils`
      at scaffold time from values it already knows.
- [x] `init` — detects shape/scope/paths, shows its reasoning line by line, lets
      the user correct every value (`--yes` accepts). **Scope is read from an
      actual workspace package, not the root name** — this repo is named
      `create-notils` but scopes its packages `@notils/*`, so root-name
      inference is wrong. 9 fixtures in
      `packages/transform/scripts/check-detection.ts`.
- [x] `add <name>` core — fetches `packages/<name>` from the pinned tag via
      tiged's subdirectory support, then writes to `packages/<name>/` with the
      scope renamed (monorepo) or folds into `src/lib/<name>/` with `@/*`
      specifiers (standalone).
- [x] **Transitive dep resolution** — `add auth-ui` writes five packages,
      dependency-first, reported before writing.
- [x] **Don't clobber modified files** — every file is compared against the
      pristine upstream source; `modified` files are reported and skipped unless
      `--force`. Verified: a local edit survives a re-run, and `--force`
      replaces it.
- [x] External deps — **reports** the install command rather than writing
      versions. Monorepo manifests are *generated* (name/exports/type kept,
      internal deps as `workspace:*` under the project's scope, peer ranges
      kept as genuine compatibility statements) so no pinned range from our
      monorepo leaks into a user's project.
- [x] Post-write formatting via the project's own `lint:fix`/`format` script
      (`--skip-format` opts out); silent when the project has neither.
- [x] **Brownfield compatibility checks** — Tailwind missing/v3, absent theme
      tokens, an existing Radix install, React < 19. Warnings with remedies, run
      before the confirmation *and* before the dry-run exit. Verified to fire on
      a hostile fixture and stay silent on a compatible one.
- [x] `list` — available/installed with real target paths.
- [x] **Versioning decided: the CLI's version IS the template ref.**
      `@notils/cli@X.Y.Z` fetches tag `vX.Y.Z`, so each published version is
      reproducible while `bunx` still resolves the newest CLI by default.
      **Release requirement:** publishing `@notils/cli@X.Y.Z` needs a pushed
      `vX.Y.Z` tag or every `add` from that version fails at fetch — documented
      in [testing-locally.md](testing-locally.md), and the fetch error names the
      missing ref instead of surfacing tiged's opaque message.
- [x] **`add ui` theme-token injection** — offers to append the token layer when
      the project has no `--primary`, extracted from the fetched `ui` package's
      own globals.css (one source of truth) minus its `@import`/`@source` lines
      (duplicating those breaks the build or rescans the wrong tree). Always a
      prompt; `--yes` deliberately does NOT cover it, `--with-theme` is the
      explicit opt-in for scripted use. Verified on four fixtures: no tokens
      (offers, appends correctly, preserves the user's own rules), tokens already
      present (no offer even with `--with-theme`), no stylesheet at all (warns),
      and a re-run (no duplicate block).
- [x] **Version-drift reporting in `list`.** `notils.json` grew an optional
      `installed: { <name>: { ref } }` map that `add` writes; `list` compares it
      against the CLI's current ref and shows `outdated  v0.2.0 → v0.3.0`.
      Two decisions worth keeping: a package is recorded only when **every** file
      matched upstream (a partially-skipped write leaves it unrecorded rather
      than claiming a version it isn't wholly at), and an absent record means
      *unknown*, never *not installed* — scaffolded projects have the packages on
      disk with no record, and must not be reported as missing. Covered by
      `check:detection` (record merge, non-clobber, empty list, no-config).

## Better Auth provider — BUILT

Full design and spike results:
[auth-providers-design.md](auth-providers-design.md).

- [x] **`@notils/auth-core`** — the contract extracted into its own types-only
      package. It previously lived in `auth-custom`, so `auth-ui` depended on the
      *custom-backend provider* to import a type; a Better Auth user would have
      installed a REST-backend package they don't have. Providers now depend on
      the contract, never on each other.
- [x] **Spike before building.** Wrote a real adapter against the unmodified
      contract and let `tsc` judge it: `useSession`, error mapping, and the
      generics all fit with no changes to `auth-core`. The one genuine gap was
      server-side sessions (`better-auth/api` has a server surface a client-side
      hook contract can't express).
- [x] **`packages/auth-better-auth`**:
  - [x] `createBetterAuthContract()` — Tier 1, satisfying `AuthContract`, so the
        existing `auth-ui` components render against Better Auth unchanged.
        Verified by wiring the real client through the real components.
  - [x] `getServerSession()` / `hasServerSession()` — **outside** the contract.
        Rejected adding an optional `getServerSession?` to `AuthContract`: it
        would put a field on every provider that a hand-rolled Rust or Express
        backend can't meaningfully implement.
  - [x] Tier 2 (2FA, passkey, magic link, SSO, organizations) deliberately NOT
        wrapped — reached via Better Auth's own plugins or
        [better-auth-ui](https://better-auth-ui.com).
- [x] Registered in the package graph with no new logic needed: the
      `defaultProvider` check is structural, so `add auth-ui auth-better-auth`
      installs that provider alone while a bare `add auth-ui` still defaults to
      `auth-custom`.

Remaining:

- [ ] **A runnable example in the template.** `apps/app` wires `auth-custom`
      against mock routes; there is no equivalent Better Auth wiring (route
      handler via `toNextJsHandler`, a Drizzle adapter, `.env` keys). Until then
      the provider is verified by types, not by a booting app.
- [ ] **Scaffold-time prompt**: `Add authentication? (No / Better Auth / Custom
      backend)`. Needs the above first — there's nothing to scaffold yet.
- [ ] **Golden build test** extended to cover a Better Auth scaffold.
- [ ] Confirm hands-on whether `better-auth-ui`'s shadcn variant targets Radix
      (it appears to) and what that means in practice for a project mixing it with
      our Base UI components. Currently documented as a caveat, not a finding.

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
