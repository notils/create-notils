import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { confirm, isCancel, log, note, select, spinner } from "@clack/prompts";
import pc from "picocolors";

import { PRUNABLE_APP_DIRECTORIES, planAppContent } from "@notils/transform/app-content";
import { pathExists, readJsonFile, removePath, writeJsonFile } from "@notils/transform/filesystem";
import { INTERNAL_PACKAGES } from "@notils/transform/packages";
import { tryRunCommand } from "@notils/transform/process";
import { appsRoot, type NotilsConfig } from "@notils/transform/project-config";
import { rewriteScopeInSource, TEMPLATE_SCOPE } from "@notils/transform/specifiers";

import type { AddAppOptions } from "./cli.js";
import { cleanupFetched, fetchAppSource, templateRef } from "./fetch.js";
import { CancelledError, loadOrInitConfig } from "./init.js";

/**
 * `add app <name>` — add another application to an existing monorepo (issue #1).
 *
 * The point of the command is that a monorepo grows: the scaffold can create
 * several apps up front, but afterwards adding one meant copying an existing app
 * by hand and fixing up its name, port, and workspace wiring. This does that
 * mechanically, from the same template the scaffold used.
 *
 * Two things it deliberately reads from the project rather than assuming:
 *
 *   - **where apps live** — from `notils.json`'s `paths.apps` (issue #4 asks for
 *     the manifest to drive the CLI instead of hardcoded structure);
 *   - **which capabilities exist** — a new app must not import `auth-ui` in a
 *     project that never installed it, so the app-content plan is computed from
 *     what is actually on disk.
 */

/** Files/directories in the fetched app that never belong in a generated copy. */
const SKIPPED_ENTRIES = new Set(["node_modules", ".turbo", ".next", "dist", "README.md"]);

/** Where the first app's dev server sits; each new app takes the next free port. */
const FIRST_DEV_PORT = 3000;

type AppPackageJson = {
  name?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
} & Record<string, unknown>;

/** App and project names: lowercase letters/numbers/dashes, starting alphanumeric. */
function isValidAppName(name: string): boolean {
  return /^[a-z0-9][a-z0-9-]*$/.test(name);
}

export async function runAddApp(
  projectRoot: string,
  appName: string,
  options: AddAppOptions
): Promise<void> {
  const config = await loadOrInitConfig(projectRoot, { yes: options.yes });

  // A standalone project has no `apps/` and only one application by definition.
  // Refuse rather than inventing a directory that nothing in the project reads —
  // and say what the alternative is, since "not supported" alone is unhelpful.
  if (config.shape !== "monorepo") {
    throw new Error(
      "`add app` only works in a monorepo — this project is standalone (one app at the root).\n" +
        "  To run several apps, scaffold a monorepo with `create-notils` and move this code into it."
    );
  }

  if (!isValidAppName(appName)) {
    throw new Error(
      `Invalid app name "${appName}". Use lowercase letters, numbers, and dashes, starting with a letter or number.`
    );
  }

  const apps = appsRoot(config);
  const appsDirectory = join(projectRoot, apps);
  const targetDirectory = join(appsDirectory, appName);

  // Duplicate detection is an explicit acceptance criterion: overwriting an
  // existing app would destroy work, so this is an error, never a --force option.
  if (await pathExists(targetDirectory)) {
    throw new Error(
      `${apps}/${appName} already exists. Choose a different name, or delete that directory first.`
    );
  }

  const existingApps = await listExistingApps(appsDirectory);
  const devPort = await nextFreeDevPort(appsDirectory, existingApps);

  // What this project actually has, so the new app matches it rather than the
  // template's full feature set.
  const installedPackages = await detectInstalledPackages(projectRoot, config);
  const includeDemo = await resolveIncludeDemo(options, installedPackages);
  const plan = planAppContent({ keptPackages: installedPackages, includeDemo });

  note(
    [
      `${pc.bold(appName)} ${pc.dim(`→ ${apps}/${appName}`)}`,
      `${pc.dim("port")}      ${devPort}`,
      `${pc.dim("app")}       ${includeDemo ? "demo (example pages included)" : "fresh (no example content)"}`,
      `${pc.dim("uses")}      ${[...installedPackages].filter((name) => name !== "config").join(", ") || pc.dim("(no shared packages installed)")}`,
    ].join("\n"),
    options.dryRun ? "Would create" : "New app"
  );

  if (options.dryRun) {
    log.info("Dry run — nothing was written.");
    return;
  }

  if (!options.yes) {
    const proceed = await confirm({ message: `Create ${apps}/${appName}?`, initialValue: true });
    if (isCancel(proceed)) throw new CancelledError();
    if (!proceed) {
      log.info("Nothing was written.");
      return;
    }
  }

  const progress = spinner();
  progress.start(`Fetching the app template (${templateRef()})`);
  const fetched = await fetchAppSource();
  progress.stop("Template fetched");

  try {
    progress.start(`Creating ${apps}/${appName}`);
    const fileCount = await copyAppTree(fetched, targetDirectory, config);
    await configureAppPackageJson(targetDirectory, {
      appName,
      devPort,
      scope: config.scope,
      installedPackages,
      fetchedRoot: fetched,
    });
    await applyContentPlan(targetDirectory, plan);
    await rewriteLayoutAndPage(targetDirectory, appName, installedPackages, plan, includeDemo);
    progress.stop(`Created ${apps}/${appName} (${fileCount} file(s))`);
  } finally {
    await cleanupFetched(fetched);
  }

  await ensureWorkspaceGlob(projectRoot, apps);

  log.success(`${apps}/${appName} is ready.`);
  log.message(
    pc.dim(
      `  Install workspace dependencies, then run it: ${pc.cyan(`turbo run dev --filter=${appName}`)} (http://localhost:${devPort})`
    )
  );

  if (!options.skipFormat) {
    await formatProject(projectRoot);
  }
}

/**
 * Fresh app or demo app — asked, not assumed.
 *
 * `--demo` / `--no-demo` win when given, and `--yes` takes the fresh default
 * without asking. Otherwise this PROMPTS, matching what `create-notils` asks at
 * scaffold time: silently defaulting meant `--demo` was the only way to discover
 * the option existed at all.
 *
 * Skipped when the project has no `auth-ui` and no `form-builder`, because then
 * there is no demo content left to include — every demo file needs one of them, so
 * the question would have exactly one possible answer.
 */
async function resolveIncludeDemo(
  options: AddAppOptions,
  installedPackages: Set<string>
): Promise<boolean> {
  if (options.demo !== undefined) {
    return options.demo;
  }

  const hasDemoContent = installedPackages.has("auth-ui") || installedPackages.has("form-builder");
  if (!hasDemoContent) {
    return false;
  }

  // No TTY (CI, piped input) or `--yes`: take the documented default rather than
  // hanging on a prompt nobody can answer.
  if (options.yes || process.stdin.isTTY !== true) {
    return false;
  }

  const answer = await select({
    message: "What would you like to create?",
    options: [
      {
        value: false,
        label: "Fresh app (recommended)",
        hint: "a clean, production-ready starting point",
      },
      {
        value: true,
        label: "Demo app",
        hint: "example pages wired to this project's capabilities",
      },
    ],
    initialValue: false,
  });
  if (isCancel(answer)) throw new CancelledError();
  return answer;
}

/** Existing app directory names, or an empty list when `apps/` doesn't exist yet. */
async function listExistingApps(appsDirectory: string): Promise<string[]> {
  try {
    return (await readdir(appsDirectory, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

/**
 * The lowest dev port not already claimed by an existing app.
 *
 * Reads each app's `dev` script rather than counting directories: apps may have
 * been renamed, removed, or had their ports edited by hand, and handing a new app
 * a port another one already uses means `turbo run dev` fails for whichever loses
 * the race — a confusing failure to debug.
 */
async function nextFreeDevPort(appsDirectory: string, existingApps: string[]): Promise<number> {
  const taken = new Set<number>();
  for (const app of existingApps) {
    const packageJson = await readJsonFile<AppPackageJson>(
      join(appsDirectory, app, "package.json")
    ).catch(() => null);
    const match = packageJson?.scripts?.dev?.match(/--port\s+(\d+)/);
    if (match?.[1]) {
      taken.add(Number(match[1]));
    }
  }
  let port = FIRST_DEV_PORT;
  while (taken.has(port)) {
    port++;
  }
  return port;
}

/**
 * Which internal packages this project actually has, by looking for their
 * directories under the configured packages root.
 *
 * Disk rather than `notils.json`'s `installed` record: that record only covers
 * what `notils add` wrote, and is explicitly documented as "absent means unknown"
 * — a scaffolded project has every package on disk with no record at all. The
 * directories are the ground truth for whether an import will resolve.
 */
async function detectInstalledPackages(
  projectRoot: string,
  config: NotilsConfig
): Promise<Set<string>> {
  const installed = new Set<string>();
  for (const pkg of INTERNAL_PACKAGES) {
    if (await pathExists(join(projectRoot, config.paths.packages, pkg.name))) {
      installed.add(pkg.name);
    }
  }
  return installed;
}

/**
 * Copy the fetched app tree into the target, rewriting the template scope to the
 * project's own as each file is written.
 *
 * `package.json` is skipped here and regenerated by `configureAppPackageJson`:
 * the template's version carries this monorepo's dependency pins and its own app
 * name, neither of which belongs in a generated app.
 */
async function copyAppTree(
  fetchedRoot: string,
  targetRoot: string,
  config: NotilsConfig
): Promise<number> {
  const files = await listFiles(fetchedRoot);
  let written = 0;

  for (const relativePath of files) {
    const source = join(fetchedRoot, relativePath);
    const destination = join(targetRoot, relativePath);
    await mkdir(dirname(destination), { recursive: true });

    // Standalone never reaches here (rejected above), so a scope always exists —
    // but treat its absence as "leave the template scope alone" rather than
    // writing `null/ui`.
    if (config.scope && isRewritable(relativePath)) {
      // Source files: specifier-aware, so prose mentioning `@notils/ui` in a doc
      // comment is left alone.
      const contents = await readFile(source, "utf8");
      await writeFile(destination, rewriteScopeInSource(contents, config.scope), "utf8");
    } else if (config.scope && isScopedConfigFile(relativePath)) {
      // JSON config: `tsconfig.json` and `biome.json` reference shared presets by
      // package name (`"extends": "@notils/config/tsconfig.nextjs.json"`). Those
      // are NOT module specifiers, so the specifier-aware rewrite skips them — and
      // an app whose tsconfig extends a package that doesn't exist here inherits
      // no compiler options at all, which surfaces as "Cannot use JSX unless the
      // '--jsx' flag is provided" rather than as a missing file.
      const contents = await readFile(source, "utf8");
      await writeFile(destination, rewriteScopeInJson(contents, config.scope), "utf8");
    } else {
      await writeFile(destination, await readFile(source));
    }
    written++;
  }
  return written;
}

/**
 * Config files whose CONTENT references shared packages by name rather than by
 * module specifier — so they need the plain scope substitution below.
 *
 * An explicit list, not "every .json": `package.json` is regenerated (and must
 * not be blindly rewritten), and a data file that happens to contain the string
 * `@notils/` should not be silently edited.
 */
const SCOPED_CONFIG_FILES = new Set(["tsconfig.json", "biome.json", "components.json"]);

function isScopedConfigFile(relativePath: string): boolean {
  const name = relativePath.split(/[\\/]/).pop() ?? "";
  return SCOPED_CONFIG_FILES.has(name);
}

/**
 * Replace the template scope with the project's, everywhere it appears.
 *
 * A blunt string replacement, unlike the specifier-aware source rewrite — correct
 * here because these files are pure configuration: every `@notils/` in them IS a
 * package reference, and there is no prose to protect.
 */
function rewriteScopeInJson(contents: string, targetScope: string): string {
  return contents.split(`${TEMPLATE_SCOPE}/`).join(`${targetScope}/`);
}

const REWRITABLE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".css"]);

function isRewritable(fileName: string): boolean {
  const dot = fileName.lastIndexOf(".");
  return dot !== -1 && REWRITABLE_EXTENSIONS.has(fileName.slice(dot));
}

/** Recursively list files under `directory`, relative to it, skipping build output. */
async function listFiles(directory: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (SKIPPED_ENTRIES.has(entry.name)) continue;
    if (entry.isDirectory()) {
      files.push(...(await listFiles(join(directory, entry.name), join(prefix, entry.name))));
      continue;
    }
    // package.json is regenerated, not copied — see configureAppPackageJson.
    if (prefix === "" && entry.name === "package.json") continue;
    files.push(join(prefix, entry.name));
  }
  return files;
}

/**
 * Write the new app's `package.json`: its own name, its own dev port, and
 * workspace dependencies limited to the packages this project actually has.
 *
 * Built from the template's manifest but with every internal dependency
 * re-derived — copying them verbatim is what would leave a new app depending on
 * `@scope/auth-ui` in a project that never installed it.
 */
async function configureAppPackageJson(
  appDirectory: string,
  options: {
    appName: string;
    devPort: number;
    scope: string | null;
    installedPackages: Set<string>;
    /** The fetched template app directory, which still holds its own package.json. */
    fetchedRoot: string;
  }
): Promise<void> {
  const { appName, devPort, scope, installedPackages, fetchedRoot } = options;
  const packageJsonPath = join(appDirectory, "package.json");

  // Read from the FETCHED copy: `copyAppTree` deliberately skips the manifest, so
  // it never lands in the target and must come from the source directory (which
  // the caller keeps alive until this returns).
  const base =
    (await readJsonFile<AppPackageJson>(join(fetchedRoot, "package.json")).catch(() => null)) ?? {};

  const dependencies: Record<string, string> = {};
  for (const [name, version] of Object.entries(base.dependencies ?? {})) {
    // Internal workspace deps: keep only the ones that exist here, re-scoped.
    const internal = internalPackageName(name);
    if (internal !== null) {
      if (installedPackages.has(internal) && scope) {
        dependencies[`${scope}/${internal}`] = "workspace:*";
      }
      continue;
    }
    dependencies[name] = version;
  }

  const devDependencies: Record<string, string> = {};
  for (const [name, version] of Object.entries(base.devDependencies ?? {})) {
    const internal = internalPackageName(name);
    if (internal !== null) {
      if (installedPackages.has(internal) && scope) {
        devDependencies[`${scope}/${internal}`] = "workspace:*";
      }
      continue;
    }
    devDependencies[name] = version;
  }

  const scripts = { ...base.scripts };
  for (const [key, value] of Object.entries(scripts)) {
    // Give this app its own port so `turbo run dev` can run them side by side.
    scripts[key] = value.replace(/--port\s+\d+/, `--port ${devPort}`);
  }
  if (scripts.dev && !/--port\s+\d+/.test(scripts.dev)) {
    scripts.dev = `${scripts.dev} --port ${devPort}`;
  }

  await writeJsonFile(packageJsonPath, {
    ...base,
    name: appName,
    version: "0.1.0",
    private: true,
    scripts,
    ...(Object.keys(dependencies).length > 0 ? { dependencies } : {}),
    ...(Object.keys(devDependencies).length > 0 ? { devDependencies } : {}),
  });
}

/**
 * The internal package name behind a dependency specifier, or null when it is an
 * ordinary external dependency.
 *
 * Matches ANY scope, not just `@notils`: by the time `add app` reads a manifest
 * the specifiers may already be in the project's own scope (`@my-app/ui`), and
 * treating those as external would copy a `workspace:*` range for a package that
 * may not exist here.
 */
function internalPackageName(specifier: string): string | null {
  if (!specifier.startsWith("@") || !specifier.includes("/")) {
    return null;
  }
  const suffix = specifier.slice(specifier.indexOf("/") + 1);
  return INTERNAL_PACKAGES.some((pkg) => pkg.name === suffix) ? suffix : null;
}

/** Delete the planned files, then prune the directories they emptied. */
async function applyContentPlan(
  appDirectory: string,
  plan: ReturnType<typeof planAppContent>
): Promise<void> {
  for (const relativePath of plan.removePaths) {
    await removePath(join(appDirectory, relativePath));
  }

  // After the deletions: the selected provider's wiring moves into
  // `src/lib/auth.ts` once the other provider's file has left that path.
  for (const { from, to } of plan.renames) {
    await rename(join(appDirectory, from), join(appDirectory, to));
  }

  for (const relativePath of PRUNABLE_APP_DIRECTORIES) {
    const directory = join(appDirectory, relativePath);
    try {
      if ((await readdir(directory)).length === 0) {
        await removePath(directory);
      }
    } catch {
      // Already gone, or not a directory.
    }
  }
}

/**
 * Fix up the files that IMPORT what the plan removed, and give the app its own
 * landing page.
 *
 * Same necessity as at scaffold time: deleting the nav bar without editing the
 * layout that renders it produces an app that doesn't compile.
 */
async function rewriteLayoutAndPage(
  appDirectory: string,
  appName: string,
  installedPackages: Set<string>,
  plan: ReturnType<typeof planAppContent>,
  includeDemo: boolean
): Promise<void> {
  const hasUi = installedPackages.has("ui");
  const layoutPath = join(appDirectory, "src", "app", "layout.tsx");

  let layout = await readFile(layoutPath, "utf8").catch(() => null);
  if (layout !== null) {
    layout = layout
      .replace(/title:\s*"[^"]*"/, `title: "${appName}"`)
      .replace(/description:\s*"[^"]*"/, `description: "${appName}"`);

    if (!plan.keepsNavBar) {
      layout = layout
        .replace(/^import\s+\{\s*NavBar\s*\}\s+from\s+"[^"]*";\n/m, "")
        .replace(/^\s*<NavBar\s*\/>\n/m, "");
    }
    if (!hasUi) {
      layout = layout
        .replace(/^import\s+\{\s*ThemeProvider\s*\}\s+from\s+"[^"]*";\n/m, "")
        .replace(/^\s*<ThemeProvider[^>]*>\n/m, "")
        .replace(/^\s*<\/ThemeProvider>\n/m, "");
    }
    await writeFile(layoutPath, layout.replace(/\n{3,}/g, "\n\n"), "utf8");
  }

  if (!hasUi) {
    const globalsPath = join(appDirectory, "src", "app", "globals.css");
    const globals = await readFile(globalsPath, "utf8").catch(() => null);
    if (globals !== null) {
      await writeFile(
        globalsPath,
        globals.replace(/@import\s+["']@[^/"']+\/ui\/globals\.css["'];/, '@import "tailwindcss";'),
        "utf8"
      );
    }
  }

  // The template page renders the example form; it survives only for a demo app
  // that also has form-builder.
  const keepsTemplatePage = includeDemo && !plan.removePaths.includes("src/app/contact-form.tsx");
  if (!keepsTemplatePage) {
    await writeFile(
      join(appDirectory, "src", "app", "page.tsx"),
      freshPage(appName, hasUi),
      "utf8"
    );
  }
}

/**
 * The new app's landing page — the same minimal page a fresh scaffold gets, so an
 * app added later is indistinguishable from one created up front (issue #1's
 * "follows the same conventions" requirement).
 */
function freshPage(appName: string, hasUi: boolean): string {
  const muted = hasUi ? "text-muted-foreground" : "text-zinc-600 dark:text-zinc-400";
  const chip = hasUi ? "bg-muted" : "bg-zinc-100 dark:bg-zinc-800";
  return `export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24">
      <div className="flex w-full max-w-2xl flex-col gap-6">
        <div className="flex flex-col gap-3">
          <p className="${muted} text-sm font-medium tracking-wide uppercase">Notils</p>
          <h1 className="text-4xl leading-tight font-semibold tracking-tight">${appName}</h1>
          <p className="${muted} text-lg">
            Your app starts here. Edit{" "}
            <code className="${chip} rounded px-1.5 py-0.5 font-mono text-sm">
              src/app/page.tsx
            </code>{" "}
            to replace this page.
          </p>
        </div>
      </div>
    </main>
  );
}
`;
}

/**
 * Make sure the workspace globs cover the apps directory.
 *
 * Almost always already true — but a project whose apps root is unconventional,
 * or which never had an `apps/` workspace, would otherwise get an app the package
 * manager cannot see, which is issue #1's "recognized by the workspace" criterion.
 * Handles both the `package.json` `workspaces` field and `pnpm-workspace.yaml`.
 */
async function ensureWorkspaceGlob(projectRoot: string, apps: string): Promise<void> {
  const glob = `${apps}/*`;

  const pnpmWorkspacePath = join(projectRoot, "pnpm-workspace.yaml");
  if (await pathExists(pnpmWorkspacePath)) {
    const contents = await readFile(pnpmWorkspacePath, "utf8");
    if (contents.includes(apps)) {
      return;
    }
    await writeFile(pnpmWorkspacePath, `${contents.trimEnd()}\n  - "${glob}"\n`, "utf8");
    log.info(`Added ${pc.cyan(glob)} to pnpm-workspace.yaml.`);
    return;
  }

  const packageJsonPath = join(projectRoot, "package.json");
  const packageJson = await readJsonFile<{
    workspaces?: string[] | { packages?: string[] };
  }>(packageJsonPath).catch(() => null);
  if (!packageJson) {
    return;
  }

  const globs = Array.isArray(packageJson.workspaces)
    ? packageJson.workspaces
    : packageJson.workspaces?.packages;
  if (!globs || globs.some((entry) => entry === glob || entry === apps)) {
    return;
  }

  globs.push(glob);
  await writeJsonFile(packageJsonPath, packageJson);
  log.info(`Added ${pc.cyan(glob)} to the workspaces field.`);
}

/** Run the project's own formatter over the new app, as `add` does. */
async function formatProject(projectRoot: string): Promise<void> {
  const packageJson = await readJsonFile<{ scripts?: Record<string, string> }>(
    join(projectRoot, "package.json")
  ).catch(() => ({ scripts: undefined }));
  const script = packageJson.scripts?.["lint:fix"]
    ? "lint:fix"
    : packageJson.scripts?.format
      ? "format"
      : null;
  if (!script) {
    return;
  }

  const manager = (await detectPackageManager(projectRoot)) ?? "npm";
  const progress = spinner();
  progress.start(`Formatting with ${manager} run ${script}`);
  const ok = await tryRunCommand(manager, ["run", script], {
    workingDirectory: projectRoot,
    useShell: process.platform === "win32",
  });
  progress.stop(ok ? "Formatted" : `Could not run ${script} — run it yourself`);
}

async function detectPackageManager(projectRoot: string): Promise<string | null> {
  const packageJson = await readJsonFile<{ packageManager?: string }>(
    join(projectRoot, "package.json")
  ).catch(() => ({ packageManager: undefined }));
  const declared = packageJson.packageManager?.split("@")[0];
  if (declared) {
    return declared;
  }
  for (const [lockfile, manager] of [
    ["bun.lock", "bun"],
    ["pnpm-lock.yaml", "pnpm"],
    ["yarn.lock", "yarn"],
    ["package-lock.json", "npm"],
  ] as const) {
    if (await pathExists(join(projectRoot, lockfile))) {
      return manager;
    }
  }
  return null;
}
