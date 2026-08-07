/**
 * Guard against shipping a dependency npm can't resolve.
 *
 * Both CLIs bundle `@notils/transform` into `dist` at build time (tsup
 * `noExternal`), so it must NOT appear in `dependencies` — it's private and
 * never published, and npm would try to fetch it and 404 on every install.
 *
 * This shipped once: create-notils@0.3.0 and @notils/cli@0.3.0 both declared
 * `"@notils/transform": "workspace:*"` as a runtime dependency, and every
 * `npm create notils@latest` / `bunx @notils/cli` failed with
 * `GET https://registry.npmjs.org/@notils%2ftransform - 404`. The bundle was
 * fine; the manifest asked for a package that doesn't exist. Fixed in 0.3.1.
 *
 * Two independent checks, because either alone would have missed it:
 *   1. No `workspace:` protocol in `dependencies` — npm cannot resolve it.
 *   2. No unpublished `@notils/*` package in `dependencies`, whatever the range.
 *
 * Run from packages/transform:  bun run check:publishable
 */

import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

/** Packages that are published to npm, and so are legitimate dependencies. */
const PUBLISHED = new Set<string>(["create-notils", "@notils/cli"]);

const CLI_PACKAGES = ["create-notils", "cli"];

let failures = 0;

function fail(message: string): void {
  failures++;
  console.log(`  FAIL ${message}`);
}

function ok(message: string): void {
  console.log(`  ok   ${message}`);
}

const repoRoot = resolve(import.meta.dirname, "..", "..", "..");

for (const directory of CLI_PACKAGES) {
  const manifestPath = join(repoRoot, "packages", directory, "package.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
    name: string;
    dependencies?: Record<string, string>;
    files?: string[];
    publishConfig?: { access?: string };
  };

  console.log(`\n=== ${manifest.name} ===`);
  const dependencies = Object.entries(manifest.dependencies ?? {});

  const workspaceDeps = dependencies.filter(([, range]) => range.startsWith("workspace:"));
  if (workspaceDeps.length > 0) {
    fail(
      `workspace: protocol in dependencies (npm cannot resolve it): ${workspaceDeps
        .map(([name]) => name)
        .join(", ")} — move to devDependencies, it is bundled at build time`
    );
  } else {
    ok("no workspace: protocol in dependencies");
  }

  const unpublished = dependencies.filter(
    ([name]) => name.startsWith("@notils/") && !PUBLISHED.has(name)
  );
  if (unpublished.length > 0) {
    fail(
      `depends on unpublished package(s): ${unpublished
        .map(([name]) => name)
        .join(", ")} — every install would 404`
    );
  } else {
    ok("no unpublished @notils/* in dependencies");
  }

  // A scoped package defaults to restricted; without this its first publish is
  // rejected outright.
  if (manifest.name.startsWith("@") && manifest.publishConfig?.access !== "public") {
    fail("scoped package without publishConfig.access: public");
  } else {
    ok("publish access is correct");
  }

  if (!manifest.files?.includes("dist")) {
    fail("`files` does not include dist — the published package would have no code");
  } else {
    ok("`files` includes dist");
  }
}

console.log(
  failures === 0
    ? "\nall publishable checks passed"
    : `\n${failures} publishable check(s) FAILED — do not publish`
);
process.exit(failures === 0 ? 0 : 1);
