import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { pathExists, writeTextFile } from "@notils/transform/filesystem";
import type { NotilsConfig } from "@notils/transform/project-config";

/**
 * Theme-token injection for `add ui`.
 *
 * The components reference semantic tokens (`bg-primary`, `text-muted-foreground`)
 * that resolve through CSS custom properties. Without a token layer they render
 * unstyled — so `add ui` on a brownfield project produces visibly broken output
 * unless the user is told and helped.
 *
 * We *offer* to append the tokens; we never do it silently. Editing someone's
 * existing stylesheet is invasive, so it stays opt-in per run.
 *
 * The token block is extracted from the fetched `ui` package's own globals.css
 * rather than hardcoded here — one source of truth, so a theme change upstream
 * reaches `add` without a second edit.
 */

/**
 * Stylesheets that plausibly hold a Next.js project's global CSS, best first.
 * Shared with compat.ts's token check so the warning and the offer look in the
 * same places.
 */
export function stylesheetCandidates(config: NotilsConfig): string[] {
  const componentsRoot = config.paths.components;
  const sourceRoot = componentsRoot.includes("/")
    ? componentsRoot.slice(0, componentsRoot.lastIndexOf("/"))
    : "";
  const withinSource = (relative: string) => (sourceRoot ? `${sourceRoot}/${relative}` : relative);

  return [
    withinSource("app/globals.css"),
    withinSource("styles/globals.css"),
    withinSource("app/global.css"),
    withinSource("index.css"),
    "src/app/globals.css",
    "app/globals.css",
    "src/styles/globals.css",
    "styles/globals.css",
  ];
}

/** Find the project's global stylesheet, or null if there isn't one. */
export async function findStylesheet(
  projectRoot: string,
  config: NotilsConfig
): Promise<string | null> {
  const seen = new Set<string>();
  for (const candidate of stylesheetCandidates(config)) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    if (await pathExists(join(projectRoot, candidate))) {
      return candidate;
    }
  }
  return null;
}

/**
 * Pull the theme layer out of the `ui` package's globals.css: everything from
 * `@custom-variant` onward, i.e. the dark-mode variant, the `:root`/`.dark`
 * token blocks, `@theme inline`, and the base layer.
 *
 * Deliberately EXCLUDES the leading `@import "tailwindcss"` and `@source` lines
 * — the target project already has its own, and duplicating either breaks the
 * build or rescans the wrong tree.
 */
export function extractThemeLayer(uiGlobalsCss: string): string | null {
  const start = uiGlobalsCss.indexOf("@custom-variant");
  if (start === -1) {
    return null;
  }
  return uiGlobalsCss.slice(start).trim();
}

/** Read the theme layer out of a fetched `ui` package directory. */
export async function readThemeLayer(fetchedUiRoot: string): Promise<string | null> {
  const path = join(fetchedUiRoot, "src", "styles", "globals.css");
  if (!(await pathExists(path))) {
    return null;
  }
  const css = await readFile(path, "utf8").catch(() => null);
  return css ? extractThemeLayer(css) : null;
}

/**
 * A short, readable preview of what would be appended — the section headers and
 * a token count, not 70 lines of OKLCH values.
 */
export function summarizeThemeLayer(themeLayer: string): string[] {
  const lines: string[] = [];
  const rootTokens = countTokens(themeLayer, ":root");
  const darkTokens = countTokens(themeLayer, ".dark");

  if (themeLayer.includes("@custom-variant dark")) {
    lines.push("@custom-variant dark  — class-based dark mode");
  }
  if (rootTokens > 0) {
    lines.push(`:root { … }            — ${rootTokens} light-mode tokens`);
  }
  if (darkTokens > 0) {
    lines.push(`.dark { … }            — ${darkTokens} dark-mode tokens`);
  }
  if (themeLayer.includes("@theme inline")) {
    lines.push("@theme inline { … }    — maps tokens to Tailwind utilities");
  }
  if (themeLayer.includes("@layer base")) {
    lines.push("@layer base { … }      — border/background defaults");
  }
  return lines;
}

/** Count `--token:` declarations inside the first block with the given selector. */
function countTokens(css: string, selector: string): number {
  const selectorIndex = css.indexOf(`${selector} {`);
  if (selectorIndex === -1) return 0;
  const open = css.indexOf("{", selectorIndex);
  const close = css.indexOf("}", open);
  if (open === -1 || close === -1) return 0;
  return css.slice(open, close).match(/^\s*--[\w-]+\s*:/gm)?.length ?? 0;
}

/**
 * Append the theme layer to a stylesheet.
 *
 * Appends rather than inserting at a specific position: in Tailwind v4 the token
 * blocks and `@theme inline` work after `@import "tailwindcss"`, and appending is
 * the only edit that can't reorder or damage what the user already had. A marker
 * comment makes the block identifiable if they want to remove it later.
 */
export async function appendThemeLayer(
  projectRoot: string,
  stylesheetRelativePath: string,
  themeLayer: string
): Promise<void> {
  const path = join(projectRoot, stylesheetRelativePath);
  const existing = await readFile(path, "utf8");
  const separator = existing.endsWith("\n") ? "\n" : "\n\n";
  const block = [
    "/* --- notils theme tokens -------------------------------------------------",
    "   Added by `notils add ui`. These are yours to edit — change the values,",
    "   keep the token names (the components reference them via bg-primary etc).",
    "   ---------------------------------------------------------------------- */",
    themeLayer,
    "/* --- end notils theme tokens -------------------------------------------- */",
  ].join("\n");

  await writeTextFile(path, `${existing}${separator}${block}\n`);
}
