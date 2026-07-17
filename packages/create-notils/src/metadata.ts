import { join } from "node:path";

import { readJsonFile, writeJsonFile } from "./filesystem.js";

// The root package.json fields we manage. Everything else is preserved as-is.
type RootPackageJson = {
  name: string;
  version?: string;
  private?: boolean;
  description?: string;
  keywords?: string[];
  repository?: unknown;
  author?: unknown;
  scripts?: Record<string, string>;
} & Record<string, unknown>;

// Scripts that only make sense in the create-notils repository itself —
// publishing the CLI and cutting releases. They reference create-notils and
// changesets, so they must never appear in a scaffolded project.
const SCAFFOLD_ONLY_SCRIPTS = ["changeset", "version-packages", "release"];

/**
 * Reset the generated root package.json to clean, project-neutral metadata.
 *
 * This is the deliberate fix for issue #13: we do NOT let the blind
 * `create-notils -> <name>` source rename decide package.json metadata, because
 * that corrupts starter-owned fields (repository URL, description, keywords,
 * release scripts point at a package that no longer exists). Instead we run this
 * AFTER the rename and set those fields explicitly.
 *
 * Optional `description` / `repositoryUrl` come from CLI flags when provided.
 */
export async function resetRootMetadata(
  projectRoot: string,
  options: { projectName: string; description?: string; repositoryUrl?: string }
): Promise<void> {
  const packageJsonPath = join(projectRoot, "package.json");
  const packageJson = await readJsonFile<RootPackageJson>(packageJsonPath);

  packageJson.name = options.projectName;
  packageJson.version = "0.1.0";
  packageJson.private = true;
  packageJson.description = options.description ?? "";
  packageJson.keywords = [];
  packageJson.repository = options.repositoryUrl
    ? { type: "git", url: options.repositoryUrl }
    : undefined;
  packageJson.author = undefined;

  if (packageJson.scripts) {
    for (const scriptName of SCAFFOLD_ONLY_SCRIPTS) {
      delete packageJson.scripts[scriptName];
    }
  }

  // Drop keys we set to `undefined` so they don't serialize as `null`.
  for (const key of Object.keys(packageJson)) {
    if (packageJson[key] === undefined) {
      delete packageJson[key];
    }
  }

  await writeJsonFile(packageJsonPath, packageJson);
}
