# create-notils

> Scaffold a production-ready Next.js project — as a monorepo **or** a standalone app — in one command.

```sh
npm create notils@latest my-app
# or: npx create-notils my-app · bunx create-notils my-app · pnpm create notils my-app
```

## What you get

A production-first starter, not a toy example — every file is yours to edit, no vendor lock-in:

- **[Next.js](https://nextjs.org/) 16** — App Router, React Compiler, Turbopack
- **[React](https://react.dev/) 19**
- **[Tailwind CSS](https://tailwindcss.com/) v4** — CSS-first, no `tailwind.config.js`
- **[shadcn/ui](https://ui.shadcn.com/)** on **[Base UI](https://base-ui.com/)** — a shared, token-based component kit
- **[Biome](https://biomejs.dev/)** — one fast tool for lint + format
- **[Bun](https://bun.sh/)** by default (pnpm / npm / yarn also supported)
- A pre-commit hook (format + typecheck), `AGENTS.md` for AI coding agents, and a fresh `git` repo

## Two project shapes, one command

Pick the shape that fits — the CLI asks, or you pass `--type`:

| | **Monorepo** | **Standalone** |
|---|---|---|
| Best for | Multiple apps, shared packages, larger products | Landing pages, SaaS MVPs, AI apps, dashboards |
| Layout | `apps/*` + `packages/{ui,config}` + Turborepo | a single Next.js app; UI kit folded into `src/` |
| UI import | `@your-app/ui/components/ui/button` | `@/components/ui/button` |

Both shapes come from a single source of truth: the standalone variant is derived from the monorepo by a deterministic flatten (folds `packages/*` into the app, rewrites imports to `@/*`, merges configs). There is no duplicated template.

## Usage

```sh
npm create notils@latest my-app
```

Runs interactively by default. Every prompt has a flag for non-interactive / CI use:

```sh
# Standalone app, pnpm, no prompts
npm create notils@latest my-app -- --type standalone --pm pnpm -y

# Monorepo with two apps
npm create notils@latest shop -- --type monorepo --apps admin,storefront -y
```

> When using `npm create`, pass flags after `--` (as shown). `npx create-notils` / `bunx create-notils` don't need the separator.

### Options

| Flag | Description | Default |
|---|---|---|
| `[project-name]` | Directory to create (positional) | prompted |
| `-t, --type <type>` | `monorepo` \| `standalone` | prompted (monorepo) |
| `--apps <names>` | Comma-separated app names (monorepo) | `web` |
| `--pm <manager>` | `bun` \| `pnpm` \| `npm` \| `yarn` | `bun` |
| `--bundle-id-prefix <prefix>` | Reverse-DNS prefix for future native ids | `com.<project>` |
| `--install` / `--no-install` | Install dependencies after scaffolding | prompted (yes) |
| `--git` / `--no-git` | Initialize a git repository | yes |
| `-y, --yes` | Accept all defaults without prompting | — |
| `-v, --version` | Print the CLI version | — |
| `-h, --help` | Show help | — |

## After scaffolding

```sh
cd my-app
bun install       # or your chosen package manager
bun run dev        # http://localhost:3000
```

Add or update UI components with the shadcn CLI (already wired):

```sh
# monorepo: run from packages/ui · standalone: run from the project root
bun run ui:add dialog
bun run ui:add button --overwrite   # update in place; review the git diff
```

See the generated `AGENTS.md` and the `app-guide` skill in the project for conventions.

## Requirements

- Node.js ≥ 20 (the CLI); the scaffolded project targets Node ≥ 18.
- Git (optional — scaffolding still works, it just skips `git init`).

## Contributing / local testing

To run the CLI from source against a template branch, see
[docs/testing-locally.md](https://github.com/notils/create-notils/blob/main/docs/testing-locally.md).

## License

ISC © Sanjay Kumar Sah
