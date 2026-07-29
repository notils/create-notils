import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { pathExists, readJsonFile } from "@notils/transform/filesystem";
import type { InternalPackage } from "@notils/transform/packages";
import type { NotilsConfig } from "@notils/transform/project-config";

/**
 * Brownfield compatibility checks.
 *
 * Our components assume foundations a random Next.js project may not have. The
 * honest position (see docs/add-command-design.md): `add` works cleanly on a
 * project matching those foundations and reports clearly when it doesn't —
 * rather than writing files that silently render unstyled or fail to compile.
 *
 * These are WARNINGS, not refusals. The user may be mid-migration, or may know
 * something we don't. But they must be told before the files land, not after.
 */

export type CompatIssue = {
  /** One-line statement of what's wrong. */
  summary: string;
  /** What to do about it. */
  remedy: string;
};

type PackageJson = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

/** Major version from a semver-ish range ("^4.3.3" → 4). Null if unparseable. */
function majorOf(range: string | undefined): number | null {
  if (!range) return null;
  const match = /(\d+)/.exec(range);
  return match?.[1] ? Number(match[1]) : null;
}

function dependencyRange(pkg: PackageJson, name: string): string | undefined {
  return pkg.dependencies?.[name] ?? pkg.devDependencies?.[name];
}

/**
 * Does the project define the semantic color tokens our components use?
 *
 * Looked for in CSS rather than inferred: a project could define them anywhere,
 * so we scan its stylesheets for `--primary`, which every shadcn theme declares.
 */
async function hasThemeTokens(projectRoot: string, config: NotilsConfig): Promise<boolean> {
  const candidates = [
    "src/app/globals.css",
    "app/globals.css",
    "src/styles/globals.css",
    "styles/globals.css",
    `${config.paths.components}/../app/globals.css`,
  ];
  for (const candidate of candidates) {
    const path = join(projectRoot, candidate);
    if (!(await pathExists(path))) continue;
    const css = await readFile(path, "utf8").catch(() => "");
    if (css.includes("--primary")) {
      return true;
    }
  }
  return false;
}

/** Is there an existing Radix-based shadcn install that ours will sit beside? */
async function hasRadixComponents(projectRoot: string, config: NotilsConfig): Promise<boolean> {
  const pkg = await readJsonFile<PackageJson>(join(projectRoot, "package.json")).catch(
    () => ({}) as PackageJson
  );
  const names = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})];
  if (names.some((name) => name === "radix-ui" || name.startsWith("@radix-ui/"))) {
    return true;
  }
  // Also check for existing component files that import Radix directly.
  const componentsDirectory = join(projectRoot, config.paths.components, "ui");
  if (!(await pathExists(componentsDirectory))) {
    return false;
  }
  const entries = await readdir(componentsDirectory).catch(() => [] as string[]);
  for (const entry of entries.slice(0, 20)) {
    const contents = await readFile(join(componentsDirectory, entry), "utf8").catch(() => "");
    if (contents.includes("@radix-ui/")) {
      return true;
    }
  }
  return false;
}

/**
 * Check the foundations the packages being added actually depend on.
 *
 * Only checks what's relevant: a project adding `api-client` (zero UI surface)
 * shouldn't be lectured about Tailwind.
 */
export async function checkCompatibility(
  projectRoot: string,
  packages: InternalPackage[],
  config: NotilsConfig
): Promise<CompatIssue[]> {
  const issues: CompatIssue[] = [];
  const pkg = await readJsonFile<PackageJson>(join(projectRoot, "package.json")).catch(
    () => ({}) as PackageJson
  );

  const touchesUi = packages.some((candidate) =>
    ["ui", "form-builder", "auth-ui"].includes(candidate.name)
  );
  const usesReact = packages.some((candidate) => candidate.name !== "api-client");

  if (touchesUi) {
    const tailwindMajor = majorOf(dependencyRange(pkg, "tailwindcss"));
    if (tailwindMajor === null) {
      issues.push({
        summary: "Tailwind CSS was not found in this project.",
        remedy:
          "These components are styled with Tailwind v4 utilities. Install and configure Tailwind v4, or the components will render unstyled.",
      });
    } else if (tailwindMajor < 4) {
      issues.push({
        summary: `This project is on Tailwind v${tailwindMajor}; these components target v4.`,
        remedy:
          "They use v4 CSS-first theming (@theme inline, @custom-variant dark). Migrating is your call — we won't rewrite your Tailwind config.",
      });
    }

    if (!(await hasThemeTokens(projectRoot, config))) {
      issues.push({
        summary: "No semantic color tokens (--primary, --muted-foreground, …) found in your CSS.",
        remedy:
          "The components reference these tokens via bg-primary/text-muted-foreground and will render unstyled without them. Copy a shadcn theme block into your globals.css.",
      });
    }

    if (await hasRadixComponents(projectRoot, config)) {
      issues.push({
        summary: "This project already has Radix-based components.",
        remedy:
          "Ours are built on Base UI, which composes with a `render` prop instead of Radix's `asChild`. Both can coexist, but the APIs differ — we won't convert either one.",
      });
    }
  }

  if (usesReact) {
    const reactMajor = majorOf(dependencyRange(pkg, "react"));
    if (reactMajor !== null && reactMajor < 19) {
      issues.push({
        summary: `This project is on React ${reactMajor}; these packages declare a React 19 peer.`,
        remedy: "Expect type errors and possible runtime issues until you upgrade.",
      });
    }
  }

  return issues;
}
