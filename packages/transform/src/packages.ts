/**
 * The internal package graph — which `@notils/*` packages exist, where each one
 * lands in a flattened (standalone) project, and what it depends on.
 *
 * This is the single source of truth for both CLIs:
 *   - `create-notils` flattens the whole template at scaffold time.
 *   - `@notils/cli add` writes ONE package (plus its transitive deps) into an
 *     existing project.
 *
 * Adding a new internal package means adding one entry here. Nothing else in
 * either CLI enumerates packages.
 */

/** Where a package's source lands in a flattened standalone project. */
export type FoldTarget =
  /** `ui` is special: its `src/*` spreads across the app's own `src/*`. */
  | { kind: "spread" }
  /** Everything else folds into `src/lib/<name>/*`. */
  | { kind: "lib" }
  /** Config packages are inlined into the app's tsconfig/biome, not copied. */
  | { kind: "inlined" };

export type InternalPackage = {
  /** Directory name under `packages/`, and the `@notils/<name>` suffix. */
  name: string;
  /** One line, shown by `@notils/cli list`. */
  description: string;
  /** How this package folds in a standalone project. */
  fold: FoldTarget;
  /** Other internal package names this one imports from. */
  dependsOn: string[];
  /**
   * Whether `add` can install this package on its own. `config` is scaffold-only
   * infrastructure — there's nothing meaningful to "add" to an existing project
   * that already has its own tsconfig and linter.
   */
  addable: boolean;
};

export const INTERNAL_PACKAGES: readonly InternalPackage[] = [
  {
    name: "config",
    description: "Shared tsconfig presets + Biome config",
    fold: { kind: "inlined" },
    dependsOn: [],
    addable: false,
  },
  {
    name: "ui",
    description: "shadcn/ui component kit on Base UI, with the Tailwind v4 theme",
    fold: { kind: "spread" },
    dependsOn: [],
    addable: true,
  },
  {
    name: "api-client",
    description: "Platform-neutral HTTP transport core (createHttpClient, HttpError)",
    fold: { kind: "lib" },
    dependsOn: [],
    addable: true,
  },
  {
    name: "auth-custom",
    description: "Auth provider for a project with its own existing backend",
    fold: { kind: "lib" },
    dependsOn: ["api-client"],
    addable: true,
  },
  {
    name: "form-builder",
    description: "Recursive Zod-schema-to-form renderer",
    fold: { kind: "lib" },
    dependsOn: ["ui"],
    addable: true,
  },
  {
    name: "auth-ui",
    description: "SignInForm, SignUpForm, ForgotPasswordForm, SessionStatus, ProtectedRoute",
    fold: { kind: "lib" },
    dependsOn: ["auth-custom", "form-builder", "ui"],
    addable: true,
  },
];

const BY_NAME = new Map(INTERNAL_PACKAGES.map((pkg) => [pkg.name, pkg]));

export function findInternalPackage(name: string): InternalPackage | undefined {
  return BY_NAME.get(name);
}

/**
 * Package names that fold into `src/lib/<name>/` in a standalone project —
 * i.e. everything except `ui` (which spreads) and `config` (which is inlined).
 * This is what the specifier rewrite uses to recognize a library import.
 */
export const LIBRARY_PACKAGE_NAMES: readonly string[] = INTERNAL_PACKAGES.filter(
  (pkg) => pkg.fold.kind === "lib"
).map((pkg) => pkg.name);

/**
 * Resolve `names` plus everything they transitively depend on, returned in
 * **dependency-first order** so a caller writing them in sequence never writes a
 * package before something it imports.
 *
 * Throws on an unknown name — a typo'd package should fail loudly at the CLI
 * boundary, not silently install a subset of what was asked for.
 */
export function resolveWithDependencies(names: readonly string[]): InternalPackage[] {
  const ordered: InternalPackage[] = [];
  const seen = new Set<string>();
  const visiting = new Set<string>();

  function visit(name: string): void {
    if (seen.has(name)) return;
    // The graph is hand-maintained above and acyclic today; this guard means a
    // future bad edit surfaces as a clear error instead of a stack overflow.
    if (visiting.has(name)) {
      throw new Error(`Circular dependency in the internal package graph at "${name}".`);
    }
    const pkg = BY_NAME.get(name);
    if (!pkg) {
      const available = INTERNAL_PACKAGES.filter((p) => p.addable)
        .map((p) => p.name)
        .join(", ");
      throw new Error(`Unknown package "${name}". Available: ${available}`);
    }
    visiting.add(name);
    for (const dependency of pkg.dependsOn) {
      visit(dependency);
    }
    visiting.delete(name);
    seen.add(name);
    ordered.push(pkg);
  }

  for (const name of names) {
    visit(name);
  }
  return ordered;
}
