// Focused ESLint config: React Compiler bail detection.
// The repo's primary linter is Biome, which cannot validate React Compiler output.
// This plugin surfaces components the compiler cannot safely auto-memoize, so a
// "bail" is loud instead of silent.
//
// eslint-plugin-react-hooks is intentionally NOT included: its build hardcodes the
// zod-validation-error/v4 subpath, which conflicts with eslint-plugin-react-compiler's
// pinned v3 range (unresolvable dedupe). React-hooks rule violations are surfaced by
// the react-compiler rule's bundled diagnostics and by TypeScript.
//
// Run:  bun lint:react
import tsParser from "@typescript-eslint/parser";
import reactCompiler from "eslint-plugin-react-compiler";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/_generated/**",
      "**/*.test.ts",
      "**/*.test.tsx",
      "convex/**",
      "scripts/**",
      ".claude/**",
      "**/*.gen.ts",
      "src/routeTree.gen.ts",
    ],
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: "latest",
      sourceType: "module",
    },
    plugins: {
      "react-compiler": reactCompiler,
    },
    rules: {
      // Flags any component the compiler must bail out of (cannot safely
      // auto-memoize), preventing silent loss of compile coverage.
      "react-compiler/react-compiler": "warn",
    },
  }
);
