import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { LIBRARY_PACKAGE_NAMES } from "./packages.js";

/**
 * Rewrites internal `@<scope>/*` module specifiers to a flattened project's
 * `@/*` alias form. Extracted from create-notils's flatten step so `@notils/cli
 * add` can apply the identical rewrite to a single package.
 *
 * The rewrite is **specifier-aware**: it only touches quoted module paths in
 * import/export/require/CSS-`@import` position, never comments or prose that
 * happen to contain the same string. That matters — the packages' own doc
 * comments reference `@notils/ui` in prose, and rewriting those would be wrong.
 */

/** The template's own scope. A monorepo scaffold renames this to the project's. */
export const TEMPLATE_SCOPE = "@notils";

/** Rewrite one `<scope>/ui/<area>/...` specifier to its `@/<area>/...` form. */
export function rewriteUiSpecifier(specifier: string, scope: string = TEMPLATE_SCOPE): string {
  // @notils/ui/components/ui/button -> @/components/ui/button
  // @notils/ui/lib/utils            -> @/lib/utils
  // @notils/ui/hooks/use-x          -> @/hooks/use-x
  return specifier.startsWith(`${scope}/ui/`)
    ? `@/${specifier.slice(`${scope}/ui/`.length)}`
    : specifier;
}

/** Rewrite one `<scope>/<library>/<subpath>` specifier to `@/lib/<library>/<subpath>`. */
export function rewriteLibrarySpecifier(specifier: string, scope: string = TEMPLATE_SCOPE): string {
  // @notils/auth-custom/contract  -> @/lib/auth-custom/contract
  // @notils/api-client/auth/types -> @/lib/api-client/auth/types
  for (const library of LIBRARY_PACKAGE_NAMES) {
    const prefix = `${scope}/${library}/`;
    if (specifier.startsWith(prefix)) {
      return `@/lib/${library}/${specifier.slice(prefix.length)}`;
    }
  }
  return specifier;
}

/** Rewrite one internal specifier of either kind. Non-internal specifiers pass through. */
export function rewriteSpecifier(specifier: string, scope: string = TEMPLATE_SCOPE): string {
  return specifier === `${scope}/ui` || specifier.startsWith(`${scope}/ui/`)
    ? rewriteUiSpecifier(specifier, scope)
    : rewriteLibrarySpecifier(specifier, scope);
}

/**
 * Rewrite every internal module specifier in a source string.
 *
 * Matches a quoted specifier starting with `<scope>/` in any of:
 *   import ... from "@notils/x/y"      export ... from '@notils/x/y'
 *   import("@notils/x/y")              require("@notils/x/y")
 *   @import "@notils/x/y"
 * We match the quoted-string form directly, so only real specifiers change.
 */
export function rewriteSpecifiersInSource(
  contents: string,
  scope: string = TEMPLATE_SCOPE
): string {
  // Escape the scope for use in a character-class-free regex: a scope is
  // `@word-chars` by npm's rules, but escaping keeps this safe if that changes.
  const escapedScope = scope.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(["'])(${escapedScope}\\/[^"']+)\\1`, "g");
  return contents.replace(pattern, (_match, quote: string, specifier: string) => {
    return `${quote}${rewriteSpecifier(specifier, scope)}${quote}`;
  });
}

/** File extensions whose module specifiers we rewrite. */
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".css"]);
const IGNORED_DIRECTORIES = new Set(["node_modules", ".git", ".next", "dist", "build"]);

function hasSourceExtension(fileName: string): boolean {
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex !== -1 && SOURCE_EXTENSIONS.has(fileName.slice(dotIndex));
}

/** Recursively rewrite internal specifiers in every source file under `directory`. */
export async function rewriteSpecifiersInTree(
  directory: string,
  scope: string = TEMPLATE_SCOPE
): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });
  await Promise.all(
    entries.map(async (entry) => {
      const entryPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) {
          await rewriteSpecifiersInTree(entryPath, scope);
        }
        return;
      }
      if (!hasSourceExtension(entry.name)) {
        return;
      }
      const original = await readFile(entryPath, "utf8");
      const rewritten = rewriteSpecifiersInSource(original, scope);
      if (rewritten !== original) {
        await writeFile(entryPath, rewritten, "utf8");
      }
    })
  );
}

/**
 * Rewrite internal specifiers to a DIFFERENT scope rather than to `@/*` — what a
 * monorepo `add` needs: the project owns `@my-app/*`, but the fetched source
 * still says `@notils/*`.
 */
export function rewriteScopeInSource(contents: string, targetScope: string): string {
  if (targetScope === TEMPLATE_SCOPE) return contents;
  return contents.replaceAll(`${TEMPLATE_SCOPE}/`, `${targetScope}/`);
}
