import { cp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** Recursively remove a path if it exists. Does nothing if it is already absent. */
export async function removePath(targetPath: string): Promise<void> {
  await rm(targetPath, { recursive: true, force: true });
}

/** Read and parse a JSON file. */
export async function readJsonFile<T = Record<string, unknown>>(filePath: string): Promise<T> {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw) as T;
}

/** Serialize `data` as JSON with a 2-space indent and a trailing newline, then write it. */
export async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
  const serialized = `${JSON.stringify(data, null, 2)}\n`;
  await writeFile(filePath, serialized, "utf8");
}

/** Copy a directory tree recursively from `sourceDir` to `destinationDir`. */
export async function copyDirectory(sourceDir: string, destinationDir: string): Promise<void> {
  await cp(sourceDir, destinationDir, { recursive: true });
}

/**
 * Copy a directory tree only if the source exists. Returns whether it copied.
 * Useful for optional template directories (e.g. an empty `hooks/` that git
 * doesn't track).
 */
export async function copyDirectoryIfExists(
  sourceDir: string,
  destinationDir: string
): Promise<boolean> {
  try {
    await cp(sourceDir, destinationDir, { recursive: true });
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

/** Write `contents` to `filePath`, overwriting any existing file. */
export async function writeTextFile(filePath: string, contents: string): Promise<void> {
  await writeFile(filePath, contents, "utf8");
}

// A single textual replacement to apply across the project tree.
export type TextReplacement = {
  find: string;
  replaceWith: string;
};

// Directories we never descend into when rewriting text — dependencies, build
// output, and version-control internals hold no source we should touch.
const IGNORED_DIRECTORIES = new Set([
  "node_modules",
  ".git",
  ".turbo",
  ".next",
  "dist",
  "build",
  "out",
]);

// Only these file extensions are treated as editable text. Anything else
// (images, fonts, lockfiles we don't want reflowed) is left untouched.
const TEXT_FILE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".jsonc",
  ".md",
  ".mdx",
  ".css",
  ".yaml",
  ".yml",
  ".env",
  ".example",
]);

function getFileExtension(fileName: string): string {
  const lastDotIndex = fileName.lastIndexOf(".");
  return lastDotIndex === -1 ? "" : fileName.slice(lastDotIndex);
}

function applyReplacements(contents: string, replacements: TextReplacement[]): string {
  let result = contents;
  for (const { find, replaceWith } of replacements) {
    if (result.includes(find)) {
      result = result.split(find).join(replaceWith);
    }
  }
  return result;
}

/**
 * Apply each replacement to every UTF-8 text file under `directory`, skipping
 * dependency/build directories and non-text files.
 *
 * IMPORTANT: this is intentionally used only for renaming *source identifiers*
 * (the project name across component/config source). It must NOT be relied on
 * to fix package.json metadata — that is done explicitly in `metadata.ts`,
 * because a blind rename corrupts starter-owned fields (see docs/issue #13).
 */
export async function replaceInDirectoryTree(
  directory: string,
  replacements: TextReplacement[]
): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });

  await Promise.all(
    entries.map(async (entry) => {
      const entryPath = join(directory, entry.name);

      if (entry.isDirectory()) {
        if (IGNORED_DIRECTORIES.has(entry.name)) {
          return;
        }
        await replaceInDirectoryTree(entryPath, replacements);
        return;
      }

      if (!TEXT_FILE_EXTENSIONS.has(getFileExtension(entry.name))) {
        return;
      }

      const originalContents = await readFile(entryPath, "utf8");
      const rewrittenContents = applyReplacements(originalContents, replacements);
      if (rewrittenContents !== originalContents) {
        await writeTextFile(entryPath, rewrittenContents);
      }
    })
  );
}
