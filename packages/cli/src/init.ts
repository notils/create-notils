import { confirm, isCancel, log, select, text } from "@clack/prompts";
import pc from "picocolors";

import {
  configPath,
  detectProjectConfig,
  isLegacySchemaUrl,
  type NotilsConfig,
  type ProjectShape,
  readProjectConfig,
  SCHEMA_URL,
  writeProjectConfig,
} from "@notils/transform/project-config";

import type { InitOptions } from "./cli.js";

/** Thrown when the user cancels a prompt; `main` turns it into a clean exit. */
export class CancelledError extends Error {}

function assertNotCancelled<T>(value: T | symbol): T {
  if (isCancel(value)) {
    throw new CancelledError();
  }
  return value as T;
}

/**
 * Detect this project's shape and write `notils.json`.
 *
 * Detection is best-effort by design (see `detectProjectConfig`), so this always
 * SHOWS its reasoning and — unless `--yes` — lets the user correct every value.
 * A silently-wrong config would make `add` write files to the wrong place, which
 * is worse than one extra prompt.
 */
export async function runInit(projectRoot: string, options: InitOptions): Promise<NotilsConfig> {
  const existing = await readProjectConfig(projectRoot);
  if (existing) {
    log.info(`${pc.dim(configPath(projectRoot))} already exists.`);
    const overwrite = assertNotCancelled(
      await confirm({ message: "Re-detect and overwrite it?", initialValue: false })
    );
    if (!overwrite) {
      // Declining re-detection must not leave a project stuck on a `$schema` URL
      // that never resolved (see `isLegacySchemaUrl`). The values are the user's
      // and stay untouched; only the URL the editor validates against moves.
      if (isLegacySchemaUrl(existing.$schema)) {
        await writeProjectConfig(projectRoot, existing);
        log.success(`Updated the ${pc.cyan("$schema")} URL to ${pc.cyan(SCHEMA_URL)}.`);
      }
      return existing;
    }
  }

  const { config, reasons, lowConfidence } = await detectProjectConfig(projectRoot);

  log.step("Detected:");
  for (const reason of reasons) {
    log.message(`  ${pc.dim("·")} ${reason}`);
  }

  if (lowConfidence) {
    log.warn("Could not confidently detect this project's layout — please check the values below.");
  }

  const resolved = options.yes ? config : await confirmInteractively(config);

  await writeProjectConfig(projectRoot, resolved);
  log.success(`Wrote ${pc.cyan("notils.json")}`);
  return resolved;
}

/** Walk the user through each detected value, letting them correct it. */
async function confirmInteractively(detected: NotilsConfig): Promise<NotilsConfig> {
  const accept = assertNotCancelled(
    await confirm({
      message: `Shape ${pc.cyan(detected.shape)}${
        detected.scope ? `, scope ${pc.cyan(detected.scope)}` : ""
      } — is that right?`,
      initialValue: true,
    })
  );
  if (accept) {
    return detected;
  }

  const shape = assertNotCancelled(
    await select<ProjectShape>({
      message: "Project shape?",
      initialValue: detected.shape,
      options: [
        { value: "monorepo", label: "monorepo", hint: "workspaces, packages/*" },
        { value: "standalone", label: "standalone", hint: "a single Next.js app" },
      ],
    })
  );

  let scope: string | null = null;
  if (shape === "monorepo") {
    const entered = assertNotCancelled(
      await text({
        message: "Package scope for your workspace packages?",
        placeholder: detected.scope ?? "@my-app",
        initialValue: detected.scope ?? "",
        validate: (value) => {
          const scopeValue = value ?? "";
          if (!scopeValue.startsWith("@")) return "A scope must start with @ (e.g. @my-app).";
          if (scopeValue.includes("/")) return "Enter only the scope, without a trailing /package.";
          return undefined;
        },
      })
    );
    scope = entered;
  }

  const paths = { ...detected.paths };

  if (shape === "monorepo") {
    paths.packages = assertNotCancelled(
      await text({
        message: "Where do workspace packages live?",
        initialValue: paths.packages,
        placeholder: "packages",
      })
    );
  } else {
    paths.lib = assertNotCancelled(
      await text({
        message: "Where should library code go?",
        initialValue: paths.lib,
        placeholder: "src/lib",
      })
    );
    paths.components = assertNotCancelled(
      await text({
        message: "Where should UI components go?",
        initialValue: paths.components,
        placeholder: "src/components",
      })
    );
  }

  return { shape, scope, paths };
}

/**
 * Load the project config, running `init` first if it's absent.
 *
 * `add` calls this so a brownfield project doesn't have to run `init` as a
 * separate step — the shadcn model, where the first `add` bootstraps config.
 */
export async function loadOrInitConfig(
  projectRoot: string,
  options: { yes?: boolean }
): Promise<NotilsConfig> {
  const existing = await readProjectConfig(projectRoot);
  if (existing) {
    // Every command that touches the config is a chance to migrate a project off
    // the old `notils.dev` URL, which never served the schema. Silent by design
    // here (unlike `init`, whose whole job is reporting what it decided): `add`
    // has its own output to show, and this changes nothing about the project.
    if (isLegacySchemaUrl(existing.$schema)) {
      await writeProjectConfig(projectRoot, existing);
    }
    return existing;
  }
  log.info(
    `No ${pc.cyan("notils.json")} here — detecting this project's layout (this is a one-time step).`
  );
  return await runInit(projectRoot, { yes: options.yes });
}
