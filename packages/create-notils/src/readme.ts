import { join } from "node:path";

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
  }
): Promise<void> {
  const { projectName, projectType, packageManager, cliVersion, includeSkills } = options;
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

${layoutSection}

## Adding capabilities

\`\`\`sh
${runScriptWithArgs(packageManager, "notils", "list")}           # what's available, what's installed
${runScriptWithArgs(packageManager, "notils", "add auth-ui")}    # add a capability to this project
\`\`\`

This runs [\`@notils/cli\`](https://www.npmjs.com/package/@notils/cli) through your
package runner — it is not a dependency, so you always get the current version.
Everything it writes is your source; delete the directory to remove a capability.

## AI agent context

${skillsSection}

See \`AGENTS.md\` for architecture, conventions, and setup notes (also read by AI coding agents).

---

_Generated with [create-notils](https://github.com/notils/create-notils) v${cliVersion}._
`;

  await writeTextFile(join(projectRoot, "README.md"), contents);
}
