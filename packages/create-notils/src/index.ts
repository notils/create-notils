import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cancel, intro, log, note, outro, spinner } from "@clack/prompts";
import pc from "picocolors";
import tiged from "tiged";

import { generateApps } from "./apps.js";
import { parseCli } from "./cli.js";
import {
  type PackageManager,
  promptPackageManager,
  resolveScaffoldConfig,
  type ScaffoldConfig,
} from "./config.js";
import { replaceInDirectoryTree } from "./filesystem.js";
import { initializeGitRepository } from "./git.js";
import { resetRootMetadata } from "./metadata.js";
import { runCommand } from "./process.js";
import { writeGeneratedReadme } from "./readme.js";
import {
  alignPackageManagerField,
  configurePreCommitHook,
  stripInternalPaths,
  TEMPLATE_REF,
  TEMPLATE_REPOSITORY,
} from "./scaffold.js";

/** The CLI's own version, read from its package.json, shown in the intro. */
function readCliVersion(): string {
  const packageJsonPath = join(dirname(fileURLToPath(import.meta.url)), "..", "package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { version: string };
  return packageJson.version;
}

/** Print a cancellation message and exit non-zero. */
function abort(message: string): never {
  cancel(message);
  process.exit(1);
}

/**
 * Whether we can prompt interactively. When there is no TTY (CI, piped input),
 * prompting would hang, so the caller should rely on flags / defaults instead.
 */
function canPromptInteractively(): boolean {
  return process.stdin.isTTY === true;
}

/** How to invoke a run-script for the chosen package manager. */
function runScript(packageManager: PackageManager, script: string): string {
  return packageManager === "npm" ? `npm run ${script}` : `${packageManager} ${script}`;
}

async function fetchTemplate(targetDirectory: string): Promise<void> {
  const emitter = tiged(`${TEMPLATE_REPOSITORY}#${TEMPLATE_REF}`, { cache: false, force: true });
  await emitter.clone(targetDirectory);
}

async function installDependencies(
  projectRoot: string,
  packageManager: PackageManager
): Promise<void> {
  // Package managers resolve via `.cmd` shims on Windows and need a shell there;
  // everywhere else, run without one.
  await runCommand(packageManager, ["install"], {
    workingDirectory: projectRoot,
    useShell: process.platform === "win32",
  });
}

/**
 * Apply every transform the scaffolded copy needs, in order. Kept as one small
 * function so the sequence reads top-to-bottom:
 *   strip internals → rebrand source → reset metadata → generate apps →
 *   write README → align package manager + hook.
 */
async function configureProject(
  projectRoot: string,
  config: ScaffoldConfig,
  cliVersion: string
): Promise<void> {
  await stripInternalPaths(projectRoot);

  // Rename the source identifier only. package.json metadata is fixed explicitly
  // below (never via this blind rename) — see docs/issue #13.
  await replaceInDirectoryTree(projectRoot, [
    { find: "create-notils", replaceWith: config.projectName },
  ]);
  await resetRootMetadata(projectRoot, { projectName: config.projectName });

  if (config.projectType === "monorepo") {
    await generateApps(projectRoot, config.appNames, config.bundleIdentifierPrefix);
  }

  await writeGeneratedReadme(projectRoot, {
    projectName: config.projectName,
    projectType: config.projectType,
    packageManager: config.packageManager,
    cliVersion,
  });

  await alignPackageManagerField(projectRoot, config.packageManager);
  await configurePreCommitHook(projectRoot, config.packageManager);
}

function printNextSteps(config: ScaffoldConfig): void {
  const { projectName, packageManager, installDependencies: didInstall } = config;
  const lines = [
    `cd ${projectName}`,
    didInstall ? null : `${packageManager} install`,
    `${runScript(packageManager, "dev")}   # start the dev server on http://localhost:3000`,
  ].filter((line): line is string => line !== null);

  note(lines.join("\n"), "Next steps");
}

async function main(): Promise<void> {
  const cliVersion = readCliVersion();

  // Parse first: commander handles `--help` / `--version` (prints and exits)
  // before we render the intro banner, so that output stays clean.
  const parsed = parseCli(process.argv.slice(2), cliVersion);

  intro(`${pc.bgCyan(pc.black(" create-notils "))} ${pc.dim(`v${cliVersion}`)}`);

  const config = await resolveScaffoldConfig(parsed);

  // If no package-manager flag was given and we're interactive, ask now.
  if (parsed.options.pm === undefined && parsed.options.yes !== true && canPromptInteractively()) {
    config.packageManager = await promptPackageManager();
  }

  const targetDirectory = resolve(process.cwd(), config.projectName);
  if (existsSync(targetDirectory)) {
    abort(`Directory "${config.projectName}" already exists.`);
  }

  const progress = spinner();

  progress.start(`Fetching template (${TEMPLATE_REPOSITORY}#${TEMPLATE_REF})`);
  try {
    await fetchTemplate(targetDirectory);
  } catch (error) {
    progress.stop("Failed to fetch template");
    abort(error instanceof Error ? error.message : String(error));
  }
  progress.stop("Template fetched");

  progress.start("Configuring project");
  await configureProject(targetDirectory, config, cliVersion);
  progress.stop("Project configured");

  if (config.installDependencies) {
    progress.start(`Installing dependencies with ${config.packageManager}`);
    try {
      await installDependencies(targetDirectory, config.packageManager);
      progress.stop("Dependencies installed");
    } catch (error) {
      progress.stop("Install failed — you can run it manually");
      log.warn(error instanceof Error ? error.message : String(error));
    }
  }

  if (config.initializeGit) {
    progress.start("Initializing git repository");
    const result = await initializeGitRepository(targetDirectory);
    progress.stop(result === "initialized" ? "Git repository initialized" : "Skipped git init");
  }

  printNextSteps(config);
  outro(pc.green("Your create-notils project is ready 🎉"));
}

main().catch((error) => {
  abort(error instanceof Error ? error.message : String(error));
});
