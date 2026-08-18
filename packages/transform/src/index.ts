export {
  APP_CONTENT,
  type AppContentEntry,
  type AppContentPlan,
  type AppContentRename,
  PRUNABLE_APP_DIRECTORIES,
  planAppContent,
} from "@notils/transform/app-content";
export {
  DEFAULT_ENVIRONMENT_SETUP,
  ENVIRONMENT_SETUPS,
  type EnvironmentFile,
  type EnvironmentSetup,
  environmentFiles,
  environmentGitignoreLines,
  environmentModuleContents,
  environmentNames,
  parseEnvironmentSetup,
} from "@notils/transform/environments";
export {
  copyDirectory,
  copyDirectoryIfExists,
  pathExists,
  readJsonFile,
  removePath,
  writeJsonFile,
  writeTextFile,
} from "@notils/transform/filesystem";
export {
  type FoldTarget,
  findInternalPackage,
  INTERNAL_PACKAGES,
  type InternalPackage,
  LIBRARY_PACKAGE_NAMES,
  resolveWithDependencies,
} from "@notils/transform/packages";
export {
  getCommandOutput,
  type RunCommandOptions,
  runCommand,
  tryRunCommand,
} from "@notils/transform/process";
export {
  appsRoot,
  CONFIG_FILE_NAME,
  configPath,
  DEFAULT_APPS_ROOT,
  type DetectionResult,
  detectProjectConfig,
  type InstalledRecord,
  isLegacySchemaUrl,
  type NotilsConfig,
  type ProjectPaths,
  type ProjectShape,
  readProjectConfig,
  recordInstalled,
  SCHEMA_URL,
  writeProjectConfig,
} from "@notils/transform/project-config";
export {
  AUTH_CHOICES,
  type AuthChoice,
  authProviderPackage,
  CORE_PACKAGE_NAMES,
  DEFAULT_SELECTION,
  hasAuth,
  OPTIONAL_PACKAGE_NAMES,
  type PackageSelection,
  parseAuthChoice,
  parsePackageNames,
  type ResolvedSelection,
  resolveSelection,
} from "@notils/transform/selection";
export {
  rewriteLibrarySpecifier,
  rewriteScopeInSource,
  rewriteSpecifier,
  rewriteSpecifiersInSource,
  rewriteSpecifiersInTree,
  rewriteUiSpecifier,
  TEMPLATE_SCOPE,
} from "@notils/transform/specifiers";
