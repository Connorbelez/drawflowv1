import type { Doc } from "./types";

export function demoBuildAddress(build: Doc<"demo_builds">): string {
  const stored = build.address?.trim();
  if (stored) {
    return stored;
  }
  const location = build.subtitle.match(/·\s*([^·]+?)\s*·/)?.[1]?.trim();
  return location ? `Mock address - ${location}` : "Mock address - demo build";
}
