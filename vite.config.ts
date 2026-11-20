/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import pkg from "./package.json" with { type: "json" };

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  base: "./", // relative paths so the build works on itch.io / GitHub Pages sub-folders
  build: { target: "es2022", chunkSizeWarningLimit: 1500 },
  test: { include: ["tests/unit/**/*.test.ts"], environment: "node" },
});
