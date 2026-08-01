import { describe, expect, test } from "vitest";

import { normalizeBuildCollaborationFocus } from "./referenceFocus";

describe("normalizeBuildCollaborationFocus", () => {
  test.each([
    "actionItem:action-1",
    "asset:asset-1",
    "comment:comment-1",
    "document:document-1",
    "draw:draw-1",
    "evidenceAsset:asset-1",
    "evidencePackage:package-1",
    "material:material-1",
    "milestone:milestone-1",
    "participant:user-1",
    "post:post-1",
    "siteVisit:visit-1",
    "submilestone:submilestone-1",
  ])("preserves a supported focus target: %s", (focus) => {
    expect(normalizeBuildCollaborationFocus(focus)).toBe(focus);
  });

  test.each([
    undefined,
    null,
    "",
    "document:",
    ":document-1",
    "document:document-1:forged",
    "unknown:record-1",
  ])("rejects malformed or unsupported focus state: %s", (focus) => {
    expect(normalizeBuildCollaborationFocus(focus)).toBeUndefined();
  });
});
