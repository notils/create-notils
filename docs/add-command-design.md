# The `add` command — `@notils/cli`

How a capability (`ui`, `form-builder`, `auth-custom`, `auth-ui`, …) gets into a
project **after** it was created — whether that project was scaffolded by
`create-notils` or written by someone who has never heard of it.

Status: **BUILT** — `add`, `init`, and `list` all work; see
[`packages/cli`](../packages/cli). This document records the *reasoning*; for
per-item status and what's still open, see [ROADMAP.md](ROADMAP.md).

Two things turned out differently from the design below, both discovered by
running it rather than reading it:

1. **Monorepo targets need a generated `package.json`/`tsconfig.json`.** The
   design said to skip manifests to avoid propagating pinned versions — but a
   workspace package without a manifest simply doesn't resolve, so every
   rewritten import breaks. They're now *rebuilt* instead: structure kept,
   versions dropped.
2. **External dependencies are reported, not merged.** "Merge into the target's
   package.json resolving latest" would mean this CLI choosing version ranges,
   against the never-hand-pin rule. It prints the install command instead.

## The problem

`create-notils` only runs once, at project birth. Two cases it can't serve:

1. **A scaffolded project wants a capability it declined at scaffold time** —
   picked the plain template, now needs auth.
2. **A brownfield project wants one** — a dev with their own existing Next.js
   repo wants the UI kit, or `form-builder`, without rewriting their project
   into our shape.

Case 2 is the more valuable of the two and the harder constraint, so it drives
the design. A tool that only works in our own scaffolds is a scaffolder feature;
a tool that works in *any* Next.js repo is a product.

## The decision: a separate, stateless, published CLI

**`@notils/cli`** — a second published package, run via `bunx`, never installed
into the target project.

```bash
bunx @notils/cli add auth-custom     # in a scaffolded OR brownfield project
bunx @notils/cli add form-builder
bunx @notils/cli list                # what's available, what's already installed
bunx @notils/cli init                # brownfield: detect shape, write notils.json
```

Three properties, each load-bearing:

- **Stateless / not a dependency.** The target project does not depend on
  `@notils/cli`. Nothing to install before the first `add`, nothing to maintain
  afterward, and a fix to `add` reaches every project immediately — including
  ones scaffolded months ago.
- **Remote source of truth.** Package source is fetched from a pinned tag of
  this repo at add-time, exactly as `create-notils` already fetches the
  template. There is no vendored copy in the target project to go stale.
- **Config-driven, config-optional.** `add` reads a small `notils.json` to learn
  where to write. If it's absent (brownfield), it detects the shape and offers
  to write one — it does not fail.

This is deliberately shadcn's model, because shadcn solved this exact problem:
the CLI is remote and stateless, `components.json` records where things go, and
`init` bootstraps that file for a project that doesn't have one. Everything it
writes is the user's source, removable with `rm`.

### Why not the alternatives

- **Vendored into the scaffold** (`packages/notils-cli`, or a `scripts/` dir) —
  each project freezes a copy at scaffold time, so a fix never reaches existing
  projects, and it cannot serve case 2 at all. Rejected.
- **A devDependency** (`@notils/cli` in `devDependencies`) — self-updating, but
  a brownfield dev must `bun add -D` before adding anything, which is a worse
  first touch than `bunx`, and it's an ongoing dependency for a tool run a
  handful of times. Rejected.
- **A subcommand on `create-notils`** — one package and one release pipeline,
  but `create-notils add` reads wrong for an existing project, and npm's
  `create-*` convention is specifically for scaffolders (`npm create foo`).
  Rejected in favor of the clearer split: `create-notils` creates,
  `@notils/cli` maintains.

## `notils.json` — the `components.json` equivalent

Written by `create-notils` at scaffold time, or by `@notils/cli init` in a
brownfield project. Records only what `add` cannot reliably infer:

```json
{
  "$schema": "https://notils.dev/schema.json",
  "shape": "monorepo",
  "scope": "@my-app",
  "paths": {
    "packages": "packages",
    "lib": "src/lib",
    "components": "src/components"
  }
}
```

- **`shape`** — `"monorepo"` or `"standalone"`. Decides whether a package lands
  in `packages/<name>/` or folds into `src/lib/<name>/`.
- **`scope`** — the project's own package scope. A monorepo scaffold renames
  `@notils/*` to `@<project>/*` (see `configureProject` in the CLI), so `add`
  must write imports in the project's scope, not ours.
- **`paths`** — where things go, for a brownfield project whose layout isn't
  ours (`app/` instead of `src/app/`, a different lib dir, …).

**Detection when absent.** `packages/` + `workspaces` in the root
`package.json` → monorepo, scope from the root `name`. Otherwise standalone,
with `paths` probed from `tsconfig.json`'s `paths` aliases and
`components.json` if present. Prompt to confirm and offer to persist it.

## Shape handling: reuse the flatten transform

The monorepo is the single source of truth; standalone is derived. `add`
inherits that rule rather than re-deciding it.

```
fetch packages/<name> from the pinned tag
  ├─ monorepo target   → write to packages/<name>/, rename @notils/ → <scope>/
  └─ standalone target → rewriteSpecifiers + fold into src/lib/<name>/
```

Both branches already exist in
[`packages/create-notils/src/flatten.ts`](../packages/create-notils/src/flatten.ts):
`rewriteLibrarySpecifier` maps `@notils/<lib>/*` → `@/lib/<lib>/*`, and
`rewriteUiSpecifier` maps `@notils/ui/*` → `@/*`. `add` needs the same rewrites
scoped to one package instead of the whole tree.

**This forces a refactor before `add` can be built:** the rewrite helpers
currently live inside the `create-notils` package, private to it. They must move
somewhere both CLIs can consume — a shared internal package
(`packages/transform`), or `@notils/cli` depending on `create-notils`. Prefer
extracting the shared package; a maintenance CLI depending on a scaffolder is
backwards.

Rejected alternative: **a prebuilt registry** (each package pre-rendered per
shape, served as JSON, shadcn-style). Faster at add-time and no transform to
run, but it means maintaining a render/publish pipeline plus two rendered copies
of every package — a second source of truth, which is the thing the flatten
design exists to avoid. Revisit only if add-time transform cost becomes a real
complaint.

## Dependency resolution is mandatory, not a nicety

The packages form a real graph:

```
api-client    → (none)
auth-custom   → api-client
form-builder  → ui
auth-ui       → auth-custom, form-builder, ui
ui            → (none)
config        → (none)
```

So `add auth-ui` must pull `auth-custom`, `api-client`, `form-builder`, and
`ui` — five packages from one command. `add` must therefore:

1. Resolve the transitive closure of internal `@notils/*` deps.
2. Report the full list and confirm before writing (a dev asking for one thing
   should not silently get five).
3. Skip what's already present, and detect a *modified* existing copy rather
   than clobbering it — everything we write is the user's source, and they are
   invited to edit it. Offer a diff, as `ui:diff` already does for components.
4. Merge each package's external deps (`zod`, `react-hook-form`, …) into the
   target's `package.json` without pinning versions — resolve latest, per the
   never-hand-pin rule.

Step 3 is the one that will be tempting to skip and shouldn't be: a dev who
edited `field-renderer.tsx` and then runs `add auth-ui` must not lose that work.

## Brownfield: what we cannot assume

A brownfield project is not our template. Before writing anything, `add` must
check and either adapt or refuse with a clear reason:

- **Tailwind v4 + CSS-first.** Our components use `@theme inline` tokens and
  `@custom-variant dark`. A project on Tailwind v3 with a `tailwind.config.js`
  needs a migration we are not going to perform silently.
- **The theme tokens exist.** Components reference `bg-primary`,
  `text-muted-foreground`, etc. Adding `ui` to a project with no token layer
  produces components that render unstyled. `add ui` must offer to write the
  token block into the project's `globals.css`.
- **Base UI, not Radix.** If the project already has Radix-based shadcn
  components, ours will sit alongside them with a different composition API
  (`render` vs `asChild`). Warn; do not attempt to convert.
- **React 19 / Next 16.** `peerDependencies` on the packages. Check and warn on
  mismatch rather than installing something that won't compile.
- **Biome vs ESLint/Prettier.** Our source is Biome-formatted. Don't impose
  Biome; just note that formatting may differ from the project's.

The honest position: `add` works cleanly in a project matching the template's
foundations, and degrades to "here's what's incompatible" otherwise. Pretending
otherwise produces a broken project and a bad first impression.

## Post-write: sort imports

Every `add` rewrites specifiers, which changes their sort order — the same issue
that made scaffolded projects open with import-sort diagnostics until
`sortImports` was added to `create-notils`. `add` must run the project's own
formatter (`lint:fix`, or `biome check --write` directly) on what it wrote, or
the dev sees lint errors on freshly-added files.

## Open questions

- **`remove`?** shadcn has no `remove` — you delete the files. Ours has the same
  property, except for the merged `package.json` deps and any wiring `add`
  touched. Probably document `rm -rf` + a dep cleanup note rather than build a
  command that has to track what it wrote.
- **Versioning.** `add` fetches from a pinned tag. Which one — the CLI's own
  version, or latest? A project that ran `add ui` six months ago and runs
  `add auth-ui` today would get two different vintages of `ui`. Leaning toward
  pinning to the CLI version and surfacing drift in `list`.
- **Auth config prompting.** `CustomBackendAuthConfig` has no defaults by design
  — every endpoint and schema is caller-supplied. `add auth-custom` could prompt
  for these interactively, or write a heavily-commented stub. The stub is
  probably better; a 12-question prompt to scaffold one file is worse than a
  file with clear TODOs.
