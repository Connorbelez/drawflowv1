// @vitest-environment jsdom

import { describe, expect, test } from "vitest";

import {
  buildCollaborationOfflineDraftKey,
  filesFromBuildCollaborationOfflineDraft,
} from "./build-collaboration-offline-drafts.ts";

describe("Build collaboration offline drafts", () => {
  test("scopes private drafts to the human, tenant, and Build", () => {
    expect(
      buildCollaborationOfflineDraftKey({
        buildId: "build-1",
        organizationId: "org-1",
        workosUserId: "user-1",
      })
    ).toBe("org-1:build-1:user-1");
  });

  test("restores staged camera capture timestamps without fabrication", () => {
    const capturedAt = Date.parse("2026-07-31T12:34:56.000Z");
    const [file] = filesFromBuildCollaborationOfflineDraft({
      bundle: {
        actionItems: [],
        audienceMode: "build_wide",
        plainText: "Offline inspection evidence.",
        postType: "update",
        references: [],
        requestedReaderIds: [],
        tiptapJson: JSON.stringify({ type: "doc" }),
      },
      capturedAt,
      files: [
        {
          blob: new Blob(["evidence"], { type: "image/jpeg" }),
          lastModified: capturedAt,
          name: "foundation.jpg",
          type: "image/jpeg",
        },
      ],
      key: "org-1:build-1:user-1",
      updatedAt: capturedAt + 10_000,
      version: 1,
    });

    expect(file).toMatchObject({
      lastModified: capturedAt,
      name: "foundation.jpg",
      type: "image/jpeg",
    });
  });
});
