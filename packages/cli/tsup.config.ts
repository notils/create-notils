import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  clean: true,
  // `@notils/transform` is a PRIVATE workspace package, never published, so it
  // must be inlined. tsup externalizes everything in `dependencies` by default,
  // which would leave a bare `import "@notils/transform/..."` in dist/ and make
  // the published CLI die with ERR_MODULE_NOT_FOUND on first run. Verify after
  // building: `grep 'from "@notils' dist/index.js` must find nothing.
  noExternal: [/^@notils\//],
  // Make the built output directly executable as the `notils` bin.
  banner: { js: "#!/usr/bin/env node" },
});
