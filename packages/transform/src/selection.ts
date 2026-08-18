import { INTERNAL_PACKAGES, type InternalPackage, resolveWithDependencies } from "./packages.js";

/**
 * Which optional capabilities a generated project actually gets.
 *
 * The template carries everything it supports; a scaffolded project should carry
 * only what was asked for (issue #3). This module is the single source of truth
 * for that decision, shared by `create-notils` (scaffold time) and `@notils/cli`
 * (`add app`, which must not offer a capability the project doesn't have).
 *
 * It answers exactly one question — "which packages survive?" — and deliberately
 * knows nothing about the filesystem. Removing the pruned packages, rewriting the
 * app source, and fixing up dependency maps are the callers' jobs, because the two
 * shapes (monorepo / standalone) do those very differently.
 */

/**
 * The auth strategy. Mutually exclusive by construction — a project should never
 * carry two competing implementations of the same contract (issue #3), which is
 * why this is one value rather than a set of independently-selectable packages.
 */
export type AuthChoice = "none" | "custom" | "better-auth";

export const AUTH_CHOICES: readonly AuthChoice[] = ["none", "custom", "better-auth"];

/** The provider package each auth choice pulls in, or null for `none`. */
const AUTH_PROVIDER_PACKAGE: Record<AuthChoice, string | null> = {
  none: null,
  custom: "auth-custom",
  "better-auth": "auth-better-auth",
};

/**
 * Optional packages the user picks individually (multi-select), in the order they
 * should be presented.
 *
 * `ui` is here rather than in `CORE_PACKAGE_NAMES` because a project genuinely
 * can decline it — but note that declining it while selecting `form-builder`
 * pulls it back in as a dependency, which `resolveSelection` handles rather than
 * treating as a conflict. `auth-ui` is NOT here: it is implied by the auth
 * choice, since UI with no provider behind it doesn't run.
 */
export const OPTIONAL_PACKAGE_NAMES: readonly string[] = ["ui", "api-client", "form-builder"];

/**
 * Packages every project gets, never offered as a choice.
 *
 * `config` is scaffold infrastructure (the shared tsconfig/Biome presets) — a
 * project without it has no build. `auth-core` is types only and arrives as a
 * dependency of any provider, so it is never selected directly either.
 */
export const CORE_PACKAGE_NAMES: readonly string[] = ["config"];

/** What the user chose, before dependency resolution. */
export type PackageSelection = {
  auth: AuthChoice;
  /** Names from `OPTIONAL_PACKAGE_NAMES`. */
  packages: readonly string[];
};

/** The default selection: a working app with the UI kit, and no auth. */
export const DEFAULT_SELECTION: PackageSelection = {
  auth: "none",
  packages: ["ui", "api-client"],
};

export type ResolvedSelection = {
  /** The choice this was resolved from, kept for reporting and for `add app`. */
  selection: PackageSelection;
  /**
   * Every internal package the project keeps, dependency-first — the union of
   * core packages, the selected optional ones, the auth packages implied by the
   * auth choice, and everything those transitively depend on.
   */
  keptPackages: readonly InternalPackage[];
  /** Names of `keptPackages`, for quick membership tests. */
  keptNames: ReadonlySet<string>;
  /**
   * Template packages that must be REMOVED from the generated project, and every
   * reference to them rewritten or dropped. The complement of `keptNames` over
   * the whole template.
   */
  prunedNames: readonly string[];
  /**
   * Packages that were not explicitly selected but came in as dependencies, so
   * the CLI can say why they are there instead of appearing to ignore the
   * selection (e.g. `form-builder` without `ui` still installs `ui`).
   */
  impliedNames: readonly string[];
};

/**
 * Resolve a user's selection into the concrete package set the project keeps.
 *
 * Dependency closure is intentional, not a workaround: `form-builder` imports
 * `ui`, and honoring "form-builder yes, ui no" literally would generate a project
 * that doesn't compile. Pulling the dependency in and REPORTING it is the only
 * coherent reading of the request.
 *
 * Throws on an unknown package name — a typo'd `--packages` value must fail at
 * the CLI boundary rather than silently scaffold a subset.
 */
export function resolveSelection(selection: PackageSelection): ResolvedSelection {
  const requested = [
    ...CORE_PACKAGE_NAMES,
    ...selection.packages,
    ...authPackageNames(selection.auth),
  ];

  // `resolveWithDependencies` also applies `defaultProvider`, which is what makes
  // `auth-ui` arrive with a provider behind it. Here the provider is already
  // explicit from the auth choice, so that rule is a no-op — but going through the
  // same resolver keeps one implementation of the graph walk.
  const keptPackages = resolveWithDependencies(dedupe(requested));
  const keptNames = new Set(keptPackages.map((pkg) => pkg.name));

  const explicit = new Set(requested);
  const impliedNames = keptPackages.map((pkg) => pkg.name).filter((name) => !explicit.has(name));

  const prunedNames = INTERNAL_PACKAGES.map((pkg) => pkg.name).filter(
    (name) => !keptNames.has(name)
  );

  return { selection, keptPackages, keptNames, prunedNames, impliedNames };
}

/**
 * The packages an auth choice brings in: the chosen provider plus the shared auth
 * UI. `auth-core` is not listed — it is a dependency of every provider, so the
 * resolver adds it.
 *
 * `none` brings in nothing at all, including no `auth-ui`: components with no
 * contract behind them are exactly the dangling-reference problem issue #3 is
 * about.
 */
function authPackageNames(auth: AuthChoice): string[] {
  const provider = AUTH_PROVIDER_PACKAGE[auth];
  return provider ? [provider, "auth-ui"] : [];
}

/** Whether a selection includes any auth at all. */
export function hasAuth(selection: PackageSelection): boolean {
  return selection.auth !== "none";
}

/** The provider package name for a choice, or null for `none`. */
export function authProviderPackage(auth: AuthChoice): string | null {
  return AUTH_PROVIDER_PACKAGE[auth];
}

/**
 * Parse a `--packages a,b,c` value into optional package names.
 *
 * Returns null when any entry is not an offerable optional package, so the caller
 * can report the invalid value along with what IS available. An empty value means
 * "no optional packages", which is valid and distinct from invalid.
 */
export function parsePackageNames(value: string): string[] | null {
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === "none") {
    return [];
  }
  const names = trimmed.split(",").map((name) => name.trim());
  const allOffered = names.every((name) => OPTIONAL_PACKAGE_NAMES.includes(name));
  const allUnique = new Set(names).size === names.length;
  return allOffered && allUnique ? names : null;
}

/** Parse an `--auth` value. Returns null when it isn't a supported choice. */
export function parseAuthChoice(value: string): AuthChoice | null {
  const normalized = value.trim().toLowerCase();
  return AUTH_CHOICES.includes(normalized as AuthChoice) ? (normalized as AuthChoice) : null;
}

function dedupe(names: readonly string[]): string[] {
  return [...new Set(names)];
}
