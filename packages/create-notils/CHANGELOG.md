# Changelog

All notable changes to `create-notils` are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses
[Semantic Versioning](https://semver.org/).

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
