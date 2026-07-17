import { join } from "node:path";

import type { PackageManager } from "./config.js";
import { readJsonFile, removePath, writeJsonFile, writeTextFile } from "./filesystem.js";

// The template is the create-notils repository itself, pinned to a release tag
// for reproducible scaffolds. Bump this when cutting a new template release.
// Override with NOTILS_TEMPLATE_REF for local testing against a branch.
export const TEMPLATE_REPOSITORY = "notils/create-notils";
export const TEMPLATE_REF = process.env.NOTILS_TEMPLATE_REF ?? "main";

/**
 * Paths inside the template that must NEVER end up in a scaffolded project.
 * These are create-notils's own development artifacts — the CLI package, the
 * internal dev skill and settings, the design docs, changelogs, and VCS/build
 * output. A fresh project starts clean (see docs/issue #10).
 *
 * Deliberately KEPT (shipped to scaffolds): AGENTS.md, .husky/pre-commit, the
 * end-user `app-guide` and `shadcn` skills, and their `.claude/skills` links.
 */
export const PATHS_TO_STRIP = [
  // The CLI itself and its build cache.
  "packages/create-notils",
  ".turbo",
  // VCS history — the scaffold gets a fresh `git init`.
  ".git",
  // Husky's generated internals; `prepare: husky` recreates them on install.
  ".husky/_",
  // Internal-only agent context (the shipped app-guide skill stays).
  ".agents/skills/notils-project",
  ".claude/skills/notils-project",
  ".claude/settings.json",
  // Design docs and skill lockfile that describe building create-notils itself.
  "docs",
  "skills-lock.json",
  // Changelogs document create-notils's history, not the user's project.
  "CHANGELOG.md",
];

/**
 * Remove every path in `PATHS_TO_STRIP` from the scaffolded project. Missing
 * paths are ignored, so this is safe as the template evolves.
 */
export async function stripInternalPaths(projectRoot: string): Promise<void> {
  await Promise.all(
    PATHS_TO_STRIP.map((relativePath) => removePath(join(projectRoot, relativePath)))
  );
}

/**
 * Rewrite the pre-commit hook to use the chosen package manager. The template's
 * hook is written for Bun; a project scaffolded with a different manager needs
 * its own runner so the hook works immediately after install (see docs/issue #16).
 *
 * The hook itself stays a warning-free blocking quality gate: format + safe lint
 * fixes, re-stage, then a blocking typecheck.
 */
export async function configurePreCommitHook(
  projectRoot: string,
  packageManager: PackageManager
): Promise<void> {
  const hookPath = join(projectRoot, ".husky", "pre-commit");
  const run = (script: string) =>
    packageManager === "npm" ? `npm run ${script}` : `${packageManager} ${script}`;

  const contents = `# Auto-fix + format the whole workspace, then re-stage anything Biome changed,
# and finally gate on typecheck so broken types never get committed.
${run("lint:unsafe")}
git add -A
${run("typecheck")}
`;
  await writeTextFile(hookPath, contents);
}

/**
 * Ensure the scaffold's root package.json advertises the chosen package manager
 * via `devEngines.packageManager`, so contributors are steered to the right tool.
 * A no-op if the field can't be read.
 */
export async function alignPackageManagerField(
  projectRoot: string,
  packageManager: PackageManager
): Promise<void> {
  const packageJsonPath = join(projectRoot, "package.json");
  const packageJson = await readJsonFile<Record<string, unknown>>(packageJsonPath);
  const existing = packageJson.devEngines as
    | { packageManager?: { name?: string; version?: string } }
    | undefined;

  packageJson.devEngines = {
    ...existing,
    packageManager: { ...existing?.packageManager, name: packageManager },
  };
  await writeJsonFile(packageJsonPath, packageJson);
}
