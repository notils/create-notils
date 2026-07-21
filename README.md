# create-notils

> The fastest way to bootstrap production-ready applications with sensible defaults.

## What is create-notils?

**create-notils** is a CLI that scaffolds a complete, production-ready project instead of just generating a basic application.

It removes the repetitive work involved in setting up modern full-stack applications by providing a carefully curated starter that includes authentication, UI components, database configuration, development tooling, and project structure from day one.

The goal is simple:

> Spend less time configuring infrastructure and more time building products.

---

## Why does it exist?

Every new project starts with the same repetitive tasks:

- Creating a Next.js project
- Setting up a monorepo
- Installing Tailwind CSS
- Configuring shadcn/ui
- Integrating authentication
- Creating login and registration pages
- Setting up the database and ORM
- Configuring environment variables
- Setting up linting and formatting
- Creating Docker configuration
- Organizing folders
- Adding CI/CD workflows

Although each step is well documented, together they consume hours before real product development begins. **create-notils** automates them so developers can start building features immediately.

---

## Design Philosophy

### Opinionated by default

The first version intentionally follows a single, well-tested technology stack. Instead of asking dozens of configuration questions, it generates a project with sensible defaults so development can begin immediately. Everything lives inside your repository, so you can always modify the generated code afterward.

### Production-first

The generated project should resemble something ready to build upon — not a toy example. It includes the infrastructure commonly needed by modern SaaS applications.

### Own your code

Unlike hosted platforms or code generators that hide implementation details, every file belongs to the developer. Authentication pages, UI components, configuration, and business logic remain fully editable. There is no vendor lock-in.

---

## Current Stack

A modern TypeScript stack built around:

- **[Next.js](https://nextjs.org/) 16** — App Router, React Compiler, Turbopack
- **[React](https://react.dev/) 19**
- **[Turborepo](https://turborepo.dev/)** — the monorepo task runner
- **[Bun](https://bun.sh/)** — package manager and runtime
- **[Tailwind CSS](https://tailwindcss.com/) v4** — CSS-first, no `tailwind.config.js`
- **[shadcn/ui](https://ui.shadcn.com/)** on **[Base UI](https://base-ui.com/)** — in a shared `@notils/ui` package
- **[TypeScript](https://www.typescriptlang.org/)** — everywhere, `strict`
- **[Biome](https://biomejs.dev/)** — one fast tool for linting + formatting (replaces ESLint + Prettier)

Planned (see [Roadmap](#roadmap)): **Better Auth** + Better Auth UI (auth on by default), **PostgreSQL** + **Drizzle ORM**, **Docker**, and CI/CD.

---

## Repository Structure

```
create-notils/
├── apps/
│   └── app/              # Next.js 16 application (App Router)
├── packages/
│   ├── config/           # Shared tsconfig + Biome config (@notils/config)
│   └── ui/               # Shared shadcn/ui component library (@notils/ui)
├── biome.json            # Root Biome config (extends @notils/config)
├── turbo.json            # Turborepo pipeline
└── package.json          # Workspaces + root scripts
```

### `@notils/ui` — the shared design system

shadcn/ui is **not** installed per-app. It lives in a single `packages/ui` workspace that every app consumes, so there is one design system and one place to add or update components — a second app never duplicates the primitives.

- Components live in `packages/ui/src/components/ui`.
- The `cn()` helper lives in `packages/ui/src/lib/utils.ts`.
- Design tokens and the Tailwind v4 theme live in `packages/ui/src/styles/globals.css`.
- `packages/ui/components.json` configures the shadcn CLI to write into this package using the `@notils/ui/*` aliases.

Apps import primitives directly:

```tsx
import { Button } from "@notils/ui/components/ui/button";
```

Apps pull in the shared theme by importing the package stylesheet from their own `globals.css`:

```css
@import "@notils/ui/globals.css";
@source "../"; /* scan this app's own source for class names */
```

> **Why not `shadcn init --monorepo`?**
> That command scaffolds shadcn's _own_ opinionated monorepo (its own app, tsconfig, and Tailwind wiring), which fights the config in this repo — it's meant for greenfield projects. Instead we wire shadcn manually into `packages/ui` so it respects our existing setup, which is the same pattern shadcn's monorepo output uses under the hood.

> **Base UI, not Radix.**
> Components are generated on [Base UI](https://base-ui.com/) (`components.json` → `style: "base-nova"`), shadcn's forward-looking default. Composition uses the `render` prop (with `nativeButton={false}` when rendering a non-`<button>`), not Radix's `asChild`. The unified `radix-ui` package remains fully supported by shadcn if you prefer it — switching bases is a one-command migration.

---

## Getting Started

Scaffold a new project:

```bash
npx create-notils my-app
cd my-app
bun install
bun run dev
```

---

## Working with UI components

Because shadcn writes source files into your repo, there is no package to bump — **adding and updating are the same command**, run from inside `packages/ui`:

```bash
cd packages/ui

# add a component
bunx shadcn@latest add dialog

# preview an upstream update against your local copy
bunx shadcn@latest add button --diff button.tsx

# update (review the diff in git afterward)
bunx shadcn@latest add button --overwrite
```

Every generated file is yours to edit. Updating a component is a git diff, not a dependency upgrade.

---

## Development

All tasks run through Turborepo from the repo root:

```bash
bun run dev        # start all apps in dev mode
bun run build      # build all apps and packages
bun run typecheck  # type-check every workspace
bun run lint       # lint via Biome
bun run lint:fix   # lint + format and apply safe fixes
bun run format     # format only
```

Target a single workspace with a Turborepo filter:

```bash
bun run dev --filter=app
```

---

## Roadmap

> For the concrete, checkbox-level tracking of what's built and what's next, see [docs/ROADMAP.md](docs/ROADMAP.md). The phases below describe direction; that file tracks execution.

### Phase 1 — Personal Starter

A single opinionated template used to bootstrap all of my own projects. No prompts. No templates. Just one command.

```bash
npx create-notils my-app
```

### Phase 2 — Better Developer Experience

Improve the CLI with project validation, automatic dependency installation, environment setup, Git initialization, update commands, and template versioning.

**Two project shapes, one source.** The CLI will let you choose:

- **Monorepo** — Turborepo with `apps/*` + shared `packages/*`. For larger apps, multiple apps, and shared packages.
- **Standalone** — a single Next.js project where the UI kit and config are folded into the app's own `src/` (`@/components/ui`, `@/lib`). For landing pages, SaaS MVPs, AI apps, and dashboards.

There is no duplicated template: the monorepo is the single source, and the standalone variant is derived by a deterministic flatten transform (see [`docs/cli-monorepo-vs-standalone.md`](docs/cli-monorepo-vs-standalone.md)).

### Phase 3 — Modular Architecture

Extract commonly used functionality into reusable modules: Authentication, Database, Email, Storage, Payments, RBAC, AI integrations, Monitoring.

### Phase 4 — Community Templates

Support multiple project types — SaaS, AI applications, admin dashboards, APIs, landing pages, mobile, and desktop (Electron) — in both monorepo and single-package variants. This is also where [rnstack](https://github.com/sanjaysah101/rnstack) will be merged in.

---

## Long-Term Vision

The long-term goal is for **create-notils** to become the entry point into the Notils ecosystem. It will not only generate projects but also integrate seamlessly with reusable Notils packages for authentication, email, storage, developer tooling, and future infrastructure services.

Over time, the CLI will evolve from a project generator into a platform for assembling production-ready applications from trusted building blocks.

---

## Mission

Help developers skip repetitive setup and start building products in minutes instead of days.

Infrastructure should accelerate development — not delay it.
