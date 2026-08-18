/**
 * Make an internal package's README fit a generated project.
 *
 * The package READMEs are genuinely useful API documentation — what's inside, how
 * to use it, which decisions are load-bearing — so a generated project should keep
 * them. But they are written for THIS repository, and three things in them break
 * once copied out:
 *
 *   1. links into `../../docs/`, which `create-notils` strips from every scaffold,
 *      so the link 404s in the user's project;
 *   2. the `@notils/*` scope, which a monorepo renames to its own;
 *   3. sibling links like `../api-client`, which are correct in a monorepo but
 *      meaningless in a standalone project where everything folded into `src/lib/`.
 *
 * Shared by both CLIs on purpose. `create-notils` was shipping these READMEs with
 * dead `../../docs/` links, and `@notils/cli add` was dropping them entirely — two
 * paths, two different wrong answers for the same file. One rewriter means they
 * cannot disagree again.
 */

/** Where the design docs live once published, for links that pointed at `../../docs/`. */
const DOCS_BASE_URL = "https://github.com/notils/create-notils/blob/main/docs";

export type RewriteReadmeOptions = {
  /**
   * The project's own scope WITH the leading `@` (e.g. `@my-app`), or null for a
   * standalone project, which has no scope.
   */
  scope: string | null;
  /** The project shape, which decides whether sibling package links still resolve. */
  shape: "monorepo" | "standalone";
  /** Package directory name, used to describe where the source landed. */
  packageName: string;
  /**
   * Where the package's source lives in the generated project, relative to its
   * root (e.g. `packages/auth-custom` or `src/lib/auth-custom`). Shown in the
   * note prepended to the file.
   */
  location: string;
};

/**
 * Rewrite one README's content for a generated project.
 *
 * Deliberately conservative: it fixes links and the scope, and prepends a short
 * provenance note. It does NOT try to rewrite prose — statements like "the
 * create-notils monorepo" are handled by the caller's existing whole-tree project
 * rename, and rewriting sentences heuristically would do more harm than good.
 */
export function rewriteReadme(contents: string, options: RewriteReadmeOptions): string {
  const { scope, shape, packageName, location } = options;

  let result = contents;

  // 1. `../../docs/x.md` → the published URL. These are the links that are simply
  //    dead in a generated project, since `docs/` never ships.
  result = result.replace(
    /\]\(\.\.\/\.\.\/docs\/([^)]+)\)/g,
    (_match, path: string) => `](${DOCS_BASE_URL}/${path})`
  );

  // 2. The template scope → the project's own. Plain replacement is right here:
  //    a README is prose about packages, so every `@notils/` in it IS a package
  //    reference. (In SOURCE files the rewrite must be specifier-aware, which is
  //    why that lives in specifiers.ts instead.)
  if (scope) {
    result = result.split("@notils/").join(`${scope}/`);
  }

  // 3. Sibling links. In a standalone project the library packages fold into
  //    `src/lib/<name>/`, so a `../<sibling>` link from one README still resolves —
  //    the relative depth is unchanged. The exception is `ui`, which does not fold
  //    into `src/lib/` but spreads across `src/components/` and `src/lib/`, so
  //    links to it need redirecting.
  //
  //    Sibling `src/...` paths (e.g. `../auth-custom/src/contract.ts`) are left
  //    alone deliberately: fixing them means knowing each package's internal fold,
  //    and a slightly-long path a reader can follow beats a wrong one. The
  //    provenance note above points at upstream for the authoritative layout.
  if (shape === "standalone") {
    result = result.replace(/\]\(\.\.\/ui\b([^)]*)\)/g, "](../../components$1)");
  }

  return `${provenanceNote(packageName, location, scope)}${result}`;
}

/**
 * A short note at the top saying this is the user's code now.
 *
 * The one thing every copied README needs and none of them say: the file describes
 * a package that has been vendored into your repository, is yours to edit, and
 * came from a specific upstream you can go read.
 */
function provenanceNote(packageName: string, location: string, scope: string | null): string {
  const displayName = scope ? `${scope}/${packageName}` : packageName;
  // Deliberately does NOT name the CLI packages. `create-notils`'s whole-tree
  // rename rewrites the literal `create-notils` to the project's name, and its
  // scope rename rewrites `@notils/` to the project's scope — so a note mentioning
  // either came out as nonsense like "@my-app/cli". Link to the repository
  // instead: the URL survives both rewrites untouched.
  return `<!-- Vendored into this project from notils/create-notils. -->

> **This is your code.** \`${displayName}\` lives at \`${location}\` in this
> repository — edit it freely. Upstream source and design notes:
> <https://github.com/notils/create-notils>

`;
}
