import { access, cp, readFile, rm, writeFile } from "node:fs/promises";

/**
 * Filesystem primitives shared by both CLIs. Deliberately just the generic
 * operations — anything that encodes scaffold-specific policy (e.g.
 * create-notils's whole-tree project rename) stays in the CLI that owns it.
 */

/** Recursively remove a path if it exists. Does nothing if it is already absent. */
export async function removePath(targetPath: string): Promise<void> {
  await rm(targetPath, { recursive: true, force: true });
}

/** Whether a path exists. */
export async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
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
