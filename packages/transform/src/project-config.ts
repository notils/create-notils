import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { pathExists, readJsonFile, writeJsonFile } from "./filesystem.js";

/**
 * `notils.json` — the config that tells `@notils/cli add` where to write, and the
 * detection that infers it when the file is absent (a brownfield project).
 *
 * This is deliberately the `components.json` equivalent: a small, hand-editable
 * file recording only what `add` cannot reliably infer. It is written by
 * create-notils at scaffold time and by `@notils/cli init` otherwise.
 */

export const CONFIG_FILE_NAME = "notils.json";

export type ProjectShape = "monorepo" | "standalone";

export type ProjectPaths = {
  /** Workspace packages root. Monorepo only. */
  packages: string;
  /** Where folded library packages go. Standalone only. */
  lib: string;
  /** Where UI components go. Standalone only. */
  components: string;
};

/**
 * What `add` recorded about one installed package.
 *
 * Only the ref for now. It's an object rather than a bare string so a later
 * field (a content hash, an install timestamp) doesn't force a schema break.
 */
export type InstalledRecord = {
  /** The template ref its source came from, e.g. "v0.2.0". */
  ref: string;
};

export type NotilsConfig = {
  $schema?: string;
  shape: ProjectShape;
  /**
   * The project's own package scope, WITH the leading `@` and no trailing slash
   * (e.g. `@my-app`). Monorepo only — a monorepo scaffold renames `@notils/*` to
   * its own scope, so `add` must write imports in that scope. `null` for
   * standalone, which has no scope (everything is `@/*`).
   */
  scope: string | null;
  paths: ProjectPaths;
  /**
   * Which packages `add` has written, and from which ref — so `list` can report
   * drift when the CLI has moved on.
   *
   * OPTIONAL, and absent means "unknown", never "nothing installed". Configs
   * written before this field existed, and every scaffolded project (whose
   * packages came from the scaffold, not from `add`), have no record — but the
   * packages are on disk. `list` reports those as installed with an unknown
   * ref rather than claiming they're missing.
   */
  installed?: Record<string, InstalledRecord>;
};

/** Defaults matching what create-notils itself scaffolds. */
const DEFAULT_PATHS: ProjectPaths = {
  packages: "packages",
  lib: "src/lib",
  components: "src/components",
};

export function configPath(projectRoot: string): string {
  return join(projectRoot, CONFIG_FILE_NAME);
}

export async function readProjectConfig(projectRoot: string): Promise<NotilsConfig | null> {
  const filePath = configPath(projectRoot);
  if (!(await pathExists(filePath))) {
    return null;
  }
  return await readJsonFile<NotilsConfig>(filePath);
}

export async function writeProjectConfig(projectRoot: string, config: NotilsConfig): Promise<void> {
  await writeJsonFile(configPath(projectRoot), {
    $schema: "https://notils.dev/schema.json",
    ...config,
  });
}

/**
 * Record that `packageNames` were installed from `ref`, merging into whatever is
 * already there.
 *
 * Re-reads the config rather than taking one in hand: `add` may have written the
 * file earlier in the same run (via `init`), and clobbering it with a stale
 * in-memory copy would drop those edits.
 */
export async function recordInstalled(
  projectRoot: string,
  packageNames: readonly string[],
  ref: string
): Promise<void> {
  const config = await readProjectConfig(projectRoot);
  if (!config) {
    return;
  }
  const installed = { ...config.installed };
  for (const name of packageNames) {
    installed[name] = { ref };
  }
  await writeProjectConfig(projectRoot, { ...config, installed });
}

/**
 * Strip comments from a JSONC string so `JSON.parse` accepts it. tsconfig.json is
 * JSONC and real ones do carry comments.
 *
 * Written as a small scanner rather than a regex on purpose: a naive
 * `//`-stripping regex corrupts any `//` inside a string literal, and tsconfigs
 * routinely contain `"$schema": "https://..."`. That exact bug bit while building
 * this, so the scanner tracks string state.
 */
function stripJsonComments(source: string): string {
  let result = "";
  let inString = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    const next = source[index + 1];

    if (inLineComment) {
      if (char === "\n") {
        inLineComment = false;
        result += char;
      }
      continue;
    }
    if (inBlockComment) {
      if (char === "*" && next === "/") {
        inBlockComment = false;
        index++;
      }
      continue;
    }
    if (inString) {
      result += char;
      // A backslash escapes the next character, including a quote.
      if (char === "\\") {
        result += next ?? "";
        index++;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      result += char;
      continue;
    }
    if (char === "/" && next === "/") {
      inLineComment = true;
      index++;
      continue;
    }
    if (char === "/" && next === "*") {
      inBlockComment = true;
      index++;
      continue;
    }
    result += char;
  }
  return result;
}

/** Parse a JSONC file (tsconfig.json et al). Returns null if absent or unparseable. */
async function readJsoncFile<T>(filePath: string): Promise<T | null> {
  if (!(await pathExists(filePath))) {
    return null;
  }
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(stripJsonComments(raw)) as T;
  } catch {
    // A malformed tsconfig is the user's problem to fix, but it must not crash
    // detection — fall back to defaults and let them confirm.
    return null;
  }
}

type RootPackageJson = {
  name?: string;
  workspaces?: string[] | { packages?: string[] };
};

type TsConfig = {
  compilerOptions?: { paths?: Record<string, string[]> };
};

type ComponentsJson = {
  aliases?: { components?: string; lib?: string; ui?: string };
};

/** Normalize `workspaces` (array or yarn-style object) to a plain array. */
function workspaceGlobs(pkg: RootPackageJson): string[] {
  const { workspaces } = pkg;
  if (Array.isArray(workspaces)) return workspaces;
  if (workspaces && Array.isArray(workspaces.packages)) return workspaces.packages;
  return [];
}

/**
 * Turn an alias target into a directory path relative to the project root.
 * Returns "" for a target that resolves to the root itself.
 *
 *   "./src/*" → "src"
 *   "./*"     → ""        (a Next.js app with app/ at the root, no src/)
 *   "*"       → ""
 *
 * The root case matters: an app-router project without `src/` aliases `@/*` to
 * `./*`, and stripping only a trailing "/*" leaves a literal "*" that ends up in
 * paths like "*&#47;lib". Real brownfield projects hit this.
 */
function aliasTargetToDirectory(target: string): string {
  const withoutPrefix = target.replace(/^\.\//, "");
  const withoutGlob = withoutPrefix.replace(/\/?\*+$/, "");
  return withoutGlob.replace(/\/$/, "");
}

/**
 * Read the package scope from the workspace packages themselves — the only
 * authoritative source. Returns the most common scope among them, so one
 * oddly-scoped package doesn't outvote the rest.
 */
async function detectWorkspaceScope(
  projectRoot: string,
  packagesRoot: string
): Promise<string | null> {
  const root = join(projectRoot, packagesRoot);
  if (!(await pathExists(root))) {
    return null;
  }
  let entries: string[];
  try {
    entries = (await readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return null;
  }

  const counts = new Map<string, number>();
  for (const entry of entries) {
    const pkg = await readJsoncFile<{ name?: string }>(join(root, entry, "package.json"));
    const name = pkg?.name;
    if (name?.startsWith("@") && name.includes("/")) {
      const candidate = name.split("/")[0];
      if (candidate) {
        counts.set(candidate, (counts.get(candidate) ?? 0) + 1);
      }
    }
  }
  if (counts.size === 0) {
    return null;
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

export type DetectionResult = {
  config: NotilsConfig;
  /**
   * Human-readable reasons for each inference, so `init` can show its work
   * rather than asking the user to trust a silent guess.
   */
  reasons: string[];
  /** True when the project looks nothing like ours and every value is a default. */
  lowConfidence: boolean;
};

/**
 * Infer a `NotilsConfig` for a project that has no `notils.json`.
 *
 * Monorepo detection is `workspaces` + a `packages/` directory — the same
 * markers the flatten transform already relies on. Standalone paths come from
 * `tsconfig.json`'s `@/*` alias (which gives the source root) refined by
 * `components.json`'s aliases when present.
 *
 * This never throws: an undetectable project yields defaults plus
 * `lowConfidence`, and the caller is expected to confirm interactively.
 */
export async function detectProjectConfig(projectRoot: string): Promise<DetectionResult> {
  const reasons: string[] = [];

  const rootPackage = await readJsoncFile<RootPackageJson>(join(projectRoot, "package.json"));
  const globs = rootPackage ? workspaceGlobs(rootPackage) : [];
  const hasPackagesDirectory = await pathExists(join(projectRoot, "packages"));
  const isMonorepo = globs.length > 0 && hasPackagesDirectory;

  // Where workspace packages live, from the globs (`packages/*` → `packages`).
  const packagesRoot =
    globs
      .map((glob) => glob.replace(/\/\*+$/, ""))
      .find((dir) => dir && dir !== "apps" && !dir.includes("*")) ?? DEFAULT_PATHS.packages;

  if (isMonorepo) {
    reasons.push(
      `monorepo — package.json has workspaces (${globs.join(", ")}) and packages/ exists`
    );
  } else if (globs.length > 0) {
    reasons.push("standalone — workspaces declared but no packages/ directory");
  } else {
    reasons.push("standalone — no workspaces in package.json");
  }

  // Scope: a monorepo's own package scope. Read it from an ACTUAL workspace
  // package rather than inferring from the root name — the root name is not a
  // reliable source (this very repo is named `create-notils` at the root but
  // scopes its packages `@notils/*`). Fall back to the root name only when no
  // scoped workspace package can be read.
  let scope: string | null = null;
  if (isMonorepo) {
    scope = await detectWorkspaceScope(projectRoot, packagesRoot);
    if (scope) {
      reasons.push(`scope ${scope} — from a package under ${packagesRoot}/`);
    } else {
      const name = rootPackage?.name ?? "";
      if (name.startsWith("@")) {
        scope = name.split("/")[0] ?? null;
        reasons.push(`scope ${scope} — from the scoped root package name "${name}"`);
      } else if (name) {
        scope = `@${name}`;
        reasons.push(
          `scope ${scope} — GUESSED from root package name "${name}"; no scoped package found under ${packagesRoot}/`
        );
      } else {
        reasons.push("scope unknown — root package.json has no name; please confirm");
      }
    }
  }

  // Standalone paths, from the tsconfig alias then components.json.
  const paths: ProjectPaths = { ...DEFAULT_PATHS, packages: packagesRoot };
  let sourceRoot: string | null = null;

  const tsconfig = await readJsoncFile<TsConfig>(join(projectRoot, "tsconfig.json"));
  const aliasTargets = tsconfig?.compilerOptions?.paths?.["@/*"];
  if (aliasTargets?.[0]) {
    sourceRoot = aliasTargetToDirectory(aliasTargets[0]);
    reasons.push(`source root "${sourceRoot}" — from tsconfig "@/*" → "${aliasTargets[0]}"`);
  } else if (await pathExists(join(projectRoot, "src"))) {
    sourceRoot = "src";
    reasons.push('source root "src" — no "@/*" alias, but src/ exists');
  } else if (await pathExists(join(projectRoot, "app"))) {
    // An app-router project without src/ — Next.js's other supported layout.
    sourceRoot = "";
    reasons.push('source root "." — app/ at the project root, no src/');
  }

  if (sourceRoot !== null) {
    const prefix = sourceRoot === "" ? "" : `${sourceRoot}/`;
    paths.lib = `${prefix}lib`;
    paths.components = `${prefix}components`;
  }

  const components = await readJsoncFile<ComponentsJson>(join(projectRoot, "components.json"));
  const componentsAlias = components?.aliases?.components;
  if (componentsAlias?.startsWith("@/") && sourceRoot !== null) {
    const prefix = sourceRoot === "" ? "" : `${sourceRoot}/`;
    paths.components = `${prefix}${componentsAlias.slice("@/".length)}`;
    reasons.push(
      `components "${paths.components}" — from components.json alias "${componentsAlias}"`
    );
  }

  const lowConfidence = !isMonorepo && sourceRoot === null;
  if (lowConfidence) {
    reasons.push("could not locate a source root — falling back to defaults");
  }

  return {
    config: { shape: isMonorepo ? "monorepo" : "standalone", scope, paths },
    reasons,
    lowConfidence,
  };
}
