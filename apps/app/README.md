# app

The Next.js 16 application for the create-notils monorepo — App Router, React Compiler, Turbopack, and Tailwind v4 wired to the shared [`@notils/ui`](../../packages/ui) design system.

## Getting Started

From the **repo root** (recommended — Turborepo runs deps in the right order):

```bash
bun run dev --filter=app
```

Or from this directory:

```bash
bun run dev
```

Open [http://localhost:3000](http://localhost:3000).

Edit `src/app/page.tsx` — the page auto-updates.

## Structure

```
src/
└── app/            # App Router routes
    ├── layout.tsx  # root layout (Geist fonts)
    ├── page.tsx    # home page
    └── globals.css # imports @notils/ui/globals.css + app-level @source
```

- **`@/*`** → `./src/*` (app code). **`@notils/ui/...`** → the shared UI kit.
- `next.config.ts` enables the React Compiler (`reactCompiler: true`).
- `postcss.config.mjs` registers the `@tailwindcss/postcss` plugin (Tailwind v4).

## UI & theming

Import components from the shared kit:

```tsx
import { Button } from "@notils/ui/components/ui/button";
```

The theme comes from `@notils/ui`. This app's `globals.css` imports it and scans its own source for class names:

```css
@import "@notils/ui/globals.css";
@source "../";
```

To give this app its own brand while keeping the shared component shapes, override tokens **after** the import:

```css
@import "@notils/ui/globals.css";
@source "../";

:root { --primary: oklch(0.55 0.2 260); }
.dark { --primary: oklch(0.7 0.18 260); }
```

To add or update components, use the CLI from `packages/ui` — see the [`@notils/ui` README](../../packages/ui/README.md). Components are never added directly into this app.

## Scripts

```bash
bun run dev        # dev server on :3000
bun run build      # production build
bun run start      # serve the production build
bun run typecheck  # next typegen && tsc --noEmit
```

Fonts are loaded and optimized via [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) ([Geist](https://vercel.com/font)).

> **Next.js 16 has breaking changes** from earlier versions (see the root `AGENTS.md`). Check the relevant guide in `node_modules/next/dist/docs/` before writing Next-specific code.
