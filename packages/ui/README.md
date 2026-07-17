# @notils/ui

The shared UI kit for the create-notils monorepo — [shadcn/ui](https://ui.shadcn.com/) components on [Base UI](https://base-ui.com/), plus the Tailwind v4 theme every app inherits.

shadcn lives here (never per-app) so there's **one design system and one place to add or update components**. Every app imports from this package.

## What's inside

```
src/
├── components/ui/   # shadcn components (button, ...)
├── lib/utils.ts     # cn() — clsx + tailwind-merge
├── hooks/           # shared hooks
└── styles/globals.css  # the canonical theme (tokens + @theme inline + dark mode)
```

`components.json` configures the shadcn CLI to write into this package using the `@notils/ui/*` aliases, on the `base-nova` style (Base UI base).

## Using components in an app

```tsx
import { Button } from "@notils/ui/components/ui/button";
```

One component = one import path. There is **no barrel file** — import each component by its own path so app bundles don't pull the whole component graph.

Base UI composition uses the `render` prop (not Radix's `asChild`); when rendering a non-`<button>`, pass `nativeButton={false}`:

```tsx
<Button nativeButton={false} render={<a href="/docs" />}>Docs</Button>
```

## Theming

`src/styles/globals.css` is the **single source of truth** for the palette. Apps pull it in from their own `globals.css`:

```css
@import "@notils/ui/globals.css";
@source "../"; /* scan this app's own source for class names */
```

- **CSS-first Tailwind v4** — no `tailwind.config.js`. Tokens live in `:root`/`.dark` and are mapped to utilities in `@theme inline`.
- **Semantic OKLCH tokens** — `--primary`, `--muted-foreground`, `--radius`, etc. Use `bg-primary`, `text-muted-foreground` in components; never raw colors like `bg-blue-500`.
- **Class-based dark mode** — `.dark` on the root (via `@custom-variant dark`), not `prefers-color-scheme`. For a runtime toggle, wire `next-themes` with `attribute="class"`.

### Per-app theme overrides

The package ships a neutral base palette. An app can override any token **after** the import, so multiple apps can each have their own brand while sharing the component shapes:

```css
@import "@notils/ui/globals.css";
@source "../";

:root {
  --primary: oklch(0.55 0.2 260);
  --radius: 0.5rem;
}
.dark {
  --primary: oklch(0.7 0.18 260);
}
```

## Adding & updating components

The shadcn CLI is a **local devDependency**, so it runs instantly (no re-download per run). Run from this package:

```bash
cd packages/ui

# add a component
bun run ui:add dialog          # → shadcn add dialog

# preview an upstream update vs your local copy
bun run ui:diff button.tsx     # → shadcn add --diff button.tsx

# update in place (review the git diff afterward)
bun run ui:add button --overwrite

# occasionally re-check against the newest CLI
bun run ui:update add button --dry-run   # → shadcn@latest ...
```

Because components are source in your repo, **adding and updating are the same command** — there's no package to bump. After adding, read the generated file and verify it (correct sub-components, our semantic tokens, the right icons).

## Icons

The default icon library is **lucide** (`iconLibrary: "lucide"` in `components.json`), matching shadcn's default. To use a different set:

1. Change `iconLibrary` in `components.json` (e.g. `"tabler"`, `"hugeicons"`).
2. Install that library: `bun add <icon-lib>`.
3. New components the CLI generates will use it; update existing imports as needed.

It's one config line — no lock-in.

## Dependencies

Never hand-pin versions here. Install the latest via the CLI (`bun add <pkg>`); the shadcn CLI installs component deps at latest itself. Runtime deps (`@base-ui/react`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`) are regular `dependencies`; `react`/`react-dom` are `peerDependencies` provided by the consuming app.

## Verify

```bash
bun run typecheck   # from this package, or `bun run typecheck` at the root for all
```

The real check for theming/CSS is a full `bun run build` at the repo root — a typecheck alone won't catch a Tailwind `@source` or CSS-compile issue.
