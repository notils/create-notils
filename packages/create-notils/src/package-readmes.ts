import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { rewriteReadme } from "@notils/transform/readme";

import { writeTextFile } from "./filesystem.js";

/**
 * Rewrite each surviving package's README for the generated project.
 *
 * The template's package READMEs arrive with the rest of the template and are
 * genuinely useful — but they link into `../../docs/`, and `docs/` is on
 * `PATHS_TO_STRIP`, so **every scaffold shipped with dead documentation links**.
 * Nobody noticed because a broken markdown link fails silently.
 *
 * Uses the same rewriter as `@notils/cli add` (see `@notils/transform/readme`), so
 * a package that arrives via the scaffold and one that arrives via `add` get
 * identical treatment.
 *
 * Monorepo only. In a standalone project the packages fold into `src/lib/`, and
 * `flattenToStandalone` copies only each package's `src/`, so their READMEs never
 * reach the output — a deliberate simplification, not an oversight: a folded
 * project has one README at its root describing the whole thing.
 */
export async function rewritePackageReadmes(
  projectRoot: string,
  options: { scope: string }
): Promise<string[]> {
  const packagesRoot = join(projectRoot, "packages");

  let entries: string[];
  try {
    entries = (await readdir(packagesRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    // No packages/ — a standalone scaffold, or one where everything was pruned.
    return [];
  }

  const rewritten: string[] = [];

  for (const packageName of entries) {
    const readmePath = join(packagesRoot, packageName, "README.md");
    let contents: string;
    try {
      contents = await readFile(readmePath, "utf8");
    } catch {
      continue;
    }

    await writeTextFile(
      readmePath,
      rewriteReadme(contents, {
        // The scope rename runs AFTER this in `configureProject`, so the README
        // still says `@notils/` here. Passing the target scope lets the rewriter
        // handle it, and the later whole-tree rename then finds nothing left to do.
        scope: options.scope,
        shape: "monorepo",
        packageName,
        location: `packages/${packageName}`,
      })
    );
    rewritten.push(`packages/${packageName}/README.md`);
  }

  return rewritten;
}
