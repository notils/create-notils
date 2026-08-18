import { basename } from "node:path";
import { cancel, confirm, isCancel, multiselect, select, text } from "@clack/prompts";

import {
  DEFAULT_ENVIRONMENT_SETUP,
  type EnvironmentSetup,
  parseEnvironmentSetup,
} from "@notils/transform/environments";
import {
  type AuthChoice,
  DEFAULT_SELECTION,
  OPTIONAL_PACKAGE_NAMES,
  type PackageSelection,
  parseAuthChoice,
  parsePackageNames,
} from "@notils/transform/selection";

import {
  DEFAULT_PROJECT_NAME,
  isValidProjectName,
  parseAppNames,
  toValidProjectName,
} from "./arguments.js";
import type { CliOptions, ParsedCli } from "./cli.js";

export type ProjectType = "monorepo" | "standalone";
export type PackageManager = "bun" | "pnpm" | "npm" | "yarn";

/** The fully-resolved answers that drive scaffolding, from flags and/or prompts. */
export type ScaffoldConfig = {
  projectName: string;
  /** True when `.` was given: scaffold into the current directory instead of creating one. */
  scaffoldInPlace: boolean;
  projectType: ProjectType;
  /** App names under `apps/`. Monorepo only; empty for standalone. */
  appNames: string[];
  packageManager: PackageManager;
  installDependencies: boolean;
  initializeGit: boolean;
  /**
   * Include the `notils-project` agent skill — the document that tells an AI
   * coding agent what this project is and how it's wired. Default yes: without
   * it, an agent opening the project has no idea what create-notils produced.
   */
  includeSkills: boolean;
  /**
   * Which optional packages and which auth strategy the project gets (issue #3).
   * The template carries everything; a generated project carries only this.
   */
  selection: PackageSelection;
  /** How many environments the project is configured for (issue #3). */
  environmentSetup: EnvironmentSetup;
  /**
   * Include the example pages and auth flows (issue #2). Default false — a fresh
   * app is a production starting point, not a demo of the stack.
   */
  includeDemo: boolean;
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

  const { projectName, scaffoldInPlace } = await resolveProjectName(parsed.projectName);
  const projectType = await resolveProjectType(options, acceptDefaults);
  const appNames = projectType === "monorepo" ? await resolveAppNames(options, acceptDefaults) : [];
  const packageManager = resolvePackageManager(options, acceptDefaults);
  const includeDemo = await resolveIncludeDemo(options, acceptDefaults);
  const selection = await resolveSelectionConfig(options, acceptDefaults, includeDemo);
  const environmentSetup = await resolveEnvironmentSetup(options, acceptDefaults);
  const installDependencies = await resolveInstallDependencies(options, acceptDefaults);
  const initializeGit = options.git !== false;
  const includeSkills = await resolveIncludeSkills(options, acceptDefaults);

  return {
    projectName,
    scaffoldInPlace,
    projectType,
    appNames,
    packageManager,
    installDependencies,
    initializeGit,
    includeSkills,
    selection,
    environmentSetup,
    includeDemo,
  };
}

/**
 * Fresh app (default) or demo app — issue #2.
 *
 * Asked FIRST among the content questions, because the answer changes what the
 * others mean: a demo app wants the capabilities its examples use, so choosing
 * demo pre-selects them rather than leaving the user to work out which packages
 * the example pages need.
 */
async function resolveIncludeDemo(options: CliOptions, acceptDefaults: boolean): Promise<boolean> {
  if (options.demo !== undefined) {
    return options.demo;
  }
  // Non-interactive defaults to the fresh app — the issue's requirement, and the
  // safer default: a scaffold shouldn't generate code nobody asked for.
  if (acceptDefaults) {
    return false;
  }

  return requireAnswer(
    await select({
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
          hint: "example auth pages, navigation, and a schema-driven form",
        },
      ],
      initialValue: false,
    })
  );
}

/**
 * The auth strategy and the optional packages — issue #3.
 *
 * Auth is a single-select, never a multi-select: two implementations of one
 * contract is the specific problem the issue is about, and making it one value
 * means an invalid combination cannot be expressed rather than needing to be
 * validated.
 */
async function resolveSelectionConfig(
  options: CliOptions,
  acceptDefaults: boolean,
  includeDemo: boolean
): Promise<PackageSelection> {
  const auth = await resolveAuthChoice(options, acceptDefaults, includeDemo);
  const packages = await resolveOptionalPackages(options, acceptDefaults, includeDemo, auth);
  return { auth, packages };
}

async function resolveAuthChoice(
  options: CliOptions,
  acceptDefaults: boolean,
  includeDemo: boolean
): Promise<AuthChoice> {
  if (options.auth !== undefined) {
    const parsed = parseAuthChoice(options.auth);
    if (parsed === null) {
      abort(`Invalid --auth "${options.auth}". Use "none", "custom", or "better-auth".`);
    }
    return parsed;
  }
  if (acceptDefaults) {
    // A demo app's example pages ARE the auth flows, so a demo with `--auth none`
    // would generate a demo of nothing. Default it to the provider those pages
    // are written against.
    return includeDemo ? "custom" : DEFAULT_SELECTION.auth;
  }

  return requireAnswer(
    await select<AuthChoice>({
      message: "Authentication?",
      options: [
        { value: "none", label: "None", hint: "add it later with `notils add`" },
        {
          value: "custom",
          label: "Custom authentication",
          hint: "you already have an auth API to point at",
        },
        {
          value: "better-auth",
          label: "Better Auth",
          hint: "runs in-process with Next.js; no auth server to operate",
        },
      ],
      initialValue: includeDemo ? ("custom" as AuthChoice) : DEFAULT_SELECTION.auth,
    })
  );
}

async function resolveOptionalPackages(
  options: CliOptions,
  acceptDefaults: boolean,
  includeDemo: boolean,
  auth: AuthChoice
): Promise<string[]> {
  if (options.packages !== undefined) {
    const parsed = parsePackageNames(options.packages);
    if (parsed === null) {
      abort(
        `Invalid --packages "${options.packages}". Choose from: ${OPTIONAL_PACKAGE_NAMES.join(", ")} (or "none"), without duplicates.`
      );
    }
    return parsed;
  }
  // A demo app needs form-builder — the example contact form is built on it.
  const defaults = includeDemo
    ? [...DEFAULT_SELECTION.packages, "form-builder"]
    : [...DEFAULT_SELECTION.packages];
  if (acceptDefaults) {
    return defaults;
  }

  // Auth's sign-in/sign-up forms are built on SchemaForm, so choosing auth means
  // form-builder and ui come along regardless. Say so in the prompt rather than
  // letting the user "decline" something that then appears anyway — the resolver
  // would report it as implied, but a hint up front is honest instead of
  // surprising.
  const forcedByAuth = auth !== "none";
  const authNote = forcedByAuth ? " (required by auth)" : "";

  const answer = requireAnswer(
    await multiselect<string>({
      message: "Select the packages you want to include",
      options: [
        {
          value: "ui",
          label: "UI",
          hint: `shadcn/ui component kit on Base UI + the theme${authNote}`,
        },
        { value: "api-client", label: "API Client", hint: "typed HTTP transport core" },
        {
          value: "form-builder",
          label: "Form Builder",
          hint: `renders a form straight from a Zod schema${authNote}`,
        },
      ],
      initialValues: forcedByAuth ? [...new Set([...defaults, "ui", "form-builder"])] : defaults,
      // A project with no optional packages at all is a legitimate choice — a bare
      // Next.js app with the shared config. Don't force a selection.
      required: false,
    })
  );
  return answer;
}

/** How many environments the project needs — issue #3, part 3. */
async function resolveEnvironmentSetup(
  options: CliOptions,
  acceptDefaults: boolean
): Promise<EnvironmentSetup> {
  if (options.env !== undefined) {
    const parsed = parseEnvironmentSetup(options.env);
    if (parsed === null) {
      abort(`Invalid --env "${options.env}". Use "single", "dev-prod", or "dev-staging-prod".`);
    }
    return parsed;
  }
  if (acceptDefaults) {
    return DEFAULT_ENVIRONMENT_SETUP;
  }

  return requireAnswer(
    await select<EnvironmentSetup>({
      message: "Environment setup?",
      options: [
        {
          value: "single",
          label: "Single environment (recommended)",
          hint: ".env.local — add more when you need them",
        },
        {
          value: "dev-prod",
          label: "Development + Production",
          hint: ".env.development, .env.production",
        },
        {
          value: "dev-staging-prod",
          label: "Development + Staging + Production",
          hint: "adds .env.staging",
        },
      ],
      initialValue: DEFAULT_ENVIRONMENT_SETUP,
    })
  );
}

/**
 * Whether to include the agent skill. Defaults to yes — it's one small file and
 * it's what makes an AI agent useful in the project at all.
 *
 * Only OUR skill ships. Third-party skills (shadcn, better-auth, …) are fetched
 * from their own upstreams via `notils add skill:<name>`, never vendored here:
 * a copy we don't maintain goes stale silently and isn't ours to keep current.
 */
async function resolveIncludeSkills(
  options: CliOptions,
  acceptDefaults: boolean
): Promise<boolean> {
  if (options.skills === false) {
    return false;
  }
  if (acceptDefaults || options.skills === true) {
    return true;
  }
  return requireAnswer(
    await confirm({
      message: "Include the notils agent guide? (helps AI coding agents work in this project)",
      initialValue: true,
    })
  );
}

type ProjectNameResolution = { projectName: string; scaffoldInPlace: boolean };

/** `.` means "scaffold here" — the name comes from the current directory, sanitized. */
function resolveCurrentDirectoryTarget(): ProjectNameResolution {
  return { projectName: toValidProjectName(basename(process.cwd())), scaffoldInPlace: true };
}

async function resolveProjectName(
  fromPositional: string | undefined
): Promise<ProjectNameResolution> {
  if (fromPositional !== undefined) {
    if (fromPositional === ".") {
      return resolveCurrentDirectoryTarget();
    }
    if (!isValidProjectName(fromPositional)) {
      abort(
        `Invalid project name "${fromPositional}" — use lowercase letters, numbers, and dashes (or "." for the current directory).`
      );
    }
    return { projectName: fromPositional, scaffoldInPlace: false };
  }

  const answer = requireAnswer(
    await text({
      message: "Project name?",
      placeholder: DEFAULT_PROJECT_NAME,
      defaultValue: DEFAULT_PROJECT_NAME,
      validate: (value) =>
        value === "." || isValidProjectName(value)
          ? undefined
          : `Use lowercase letters, numbers, and dashes only (or "." for the current directory).`,
    })
  );
  if (answer === ".") {
    return resolveCurrentDirectoryTarget();
  }
  return { projectName: answer, scaffoldInPlace: false };
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
