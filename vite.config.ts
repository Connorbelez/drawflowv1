import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vitest/config";

const rootDir = dirname(fileURLToPath(import.meta.url));

const config = defineConfig({
  optimizeDeps: {
    exclude: [
      "@tanstack/react-devtools",
      "@tanstack/react-query-devtools",
      "convex",
      "nuqs",
      "nuqs/adapters/tanstack-router",
    ],
    include: [
      "@gsap/react",
      "@tanstack/router-core",
      "@tanstack/router-core/isServer",
      "@tanstack/router-core/ssr/client",
      "dayjs",
      "eventemitter3",
      "gsap",
      "gsap/ScrollTrigger",
      "seroval",
    ],
  },
  resolve: {
    alias: {
      eventemitter3: resolve(rootDir, "node_modules/eventemitter3/index.mjs"),
    },
    dedupe: ["react", "react-dom"],
    tsconfigPaths: true,
  },
  plugins: [
    devtools(),
    tailwindcss(),
    tanstackStart({
      start: {
        entry: "start.ts",
      },
    }),
    nitro(),
    viteReact(),
  ],
  server: {
    strictPort: true,
  },
  test: {
    exclude: ["**/node_modules/**", "**/dist/**", "**/tests/e2e/**"],
    passWithNoTests: true,
  },
});

export default config;
