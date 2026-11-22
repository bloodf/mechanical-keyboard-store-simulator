/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import pkg from "./package.json" with { type: "json" };

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  base: "./", // relative paths so the build works on itch.io / GitHub Pages sub-folders
  build: { target: "es2022", chunkSizeWarningLimit: 1500 },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
    testTimeout: 30_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // dev-only art previews and type-only files
      exclude: ["src/sandbox.ts", "src/sandbox/**", "src/env.d.ts", "src/**/types.ts"],
      reportsDirectory: "coverage/unit",
      reporter: ["text-summary", "lcovonly", "json-summary"],
    },
  },
});
