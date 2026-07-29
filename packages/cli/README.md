# @notils/cli

Add production-ready capabilities — the UI kit, auth, the schema-to-form
renderer — to **any** Next.js project. One scaffolded with
[create-notils](../create-notils), or your own.

```bash
bunx @notils/cli list                 # what's available, what's installed
bunx @notils/cli add auth-ui          # also adds auth-custom, api-client, form-builder, ui
bunx @notils/cli init                 # record this project's layout (usually automatic)
```

Design rationale: [docs/add-command-design.md](../../docs/add-command-design.md).

## Why a separate CLI

`create-notils` runs once, at project birth. This one runs any time after, and —
crucially — in projects it did not create. It's **stateless and never installed
into your project**: nothing to add before your first `add`, nothing to maintain
after, and a fix reaches every project immediately, including ones scaffolded
months ago. Same model as shadcn, for the same reasons.

Everything it writes is **your source**, in your repo. Edit it freely. To remove a
capability, delete the directory.

## `add`

```bash
bunx @notils/cli add auth-ui --dry-run   # see the plan first
bunx @notils/cli add auth-ui
```

- **Resolves dependencies.** `add auth-ui` also writes `auth-custom`,
  `api-client`, `form-builder`, and `ui` — it tells you before it does.
- **Never clobbers your edits.** Every file is compared against the pristine
  upstream source. Files you've changed are reported and left alone; `--force`
  overwrites them.
- **Idempotent.** Re-running reports "already up to date" and writes nothing.
- **Adapts to your shape.** Monorepo targets get real workspace packages under
  `packages/*` (with a generated `package.json`/`tsconfig.json`, scope-renamed to
  yours); standalone targets get the folded `@/*` form, identical to what
  `create-notils` produces.
- **Warns about foundations it can't assume** — Tailwind v4, the theme token
  layer, Base UI vs an existing Radix install, React 19. Warnings, not refusals.
- **Doesn't pin versions.** It prints the install command for any missing
  external dependencies and lets your package manager resolve them.
- **Formats what it wrote**, via your project's own `lint:fix`/`format` script
  (`--skip-format` opts out). The specifier rewrite changes import order, so
  without this the new files would open with sort diagnostics.

Flags: `--dry-run`, `--force`, `--yes`, `--skip-format`.

## Status

| command | state |
| ------- | ----- |
| `add`   | works |
| `list`  | works |
| `init`  | works |

Not yet built: version-drift reporting in `list`, theme-token injection for
`add ui` on a project with no token layer (it warns instead), and interactive
`CustomBackendAuthConfig` setup for `add auth-custom`.

## `notils.json`

Records where things go, like shadcn's `components.json`:

```json
{
  "shape": "standalone",
  "scope": null,
  "paths": { "packages": "packages", "lib": "src/lib", "components": "src/components" }
}
```

`create-notils` writes it at scaffold time. Otherwise `init` detects it — and
`add` will run `init` for you on first use, so you rarely invoke it directly.

Detection shows its reasoning rather than guessing silently, and lets you correct
every value (`--yes` accepts the detection as-is):

```
◇  Detected:
│    · standalone — no workspaces in package.json
│    · source root "src" — from tsconfig "@/*" → "./src/*"
│    · components "src/components" — from components.json alias "@/components"
```

## What's inside

```
src/
├── index.ts         # entry point, command dispatch
├── cli.ts           # commander wiring → a typed ParsedCli union
├── add.ts           # resolve → fetch → plan → confirm → apply → format
├── write-package.ts # where each file goes, and the don't-clobber comparison
├── fetch.ts         # tiged subdirectory fetch from the pinned tag
├── compat.ts        # brownfield foundation checks
├── init.ts          # detect + confirm + write notils.json
├── list.ts          # the capability table
└── installed.ts     # where a package lives in this project, and whether it's there
```

The package graph and the specifier rewrites live in
[`@notils/transform`](../transform), shared with `create-notils` so a project
built by `add` can't drift from one built by the scaffolder.
