# Changelog

All notable changes to `@notils/cli` are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses
[Semantic Versioning](https://semver.org/).

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
