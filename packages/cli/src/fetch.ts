import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import tiged from "tiged";

/**
 * Fetch one package's source from the template repository.
 *
 * `tiged` supports subdirectory fetches (`user/repo/sub#ref`), verified against
 * the real v0.2.0 tag — so `add` pulls exactly the one package it needs rather
 * than the whole repo. Fetched into a temp directory so nothing touches the
 * user's project until we've decided what to write.
 */

export const TEMPLATE_REPOSITORY = "notils/create-notils";

/**
 * The template ref to fetch from. Pinned to a release tag so a given CLI version
 * always produces the same source — the same reasoning as create-notils's own
 * TEMPLATE_REF. Override with NOTILS_TEMPLATE_REF when testing against a branch.
 */
export const TEMPLATE_REF = process.env.NOTILS_TEMPLATE_REF ?? "v0.2.0";

/** Fetch `packages/<name>` into a fresh temp directory and return its path. */
export async function fetchPackageSource(packageName: string): Promise<string> {
  const destination = await mkdtemp(join(tmpdir(), `notils-add-${packageName}-`));
  const source = `${TEMPLATE_REPOSITORY}/packages/${packageName}#${TEMPLATE_REF}`;
  const emitter = tiged(source, { cache: false, force: true, mode: "tar" });
  try {
    await emitter.clone(destination);
  } catch (error) {
    await rm(destination, { recursive: true, force: true });
    throw new Error(
      `Could not fetch "${packageName}" from ${source}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
  return destination;
}

/** Remove a temp directory created by `fetchPackageSource`. */
export async function cleanupFetched(directory: string): Promise<void> {
  await rm(directory, { recursive: true, force: true });
}
