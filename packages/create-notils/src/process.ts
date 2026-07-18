import { spawn } from "node:child_process";

export type RunCommandOptions = {
  /** Directory to run the command in. */
  workingDirectory: string;
  /**
   * Run the command through a shell. Defaults to false.
   *
   * Pass true ONLY for package managers on Windows, which are resolved via
   * `.cmd` shims that require a shell. Never pass true for `git`: with a shell
   * on Windows, arguments containing spaces (such as a commit message) get
   * re-split by the shell and the command fails (see docs/issue #10).
   */
  useShell?: boolean;
};

/**
 * Spawn a command and resolve when it exits successfully; reject otherwise.
 * Output is inherited-but-silenced (`ignore`) so the CLI's own spinner stays
 * clean.
 */
export function runCommand(
  command: string,
  args: string[],
  options: RunCommandOptions
): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: options.workingDirectory,
      stdio: "ignore",
      shell: options.useShell ?? false,
    });
    child.on("error", reject);
    child.on("close", (exitCode) => {
      if (exitCode === 0) {
        resolvePromise();
      } else {
        reject(new Error(`\`${command}\` exited with code ${exitCode}`));
      }
    });
  });
}

/** Run a command and resolve to `true` on success, `false` on any failure. */
export async function tryRunCommand(
  command: string,
  args: string[],
  options: RunCommandOptions
): Promise<boolean> {
  try {
    await runCommand(command, args, options);
    return true;
  } catch {
    return false;
  }
}

/**
 * Run a command and resolve to its trimmed stdout, or `undefined` if it
 * fails to spawn or exits non-zero. For lightweight, best-effort reads (e.g.
 * `<tool> --version`) where a missing tool shouldn't abort the caller.
 */
export function getCommandOutput(
  command: string,
  args: string[],
  options: RunCommandOptions
): Promise<string | undefined> {
  return new Promise((resolvePromise) => {
    const child = spawn(command, args, {
      cwd: options.workingDirectory,
      stdio: ["ignore", "pipe", "ignore"],
      shell: options.useShell ?? false,
    });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.on("error", () => resolvePromise(undefined));
    child.on("close", (exitCode) => {
      resolvePromise(exitCode === 0 ? output.trim() : undefined);
    });
  });
}
