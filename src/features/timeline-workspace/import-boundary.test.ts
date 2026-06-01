import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const ROOT = process.cwd();
const PRODUCTION_SCAN_DIRS = [
  "src/features/backoffice-build-detail",
  "src/features/production-proposals",
  "src/routes/backoffice",
  "src/routes/builder/proposals",
];

function walkFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    const stat = statSync(path);

    if (stat.isDirectory()) {
      return walkFiles(path);
    }

    return [path];
  });
}

describe("timeline workspace import boundary", () => {
  test("production proposal and build surfaces do not import demo timeline modules", () => {
    const offenders = PRODUCTION_SCAN_DIRS.flatMap((dir) =>
      walkFiles(join(ROOT, dir)).filter((path) => {
        if (!/\.(ts|tsx)$/.test(path)) {
          return false;
        }

        const source = readFileSync(path, "utf8");
        return (
          source.includes("#/routes/demo/timeline") ||
          source.includes("../demo/timeline") ||
          source.includes("../../demo/timeline")
        );
      })
    ).map((path) => path.replace(`${ROOT}/`, ""));

    expect(offenders).toEqual([]);
  });
});
