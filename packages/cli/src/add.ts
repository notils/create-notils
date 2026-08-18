import { join } from "node:path";
import { confirm, isCancel, log, note, spinner } from "@clack/prompts";
import pc from "picocolors";

import { pathExists, readJsonFile } from "@notils/transform/filesystem";
import { type InternalPackage, resolveWithDependencies } from "@notils/transform/packages";
import { tryRunCommand } from "@notils/transform/process";
import { type NotilsConfig, recordInstalled } from "@notils/transform/project-config";

import type { AddOptions } from "./cli.js";
import { checkCompatibility, hasThemeTokens } from "./compat.js";
import { cleanupFetched, fetchPackageSource, templateRef } from "./fetch.js";
import { CancelledError, loadOrInitConfig } from "./init.js";
import { targetDirectory } from "./installed.js";
import { appendThemeLayer, findStylesheet, readThemeLayer, summarizeThemeLayer } from "./theme.js";
import { applyPlan, type PackagePlan, planPackage } from "./write-package.js";

/**
 * `add <packages...>` — resolve the dependency closure, fetch each package,
 * plan the writes, confirm, then apply.
 */
export async function runAdd(
  projectRoot: string,
  requested: string[],
  options: AddOptions
): Promise<void> {
  const config = await loadOrInitConfig(projectRoot, { yes: options.yes });

  // Throws with the available list on an unknown name — a typo should fail
  // loudly rather than install a subset of what was asked for.
  const resolved = resolveWithDependencies(requested);
  const implied = resolved.filter((pkg) => !requested.includes(pkg.name));

  if (implied.length > 0) {
    log.info(
      `${requested.join(", ")} also needs ${pc.cyan(implied.map((p) => p.name).join(", "))}.`
    );
  }

  const { plans, themeLayer } = await planAll(projectRoot, resolved, config);
  const summary = summarize(plans, config);
  note(summary.text, options.dryRun ? "Would write" : "Plan");

  // Report foundation mismatches BEFORE the confirmation (and before the
  // dry-run exit — a dry run is exactly when you want to hear about them), so
  // the decision is informed. Warnings, not refusals: the user may be
  // mid-migration, or may know something we don't.
  const issues = await checkCompatibility(projectRoot, resolved, config);
  for (const issue of issues) {
    log.warn(issue.summary);
    log.message(pc.dim(`  ${issue.remedy}`));
  }

  // Nothing to write doesn't mean nothing to do: missing dependencies and the
  // theme gap are both independent of whether the source files are current, so
  // a re-run on an up-to-date project still surfaces them. (A project whose
  // files are present but whose deps are not still doesn't compile.)
  if (summary.newCount === 0 && summary.modifiedCount === 0) {
    log.success("Source files are already up to date.");
    await mergeDependencies(projectRoot, plans, options, config);
    await offerThemeTokens(projectRoot, config, resolved, themeLayer, options);
    return;
  }

  if (options.dryRun) {
    // Preview the dependency and theme steps too — the point of a dry run is to
    // see everything that would happen, and these are the two that touch things
    // the user already had.
    await mergeDependencies(projectRoot, plans, options, config);
    await offerThemeTokens(projectRoot, config, resolved, themeLayer, options);
    log.info("Dry run — nothing was written.");
    return;
  }

  if (summary.modifiedCount > 0 && !options.force) {
    log.warn(
      `${summary.modifiedCount} file(s) differ from the upstream source — you have edited them, or they are from a different version.`
    );
    log.message(pc.dim("They will be left alone. Re-run with --force to overwrite them instead."));
  }

  if (!options.yes) {
    const proceed = await confirm({ message: "Write these files?", initialValue: true });
    if (isCancel(proceed)) throw new CancelledError();
    if (!proceed) {
      log.info("Nothing was written.");
      return;
    }
  }

  const written: string[] = [];
  const skipped: string[] = [];
  // Packages whose source is now fully at this ref. A package with files left at
  // the user's version is NOT current, so it isn't recorded — otherwise `list`
  // would claim it's up to date while some of its files are an older vintage.
  const atCurrentRef: string[] = [];

  for (const plan of plans) {
    const result = await applyPlan(projectRoot, plan, { force: options.force ?? false });
    written.push(...result.written);
    skipped.push(...result.skipped);
    if (result.skipped.length === 0) {
      atCurrentRef.push(plan.pkg.name);
    }
  }

  log.success(`Wrote ${written.length} file(s).`);
  if (skipped.length > 0) {
    log.warn(`Kept your version of ${skipped.length} file(s):`);
    for (const path of skipped) {
      log.message(pc.dim(`  ${path}`));
    }
  }

  await recordInstalled(projectRoot, atCurrentRef, templateRef());
  await mergeDependencies(projectRoot, plans, options, config);
  await offerThemeTokens(projectRoot, config, resolved, themeLayer, options);

  if (written.length > 0 && !options.skipFormat) {
    await formatWritten(projectRoot);
  }
}

/**
 * Offer to append the theme tokens when the project has none.
 *
 * Without a token layer the components render unstyled, so this is the
 * difference between `add ui` working and appearing broken. But appending to
 * someone's existing stylesheet is invasive, so it's always a prompt — never
 * silent, and `--yes` does NOT auto-accept it (an unattended run shouldn't
 * rewrite CSS it wasn't explicitly asked to touch).
 */
async function offerThemeTokens(
  projectRoot: string,
  config: NotilsConfig,
  packages: InternalPackage[],
  themeLayer: string | null,
  options: AddOptions
): Promise<void> {
  if (!packages.some((pkg) => pkg.name === "ui") || !themeLayer) {
    return;
  }
  if (await hasThemeTokens(projectRoot, config)) {
    return;
  }

  const stylesheet = await findStylesheet(projectRoot, config);
  if (!stylesheet) {
    log.warn("No global stylesheet found, so the theme tokens were not added.");
    log.message(
      pc.dim(
        "  The components need them to render correctly — add a globals.css and re-run, or copy a shadcn theme block in yourself."
      )
    );
    return;
  }

  log.warn(`${pc.cyan(stylesheet)} has no theme tokens — the components will render unstyled.`);
  for (const line of summarizeThemeLayer(themeLayer)) {
    log.message(pc.dim(`  + ${line}`));
  }

  if (options.dryRun) {
    log.info(pc.dim(`  Would offer to append these to ${stylesheet}.`));
    return;
  }

  // `--with-theme` is the explicit opt-in; `--yes` deliberately isn't, because
  // rewriting a stylesheet the user already had is a bigger step than writing
  // new files.
  if (!options.withTheme) {
    // No TTY (CI, piped input) means the prompt can never be answered — it
    // would hang forever. Skip the edit and say how to get it, rather than
    // silently rewriting a stylesheet nobody was there to approve.
    if (process.stdin.isTTY !== true) {
      log.info(
        pc.dim(
          `  Not prompting without a terminal — pass --with-theme to append them, or paste the block into ${stylesheet} yourself.`
        )
      );
      return;
    }

    const accept = await confirm({
      message: `Append them to ${stylesheet}?`,
      initialValue: true,
    });
    if (isCancel(accept)) throw new CancelledError();
    if (!accept) {
      log.info(
        pc.dim(
          "Left your stylesheet alone. The components will look unstyled until you add tokens."
        )
      );
      return;
    }
  }

  await appendThemeLayer(projectRoot, stylesheet, themeLayer);
  log.success(`Appended theme tokens to ${stylesheet}.`);
}

/**
 * Run the project's own formatter over what we wrote.
 *
 * Necessary for the same reason create-notils runs it after scaffolding: the
 * specifier rewrite changes how imports sort, so freshly-written files would
 * otherwise open with import-sort diagnostics. Uses the project's `lint:fix`
 * script so we respect its formatter rather than imposing ours — and stays
 * silent if there isn't one, since a brownfield project need not have Biome.
 */
async function formatWritten(projectRoot: string): Promise<void> {
  const pkg = await readJsonFile<{ scripts?: Record<string, string> }>(
    join(projectRoot, "package.json")
  ).catch(() => ({ scripts: undefined }));
  const script = pkg.scripts?.["lint:fix"] ? "lint:fix" : pkg.scripts?.format ? "format" : null;
  if (!script) {
    log.info(
      pc.dim("No lint:fix/format script here — imports may need sorting by your own formatter.")
    );
    return;
  }

  const manager = await detectPackageManager(projectRoot);
  const progress = spinner();
  progress.start(`Formatting with ${manager} run ${script}`);
  const ok = await tryRunCommand(manager, ["run", script], {
    workingDirectory: projectRoot,
    useShell: process.platform === "win32",
  });
  progress.stop(ok ? "Formatted" : `Could not run ${script} — run it yourself`);
}

/**
 * Fetch and plan every resolved package, cleaning up each temp fetch.
 *
 * Also captures `ui`'s theme layer while its source is still on disk — the
 * fetched directory is deleted immediately after planning, and the theme offer
 * happens later, after the user has confirmed the writes.
 */
async function planAll(
  projectRoot: string,
  packages: InternalPackage[],
  config: NotilsConfig
): Promise<{ plans: PackagePlan[]; themeLayer: string | null }> {
  const plans: PackagePlan[] = [];
  let themeLayer: string | null = null;
  const progress = spinner();

  for (const pkg of packages) {
    progress.start(`Fetching ${pkg.name}`);
    const fetched = await fetchPackageSource(pkg.name);
    try {
      plans.push(await planPackage(projectRoot, fetched, pkg, config));
      if (pkg.name === "ui") {
        themeLayer = await readThemeLayer(fetched);
      }
      progress.stop(`Fetched ${pkg.name}`);
    } finally {
      await cleanupFetched(fetched);
    }
  }
  return { plans, themeLayer };
}

type Summary = { text: string; newCount: number; modifiedCount: number };

function summarize(plans: PackagePlan[], config: NotilsConfig): Summary {
  const lines: string[] = [];
  let newCount = 0;
  let modifiedCount = 0;

  for (const plan of plans) {
    const fresh = plan.files.filter((f) => f.status === "new").length;
    const changed = plan.files.filter((f) => f.status === "modified").length;
    const same = plan.files.filter((f) => f.status === "unchanged").length;
    newCount += fresh;
    modifiedCount += changed;

    const parts = [
      fresh > 0 ? pc.green(`${fresh} new`) : null,
      changed > 0 ? pc.yellow(`${changed} yours`) : null,
      same > 0 ? pc.dim(`${same} identical`) : null,
    ].filter((part): part is string => part !== null);

    lines.push(`${pc.bold(plan.pkg.name)} ${pc.dim(`→ ${targetDirectory(plan.pkg, config)}`)}`);
    lines.push(`  ${parts.length > 0 ? parts.join(pc.dim(" · ")) : pc.dim("nothing to write")}`);
  }

  return { text: lines.join("\n"), newCount, modifiedCount };
}

type PackageJson = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
} & Record<string, unknown>;

/**
 * Report the external dependencies the added packages need, and offer to install
 * them.
 *
 * Deliberately does NOT hand-write version ranges into package.json: the project
 * convention is never to pin, so the user's package manager resolves them.
 *
 * **Where they get installed depends on the shape**, and getting this wrong is a
 * real bug rather than a nicety. In a monorepo a package must declare what it
 * imports or the workspace won't resolve it for that package — installing at the
 * root put `zod` in the ROOT `dependencies` while `packages/auth-custom` still
 * declared nothing. So a monorepo installs into each package's own directory, and
 * the manager writes the range where it belongs.
 */
async function mergeDependencies(
  projectRoot: string,
  plans: PackagePlan[],
  options: AddOptions,
  config: NotilsConfig
): Promise<void> {
  const manager = await detectPackageManager(projectRoot);

  if (config.shape === "monorepo") {
    await installPerPackage(projectRoot, plans, options, config, manager);
    return;
  }

  const target = await readJsonFile<PackageJson>(join(projectRoot, "package.json"));
  const present = new Set([
    ...Object.keys(target.dependencies ?? {}),
    ...Object.keys(target.devDependencies ?? {}),
    ...Object.keys(target.peerDependencies ?? {}),
  ]);

  const needed = new Set<string>();
  for (const plan of plans) {
    for (const dependency of plan.externalDependencies) {
      if (!present.has(dependency)) {
        needed.add(dependency);
      }
    }
  }

  if (needed.size === 0) {
    return;
  }

  const list = [...needed].sort();
  const command = `${manager} add ${list.join(" ")}`;

  // This is NOT advisory: the files we just wrote import these, so the project
  // does not compile until they're installed. Say so plainly — it used to read
  // like the other warnings and was easy to scroll past.
  log.warn(
    `${pc.bold(`${list.length} package(s) must be installed`)} — the code just written imports them, so this project will not compile until they are.`
  );
  for (const dependency of list) {
    log.message(pc.dim(`  ${dependency}`));
  }

  if (options.dryRun) {
    log.info(pc.dim(`  Would offer to run: ${command}`));
    return;
  }

  const shouldInstall = options.withDeps
    ? true
    : process.stdin.isTTY !== true
      ? false
      : await confirmInstall(command, manager);

  if (!shouldInstall) {
    log.message(pc.cyan(`  ${command}`));
    log.message(
      pc.dim(
        options.withDeps === undefined && process.stdin.isTTY !== true
          ? "  Not prompting without a terminal — run that, or pass --with-deps next time."
          : "  Run that before building."
      )
    );
    return;
  }

  const progress = spinner();
  progress.start(`Installing with ${manager}`);
  const ok = await tryRunCommand(manager, ["add", ...list], {
    workingDirectory: projectRoot,
    useShell: process.platform === "win32",
  });
  if (ok) {
    progress.stop(`Installed ${list.length} package(s)`);
  } else {
    progress.stop("Install failed");
    log.message(pc.cyan(`  ${command}`));
    log.message(pc.dim("  Run that yourself to finish the setup."));
  }
}

/**
 * Install each added package's external dependencies **into that package**.
 *
 * The generated manifest already declares them at `"*"` (see
 * `manifestFilesFor`), which is enough for the workspace to resolve — this
 * upgrades those to real ranges chosen by the user's own package manager, in the
 * right `package.json`.
 *
 * Runs one install per package rather than one at the root: that's what puts the
 * range on the package that actually imports it.
 */
async function installPerPackage(
  projectRoot: string,
  plans: PackagePlan[],
  options: AddOptions,
  config: NotilsConfig,
  manager: string
): Promise<void> {
  const work: { name: string; directory: string; list: string[] }[] = [];

  for (const plan of plans) {
    if (plan.externalDependencies.length === 0) {
      continue;
    }
    const relative = `${config.paths.packages}/${plan.pkg.name}`;
    const manifest = await readJsonFile<PackageJson>(
      join(projectRoot, relative, "package.json")
    ).catch(() => null);
    // Already carrying a real (non-"*") range means a previous run installed it.
    const needed = plan.externalDependencies.filter((name) => {
      const range = manifest?.dependencies?.[name] ?? manifest?.devDependencies?.[name];
      return range === undefined || range === "*";
    });
    if (needed.length > 0) {
      work.push({ name: plan.pkg.name, directory: relative, list: needed.sort() });
    }
  }

  if (work.length === 0) {
    return;
  }

  const commands = work.map(
    ({ directory, list }) => `${manager} add ${list.join(" ")}   ${pc.dim(`# in ${directory}`)}`
  );

  log.warn(
    `${pc.bold("External dependencies must be installed")} — the code just written imports them, so this project will not compile until they are.`
  );
  for (const { name, list } of work) {
    log.message(pc.dim(`  ${name}: ${list.join(", ")}`));
  }

  if (options.dryRun) {
    for (const command of commands) {
      log.info(pc.dim(`  Would offer to run: ${command}`));
    }
    return;
  }

  const shouldInstall = options.withDeps
    ? true
    : process.stdin.isTTY !== true
      ? false
      : await confirmInstall(commands.join("\n  "), manager);

  if (!shouldInstall) {
    for (const command of commands) {
      log.message(pc.cyan(`  ${command}`));
    }
    log.message(
      pc.dim(
        options.withDeps === undefined && process.stdin.isTTY !== true
          ? "  Not prompting without a terminal — run those, or pass --with-deps next time."
          : "  Run those before building."
      )
    );
    return;
  }

  const progress = spinner();
  for (const { name, directory, list } of work) {
    progress.start(`Installing ${list.length} dependency(s) into ${directory}`);
    const ok = await tryRunCommand(manager, ["add", ...list], {
      workingDirectory: join(projectRoot, directory),
      useShell: process.platform === "win32",
    });
    if (ok) {
      progress.stop(`Installed into ${directory}`);
    } else {
      progress.stop(`Could not install into ${directory}`);
      log.message(pc.cyan(`  cd ${directory} && ${manager} add ${list.join(" ")}`));
      log.message(pc.dim(`  Run that yourself to finish setting up ${name}.`));
    }
  }
}

/** Ask before mutating node_modules and the lockfile. */
async function confirmInstall(command: string, manager: string): Promise<boolean> {
  log.message(pc.dim(`  ${command}`));
  const accept = await confirm({
    message: `Install them with ${manager} now?`,
    initialValue: true,
  });
  if (isCancel(accept)) throw new CancelledError();
  return accept;
}

const KNOWN_MANAGERS = new Set(["bun", "pnpm", "yarn", "npm"]);

/**
 * The package manager that invoked us, from `npm_config_user_agent` — which
 * bunx, pnpm dlx, yarn dlx and npx all set (format: `bun/1.3.14 npm/? node/…`).
 *
 * This is the tiebreak for a project with no `packageManager` field and no
 * lockfile — a brand-new one, exactly the case where guessing wrong is most
 * visible. Someone who typed `bunx @notils/cli` should be told `bun add`, not
 * `npm add`.
 */
function invokingPackageManager(): string | null {
  const agent = process.env.npm_config_user_agent;
  const name = agent?.split("/")[0]?.trim();
  return name && KNOWN_MANAGERS.has(name) ? name : null;
}

/**
 * Which package manager this project uses: its declared `packageManager` field,
 * then its lockfile, then whatever runner invoked us. Defaults to npm — present
 * on any machine with Node.
 */
async function detectPackageManager(projectRoot: string): Promise<string> {
  const pkg = await readJsonFile<{ packageManager?: string }>(
    join(projectRoot, "package.json")
  ).catch(() => ({ packageManager: undefined }));
  const declared = pkg.packageManager?.split("@")[0];
  if (declared) {
    return declared;
  }
  for (const [lockfile, manager] of [
    ["bun.lock", "bun"],
    ["bun.lockb", "bun"],
    ["pnpm-lock.yaml", "pnpm"],
    ["yarn.lock", "yarn"],
    ["package-lock.json", "npm"],
  ] as const) {
    if (await pathExists(join(projectRoot, lockfile))) {
      return manager;
    }
  }
  return invokingPackageManager() ?? "npm";
}
