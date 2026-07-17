# CLI architecture: monorepo vs standalone (one source, two shapes)

Status: **design / spec** (the `create-notils` CLI is not built yet). This document is the contract the CLI must implement.

## Goal

`create-notils` offers the user two project shapes:

- **Monorepo** — Turborepo with `apps/app` + `packages/ui` + `packages/config`. For large apps, multiple apps, shared packages.
- **Standalone** — a single Next.js project where the UI kit and config are folded into the app's own `src/`. For landing pages, SaaS MVPs, AI apps, admin dashboards.

Hard constraint: **write once, emit both.** No duplicated component/theme source, and no second copy of the boundary files (package.json / tsconfig / components.json) to hand-maintain.

## Strategy: the monorepo IS the single source; standalone is derived

The monorepo layout is a superset. A standalone project is a **projection** of it where `packages/*` collapse into the app. So the CLI:

- **Monorepo mode:** copy the template verbatim.
- **Standalone mode:** copy, then run a deterministic **flatten transform**.

We author only the monorepo. Standalone output is computed, never stored. (Chosen over a `core/` + two-shells layout because that still duplicates the boundary files and still needs the same import rewrite — it moves the cost without removing it.)

Why this is safe and not an open-ended guess: **the cross-package boundary is tiny and fully enumerable.** Every reference that differs between shapes is one of a handful of known kinds (below). The transform is a bounded, testable rewrite — not text munging.

## The boundary map (complete as of this writing)

Every cross-package reference in the repo, and its standalone form. If a NEW kind of reference is introduced, it must be added here and to the transform, or standalone breaks.

| # | Where | Monorepo | Standalone |
|---|-------|----------|------------|
| 1 | `apps/app/package.json` deps | `"@notils/ui": "workspace:*"` | removed (ui deps merged into app) |
| 2 | `apps/app/package.json` devDeps | `"@notils/config": "workspace:*"` | removed (config inlined) |
| 3 | `apps/app/src/app/globals.css` | `@import "@notils/ui/globals.css";` | replaced by the ui package's globals content, inlined |
| 4 | `apps/app/src/app/globals.css` | `@source "../";` | `@source "./";` covering the merged `src/` |
| 5 | `apps/app/src/app/page.tsx` (+ any app source) | `import … from "@notils/ui/components/ui/button"` | `… from "@/components/ui/button"` |
| 6 | `apps/app/tsconfig.json` | `"extends": "@notils/config/tsconfig.nextjs.json"` | config inlined into `./tsconfig.json` |
| 7 | `packages/ui/components.json` | aliases `@notils/ui/components`, `…/ui`, `…/lib`, `…/hooks` | `@/components`, `@/components/ui`, `@/lib/utils`, `@/lib`, `@/hooks` |
| 8 | `packages/ui/package.json` devDeps | `"@notils/config": "workspace:*"` | n/a (package removed) |
| 9 | `packages/ui/src/components/ui/button.tsx` (+ every component) | `import { cn } from "@notils/ui/lib/utils"` | `import { cn } from "@/lib/utils"` |
| 10 | `packages/ui/tsconfig.json` | `extends @notils/config/tsconfig.react.json`; `paths: { "@notils/ui/*": ["./src/*"] }` | folded into app tsconfig; `paths: { "@/*": ["./src/*"] }` |
| 11 | `packages/ui/src/styles/globals.css` | `@source "../**/*.{ts,tsx}"` | merged into app globals; `@source "./"` over `src/` |
| 12 | root `package.json` | `workspaces: ["apps/*","packages/*"]` + `@notils/config` devDep | no workspaces; single project (this becomes the only package.json) |
| 13 | `turbo.json` | present | dropped (no Turbo for a single project) |

Note the shape of it: **component/CSS/util *source* is identical in both** — only the import specifier changes (rows 5, 9). Everything else is boundary plumbing (package.json, tsconfig, components.json, css entry). That is the whole reason this works.

## The flatten transform (standalone)

Deterministic steps, in order:

```
# 1. Move UI kit source into the app's src
packages/ui/src/components/*   →  src/components/*
packages/ui/src/lib/*          →  src/lib/*
packages/ui/src/hooks/*        →  src/hooks/*

# 2. Merge the theme. The app's globals.css @imports the ui globals; in standalone
#    the ui globals content becomes the app globals (drop the @import), and @source
#    lines collapse to cover the single src/ tree.
packages/ui/src/styles/globals.css  ⊕  apps/app/src/app/globals.css  →  src/app/globals.css

# 3. Rewrite import specifiers (specifier-aware, NOT blind find-replace):
#    - ES imports and CSS @import statements only; never comments/README/strings.
@notils/ui/components/*  →  @/components/*
@notils/ui/lib/*         →  @/lib/*
@notils/ui/hooks/*       →  @/hooks/*
@notils/ui/globals.css   →  (handled by step 2; import removed)

# 4. Inline config (packages/config → the single project)
#    tsconfig.nextjs.json (which extends tsconfig.base.json) resolved & inlined
#    into ./tsconfig.json, with paths: { "@/*": ["./src/*"] }.
#    biome.json: extends removed; @notils/config rules inlined into ./biome.json.

# 5. Emit components.json with standalone aliases (row 7) and css: "src/app/globals.css".
#    Base UI style/base/iconLibrary are unchanged — shadcn add works natively.

# 6. Merge package.json:
#    deps  = app.deps ∪ ui.deps  (minus @notils/* and workspace:* entries)
#    devDeps = app.devDeps ∪ ui.devDeps ∪ config-provided devDeps (biome, etc.)
#    name = <project-name>; keep scripts (dev/build/start/typecheck),
#    ignoreScripts/trustedDependencies. This is the ONLY package.json.

# 7. Drop monorepo-only artifacts: turbo.json, workspaces field, packages/ dir,
#    root package.json (its role merges into the single project package.json).
```

Result: `src/{app,components/ui,lib,hooks,styles}`, one `package.json`, one `tsconfig.json`, one `biome.json`, one `components.json` — the exact layout `shadcn init` produces for a single Next app. A dev cloning it sees a normal Next project; `bun run ui:add`/`shadcn add` writes to `@/components/ui` and just works.

## Non-negotiable: the golden build test

The transform's risk is a *new, unmapped* boundary reference slipping through. Convert that risk into a failing test:

1. In CI, scaffold **both** variants into temp dirs.
2. Run `bun install && bun run build` (and `typecheck`) on each. Both must pass.
3. **Grep the emitted standalone output for any surviving `@notils/` specifier — fail if found.** This catches an unmapped reference the moment it appears.

Without this test, "the transform might miss something" is a latent bug. With it, it's a CI failure.

## Consequences for how we author the template

- **Keep the boundary regular.** Only ever cross packages via the specifier kinds in the map. If you need a new shared surface, add it to `@notils/ui`'s `exports` and to the boundary map — don't invent a new import shape the transform won't know.
- **Never hardcode `@notils/ui` in a way the rewrite can't see** (e.g. building the string dynamically). Imports must be literal so the specifier-aware rewrite catches them.
- **components.json is a templated file**, not a fixed one — its `aliases` and `css` path are variant-dependent. The `style`/`base`/`iconLibrary` are shared.
- **Theme stays token-based and CSS-first**, so merging two `globals.css` files is concatenation + `@source` fixup, not a semantic merge.

## Future: "graduate standalone → monorepo"

Because standalone is a *projection*, the reverse (extracting `src/components/ui` back into `packages/ui`) is also mechanical. Not a v1 feature, but the boundary map makes it feasible later.
