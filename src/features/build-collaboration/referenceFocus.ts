export const BUILD_COLLABORATION_FOCUS_KINDS = [
  "actionItem",
  "asset",
  "comment",
  "document",
  "draw",
  "evidenceAsset",
  "evidencePackage",
  "material",
  "milestone",
  "participant",
  "post",
  "siteVisit",
  "submilestone",
] as const;

export type BuildCollaborationFocusKind =
  (typeof BUILD_COLLABORATION_FOCUS_KINDS)[number];

export interface BuildCollaborationFocusTarget {
  entityId: string;
  entityKind: BuildCollaborationFocusKind;
}

export function parseBuildCollaborationFocus(
  value: unknown
): BuildCollaborationFocusTarget | undefined {
  if (typeof value !== "string") {
    return;
  }
  const separatorIndex = value.indexOf(":");
  if (separatorIndex <= 0 || separatorIndex === value.length - 1) {
    return;
  }
  const entityKind = value.slice(0, separatorIndex);
  const entityId = value.slice(separatorIndex + 1);
  if (
    entityId.includes(":") ||
    !BUILD_COLLABORATION_FOCUS_KINDS.includes(
      entityKind as BuildCollaborationFocusKind
    )
  ) {
    return;
  }
  return {
    entityId,
    entityKind: entityKind as BuildCollaborationFocusKind,
  };
}

export function normalizeBuildCollaborationFocus(
  value: unknown
): string | undefined {
  return parseBuildCollaborationFocus(value) ? String(value) : undefined;
}
