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
  rewriteLibrarySpecifier,
  rewriteScopeInSource,
  rewriteSpecifier,
  rewriteSpecifiersInSource,
  rewriteSpecifiersInTree,
  rewriteUiSpecifier,
  TEMPLATE_SCOPE,
} from "@notils/transform/specifiers";
