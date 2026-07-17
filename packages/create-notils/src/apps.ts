import { join } from "node:path";

import { copyDirectory, readJsonFile, removePath, writeJsonFile } from "./filesystem.js";

// The single app the template ships under apps/.
const TEMPLATE_APP_NAME = "app";
// Dev-server port for the first app; each additional app gets the next port.
const FIRST_DEV_PORT = 3000;

type AppPackageJson = {
  name: string;
  scripts?: Record<string, string>;
} & Record<string, unknown>;

/**
 * Turn the template's single app (apps/app) into the requested set of apps for a
 * monorepo scaffold. The first requested app reuses the template app in place;
 * each additional app is a copy. Every app gets a unique package name and a
 * distinct dev port so `turbo run dev` can run them side by side.
 *
 * `bundleIdentifierPrefix` is reserved for future native targets; it is accepted
 * here so the signature is stable, but has no effect on a web app today.
 */
export async function generateApps(
  projectRoot: string,
  appNames: string[],
  _bundleIdentifierPrefix: string
): Promise<void> {
  const appsDirectory = join(projectRoot, "apps");
  const templateAppDirectory = join(appsDirectory, TEMPLATE_APP_NAME);

  for (let index = 0; index < appNames.length; index++) {
    const appName = appNames[index];
    if (appName === undefined) {
      continue;
    }
    const appDirectory = join(appsDirectory, appName);
    const devPort = FIRST_DEV_PORT + index;

    if (appName !== TEMPLATE_APP_NAME) {
      await copyDirectory(templateAppDirectory, appDirectory);
    }
    await configureApp(appDirectory, appName, devPort);
  }

  // If the template app name wasn't requested, remove the leftover template copy.
  if (!appNames.includes(TEMPLATE_APP_NAME)) {
    await removePath(templateAppDirectory);
  }
}

async function configureApp(appDirectory: string, appName: string, devPort: number): Promise<void> {
  const packageJsonPath = join(appDirectory, "package.json");
  const packageJson = await readJsonFile<AppPackageJson>(packageJsonPath);

  packageJson.name = appName;

  // Pin each app to its own dev port so multiple apps don't collide.
  if (packageJson.scripts?.dev) {
    packageJson.scripts.dev = packageJson.scripts.dev.replace(/--port\s+\d+/, `--port ${devPort}`);
  }

  await writeJsonFile(packageJsonPath, packageJson);
}
