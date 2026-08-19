# Changelog

All notable changes to `@notils/cli` are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses
[Semantic Versioning](https://semver.org/).

## 0.6.3

### Changed

- Fetches template source from `v0.6.2`, which carries the `.gitignore` fix for
  `.env` files (see [create-notils 0.6.2](../create-notils/CHANGELOG.md)). No
  behavior change in this CLI itself — the template ref is inlined at build time,
  so picking up a new template requires a release.

## 0.6.2

### Fixed

- **`add` now writes each package's `README.md`.** It was dropped outright, on the
  reasoning that it "documents the package inside our monorepo" — but these READMEs
  are mostly real API documentation, and `create-notils` was already shipping them.
  So an added package came out without the docs its scaffolded twin had, for no
  stated reason.

  The README is rewritten rather than copied, by a rewriter now shared with
  `create-notils` so the two paths can't disagree again: links into `../../docs/`
  become URLs to the published docs (that directory never ships, so those links
  were dead), the `@notils/*` scope becomes the project's own, and a short note is
  prepended saying the code is yours and where it came from.

  Standalone targets get it at `src/lib/<name>/README.md`. The `ui` kit is the one
  exception — it spreads across `src/components/` and `src/lib/` rather than
  occupying one directory, so there is no single place its README belongs.

## 0.6.1

Fixes for `add` in a **monorepo**, all reported from a real project on 0.6.0.
Standalone targets were unaffected.

### Fixed

- **A package added to a monorepo now has a working `tsconfig.json`.** It extended
  a hardcoded `"../../tsconfig.json"` — a file a create-notils monorepo does not
  have, since its packages extend `@<scope>/config/*` presets instead. That
  produced `TS5083: Cannot read file '<root>/tsconfig.json'`, and because a broken
  `extends` inherits **no** compiler options, the package then also failed on
  `strict`, JSX, and module resolution. The right preset is now detected (React or
  base, matched to the package), falling back to a *computed* relative path to a
  real root tsconfig, then to no `extends` at all — never a reference to a file
  that isn't there.

- **The generated manifest was missing `scripts` and `devDependencies`.** Both
  matter more than they look: without `@<scope>/config` as a devDependency the
  `extends` above has no reason to resolve, and **a package with no `typecheck`
  script is silently skipped by Turborepo** — which is exactly why the broken
  tsconfig went unnoticed while `turbo run typecheck` reported success.

- **External dependencies are declared on the package that imports them.** They
  were left out of the generated manifest and installed at the workspace root, so
  `zod` ended up in the root `dependencies` while `packages/auth-custom` declared
  nothing — and in a monorepo a package must declare its own imports for the
  workspace to resolve them. They are written at `"*"` (never this repo's pinned
  ranges), and the offered install now runs in each package's own directory so your
  package manager writes a real range in the right file.

- **`add app` asks whether you want a fresh or demo app.** It defaulted to fresh
  silently, so `--demo` was the only way to discover the option existed. `--yes`
  and non-interactive runs still take the fresh default, and `--no-demo` is now
  accepted rather than rejected as an unknown flag.

## 0.6.0

### Added

- **`notils add app <name>`** — add another application to an existing monorepo,
  instead of copying an existing app by hand and fixing up its name, port, and
  wiring.

  ```sh
  notils add app admin           # apps/admin, on the next free dev port
  notils add app console --demo  # with the example pages
  notils add app preview --dry-run
  ```

  It generates from the same template the scaffolder uses, so an app added later is
  indistinguishable from one created up front. Specifically it:

  - reads where apps live from `notils.json`'s `paths.apps`, and the package scope
    from `scope`, rather than assuming a structure;
  - matches the capabilities the project **actually has** — a project without
    `auth-ui` gets an app with no auth pages and no dependency on it, rather than
    one importing a package that isn't there;
  - takes the next free dev port, read from your existing apps' `dev` scripts, so
    `turbo run dev` can run them all side by side;
  - leaves existing apps untouched, and refuses a name that already exists.

  Monorepo only: a standalone project has one app at its root by definition, and
  the command says so rather than inventing an `apps/` directory.

- **A published JSON Schema for `notils.json`**, served at
  `https://notils.com/schema.json` and version-controlled at
  `packages/cli/schema/notils.schema.json`. Editors validate the file as you type,
  and `check:publishable` blocks a release if the shipped schema and the URL the
  CLI writes ever disagree.

- **`paths.apps`** in `notils.json`, so `add app` resolves its target from the
  manifest. Optional: configs written before this field keep working and fall back
  to the conventional `apps/`.

### Changed

- **`$schema` now points at `https://notils.com/schema.json`** (was `notils.dev`,
  which never served the schema). Any command that writes `notils.json` migrates
  an old URL automatically — values untouched, only the URL your editor fetches.

- **`notils.json` is the project manifest the CLI reads**, rather than a record it
  writes and mostly ignores. Detection still exists for brownfield projects; it is
  now the fallback rather than the primary path.

### Fixed

- `add app` rewrites the package scope in `tsconfig.json` and `biome.json`, not
  just in source imports. Those reference shared presets by package name
  (`"extends": "@notils/config/..."`), which the specifier-aware source rewrite
  correctly skips — so a generated app inherited no compiler options at all and
  failed with "Cannot use JSX unless the '--jsx' flag is provided".

## 0.5.0

### Added

- **`add auth-better-auth`** — the new [Better Auth](https://better-auth.com)
  provider is now installable. `add auth-ui` still defaults to `auth-custom`
  (your own backend); ask for the other explicitly to use it instead:

  ```sh
  notils add auth-ui auth-better-auth
  ```

  Exactly one provider is installed either way — they are alternatives, not
  layers, so asking for one never drags in the other.

- **`add auth-ui` now pulls in a provider automatically.** The auth UI depends on
  the contract (`auth-core`) rather than on any particular provider, which is what
  lets one set of components serve both — but it means `add auth-ui` on its own
  would have written components with nothing behind them. It now installs a
  provider alongside.

## 0.4.0

### Fixed

- **`add` fetched package source from the wrong tag.** The template ref was
  derived from this CLI's own npm version (`@notils/cli@0.3.2` → tag `v0.3.2`),
  so the CLI stayed pinned to whatever template shipped alongside it — silently
  drifting further behind as the template moved on, with no way to tell from the
  outside.

  The ref now comes from `template-version.json`, the template's own version,
  which both CLIs read. `notils.json` records the tag each package was written
  from, so `list` can report drift accurately.

### Changed

- **This CLI's version and the template's version are now independent.** They
  change for different reasons: this one when the CLI changes, the template's
  when the template does. Neither forces a no-op release of the other, and a
  future `@notils/*` package can start at `0.1.0` instead of inheriting whatever
  number the others happened to reach.

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

Initial release. `@notils/cli` adds production-ready capabilities — the UI kit,
auth, the Zod-schema-to-form renderer — to **any** Next.js project, whether it
was scaffolded with [`create-notils`](https://www.npmjs.com/package/create-notils)
or written from scratch.

```bash
bunx @notils/cli list                 # what's available, what's installed
bunx @notils/cli add auth-ui          # also adds auth-custom, api-client, form-builder, ui
bunx @notils/cli init                 # record this project's layout (usually automatic)
```

### Added

- **`add <packages...>`** — fetches package source from a pinned tag of the
  template repository, rewrites its imports for your project's shape, and writes
  it as your source. Monorepo targets get real workspace packages under
  `packages/*` (with a generated `package.json`/`tsconfig.json` scope-renamed to
  yours); standalone targets get the folded `@/*` form, identical to what
  `create-notils` produces.
- **Dependency resolution** — `add auth-ui` also writes `auth-custom`,
  `api-client`, `form-builder`, and `ui`, in dependency-first order, reported
  before anything is written.
- **Your edits are never clobbered.** Every file is compared against the
  pristine upstream source; files you've changed are reported and left alone.
  `--force` overwrites them. Re-running with nothing to do reports "already up to
  date" rather than rewriting.
- **`init`** — detects your project's shape, scope, and paths and records them in
  `notils.json`, showing its reasoning line by line and letting you correct every
  value. Runs automatically on your first `add`, so you rarely invoke it.
- **`list`** — shows available capabilities, which are installed, where they
  live, and whether they're outdated relative to the CLI's version.
- **Brownfield compatibility checks** — warns (never refuses) when the project
  lacks the foundations these components assume: Tailwind v4, the semantic theme
  tokens, Base UI vs an existing Radix install, React 19.
- **Theme-token injection** — when `add ui` lands in a project with no
  `--primary` token layer, offers to append one, since the components would
  otherwise render unstyled. Always a prompt; `--with-theme` is the explicit
  opt-in for scripted use.
- **Version-drift reporting** — `add` records which template ref each package
  came from, and `list` flags packages from an older version.
- **Post-write formatting** — runs your project's own `lint:fix`/`format` script,
  because rewriting import specifiers changes their sort order.

### Notes

- **This CLI is never installed into your project.** Run it with `bunx` (or
  `npx`/`pnpm dlx`) so it always resolves the newest published version — a fix
  reaches every project, including ones scaffolded long ago. Projects scaffolded
  by `create-notils` 0.3.0+ get a `notils` script for convenience, which is still
  just a package-runner invocation, not a dependency.
- **The CLI's version is its template ref.** `@notils/cli@X.Y.Z` fetches package
  source from this repository's `vX.Y.Z` tag, so a given version always writes
  the same source. Override with `NOTILS_TEMPLATE_REF` to test against a branch.
- Everything it writes is **your source**, in your repo. To remove a capability,
  delete the directory.
