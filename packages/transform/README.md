# @notils/transform

Shared internals for the two CLIs: the internal package graph, the specifier
rewrites that derive a standalone project from the monorepo, and the filesystem
primitives both need. See
[docs/add-command-design.md](../../docs/add-command-design.md) for why the `add`
command needs to share this with the scaffolder.

**Private and never published.** Each CLI inlines it at build time (`noExternal`
in their tsup configs), so a published CLI's `dist/` is self-contained. It's also
in `PATHS_TO_STRIP`, so it never lands in a scaffolded project.

## What's inside

```
src/
├── packages.ts    # INTERNAL_PACKAGES graph, resolveWithDependencies()
├── specifiers.ts  # the @notils/* → @/* rewrites (source, tree, and scope forms)
├── filesystem.ts  # generic fs primitives (copy, read/write JSON, exists)
└── index.ts       # public exports
```

## Why it exists

`create-notils` flattens the *whole* template at scaffold time; `@notils/cli add`
writes *one* package (plus its transitive deps) into an existing project. Both
need the identical transform — if they forked, a standalone project built by
`add` would drift from one built by the scaffolder, which is exactly the
duplication the "monorepo is the single source" rule exists to prevent.

## Adding a new internal package

Add one entry to `INTERNAL_PACKAGES` in [src/packages.ts](src/packages.ts).
Nothing else in either CLI enumerates packages — `LIBRARY_PACKAGE_NAMES` (used by
the specifier rewrite and the scaffold's fold step) is derived from it.

```ts
{
  name: "auth-better-auth",
  description: "Better Auth provider",
  fold: { kind: "lib" },        // → src/lib/auth-better-auth/ in standalone
  dependsOn: ["api-client"],    // resolved transitively by `add`
  addable: true,                // exposed by `@notils/cli list`
}
```

`fold.kind` is `"lib"` for a normal library package, `"spread"` for `ui` (whose
`src/*` spreads across the app's own `src/*`), or `"inlined"` for config packages
that are merged into tsconfig/biome rather than copied.

## Usage

```ts
import { resolveWithDependencies } from "@notils/transform/packages";
import { rewriteSpecifiersInSource, rewriteSpecifiersInTree } from "@notils/transform/specifiers";

// `add auth-ui` → [api-client, auth-custom, ui, form-builder, auth-ui]
// in dependency-first order, so nothing is written before what it imports.
const toInstall = resolveWithDependencies(["auth-ui"]);

// Rewrite for a standalone target.
rewriteSpecifiersInSource('import { Button } from "@notils/ui/components/ui/button";');
// → 'import { Button } from "@/components/ui/button";'

await rewriteSpecifiersInTree("/path/to/src");
```

The rewrite is **specifier-aware**: it only touches quoted module paths in
import/export/require/CSS-`@import` position. Prose that mentions `@notils/ui` in
a doc comment is left alone — the packages' own comments do exactly that, and
rewriting them would be wrong.
