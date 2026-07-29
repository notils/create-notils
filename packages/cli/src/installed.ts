import { join } from "node:path";

import { pathExists } from "@notils/transform/filesystem";
import type { InternalPackage } from "@notils/transform/packages";
import type { NotilsConfig } from "@notils/transform/project-config";

/**
 * Where a package's source lives in a given project, and whether it's there.
 *
 * Both CLIs agree on the layout (see `@notils/transform`'s package graph), so
 * "installed" is simply "the target directory exists".
 */

/** The directory a package occupies in this project, relative to the root. */
export function targetDirectory(pkg: InternalPackage, config: NotilsConfig): string {
  if (config.shape === "monorepo") {
    return `${config.paths.packages}/${pkg.name}`;
  }
  switch (pkg.fold.kind) {
    case "lib":
      return `${config.paths.lib}/${pkg.name}`;
    case "spread":
      // `ui` spreads across the app's own tree; its components directory is the
      // marker for whether it's present.
      return config.paths.components;
    case "inlined":
      // Config packages are merged into tsconfig/biome rather than copied, so
      // there is no directory to point at.
      return "";
  }
}

export async function isInstalled(
  projectRoot: string,
  pkg: InternalPackage,
  config: NotilsConfig
): Promise<boolean> {
  const relative = targetDirectory(pkg, config);
  if (!relative) {
    return false;
  }
  return await pathExists(join(projectRoot, relative));
}
