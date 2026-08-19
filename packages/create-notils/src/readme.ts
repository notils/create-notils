import { join } from "node:path";

import { type EnvironmentSetup, environmentNames } from "@notils/transform/environments";
import type { ResolvedSelection } from "@notils/transform/selection";

import type { PackageManager, ProjectType } from "./config.js";
import { writeTextFile } from "./filesystem.js";
import { PACKAGE_RUNNER } from "./scaffold.js";

/** How to invoke a run-script for each package manager (`npm` needs `run`). */
function runScriptCommand(packageManager: PackageManager, script: string): string {
  return packageManager === "npm" ? `npm run ${script}` : `${packageManager} ${script}`;
}

/**
 * Run a package.json script WITH arguments.
 *
 * npm and yarn-classic need `--` to stop consuming the arguments themselves;
 * bun and pnpm forward them as-is. The explicit `run` is for readability — bun
 * resolves `bun notils list` correctly too (verified), but `run` makes it
 * obvious this is a package script rather than a subcommand.
 */
function runScriptWithArgs(packageManager: PackageManager, script: string, args: string): string {
  return packageManager === "npm" || packageManager === "yarn"
    ? `${packageManager} run ${script} -- ${args}`
    : `${packageManager} run ${script} ${args}`;
}

/**
 * The Environments section, written for the tier the project chose.
 *
 * Issue #3 asks for generated documentation explaining how to configure and
 * switch environments — so this describes the files that actually exist and where
 * the resolution module is, rather than a generic paragraph about env vars.
 */
function environmentsSectionFor(
  setup: EnvironmentSetup,
  projectType: ProjectType,
  projectName: string
): string {
  const modulePath = projectType === "monorepo" ? "packages/config/env.ts" : "src/env.ts";
  const importSpecifier = projectType === "monorepo" ? `@${projectName}/config/env` : "@/env";

  const usage = `Read the active environment from one place:

\`\`\`ts
import { environment, isProduction } from "${importSpecifier}";
\`\`\``;

  if (setup === "single") {
    return `## Environments

One environment, configured in \`.env.local\`. \`.env.example\` is **the only
committed env file** — the reference list of every variable this project reads,
with no real values; every other \`.env*\` file is gitignored.

${usage}

Resolution lives in \`${modulePath}\`. To add development/staging/production later,
change that one file and add the matching \`.env.<name>\` files — nothing that
imports \`environment\` needs to change.`;
  }

  const names = environmentNames(setup);
  const fileList = names.map((name) => `- \`.env.${name}\` — your local values for ${name}`);

  return `## Environments

- \`.env.example\` — **the only committed env file.** The reference list of every
  variable this project reads, with no real values.
${fileList.join("\n")}

Every \`.env*\` file except \`.env.example\` is gitignored, so nothing with a real
value is ever committed. For deployments, set variables in your host's environment
or secret store rather than shipping a file.

Select the environment with \`APP_ENV\`:

\`\`\`sh
APP_ENV=${names[1] ?? names[0]} ${projectType === "monorepo" ? "turbo run build" : "next build"}
\`\`\`

${usage}

\`APP_ENV\` is the source of truth rather than \`NODE_ENV\`, because Next.js sets
\`NODE_ENV=production\` for every production build — including the one deployed to
${names.includes("staging") ? "staging" : "any non-production environment"}. Resolution lives in \`${modulePath}\`.`;
}

/**
 * Overwrite the scaffolded root README with a concise, project-specific one that
 * documents how to run the project and credits the generator. Written for the
 * chosen project type so the paths and commands match what the user actually got.
 */
export async function writeGeneratedReadme(
  projectRoot: string,
  options: {
    projectName: string;
    projectType: ProjectType;
    packageManager: PackageManager;
    cliVersion: string;
    /** Whether the `notils-project` skill was included (`--skills`). */
    includeSkills: boolean;
    /** The resolved package selection, so the README documents what's actually here. */
    selection: ResolvedSelection;
    environmentSetup: EnvironmentSetup;
    includeDemo: boolean;
  }
): Promise<void> {
  const {
    projectName,
    projectType,
    packageManager,
    cliVersion,
    includeSkills,
    selection,
    environmentSetup,
    includeDemo,
  } = options;
  const dev = runScriptCommand(packageManager, "dev");
  const build = runScriptCommand(packageManager, "build");

  // Skills for the libraries in this stack are maintained by their authors, not
  // vendored here — so point at the tool that installs them rather than shipping
  // stale copies. See docs/add-command-design.md for why we don't reimplement it.
  const skillsSection = `${
    includeSkills
      ? `This project ships the \`notils-project\` skill (\`.agents/skills/notils-project/\`) —
its specification: architecture, layout, rules, and patterns. AI coding agents read
it automatically.`
      : `This project was scaffolded without the \`notils-project\` skill. Re-run with
\`--skills\` in a new project if you want it, or copy it from the create-notils repo.`
  }

Skills for the libraries in this stack are maintained by their own authors. Install
them with the [\`skills\`](https://www.npmjs.com/package/skills) CLI:

\`\`\`sh
${PACKAGE_RUNNER[packageManager]} skills add shadcn-ui/ui   # shadcn/ui component + composition rules
${PACKAGE_RUNNER[packageManager]} skills find <query>       # search for more
${PACKAGE_RUNNER[packageManager]} skills list               # what's installed
\`\`\``;

  const layoutSection =
    projectType === "monorepo"
      ? `## Structure

- \`apps/*\` — your Next.js app(s)
- \`packages/ui\` — the shared shadcn/ui kit (Base UI); import from \`@${projectName}/ui/...\`
- \`packages/config\` — shared TypeScript + Biome config

Add or update UI components from \`packages/ui\`:

\`\`\`sh
cd packages/ui
${packageManager} run ui:add button
\`\`\``
      : `## Structure

- \`src/app\` — routes (App Router)
- \`src/components/ui\` — shadcn/ui components (Base UI)
- \`src/lib/utils.ts\` — the \`cn()\` helper
- \`src/app/globals.css\` — the theme (tokens + dark mode)

Add or update UI components from the project root:

\`\`\`sh
${packageManager} run ui:add button
\`\`\``;

  // What this project actually contains. Generated from the selection rather than
  // described generically, so the README never lists a capability that was pruned
  // — the leftover-documentation half of issue #3.
  const capabilityLines = selection.keptPackages
    .filter((pkg) => pkg.name !== "config")
    .map((pkg) => `- \`${pkg.name}\` — ${pkg.description}`);
  const capabilitiesSection =
    capabilityLines.length > 0
      ? `## What's included

${capabilityLines.join("\n")}

${
  includeDemo
    ? "This project includes the demo pages (sign-in, sign-up, a protected route, and an example schema-driven form). Delete them when you no longer need the reference."
    : "This is a fresh app — no example pages or demo flows. Add capabilities as you need them."
}`
      : `## What's included

The shared TypeScript and Biome config, and nothing else — this is a bare
Next.js app. Add capabilities with \`notils add\` as you need them.`;

  const environmentsSection = environmentsSectionFor(environmentSetup, projectType, projectName);

  // Adding an app is monorepo-only — there is no `apps/` in a standalone project.
  // Built here rather than inline in the template below: a nested template
  // literal containing a fenced code block reads badly and is easy to break.
  const addAppSection =
    projectType === "monorepo"
      ? `\`\`\`sh
${runScriptWithArgs(packageManager, "notils", "add app admin")}  # add another app under apps/
\`\`\`

`
      : "";

  // npm has no `update <pkg>@latest` that re-resolves a `latest` range the way
  // the others do; `install @pkg@latest` is its equivalent.
  const updateCliCommand =
    packageManager === "npm"
      ? "npm install --save-dev @notils/cli@latest"
      : `${packageManager} update @notils/cli`;

  const contents = `# ${projectName}

A production-ready Next.js project scaffolded with create-notils — Bun + Tailwind v4 +
shadcn/ui on Base UI + Biome${projectType === "monorepo" ? " + Turborepo" : ""}. Every file is yours to edit.

## Getting started

\`\`\`sh
${packageManager} install
${dev}
\`\`\`

Open http://localhost:3000.

## Quality gate

\`\`\`sh
${runScriptCommand(packageManager, "lint")}
${runScriptCommand(packageManager, "typecheck")}
${build}
\`\`\`

${capabilitiesSection}

${layoutSection}

${environmentsSection}

## Adding capabilities

\`\`\`sh
${runScriptWithArgs(packageManager, "notils", "list")}           # what's available, what's installed
${runScriptWithArgs(packageManager, "notils", "add auth-ui")}    # add a capability to this project
\`\`\`

${addAppSection}This runs [\`@notils/cli\`](https://www.npmjs.com/package/@notils/cli), installed here
as a devDependency so this project has its own copy. Everything it writes is your
source; delete the directory to remove a capability.

It was installed at \`latest\`, so your lockfile pinned whichever version was current
when you installed. To pick up newer CLI releases:

\`\`\`sh
${updateCliCommand}
\`\`\`

## AI agent context

${skillsSection}

See \`AGENTS.md\` for architecture, conventions, and setup notes (also read by AI coding agents).

---

_Generated with [create-notils](https://github.com/notils/create-notils) v${cliVersion}._
`;

  await writeTextFile(join(projectRoot, "README.md"), contents);
}
