import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "#": fileURLToPath(new URL("./src", import.meta.url)),
      "#/": fileURLToPath(new URL("./src/", import.meta.url)),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@/": fileURLToPath(new URL("./src/", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    environmentMatchGlobs: [["convex/**/*.test.ts", "edge-runtime"]],
    exclude: ["**/node_modules/**", "**/dist/**", "tests/e2e/**"],
    server: {
      deps: {
        inline: [/fluent-convex/],
      },
    },
  },
});
