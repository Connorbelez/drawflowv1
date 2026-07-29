export const BUILD_COLLABORATION_FOCUS_KINDS = [
  "actionItem",
  "document",
  "draw",
  "evidenceAsset",
  "evidencePackage",
  "material",
  "milestone",
  "participant",
  "siteVisit",
  "submilestone",
] as const;

export type BuildCollaborationFocusKind =
  (typeof BUILD_COLLABORATION_FOCUS_KINDS)[number];

export function normalizeBuildCollaborationFocus(
  value: unknown
): string | undefined {
  if (typeof value !== "string") {
    return;
  }
  const separatorIndex = value.indexOf(":");
  if (separatorIndex <= 0 || separatorIndex === value.length - 1) {
    return;
  }
  const kind = value.slice(0, separatorIndex);
  const entityId = value.slice(separatorIndex + 1);
  if (
    entityId.includes(":") ||
    !BUILD_COLLABORATION_FOCUS_KINDS.includes(
      kind as BuildCollaborationFocusKind
    )
  ) {
    return;
  }
  return value;
}
