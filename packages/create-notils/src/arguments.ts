// Pure validation and normalization helpers for user-supplied values. These are
// independent of how the values arrive (commander flags or interactive prompts),
// so both paths in `config.ts` share exactly the same rules.

/** Project and app names: lowercase letters/numbers/dashes, starting alphanumeric. */
export function isValidProjectName(name: string | undefined): name is string {
  return typeof name === "string" && /^[a-z0-9][a-z0-9-]*$/.test(name);
}

/** Reverse-DNS bundle-identifier prefix, e.g. `com.acme`. */
export function isValidBundleIdentifierPrefix(value: string | undefined): value is string {
  return typeof value === "string" && /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/.test(value);
}

/**
 * Parse a comma-separated list of app names. Returns the trimmed names, or an
 * empty array if any name is invalid or the list contains duplicates.
 */
export function parseAppNames(value: string): string[] {
  const names = value.split(",").map((name) => name.trim());
  const allValid = names.every(isValidProjectName);
  const allUnique = new Set(names).size === names.length;
  return allValid && allUnique ? names : [];
}

/** Derive a default bundle-id prefix from a project name, e.g. `my-app` -> `com.myapp`. */
export function defaultBundleIdentifierPrefix(projectName: string): string {
  const identifierSegment = projectName.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return `com.${identifierSegment}`;
}
