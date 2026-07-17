import { Command } from "commander";

/**
 * Typed view of the command-line input, produced by commander. Every field is
 * optional/undefined when the user didn't pass the corresponding flag — the
 * flag-or-prompt resolution in `config.ts` fills the gaps.
 *
 * commander owns parsing, `--help`, `--version`, and unknown-flag errors.
 * Domain validation (name shape, app-name uniqueness) stays in `arguments.ts`,
 * and the interactive prompts stay in `config.ts`.
 */
export type CliOptions = {
  /** "monorepo" | "standalone" — validated downstream. */
  type?: string;
  /** Comma-separated app names (monorepo). */
  apps?: string;
  /** "bun" | "pnpm" | "npm" | "yarn" — validated downstream. */
  pm?: string;
  /** Reverse-DNS prefix for native identifiers. */
  bundleIdPrefix?: string;
  /** `--install` / `--no-install`. Undefined when unspecified. */
  install?: boolean;
  /** `--git` / `--no-git`. Undefined when unspecified. */
  git?: boolean;
  /** `-y, --yes`: accept all defaults without prompting. */
  yes?: boolean;
};

export type ParsedCli = {
  /** The positional project name, or undefined to prompt for it. */
  projectName: string | undefined;
  options: CliOptions;
};

/**
 * Build the commander program. Declaring options here gives us auto-generated
 * `--help` and `--version`, negatable flags (`--no-install`), and clear errors
 * for unknown flags — all the parsing concerns, in one declarative place.
 */
export function buildProgram(cliVersion: string): Command {
  const program = new Command();

  program
    .name("create-notils")
    .description("Scaffold a production-ready Next.js project as a monorepo or a standalone app.")
    .version(cliVersion, "-v, --version", "output the CLI version")
    .argument("[project-name]", "name of the project directory to create")
    .option("-t, --type <type>", "project shape: monorepo | standalone")
    .option("--apps <names>", "comma-separated app names under apps/ (monorepo)")
    .option("--pm <manager>", "package manager: bun | pnpm | npm | yarn")
    .option("--bundle-id-prefix <prefix>", "reverse-DNS prefix for native ids, e.g. com.acme")
    .option("--install", "install dependencies after scaffolding")
    .option("--no-install", "skip installing dependencies")
    .option("--git", "initialize a git repository (default)")
    .option("--no-git", "skip git initialization")
    .option("-y, --yes", "accept all defaults without prompting")
    .addHelpText(
      "after",
      `
Examples:
  $ npm create notils@latest my-app
  $ npm create notils@latest my-app -- --type standalone --pm pnpm
  $ npm create notils@latest shop -- --type monorepo --apps admin,storefront -y
`
    );

  return program;
}

/**
 * Parse argv with commander and return the positional name plus typed options.
 * `--help` / `--version` are handled by commander (it prints and exits).
 */
export function parseCli(argv: string[], cliVersion: string): ParsedCli {
  const program = buildProgram(cliVersion);
  program.parse(argv, { from: "user" });

  return {
    projectName: program.args[0],
    options: program.opts<CliOptions>(),
  };
}
