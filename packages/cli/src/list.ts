import { log, note } from "@clack/prompts";
import pc from "picocolors";

import { INTERNAL_PACKAGES } from "@notils/transform/packages";
import { readProjectConfig } from "@notils/transform/project-config";

import { templateRef } from "./fetch.js";
import { isInstalled, targetDirectory } from "./installed.js";

const MARKER_WIDTH = 9; // len("installed") == len("available")
const INDENT = " ".repeat(MARKER_WIDTH + 1);
/**
 * Clack's `note` draws a box and wraps overflow at column 0, which breaks the
 * indented layout. Wrap descriptions ourselves so continuation lines stay
 * aligned under the first. 62 keeps the widest line inside a standard 80 columns
 * once the box border and indent are accounted for.
 */
const DESCRIPTION_WIDTH = 62;

/** Greedy word wrap. No ANSI handling needed — callers pass plain text. */
function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(" ")) {
    if (current && `${current} ${word}`.length > width) {
      lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) {
    lines.push(current);
  }
  return lines;
}

/**
 * Show the addable capabilities, marking which are already present.
 *
 * Deliberately does NOT run detection when `notils.json` is absent: `list` is a
 * read-only query and shouldn't prompt or write. Without config it just lists
 * what's available and says how to get the installed column.
 */
export async function runList(projectRoot: string, cliVersion: string): Promise<void> {
  const config = await readProjectConfig(projectRoot);
  const addable = INTERNAL_PACKAGES.filter((pkg) => pkg.addable);
  const currentRef = templateRef(cliVersion);

  const lines: string[] = [];
  let outdatedCount = 0;
  let unknownRefCount = 0;

  for (const [index, pkg] of addable.entries()) {
    const installed = config ? await isInstalled(projectRoot, pkg, config) : false;
    // The recorded ref, when `add` wrote this package. Absent for anything that
    // arrived another way — a scaffolded project, or an `add` from before the
    // record existed — which is "unknown", NOT "missing".
    const recordedRef = installed ? config?.installed?.[pkg.name]?.ref : undefined;
    const drift = !installed
      ? null
      : recordedRef === undefined
        ? "unknown"
        : recordedRef === currentRef
          ? "current"
          : "outdated";

    if (drift === "outdated") outdatedCount++;
    if (drift === "unknown") unknownRefCount++;

    // Pad the PLAIN text, then colorize — padEnd on an already-colored string
    // counts the ANSI escape bytes toward the width and misaligns the column.
    const text = !installed ? "available" : drift === "outdated" ? "outdated" : "installed";
    const label = text.padEnd(MARKER_WIDTH);
    const marker = !installed
      ? pc.dim(label)
      : drift === "outdated"
        ? pc.yellow(label)
        : pc.green(label);

    const location = config ? pc.dim(` → ${targetDirectory(pkg, config)}`) : "";
    const refNote =
      drift === "outdated"
        ? pc.yellow(`  ${recordedRef} → ${currentRef}`)
        : drift === "current"
          ? pc.dim(`  ${recordedRef}`)
          : "";

    if (index > 0) {
      lines.push("");
    }
    lines.push(`${marker} ${pc.bold(pkg.name)}${location}${refNote}`);
    for (const line of wrap(pkg.description, DESCRIPTION_WIDTH)) {
      lines.push(`${INDENT}${pc.dim(line)}`);
    }

    const deps = pkg.dependsOn.filter((name) =>
      addable.some((candidate) => candidate.name === name)
    );
    if (deps.length > 0) {
      lines.push(`${INDENT}${pc.dim(`also adds: ${deps.join(", ")}`)}`);
    }
  }

  note(lines.join("\n"), "Capabilities");

  if (!config) {
    log.info(
      `Run ${pc.cyan("notils init")} (or just ${pc.cyan("notils add <name>")}) to record this project's layout and see what's installed.`
    );
    return;
  }

  if (outdatedCount > 0) {
    log.warn(
      `${outdatedCount} package(s) came from an older version. Re-run ${pc.cyan("notils add <name>")} to update — your edited files are kept unless you pass --force.`
    );
  }
  if (unknownRefCount > 0) {
    log.info(
      pc.dim(
        `${unknownRefCount} package(s) have no recorded version — they came from the scaffold, or from a CLI that predates version tracking. Drift can't be detected for those.`
      )
    );
  }
}
