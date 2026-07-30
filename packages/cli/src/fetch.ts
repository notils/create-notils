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
 * Resolve the template ref for a given CLI version.
 *
 * **The CLI's own version IS the template tag** — `@notils/cli@0.3.0` fetches
 * `v0.3.0`. That makes a given CLI version reproducible: it always writes the
 * same source, however long ago it was published. Users still get current source
 * by default, because `bunx @notils/cli` resolves the newest published CLI.
 *
 * RELEASE REQUIREMENT: this couples the CLI version to a git tag of this repo.
 * Publishing `@notils/cli@X.Y.Z` requires a pushed `vX.Y.Z` tag, or every `add`
 * from that version fails at the fetch step. See docs/testing-locally.md.
 *
 * Override with NOTILS_TEMPLATE_REF to test against a branch.
 */
export function templateRef(cliVersion: string): string {
  return process.env.NOTILS_TEMPLATE_REF ?? `v${cliVersion}`;
}

/** Fetch `packages/<name>` into a fresh temp directory and return its path. */
export async function fetchPackageSource(packageName: string, cliVersion: string): Promise<string> {
  const destination = await mkdtemp(join(tmpdir(), `notils-add-${packageName}-`));
  const source = `${TEMPLATE_REPOSITORY}/packages/${packageName}#${templateRef(cliVersion)}`;
  const emitter = tiged(source, { cache: false, force: true, mode: "tar" });
  try {
    await emitter.clone(destination);
  } catch (error) {
    await rm(destination, { recursive: true, force: true });
    const detail = error instanceof Error ? error.message : String(error);
    // The overwhelmingly likely cause is a missing tag — either this CLI version
    // was published without its matching template tag, or NOTILS_TEMPLATE_REF
    // points at a ref that doesn't exist. Say so, rather than surfacing tiged's
    // opaque "could not find commit hash".
    throw new Error(
      `Could not fetch "${packageName}" from ${source}.\n` +
        `  ${detail}\n` +
        `  Check that the ref "${templateRef(cliVersion)}" exists in ${TEMPLATE_REPOSITORY}.`
    );
  }
  return destination;
}

/** Remove a temp directory created by `fetchPackageSource`. */
export async function cleanupFetched(directory: string): Promise<void> {
  await rm(directory, { recursive: true, force: true });
}
