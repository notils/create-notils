import { existsSync, readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cancel, intro, log, note, outro, spinner } from "@clack/prompts";
import pc from "picocolors";
import tiged from "tiged";

import { type AppContentPlan, planAppContent } from "@notils/transform/app-content";
import { runCommand } from "@notils/transform/process";
import { writeProjectConfig } from "@notils/transform/project-config";
import { type ResolvedSelection, resolveSelection } from "@notils/transform/selection";

import { rewriteAppSource } from "./app-source.js";
import { generateApps } from "./apps.js";
import { parseCli } from "./cli.js";
import {
  type PackageManager,
  promptPackageManager,
  resolveScaffoldConfig,
  type ScaffoldConfig,
} from "./config.js";
import { configureEnvironments } from "./environment.js";
import { replaceInDirectoryTree } from "./filesystem.js";
import { flattenToStandalone } from "./flatten.js";
import { initializeGitRepository } from "./git.js";
import { resetRootMetadata } from "./metadata.js";
import { rewritePackageReadmes } from "./package-readmes.js";
import {
  applyAppContentPlan,
  removePrunedDependencies,
  removePrunedPackageDirectories,
} from "./prune.js";
import { writeGeneratedReadme } from "./readme.js";
import {
  addNotilsCli,
  alignPackageManagerField,
  configurePnpmWorkspace,
  configurePreCommitHook,
  configureSkills,
  normalizeWorkspaceProtocol,
  removeBunArtifacts,
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
 * Re-sort imports across the scaffolded project.
 *
 * Both shapes rewrite module specifiers after the template is fetched —
 * standalone maps `@notils/ui/*` to `@/components/*` and `@notils/<lib>/*` to
 * `@/lib/<lib>/*`; monorepo renames the `@notils/` scope to the project's own.
 * Either rewrite changes how the specifiers sort, so imports that were ordered
 * in the template no longer are, and the project would open with import-sort
 * diagnostics on ~13 files. Biome's own sorter is the only correct implementation
 * of the configured groups, so run it rather than reimplementing the ordering.
 *
 * Best-effort: requires the project's Biome devDependency, so this only runs
 * after a successful install, and a failure never fails the scaffold.
 */
async function sortImports(projectRoot: string, packageManager: PackageManager): Promise<void> {
  await runCommand(packageManager, ["run", "lint:fix"], {
    workingDirectory: projectRoot,
    useShell: process.platform === "win32",
  });
}

/** What `configureProject` decided, so the caller can report it to the user. */
type ConfigureResult = {
  selection: ResolvedSelection;
  appContentPlan: AppContentPlan;
};

/**
 * Apply every transform the scaffolded copy needs, in order. Kept as one small
 * function so the sequence reads top-to-bottom:
 *   strip internals → rebrand source → reset metadata → generate apps →
 *   prune unselected capabilities → write README → align package manager + hook.
 */
async function configureProject(
  projectRoot: string,
  config: ScaffoldConfig,
  cliVersion: string
): Promise<ConfigureResult> {
  await stripInternalPaths(projectRoot);

  // Rename the source identifier only (never package.json metadata — that is
  // handled explicitly, see docs/issue #13). This does not touch the
  // `@notils/ui` package scope, so it is safe to run before flatten.
  await replaceInDirectoryTree(projectRoot, [
    { find: "create-notils", replaceWith: config.projectName },
  ]);

  // Resolve the selection ONCE and reuse it: the package prune, the app-content
  // prune, and the report must all be driven by the same decision.
  const selection = resolveSelection(config.selection);
  const appContentPlan = planAppContent({
    keptPackages: selection.keptNames,
    includeDemo: config.includeDemo,
  });

  if (config.projectType === "monorepo") {
    // Monorepo: reset the root metadata, then expand the template app into the
    // requested set of apps.
    await resetRootMetadata(projectRoot, { projectName: config.projectName });
    await generateApps(projectRoot, config.appNames);

    // Prune BEFORE the scope rename below: the dependency prune matches on the
    // literal `@notils/<name>` specifier, so running it afterwards would find
    // nothing and silently leave every stale workspace dependency in place.
    await removePrunedPackageDirectories(projectRoot, selection);
    await removePrunedDependencies(projectRoot, selection);

    // Apply the app-content plan to every generated app. Each app is a copy of
    // the same template app, so they all need the same treatment.
    for (const appName of config.appNames) {
      const appDirectory = join(projectRoot, "apps", appName);
      await applyAppContentPlan(appDirectory, appContentPlan);
      await rewriteAppSource(appDirectory, {
        plan: appContentPlan,
        projectName: config.projectName,
        includeDemo: config.includeDemo,
        hasUi: selection.keptNames.has("ui"),
        rewriteStylesheet: true,
      });
    }

    // Fix up each surviving package's README: its `../../docs/` links point at a
    // directory that never ships (see PATHS_TO_STRIP), so every scaffold used to
    // carry dead links. Same rewriter `@notils/cli add` uses, so both paths agree.
    await rewritePackageReadmes(projectRoot, { scope: `@${config.projectName}` });

    // The internal workspace packages (packages/ui, packages/config) keep the
    // `@notils/*` scope otherwise — rename it to the project's own scope, across
    // package names, workspace deps, tsconfig/biome `extends`, path aliases, and
    // source imports. Standalone doesn't need this: flattenToStandalone already
    // strips the `@notils/ui` scope entirely, and its rewrite depends on that
    // literal string, so this must run only here, after generateApps has copied
    // every requested app.
    await replaceInDirectoryTree(projectRoot, [
      { find: "@notils/", replaceWith: `@${config.projectName}/` },
    ]);
  } else {
    // Standalone. Prune FIRST, before flattening: flatten folds every package
    // directory it finds into src/lib/ and merges their dependencies, so a
    // package still on disk here would end up in the flattened project no matter
    // what was selected.
    await removePrunedPackageDirectories(projectRoot, selection);
    await removePrunedDependencies(projectRoot, selection);

    // The app-content prune also runs pre-flatten, while the app is still at
    // apps/app — the paths in the plan are app-relative, and flatten promotes the
    // app to the root afterwards. Doing it now means flatten's package.json merge
    // and specifier rewrite never see the removed files.
    const templateAppDirectory = join(projectRoot, "apps", "app");
    await applyAppContentPlan(templateAppDirectory, appContentPlan);
    await rewriteAppSource(templateAppDirectory, {
      plan: appContentPlan,
      projectName: config.projectName,
      includeDemo: config.includeDemo,
      hasUi: selection.keptNames.has("ui"),
      rewriteStylesheet: false,
    });

    // Fold packages/ui + packages/config into a single Next app and promote it to
    // the root. flattenToStandalone writes clean root metadata itself, so no
    // separate resetRootMetadata is needed.
    await flattenToStandalone(projectRoot, config.projectName);
  }

  // Record the shape/scope/paths for `@notils/cli add` (see
  // docs/add-command-design.md). Written from the values we KNOW here, rather
  // than leaving `add` to re-detect them later — detection exists for brownfield
  // projects, and a scaffold shouldn't have to rely on it.
  await writeProjectConfig(projectRoot, {
    shape: config.projectType,
    // A monorepo scaffold renames the `@notils/*` scope to its own (see above);
    // standalone has no scope at all — everything resolves through `@/*`.
    scope: config.projectType === "monorepo" ? `@${config.projectName}` : null,
    // `lib`/`components` are the standalone fold targets. They're unused in a
    // monorepo (where `add` writes a whole package under `packages/`), but kept
    // as the scaffold's own defaults so the file has one shape in both cases.
    //
    // `apps` is written for a monorepo only — that's where `notils add app`
    // creates new applications. A standalone project has no apps directory, and
    // recording one would imply the command works there.
    paths: {
      packages: "packages",
      lib: "src/lib",
      components: "src/components",
      ...(config.projectType === "monorepo" ? { apps: "apps" } : {}),
    },
  });

  // After the shape branch: the module lands in packages/config (monorepo) or
  // src/ (standalone), and standalone only has its final root after flatten.
  await configureEnvironments(projectRoot, {
    setup: config.environmentSetup,
    projectName: config.projectName,
    projectType: config.projectType,
    scope: config.projectType === "monorepo" ? `@${config.projectName}` : null,
    hasBetterAuth: selection.keptNames.has("auth-better-auth"),
  });

  await writeGeneratedReadme(projectRoot, {
    projectName: config.projectName,
    projectType: config.projectType,
    packageManager: config.packageManager,
    cliVersion,
    includeSkills: config.includeSkills,
    selection,
    environmentSetup: config.environmentSetup,
    includeDemo: config.includeDemo,
  });

  // After the shape branch: standalone promotes the app to the root, which moves
  // CLAUDE.md, so wiring the skill any earlier would edit a file that then gets
  // replaced.
  await configureSkills(projectRoot, config.includeSkills);

  // After the shape branch above, so the root package.json it edits is the final
  // one (both resetRootMetadata and flattenToStandalone rewrite that file).
  await addNotilsCli(projectRoot);

  await alignPackageManagerField(projectRoot, config.packageManager);
  await removeBunArtifacts(projectRoot, config.packageManager);
  await configurePnpmWorkspace(projectRoot, config.packageManager);
  await normalizeWorkspaceProtocol(projectRoot, config.packageManager);
  await configurePreCommitHook(projectRoot, config.packageManager);

  return { selection, appContentPlan };
}

/**
 * Report what the selection produced: which capabilities are in, which were left
 * out, and anything that came along as a dependency.
 *
 * The implied-packages line matters most. Selecting `form-builder` without `ui`
 * still installs `ui`, and saying so is the difference between "the CLI respected
 * my choice and explained an unavoidable consequence" and "the CLI ignored me".
 */
function reportSelection(config: ScaffoldConfig, configured: ConfigureResult): void {
  const { selection, appContentPlan } = configured;

  const kept = selection.keptPackages.filter((pkg) => pkg.name !== "config").map((pkg) => pkg.name);
  const lines = [
    `${pc.green("included")}  ${kept.length > 0 ? kept.join(", ") : pc.dim("(none — a bare Next.js app)")}`,
    `${pc.dim("auth")}      ${config.selection.auth}`,
    `${pc.dim("env")}       ${config.environmentSetup}`,
    `${pc.dim("app")}       ${config.includeDemo ? "demo (example pages included)" : "fresh (no example content)"}`,
  ];

  if (selection.impliedNames.length > 0) {
    lines.push(
      `${pc.cyan("also")}      ${selection.impliedNames.join(", ")} ${pc.dim("(required by what you selected)")}`
    );
  }
  if (selection.prunedNames.length > 0) {
    lines.push(`${pc.dim("left out")}  ${pc.dim(selection.prunedNames.join(", "))}`);
  }
  if (appContentPlan.removePaths.length > 0) {
    lines.push(
      `${pc.dim("removed")}   ${pc.dim(`${appContentPlan.removePaths.length} template file(s) you didn't ask for`)}`
    );
  }

  note(lines.join("\n"), "Your project");

  // Better Auth's demo runs on an in-memory store so `dev` works with no database
  // to provision. That is the right default for a template and the wrong one for
  // production, so say it once here rather than relying on the file's own comment
  // being read.
  if (config.includeDemo && config.selection.auth === "better-auth") {
    log.info(
      "Better Auth is wired to an in-memory store, so sign-ups reset when the server restarts."
    );
    log.message(
      pc.dim(
        "  Swap `database` in src/lib/auth-better-auth-server.ts for a real adapter when you need persistence."
      )
    );
  }
}

function printNextSteps(config: ScaffoldConfig): void {
  const { projectName, packageManager, installDependencies: didInstall, scaffoldInPlace } = config;
  const lines = [
    scaffoldInPlace ? null : `cd ${projectName}`,
    didInstall ? null : `${packageManager} install`,
    `${runScript(packageManager, "dev")}   # start the dev server on http://localhost:3000`,
  ].filter((line): line is string => line !== null);

  note(lines.join("\n"), "Next steps");
}

/** Abort if the current directory has anything in it — `.` must only scaffold into an empty one. */
async function ensureCurrentDirectoryIsEmpty(directory: string): Promise<void> {
  const entries = await readdir(directory);
  if (entries.length > 0) {
    abort(
      `Current directory is not empty — clear it first, or run create-notils in (or with) a new, empty directory.`
    );
  }
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

  const targetDirectory = config.scaffoldInPlace
    ? process.cwd()
    : resolve(process.cwd(), config.projectName);

  if (config.scaffoldInPlace) {
    await ensureCurrentDirectoryIsEmpty(targetDirectory);
  } else if (existsSync(targetDirectory)) {
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
  const configured = await configureProject(targetDirectory, config, cliVersion);
  progress.stop("Project configured");

  reportSelection(config, configured);

  let installed = false;
  if (config.installDependencies) {
    progress.start(`Installing dependencies with ${config.packageManager}`);
    try {
      await installDependencies(targetDirectory, config.packageManager);
      installed = true;
      progress.stop("Dependencies installed");
    } catch (error) {
      progress.stop("Install failed — you can run it manually");
      log.warn(error instanceof Error ? error.message : String(error));
    }
  }

  // Needs the project's Biome, so only once install actually succeeded. Runs
  // before git init so the initial commit already has sorted imports.
  if (installed) {
    progress.start("Sorting imports");
    try {
      await sortImports(targetDirectory, config.packageManager);
      progress.stop("Imports sorted");
    } catch (error) {
      progress.stop("Import sort skipped — run lint:fix manually");
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
