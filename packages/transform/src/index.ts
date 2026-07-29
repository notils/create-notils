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
  CONFIG_FILE_NAME,
  configPath,
  type DetectionResult,
  detectProjectConfig,
  type NotilsConfig,
  type ProjectPaths,
  type ProjectShape,
  readProjectConfig,
  writeProjectConfig,
} from "@notils/transform/project-config";
export {
  rewriteLibrarySpecifier,
  rewriteScopeInSource,
  rewriteSpecifier,
  rewriteSpecifiersInSource,
  rewriteSpecifiersInTree,
  rewriteUiSpecifier,
  TEMPLATE_SCOPE,
} from "@notils/transform/specifiers";
