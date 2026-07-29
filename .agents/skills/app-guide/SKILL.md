---
name: app-guide
description: Conventions and architecture for a project scaffolded with create-notils (monorepo OR standalone). READ THIS before adding or editing code — especially before touching UI components, Tailwind theming, the auth stack (api-client, auth-custom, auth-ui), the schema-to-form renderer (form-builder), or the project layout.
---

# Project guide

This project was scaffolded with **create-notils** — an opinionated, production-first starter. Stack: Bun + Next.js 16 (App Router, React Compiler) + Tailwind CSS v4 + shadcn/ui on Base UI + Biome (and Turborepo if this is the monorepo shape), plus an auth stack and a Zod-schema-to-form renderer. Everything here is **your code** — edit it freely; there is no vendor lock-in.

This guide is the source of truth for how the project is wired. Follow it so the codebase stays consistent.

## Which shape is this? (monorepo vs standalone)

create-notils scaffolds in one of two shapes. **Detect which one you're in before following paths below:**

- **Monorepo** — there is a top-level `packages/` directory and `workspaces` in the root `package.json`. The UI kit is a separate package (`packages/ui`), imported by its scoped name (e.g. `@<scope>/ui/components/ui/button`).
- **Standalone** — no `packages/`, no workspaces; a single Next.js project. The UI kit lives in the app's own `src/` and is imported via the `@/*` alias (e.g. `@/components/ui/button`).

The **component source, theme, `cn()`, and conventions are identical in both** — only the layout and import specifiers differ. Everywhere below, both forms are shown.

## Repository layout

**Monorepo:**
```
.
├── apps/app/src/app/       # Next.js app (routes; globals.css imports the shared theme)
├── packages/
│   ├── config/             # shared tsconfig.* + biome.json
│   ├── ui/src/             # shared shadcn/ui kit
│   │   ├── components/ui/  #   components (button, ...)
│   │   ├── lib/utils.ts    #   cn()
│   │   ├── hooks/
│   │   └── styles/globals.css  # canonical theme
│   ├── api-client/         # HTTP transport core (createHttpClient, HttpError)
│   ├── auth-custom/        # auth provider for your own backend
│   ├── auth-ui/            # SignInForm, SignUpForm, ProtectedRoute, ...
│   └── form-builder/       # Zod schema → form renderer
├── turbo.json              # Turborepo pipeline
└── package.json            # workspaces + root scripts
```

**Standalone:**
```
.
├── src/
│   ├── app/                # Next.js app (routes)
│   │   └── globals.css     #   the theme (tokens + dark mode) lives here
│   ├── components/ui/      # components (button, ...)
│   ├── lib/
│   │   ├── utils.ts        #   cn()
│   │   ├── api-client/     #   HTTP transport core
│   │   ├── auth-custom/    #   auth provider for your own backend
│   │   ├── auth-ui/        #   SignInForm, SignUpForm, ProtectedRoute, ...
│   │   └── form-builder/   #   Zod schema → form renderer
│   └── hooks/
├── components.json         # shadcn CLI config (aliases → @/*)
├── biome.json
└── package.json            # single project
```

In the monorepo each of those is a workspace package imported by scoped name (`@<scope>/form-builder/schema-form`); in standalone they're folded into `src/lib/` and imported via `@/lib/form-builder/schema-form`. Same source either way.

**Import the UI kit** — monorepo: `@<scope>/ui/components/ui/button` (check `package.json` `name` for the scope). standalone: `@/components/ui/button`. Below, this is written as **the ui import**.

## Core conventions

1. **Package manager is Bun.** Use `bun`, `bun add`, `bunx`. Monorepo runs tasks through Turborepo from the root (`bun run dev` / `build` / `typecheck` / `lint`, and `bun run dev --filter=app` for one workspace); standalone runs them directly (`bun run dev` / `build` / `typecheck`).
2. **Linting/formatting is Biome** (not ESLint/Prettier). `bun run lint` / `bun run lint:fix`. Biome sorts imports on format — expect and accept the reordering.
3. **TypeScript is `strict`, `moduleResolution: bundler`.** Avoid `baseUrl` — use relative `paths`. (Monorepo: shared presets live in the config package and workspaces extend them. Standalone: config is inlined in `./tsconfig.json`.)
4. **File naming is kebab-case** (`alert-dialog.tsx`); exported components are PascalCase; hooks are `useXxx`.
5. **Never hand-pin dependency versions.** Install the latest via CLI (`bun add <pkg>`); the shadcn CLI installs component deps itself. Only pin on a verified conflict.

## UI components — the shared kit

shadcn/ui is a **single design system with one place to add or update components** — a `packages/ui` package in the monorepo shape, or `src/components/ui` in the standalone shape.

- **Import by subpath, one component per path** — monorepo `@<scope>/ui/components/ui/button`, standalone `@/components/ui/button`. There is **no barrel file**; importing per path keeps bundles small.
- App code uses `@/*` for its own `src`. In the monorepo, the ui package uses its own scoped name for internal imports (`.../lib/utils`); in standalone those are just `@/lib/utils`.
- **`react`/`react-dom`** are provided by the app (peerDependencies of the ui package in the monorepo).

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

The shadcn CLI is installed **locally** (runs instantly — do not use `bunx shadcn@latest`, which re-downloads it each time). Run it where `components.json` lives — the ui package in the monorepo, the project root in standalone:

```bash
# monorepo:  cd packages/ui   |   standalone: stay at the project root
bun run ui:add dialog                # add a component
bun run ui:diff button.tsx           # preview an upstream update vs your copy
bun run ui:add button --overwrite    # update in place (review the git diff after)
```

Components are source files in your repo, so **adding and updating are the same command** — there is no package to bump. After adding, read the generated file and verify composition, tokens, and icons.

### Icons

Default icon library is **lucide** (`iconLibrary` in `components.json`). To switch: change `iconLibrary` (e.g. `tabler`, `hugeicons`), `bun add` that library, and update imports. One config line — no lock-in.

## Forms — the schema-to-form renderer

A Zod schema is the single source of truth for a form's fields, validation, and layout. `<SchemaForm/>` walks the schema and renders it — you don't hand-write field markup.

**Import** — monorepo: `@<scope>/form-builder/schema-form`; standalone: `@/lib/form-builder/schema-form`.

```tsx
const contactSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  message: z.string().min(10, "Tell us a bit more"),
});

<SchemaForm
  schema={contactSchema}
  onSubmit={async (values) => { /* values is fully typed from the schema */ }}
  submitLabel="Send"
  layout={[["firstName", "lastName"], ["email"]]}
/>
```

- **It recurses.** Nested objects, arrays (via `useFieldArray`), discriminated unions (rendered as a variant picker), and enums all work without extra code. Add a field to the schema and it appears.
- **`layout`** groups **top-level** fields into rows — `[["firstName","lastName"]]` puts those two side by side. Unmentioned fields get their own full-width row, in schema order, after the laid-out ones. Nested fields keep their own vertical layout regardless.
- **`uiHints`** — per-field overrides keyed by field path: `showWhen` for conditional visibility, `className` for style tweaks, or a full custom render. Use this before reaching for a hand-built form.
- **Cross-field validation needs no `uiHints`.** A Zod `.superRefine()` that calls `ctx.addIssue({ path })` already surfaces on the right field.
- **Validation messages come from the schema.** Put them in the Zod definition (`.min(10, "Tell us a bit more")`), not in the component.
- **Extending it:** `walkSchema` (schema → descriptor tree) has zero React/UI dependency; `field-renderer.tsx` is the swappable half that picks actual components. To change how a field type renders, edit the renderer — not `SchemaForm`.

## Auth

Auth is a **contract with swappable providers**, not one hardcoded integration. The scaffolded provider is the **custom-backend** one: for a project that already has its own auth API.

Three pieces — monorepo `@<scope>/…`, standalone `@/lib/…`:

- **`api-client`** — the HTTP transport (`createHttpClient`, `HttpError`). Platform-neutral; no browser-only or Node-only APIs.
- **`auth-custom`** — the provider. `createCustomBackendAuthProvider` (token storage + single-flight refresh) and `createAuthContract` (the `useSession`/`signIn`/`signUp`/`signOut`/`requestPasswordReset` surface).
- **`auth-ui`** — `SignInForm`, `SignUpForm`, `ForgotPasswordForm`, `SessionStatus`, `ProtectedRoute`. Built on `SchemaForm`; driven only by the contract, so they're identical regardless of provider.

**Wiring it to your backend** — the scaffold ships a working example at `src/lib/auth.ts` (monorepo: `apps/app/src/lib/auth.ts`) pointed at mock in-memory API routes. **There are no assumed defaults**: every endpoint path and every request/response shape is a Zod schema you supply. To use your real backend, change the paths and schemas in that one file; nothing else is project-specific.

```ts
// One config object drives everything — every path and schema is explicit.
const authConfig: CustomBackendAuthConfig<User, SignIn, SignUp> = {
  loginPath: "/api/auth/login",        // ← your endpoints
  registerPath: "/api/auth/register",
  refreshPath: "/api/auth/refresh",
  sessionPath: "/api/auth/session",
  loginResponseSchema: tokenEnvelope,  // ← your actual response shapes
  sessionResponseSchema: userSchema,
  signInInputSchema,                   // ← your input shapes
  signUpInputSchema,
  storage,                             // ← where tokens live
};

const anonymousHttp = createHttpClient({ baseUrl, apiPrefix: "" });
const authProvider = createCustomBackendAuthProvider(authConfig, anonymousHttp);
const authedHttp = createHttpClient({ baseUrl, apiPrefix: "", auth: authProvider });

export const auth = createAuthContract(authConfig, anonymousHttp, authedHttp);
```

Note the **two** clients: `anonymousHttp` for login/register/refresh (no token yet) and `authedHttp` for authenticated calls (attaches the token, refreshes on 401). The provider bridges them.

The two failure classes are handled **differently on purpose** — don't "fix" this by unifying them:
- A **`ZodError`** (response doesn't match your schema) **throws**. That's a bug in the schema or the backend, to fix, not a runtime state to swallow.
- An **`HttpError`** (network failure, wrong password) is **caught** and returned as an `AuthResult`.

**`ProtectedRoute` deliberately does not redirect.** It gates children on session status and calls an `onUnauthenticated` callback — routing is `next/navigation`'s job, kept out of the component so the package stays framework-agnostic. Wire the redirect yourself.

**Not included:** 2FA, passkeys, SSO, magic links, and orgs. Those are provider-specific and a custom backend usually doesn't implement them the same way, if at all.

## Theming

The theme is the **single source of truth** for the palette (Tailwind v4, CSS-first — there is no `tailwind.config.js`). It lives in the ui package's `styles/globals.css` (monorepo) or directly in `src/app/globals.css` (standalone).

- **Semantic OKLCH tokens** — `--primary`, `--muted-foreground`, `--radius`, etc., mapped to utilities in `@theme inline`. In markup use `bg-primary`, `text-muted-foreground` — **never raw colors** like `bg-blue-500`, and never hand-rolled `dark:` color overrides.
- **Dark mode is class-based** — `.dark` on the root (via `@custom-variant dark`), not `prefers-color-scheme`. For a runtime light/dark toggle, add `next-themes` with `attribute="class"`.
- **Monorepo:** the app pulls in the shared theme from its own `globals.css`, then scans its own source:
  ```css
  @import "@<scope>/ui/globals.css";
  @source "../";  /* scan this app's own source so its classes aren't purged */
  ```
  **Standalone:** the tokens are already in `src/app/globals.css` (after `@import "tailwindcss"`); there is no cross-package import.

### Custom brand / multiple themes
Override individual tokens rather than forking the whole file. In the **monorepo**, override **after** the `@import` (and, with multiple apps, each app can have its own brand over the shared base):

```css
@import "@<scope>/ui/globals.css";
@source "../";
:root { --primary: oklch(0.55 0.2 260); --radius: 0.5rem; }
.dark  { --primary: oklch(0.7 0.18 260); }
```
In **standalone**, edit the token values directly in `src/app/globals.css`.

### PostCSS
Each Next app has its own small `postcss.config.mjs` that registers `@tailwindcss/postcss`. This is correct — Tailwind v4's real config is CSS-first in `globals.css`, and the bundler resolves the PostCSS config per app. Don't try to centralize it.

## Design principles

Aim for a polished, production-looking result — not a toy demo.

1. **Compose the kit's primitives; don't hand-roll markup.** Forms use the form field primitives; callouts use `Alert`; empty states use `Empty`; loading uses `Skeleton`/`Spinner`; toasts use `sonner`; separators use `Separator`; badges use `Badge`.
2. **Semantic color tokens only** (see Theming). Both light and dark must look intentional.
3. **Accessibility is not optional.** Dialog/Sheet/Drawer need a Title (`sr-only` if hidden); Avatar needs a Fallback; keep focus rings intact.
4. **Prefer built-in variants** (`variant="outline"`, `size="sm"`) over custom classes. Layout with flex/grid + `gap-*` (not `space-*`); use `size-*` when width == height.
5. **Responsive, mobile-first.** Wide content (tables, code) scrolls in its own container so the page never scrolls horizontally.

## Verifying changes

- `bun run typecheck` (monorepo: all workspaces via Turbo; standalone: the project).
- `bun run lint` (Biome). `bun run lint:fix` to auto-fix + sort imports. **In the monorepo, a package with no `lint` script is silently skipped** by the Turbo task — if you add a package, give it `lint`/`lint:fix` scripts or it never gets linted.
- `bun run build` — the real check after any change to components, theming, or Base UI wiring; a typecheck alone won't catch a Tailwind `@source` / CSS-compile issue.

## A note on Next.js 16

This project uses **Next.js 16**, which has breaking changes from earlier versions. If bundled framework docs are present under `node_modules/next/dist/docs/`, read the relevant guide before writing Next-specific code, and heed deprecation notices.
