// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { JSONContent } from "@tiptap/react";
import { getFunctionName } from "convex/server";
import { afterEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  editPost: vi.fn(),
  tombstonePost: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useMutation: (reference: unknown) => {
    const functionName = getFunctionName(
      reference as Parameters<typeof getFunctionName>[0]
    );
    return functionName.endsWith("editBuildCollaborationPost")
      ? mocks.editPost
      : mocks.tombstonePost;
  },
  useQuery: (reference: unknown) => {
    const functionName = getFunctionName(
      reference as Parameters<typeof getFunctionName>[0]
    );
    if (
      functionName.endsWith("listBuildCollaborationPostRevisionHistory")
    ) {
      return [
        {
          _id: "revision-1",
          authorWorkosUserId: "user-builder",
          createdAt: Date.parse("2026-07-28T12:00:00.000Z"),
          plainText: "Original post",
          revision: 1,
          tiptapJson: JSON.stringify({
            content: [
              {
                content: [{ text: "Original post", type: "text" }],
                type: "paragraph",
              },
            ],
            type: "doc",
          }),
        },
      ];
    }
    return undefined;
  },
}));

function documentText(value: string | JSONContent) {
  const document = typeof value === "string" ? JSON.parse(value) : value;
  return (
    document.content?.[0]?.content?.[0]?.text ??
    ""
  );
}

vi.mock("./CollaborationRichTextEditor.tsx", () => ({
  CollaborationRichTextEditor: ({
    onChange,
    onDocumentChange,
    value,
  }: {
    onChange: (value: string, references: []) => void;
    onDocumentChange: (value: JSONContent) => void;
    value: string | JSONContent;
  }) => {
    const replaceDraft = () => {
      const nextDocument = {
        content: [
          {
            content: [{ text: "Unsaved correction", type: "text" }],
            type: "paragraph",
          },
        ],
        type: "doc",
      };
      onChange(JSON.stringify(nextDocument), []);
      onDocumentChange(nextDocument);
    };
    return (
      <div>
        <textarea aria-label="Mock rich text editor" readOnly value={documentText(value)} />
        <button onClick={replaceDraft} type="button">
          Replace draft
        </button>
      </div>
    );
  },
  CollaborationRichTextPreview: ({
    value,
  }: {
    value: string | JSONContent;
  }) => <p>{documentText(value)}</p>,
}));

import { BuildCollaborationEditSheet } from "./BuildCollaborationEditSheet";

const initialDocument: JSONContent = {
  content: [
    {
      content: [{ text: "Original post", type: "text" }],
      type: "paragraph",
    },
  ],
  type: "doc",
};

afterEach(() => {
  cleanup();
  mocks.editPost.mockReset();
  mocks.tombstonePost.mockReset();
});

describe("BuildCollaborationEditSheet", () => {
  test("preserves an unsaved TipTap draft after a stale expected-revision write", async () => {
    mocks.editPost.mockRejectedValue(
      new Error(
        "Revision conflict: this post changed while you were editing. Your draft has been preserved; review the latest version and retry."
      )
    );
    render(
      <BuildCollaborationEditSheet
        buildId={"build-1" as never}
        canEdit
        entity={{ kind: "post", postId: "post-1" as never }}
        initialDocument={initialDocument}
        initialReferences={[]}
        initialRevision={2}
        onOpenChange={vi.fn()}
        open
        organizationId="org-1"
        tagOptions={[]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Replace draft" }));
    fireEvent.click(screen.getByRole("button", { name: "Save revision" }));

    await waitFor(() =>
      expect(screen.getByText(/Revision conflict:/)).toBeTruthy()
    );
    expect(
      (screen.getByRole("textbox", {
        name: "Mock rich text editor",
      }) as HTMLTextAreaElement).value
    ).toBe("Unsaved correction");
    expect(mocks.editPost).toHaveBeenCalledWith(
      expect.objectContaining({
        buildId: "build-1",
        expectedRevision: 2,
        organizationId: "org-1",
        postId: "post-1",
        tiptapJson: expect.stringContaining("Unsaved correction"),
      })
    );
  });

  test("exposes immutable history without edit or removal controls", () => {
    render(
      <BuildCollaborationEditSheet
        buildId={"build-1" as never}
        canEdit={false}
        entity={{ kind: "post", postId: "post-1" as never }}
        initialDocument={initialDocument}
        initialReferences={[]}
        initialRevision={2}
        onOpenChange={vi.fn()}
        open
        organizationId="org-1"
        tagOptions={[]}
      />
    );

    expect(
      screen.getByRole("heading", { level: 2, name: "Revision history" })
    ).toBeTruthy();
    expect(screen.getByText(/^Revision 1 ·/)).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Save revision" })
    ).toBeNull();
    expect(screen.queryByText("Remove visible content")).toBeNull();
  });
});
