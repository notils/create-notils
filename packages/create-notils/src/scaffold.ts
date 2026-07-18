import { tmpdir } from "node:os";
import { join } from "node:path";

import type { PackageManager } from "./config.js";
import {
  readJsonFile,
  removePath,
  replaceInDirectoryTree,
  writeJsonFile,
  writeTextFile,
} from "./filesystem.js";
import { getCommandOutput } from "./process.js";

// The template is the create-notils repository itself, pinned to a release tag
// for reproducible scaffolds. Bump this when cutting a new template release.
// Override with NOTILS_TEMPLATE_REF for local testing against a branch.
export const TEMPLATE_REPOSITORY = "notils/create-notils";
export const TEMPLATE_REF = process.env.NOTILS_TEMPLATE_REF ?? "v0.1.0";

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
 *
 * turbo hard-requires this field (or the legacy `packageManager` string) to
 * run at all — a monorepo scaffold without one fails with "Could not resolve
 * workspace... Missing devEngines.packageManager" the moment `turbo run dev`
 * is invoked. And unlike npm's own devEngines check, turbo's parser rejects
 * a name-only entry ("devEngines.packageManager.version is required"), so a
 * real version is mandatory whenever this field is written at all.
 *
 * The template only has one legitimate version to carry over: bun's own pin.
 * For any other manager there's nothing safe to reuse — hardcoding some
 * other version would either be wrong or, worse, force-pin a version the
 * user doesn't have. So for a non-bun manager, detect the version actually
 * installed on this machine (`<manager> --version`) — it's the same tool
 * about to run `install`/`dev` anyway, so this is both accurate and free.
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

  // Detect from a neutral directory, NOT projectRoot: at this point the
  // scaffold's package.json still carries the template's original
  // `devEngines: bun` pin (this function is what overwrites it, further
  // down) — pnpm/npm/bun each enforce that pin themselves when invoked
  // inside a directory that declares it, so running `<manager> --version`
  // from inside the scaffold can itself fail for an unrelated reason.
  const version =
    packageManager === "bun"
      ? existing?.packageManager?.version
      : await getCommandOutput(packageManager, ["--version"], {
          workingDirectory: tmpdir(),
          useShell: process.platform === "win32",
        });

  if (!version) {
    // Couldn't determine a real version for the chosen manager (not
    // installed on this machine) — remove the stale bun-specific pin rather
    // than leave a wrong or unparseable devEngines behind; turbo's own error
    // message is a clearer signal than a misleading one.
    delete packageJson.devEngines;
    await writeJsonFile(packageJsonPath, packageJson);
    return;
  }

  packageJson.devEngines = {
    ...existing,
    packageManager: { name: packageManager, version },
  };
  await writeJsonFile(packageJsonPath, packageJson);
}

/**
 * The template's Next.js scripts run through `bun run --bun`, a bun-only
 * runtime flag that breaks under any other package manager (it invokes bun
 * regardless of what was chosen). It also ships its own `bun.lock`. Both are
 * fine to leave when bun is the chosen manager; otherwise strip the prefix
 * (leaving plain `next dev` / `next build` / `next start`) and drop the stale
 * lockfile so install generates the right one.
 */
export async function removeBunArtifacts(
  projectRoot: string,
  packageManager: PackageManager
): Promise<void> {
  if (packageManager === "bun") {
    return;
  }
  await replaceInDirectoryTree(projectRoot, [{ find: "bun run --bun ", replaceWith: "" }]);
  await removePath(join(projectRoot, "bun.lock"));
}

/**
 * pnpm does not read the package.json `workspaces` field — that's npm/yarn/bun
 * convention. Without a `pnpm-workspace.yaml`, pnpm can't see `apps/*` /
 * `packages/*` as workspace members at all, so every `workspace:*` dependency
 * fails to resolve and `pnpm install` hard-errors. A no-op for a standalone
 * scaffold (no `workspaces` field) or any manager other than pnpm.
 *
 * Deliberately NOT handled here: pnpm also skips a dependency's native
 * build/postinstall script (e.g. sharp's) unless explicitly allow-listed,
 * which makes `pnpm install` exit non-zero even though the rest of the
 * install succeeded. The allow-list's config key has already changed once
 * across pnpm major versions (`onlyBuiltDependencies` in v10, `allowBuilds` in
 * v11) with no forwards compatibility, so hardcoding either schema into the
 * template risks silently breaking again on a future pnpm release. That's
 * exactly the scenario pnpm's own `pnpm approve-builds` exists for — it's
 * stable across pnpm's internal config churn, so it's left as a manual step.
 */
export async function configurePnpmWorkspace(
  projectRoot: string,
  packageManager: PackageManager
): Promise<void> {
  if (packageManager !== "pnpm") {
    return;
  }
  const packageJsonPath = join(projectRoot, "package.json");
  const packageJson = await readJsonFile<Record<string, unknown>>(packageJsonPath);
  const workspaces = packageJson.workspaces as string[] | undefined;
  if (!workspaces) {
    return;
  }

  delete packageJson.workspaces;
  await writeJsonFile(packageJsonPath, packageJson);

  const yaml = `packages:\n${workspaces.map((glob) => `  - "${glob}"`).join("\n")}\n`;
  await writeTextFile(join(projectRoot, "pnpm-workspace.yaml"), yaml);
}
