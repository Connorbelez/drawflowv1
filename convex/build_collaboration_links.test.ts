import { describe, expect, test } from "vitest";

import { buildCollaborationDeepLink } from "./build_collaboration_links";

describe("buildCollaborationDeepLink", () => {
  test.each([
    ["admin", "/backoffice/builds/build-1?tab=details&focus=post%3Apost-1"],
    [
      "principle-broker",
      "/backoffice/builds/build-1?tab=details&focus=post%3Apost-1",
    ],
    ["broker", "/backoffice/builds/build-1?tab=details&focus=post%3Apost-1"],
    ["broker-staff", "/backoffice/builds/build-1?tab=details&focus=post%3Apost-1"],
    ["builder", "/builder/builds/build-1?tab=details&focus=post%3Apost-1"],
    [
      "builder-staff",
      "/builder-staff/builds/build-1?tab=details&focus=post%3Apost-1",
    ],
    ["contractor", "/contractor/builds/build-1?focus=post%3Apost-1"],
    ["homeowner", "/homeowner/builds/build-1?focus=post%3Apost-1"],
  ] as const)("routes a post notification for %s through typed focus", (role, href) => {
    expect(
      buildCollaborationDeepLink({
        buildId: "build-1",
        postId: "post-1",
        recipientRole: role,
      })
    ).toBe(href);
  });

  test("keeps a more-specific entity focus without an unused post parameter", () => {
    expect(
      buildCollaborationDeepLink({
        buildId: "build-1",
        focus: "comment:comment-1",
        postId: "post-1",
        recipientRole: "contractor",
      })
    ).toBe("/contractor/builds/build-1?focus=comment%3Acomment-1");
  });

  test.each([
    [
      "admin",
      "/backoffice/builds/build-1?tab=details&focus=submilestone%3Asub-1&detailTab=collaboration",
    ],
    [
      "builder",
      "/builder/builds/build-1?tab=details&focus=submilestone%3Asub-1&detailTab=collaboration",
    ],
    [
      "builder-staff",
      "/builder-staff/builds/build-1?tab=details&focus=submilestone%3Asub-1&detailTab=collaboration",
    ],
    [
      "contractor",
      "/contractor/builds/build-1?focus=submilestone%3Asub-1&detailTab=collaboration",
    ],
    [
      "homeowner",
      "/homeowner/builds/build-1?focus=submilestone%3Asub-1&detailTab=collaboration",
    ],
  ] as const)(
    "routes a canonical Sub-milestone notification for %s through Collaboration",
    (role, href) => {
      expect(
        buildCollaborationDeepLink({
          buildId: "build-1",
          detailTab: "collaboration",
          focus: "submilestone:sub-1",
          recipientRole: role,
        })
      ).toBe(href);
    }
  );
});
