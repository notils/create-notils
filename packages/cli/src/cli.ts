import { Command } from "commander";

/**
 * commander owns parsing, `--help`, `--version`, and unknown-flag errors.
 * Everything else (detection, prompting, writing) lives in the command modules.
 */

export type AddOptions = {
  /** Skip the confirmation prompt for the resolved package set. */
  yes?: boolean;
  /** Overwrite files the user has modified instead of stopping. */
  force?: boolean;
  /** Report what would be written without touching the filesystem. */
  dryRun?: boolean;
  /** Skip the post-write formatter pass. */
  skipFormat?: boolean;
  /**
   * Append the theme tokens without asking. Editing an existing stylesheet is
   * invasive enough that `--yes` deliberately does NOT cover it, so scripted
   * setups need an explicit opt-in.
   */
  withTheme?: boolean;
  /**
   * Install missing external dependencies without asking. Like `--with-theme`,
   * not covered by `--yes`: mutating node_modules and the lockfile is a bigger
   * step than writing source files.
   */
  withDeps?: boolean;
};

export type InitOptions = {
  /** Accept the detected configuration without prompting. */
  yes?: boolean;
};

export type ParsedCli =
  | { command: "add"; packages: string[]; options: AddOptions }
  | { command: "init"; options: InitOptions }
  | { command: "list"; options: Record<string, never> }
  /** commander already printed help/version and we should exit quietly. */
  | { command: "none" };

export function buildProgram(cliVersion: string): Command {
  const program = new Command();

  program
    .name("notils")
    .description(
      "Add production-ready capabilities to a Next.js project — one scaffolded with create-notils, or your own."
    )
    .version(cliVersion, "-v, --version", "output the CLI version");

  program
    .command("add")
    .description("add one or more capabilities to this project")
    .argument("<packages...>", "capabilities to add (see `notils list`)")
    .option("-y, --yes", "skip the confirmation prompt")
    .option("--force", "overwrite files you have modified")
    .option("--dry-run", "show what would change without writing anything")
    .option("--skip-format", "skip running the project's formatter afterward")
    .option(
      "--with-theme",
      "append the theme tokens to your stylesheet without asking (not covered by --yes)"
    )
    .option(
      "--with-deps",
      "install missing external dependencies without asking (not covered by --yes)"
    )
    .addHelpText(
      "after",
      `
Examples:
  $ bunx @notils/cli add ui
  $ bunx @notils/cli add auth-ui          # pulls auth-custom, api-client, form-builder, ui
  $ bunx @notils/cli add form-builder --dry-run
`
    );

  program
    .command("init")
    .description("detect this project's shape and write notils.json")
    .option("-y, --yes", "accept the detected configuration without prompting");

  program
    .command("list")
    .description("show available capabilities and which are already installed");

  return program;
}

/**
 * Parse argv into a discriminated union. Returns `{ command: "none" }` when the
 * user asked for help or a bare invocation — commander has already printed.
 */
export function parseCli(argv: string[], cliVersion: string): ParsedCli {
  const program = buildProgram(cliVersion);

  // With no subcommand there is nothing to do but show help.
  if (argv.length === 0) {
    program.outputHelp();
    return { command: "none" };
  }

  program.parse(argv, { from: "user" });

  const [subcommand] = program.args;
  const command = program.commands.find((candidate) => candidate.name() === subcommand);
  if (!command) {
    return { command: "none" };
  }

  switch (subcommand) {
    case "add":
      return {
        command: "add",
        // commander collects variadic args on the subcommand, not the program.
        packages: command.args,
        options: command.opts<AddOptions>(),
      };
    case "init":
      return { command: "init", options: command.opts<InitOptions>() };
    case "list":
      return { command: "list", options: {} };
    default:
      return { command: "none" };
  }
}
