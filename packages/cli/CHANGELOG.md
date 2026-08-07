# Changelog

All notable changes to `@notils/cli` are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses
[Semantic Versioning](https://semver.org/).

## 0.4.0

No functional changes. Version bumped in lockstep with `create-notils`, since
both packages resolve template content from the same `v0.4.0` tag.

### Changed

- **Skill install and search will not be added to this CLI.** The
  [`skills`](https://www.npmjs.com/package/skills) CLI already does it — `add`,
  `find`, `list`, `update`, `remove` — writes `skills-lock.json`, installs into
  `.agents/skills/`, and links into `.claude/skills/` for Claude Code. A
  `notils add skill:<name>` command with a curated registry was designed and
  dropped rather than ship a worse copy of a maintained tool.

  Skills for the libraries in this stack are the provider's to maintain:

  ```sh
  bunx skills add shadcn-ui/ui
  bunx skills find <query>
  ```

  `notils add` remains for notils packages (`ui`, `auth-ui`, `form-builder`, …);
  `notils list` remains installed-only and offline.

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
