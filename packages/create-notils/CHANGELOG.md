# Changelog

All notable changes to `create-notils` are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses
[Semantic Versioning](https://semver.org/).

## 0.6.2

### Fixed

- **`.env` files are now reliably gitignored.** The template enumerated the files
  to ignore (`.env`, `.env.local`, `.env.development.local`, …), so anything the
  list didn't anticipate shipped **unignored** — `.env.staging.local` was exactly
  that gap. Replaced with a blanket rule that cannot have one:

  ```gitignore
  .env
  .env.*
  !.env.example
  ```

- **`.env.example` was itself gitignored in a standalone project.** Next.js's
  default app `.gitignore` uses a bare `.env*`, which swallows the example file
  too — and in a standalone scaffold that file becomes the project root's
  `.gitignore`. So the one env file that *should* be tracked silently wasn't.

### Changed

- **`.env.example` is now the only committed env file.** Previously the
  per-environment files (`.env.development`, `.env.staging`, `.env.production`)
  were generated as committed non-secret defaults; they are now local-only, like
  every other `.env*` file. `.env.example` remains the committed reference list of
  every variable the project reads, and deployments set their values through the
  host's environment or secret store rather than a file in the repo.

  This is the safer default: no `.env*` file can be committed by accident, and
  there is no per-file judgement call about whether a given value counts as secret.

## 0.6.1

### Fixed

- **Package READMEs no longer ship with dead documentation links.** Every
  `packages/*/README.md` linked into `../../docs/`, but that directory is stripped
  from every scaffold — so those links 404'd in every project generated so far.
  They now point at the published docs on GitHub.

  Each README also gains a short note saying the package is your code, where it
  lives, and where it came from. The rewriter is shared with `@notils/cli`, so a
  package that arrives via the scaffold and one added later look the same.

## 0.6.0

### Added

- **Choose what goes into your project.** The scaffold used to copy everything the
  template supports; now it asks, and generates only what you selected.

  ```text
  ? Authentication
  ❯ None
    Custom authentication
    Better Auth

  ? Select the packages you want to include
  ◉ UI
  ◉ API Client
  ◯ Form Builder
  ```

  Flags for CI: `--auth none|custom|better-auth`,
  `--packages ui,api-client,form-builder` (or `none`).

  **Authentication is one choice, never several.** `auth-custom` and
  `auth-better-auth` answer the same question, so picking one means the other is
  never written — no competing implementations to reconcile later, and none of the
  dependencies for the one you didn't pick.

  Unselected packages are removed *with* every reference to them: workspace
  dependencies, app imports, and the pages that used them. When something you
  selected requires something you didn't (the auth forms are built on the form
  renderer), the CLI adds it and says why rather than silently ignoring you.

- **Fresh app by default; demo app on request** (`--demo` / `--no-demo`). A new
  project is a clean starting point — a minimal branded landing page and your
  production configuration, nothing else. No example pages to delete, no orphaned
  imports, no unused dependencies.

  `--demo` gives you the full reference application instead: sign-in, sign-up,
  forgot-password, a protected route, navigation with live session state, and a
  schema-driven form.

- **Environment configuration** (`--env single|dev-prod|dev-staging-prod`).
  Defaults to a single `.env.local`, because not every project needs staging on
  day one.

  Resolution is centralized in one module — `packages/config/env.ts` in a
  monorepo, `src/env.ts` standalone — so no application reimplements "which
  environment am I in":

  ```ts
  import { environment, isProduction } from "@my-app/config/env";
  ```

  The multi-environment setups key on `APP_ENV`, not `NODE_ENV`: Next.js sets
  `NODE_ENV=production` for *every* production build, including the one you deploy
  to staging, so `NODE_ENV` alone cannot tell them apart.

- **Better Auth is now a runnable demo, not just a typed provider.** Both
  providers ship app-side wiring and a scaffold keeps whichever you chose. The
  seam is one file: each provider's wiring exports the same `auth`,
  `signInInputSchema`, and `signUpInputSchema`, so every page works unchanged
  against either — swapping providers is swapping `src/lib/auth.ts`.

  Better Auth gets its `betterAuth()` instance on the in-memory adapter (so `dev`
  works with no database to provision), its routes via one `toNextJsHandler`
  catch-all, `BETTER_AUTH_SECRET`/`BETTER_AUTH_URL` documented in `.env.example`,
  and a `/server-session` page demonstrating session gating **on the server** —
  the capability a custom backend generally can't offer.

- **`@notils/cli` is installed into generated projects** as a devDependency, so
  `bun run notils` / `pnpm exec notils` work without a global install and each
  project carries one known-good binary. The range is `latest`, so a fresh install
  resolves the current CLI — note that your lockfile then pins it, and moving
  forward later is an explicit `<manager> update @notils/cli`.

- **`paths.apps` in `notils.json`**, so `notils add app` resolves where
  applications live from the manifest rather than assuming `apps/`.

### Changed

- **`$schema` in `notils.json` now points at `https://notils.com/schema.json`**
  (was `notils.dev`, which never served the schema). Existing projects are migrated
  automatically the next time any CLI command writes the file — values untouched,
  only the URL your editor validates against.

- **`@notils/cli` is a devDependency rather than only a `notils` script.** This
  reverses the earlier decision: the commands that *change* a project need the CLI
  and the template it writes from to agree, and a project with its own binary has
  one version rather than whatever the registry serves that minute. The script
  stays, now invoking the local binary.

- The default landing page is a minimal, branded starting point that says where you
  are and what to replace, instead of rendering the example contact form.

- The app's document metadata is set to your project's name, rather than shipping
  Next.js's "Create Next App" placeholder.

### Fixed

- **In-memory auth state is pinned to `globalThis`.** Next.js instantiates a
  module-level `const` more than once per server (route handlers and page renders
  are bundled separately), so the mock auth store had a separate copy per route:
  `/api/auth/login` issued a token that `/api/auth/session` then rejected with 401.
  The demo auth flow now works end to end, and survives dev-server hot reloads
  instead of signing you out on every file save.

- A `--packages none` standalone scaffold no longer produces a broken project. The
  flatten step assumed `packages/ui` existed and threw partway through, leaving a
  half-monorepo with no `src/` at all.

- No dangling references when the UI kit is declined: the theme provider is
  unwrapped from the layout, `globals.css` points at Tailwind directly, and the
  landing page uses classes that need no theme layer.

## 0.5.0

### Added

- **A second auth provider: [Better Auth](https://better-auth.com)**
  (`@notils/auth-better-auth`). For projects that would rather not run an auth
  server — it works in-process with Next.js, with its own database adapters
  (Drizzle, Prisma, …).

  **The same auth components work with either provider.** `SignInForm`,
  `SignUpForm`, `ProtectedRoute` and `SessionStatus` render against Better Auth
  exactly as they do against your own backend — no second set of components, no
  provider-specific UI:

  ```ts
  // your own Rust/Express/Go auth API
  export const auth = createAuthContract(config, anonymousHttp, authedHttp);

  // …or Better Auth, same components downstream
  export const auth = createBetterAuthContract({ client, mapUser });
  ```

  Use exactly **one** provider — they are alternatives, not layers.

  It also ships `getServerSession()` / `hasServerSession()` for server components
  and route handlers, which is much of the point of Better Auth. Those sit
  *outside* the shared contract deliberately: a hand-rolled auth backend can't
  implement a server-side session read, and forcing it into the contract would
  make the contract unimplementable for the projects `auth-custom` exists for.

- **`@notils/auth-core`** — the auth contract as its own types-only package.
  Previously it lived inside `auth-custom`, which meant the auth UI depended on
  the *custom-backend provider* just to import a type; a Better Auth user would
  have installed a REST-backend package they don't have. Providers now depend on
  the contract, never on each other.

### Notes

- Provider-specific flows — 2FA, passkeys, magic links, SSO, organizations — are
  deliberately not in the shared contract. Reach for the provider's own API, or
  [better-auth-ui](https://better-auth-ui.com) for Better Auth, when you need
  them.
- Your auth provider and where your business logic lives are **independent
  choices**. Remote auth with local Drizzle logic is as valid as Better Auth
  alongside a separate service. Nothing in these packages assumes either.
- The Better Auth provider is verified by types and by wiring the real client
  through the real components; the template does not yet ship a runnable Better
  Auth example app (the scaffolded example still wires `auth-custom` against mock
  routes). Tracked in the roadmap.

## 0.4.0

### Fixed

- **The agent skill was invisible to Claude Code.** It shipped to
  `.agents/skills/`, but `.claude/` — the directory Claude Code actually reads —
  never reached a scaffold at all, because it is gitignored in the template repo
  (it holds Windows junctions git cannot represent), so the template fetch
  skipped it entirely. Scaffolds now generate `.claude/skills/` as real files and
  reference the skill from `CLAUDE.md`. An AI agent opening a fresh project
  finally knows what create-notils produced.

### Changed

- **The shipped skill is now `notils-project`** (was `app-guide`), and reads as a
  specification rather than documentation: Overview → Rules → Patterns →
  Verification, so an agent can find the relevant section instead of scanning
  prose. The name stays accurate as the document grows to cover database,
  testing, and deployment.
- **The vendored shadcn skill is gone** (15 files). Skills for the libraries in
  this stack are maintained by their own authors — a copy we did not maintain
  would go stale silently. Install them with the
  [`skills`](https://www.npmjs.com/package/skills) CLI, which uses the same
  `.agents/skills/` convention and records everything in `skills-lock.json`:

  ```sh
  bunx skills add shadcn-ui/ui
  ```

  The generated README and the `notils-project` skill both point at it.

### Added

- **The template now has its own version**, in `template-version.json`, separate
  from either CLI's npm version. Both CLIs read it, so they always fetch the same
  tag while versioning independently — a CLI with no changes no longer publishes a
  no-op release just to stay in step. (`@notils/cli` stays at 0.3.2 for this
  release: nothing in it changed.)
- **`--skills` / `--no-skills`**, with an interactive prompt defaulting to yes.
  Declining removes the skill and prunes the empty directories, so a project that
  does not want agent context carries no trace of it.

## 0.3.2

### Fixed

- **`add` left brownfield projects uncompilable.** The packages it writes import
  `@base-ui/react`, `react-hook-form`, `zod` and friends; if the project did not
  already have them, `add` printed an install command as a passive warning among
  several others and exited successfully. A project with no shadcn/Base UI setup
  — the primary use case — was left broken. It now states plainly that the
  packages are required, and **offers to install them** (`--with-deps` to skip
  the prompt, like `--with-theme`).
- **`next-themes` was missing from the reported dependencies**, so `add ui` wrote
  `theme.tsx`/`theme-toggle.tsx` importing a package it never mentioned. The
  dependency list was hardcoded in the CLI and had drifted from what the packages
  actually declare; it is now read from each fetched `package.json` (names only —
  never the version ranges, which stay yours to resolve), so it cannot drift
  again.
- **The install command named the wrong package manager** in a project with no
  lockfile yet — it said `npm add` even when invoked through `bunx`. Detection
  now falls back to the runner that invoked the CLI (`npm_config_user_agent`)
  before defaulting to npm.
- Missing dependencies and the theme offer are no longer skipped when the source
  files are already current. A project whose files are present but whose
  dependencies are not still does not compile, so a re-run surfaces both.

## 0.3.1

### Fixed

- **Every install of 0.3.0 failed** with
  `GET https://registry.npmjs.org/@notils%2ftransform - 404`. Both CLIs
  declared the private, never-published `@notils/transform` as a runtime
  dependency. The published bundle was fine — it inlines that code at build
  time — but the manifest still asked npm to fetch a package that does not
  exist. Moved to `devDependencies`, where a build-time-only dependency
  belongs.
- A `check:publishable` guard now runs from `prepublishOnly` in both
  packages, so a `workspace:` range or an unpublished `@notils/*` package
  in `dependencies` aborts the publish instead of shipping.

## 0.3.0

### Added

- **A companion CLI, [`@notils/cli`](https://www.npmjs.com/package/@notils/cli),
  for adding capabilities after scaffolding.** `create-notils` runs once; this
  one runs any time after — and in projects it didn't create. Scaffolds now ship
  a `notils` script for it:

  ```bash
  bun run notils list             # what's available, what's installed
  bun run notils add auth-ui      # add a capability to this project
  ```

  It is deliberately **not** a dependency — the script just invokes your package
  runner (`bunx`/`npx`/`pnpm dlx`), so it always resolves the newest published
  version instead of pinning one that goes stale.
- **`notils.json`** — records this project's shape, scope, and paths so
  `@notils/cli` knows where to write. Generated automatically; you shouldn't need
  to touch it.

### Changed

- **Imports are sorted after scaffolding.** Both shapes rewrite module specifiers
  (standalone folds `@notils/ui/*` into `@/components/*`; monorepo renames the
  scope), which changes how those imports sort — so a fresh project used to open
  with import-sort diagnostics on ~13 files. The scaffold now runs your
  project's own formatter once dependencies are installed.
- Workspace imports now sort into their own group, separate from third-party
  packages, in the shared Biome config.

### Fixed

- Every package in a monorepo scaffold now has `lint`/`lint:fix`/`format`
  scripts. Turborepo's `lint` task silently skips any package without one, so
  `bun run lint` at the root had been linting a fraction of the workspace while
  appearing to cover all of it.
- The Biome `$schema` version in the generated config now matches the installed
  Biome, so scaffolds no longer emit a schema-mismatch warning on first lint.

## 0.2.0

### Added

- **Authentication, scaffolded by default**: a custom-backend auth provider
  (`@notils/auth-custom`) built on a new platform-neutral HTTP transport
  core (`@notils/api-client`), Zod-schema-validated end to end — every
  endpoint response is checked against a schema you define, so a mismatch
  fails loudly with the exact field instead of silently producing a wrong
  object. Every scaffold now ships a real, working example: an in-memory
  mock auth backend (`app/api/auth/*`), `/login`, `/signup`,
  `/forgot-password`, and a session-gated `/dashboard` route.
- **`@notils/auth-ui`**: sign-in, sign-up, forgot-password, session-status,
  and protected-route components, driven only by the auth contract — the
  same components work unchanged if the provider behind them ever changes
  (e.g. a future Better Auth provider).
- **`@notils/form-builder`**: a recursive Zod-schema-to-form renderer for
  Base UI (no existing library in the ecosystem targets Base UI — every
  one found is Radix-coupled). Give it a schema, get a validated form —
  including nested objects, arrays, discriminated unions, multi-column
  `layout`, and per-field `uiHints` for conditional visibility or style
  overrides. This is what renders the auth forms above, and is reusable for
  any form in your project.
- **Standalone scaffolds now fold in every internal library package**, not
  just the UI kit — `api-client`, `auth-custom`, `auth-ui`, and
  `form-builder` move into `src/lib/<package>/` with their imports and
  dependencies merged automatically, the same way the UI kit already did.
  Monorepo scaffolds needed no change — their existing package-rename
  logic already generalizes to any package under `packages/*`.

## 0.1.1

### Fixed

- **npm/yarn monorepo scaffolds failed `install` outright.** Every internal
  dependency (`"@notils/ui": "workspace:*"`) used the `workspace:` protocol,
  which npm has never supported and Yarn Classic (1.x, still what a bare
  `yarn` resolves to almost everywhere) doesn't either —
  `EUNSUPPORTEDPROTOCOL: Unsupported URL Type "workspace:"` on every
  monorepo scaffold, not an edge case. Fixed by rewriting `workspace:*` to a
  plain `*` for npm/yarn scaffolds (both resolve a same-named workspace
  member automatically for a satisfying range, no special protocol needed);
  bun and pnpm are unaffected and keep `workspace:*`.
- **`pnpm dev` / `npm run dev` on a fresh monorepo failed before the dev
  server ever started**, with turbo errors ranging from "Could not resolve
  workspace... Missing devEngines.packageManager" to
  "devEngines.packageManager.version is required" to (once a version was
  supplied) "must only allow versions within one major version." The root
  cause: `devEngines.packageManager`, which turbo requires to run at all,
  triggers strict runtime version enforcement (by npm, bun, and turbo's own
  parser) that's fragile in practice — the same manager name can resolve to
  a *different* binary/version depending on invocation context (confirmed:
  turbo's internal subprocess for a workspace member's `npm run dev`
  resolved to the Node-bundled npm, a different major version than the
  separately-upgraded global npm on PATH). Fixed by using the legacy
  `packageManager` field (`"<name>@<version>"`) instead, which satisfies
  turbo's structural requirement without triggering that enforcement.
- Verified end-to-end (install + `dev` actually booting turbo → Next.js) on
  all four supported package managers: bun, pnpm, npm, and yarn.

## 0.1.0

Initial release.

### Added

- Interactive CLI (`create-notils` / `npm create notils@latest`) to scaffold a
  production-ready Next.js project as either a **monorepo** (Turborepo,
  `apps/*` + `packages/{ui,config}`) or a **standalone** single app, from one
  source-of-truth template.
- Next.js 16 (App Router, React Compiler, Turbopack), React 19, Tailwind CSS
  v4, shadcn/ui on Base UI, Biome, and a pre-commit hook (format + typecheck)
  in every scaffold.
- Prompts (with a flag and `--yes` for non-interactive use) for project name,
  project shape, app names, package manager, dependency install, and git init.
- `.` support: scaffold directly into the current directory (only when empty),
  deriving the project name from the folder.
- Package manager support for `bun`, `pnpm`, `npm`, and `yarn` — each
  scaffold's scripts, lockfile, and `devEngines` field match the chosen
  manager; a pnpm scaffold gets its own `pnpm-workspace.yaml` since pnpm
  doesn't read package.json's `workspaces` field.
- `npm pack` ships only `dist/` + `package.json` + `README.md` + `CHANGELOG.md`.
