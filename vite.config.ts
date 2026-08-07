import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact, { reactCompilerPreset } from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import babel from "@rolldown/plugin-babel";
import { MARKETING_ROUTE_ARCHIVE_PATTERN } from "./src/lib/marketing-route-archive.ts";

const rootDir = dirname(fileURLToPath(import.meta.url));

const config = defineConfig(({ command }) => ({
  // Vite 8 / Rolldown do not support Next-style `optimizePackageImports`.
  // lucide-react tree-shaking relies on ESM named exports + the bundler instead.
  optimizeDeps: {
    exclude: [
      "@tanstack/react-devtools",
      "@tanstack/react-query-devtools",
      "convex",
      "nuqs",
      "nuqs/adapters/tanstack-router",
    ],
    include: [
      "@tanstack/router-core",
      "@tanstack/router-core/isServer",
      "@tanstack/router-core/ssr/client",
      "dayjs",
      "eventemitter3",
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
      router: {
        // Marketing source remains archived in src/routes but is intentionally
        // absent from the production route tree.
        routeFileIgnorePattern: MARKETING_ROUTE_ARCHIVE_PATTERN,
      },
      start: {
        entry: "start.ts",
      },
    }),
    // Exclude marketing design-kit binaries from production publicAsset copy.
    // See public/ASSET-DEPLOY-NOTES.md — live routes do not serve these paths.
    nitro({
      ignore: ["public/designConcepts/**"],
    }),
    viteReact(),
    // React Compiler runs only in production builds. The added per-file Babel
    // transform slows `vite dev` startup ~20x on this large app and destabilizes
    // the forced re-optimizer; dev correctness is guarded by `bun lint:react`
    // (eslint-plugin-react-compiler) instead.
    ...(command === "build"
      ? [babel({ presets: [reactCompilerPreset()] })]
      : []),
  ],
  server: {
    strictPort: true,
    watch: {
      // Machine-local runtime state that churns on a heartbeat (Memtrace
      // daemon state, cursor hook state) must not reach the Vite watcher —
      // every write otherwise fans out as a websocket `full-reload` and the
      // dev page reload-loops while idle.
      ignored: ["**/.memdb/**", "**/.memtrace/**", "**/.cursor/**"],
    },
  },
}));

export default config;
