# Testing the CLIs locally

How to run and verify the CLIs from source before publishing. There are two:

- [`packages/create-notils`](../packages/create-notils) — scaffolds a new project
  (`npm create notils@latest`). Most of this document is about this one.
- [`packages/cli`](../packages/cli) — `@notils/cli`, adds capabilities to an
  existing project (`bunx @notils/cli add …`). See
  [add-command-design.md](add-command-design.md); its release rule is below.

Both fetch template content from this repo at a pinned ref and share
[`packages/transform`](../packages/transform), which is **private and never
published** — each CLI inlines it at build time via tsup `noExternal`. After
touching either build config, confirm the bundle is self-contained:

```bash
cd packages/cli && bun run build && grep 'from "@notils' dist/index.js   # must find nothing
```

A match there means the published CLI would die with `ERR_MODULE_NOT_FOUND` on
first run.

## ⚠️ `@notils/cli`'s version IS its template ref

`@notils/cli@X.Y.Z` fetches package source from the git tag `vX.Y.Z`
(`templateRef()` in `packages/cli/src/fetch.ts`). That makes each published
version reproducible — it always writes the same source — and users still get
current source because `bunx` resolves the newest published CLI.

**The cost: publishing `@notils/cli@X.Y.Z` REQUIRES a pushed `vX.Y.Z` tag.**
Without it, every `add` from that version fails at the fetch step with
"could not find commit hash for vX.Y.Z". So when releasing `@notils/cli`:

1. Pick the version, and confirm a matching `vX.Y.Z` tag exists (or will be
   pushed as part of the same release).
2. Verify before publishing: `cd packages/cli && bun run build && node dist/index.js add api-client --dry-run -y`
   in a scratch project. The fetch step is what you're checking.

`create-notils` has the same coupling via its own `TEMPLATE_REF`, but it's a
hand-edited constant there — see "Publishing to npm" below.

## How the CLI finds its template

The CLI does **not** bundle the template. It fetches this repository with
[`tiged`](https://github.com/tiged/tiged) at a pinned ref, then transforms the
result. The ref is controlled by an env var:

```ts
// packages/create-notils/src/scaffold.ts
export const TEMPLATE_REPOSITORY = "notils/create-notils";
export const TEMPLATE_REF = process.env.NOTILS_TEMPLATE_REF ?? "v0.2.0";
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
`CHANGELOG.md` (the `files` allowlist), and is marked
`publishConfig.access: public`.

**Use `bun publish`, directly from `packages/create-notils` — no workaround
needed:**

```sh
cd packages/create-notils
bun publish             # builds (via prepublishOnly), packs, and publishes
# or: bun publish --dry-run   to preview without publishing
```

If the npm account has 2FA/OTP enabled (recommended), `bun publish` prints a
URL to approve the publish in a real browser. That step needs an actual human
in an actual browser — run this command in your own interactive terminal, not
through an agent or a scripted/non-interactive shell.

> ⚠️ **Why not `npm publish`?** The repo root pins
> `devEngines.packageManager: bun`, so **any** npm command — `npm publish`,
> `npm pack`, even `npm whoami` / `npm login` — run from anywhere under this
> repo fails with `EBADDEVENGINES` (npm walks up to the nearest `package.json`
> and enforces the pin). Bun *is* the sanctioned manager here, so
> `bun publish` never hits this. Only reach for npm if bun is genuinely
> unavailable:
> ```sh
> cd packages/create-notils && bun run build
> tmp=$(mktemp -d) && cp -r package.json README.md CHANGELOG.md dist "$tmp"/ && cd "$tmp"
> npm pack                       # sanity-check contents
> npm publish ./create-notils-*.tgz   # NOT bare `npm publish` — see below
> ```
> Publish via the tarball's explicit path, not bare `npm publish`, even from
> this isolated copy — bare `npm publish` still runs `prepublishOnly`
> (`bun run build`), which fails there since the isolated copy has no
> `node_modules` (`tsup` isn't installed). Publishing the already-built
> tarball file skips lifecycle scripts entirely and avoids that.

### Three version numbers, and what each one means

This trips people up, so be precise about which is which:

| number | lives in | changes when |
| --- | --- | --- |
| **template version** | `template-version.json` (repo root) | the *template* changes — app code, packages, the shipped skill |
| `create-notils` version | `packages/create-notils/package.json` | the *scaffolder CLI* changes |
| `@notils/cli` version | `packages/cli/package.json` | the *add/init/list CLI* changes |

**Both CLIs read the template version from that one file** and inline it at build
time. So they always agree on which tag to fetch, while versioning independently
— a CLI with no changes of its own never publishes a no-op release.

> An earlier design derived `@notils/cli`'s ref as `v${cliVersion}`, welding the
> two together. That forced a no-op 0.4.0 of the CLI just because the template
> changed. Don't reintroduce it.

Release steps:

1. Bump `ref` in `template-version.json` to the tag you're about to cut, **if the
   template changed**. If only a CLI changed, leave it alone.
2. Bump `version` in whichever package(s) actually changed. Leave the others.
3. Add a `## X.Y.Z` section to the CHANGELOG of each package you bumped.
4. Commit, then tag with the full release notes, not a one-liner:
   `git tag -a vX.Y.Z -F <notes-file>` — then `git push origin main --tags`.
   **Push the tag before publishing**, or every fetch fails with "could not find
   commit hash". `check:publishable` blocks the publish if the tag is missing or
   unpushed, but pushing first is the habit to keep.
5. Publish only the packages you bumped: `cd packages/<pkg> && bun publish`.
6. Verify against the real tag:
   - `create-notils`: scaffold a test project, confirm the fetch shows
     `notils/create-notils#vX.Y.Z`.
   - `@notils/cli`: in a scratch project, `bunx @notils/cli add api-client -y`,
     then check `notils.json`'s `installed.*.ref` — that is the tag it used.
7. Create the GitHub Release (`gh release create vX.Y.Z --notes-file <notes>`);
   the git tag's annotation is separate from what renders on the Releases page.
8. **Install the published artifacts from npm and run them.** Not optional — see
   below.

### ⚠️ A green local build does not mean a working published package

0.3.0 shipped broken for *both* packages: every install failed with
`GET https://registry.npmjs.org/@notils%2ftransform - 404`, because each manifest
declared the private, never-published `@notils/transform` as a runtime
dependency. Lint, typecheck, `bun run build`, and a grep of `dist/` for unbundled
imports were all green the whole time — the bundle was correct; only the manifest
was wrong. No local check could have caught it, because the failure happens in
*npm's resolver*, not in our code.

`check:publishable` (run from `prepublishOnly`) now blocks that specific cause.
But the general rule is: after publishing, install from the registry in a scratch
directory and actually run it.

```sh
cd $(mktemp -d)
bunx create-notils@X.Y.Z demo --type standalone --pm bun --no-git --no-install -y

# and in a throwaway brownfield project:
bunx @notils/cli@X.Y.Z add form-builder --dry-run -y
```

If either dies at the resolve/fetch step, publish a patch immediately — a broken
`latest` affects everyone who runs `npm create notils@latest`.

> `@notils/cli` is scoped, so its first publish needs the `@notils` npm
> organization to exist and `publishConfig.access: public` (already set) —
> otherwise npm rejects a scoped package as private.

## Notes

- `NOTILS_TEMPLATE_REF` accepts any git ref tiged understands (branch, tag, or
  commit SHA). Released CLI versions pin a tag; `main` is the default for local runs.
- The CLI runs `git` **without a shell** (so a spaced commit message survives on
  Windows) and only uses a shell for the package-manager install on Windows.
