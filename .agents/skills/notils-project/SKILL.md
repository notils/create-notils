---
name: notils-project
description: Architecture, conventions, and setup decisions for the create-notils monorepo starter. READ THIS before adding or editing code in this repo — especially before touching the shared @notils/ui package, shadcn/Base UI components, Tailwind v4 theming, the auth capability/provider architecture (@notils/api-client, @notils/auth-custom), the package layout, or dependencies. Applies to any work under apps/* or packages/*.
---

# create-notils — project guide

**create-notils** is an opinionated, production-first monorepo starter and a CLI (published to npm, see "The `create-notils` CLI" below) that scaffolds a complete full-stack app in one command: `npm create notils@latest my-app`. The goal is that a developer skips the repetitive infra setup (monorepo, UI kit, auth, db, tooling) and starts building product on day one. Every generated file is the user's to edit — no vendor lock-in.

> Branding: the product/package name is **create-notils** (root `package.json` `name: "create-notils"`; part of the future **Notils** ecosystem). [rnstack](https://github.com/sanjaysah101/rnstack) (a React Native starter) will be merged in later as a template variant — keep conventions here compatible with that skill (`rnstack-project`).

Primary target is **web (Next.js)**. The stack itself (Next.js/Tailwind/shadcn/Base UI/Biome) is deliberately singular and well-tested — no stack-choice prompts. The CLI does prompt for scaffold shape (monorepo/standalone), app names, and package manager (see "The `create-notils` CLI" below).

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
│   ├── ui/                     # @notils/ui — the shared shadcn/ui kit (see below)
│   │   ├── src/
│   │   │   ├── components/ui/  #   shadcn components (button, ...)
│   │   │   ├── lib/utils.ts    #   cn()
│   │   │   ├── hooks/          #   shared hooks
│   │   │   └── styles/globals.css  # SINGLE source of truth for theming
│   │   └── components.json     #   shadcn CLI config (aliases → @notils/ui, base UI)
│   ├── api-client/             # @notils/api-client — platform-neutral HTTP transport core
│   └── auth-custom/            # @notils/auth-custom — custom-backend auth provider (Zod-validated)
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
7. **Every package under `packages/*` ships a `README.md`.** Match the existing convention (`packages/ui/README.md`, `packages/config/README.md`, `packages/api-client/README.md`, `packages/auth-custom/README.md`): a one-line purpose statement, a "What's inside" file-tree summary, a minimal usage example, and (for anything non-obvious) why it's built the way it is. Add the README in the same change that adds the package — not as later cleanup.

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

## The `create-notils` CLI (`packages/create-notils`) — BUILT and published

The CLI (scaffolds this template in **monorepo** or **standalone** shape, via
the flatten transform described above) is built and published to npm as
`create-notils`, first release **v0.1.0**. Local dev/testing loop is documented
in [docs/testing-locally.md](../../../docs/testing-locally.md) — read that
before changing CLI source or cutting a release.

Since the initial build, these CLI behaviors were added/fixed — know them
before touching `packages/create-notils/src/*`:

- **Project name prompt**: empty Enter defaults to `my-app`
  (`DEFAULT_PROJECT_NAME` in `arguments.ts`); `.` scaffolds into the current
  directory (only if empty — aborts otherwise), deriving the name from the
  folder via `toValidProjectName` (sanitizes, falls back to `my-app`).
- **No `--bundle-id-prefix` flag/prompt.** It was reserved for a future
  React Native target and had zero effect on the web-only CLI — removed
  end-to-end (cli.ts, config.ts, arguments.ts, apps.ts, README). Re-add it
  (and wire it up for real) only when an RN app target actually exists.
- **Monorepo workspace-scope rename**: `packages/ui`/`packages/config` keep
  the `@notils/*` scope in the template, but a monorepo scaffold renames it to
  `@<project-name>/*` everywhere (package names, workspace deps, tsconfig
  `extends`/`paths`, `biome.json` extends, `components.json` aliases, source
  imports) — see `index.ts`'s `configureProject`, which runs this via
  `replaceInDirectoryTree` right after `generateApps`. Standalone doesn't need
  it: `flatten.ts` already strips the `@notils/ui` scope entirely, and that
  rewrite depends on the literal string, so the scope-rename step must stay
  monorepo-only (running it first would break flatten's hardcoded match).
- **Package-manager fixups** (`scaffold.ts`), applied after the flatten/apps
  step, for every manager EXCEPT the one already baked into the template.
  Getting these right requires actually running `<pm> install` + `<pm> dev`
  end-to-end for **every** supported manager — checking devEngines field
  values alone (as the first pass at this did) misses real breakage,
  because npm/yarn monorepos turned out to be completely broken in ways
  that never surfaced from bun/pnpm testing alone:
  - `removeBunArtifacts`: the template's Next.js scripts hardcode
    `bun run --bun next dev/build/start` (a bun-only runtime flag) and ship
    `bun.lock`. For any non-bun manager, strip the `bun run --bun ` prefix
    tree-wide and delete `bun.lock` — otherwise the scaffold's `dev`/`build`
    scripts invoke bun regardless of the chosen manager.
  - `normalizeWorkspaceProtocol`: every internal dependency uses
    `workspace:*` (bun/pnpm/Yarn-Berry syntax). npm has never supported it
    and Yarn Classic (1.x — still what a bare `yarn` resolves to almost
    everywhere) doesn't either: `npm install` failed outright with
    `EUNSUPPORTEDPROTOCOL: Unsupported URL Type "workspace:"` on *every*
    npm/yarn monorepo scaffold. Fixed by rewriting `workspace:*` → `*` for
    npm/yarn only (both resolve a same-named workspace member automatically
    for a satisfying range); bun/pnpm keep `workspace:*`.
  - `alignPackageManagerField`: writes the legacy `packageManager` field
    (`"<name>@<version>"`), **not** `devEngines.packageManager` — a
    deliberate reversal from the first attempt at this fix. turbo requires
    one of the two to run at all, but `devEngines` triggers strict runtime
    version enforcement (by npm, bun, and turbo's own parser, which also
    rejects a wildcard `"*"` version outright with "must only allow
    versions within one major version") that's fragile in a way that isn't
    obvious until it breaks: the same manager name can resolve to a
    *different* binary/version depending on invocation context — confirmed
    by testing, where turbo's own internal subprocess for a workspace
    member's `npm run dev` resolved to the Node-bundled npm, a different
    *major* version than the separately-upgraded global npm on PATH that a
    version-detection step found. No single version/range can satisfy both
    on a machine in that state. The legacy `packageManager` field satisfies
    turbo's structural requirement without triggering that enforcement
    (verified: turbo ran the dev server successfully with it despite that
    exact mismatch). Still detect the real installed version
    (`getCommandOutput` in `process.ts`, from `os.tmpdir()` — NOT the
    scaffold root, since at this point the scaffold's package.json still
    carries the template's own `devEngines: bun` pin, and pnpm/npm/bun each
    enforce that pin themselves when invoked inside a directory that
    declares it) rather than fabricate one: harmless if wrong for most
    users, but accurate for anyone with Corepack actively enabled (Corepack
    reads this exact field). This also fixed a latent identical risk in the
    template's own hardcoded bun pin, for any user whose bun differs from
    that exact version — untested until this point because the dev machine
    happened to have a matching bun version.
  - `configurePnpmWorkspace`: pnpm does not read package.json's `workspaces`
    field (npm/yarn/bun convention) — without a generated `pnpm-workspace.yaml`,
    pnpm can't see `apps/*`/`packages/*` and every `workspace:*` dep fails to
    resolve. **Deliberately NOT handled**: pnpm's `ERR_PNPM_IGNORED_BUILDS`
    (it refuses to run a dependency's native postinstall — e.g. sharp's —
    unless allow-listed). The allow-list config key already changed once
    across pnpm majors (`onlyBuiltDependencies` in v10 → `allowBuilds` in
    v11) with no compatibility overlap; hardcoding either schema into the
    template risks silently breaking again on a future pnpm release (this was
    tried and empirically failed on pnpm 11). Leave `pnpm approve-builds` as
    the user's manual step — it's pnpm's own version-proof mechanism for
    exactly this. The rest of the install (deps, workspace linking, husky
    hook) succeeds regardless; only the optional native build is skipped.
    npm has its own equivalent (`npm warn install-scripts ... blocked`),
    but it's a warning, not a failing exit code, unlike pnpm's.
  - When testing yarn locally without it globally installed: `corepack yarn
    <args>` runs it on demand (Yarn Classic 1.x by default). If `corepack
    enable` fails with `EPERM` (no admin rights to link shims into the
    Node.js install dir), a `yarn.cmd` wrapper script (`@echo off` +
    `corepack yarn %*`) dropped into the user npm global bin dir
    (`%APPDATA%\npm`, already on PATH) works as a throwaway substitute —
    `node.exe`'s own spawn (via `shell:true`/cmd.exe) resolves bare `yarn` to
    `yarn.cmd` through `PATHEXT`, matching what the actual CLI does at
    runtime (bash's own command resolution doesn't, which only matters for
    testing directly in bash, not for the CLI itself).

### Releasing a new CLI version to npm

Full mechanical steps are in
[docs/testing-locally.md](../../../docs/testing-locally.md)'s "Publishing to
npm" section — follow that. Additional things learned cutting v0.1.0/v0.1.1,
not to re-discover:

1. **Publish with `bun publish`, directly from `packages/create-notils` — not
   `npm publish`.** The repo root pins `devEngines.packageManager: bun`, so
   *any* npm command (`npm publish`, `npm pack`, even `npm whoami` /
   `npm login`) run from anywhere under this repo fails with
   `EBADDEVENGINES` — npm walks up to the nearest `package.json` and enforces
   the pin. Bun IS the sanctioned manager, so `bun publish` never hits this;
   it builds (via `prepublishOnly`), packs, and publishes in one step, with
   no isolated-copy dance. Only fall back to the npm route (isolated copy,
   `npm publish <tarball-path>` — never bare `npm publish`, which re-triggers
   `prepublishOnly` in a dir with no `node_modules`) if bun is genuinely
   unavailable.
2. **The OTP/2FA browser-approval step cannot be automated or run by an
   agent** — it's an npm-registry security check tied to a human clicking a
   real browser link, independent of whether `bun publish` or `npm publish`
   is used. Same for `npm login` itself (`ENEEDAUTH` if not yet logged in).
   Both must run in the user's own interactive terminal.
3. **`CHANGELOG.md` needs an explicit `files` entry.** npm's "always
   included regardless of `files`" set is `package.json`/`README`/`LICENSE` —
   **not** `CHANGELOG.md`. Confirmed via `npm pack --dry-run`: without adding
   `"CHANGELOG.md"` to `package.json`'s `files` array, it silently doesn't
   ship even though it sits right next to `README.md`.
4. **Pin `TEMPLATE_REF`** (`src/scaffold.ts`) to the tag being cut (e.g.
   `"v0.1.0"`), not left floating on `"main"` — the template IS this repo, so
   the tag doubles as both the npm release marker and the frozen template
   snapshot `tiged` fetches. **Verify it resolves** before publishing: after
   pushing the tag, scaffold a test project with the freshly-built CLI and
   confirm the fetch step shows `notils/create-notils#v<version>` succeeding
   (catches a typo'd or unpushed tag before it's public).
5. **Tag with the full release notes, not a one-liner** —
   `git tag -a vX.Y.Z -F <notes-file>` (or `-m`), where the notes are (at
   minimum) that version's `CHANGELOG.md` section. A short annotation message
   is the easy mistake; fixing it after push means `git tag -f` + force-push
   the tag (safe only because nothing else could have fetched it yet).
6. **Also create a GitHub Release** (`gh release create vX.Y.Z --notes-file
   <notes-file>`, or the GitHub web UI) — separate from the git tag's own
   annotation; that's what actually renders on the repo's Releases page.
   Requires `gh` installed and authenticated (`gh auth login`) — if
   unavailable, do the git tag step above regardless and hand the notes file
   to whoever creates the Release manually.
7. **Before publishing any "fixed the scaffold" release, verify the fix
   against every supported package manager, not just the one that surfaced
   the bug.** v0.1.1 started as a pnpm-only devEngines fix; testing it
   against npm and yarn too (only because asked) surfaced that npm/yarn
   monorepos were *completely* broken (`workspace:*` protocol unsupported)
   in a way pnpm/bun testing could never reveal, plus a second devEngines
   issue specific to environments with multiple resolvable versions of the
   same manager. "Verify" means actually running `<pm> install` and `<pm>
   dev`/`<pm> run dev` end-to-end and confirming the dev server boots —
   checking a config field's value (e.g. `devEngines`) is not enough; it
   caught neither bug here.

## Auth architecture — capability/provider split (BUILT: transport + custom-backend provider)

Full design: [`docs/auth-and-api-client-design.md`](../../../docs/auth-and-api-client-design.md)
and [`docs/packages-and-providers-architecture.md`](../../../docs/packages-and-providers-architecture.md).
Concrete tracking: [`docs/ROADMAP.md`](../../../docs/ROADMAP.md) — check that
file for current status, not this list.

Auth is a **capability** with swappable **providers** behind one contract
(`AuthContract<TUser, TSignIn, TSignUp>`), not a single hardcoded
integration — because "add Better Auth" and "I already have a backend that
does auth" are both real, common cases that need different generated code.

- **`packages/api-client`** (`@notils/api-client`) — BUILT. Platform-neutral
  HTTP transport core (`createHttpClient`, `HttpError`, the `AuthProvider`
  seam). Depends only on `fetch`/`Headers`/`URL`/`AbortController` — no
  browser or Node-only APIs — so the same core targets web, React Native, or
  any other JS/TS runtime later. Ported from `rn-monorepo`'s `http.ts`. Not
  yet consumed by `apps/app`.
- **`packages/auth-custom`** (`@notils/auth-custom`) — BUILT. The
  custom-backend provider: for a project with its own existing auth backend
  (no server scaffolded here). `AuthContract` is **generic over the caller's
  own Zod schemas** (`TUser`/`TSignIn`/`TSignUp` are inferred, not
  hand-declared), and `CustomBackendAuthConfig` has **no assumed defaults**
  — every endpoint path and every response/input shape is a Zod schema the
  caller supplies. A `ZodError` (response doesn't match the schema) throws
  loudly; an `HttpError` (network/API failure) is caught into `AuthResult`.
  Not yet wired into `apps/app`; no UI components yet.
- **Tier 1 vs Tier 2 UI split** (not yet built): Tier 1 — sign-in/up,
  password reset, session, sign-out — gets one shared `@notils/ui`-styled
  component set driven only by `AuthContract`, identical regardless of
  provider. Tier 2 — 2FA, passkey, SSO, magic link, orgs — is
  provider-specific by design (a custom backend usually doesn't implement
  these the same way, if at all) and only scaffolds with the Better Auth
  provider.
- **Better Auth provider** — NOT YET BUILT. Server config + client + Better
  Auth UI. Open risk to verify hands-on before building: Better Auth UI's
  shadcn variant likely assumes Radix; this repo is on Base UI (see "Base UI
  vs Radix" above) — may need re-porting its components rather than dropping
  them in directly.
- **`bunx create-notils add <capability>`** — NOT YET BUILT. The delivery
  mechanism for adding a provider to an already-scaffolded project (not just
  at initial scaffold time). Needed before a second provider is worth
  building, so it's sequenced before the Better Auth provider.

## Roadmap — PLANNED, NOT YET BUILT

Do not assume these files/APIs exist; if asked to use them, build them first or confirm scope. See [`docs/ROADMAP.md`](../../../docs/ROADMAP.md) for the concrete, checkbox-level tracking of these.

- **`packages/db`** — PostgreSQL + Drizzle ORM.
- **Docker** config, env-var setup, CI/CD workflows.
- **rnstack merge** — [rnstack](https://github.com/sanjaysah101/rnstack) (a React Native starter) as a second template variant alongside the Next.js one, consuming the same CLI. This is also when a real `--bundle-id-prefix`-equivalent prompt would come back (native reverse-DNS identifiers), scoped to that target. Also when `@notils/api-client` gets its first non-web `AuthProvider`, proving out the "platform-agnostic" claim for real.

When implementing roadmap items, follow the conventions above and refresh THIS skill so it stays the accurate source of truth.
