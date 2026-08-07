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

// ---------------------------------------------------------------------------
// The template ref both CLIs fetch must exist as a pushed tag. If it doesn't,
// every `create-notils` scaffold and every `notils add` fails at the fetch step
// — at runtime, for users, with nothing catching it before publish.
// ---------------------------------------------------------------------------
console.log("\n=== template ref ===");
{
  const templateVersion = JSON.parse(
    await readFile(join(repoRoot, "template-version.json"), "utf8")
  ) as { ref?: string };
  const ref = templateVersion.ref;

  if (!ref) {
    fail("template-version.json has no `ref`");
  } else {
    // `git rev-parse <ref>^{}` resolves an annotated tag to its commit and exits
    // non-zero if the ref does not exist locally.
    const resolved = Bun.spawnSync(["git", "rev-parse", "--verify", "--quiet", `${ref}^{}`], {
      cwd: repoRoot,
    });
    if (resolved.exitCode !== 0) {
      fail(`template ref "${ref}" is not a tag in this repo — create it before publishing`);
    } else {
      ok(`template ref "${ref}" exists locally`);
      // Local-only is not enough: the CLIs fetch from GitHub, so an unpushed tag
      // still fails for every user.
      const remote = Bun.spawnSync(["git", "ls-remote", "--tags", "origin", ref], {
        cwd: repoRoot,
      });
      const pushed = remote.exitCode === 0 && remote.stdout.toString().trim().length > 0;
      if (pushed) {
        ok(`template ref "${ref}" is pushed to origin`);
      } else {
        fail(`template ref "${ref}" is NOT pushed — users would get "could not find commit hash"`);
      }
    }
  }
}

console.log(
  failures === 0
    ? "\nall publishable checks passed"
    : `\n${failures} publishable check(s) FAILED — do not publish`
);
process.exit(failures === 0 ? 0 : 1);
