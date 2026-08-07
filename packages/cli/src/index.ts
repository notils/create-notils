import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cancel, intro, outro } from "@clack/prompts";
import pc from "picocolors";

import { runAdd } from "./add.js";
import { parseCli } from "./cli.js";
import { CancelledError, runInit } from "./init.js";
import { runList } from "./list.js";

/** The CLI's own version, read from its package.json. */
function readCliVersion(): string {
  const packageJsonPath = join(dirname(fileURLToPath(import.meta.url)), "..", "package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { version: string };
  return packageJson.version;
}

async function main(): Promise<void> {
  const cliVersion = readCliVersion();

  // Parse before the banner so commander's --help/--version output stays clean.
  const parsed = parseCli(process.argv.slice(2), cliVersion);
  if (parsed.command === "none") {
    return;
  }

  intro(`${pc.bgCyan(pc.black(" notils "))} ${pc.dim(`v${cliVersion}`)}`);

  // Every command operates on the current directory — this tool is run from
  // inside the project it modifies, like shadcn.
  const projectRoot = process.cwd();

  switch (parsed.command) {
    case "init":
      await runInit(projectRoot, parsed.options);
      outro(pc.green("Ready — run `notils add <name>` to add a capability."));
      break;

    case "list":
      await runList(projectRoot);
      outro(pc.dim("Add one with `notils add <name>`."));
      break;

    case "add":
      await runAdd(projectRoot, parsed.packages, parsed.options);
      outro(pc.green("Done."));
      break;
  }
}

main().catch((error: unknown) => {
  if (error instanceof CancelledError) {
    cancel("Cancelled.");
    process.exit(130);
  }
  cancel(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
