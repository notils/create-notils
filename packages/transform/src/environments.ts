/**
 * Environment configuration for a generated project (issue #3, part 3).
 *
 * Not every project needs staging on day one, so the number of environments is a
 * scaffold-time choice. This module owns which files each tier produces and the
 * resolution helper that goes into the project — the CLI only decides where to
 * write them.
 *
 * The guiding rule from the issue: environment resolution is CENTRALIZED, so no
 * application has to reimplement "which environment am I in".
 */

export type EnvironmentSetup = "single" | "dev-prod" | "dev-staging-prod";

export const ENVIRONMENT_SETUPS: readonly EnvironmentSetup[] = [
  "single",
  "dev-prod",
  "dev-staging-prod",
];

export const DEFAULT_ENVIRONMENT_SETUP: EnvironmentSetup = "single";

/**
 * The named environments each setup defines, beyond the always-present example
 * file.
 *
 * `single` has none: it uses one `.env.local`, which is Next.js's own convention
 * and is already gitignored by the template. Introducing `.env.development` for a
 * project with one environment would be ceremony with no payoff.
 */
const ENVIRONMENTS: Record<EnvironmentSetup, readonly string[]> = {
  single: [],
  "dev-prod": ["development", "production"],
  "dev-staging-prod": ["development", "staging", "production"],
};

/** The environment names a setup defines (empty for `single`). */
export function environmentNames(setup: EnvironmentSetup): readonly string[] {
  return ENVIRONMENTS[setup];
}

/** One file the scaffold should write, relative to the project root. */
export type EnvironmentFile = {
  path: string;
  contents: string;
};

/**
 * The env files a setup produces.
 *
 * Every setup gets `.env.example` — the committed, secret-free record of which
 * variables the project reads, which is the one env file that belongs in git.
 * `single` additionally gets `.env.local` (Next.js's per-developer file); the
 * multi-environment setups get one `.env.<name>` per environment instead, since
 * `.env.local` would silently win over all of them.
 */
export function environmentFiles(
  setup: EnvironmentSetup,
  options: {
    projectName: string;
    /**
     * Whether the project uses Better Auth. It needs two variables of its own, and
     * `.env.example` is meant to list every variable the project reads — omitting
     * them would leave a developer to discover `BETTER_AUTH_SECRET` from a runtime
     * failure instead.
     */
    hasBetterAuth?: boolean;
  }
): EnvironmentFile[] {
  const files: EnvironmentFile[] = [
    {
      path: ".env.example",
      contents: exampleFileContents(setup, options.projectName, options.hasBetterAuth === true),
    },
  ];

  if (setup === "single") {
    files.push({
      path: ".env.local",
      contents: `# Local, uncommitted values for ${options.projectName}.
# Copy from .env.example and fill in real values. Never commit this file.

NEXT_PUBLIC_APP_NAME="${options.projectName}"
`,
    });
    return files;
  }

  for (const name of environmentNames(setup)) {
    files.push({
      path: `.env.${name}`,
      contents: `# Local values for the ${name} environment. GITIGNORED — this file is
# yours, not the repository's. \`.env.example\` is the single committed
# reference for which variables exist.
#
# For deployments, set these in your host's environment or secret store
# rather than shipping a file.

APP_ENV="${name}"
NEXT_PUBLIC_APP_NAME="${options.projectName}"
`,
    });
  }

  return files;
}

/**
 * Better Auth's own variables, for `.env.example`.
 *
 * The template runs without them (the server falls back to a development-only
 * secret so `bun run dev` works immediately after scaffolding), which is exactly
 * why they must be DOCUMENTED here — a variable that only matters in production
 * is the one most easily forgotten.
 */
function betterAuthVariables(): string {
  return `
# Better Auth. The template falls back to a development-only secret so \`dev\`
# works out of the box — set a real one before deploying anywhere. Generate with:
#   openssl rand -base64 32
BETTER_AUTH_SECRET=""
# The app's public origin, used to build callback and password-reset URLs.
BETTER_AUTH_URL="http://localhost:3000"
`;
}

function exampleFileContents(
  setup: EnvironmentSetup,
  projectName: string,
  hasBetterAuth: boolean
): string {
  const header = `# Every variable this project reads. THE ONLY COMMITTED ENV FILE — documentation
# only, no real values. Copy to ${setup === "single" ? ".env.local" : ".env.<environment>"} and fill them in there;
# every other .env* file is gitignored.
`;

  const appEnv =
    setup === "single"
      ? ""
      : `
# Which environment to resolve. Set per deployment; see src/env.ts (or
# packages/config/env.ts) for how it is read. Valid values:
#   ${environmentNames(setup).join(" | ")}
APP_ENV="development"
`;

  return `${header}${appEnv}
NEXT_PUBLIC_APP_NAME="${projectName}"
${hasBetterAuth ? betterAuthVariables() : ""}`;
}

/**
 * The centralized environment-resolution module written into the project.
 *
 * `NODE_ENV` is deliberately NOT the only input: Next.js sets it to `production`
 * for any production BUILD, including the one that gets deployed to staging, so a
 * project with a staging environment cannot distinguish staging from production
 * by `NODE_ENV` alone. `APP_ENV` is the explicit override, exactly as issue #3
 * describes.
 *
 * For a `single`-environment project this file still exists, but resolves to one
 * constant — so code that reads `environment` keeps working if the project later
 * adds tiers, and adding them is a change to this one file.
 */
export function environmentModuleContents(setup: EnvironmentSetup): string {
  const names = environmentNames(setup);

  if (setup === "single") {
    return `/**
 * The active environment.
 *
 * This project was scaffolded with a SINGLE environment, so there is one value.
 * The indirection is deliberate: code reads \`environment\` rather than
 * \`process.env\` directly, so adding development/staging/production later is a
 * change to this file alone.
 */
export type Environment = "development" | "production";

export const environment: Environment =
  process.env.NODE_ENV === "production" ? "production" : "development";

export const isProduction = environment === "production";
export const isDevelopment = environment === "development";
`;
  }

  const union = names.map((name) => `"${name}"`).join(" | ");
  const guards = names
    .map(
      (name) =>
        `export const is${name[0]?.toUpperCase()}${name.slice(1)} = environment === "${name}";`
    )
    .join("\n");

  return `/**
 * The active environment, resolved in ONE place.
 *
 * \`APP_ENV\` is the source of truth, not \`NODE_ENV\`: Next.js sets \`NODE_ENV\` to
 * "production" for every production build — including the build deployed to
 * staging — so \`NODE_ENV\` alone cannot tell those apart. Set \`APP_ENV\` per
 * deployment (see .env.${names[0]} and friends).
 *
 * Falls back to "development" when \`APP_ENV\` is unset or unrecognized, so a
 * missing variable degrades to the safe local default rather than throwing at
 * import time.
 */
export type Environment = ${union};

const ENVIRONMENTS: readonly Environment[] = [${names.map((name) => `"${name}"`).join(", ")}];

function resolveEnvironment(): Environment {
  const fromAppEnv = process.env.APP_ENV;
  if (fromAppEnv && (ENVIRONMENTS as readonly string[]).includes(fromAppEnv)) {
    return fromAppEnv as Environment;
  }
  // No explicit APP_ENV: a production build is production, anything else is local.
  return process.env.NODE_ENV === "production" ? "production" : "development";
}

export const environment: Environment = resolveEnvironment();

${guards}
`;
}

/**
 * Environment files are gitignored by the template's own `.gitignore`, which uses
 * a blanket rule with one negation:
 *
 * ```
 * .env
 * .env.*
 * !.env.example
 * ```
 *
 * There is deliberately no per-setup gitignore step here any more. An earlier
 * version enumerated the files to ignore (`.env.local`, `.env.<name>.local`, …)
 * and appended them at scaffold time — which meant a setup that generated a file
 * the list didn't anticipate shipped it unignored. `.env.staging.local` was exactly
 * that case. A blanket rule cannot have that gap, and it needs no scaffold-time
 * patching, so the whole step is gone.
 *
 * The consequence, reflected in `environmentFiles` above: **`.env.example` is the
 * only committed env file.** Per-environment files are local-only, and deployments
 * set their variables through the host rather than a committed file.
 */

/** Parse an `--env` flag value. Returns null when it isn't a supported setup. */
export function parseEnvironmentSetup(value: string): EnvironmentSetup | null {
  const normalized = value.trim().toLowerCase();
  // Accept the friendlier aliases the issue's prompt text implies, so `--env
  // dev-prod` and `--env development,production` both work.
  const aliases: Record<string, EnvironmentSetup> = {
    single: "single",
    one: "single",
    "dev-prod": "dev-prod",
    "development,production": "dev-prod",
    "dev-staging-prod": "dev-staging-prod",
    "development,staging,production": "dev-staging-prod",
  };
  return aliases[normalized] ?? null;
}
