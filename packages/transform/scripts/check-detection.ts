/**
 * Checks for `project-config.ts` — shape detection and the installed-version
 * record. Run from packages/transform:
 *
 *   bun run check:detection
 *
 * The repo has no test runner yet, so this is a self-contained script rather
 * than a suite. It builds every fixture in a temp dir (no dependency on any
 * particular machine's checkouts) except the one case worth asserting against
 * the real thing: THIS repo, whose root is named `create-notils` while its
 * packages are `@notils/*` — the exact trap that makes root-name scope
 * inference wrong. Exits non-zero on failure.
 */

import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  detectProjectConfig,
  readProjectConfig,
  recordInstalled,
  writeProjectConfig,
} from "@notils/transform/project-config";

let failures = 0;

function check(label: string, condition: boolean, detail: string): void {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label} — ${detail}`);
  }
}

async function detect(label: string, root: string) {
  const { config, reasons, lowConfidence } = await detectProjectConfig(root);
  console.log(`\n=== ${label} ===`);
  console.log(`  shape=${config.shape} scope=${config.scope} lowConfidence=${lowConfidence}`);
  console.log(`  paths=${JSON.stringify(config.paths)}`);
  for (const reason of reasons) {
    console.log(`    · ${reason}`);
  }
  return { config, lowConfidence };
}

/** Write a JSON file, creating parent directories as needed. */
async function writeJson(filePath: string, data: unknown): Promise<void> {
  await mkdir(join(filePath, ".."), { recursive: true });
  await writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

async function fixture(prefix: string): Promise<string> {
  return await mkdtemp(join(tmpdir(), `notils-${prefix}-`));
}

// ---------------------------------------------------------------------------
// 1. This repo: root name `create-notils`, packages scoped `@notils/*`.
//    The scope must come from the packages, never the root name.
// ---------------------------------------------------------------------------
const repoRoot = resolve(import.meta.dirname, "..", "..", "..");
{
  const { config } = await detect("this repo (monorepo, misleading root name)", repoRoot);
  check("shape is monorepo", config.shape === "monorepo", `got ${config.shape}`);
  check("packages root", config.paths.packages === "packages", `got ${config.paths.packages}`);
  check(
    "scope read from packages/, not root name",
    config.scope === "@notils",
    `got ${config.scope} (root is named create-notils, so @create-notils means it used the root name)`
  );
}

// ---------------------------------------------------------------------------
// 2. Standalone, as create-notils scaffolds it.
// ---------------------------------------------------------------------------
{
  const root = await fixture("standalone");
  await writeJson(join(root, "package.json"), { name: "my-app" });
  await writeJson(join(root, "tsconfig.json"), {
    compilerOptions: { paths: { "@/*": ["./src/*"] } },
  });
  await writeJson(join(root, "components.json"), { aliases: { components: "@/components" } });
  const { config } = await detect("standalone scaffold", root);
  check("shape is standalone", config.shape === "standalone", `got ${config.shape}`);
  check("no scope", config.scope === null, `got ${config.scope}`);
  check("lib path", config.paths.lib === "src/lib", `got ${config.paths.lib}`);
  check(
    "components path",
    config.paths.components === "src/components",
    `got ${config.paths.components}`
  );
}

// ---------------------------------------------------------------------------
// 3. JSONC tsconfig: comments AND a `//` inside a string. A naive
//    comment-stripping regex corrupts the second one — that bug happened.
// ---------------------------------------------------------------------------
{
  const root = await fixture("jsonc");
  await writeJson(join(root, "package.json"), { name: "commented" });
  await writeFile(
    join(root, "tsconfig.json"),
    `{
  // a leading line comment
  "$schema": "https://json.schemastore.org/tsconfig",
  /* block comment */
  "compilerOptions": {
    "paths": { "@/*": ["./app/*"] } // trailing comment
  }
}`,
    "utf8"
  );
  const { config } = await detect("JSONC tsconfig (comments + // inside a string)", root);
  check("parsed through comments", config.paths.lib === "app/lib", `got ${config.paths.lib}`);
}

// ---------------------------------------------------------------------------
// 3b. Root-level alias: an app-router project with app/ at the root and no src/
//     aliases `@/*` to `./*`. Stripping only a trailing "/*" leaves a literal
//     "*", producing paths like "*&#47;lib" — a real brownfield project hit this.
// ---------------------------------------------------------------------------
for (const target of ["./*", "*"]) {
  const root = await fixture("root-alias");
  await writeJson(join(root, "package.json"), { name: "root-aliased" });
  await writeJson(join(root, "tsconfig.json"), {
    compilerOptions: { paths: { "@/*": [target] } },
  });
  const { config } = await detect(`root-level alias "@/*" → "${target}"`, root);
  check(`lib has no glob (${target})`, config.paths.lib === "lib", `got ${config.paths.lib}`);
  check(
    `components has no glob (${target})`,
    config.paths.components === "components",
    `got ${config.paths.components}`
  );
}

// ---------------------------------------------------------------------------
// 4. Brownfield with nothing to go on — must not throw, must flag low confidence.
// ---------------------------------------------------------------------------
{
  const root = await fixture("bare");
  await writeJson(join(root, "package.json"), { name: "bare-app" });
  const { config, lowConfidence } = await detect("brownfield, no tsconfig", root);
  check("shape is standalone", config.shape === "standalone", `got ${config.shape}`);
  check("flagged low confidence", lowConfidence, "should be true with no source root");
}

// ---------------------------------------------------------------------------
// 5. Scoped monorepo — scope from the workspace package.
// ---------------------------------------------------------------------------
{
  const root = await fixture("scoped");
  await writeJson(join(root, "package.json"), {
    name: "@acme/root",
    workspaces: ["packages/*"],
  });
  await writeJson(join(root, "packages", "thing", "package.json"), { name: "@acme/thing" });
  const { config } = await detect("scoped monorepo", root);
  check("scope is @acme", config.scope === "@acme", `got ${config.scope}`);
}

// ---------------------------------------------------------------------------
// 6. Yarn-style object `workspaces` — the other supported shape.
// ---------------------------------------------------------------------------
{
  const root = await fixture("yarn-workspaces");
  await writeJson(join(root, "package.json"), {
    name: "yarn-root",
    workspaces: { packages: ["packages/*"] },
  });
  await writeJson(join(root, "packages", "ui", "package.json"), { name: "@yr/ui" });
  const { config } = await detect("yarn object workspaces", root);
  check("shape is monorepo", config.shape === "monorepo", `got ${config.shape}`);
  check("scope is @yr", config.scope === "@yr", `got ${config.scope}`);
}

// ---------------------------------------------------------------------------
// 7. `workspaces` declared but no packages/ — must NOT be treated as a monorepo.
// ---------------------------------------------------------------------------
{
  const root = await fixture("workspaces-no-packages");
  await writeJson(join(root, "package.json"), { name: "app-only", workspaces: ["apps/*"] });
  const { config } = await detect("workspaces but no packages/", root);
  check("shape is standalone", config.shape === "standalone", `got ${config.shape}`);
}

// ---------------------------------------------------------------------------
// 8. recordInstalled — the version-drift record `list` reads.
// ---------------------------------------------------------------------------
{
  const root = await fixture("record");
  console.log("\n=== recordInstalled ===");

  await writeProjectConfig(root, {
    shape: "standalone",
    scope: null,
    paths: { packages: "packages", lib: "src/lib", components: "src/components" },
  });

  // A fresh config has no record at all — "unknown", not "nothing installed".
  const initial = await readProjectConfig(root);
  check("absent before any add", initial?.installed === undefined, `got ${initial?.installed}`);

  await recordInstalled(root, ["ui", "form-builder"], "v0.2.0");
  const afterFirst = await readProjectConfig(root);
  check(
    "records each package at the ref",
    afterFirst?.installed?.ui?.ref === "v0.2.0" &&
      afterFirst?.installed?.["form-builder"]?.ref === "v0.2.0",
    JSON.stringify(afterFirst?.installed)
  );

  // A later add at a newer ref must update only what it wrote, leaving the rest
  // at their old ref — that difference is exactly what drift reporting shows.
  await recordInstalled(root, ["form-builder"], "v0.3.0");
  const afterSecond = await readProjectConfig(root);
  check(
    "merges without clobbering other entries",
    afterSecond?.installed?.ui?.ref === "v0.2.0" &&
      afterSecond?.installed?.["form-builder"]?.ref === "v0.3.0",
    JSON.stringify(afterSecond?.installed)
  );

  // The rest of the config must survive the merge.
  check(
    "preserves shape/scope/paths",
    afterSecond?.shape === "standalone" && afterSecond?.paths.lib === "src/lib",
    JSON.stringify(afterSecond)
  );

  // Recording nothing is a no-op, not a crash or a wipe (an `add` where every
  // file was skipped as user-modified passes an empty list).
  await recordInstalled(root, [], "v0.4.0");
  const afterEmpty = await readProjectConfig(root);
  check(
    "empty list changes nothing",
    afterEmpty?.installed?.ui?.ref === "v0.2.0" &&
      afterEmpty?.installed?.["form-builder"]?.ref === "v0.3.0",
    JSON.stringify(afterEmpty?.installed)
  );
}

// ---------------------------------------------------------------------------
// 9. recordInstalled with no config — must not throw or create one.
// ---------------------------------------------------------------------------
{
  const root = await fixture("record-noconfig");
  console.log("\n=== recordInstalled without notils.json ===");
  await recordInstalled(root, ["ui"], "v0.2.0");
  check("no config is created", (await readProjectConfig(root)) === null, "a config appeared");
}

console.log(
  failures === 0 ? "\nall detection checks passed" : `\n${failures} detection check(s) FAILED`
);
process.exit(failures === 0 ? 0 : 1);
