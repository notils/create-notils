import { cancel, confirm, isCancel, select, text } from "@clack/prompts";

import {
  defaultBundleIdentifierPrefix,
  isValidBundleIdentifierPrefix,
  isValidProjectName,
  parseAppNames,
} from "./arguments.js";
import type { CliOptions, ParsedCli } from "./cli.js";

export type ProjectType = "monorepo" | "standalone";
export type PackageManager = "bun" | "pnpm" | "npm" | "yarn";

/** The fully-resolved answers that drive scaffolding, from flags and/or prompts. */
export type ScaffoldConfig = {
  projectName: string;
  projectType: ProjectType;
  /** App names under `apps/`. Monorepo only; empty for standalone. */
  appNames: string[];
  packageManager: PackageManager;
  /** Reverse-DNS prefix reserved for future native targets; harmless for web. */
  bundleIdentifierPrefix: string;
  installDependencies: boolean;
  initializeGit: boolean;
};

const PACKAGE_MANAGERS: PackageManager[] = ["bun", "pnpm", "npm", "yarn"];
const DEFAULT_PACKAGE_MANAGER: PackageManager = "bun";
const DEFAULT_APP_NAME = "web";

/** Print a cancellation message and exit non-zero. Used for both `Ctrl-C` and invalid input. */
function abort(message: string): never {
  cancel(message);
  process.exit(1);
}

/** Unwrap a clack prompt result, aborting if the user cancelled. */
function requireAnswer<T>(answer: T | symbol): T {
  if (isCancel(answer)) {
    abort("Cancelled.");
  }
  return answer as T;
}

/**
 * Resolve the full scaffold configuration from the parsed CLI input. Every
 * setting can come from a flag (non-interactive / CI); `--yes` accepts all
 * defaults without prompting; anything else is asked interactively.
 *
 * commander has already parsed and typed the input — here we only apply domain
 * validation and the flag-or-prompt fallback, one focused resolver per setting.
 */
export async function resolveScaffoldConfig(parsed: ParsedCli): Promise<ScaffoldConfig> {
  const { options } = parsed;
  const acceptDefaults = options.yes === true;

  const projectName = await resolveProjectName(parsed.projectName);
  const projectType = await resolveProjectType(options, acceptDefaults);
  const appNames = projectType === "monorepo" ? await resolveAppNames(options, acceptDefaults) : [];
  const packageManager = resolvePackageManager(options, acceptDefaults);
  const bundleIdentifierPrefix = await resolveBundleIdentifierPrefix(
    options,
    acceptDefaults,
    projectName
  );
  const installDependencies = await resolveInstallDependencies(options, acceptDefaults);
  const initializeGit = options.git !== false;

  return {
    projectName,
    projectType,
    appNames,
    packageManager,
    bundleIdentifierPrefix,
    installDependencies,
    initializeGit,
  };
}

async function resolveProjectName(fromPositional: string | undefined): Promise<string> {
  if (fromPositional !== undefined) {
    if (!isValidProjectName(fromPositional)) {
      abort(
        `Invalid project name "${fromPositional}" — use lowercase letters, numbers, and dashes.`
      );
    }
    return fromPositional;
  }

  const answer = requireAnswer(
    await text({
      message: "Project name?",
      placeholder: "my-app",
      validate: (value) =>
        isValidProjectName(value) ? undefined : "Use lowercase letters, numbers, and dashes only.",
    })
  );
  return answer;
}

async function resolveProjectType(
  options: CliOptions,
  acceptDefaults: boolean
): Promise<ProjectType> {
  if (options.type !== undefined) {
    if (options.type !== "monorepo" && options.type !== "standalone") {
      abort(`Invalid --type "${options.type}". Use "monorepo" or "standalone".`);
    }
    return options.type;
  }
  if (acceptDefaults) {
    return "monorepo";
  }

  const answer = requireAnswer(
    await select({
      message: "Project type?",
      options: [
        {
          value: "monorepo" as ProjectType,
          label: "Monorepo",
          hint: "Turborepo with apps/* + shared packages/* — larger apps, multiple apps",
        },
        {
          value: "standalone" as ProjectType,
          label: "Standalone",
          hint: "A single Next.js app — landing pages, SaaS MVPs, dashboards",
        },
      ],
      initialValue: "monorepo" as ProjectType,
    })
  );
  return answer;
}

async function resolveAppNames(options: CliOptions, acceptDefaults: boolean): Promise<string[]> {
  if (options.apps !== undefined || acceptDefaults) {
    const raw = options.apps ?? DEFAULT_APP_NAME;
    const appNames = parseAppNames(raw);
    if (appNames.length === 0) {
      abort("Invalid --apps: names must be unique lowercase letters, numbers, and dashes.");
    }
    return appNames;
  }

  const answer = requireAnswer(
    await text({
      message: "App name(s) under apps/ (comma-separated)",
      placeholder: DEFAULT_APP_NAME,
      defaultValue: DEFAULT_APP_NAME,
      validate: (value) =>
        parseAppNames(value || DEFAULT_APP_NAME).length > 0
          ? undefined
          : "Invalid or duplicate names.",
    })
  );
  return parseAppNames(answer || DEFAULT_APP_NAME);
}

function resolvePackageManager(options: CliOptions, acceptDefaults: boolean): PackageManager {
  if (options.pm !== undefined || acceptDefaults) {
    const packageManager = (options.pm ?? DEFAULT_PACKAGE_MANAGER) as PackageManager;
    if (!PACKAGE_MANAGERS.includes(packageManager)) {
      abort(`Invalid --pm "${packageManager}". Use one of: ${PACKAGE_MANAGERS.join(", ")}.`);
    }
    return packageManager;
  }
  // No flag and not accepting defaults: the orchestrator prompts via
  // `promptPackageManager` when interactive. Return the default as a fallback.
  return DEFAULT_PACKAGE_MANAGER;
}

/**
 * Interactive package-manager selection. Split out from `resolvePackageManager`
 * so the sync flag path stays simple; the orchestrator calls this when no flag
 * and no `--yes` were given and a TTY is available.
 */
export async function promptPackageManager(): Promise<PackageManager> {
  const answer = requireAnswer(
    await select({
      message: "Package manager?",
      options: PACKAGE_MANAGERS.map((manager) => ({
        value: manager,
        label: manager === DEFAULT_PACKAGE_MANAGER ? `${manager} (recommended)` : manager,
      })),
      initialValue: DEFAULT_PACKAGE_MANAGER,
    })
  );
  return answer;
}

async function resolveBundleIdentifierPrefix(
  options: CliOptions,
  acceptDefaults: boolean,
  projectName: string
): Promise<string> {
  const defaultPrefix = defaultBundleIdentifierPrefix(projectName);

  if (options.bundleIdPrefix !== undefined || acceptDefaults) {
    const prefix = options.bundleIdPrefix ?? defaultPrefix;
    if (!isValidBundleIdentifierPrefix(prefix)) {
      abort(`Invalid --bundle-id-prefix "${prefix}" (expected reverse-DNS, e.g. com.acme).`);
    }
    return prefix;
  }

  const answer = requireAnswer(
    await text({
      message: "Bundle identifier prefix?",
      placeholder: defaultPrefix,
      defaultValue: defaultPrefix,
      validate: (value) =>
        isValidBundleIdentifierPrefix(value || defaultPrefix)
          ? undefined
          : "Reverse-DNS, e.g. com.acme",
    })
  );
  return answer || defaultPrefix;
}

async function resolveInstallDependencies(
  options: CliOptions,
  acceptDefaults: boolean
): Promise<boolean> {
  if (options.install === false) {
    return false;
  }
  if (acceptDefaults || options.install === true) {
    return true;
  }
  const answer = requireAnswer(
    await confirm({ message: "Install dependencies now?", initialValue: true })
  );
  return answer;
}
