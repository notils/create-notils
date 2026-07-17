import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  copyDirectory,
  copyDirectoryIfExists,
  readJsonFile,
  removePath,
  writeJsonFile,
  writeTextFile,
} from "./filesystem.js";

// Turns the monorepo template into a single standalone Next.js project. The
// monorepo is the single source of truth; this derives the standalone shape by
// folding packages/ui + packages/config into the app and rewriting the handful
// of cross-package references. See docs/cli-monorepo-vs-standalone.md for the
// full boundary map this implements.
//
// After flattening, the layout matches what `shadcn init` produces for a single
// app: src/{app,components,lib,hooks}, one package.json / tsconfig / biome /
// components.json, and every import via the `@/*` alias.

/** Rewrite one `@notils/ui/<area>/...` specifier to its `@/<area>/...` form. */
function rewriteUiSpecifier(specifier: string): string {
  // @notils/ui/components/ui/button -> @/components/ui/button
  // @notils/ui/lib/utils            -> @/lib/utils
  // @notils/ui/hooks/use-x          -> @/hooks/use-x
  return specifier.replace(/^@notils\/ui\//, "@/");
}

/**
 * Rewrite `@notils/ui/...` module specifiers inside import/export/require/CSS
 * `@import` statements. This is specifier-aware: it only touches quoted module
 * paths, never comments or prose that happen to contain the string.
 */
function rewriteSpecifiersInSource(contents: string): string {
  // Matches a quoted specifier starting with @notils/ui/ in any of:
  //   import ... from "@notils/ui/x"      export ... from '@notils/ui/x'
  //   import("@notils/ui/x")              require("@notils/ui/x")
  //   @import "@notils/ui/x"
  // We match the quoted string form directly, so only real specifiers change.
  return contents.replace(/(["'])(@notils\/ui\/[^"']+)\1/g, (_match, quote, specifier) => {
    return `${quote}${rewriteUiSpecifier(specifier)}${quote}`;
  });
}

// File extensions whose module specifiers we rewrite.
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".css"]);
const IGNORED_DIRECTORIES = new Set(["node_modules", ".git", ".next", "dist", "build"]);

function hasSourceExtension(fileName: string): boolean {
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex !== -1 && SOURCE_EXTENSIONS.has(fileName.slice(dotIndex));
}

/** Recursively rewrite `@notils/ui/*` specifiers in every source file under `directory`. */
async function rewriteSpecifiersInTree(directory: string): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });
  await Promise.all(
    entries.map(async (entry) => {
      const entryPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) {
          await rewriteSpecifiersInTree(entryPath);
        }
        return;
      }
      if (!hasSourceExtension(entry.name)) {
        return;
      }
      const original = await readFile(entryPath, "utf8");
      const rewritten = rewriteSpecifiersInSource(original);
      if (rewritten !== original) {
        await writeTextFile(entryPath, rewritten);
      }
    })
  );
}

/**
 * Step 2: merge the two globals.css files into the app's stylesheet. The app's
 * globals `@import`s the ui globals; standalone inlines the ui globals content
 * in its place and rewrites `@source` so it covers the single `src/` tree.
 */
async function mergeGlobalStylesheet(projectRoot: string): Promise<void> {
  const uiGlobalsPath = join(projectRoot, "packages/ui/src/styles/globals.css");
  const appGlobalsPath = join(projectRoot, "apps/app/src/app/globals.css");

  const uiGlobals = await readFile(uiGlobalsPath, "utf8");
  const appGlobals = await readFile(appGlobalsPath, "utf8");

  // The ui globals scans "../**/*.{ts,tsx}" (its own src, one level up from
  // styles/). In the flattened layout, globals.css lives at src/app/, so scan
  // the whole src/ tree instead.
  const uiGlobalsForApp = uiGlobals.replace(/@source\s+["'][^"']*["'];/, '@source "../";');

  // Replace the app's `@import "@notils/ui/globals.css";` line with the ui
  // globals content, keeping whatever app-level rules followed the import.
  // Also drop the app's now-stale comment block that referred to the ui package
  // (its @source is redundant once the ui globals scan the whole src/ tree).
  const appGlobalsWithoutImport = appGlobals
    .replace(/@import\s+["']@notils\/ui\/globals\.css["'];\s*\n?/, "")
    .replace(/\/\*[^*]*@notils\/ui[^*]*\*\/\s*\n?/g, "")
    .replace(/@source\s+["']\.\.\/["'];\s*\n?/, "");

  const merged = `${uiGlobalsForApp.trimEnd()}\n\n${appGlobalsWithoutImport.trimStart()}`;
  await writeTextFile(appGlobalsPath, merged);
}

/** Step 4: inline the shared tsconfig chain into the app's tsconfig. */
async function inlineTsconfig(projectRoot: string): Promise<void> {
  const base = await readJsonFile<{ compilerOptions?: Record<string, unknown> }>(
    join(projectRoot, "packages/config/tsconfig.base.json")
  );
  const nextjs = await readJsonFile<{ compilerOptions?: Record<string, unknown> }>(
    join(projectRoot, "packages/config/tsconfig.nextjs.json")
  );
  const appTsconfigPath = join(projectRoot, "apps/app/tsconfig.json");
  const app = await readJsonFile<{
    compilerOptions?: Record<string, unknown>;
    include?: unknown;
    exclude?: unknown;
  }>(appTsconfigPath);

  const inlined = {
    $schema: "https://json.schemastore.org/tsconfig",
    compilerOptions: {
      ...base.compilerOptions,
      ...nextjs.compilerOptions,
      ...app.compilerOptions,
      // Standalone uses the app's own `@/*` alias into ./src.
      paths: { "@/*": ["./src/*"] },
    },
    include: app.include ?? ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
    exclude: ["node_modules"],
  };
  await writeJsonFile(appTsconfigPath, inlined);
}

/** Step 4: emit a standalone (root) biome.json with the shared rules inlined. */
async function inlineBiomeConfig(projectRoot: string): Promise<void> {
  const sharedBiome = await readJsonFile<Record<string, unknown>>(
    join(projectRoot, "packages/config/biome.json")
  );
  // The shared config is a non-root, extendable preset. A standalone project
  // has a single root config, so mark it root and drop the extends indirection.
  const standaloneBiome = { ...sharedBiome, root: true };
  await writeTextFile(
    join(projectRoot, "apps/app/biome.json"),
    `${JSON.stringify(standaloneBiome, null, 2)}\n`
  );
}

type PackageJson = {
  name?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
} & Record<string, unknown>;

/** Drop workspace-internal deps (`@notils/*`, `workspace:*`) from a dep map. */
function withoutWorkspaceDeps(deps: Record<string, string> | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, version] of Object.entries(deps ?? {})) {
    if (name.startsWith("@notils/") || version.startsWith("workspace:")) {
      continue;
    }
    result[name] = version;
  }
  return result;
}

function sortObjectKeys(record: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));
}

/**
 * Step 6: merge the app + ui package.json into the single standalone one.
 * Dependencies are the union minus workspace-internal entries; the ui `ui:add`
 * scripts move to the root so `shadcn add` works from the project root.
 */
async function mergePackageJson(projectRoot: string, projectName: string): Promise<void> {
  const app = await readJsonFile<PackageJson>(join(projectRoot, "apps/app/package.json"));
  const ui = await readJsonFile<PackageJson>(join(projectRoot, "packages/ui/package.json"));

  const dependencies = sortObjectKeys({
    ...withoutWorkspaceDeps(ui.dependencies),
    ...withoutWorkspaceDeps(app.dependencies),
  });
  const devDependencies = sortObjectKeys({
    ...withoutWorkspaceDeps(ui.devDependencies),
    ...withoutWorkspaceDeps(app.devDependencies),
    // Biome and husky are provided by the monorepo root; a standalone project
    // needs them directly.
    "@biomejs/biome": "^2.5.4",
    husky: "^9.1.7",
  });

  // Keep the app's run scripts; add lint/format, the ui kit's shadcn helpers,
  // and husky's prepare hook (the monorepo root owned these).
  const scripts: Record<string, string> = {
    ...app.scripts,
    lint: "biome lint .",
    "lint:fix": "biome check . --write",
    "lint:unsafe": "biome check . --write --unsafe",
    format: "biome format --write .",
    "ui:add": "shadcn add",
    "ui:diff": "shadcn add --diff",
    prepare: "husky",
  };

  const merged: PackageJson = {
    name: projectName,
    version: "0.1.0",
    private: true,
    type: "module",
    scripts,
    dependencies,
    devDependencies,
  };
  // Preserve app-level install hints if present.
  if (app.ignoreScripts) {
    merged.ignoreScripts = app.ignoreScripts;
  }
  if (app.trustedDependencies) {
    merged.trustedDependencies = app.trustedDependencies;
  }

  await writeJsonFile(join(projectRoot, "apps/app/package.json"), merged);
}

/** Step 5: rewrite components.json aliases + css path to the standalone layout. */
async function rewriteComponentsJson(projectRoot: string): Promise<void> {
  const componentsJsonPath = join(projectRoot, "packages/ui/components.json");
  const componentsJson = await readJsonFile<{
    tailwind?: Record<string, unknown>;
    aliases?: Record<string, string>;
  }>(componentsJsonPath);

  componentsJson.tailwind = {
    ...componentsJson.tailwind,
    css: "src/app/globals.css",
  };
  componentsJson.aliases = {
    components: "@/components",
    ui: "@/components/ui",
    utils: "@/lib/utils",
    lib: "@/lib",
    hooks: "@/hooks",
  };
  // Write it into the app; it becomes the project-root components.json below.
  await writeJsonFile(join(projectRoot, "apps/app/components.json"), componentsJson);
}

/**
 * Flatten the monorepo template (already fetched into `projectRoot`) into a
 * single standalone Next.js project rooted at `projectRoot`.
 *
 * Order matters: transform files while still in their package locations, move
 * the ui source into the app, then promote the app to the project root and
 * remove monorepo-only artifacts.
 */
export async function flattenToStandalone(projectRoot: string, projectName: string): Promise<void> {
  const appDir = join(projectRoot, "apps/app");
  const uiSrc = join(projectRoot, "packages/ui/src");
  const appSrc = join(appDir, "src");

  // 1. Merge theme (reads both globals before we move anything).
  await mergeGlobalStylesheet(projectRoot);

  // 2. Move the ui kit source into the app's src/. `components` and `lib` always
  //    exist; `hooks` and `theme` are optional (an empty/absent dir isn't tracked
  //    by git), so copy them only if present.
  await copyDirectory(join(uiSrc, "components"), join(appSrc, "components"));
  await copyDirectory(join(uiSrc, "lib"), join(appSrc, "lib"));
  await copyDirectoryIfExists(join(uiSrc, "hooks"), join(appSrc, "hooks"));
  await copyDirectoryIfExists(join(uiSrc, "theme"), join(appSrc, "theme"));

  // 3. Rewrite @notils/ui/* specifiers across the app source now that the files live locally.
  await rewriteSpecifiersInTree(appSrc);

  // 4. Inline config into the app.
  await inlineTsconfig(projectRoot);
  await inlineBiomeConfig(projectRoot);

  // 5. components.json with standalone aliases.
  await rewriteComponentsJson(projectRoot);

  // 6. Merge package.json into the app.
  await mergePackageJson(projectRoot, projectName);

  // 7. Promote the app to the project root, then drop monorepo-only artifacts.
  await promoteAppToRoot(projectRoot, appDir);
}

// Root-level files/dirs the app will replace when promoted, removed BEFORE the
// copy so the app's versions win. (bun.lock is stale post-flatten; regenerated
// on install.)
const ROOT_PATHS_REPLACED_BY_APP = ["package.json", "biome.json", "bun.lock"];
// Monorepo-only scaffolding removed AFTER the app's files are copied to root.
const MONOREPO_ONLY_ROOT_PATHS = ["turbo.json", "apps", "packages"];

/**
 * Promote the app to the project root: copy every file the app owns up to the
 * root (overwriting the monorepo root's package.json/biome.json), then remove
 * the monorepo scaffolding (apps/, packages/, turbo.json).
 */
async function promoteAppToRoot(projectRoot: string, appDir: string): Promise<void> {
  // 1. Remove the root artifacts the app versions replace, so the copy is clean.
  await Promise.all(
    ROOT_PATHS_REPLACED_BY_APP.map((relativePath) => removePath(join(projectRoot, relativePath)))
  );

  // 2. Copy the app's contents (src/, package.json, tsconfig.json, biome.json,
  //    components.json, next.config.ts, postcss.config.mjs, public/, .gitignore,
  //    README, ...) up to the project root.
  const appEntries = await readdir(appDir, { withFileTypes: true });
  await Promise.all(
    appEntries.map((entry) =>
      copyDirectory(join(appDir, entry.name), join(projectRoot, entry.name))
    )
  );

  // 3. Remove the now-redundant monorepo scaffolding.
  await Promise.all(
    MONOREPO_ONLY_ROOT_PATHS.map((relativePath) => removePath(join(projectRoot, relativePath)))
  );
}
