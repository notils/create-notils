// Pure validation and normalization helpers for user-supplied values. These are
// independent of how the values arrive (commander flags or interactive prompts),
// so both paths in `config.ts` share exactly the same rules.

/** Fallback project name — used for an empty prompt answer and for an unusable `.` folder name. */
export const DEFAULT_PROJECT_NAME = "my-app";

/** Project and app names: lowercase letters/numbers/dashes, starting alphanumeric. */
export function isValidProjectName(name: string | undefined): name is string {
  return typeof name === "string" && /^[a-z0-9][a-z0-9-]*$/.test(name);
}

/**
 * Sanitize an arbitrary string (e.g. a directory's basename) into a valid
 * project name, falling back to `DEFAULT_PROJECT_NAME` if nothing usable
 * survives. Used when scaffolding into `.`, where the name comes from the
 * current directory rather than user input.
 */
export function toValidProjectName(rawName: string): string {
  const sanitized = rawName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return isValidProjectName(sanitized) ? sanitized : DEFAULT_PROJECT_NAME;
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
