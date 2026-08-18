import { readdir } from "node:fs/promises";
import { join } from "node:path";

import { type AppContentPlan, PRUNABLE_APP_DIRECTORIES } from "@notils/transform/app-content";
import type { ResolvedSelection } from "@notils/transform/selection";

import { readJsonFile, removePath, writeJsonFile } from "./filesystem.js";

/**
 * Remove the capabilities a project didn't select, and every reference to them.
 *
 * Issue #3 is explicit that this must NOT be "copy everything, then delete
 * folders": a project left importing a package that no longer exists doesn't
 * build, which is worse than the bloat it was meant to fix. So each prune has
 * three parts, and all three run:
 *
 *   1. the package directory itself,
 *   2. every workspace dependency on it (root and per-app package.json),
 *   3. the app files that import it (via the app-content plan).
 *
 * Part 3 is planned in `@notils/transform/app-content` rather than here, because
 * `@notils/cli add app` needs the same decision when generating a new app.
 */

type PackageJsonWithDeps = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
} & Record<string, unknown>;

/** Remove the pruned packages' directories under `packages/`. */
export async function removePrunedPackageDirectories(
  projectRoot: string,
  selection: ResolvedSelection
): Promise<void> {
  await Promise.all(
    selection.prunedNames.map((name) => removePath(join(projectRoot, "packages", name)))
  );
}

/**
 * Drop dependencies on pruned packages from one package.json.
 *
 * Matches on the `@notils/<name>` specifier, so this must run BEFORE the scope
 * rename (`@notils/` → `@<project>/`) in the monorepo path. The caller enforces
 * that ordering; getting it backwards silently leaves every stale dependency in
 * place, which is why it's stated here too.
 */
async function removeDependenciesFrom(
  packageJsonPath: string,
  prunedSpecifiers: ReadonlySet<string>
): Promise<void> {
  let packageJson: PackageJsonWithDeps;
  try {
    packageJson = await readJsonFile<PackageJsonWithDeps>(packageJsonPath);
  } catch {
    // No package.json here (or unreadable) — nothing to prune.
    return;
  }

  let changed = false;
  for (const field of ["dependencies", "devDependencies", "peerDependencies"] as const) {
    const deps = packageJson[field];
    if (!deps) {
      continue;
    }
    for (const name of Object.keys(deps)) {
      if (prunedSpecifiers.has(name)) {
        delete deps[name];
        changed = true;
      }
    }
    // Leave no empty dependency object behind.
    if (Object.keys(deps).length === 0) {
      delete packageJson[field];
      changed = true;
    }
  }

  if (changed) {
    await writeJsonFile(packageJsonPath, packageJson);
  }
}

/**
 * Remove workspace dependencies on pruned packages from the root package.json and
 * from every app and surviving package.
 *
 * Walks the surviving packages too, not just the apps: a kept package may depend
 * on a pruned one (nothing does today, but the graph is hand-maintained and this
 * costs one directory listing).
 */
export async function removePrunedDependencies(
  projectRoot: string,
  selection: ResolvedSelection
): Promise<void> {
  const prunedSpecifiers = new Set(selection.prunedNames.map((name) => `@notils/${name}`));
  if (prunedSpecifiers.size === 0) {
    return;
  }

  const targets = [join(projectRoot, "package.json")];

  for (const parent of ["apps", "packages"]) {
    const parentPath = join(projectRoot, parent);
    let entries: string[];
    try {
      entries = (await readdir(parentPath, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
    } catch {
      // Absent in a standalone scaffold (or before generateApps runs).
      continue;
    }
    for (const entry of entries) {
      targets.push(join(parentPath, entry, "package.json"));
    }
  }

  await Promise.all(targets.map((target) => removeDependenciesFrom(target, prunedSpecifiers)));
}

/**
 * Apply an app-content plan to one app directory: delete the planned files, then
 * prune any directory they emptied.
 *
 * Directory pruning is best-effort and only removes EMPTY directories — a user's
 * own file in `src/components/` must survive a fresh-app scaffold, and
 * `PRUNABLE_APP_DIRECTORIES` is deepest-first so a parent is only considered after
 * its children are gone.
 */
export async function applyAppContentPlan(
  appDirectory: string,
  plan: AppContentPlan
): Promise<void> {
  await Promise.all(plan.removePaths.map((path) => removePath(join(appDirectory, path))));

  for (const relative of PRUNABLE_APP_DIRECTORIES) {
    await removeDirectoryIfEmpty(join(appDirectory, relative));
  }
}

async function removeDirectoryIfEmpty(directory: string): Promise<void> {
  try {
    const entries = await readdir(directory);
    if (entries.length === 0) {
      await removePath(directory);
    }
  } catch {
    // Missing already, or not a directory — nothing to do.
  }
}
