/**
 * Which files in the template's app belong to which capability, and which are
 * demo content rather than a production starting point.
 *
 * This one manifest serves BOTH issue #2 (fresh vs demo app) and issue #3
 * (pruning unselected capabilities), because they turn out to be the same
 * mechanism: the auth pages ARE the demo content, and they are also exactly what
 * must disappear when auth isn't selected. Encoding it once means a fresh app and
 * an auth-less app can never disagree about what a valid app looks like.
 *
 * Paths are relative to the app directory (`apps/<name>/` in a monorepo, the
 * project root in a standalone project), so the same manifest describes both
 * shapes.
 *
 * **Adding a file to the template?** If it imports an optional package or exists
 * only to demonstrate the stack, add it here. A file not listed is treated as
 * always-kept, which is the right default for genuine app scaffolding
 * (layout.tsx, globals.css, next.config.ts) but wrong for anything demo-ish —
 * and an unlisted demo file is exactly the leftover issue #2 is about.
 */

export type AppContentEntry = {
  /** Path relative to the app root. */
  path: string;
  /**
   * Rename this file to `renameTo` when it survives.
   *
   * Exists for the provider seam. Both auth providers ship a wiring file in the
   * template — `lib/auth.ts` (custom backend) and `lib/auth-better-auth.ts`
   * (Better Auth) — and whichever one the project selected becomes `lib/auth.ts`,
   * because that is what every page imports. Without this the pages would have to
   * know which provider they were built against, which is exactly the coupling
   * `@notils/auth-core` exists to remove.
   */
  renameTo?: string;
  /**
   * Internal packages this file imports. The file is removed when any of them is
   * pruned — a file importing a package that no longer exists is the dangling
   * reference issue #3 calls out by name.
   */
  requires: readonly string[];
  /**
   * True when the file exists to DEMONSTRATE the stack rather than to be part of
   * a production starting point. Removed from a fresh app even when everything it
   * imports was selected.
   */
  demo: boolean;
  /** Why this is demo content, for the removal report. */
  note?: string;
};

/**
 * The template's app files that are conditional in any way.
 *
 * Kept as data rather than glob patterns so each decision is explicit and
 * reviewable — a pattern like `**\/auth\/**` would be shorter but would silently
 * capture future files whose fate nobody actually considered.
 */
export const APP_CONTENT: readonly AppContentEntry[] = [
  // --- Auth pages. Demo content, and they need the UI kit plus SOME provider. ---
  //
  // They require only `auth-ui`, not a specific provider, because each provider
  // ships its own wiring file that becomes `src/lib/auth.ts` (see the two entries
  // below) and exports the same `auth` / `signInInputSchema` /
  // `signUpInputSchema`. That is what lets one set of pages serve either provider.
  //
  // `auth-ui` itself is only ever kept when a provider was selected — the auth
  // choice adds them together (see `authPackageNames` in selection.ts) — so
  // requiring `auth-ui` transitively requires "a provider exists".
  {
    path: "src/app/login/page.tsx",
    requires: ["auth-ui"],
    demo: true,
    note: "example sign-in page",
  },
  {
    path: "src/app/signup/page.tsx",
    requires: ["auth-ui"],
    demo: true,
    note: "example sign-up page",
  },
  {
    path: "src/app/forgot-password/page.tsx",
    requires: ["auth-ui"],
    demo: true,
    note: "example password-reset page",
  },
  {
    path: "src/app/dashboard/page.tsx",
    requires: ["auth-ui"],
    demo: true,
    note: "example protected page",
  },

  // --- Auth wiring: one file per provider, and the selected one is renamed to
  // `src/lib/auth.ts`. Exactly one survives, because the auth choice is
  // mutually exclusive — so the rename can never collide. ---
  {
    // Already at the destination path, so no rename. Pruned when the project
    // chose Better Auth (or no auth), which is what frees the path for the file
    // below.
    path: "src/lib/auth.ts",
    requires: ["auth-custom"],
    demo: false,
  },
  {
    path: "src/lib/auth-better-auth.ts",
    requires: ["auth-better-auth"],
    demo: false,
    renameTo: "src/lib/auth.ts",
  },
  {
    path: "src/lib/auth-better-auth-server.ts",
    requires: ["auth-better-auth"],
    demo: false,
  },
  {
    // Better Auth's own routes, mounted by one catch-all. Claims the same
    // `/api/auth/*` path as the hand-written custom-backend routes below, which
    // is safe precisely because the two providers are mutually exclusive.
    path: "src/app/api/auth/[...all]/route.ts",
    requires: ["auth-better-auth"],
    demo: false,
  },
  {
    // Better Auth only, and demo content: it exists to SHOW server-side session
    // gating, which is the capability that distinguishes this provider. A custom
    // backend generally can't do it, so there is no equivalent page there.
    path: "src/app/server-session/page.tsx",
    requires: ["auth-better-auth"],
    demo: true,
    note: "example server-gated page (Better Auth)",
  },
  {
    path: "src/lib/mock-auth-store.ts",
    requires: ["auth-custom"],
    demo: true,
    note: "in-memory user store backing the mock auth API",
  },

  // --- Mock auth API routes. Demo backends for the example pages: a real project
  // points auth at its own API instead. ---
  {
    path: "src/app/api/auth/login/route.ts",
    requires: ["auth-custom"],
    demo: true,
    note: "mock auth endpoint",
  },
  {
    path: "src/app/api/auth/logout/route.ts",
    requires: ["auth-custom"],
    demo: true,
    note: "mock auth endpoint",
  },
  {
    path: "src/app/api/auth/refresh/route.ts",
    requires: ["auth-custom"],
    demo: true,
    note: "mock auth endpoint",
  },
  {
    path: "src/app/api/auth/register/route.ts",
    requires: ["auth-custom"],
    demo: true,
    note: "mock auth endpoint",
  },
  {
    path: "src/app/api/auth/reset-password/route.ts",
    requires: ["auth-custom"],
    demo: true,
    note: "mock auth endpoint",
  },
  {
    path: "src/app/api/auth/session/route.ts",
    requires: ["auth-custom"],
    demo: true,
    note: "mock auth endpoint",
  },

  // --- Example form. The clearest demo file in the template: its own doc comment
  // says it exists to validate form-builder against a real form. ---
  {
    path: "src/app/contact-form.tsx",
    requires: ["form-builder"],
    demo: true,
    note: "example schema-driven form",
  },

  // --- Navigation. Demo chrome (issue #2 names it explicitly), and it renders
  // session state, so it also depends on auth-ui. ---
  {
    // Also `auth-custom`, for the same reason as the auth pages above: it renders
    // session state from the contract in `src/lib/auth.ts`.
    path: "src/components/nav-bar.tsx",
    requires: ["auth-ui", "auth-custom"],
    demo: true,
    note: "landing-page navigation with session state",
  },
];

/** What a scaffold decided about app content. */
/** A file that survived and must be moved to its final path. */
export type AppContentRename = {
  from: string;
  to: string;
};

export type AppContentPlan = {
  /** Paths (app-relative) to delete, in no particular order. */
  removePaths: readonly string[];
  /**
   * Files to rename after the deletions — the provider-wiring seam.
   *
   * Applied AFTER `removePaths` so a rename never has to overwrite a file that
   * was about to be deleted anyway: choosing Better Auth prunes the custom
   * backend's `lib/auth.ts` and only then moves `lib/auth-better-auth.ts` into
   * its place.
   */
  renames: readonly AppContentRename[];
  /** Human-readable reasons, one per removed path, for the scaffold report. */
  reasons: readonly string[];
  /**
   * Whether the nav bar survived. The layout renders it, so the caller must
   * rewrite `layout.tsx` when it doesn't — tracked explicitly because forgetting
   * it leaves an import of a deleted file, which is a build error rather than a
   * cosmetic leftover.
   */
  keepsNavBar: boolean;
  /**
   * Whether the app ends up with auth wiring at `src/lib/auth.ts` — from either
   * provider. What the auth pages actually depend on.
   */
  keepsAuthWiring: boolean;
  /** Whether any auth page survived, i.e. whether the app has auth routes. */
  keepsAuthPages: boolean;
};

/**
 * Decide which app files a generated project keeps.
 *
 * Two independent reasons to remove a file, and they compose: the capability it
 * needs wasn't selected, or it is demo content and this is a fresh app. A file is
 * kept only when neither applies.
 */
export function planAppContent(options: {
  /** Names of internal packages the project keeps (from `resolveSelection`). */
  keptPackages: ReadonlySet<string>;
  /** True for a demo app, false for a fresh one (issue #2). */
  includeDemo: boolean;
}): AppContentPlan {
  const { keptPackages, includeDemo } = options;

  const removePaths: string[] = [];
  const reasons: string[] = [];
  const renames: AppContentRename[] = [];
  const kept = new Set<string>();

  for (const entry of APP_CONTENT) {
    const missing = entry.requires.filter((name) => !keptPackages.has(name));
    if (missing.length > 0) {
      removePaths.push(entry.path);
      reasons.push(`${entry.path} — needs ${missing.join(", ")}, which this project doesn't have`);
      continue;
    }
    if (entry.demo && !includeDemo) {
      removePaths.push(entry.path);
      reasons.push(`${entry.path} — ${entry.note ?? "demo content"}`);
      continue;
    }
    kept.add(entry.path);
    if (entry.renameTo) {
      renames.push({ from: entry.path, to: entry.renameTo });
    }
  }

  return {
    removePaths,
    reasons,
    renames,
    keepsNavBar: kept.has("src/components/nav-bar.tsx"),
    // Either provider's wiring lands at `src/lib/auth.ts`, so ask about the
    // destination rather than a specific source file.
    keepsAuthWiring:
      kept.has("src/lib/auth.ts") || renames.some((rename) => rename.to === "src/lib/auth.ts"),
    keepsAuthPages: kept.has("src/app/login/page.tsx"),
  };
}

/**
 * Directories that become empty once their files are removed, so the caller can
 * prune them rather than leaving an empty `src/app/api/auth/` behind.
 *
 * Ordered deepest-first so removing children before parents actually empties them.
 */
export const PRUNABLE_APP_DIRECTORIES: readonly string[] = [
  "src/app/api/auth/[...all]",
  "src/app/api/auth/login",
  "src/app/api/auth/logout",
  "src/app/api/auth/refresh",
  "src/app/api/auth/register",
  "src/app/api/auth/reset-password",
  "src/app/api/auth/session",
  "src/app/api/auth",
  "src/app/api",
  "src/app/login",
  "src/app/signup",
  "src/app/forgot-password",
  "src/app/dashboard",
  "src/app/server-session",
  "src/components",
  "src/lib",
];
