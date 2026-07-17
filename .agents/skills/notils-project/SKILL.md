---
name: notils-project
description: Architecture, conventions, and setup decisions for the create-notils monorepo starter. READ THIS before adding or editing code in this repo — especially before touching the shared @notils/ui package, shadcn/Base UI components, Tailwind v4 theming, the package layout, or dependencies. Applies to any work under apps/* or packages/*.
---

# create-notils — project guide

**create-notils** is an opinionated, production-first monorepo starter and (eventually) a CLI that scaffolds a complete full-stack app in one command: `npx create-notils my-app`. The goal is that a developer skips the repetitive infra setup (monorepo, UI kit, auth, db, tooling) and starts building product on day one. Every generated file is the user's to edit — no vendor lock-in.

> Branding: the product/package name is **create-notils** (root `package.json` `name: "create-notils"`; part of the future **Notils** ecosystem). [rnstack](https://github.com/sanjaysah101/rnstack) (a React Native starter) will be merged in later as a template variant — keep conventions here compatible with that skill (`rnstack-project`).

Primary target is **web (Next.js)**. The stack is deliberately singular and well-tested — no configuration prompts in the current phase.

## Repository layout

```
create-notils/
├── apps/
│   └── app/                    # Next.js 16 app (App Router, React Compiler, Turbopack)
│       ├── src/app/            #   routes; globals.css imports @notils/ui/globals.css
│       ├── next.config.ts      #   reactCompiler: true
│       └── postcss.config.mjs  #   @tailwindcss/postcss
├── packages/
│   ├── config/                 # @notils/config — shared tsconfig.* + biome.json
│   └── ui/                     # @notils/ui — the shared shadcn/ui kit (see below)
│       ├── src/
│       │   ├── components/ui/  #   shadcn components (button, ...)
│       │   ├── lib/utils.ts    #   cn()
│       │   ├── hooks/          #   shared hooks
│       │   └── styles/globals.css  # SINGLE source of truth for theming
│       └── components.json     #   shadcn CLI config (aliases → @notils/ui, base UI)
├── biome.json                  # root Biome (extends @notils/config/biome.json)
├── turbo.json                  # Turborepo pipeline
└── package.json                # workspaces (apps/*, packages/*) + root scripts
```

## Non-negotiable setup decisions (do NOT revert without strong reason)

1. **Package manager is Bun** (`devEngines.packageManager: bun`). Use `bun`, `bun add`, `bunx` — never npm/pnpm/yarn in this repo. Bun installs deps **per-package** (into `packages/<pkg>/node_modules`), not hoisted, and symlinks workspace packages into the root `node_modules/@notils/`.
2. **Linting/formatting is Biome, NOT ESLint/Prettier.** Config in `@notils/config/biome.json`; root `biome.json` extends it. Run `bun run lint` / `bun run lint:fix` (Biome via Turbo). Biome sorts imports on save/format — expect import reordering, don't fight it.
3. **shadcn lives in a shared `packages/ui` workspace (`@notils/ui`), never per-app.** One design system, one place to add/update components. See "The @notils/ui package" below.
4. **We did NOT use `shadcn init --monorepo`.** That flag scaffolds shadcn's *own* opinionated monorepo (its own app/tsconfig/tailwind wiring) and fights our config. It's for greenfield only. We wire shadcn manually into `packages/ui` so it respects our setup — the same pattern shadcn's monorepo output uses underneath.
5. **Base UI is the component base, not Radix.** `components.json` `style: "base-nova"` → `shadcn info` reports `base: "base"`. Components import from `@base-ui/react/*`. We migrated off the unified `radix-ui` package (see "Base UI vs Radix").
6. **Tailwind v4, CSS-first (no `tailwind.config.js`).** Theme tokens + `@theme inline` + `.dark` class variant all live in `packages/ui/src/styles/globals.css`.

## The `@notils/ui` package — the shared design system

- **Exports map** (`package.json`): `./globals.css`, `./components/*` → `src/components/*.tsx`, `./lib/*` → `src/lib/*.ts`, `./hooks/*` → `src/hooks/*.ts`. Apps and the package itself import by subpath.
- **Imports inside the package** use the package's own name: `import { cn } from "@notils/ui/lib/utils"`. This matches what the shadcn CLI writes (aliases in `components.json` point at `@notils/ui/*`), so generated components need no import rewrites.
- **App imports**: `import { Button } from "@notils/ui/components/ui/button"` (app code uses `@/*` for its own `src`).
- **RN-family / react deps are `peerDependencies`** on the package (react, react-dom) — the app provides the single runtime. Runtime UI deps (`class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `@base-ui/react`) are regular `dependencies`.
- **No barrel file.** One component = one import path (`@notils/ui/components/ui/button`), never a re-exporting `index.ts`. Keeps app bundles from pulling the whole component graph.

### Adding & updating components — via the LOCAL CLI, from `packages/ui`

The shadcn CLI is a **devDependency of `@notils/ui`**, run through package scripts — NOT `bunx shadcn@latest`. `bunx @latest` re-downloads the 300-package CLI on every run (slow, and the user flagged it); the local binary runs instantly.

```bash
cd packages/ui
bun run ui:add dialog                 # → shadcn add dialog
bun run ui:diff button.tsx            # → shadcn add --diff button.tsx (preview upstream vs local)
bun run ui:add button --overwrite     # update in place (review git diff after)
bun run ui:update add button --dry-run  # → shadcn@latest ... (occasional re-check vs newest CLI)
```

Because shadcn writes source into the repo, **add and update are the same command** — there is no package to bump; updating is a git diff. After adding, read the generated file and verify it (see the `shadcn` skill).

**Keeping zero drift with upstream:** components are re-synced to the canonical `base-nova` source, so `bun run ui:diff <file>` reports "No changes". If you hand-edit a component, that's fine — the diff just shows your local changes. The canonical `base-nova` button uses semantic tokens (`bg-primary`, `color-mix(...)`, `rounded-[min(var(--radius-md),…)]`) that work with our `globals.css` — do NOT confuse it with the `cn-button-*` registry variant (a different base style we don't use).

After adding, **read the generated file and verify it** (correct sub-components, correct icon library, our token-based classes) — see the bundled `shadcn` skill's Critical Rules. The `shadcn` skill (in `.agents/skills/shadcn`, symlinked into `.claude/skills`) auto-loads whenever a `components.json` is present; follow its composition/styling rules.

## Theming — `packages/ui/src/styles/globals.css` is canonical

Tailwind v4 CSS-first. Structure: `@import "tailwindcss"` → `@source` → `@custom-variant dark` → `:root`/`.dark` tokens → `@theme inline` → `@layer base`.

- **Dark mode is class-based** (`.dark` on the root), via `@custom-variant dark (&:is(.dark *))` — NOT `@media (prefers-color-scheme)`. shadcn/Base UI components rely on `dark:` utilities resolving against the `.dark` class. To add a runtime toggle, wire `next-themes` (`<ThemeProvider attribute="class">`).
- **Colors are OKLCH** semantic tokens (`--primary`, `--muted-foreground`, …), mirrored into Tailwind utilities via `@theme inline` (`--color-primary: var(--primary)`).
- **`@source` must reach workspace packages.** The package stylesheet scans its own `src` (`@source "../**/*.{ts,tsx}"`); a consuming app adds `@source "../"` in its own `globals.css` for its files. Workspace packages are symlinked, so without `@source` Tailwind purges classes used only in `@notils/ui`.
- **App CSS composes, not duplicates:** `apps/app/src/app/globals.css` does `@import "@notils/ui/globals.css"` + its own `@source` + font `@theme inline`. Never redefine the full token palette in the app.

### Per-app themes (multiple apps, multiple brands)
The package ships one **neutral base palette**. An app that wants its own brand overrides individual tokens **after** the import — the base defines the shape (radius scale, token names, dark-mode wiring), the app tweaks values:
```css
@import "@notils/ui/globals.css";
@source "../";
:root { --primary: oklch(0.55 0.2 260); --radius: 0.5rem; }
.dark  { --primary: oklch(0.7 0.18 260); }
```
This is the chosen pattern (base tokens + per-app override). Do NOT fork `globals.css` per app or redefine every token — override only what differs.

### Use semantic tokens, never raw colors
`bg-primary`, `text-muted-foreground`, `border` — never `bg-blue-500` or hand-rolled `dark:` color overrides. Changing a token in `globals.css` restyles every component. (This is also a hard rule in the `shadcn` skill.)

### PostCSS is per-app and NOT shared — deliberate
Each app has its own tiny `postcss.config.mjs` that registers `@tailwindcss/postcss`. Do NOT try to move it into `@notils/ui` and "extend" it: in Tailwind v4 the PostCSS config only loads the plugin (there is no shared config to inherit — the actual Tailwind config is CSS-first in `globals.css`), and the bundler resolves `postcss.config.*` relative to each app. Sharing 4 lines of plugin registration adds indirection for no gain. The thing worth sharing — the theme — is already shared via the `@import "@notils/ui/globals.css"`. (Contrast with tsconfig/biome, which DO have real shared rules and live in `@notils/config`.)

### Icon library is swappable
Default is **lucide** (`iconLibrary: "lucide"` in `components.json`) — shadcn's default. A dev can switch: change `iconLibrary` (e.g. `tabler`, `hugeicons`), `bun add` that library, and the CLI generates components against it. One config line; no lock-in. (Future: a `--icons` CLI scaffold prompt.)

## Base UI vs Radix — why we're on Base UI

shadcn offers two component bases: **Base UI** (`@base-ui/react`) and Radix (the unified `radix-ui` package). **We chose Base UI** — shadcn's forward default. The move off Radix was a one-time migration done via shadcn's `migrate-radix-to-base` skill; that skill is NOT kept in the repo (it's re-fetchable via `bunx skills add shadcn/ui` if ever needed again). Note:

- The unified `radix-ui` package is **current and supported** (NOT deprecated — that was the *individual* `@radix-ui/react-*` packages). Base UI is a direction choice, not a deprecation fix.
- **API difference that bites:** Radix composes via `asChild` + a child element; Base UI composes via a **`render` prop**. When rendering a non-`<button>` (e.g. an `<a>`), Base UI's `Button` also needs **`nativeButton={false}`**:
  ```tsx
  // Base UI (this repo)
  <Button nativeButton={false} render={<a href="/docs" />}>Docs</Button>
  // Radix (NOT used here)
  <Button asChild><a href="/docs">Docs</a></Button>
  ```
- Components are **re-synced to the canonical `base-nova` source**, so `bun run ui:diff <file>` shows "No changes" until you hand-edit. `button.tsx` imports `Button as ButtonPrimitive` from `@base-ui/react/button` and uses the canonical semantic-token variants (`bg-primary`, `color-mix(...)`, `rounded-[min(var(--radius-md),…)]`) — which resolve against our `globals.css`. Do NOT confuse this with the `cn-button-*` registry variant (a different base style we don't use).
- The `base` is stored in `components.json` as `style: "base-<preset>"` (e.g. `base-nova`), **not** a writable `"base"` key — hand-writing `"base": "base"` fails schema validation. `shadcn info --json` *derives* the `base` field from the style.

## Dependency management

- **Never hand-pin versions in package.json.** Install the latest via CLI and let it write the version: `bun add <pkg>` for runtime deps, `bun run ui:add <c>` (local shadcn CLI) for components. Manually typing `"lucide-react": "^0.475.0"` is how packages go stale. Only pin when there's a *verified* dependency conflict, and comment why.
- shadcn CLI installs component deps itself; don't pre-add them.
- After any dep change, run `bun install` at the root and re-typecheck.

## Conventions

- **File naming:** components/files kebab-case (`button.tsx`, `alert-dialog.tsx`). Exported React components PascalCase; hooks `useXxx`.
- **Styling:** Tailwind classes via `className`, composed with `cn()`. `className` is for layout, not for overriding component colors/typography. Prefer built-in variants (`variant="outline"`, `size="sm"`) over custom classes. `gap-*` not `space-*`; `size-*` when w == h.
- **Package names:** internal packages are scoped `@notils/*`.
- **TypeScript:** `strict`, `moduleResolution: bundler`, `erasableSyntaxOnly`. Shared configs in `@notils/config` (`tsconfig.base.json`, `tsconfig.nextjs.json`, `tsconfig.react.json`). Avoid `baseUrl` (deprecated in TS7 — use relative `paths`).
- **This is NOT the Next.js you know** (see root `AGENTS.md`): Next 16 has breaking changes. Read the relevant guide in `node_modules/next/dist/docs/` before writing Next-specific code, if present.

## Frontend / design rules

Aim for a polished, production-looking default — not a toy demo.

1. **Compose shadcn primitives; don't hand-roll markup.** Forms = `FieldGroup`/`Field`; callouts = `Alert`; empty states = `Empty`; loading = `Skeleton`/`Spinner`; toasts = `sonner`; separators = `Separator`; badges = `Badge`. Check the `shadcn` skill's Component Selection table before writing a styled `div`.
2. **Semantic color tokens only** (see Theming). Both light and dark must look intentional — test with `.dark` on the root.
3. **Accessibility is not optional.** Dialog/Sheet/Drawer need a Title (`sr-only` if visually hidden); Avatar needs `AvatarFallback`; interactive elements are real controls or have proper roles. Respect focus rings (`focus-visible:ring-*` already in variants) — don't strip them.
4. **Icons via lucide** (`iconLibrary: lucide`). In buttons use `data-icon`; don't add sizing classes to icons inside components (the component handles sizing).
5. **Responsive + mobile-first.** Layout with flex/grid + `gap`; wide content (tables, code) scrolls in its own container so the page body never scrolls horizontally.
6. **Consistency over novelty.** Reuse spacing/radius/variant scales already defined; a new one-off style should be rare and justified.

## Verifying changes

- `bun run typecheck` (Turbo, all packages) — catches import/resolution and type errors including the Base UI `render`/`nativeButton` API.
- `bun run lint` (Biome via Turbo). Use `bun run lint:fix` to auto-fix + sort imports.
- `bun run build` — the real check: full Next production build compiles the bundle and static pages. Run it after any change to `@notils/ui`, theming, or the Base UI wiring; a typecheck alone won't catch a Tailwind `@source`/CSS-compile problem.
- After config/CSS/base changes, prefer a clean build over trusting Turbo cache.

## Skills layout — `.agents` vs `.claude`, and the two project skills

- **`.agents/skills/`** is the canonical, **tool-agnostic** home for skills — real files, usable by any agent (Claude Code, Codex, Gemini CLI, Copilot, …). All skills live here and this is what git tracks.
- **`.claude/skills/`** contains **junctions** back into `.agents/skills/` (Claude Code's discovery path). Git cannot represent Windows junctions — it would double-track every file — so **`.claude/skills/` is gitignored**; the junctions are a local convenience regenerated per machine. Create one with `cmd /c mklink /J .claude\skills\<name> .agents\skills\<name>` (plain symlinks need admin).
- **`skills-lock.json`** is the installed-skills lockfile (source repo, path, content hash) for skills fetched via `bunx skills add …` — currently just `shadcn`. Don't hand-edit except to drop a removed skill's entry.

### Two project skills — keep them distinct
- **`notils-project`** (THIS skill) — the **internal dev guide** for building create-notils itself: setup decisions, CLI/scaffold roadmap, "this repo" specifics. It is NOT shipped to scaffolded apps.
- **`app-guide`** — the **client skill shipped to the generated app**. It documents the *generated project's* conventions for end users (using the ui kit, theming, adding components, structure) and deliberately says nothing about create-notils internals, the scaffold CLI, or repo development. When you change a convention that affects generated projects (Base UI usage, theming, ui-package workflow), update **both** skills. When you change something internal-only (CLI, release process), update only `notils-project`.

## Monorepo vs standalone — one source, two shapes (authoring rule)

The CLI will offer two output shapes: **monorepo** (apps/* + packages/*) and **standalone** (a single Next project where the packages are folded into the app's `src/`). Full spec: [`docs/cli-monorepo-vs-standalone.md`](../../../docs/cli-monorepo-vs-standalone.md).

**The decision:** the monorepo IS the single source. Standalone is *derived* by a deterministic **flatten transform** (move `packages/ui/src/*` → `src/`, inline config, rewrite `@notils/*` specifiers → `@/*`, merge the three package.json into one, emit `components.json` with `@/*` aliases). We author only the monorepo; standalone is computed, never stored. No duplicated source, no second set of boundary files.

**What this constrains RIGHT NOW, while building the template:**
- **Keep the cross-package boundary tiny and regular.** Only ever cross packages via the enumerated specifier kinds (see the boundary map in the doc): `@notils/ui/{components,lib,hooks}/*`, `@notils/ui/globals.css`, `@notils/config/*`, and `workspace:*` deps. If you add a NEW shared surface, add it to `@notils/ui`'s `exports` AND to the boundary map — never invent a new import shape the transform can't rewrite.
- **Imports must be literal** (`import { cn } from "@notils/ui/lib/utils"`) so the specifier-aware rewrite catches them. Never build the `@notils/ui` string dynamically.
- **`components.json` is variant-templated** — its `aliases`/`css` path differ per shape; `style`/`base`/`iconLibrary` are shared.
- **Theme stays CSS-first + token-based**, so flatten can merge the two `globals.css` files by concatenation + `@source` fixup, not a semantic merge.
- The safety net is a **golden build test**: CI scaffolds both variants, runs `bun install && bun run build`, and greps standalone output for any surviving `@notils/` specifier (fails if found).

## Roadmap — PLANNED, NOT YET BUILT

Do not assume these files/APIs exist; if asked to use them, build them first or confirm scope.

- **`packages/auth`** — Better Auth server config + client + Better Auth UI, depending on `packages/db`. Auth pages (`/login`, `/register`) live in `apps/app` and consume `@notils/ui` primitives (keep UI and auth decoupled). Auth enabled by default is a stated goal.
- **`packages/db`** — PostgreSQL + Drizzle ORM.
- **Docker** config, env-var setup, CI/CD workflows.
- **The `create-notils` CLI itself** (`packages/create-notils`) — scaffolds this template in **monorepo** or **standalone** shape (flatten transform + `--type` prompt + golden build test); this is where rnstack merges in. See the CLI architecture doc above.

When implementing roadmap items, follow the conventions above and refresh THIS skill so it stays the accurate source of truth.
