export const BUILD_ACTION_ITEM_TAGS = [
  "Blocked",
  "Budget",
  "Design",
  "Documentation",
  "Draw",
  "Envelope",
  "Evidence",
  "Inspection",
  "Materials",
  "Permit",
  "Quality",
  "Safety",
  "Schedule",
  "Site visit",
] as const;

export type BuildActionItemTag = (typeof BUILD_ACTION_ITEM_TAGS)[number];

const ACTION_ITEM_TAG_BY_NORMALIZED_VALUE = new Map(
  BUILD_ACTION_ITEM_TAGS.map((tag) => [tag.toLocaleLowerCase(), tag])
);

export function canonicalBuildActionItemTags(labels: readonly string[]) {
  const canonical = new Set<BuildActionItemTag>();
  for (const submitted of labels) {
    const normalized = submitted.trim().toLocaleLowerCase();
    if (!normalized) {
      continue;
    }
    const tag = ACTION_ITEM_TAG_BY_NORMALIZED_VALUE.get(normalized);
    if (!tag) {
      throw new Error(
        `Use only the preset Action Item tags: ${BUILD_ACTION_ITEM_TAGS.join(", ")}.`
      );
    }
    canonical.add(tag);
  }
  return [...canonical].sort((left, right) => left.localeCompare(right));
}
