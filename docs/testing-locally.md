# Testing create-notils locally

How to run and verify the `create-notils` CLI from source before publishing. The
CLI lives in [`packages/create-notils`](../packages/create-notils).

## How the CLI finds its template

The CLI does **not** bundle the template. It fetches this repository with
[`tiged`](https://github.com/tiged/tiged) at a pinned ref, then transforms the
result. The ref is controlled by an env var:

```ts
// packages/create-notils/src/scaffold.ts
export const TEMPLATE_REPOSITORY = "notils/create-notils";
export const TEMPLATE_REF = process.env.NOTILS_TEMPLATE_REF ?? "main";
```

So local testing has two independent halves:

1. **CLI logic** — the code in `src/` (parsing, prompts, flatten, metadata…). You
   run this from your working tree.
2. **Template content** — what `tiged` fetches from GitHub. `tiged` reads a
   **pushed** git ref, never your uncommitted working tree.

> ⚠️ **The template is fetched from GitHub, not your local files.** If you change
> a template file (e.g. `packages/ui`, `apps/app`) you must **commit and push**
> it, then point `NOTILS_TEMPLATE_REF` at that branch — otherwise the CLI
> scaffolds the old pushed content. CLI `src/` changes, by contrast, take effect
> as soon as you rebuild.

## 1. Build the CLI

```sh
cd packages/create-notils
bun run build          # one-off
# or
bun run dev            # rebuild on change (tsup --watch)
```

This emits `dist/index.js` (with a `#!/usr/bin/env node` shebang).

## 2. Run it against a scratch directory

The most direct loop — no linking, no publishing:

```sh
cd /tmp                 # any throwaway dir
node /path/to/create-notils/packages/create-notils/dist/index.js my-app \
  --type standalone --pm bun --no-install --no-git -y
```

Use `--no-install --no-git` for fast iteration, then drop them for a full run.
`-y` accepts defaults so it works without a TTY.

### Test template changes from a branch

If you're editing template files (not just CLI code), push a branch and point the
CLI at it:

```sh
git push origin my-template-branch
NOTILS_TEMPLATE_REF=my-template-branch \
  node .../dist/index.js my-app --type standalone -y
```

### Test a UI-package change directly in the monorepo (fastest inner loop)

Before it ever goes through the CLI, verify a change to `packages/ui` (a new
component, a theme, a hook) inside this repo's own `apps/app`, which consumes
`@notils/ui` as a workspace package:

1. If you added a new export directory (e.g. `src/theme`), add it to the ui
   package's `exports` map (`packages/ui/package.json`) so apps can import it:
   ```jsonc
   "exports": {
     "./theme/*": "./src/theme/*.tsx"
   }
   ```
2. Any new runtime dependency (e.g. `next-themes`) must be a `dependencies`
   entry of `packages/ui` (`bun add next-themes` from `packages/ui`).
3. Inside the package, import via the package's own name, **not** `@/…` — the
   ui package only defines the `@notils/ui/*` alias:
   ```tsx
   import { Button } from "@notils/ui/components/ui/button";   // correct
   import { Button } from "@/components";                       // WRONG (no @/ alias here)
   ```
4. Use it from `apps/app` and run the real checks:
   ```sh
   bun run typecheck     # all workspaces
   bun run build         # catches CSS/@source and client/"use client" issues a typecheck misses
   ```

Only once it works in the monorepo does it matter that the CLI ships it — the
standalone flatten then rewrites `@notils/ui/theme/*` → `@/theme/*` automatically.

## 3. Test as an installed binary (`bun link`)

To exercise the real `create-notils <name>` command resolution:

```sh
cd packages/create-notils
bun run build
bun link                       # registers the bin globally
cd /tmp
bun link create-notils         # installs it into THIS dir's node_modules
bunx create-notils my-app --type monorepo --apps web -y
```

`bun link create-notils` does not put the binary on your global PATH — it
adds a `create-notils` shim under this directory's `node_modules/.bin`. Run it
via `bunx` (or `./node_modules/.bin/create-notils` directly); a bare
`create-notils` will not resolve, especially in PowerShell.

Unlink when done: `bun unlink` (in the package dir).

> ⚠️ **Must run from truly outside the repo, not a subfolder of it (e.g.
> `temp/`).** The workspace root `package.json` is itself named
> `create-notils`. If you `bun link create-notils` from any directory that
> still has this repo's root `package.json` as an ancestor (bun walks up
> looking for one), bun resolves that name to the workspace root itself and
> fails with `DependencyLoop`. Use a folder with no ancestor `package.json`
> from this repo — e.g. `$env:TEMP` (Windows) or `~/scratch`, not
> `create-notils/temp`.

## 4. Test the exact npm tarball (`npm pack`)

This is the closest thing to what users get from the registry — it respects the
`files` allowlist and `bin` mapping:

```sh
cd packages/create-notils
bun run build
npm pack                       # produces create-notils-<version>.tgz
cd /tmp
npm install -g ./create-notils-<version>.tgz   # or: npx ./...tgz my-app
create-notils my-app -y
```

Inspect what would ship **without** installing:

```sh
npm pack --dry-run             # lists every file included in the tarball
```

Make sure only `dist/` (and `package.json` / `README.md` / `CHANGELOG.md`) are
listed — never `src/`, tests, or scratch files.

## 5. Verify a scaffolded project actually works

Scaffolding "succeeding" isn't enough — the output must install and build. For
each shape:

```sh
cd my-app
bun install
bun run typecheck
bun run build                  # the real check: catches Tailwind @source / CSS issues a typecheck misses
```

For **standalone**, also confirm the flatten was clean:

```sh
# No workspace/monorepo references should survive:
grep -rn "@notils/" src *.json --include="*.ts" --include="*.tsx" --include="*.css" | grep -v node_modules
# (a leftover in a code comment is cosmetic; a leftover in an import or dep is a bug)

# shadcn should resolve to the local @/ aliases:
bunx shadcn@latest add badge --dry-run --yes   # → src/components/ui/badge.tsx
```

## 6. View it running in a browser

The checks in step 5 (typecheck, build) confirm correctness but not what the
app actually looks like. To see it for real:

```sh
cd my-app                     # the directory you scaffolded in step 2
bun install                   # skip if step 5 already ran it
bun dev
```

- **Standalone**: opens on http://localhost:3000.
- **Monorepo**: `bun dev` runs `turbo run dev`, which starts every app under
  `apps/*` in parallel on sequential ports — the first app (e.g. `web`) on
  3000, the next (e.g. `admin`) on 3001, and so on. The terminal output shows
  each app's URL; you can also check `apps/<name>/package.json`'s `dev`
  script for its exact `--port`.

Visit the printed URL(s) and confirm the starter homepage renders with no
console errors. Ctrl+C stops the dev server(s).

## Quick end-to-end checklist

- [ ] `bun run build` succeeds in `packages/create-notils`
- [ ] `--help` and `--version` print correctly
- [ ] Monorepo scaffold: `apps/*` + `packages/*` + `turbo.json` present, installs + builds
- [ ] Standalone scaffold: `src/{app,components/ui,lib}`, no `apps/`/`packages/`/`turbo.json`, installs + builds
- [ ] No `@notils/` in standalone imports or dependencies
- [ ] `npm pack --dry-run` ships only `dist/` + metadata
- [ ] `bun dev` starts and the homepage renders in the browser with no console errors

## Publishing to npm

The package publishes only `dist/` + `package.json` + `README.md` +
`CHANGELOG.md` (the `files` allowlist), is marked `publishConfig.access:
public`, and rebuilds via `prepublishOnly`.

```sh
cd packages/create-notils
npm publish
```

> ⚠️ **devEngines gotcha.** The repo root pins `devEngines.packageManager: bun`,
> so running **npm** anywhere in the workspace (including `npm publish` /
> `npm pack`) fails with `EBADDEVENGINES`. Two ways around it:
>
> - Publish from an isolated copy of the built package (no parent
>   `package.json`), or
> - Bypass the check for that one command:
>   `npm publish --no-devEngines` is **not** a real flag — instead set
>   `npm_config_engine_strict` is also insufficient; the reliable route is to
>   run `npm pack` in an isolated dir (see below) and `npm publish <tarball>`.
>
> Isolated publish (works around the workspace root):
> ```sh
> cd packages/create-notils && bun run build
> tmp=$(mktemp -d) && cp -r package.json README.md CHANGELOG.md dist "$tmp"/ && cd "$tmp"
> npm pack                       # sanity-check contents
> npm publish ./create-notils-*.tgz
> ```

Before any publish, bump the version and cut a matching **template tag** so the
published CLI's `TEMPLATE_REF` points at a frozen template snapshot (not `main`):

1. Bump `version` in `packages/create-notils/package.json`.
2. Set `TEMPLATE_REF` in `src/scaffold.ts` to the tag you're about to push (e.g. `v0.1.0`).
3. `git tag v0.1.0 && git push --tags`.
4. Build + publish as above.

## Notes

- `NOTILS_TEMPLATE_REF` accepts any git ref tiged understands (branch, tag, or
  commit SHA). Released CLI versions pin a tag; `main` is the default for local runs.
- The CLI runs `git` **without a shell** (so a spaced commit message survives on
  Windows) and only uses a shell for the package-manager install on Windows.
