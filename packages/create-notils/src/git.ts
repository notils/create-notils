import { tryRunCommand } from "./process.js";

const INITIAL_COMMIT_MESSAGE = "Initial commit from create-notils";

export type GitInitResult = "initialized" | "skipped-already-in-repo" | "skipped-git-unavailable";

/**
 * Initialize a fresh git repository in `projectDirectory` with a single initial
 * commit, so the scaffolded project is immediately trackable (see docs/issue #10).
 *
 * Skips gracefully — never throws — when git is unavailable or the target is
 * already inside a repository (e.g. scaffolding into an existing workspace), so
 * we never nest repos or fail the whole scaffold over git.
 *
 * Note: git runs WITHOUT a shell (see process.ts) so the spaced commit message
 * is passed as a single argument on Windows.
 */
export async function initializeGitRepository(projectDirectory: string): Promise<GitInitResult> {
  const options = { workingDirectory: projectDirectory };

  const alreadyInRepo = await tryRunCommand("git", ["rev-parse", "--is-inside-work-tree"], options);
  if (alreadyInRepo) {
    return "skipped-already-in-repo";
  }

  const gitInitialized = await tryRunCommand("git", ["init"], options);
  if (!gitInitialized) {
    return "skipped-git-unavailable";
  }

  await tryRunCommand("git", ["add", "-A"], options);
  await tryRunCommand("git", ["commit", "-m", INITIAL_COMMIT_MESSAGE], options);
  return "initialized";
}
