import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { AppContentPlan } from "@notils/transform/app-content";

import { writeTextFile } from "./filesystem.js";

/**
 * Rewrite the app's own source to match what the project actually has.
 *
 * Pruning files is only half the job: `layout.tsx` imports the nav bar and
 * `page.tsx` imports the example form, so removing those files without editing
 * their importers turns a "cleaner scaffold" into one that doesn't compile. Issue
 * #2 and #3 both name dangling imports as the failure to avoid, so these rewrites
 * are not optional polish.
 */

/**
 * Remove the nav-bar import and usage from `layout.tsx` when the nav bar was
 * pruned.
 *
 * Deliberately targeted string surgery rather than a general JSX transform: the
 * template's layout is a file we own and control, so the two shapes it can take
 * are known. A parser would be more robust against edits we don't make, at the
 * cost of a dependency and a lot of machinery for one file. If the expected text
 * isn't found, this leaves the file alone rather than guessing — and the caller
 * verifies the result by typechecking the scaffold.
 */
export async function removeNavBarFromLayout(appDirectory: string): Promise<boolean> {
  const layoutPath = join(appDirectory, "src", "app", "layout.tsx");
  let contents: string;
  try {
    contents = await readFile(layoutPath, "utf8");
  } catch {
    return false;
  }

  const withoutImport = contents.replace(/^import\s+\{\s*NavBar\s*\}\s+from\s+"[^"]*";\n/m, "");
  // The nav bar sits as a sibling of `{children}` inside the provider; drop just
  // that element and the blank line it may leave behind.
  const withoutUsage = withoutImport.replace(/^\s*<NavBar\s*\/>\n/m, "");

  if (withoutUsage === contents) {
    return false;
  }

  // Collapse the double blank line the import removal can leave between groups.
  await writeTextFile(layoutPath, withoutUsage.replace(/\n{3,}/g, "\n\n"));
  return true;
}

/**
 * The fresh app's landing page (issue #2).
 *
 * Deliberately modeled on Next.js's own default page: minimal, informative, and
 * obviously meant to be replaced. It imports no optional package — there is no
 * `Button` or other component here — so it renders in every possible selection,
 * with the color classes chosen to match whether the theme layer exists.
 *
 * The one job beyond looking presentable is telling the developer where they are
 * and what to do next, so opening `page.tsx` answers "is this mine to replace?"
 * without a trip to the README.
 */
export function freshLandingPage(options: { projectName: string; hasUi: boolean }): string {
  const { projectName, hasUi } = options;

  // The semantic tokens (`text-muted-foreground`, `bg-muted`) are defined by the ui
  // package's theme. Without the kit they resolve to nothing and the page renders
  // as unstyled black-on-white, so fall back to plain Tailwind utilities that need
  // no theme layer.
  const muted = hasUi ? "text-muted-foreground" : "text-zinc-600 dark:text-zinc-400";
  const chip = hasUi ? "bg-muted" : "bg-zinc-100 dark:bg-zinc-800";

  return `export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24">
      <div className="flex w-full max-w-2xl flex-col gap-6">
        <div className="flex flex-col gap-3">
          <p className="${muted} text-sm font-medium tracking-wide uppercase">
            Notils
          </p>
          <h1 className="text-4xl leading-tight font-semibold tracking-tight">${projectName}</h1>
          <p className="${muted} text-lg">
            Your app starts here. Edit{" "}
            <code className="${chip} rounded px-1.5 py-0.5 font-mono text-sm">
              src/app/page.tsx
            </code>{" "}
            to replace this page.
          </p>
        </div>

        <div className="${muted} flex flex-col gap-2 border-t pt-6 text-sm">
          <p>
            Add capabilities with{" "}
            <code className="${chip} rounded px-1.5 py-0.5 font-mono text-xs">
              notils add &lt;name&gt;
            </code>
            .
          </p>
          <p>
            See{" "}
            <code className="${chip} rounded px-1.5 py-0.5 font-mono text-xs">README.md</code> for
            the project layout and conventions.
          </p>
        </div>
      </div>
    </main>
  );
}
`;
}

/**
 * Replace the template's landing page with the fresh one.
 *
 * The template's page imports the example contact form, so a fresh app needs a
 * genuinely different page rather than an edit — there is nothing left of the
 * original once the demo is gone.
 */
export async function writeFreshLandingPage(
  appDirectory: string,
  projectName: string,
  hasUi: boolean
): Promise<void> {
  await writeTextFile(
    join(appDirectory, "src", "app", "page.tsx"),
    freshLandingPage({ projectName, hasUi })
  );
}

/**
 * Set the app's document metadata to the project's own name.
 *
 * The template ships Next's placeholder ("Create Next App" / "Generated by create
 * next app"), which is wrong in every generated project and is exactly the kind of
 * leftover issue #2 objects to. Left alone for a demo app? No — it's wrong there
 * too, so this runs unconditionally.
 */
export async function rewriteAppMetadata(
  appDirectory: string,
  projectName: string
): Promise<boolean> {
  const layoutPath = join(appDirectory, "src", "app", "layout.tsx");
  let contents: string;
  try {
    contents = await readFile(layoutPath, "utf8");
  } catch {
    return false;
  }

  const rewritten = contents
    .replace(/title:\s*"Create Next App"/, `title: "${projectName}"`)
    .replace(/description:\s*"Generated by create next app"/, `description: "${projectName}"`);

  if (rewritten === contents) {
    return false;
  }
  await writeTextFile(layoutPath, rewritten);
  return true;
}

/**
 * Remove the `ThemeProvider` wrapper from `layout.tsx`.
 *
 * The provider lives in the ui package (`theme/theme.tsx`), so a project that
 * declined the kit has nothing to import — and an unresolvable import in the root
 * layout breaks every route, not just one page. Unwraps rather than deletes:
 * `{children}` must still render.
 */
export async function removeThemeProviderFromLayout(appDirectory: string): Promise<boolean> {
  const layoutPath = join(appDirectory, "src", "app", "layout.tsx");
  let contents: string;
  try {
    contents = await readFile(layoutPath, "utf8");
  } catch {
    return false;
  }

  const withoutImport = contents.replace(
    /^import\s+\{\s*ThemeProvider\s*\}\s+from\s+"[^"]*";\n/m,
    ""
  );
  // Unwrap: drop the opening and closing tags, keeping the children between them.
  const withoutWrapper = withoutImport
    .replace(/^\s*<ThemeProvider[^>]*>\n/m, "")
    .replace(/^\s*<\/ThemeProvider>\n/m, "");

  if (withoutWrapper === contents) {
    return false;
  }
  await writeTextFile(layoutPath, withoutWrapper.replace(/\n{3,}/g, "\n\n"));
  return true;
}

/**
 * Point the app's stylesheet at Tailwind directly when the ui kit was pruned.
 *
 * The template's `globals.css` starts with `@import "@notils/ui/globals.css"`,
 * which brings in both Tailwind and the theme tokens. Without the kit that import
 * resolves to nothing and the CSS build fails — so substitute Tailwind's own entry
 * point. The theme tokens are deliberately NOT inlined: they belong to the ui
 * package, and `notils add ui` appends them when the kit arrives.
 *
 * Needed in the MONOREPO path as well as standalone. Standalone's flatten step has
 * its own equivalent because it merges the two stylesheets, but a monorepo keeps
 * the import as-is, so this is where that shape gets fixed.
 */
export async function rewriteStylesheetWithoutUi(appDirectory: string): Promise<boolean> {
  const globalsPath = join(appDirectory, "src", "app", "globals.css");
  let contents: string;
  try {
    contents = await readFile(globalsPath, "utf8");
  } catch {
    return false;
  }

  // The scope has not been renamed yet at the point this runs, but match either
  // form so the rewrite is not silently order-dependent.
  const rewritten = contents.replace(
    /@import\s+["']@[^/"']+\/ui\/globals\.css["'];/,
    '@import "tailwindcss";'
  );
  if (rewritten === contents) {
    return false;
  }
  await writeTextFile(globalsPath, rewritten);
  return true;
}

/**
 * Apply every app-source rewrite implied by a content plan.
 *
 * One entry point so the caller can't apply the file deletions and forget the
 * importer fixes — the failure mode that produces a broken scaffold.
 */
export async function rewriteAppSource(
  appDirectory: string,
  options: {
    plan: AppContentPlan;
    projectName: string;
    includeDemo: boolean;
    /** Whether the ui kit survived selection. Its theme provider is in the layout. */
    hasUi: boolean;
    /**
     * Whether to repoint `globals.css` at Tailwind when the kit is gone.
     *
     * True for a monorepo, where the app keeps its own stylesheet. False for
     * standalone, whose flatten step merges the stylesheets itself and has already
     * handled the ui-less case — doing it here too would be a redundant second
     * rewrite of the same line.
     */
    rewriteStylesheet: boolean;
  }
): Promise<void> {
  const { plan, projectName, includeDemo, hasUi, rewriteStylesheet } = options;

  await rewriteAppMetadata(appDirectory, projectName);

  if (!plan.keepsNavBar) {
    await removeNavBarFromLayout(appDirectory);
  }

  if (!hasUi) {
    await removeThemeProviderFromLayout(appDirectory);
    if (rewriteStylesheet) {
      await rewriteStylesheetWithoutUi(appDirectory);
    }
  }

  // The template's landing page renders the example contact form. It survives
  // only for a demo app that ALSO kept form-builder — a demo app without it
  // (`--demo --packages ui`) would otherwise import a file that was just pruned.
  // Both cases collapse to the same fix: write the fresh page instead.
  const keepsTemplatePage = includeDemo && !plan.removePaths.includes("src/app/contact-form.tsx");
  if (!keepsTemplatePage) {
    await writeFreshLandingPage(appDirectory, projectName, hasUi);
  }
}
