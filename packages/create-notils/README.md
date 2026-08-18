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

## Fresh app or demo app

A starter shouldn't create work for you, so the default is a **fresh app**: a
clean landing page and the project's production configuration, and nothing else.

```text
What would you like to create?

❯ Fresh app (recommended)
  Demo app
```

| | **Fresh** (default) | **Demo** (`--demo`) |
|---|---|---|
| Landing page | Minimal, branded, obviously yours to replace | The full example page |
| Auth pages | — | Sign-in, sign-up, forgot-password, a protected route |
| Navigation | — | Nav bar with live session state |
| Example form | — | A schema-driven contact form |
| Mock auth API | — | In-memory routes backing the example pages |

Nothing is left behind in a fresh app — no orphaned imports, no unused
dependencies, no example components you have to hunt down and delete. Reach for
`--demo` when you want a complete working reference to read or experiment with.

## Choose what goes in

The template contains everything it supports. Your project gets only what you
select.

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

**Authentication is one choice, never several.** `auth-custom` and
`auth-better-auth` are two answers to the same question, so picking one means the
other is never generated — no competing implementations to decide between later,
and no dependencies for the one you didn't choose.

Unselected packages are removed along with every reference to them: workspace
dependencies, app imports, and the pages that used them. What remains builds
cleanly. If something you selected requires something you didn't (the auth forms
are built on the form renderer, for instance), the CLI adds it and tells you why.

## Environments

Not every project needs staging on day one.

```text
? Environment setup
❯ Single environment (recommended)
  Development + Production
  Development + Staging + Production
```

| Setup | Files |
|---|---|
| `single` | `.env.local`, `.env.example` |
| `dev-prod` | `.env.development`, `.env.production`, `.env.example` |
| `dev-staging-prod` | adds `.env.staging` |

Resolution is centralized in one module — `packages/config/env.ts` in a monorepo,
`src/env.ts` standalone — so no application reimplements "which environment am I
in":

```ts
import { environment, isProduction } from "@my-app/config/env";
```

For the multi-environment setups, `APP_ENV` selects the environment rather than
`NODE_ENV`: Next.js sets `NODE_ENV=production` for *every* production build,
including the one you deploy to staging, so `NODE_ENV` alone can't tell them
apart. The committed `.env.<environment>` files hold non-secret defaults; real
secrets belong in `.env.<environment>.local` (gitignored) or your host's secret
store.

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

# Fully specified: Better Auth, two packages, one environment
npm create notils@latest my-app -- --auth better-auth --packages ui,api-client --env single -y

# The complete reference application
npm create notils@latest my-app -- --demo -y
```

> When using `npm create`, pass flags after `--` (as shown). `npx create-notils` / `bunx create-notils` don't need the separator.

### Options

| Flag | Description | Default |
|---|---|---|
| `[project-name]` | Directory to create (positional) | prompted |
| `-t, --type <type>` | `monorepo` \| `standalone` | prompted (monorepo) |
| `--apps <names>` | Comma-separated app names (monorepo) | `web` |
| `--pm <manager>` | `bun` \| `pnpm` \| `npm` \| `yarn` | `bun` |
| `--demo` / `--no-demo` | Include the example pages and auth flows | prompted (no) |
| `--auth <choice>` | `none` \| `custom` \| `better-auth` | prompted (`none`) |
| `--packages <names>` | `ui,api-client,form-builder` (or `none`) | prompted (`ui,api-client`) |
| `--env <setup>` | `single` \| `dev-prod` \| `dev-staging-prod` | prompted (`single`) |
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

See the generated `AGENTS.md` and the `notils-project` skill in the project for conventions.

## Growing the project

Your project isn't stuck with the choices you made at scaffold time.
[`@notils/cli`](../cli) is installed as a devDependency, so:

```sh
bun run notils list                 # what's available, what's installed
bun run notils add auth-ui          # add a capability you skipped
bun run notils add app admin        # add another app (monorepo)
```

`add app` generates the new app from the same template the scaffold used, with
its own dev port and workspace wiring, matched to the capabilities this project
actually has — so `apps/admin` is indistinguishable from an app you asked for up
front, and your existing apps are untouched.

## AI agent context

Every scaffold ships the **`notils-project`** skill — the specification an agent
reads to understand the project's architecture, rules, and patterns. It lands in
both `.agents/skills/` (tool-agnostic) and `.claude/skills/` (Claude Code), and
is referenced from `CLAUDE.md`. Skip it with `--no-skills`.

Skills for the libraries in the stack are maintained by their own authors, not
vendored here. Install them with the [`skills`](https://www.npmjs.com/package/skills)
CLI, which uses the same `.agents/skills/` convention:

```bash
bunx skills add shadcn-ui/ui   # shadcn/ui component + composition rules
bunx skills find <query>       # search
```

**Using these conventions without `create-notils`?** The skill installs standalone
in any project — Next.js, Vite, Expo:

```bash
npx skills add notils/create-notils@notils-project
```

## Requirements

- Node.js ≥ 20 (the CLI); the scaffolded project targets Node ≥ 18.
- Git (optional — scaffolding still works, it just skips `git init`).

## Contributing / local testing

To run the CLI from source against a template branch, see
[docs/testing-locally.md](https://github.com/notils/create-notils/blob/main/docs/testing-locally.md).

## License

ISC © Sanjay Kumar Sah
