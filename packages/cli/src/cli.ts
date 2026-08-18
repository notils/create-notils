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

export type AddAppOptions = {
  /** Skip the confirmation prompt. */
  yes?: boolean;
  /** Report what would be created without touching the filesystem. */
  dryRun?: boolean;
  /** Skip the post-write formatter pass. */
  skipFormat?: boolean;
  /**
   * Include the example pages and flows. Default false — a new app is a clean
   * starting point (issue #2), consistent with what a fresh scaffold produces.
   */
  demo?: boolean;
};

export type ParsedCli =
  | { command: "add"; packages: string[]; options: AddOptions }
  | { command: "add-app"; appName: string; options: AddAppOptions }
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

  const add = program
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
  $ bunx @notils/cli add app admin        # add another app to a monorepo
`
    );

  // `add app <name>` is documented as a subcommand of `add` (issue #1's spelling),
  // but it is NOT declared as a commander subcommand. Attaching one to `add` makes
  // commander treat `add`'s first argument as a command name and reject the
  // existing `add ui` with "unknown command 'ui'" — the variadic argument and a
  // nested command cannot coexist on the same command.
  //
  // Instead `add` keeps its variadic argument, and `parseCli` below dispatches on
  // the literal first token being "app". `app` is not a capability name (see
  // INTERNAL_PACKAGES), so there is no ambiguity to resolve.
  add
    .option("--demo", "with `add app`: include the example pages and auth flows")
    // Declared so `--no-demo` is accepted rather than rejected as unknown. It
    // matches the default, but `create-notils` accepts it and someone scripting
    // `add app` should be able to state the choice explicitly instead of relying
    // on a default staying put.
    .option("--no-demo", "with `add app`: generate a clean app with no example content (default)")
    .addHelpText(
      "after",
      `
Adding an app:
  $ bunx @notils/cli add app admin
  $ bunx @notils/cli add app console --demo
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
    case "add": {
      // `add app <name>` — dispatched on the literal token rather than a commander
      // subcommand (see buildProgram for why). The flags are `add`'s own, which is
      // where commander has parsed them.
      if (command.args[0] === "app") {
        const appName = command.args[1];
        if (appName === undefined) {
          throw new Error("`add app` needs a name, e.g. `notils add app admin`.");
        }
        if (command.args.length > 2) {
          throw new Error(
            `\`add app\` takes one name, but got: ${command.args.slice(1).join(", ")}.`
          );
        }
        return { command: "add-app", appName, options: command.opts<AddAppOptions>() };
      }
      return {
        command: "add",
        // commander collects variadic args on the subcommand, not the program.
        packages: command.args,
        options: command.opts<AddOptions>(),
      };
    }
    case "init":
      return { command: "init", options: command.opts<InitOptions>() };
    case "list":
      return { command: "list", options: {} };
    default:
      return { command: "none" };
  }
}
