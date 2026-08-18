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
  // --- Auth pages. Demo content AND auth-dependent. ---
  //
  // Each requires `auth-custom` as well as `auth-ui`, because every one of them
  // imports the contract from `src/lib/auth.ts`, which is itself written against
  // the custom-backend provider. Listing only `auth-ui` was a real bug:
  // `--auth better-auth --demo` kept these pages while removing `lib/auth.ts`,
  // producing a project that failed to typecheck on `Cannot find module
  // '@/lib/auth'`. Until the template ships Better Auth wiring (see
  // docs/ROADMAP.md), these pages belong to the custom-backend provider alone.
  {
    path: "src/app/login/page.tsx",
    requires: ["auth-ui", "auth-custom"],
    demo: true,
    note: "example sign-in page",
  },
  {
    path: "src/app/signup/page.tsx",
    requires: ["auth-ui", "auth-custom"],
    demo: true,
    note: "example sign-up page",
  },
  {
    path: "src/app/forgot-password/page.tsx",
    requires: ["auth-ui", "auth-custom"],
    demo: true,
    note: "example password-reset page",
  },
  {
    path: "src/app/dashboard/page.tsx",
    requires: ["auth-ui", "auth-custom"],
    demo: true,
    note: "example protected page",
  },

  // --- Auth wiring. Needed by the auth pages; not itself a demo of anything,
  // but useless without a provider, so it goes when auth does. ---
  {
    path: "src/lib/auth.ts",
    requires: ["auth-custom"],
    demo: false,
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
export type AppContentPlan = {
  /** Paths (app-relative) to delete, in no particular order. */
  removePaths: readonly string[];
  /** Human-readable reasons, one per removed path, for the scaffold report. */
  reasons: readonly string[];
  /**
   * Whether the nav bar survived. The layout renders it, so the caller must
   * rewrite `layout.tsx` when it doesn't — tracked explicitly because forgetting
   * it leaves an import of a deleted file, which is a build error rather than a
   * cosmetic leftover.
   */
  keepsNavBar: boolean;
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
  }

  return {
    removePaths,
    reasons,
    keepsNavBar: kept.has("src/components/nav-bar.tsx"),
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
  "src/components",
  "src/lib",
];
