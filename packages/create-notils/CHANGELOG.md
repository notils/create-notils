# Changelog

All notable changes to `create-notils` are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses
[Semantic Versioning](https://semver.org/).

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
