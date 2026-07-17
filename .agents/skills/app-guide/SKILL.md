---
name: app-guide
description: Conventions and architecture for a project scaffolded with create-notils. READ THIS before adding or editing code — especially before touching the shared UI package, components, Tailwind theming, or the monorepo layout. Applies to any work under apps/* or packages/*.
---

# Project guide

This project was scaffolded with **create-notils** — an opinionated, production-first monorepo. The stack is Turborepo + Bun + Next.js 16 (App Router, React Compiler) + Tailwind CSS v4 + shadcn/ui on Base UI + Biome. Everything here is **your code** — edit it freely; there is no vendor lock-in.

This guide is the source of truth for how the project is wired. Follow it so the codebase stays consistent.

## Repository layout

```
.
├── apps/
│   └── app/                    # Next.js 16 app (App Router, Turbopack)
│       └── src/app/            #   routes; globals.css imports the shared theme
├── packages/
│   ├── config/                 # shared tsconfig.* + biome.json
│   └── ui/                     # the shared shadcn/ui kit (components live here)
│       ├── src/
│       │   ├── components/ui/  #   shadcn components (button, ...)
│       │   ├── lib/utils.ts    #   cn()
│       │   ├── hooks/          #   shared hooks
│       │   └── styles/globals.css  # canonical theme (tokens + dark mode)
│       └── components.json     #   shadcn CLI config
├── biome.json                  # extends the shared Biome config
├── turbo.json                  # Turborepo pipeline
└── package.json                # workspaces + root scripts
```

Internal packages are scoped. The shared UI package is imported by its scoped name with a subpath (e.g. `@<scope>/ui/components/ui/button`) — check `package.json` `name` fields for the actual scope in this project. Below, the UI package is referred to as **the ui package**.

## Core conventions

1. **Package manager is Bun.** Use `bun`, `bun add`, `bunx`. All tasks run through Turborepo from the repo root: `bun run dev` / `build` / `typecheck` / `lint` (and `bun run dev --filter=app` to target one workspace).
2. **Linting/formatting is Biome** (not ESLint/Prettier). `bun run lint` / `bun run lint:fix`. Biome sorts imports on format — expect and accept the reordering.
3. **TypeScript is `strict`, `moduleResolution: bundler`.** Shared presets live in the config package; workspaces extend them. Avoid `baseUrl` — use relative `paths`.
4. **File naming is kebab-case** (`alert-dialog.tsx`); exported components are PascalCase; hooks are `useXxx`.
5. **Never hand-pin dependency versions.** Install the latest via CLI (`bun add <pkg>`); the shadcn CLI installs component deps itself. Only pin on a verified conflict.

## UI components — the shared kit

shadcn/ui lives in **one shared ui package**, not per-app, so there is a single design system and one place to add or update components.

- **Import by subpath, one component per path** — e.g. `import { Button } from "@<scope>/ui/components/ui/button"`. There is **no barrel file**; importing per path keeps app bundles small.
- **App code** uses `@/*` for its own `src`; the ui package uses its own scoped name for internal imports (`.../lib/utils`, `.../components/ui/...`).
- **`react`/`react-dom` are peerDependencies** of the ui package — the app provides the single runtime.

### Base UI composition (this project uses Base UI, not Radix)

Components are built on **Base UI** (`@base-ui/react`). Composition uses the **`render` prop**, not Radix's `asChild`. When a component renders a non-`<button>` element (e.g. an `<a>`), also pass **`nativeButton={false}`**:

```tsx
// correct (Base UI)
<Button nativeButton={false} render={<a href="/docs" />}>Docs</Button>

// WRONG — asChild is Radix, not used here
<Button asChild><a href="/docs">Docs</a></Button>
```

The same `render` pattern applies to triggers/close elements on overlays (Dialog, Popover, Tooltip, DropdownMenu, etc.).

### Adding & updating components

The shadcn CLI is installed **locally** in the ui package (runs instantly — do not use `bunx shadcn@latest`, which re-downloads it each time). Run from the ui package:

```bash
cd packages/ui
bun run ui:add dialog                # add a component
bun run ui:diff button.tsx           # preview an upstream update vs your copy
bun run ui:add button --overwrite    # update in place (review the git diff after)
```

Components are source files in your repo, so **adding and updating are the same command** — there is no package to bump. After adding, read the generated file and verify composition, tokens, and icons.

### Icons

Default icon library is **lucide** (`iconLibrary` in `components.json`). To switch: change `iconLibrary` (e.g. `tabler`, `hugeicons`), `bun add` that library, and update imports. One config line — no lock-in.

## Theming

The ui package's `styles/globals.css` is the **single source of truth** for the palette (Tailwind v4, CSS-first — there is no `tailwind.config.js`).

- **Semantic OKLCH tokens** — `--primary`, `--muted-foreground`, `--radius`, etc., mapped to utilities in `@theme inline`. In markup use `bg-primary`, `text-muted-foreground` — **never raw colors** like `bg-blue-500`, and never hand-rolled `dark:` color overrides.
- **Dark mode is class-based** — `.dark` on the root (via `@custom-variant dark`), not `prefers-color-scheme`. For a runtime light/dark toggle, add `next-themes` with `attribute="class"`.
- **Each app imports the shared theme** in its own `globals.css`:
  ```css
  @import "@<scope>/ui/globals.css";
  @source "../";  /* scan this app's own source so its classes aren't purged */
  ```

### Per-app theming (multiple apps or a custom brand)
The shared stylesheet ships a neutral base. To give an app its own brand while keeping the component shapes, override individual tokens **after** the import — don't fork the whole file:

```css
@import "@<scope>/ui/globals.css";
@source "../";

:root { --primary: oklch(0.55 0.2 260); --radius: 0.5rem; }
.dark  { --primary: oklch(0.7 0.18 260); }
```

### PostCSS
Each app has its own small `postcss.config.mjs` that registers `@tailwindcss/postcss`. This is correct — Tailwind v4's real config is CSS-first in `globals.css`, and the bundler resolves the PostCSS config per app. Don't try to centralize it; the thing worth sharing (the theme) already travels via the CSS `@import`.

## Design principles

Aim for a polished, production-looking result — not a toy demo.

1. **Compose the kit's primitives; don't hand-roll markup.** Forms use the form field primitives; callouts use `Alert`; empty states use `Empty`; loading uses `Skeleton`/`Spinner`; toasts use `sonner`; separators use `Separator`; badges use `Badge`.
2. **Semantic color tokens only** (see Theming). Both light and dark must look intentional.
3. **Accessibility is not optional.** Dialog/Sheet/Drawer need a Title (`sr-only` if hidden); Avatar needs a Fallback; keep focus rings intact.
4. **Prefer built-in variants** (`variant="outline"`, `size="sm"`) over custom classes. Layout with flex/grid + `gap-*` (not `space-*`); use `size-*` when width == height.
5. **Responsive, mobile-first.** Wide content (tables, code) scrolls in its own container so the page never scrolls horizontally.

## Verifying changes

- `bun run typecheck` (all workspaces).
- `bun run lint` (Biome). `bun run lint:fix` to auto-fix + sort imports.
- `bun run build` — the real check after any change to the ui package, theming, or Base UI wiring; a typecheck alone won't catch a Tailwind `@source` / CSS-compile issue.

## A note on Next.js 16

This project uses **Next.js 16**, which has breaking changes from earlier versions. If bundled framework docs are present under `node_modules/next/dist/docs/`, read the relevant guide before writing Next-specific code, and heed deprecation notices.
