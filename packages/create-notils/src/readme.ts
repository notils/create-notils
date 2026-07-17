import { join } from "node:path";

import type { PackageManager, ProjectType } from "./config.js";
import { writeTextFile } from "./filesystem.js";

/** How to invoke a run-script for each package manager (`npm` needs `run`). */
function runScriptCommand(packageManager: PackageManager, script: string): string {
  return packageManager === "npm" ? `npm run ${script}` : `${packageManager} ${script}`;
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
  }
): Promise<void> {
  const { projectName, projectType, packageManager, cliVersion } = options;
  const dev = runScriptCommand(packageManager, "dev");
  const build = runScriptCommand(packageManager, "build");

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

See \`AGENTS.md\` for architecture, conventions, and setup notes (also read by AI coding agents).

---

_Generated with [create-notils](https://github.com/notils/create-notils) v${cliVersion}._
`;

  await writeTextFile(join(projectRoot, "README.md"), contents);
}
