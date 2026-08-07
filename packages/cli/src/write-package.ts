import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

import { pathExists } from "@notils/transform/filesystem";
import type { InternalPackage } from "@notils/transform/packages";
import type { NotilsConfig } from "@notils/transform/project-config";
import { rewriteScopeInSource, rewriteSpecifiersInSource } from "@notils/transform/specifiers";

import { targetDirectory } from "./installed.js";

/**
 * Decide what a package's files should look like in the target project, and
 * write them — without clobbering anything the user has edited.
 *
 * The plan/apply split is deliberate: `--dry-run` needs the full picture before
 * anything touches disk, and the confirmation prompt should show real numbers.
 */

/**
 * Root files we never copy verbatim. `package.json` and `tsconfig.json` ARE
 * needed in a monorepo target, but must be regenerated rather than copied — see
 * `manifestFilesFor`. README documents the package inside our monorepo, not the
 * user's copy of it.
 */
const SKIPPED_FILES = new Set(["tsconfig.json", "package.json", "README.md"]);
const SKIPPED_DIRECTORIES = new Set(["node_modules", ".turbo", "dist", ".git"]);

export type PlannedFile = {
  /** Path relative to the project root. */
  relativePath: string;
  /** Final contents, after specifier/scope rewriting. */
  contents: string;
  status: "new" | "unchanged" | "modified";
};

export type PackagePlan = {
  pkg: InternalPackage;
  files: PlannedFile[];
  /**
   * External (non-`@notils/*`) dependency NAMES this package declares, read from
   * its fetched package.json.
   *
   * Names only — never the version ranges, which are this monorepo's own pins
   * and must not propagate into a user's project. Read from source rather than a
   * hardcoded list in the CLI, because a hardcoded list drifts silently: `ui`
   * gained `next-themes` and the CLI's copy never learned about it, so a
   * brownfield `add ui` produced code importing a package it never mentioned.
   */
  externalDependencies: string[];
};

/** Extensions whose module specifiers get rewritten. Everything else copies as-is. */
const REWRITABLE = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".css"]);

function isRewritable(fileName: string): boolean {
  const dot = fileName.lastIndexOf(".");
  return dot !== -1 && REWRITABLE.has(fileName.slice(dot));
}

/** Recursively list files under `directory`, as paths relative to it. */
async function listFiles(directory: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
      files.push(...(await listFiles(join(directory, entry.name), join(prefix, entry.name))));
      continue;
    }
    if (SKIPPED_FILES.has(entry.name) && prefix === "") continue;
    files.push(join(prefix, entry.name));
  }
  return files;
}

/**
 * Map one fetched file to its destination in the target project.
 *
 * A package's `src/` contents land at the target directory root — `src/http.ts`
 * in the fetched `api-client` becomes `<lib>/api-client/http.ts`, matching what
 * the flatten transform produces at scaffold time. Non-`src` files (README) are
 * dropped: they document the package in the monorepo, not the user's copy.
 */
function destinationFor(
  fetchedRelative: string,
  pkg: InternalPackage,
  config: NotilsConfig
): string | null {
  const normalized = fetchedRelative.split("\\").join("/");
  if (!normalized.startsWith("src/")) {
    return null;
  }
  const withinSrc = normalized.slice("src/".length);

  if (config.shape === "monorepo") {
    // A monorepo keeps the package shape, so src/ stays src/.
    return `${config.paths.packages}/${pkg.name}/src/${withinSrc}`;
  }
  if (pkg.fold.kind === "spread") {
    // `ui` spreads across the app's own tree: src/components/... →
    // <components>/..., src/lib/utils.ts → <lib>/utils.ts, and so on.
    return spreadDestination(withinSrc, config);
  }
  return `${config.paths.lib}/${pkg.name}/${withinSrc}`;
}

/**
 * Where a `ui` file lands in a standalone project. Mirrors flatten's fold:
 * components/, lib/, hooks/, theme/ each map to the configured location, and
 * styles/globals.css is deliberately NOT written (the project owns its own
 * stylesheet — merging themes is `add ui`'s own concern, handled separately).
 */
function spreadDestination(withinSrc: string, config: NotilsConfig): string | null {
  const componentsRoot = config.paths.components;
  // `lib`/`hooks`/`theme` sit beside components, under the same source root.
  const sourceRoot = componentsRoot.includes("/")
    ? componentsRoot.slice(0, componentsRoot.lastIndexOf("/"))
    : "";
  const beside = (segment: string) => (sourceRoot ? `${sourceRoot}/${segment}` : segment);

  if (withinSrc.startsWith("components/")) {
    return `${componentsRoot}/${withinSrc.slice("components/".length)}`;
  }
  if (withinSrc.startsWith("lib/")) {
    return `${config.paths.lib}/${withinSrc.slice("lib/".length)}`;
  }
  if (withinSrc.startsWith("hooks/")) {
    return beside(`hooks/${withinSrc.slice("hooks/".length)}`);
  }
  if (withinSrc.startsWith("theme/")) {
    return beside(`theme/${withinSrc.slice("theme/".length)}`);
  }
  // styles/globals.css and anything unrecognized: not ours to place.
  return null;
}

/** Rewrite a fetched file's contents for the target project's shape. */
function transformContents(contents: string, fileName: string, config: NotilsConfig): string {
  if (!isRewritable(fileName)) {
    return contents;
  }
  if (config.shape === "standalone") {
    // Internal specifiers collapse to the `@/*` alias.
    return rewriteSpecifiersInSource(contents);
  }
  // A monorepo keeps package boundaries but owns its own scope.
  return config.scope ? rewriteScopeInSource(contents, config.scope) : contents;
}

/**
 * Generate `package.json` and `tsconfig.json` for a monorepo target.
 *
 * A workspace package is non-functional without a manifest — `@scope/ui` simply
 * won't resolve, so the imports we just rewrote would all be broken. But copying
 * the fetched manifest verbatim would propagate our monorepo's pinned dependency
 * ranges into the user's project, against the never-hand-pin rule. So: rebuild
 * it, keeping the parts that describe the package (name, exports, type) and
 * dropping every version. The user installs deps with the command `add` prints.
 *
 * Standalone targets need neither file — the folded source resolves through the
 * project's own `@/*` alias and single package.json.
 */
async function manifestFilesFor(
  projectRoot: string,
  fetchedRoot: string,
  pkg: InternalPackage,
  config: NotilsConfig
): Promise<PlannedFile[]> {
  if (config.shape !== "monorepo") {
    return [];
  }
  const scope = config.scope ?? "@notils";
  const directory = `${config.paths.packages}/${pkg.name}`;
  const files: PlannedFile[] = [];

  const fetched = await readJson<{
    type?: string;
    exports?: unknown;
    peerDependencies?: Record<string, string>;
  }>(join(fetchedRoot, "package.json"));

  // Rebuild rather than copy: same shape, no versions. Internal deps become
  // `workspace:*` under the project's own scope; external ones are omitted
  // entirely and reported to the user instead.
  const manifest: Record<string, unknown> = {
    name: `${scope}/${pkg.name}`,
    version: "0.1.0",
    private: true,
    ...(fetched?.type ? { type: fetched.type } : {}),
    ...(fetched?.exports ? { exports: fetched.exports } : {}),
  };
  if (pkg.dependsOn.length > 0) {
    manifest.dependencies = Object.fromEntries(
      [...pkg.dependsOn].sort().map((name) => [`${scope}/${name}`, "workspace:*"])
    );
  }
  if (fetched?.peerDependencies) {
    // Peer ranges are compatibility statements ("React 19"), not pins we're
    // choosing — those are meaningful to keep.
    manifest.peerDependencies = fetched.peerDependencies;
  }

  files.push(await planJsonFile(projectRoot, `${directory}/package.json`, manifest));

  // A minimal tsconfig so the package typechecks standalone. Deliberately does
  // NOT extend a shared preset — a brownfield monorepo has no @notils/config.
  files.push(
    await planJsonFile(projectRoot, `${directory}/tsconfig.json`, {
      extends: "../../tsconfig.json",
      compilerOptions: { paths: { [`${scope}/${pkg.name}/*`]: ["./src/*"] } },
      include: ["src"],
      exclude: ["node_modules"],
    })
  );

  return files;
}

async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

/** Build a PlannedFile for generated JSON, with the same status comparison. */
async function planJsonFile(
  projectRoot: string,
  relativePath: string,
  data: unknown
): Promise<PlannedFile> {
  const contents = `${JSON.stringify(data, null, 2)}\n`;
  const absolute = join(projectRoot, relativePath);
  let status: PlannedFile["status"] = "new";
  if (await pathExists(absolute)) {
    const existing = await readFile(absolute, "utf8");
    status = existing === contents ? "unchanged" : "modified";
  }
  return { relativePath, contents, status };
}

/**
 * Build the write plan for one package. Compares against what's on disk so the
 * caller can distinguish "new", "already identical", and "the user edited this".
 *
 * `modified` is the important one: everything we write is the user's source and
 * they're invited to edit it, so an `add` that silently overwrites their work
 * would be a data-loss bug.
 */
export async function planPackage(
  projectRoot: string,
  fetchedRoot: string,
  pkg: InternalPackage,
  config: NotilsConfig
): Promise<PackagePlan> {
  const fetchedFiles = await listFiles(fetchedRoot);
  const files: PlannedFile[] = [];

  for (const fetchedRelative of fetchedFiles) {
    const destination = destinationFor(fetchedRelative, pkg, config);
    if (!destination) {
      continue;
    }
    const raw = await readFile(join(fetchedRoot, fetchedRelative), "utf8");
    const contents = transformContents(raw, fetchedRelative, config);

    const absolute = join(projectRoot, destination);
    let status: PlannedFile["status"] = "new";
    if (await pathExists(absolute)) {
      const existing = await readFile(absolute, "utf8");
      status = existing === contents ? "unchanged" : "modified";
    }
    files.push({ relativePath: destination, contents, status });
  }

  files.push(...(await manifestFilesFor(projectRoot, fetchedRoot, pkg, config)));

  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return {
    pkg,
    files,
    externalDependencies: await readExternalDependencies(fetchedRoot),
  };
}

/**
 * Dependency names the fetched package declares, minus internal `@notils/*`
 * ones (those are resolved through the package graph instead). Names only —
 * see `PackagePlan.externalDependencies`.
 */
async function readExternalDependencies(fetchedRoot: string): Promise<string[]> {
  const manifest = await readJson<{ dependencies?: Record<string, string> }>(
    join(fetchedRoot, "package.json")
  );
  return Object.keys(manifest?.dependencies ?? {})
    .filter((name) => !name.startsWith("@notils/"))
    .sort();
}

/**
 * Write a plan to disk. `force` is required to overwrite `modified` files;
 * without it they're skipped and returned so the caller can report them.
 */
export async function applyPlan(
  projectRoot: string,
  plan: PackagePlan,
  options: { force: boolean }
): Promise<{ written: string[]; skipped: string[] }> {
  const written: string[] = [];
  const skipped: string[] = [];

  for (const file of plan.files) {
    if (file.status === "unchanged") {
      continue;
    }
    if (file.status === "modified" && !options.force) {
      skipped.push(file.relativePath);
      continue;
    }
    const absolute = join(projectRoot, file.relativePath);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, file.contents, "utf8");
    written.push(file.relativePath);
  }

  return { written, skipped };
}

/** Where this package will live, for display. */
export function planLocation(pkg: InternalPackage, config: NotilsConfig): string {
  return targetDirectory(pkg, config) || relative(".", ".");
}
