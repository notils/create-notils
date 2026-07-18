# Changelog

All notable changes to `create-notils` are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses
[Semantic Versioning](https://semver.org/).

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
