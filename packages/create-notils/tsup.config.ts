import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  clean: true,
  // Make the built output directly executable as the `create-notils` bin.
  banner: { js: "#!/usr/bin/env node" },
});
