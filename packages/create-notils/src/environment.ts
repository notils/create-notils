import { join } from "node:path";

import {
  type EnvironmentSetup,
  environmentFiles,
  environmentModuleContents,
} from "@notils/transform/environments";

import { writeTextFile } from "./filesystem.js";

/**
 * Write the project's environment configuration (issue #3, part 3).
 *
 * Where the resolution module lands differs by shape, and that difference is the
 * point of the issue's requirement that resolution be centralized:
 *
 *   - monorepo   → `packages/config/env.ts`, imported by every app, so multiple
 *                  apps cannot drift apart on what "staging" means.
 *   - standalone → `src/env.ts`, since there is no config package to hold it.
 *
 * The `.env*` files themselves always live at the project root, where every
 * package manager and Next.js itself look for them.
 */

export type EnvironmentWriteResult = {
  /** Project-relative paths written, for the scaffold report. */
  written: string[];
  /** Where the resolution module landed, project-relative. */
  modulePath: string;
};

export async function configureEnvironments(
  projectRoot: string,
  options: {
    setup: EnvironmentSetup;
    projectName: string;
    projectType: "monorepo" | "standalone";
    /** Scope for the monorepo import hint, e.g. `@my-app`. */
    scope: string | null;
    /** Whether Better Auth was selected — it contributes its own variables. */
    hasBetterAuth: boolean;
  }
): Promise<EnvironmentWriteResult> {
  const { setup, projectName, projectType, scope, hasBetterAuth } = options;
  const written: string[] = [];

  for (const file of environmentFiles(setup, { projectName, hasBetterAuth })) {
    await writeTextFile(join(projectRoot, file.path), file.contents);
    written.push(file.path);
  }

  const modulePath =
    projectType === "monorepo" ? join("packages", "config", "env.ts") : join("src", "env.ts");

  const header = importHint(projectType, scope);
  await writeTextFile(
    join(projectRoot, modulePath),
    `${header}${environmentModuleContents(setup)}`
  );
  written.push(modulePath.split("\\").join("/"));

  // No `.gitignore` step: the template's own blanket `.env` / `.env.*` /
  // `!.env.example` rule already covers every file written above, whatever the
  // setup. The earlier enumerate-and-append approach could miss a file the list
  // didn't anticipate — `.env.staging.local` was exactly that gap.

  return { written, modulePath: modulePath.split("\\").join("/") };
}

/**
 * A one-line comment showing how to import the module in this project's shape.
 *
 * Small, but it answers the question a developer has the moment they find the
 * file — and in a monorepo the answer isn't guessable, since the config package's
 * scope is the project's own.
 */
function importHint(projectType: "monorepo" | "standalone", scope: string | null): string {
  const specifier = projectType === "monorepo" ? `${scope ?? "@your-scope"}/config/env` : "@/env";
  return `// Import as: import { environment, isProduction } from "${specifier}";\n\n`;
}
