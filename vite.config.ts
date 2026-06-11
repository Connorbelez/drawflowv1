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
    include: ["gsap", "gsap/ScrollTrigger", "@gsap/react"],
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
  test: {
    exclude: ["**/node_modules/**", "**/dist/**", "**/tests/e2e/**"],
    passWithNoTests: true,
  },
});

export default config;
