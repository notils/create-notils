import { log, note } from "@clack/prompts";
import pc from "picocolors";

import { INTERNAL_PACKAGES } from "@notils/transform/packages";
import { readProjectConfig } from "@notils/transform/project-config";

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
export async function runList(projectRoot: string): Promise<void> {
  const config = await readProjectConfig(projectRoot);
  const addable = INTERNAL_PACKAGES.filter((pkg) => pkg.addable);

  const lines: string[] = [];
  for (const [index, pkg] of addable.entries()) {
    const installed = config ? await isInstalled(projectRoot, pkg, config) : false;
    // Pad the PLAIN text, then colorize — padEnd on an already-colored string
    // counts the ANSI escape bytes toward the width and misaligns the column.
    const label = (installed ? "installed" : "available").padEnd(MARKER_WIDTH);
    const marker = installed ? pc.green(label) : pc.dim(label);
    const location = config ? pc.dim(` → ${targetDirectory(pkg, config)}`) : "";

    if (index > 0) {
      lines.push("");
    }
    lines.push(`${marker} ${pc.bold(pkg.name)}${location}`);
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
  }
}
