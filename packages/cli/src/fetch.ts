import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import tiged from "tiged";

import templateVersion from "../../../template-version.json" with { type: "json" };

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
 * The git tag package source is fetched from.
 *
 * This is the TEMPLATE's version, from `template-version.json` at the repo root
 * — **not this CLI's npm version**. An earlier design derived it as
 * `v${cliVersion}`, which welded the two together: bumping the template forced a
 * no-op release of this CLI, and vice versa. They change for different reasons
 * and now version independently. Both CLIs read the same file, so they can never
 * disagree about which tag they target.
 *
 * Inlined at build time (a published CLI has no repo to read from).
 *
 * RELEASE REQUIREMENT: the tag named here must exist and be pushed, or every
 * `add` fails at the fetch step. `check:publishable` verifies this before a
 * publish can proceed. See docs/testing-locally.md.
 *
 * Override with NOTILS_TEMPLATE_REF to test against a branch.
 */
export function templateRef(): string {
  return process.env.NOTILS_TEMPLATE_REF ?? templateVersion.ref;
}

/** Fetch `packages/<name>` into a fresh temp directory and return its path. */
export async function fetchPackageSource(packageName: string): Promise<string> {
  const destination = await mkdtemp(join(tmpdir(), `notils-add-${packageName}-`));
  const source = `${TEMPLATE_REPOSITORY}/packages/${packageName}#${templateRef()}`;
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
        `  Check that the ref "${templateRef()}" exists in ${TEMPLATE_REPOSITORY}.`
    );
  }
  return destination;
}

/**
 * The template's single app directory. `create-notils` copies this to produce each
 * app in a scaffold, and `notils add app` fetches the same thing — so an app added
 * later is generated from identical source to one created at scaffold time.
 */
const TEMPLATE_APP_PATH = "apps/app";

/** Fetch the template app into a fresh temp directory and return its path. */
export async function fetchAppSource(): Promise<string> {
  const destination = await mkdtemp(join(tmpdir(), "notils-add-app-"));
  const source = `${TEMPLATE_REPOSITORY}/${TEMPLATE_APP_PATH}#${templateRef()}`;
  const emitter = tiged(source, { cache: false, force: true, mode: "tar" });
  try {
    await emitter.clone(destination);
  } catch (error) {
    await rm(destination, { recursive: true, force: true });
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Could not fetch the app template from ${source}.\n` +
        `  ${detail}\n` +
        `  Check that the ref "${templateRef()}" exists in ${TEMPLATE_REPOSITORY}.`
    );
  }
  return destination;
}

/** Remove a temp directory created by `fetchPackageSource`. */
export async function cleanupFetched(directory: string): Promise<void> {
  await rm(directory, { recursive: true, force: true });
}
