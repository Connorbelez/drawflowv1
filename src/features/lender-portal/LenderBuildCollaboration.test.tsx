// @vitest-environment jsdom

import { getFunctionName } from "convex/server";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  abandon: vi.fn(async () => 0),
  addResponse: vi.fn(async () => "comment_new"),
  connection: { isWebSocketConnected: true },
  lifecycle: { revision: 0, state: "open" },
  loadMorePosts: vi.fn(),
  loadMoreResponses: vi.fn(),
  posts: [] as unknown[],
  postsStatus: "Exhausted",
  publish: vi.fn(async () => "post_new"),
  responses: [] as unknown[],
  responsesStatus: "Exhausted",
  upload: vi.fn(async () => [] as string[]),
}));

vi.mock("convex/react", () => ({
  useAction: () => vi.fn(),
  useConvexConnectionState: () => mocks.connection,
  useMutation: (reference: Parameters<typeof getFunctionName>[0]) => {
    const name = getFunctionName(reference);
    if (name.endsWith("publishLenderBuildCollaborationPost")) {
      return mocks.publish;
    }
    if (name.endsWith("addLenderBuildCollaborationResponse")) {
      return mocks.addResponse;
    }
    if (name.endsWith("abandonLenderBuildCollaborationAssets")) {
      return mocks.abandon;
    }
    return vi.fn();
  },
  usePaginatedQuery: (
    _reference: unknown,
    args: Record<string, unknown>
  ) =>
    "postId" in args
      ? {
          loadMore: mocks.loadMoreResponses,
          results: mocks.responses,
          status: mocks.responsesStatus,
        }
      : {
          loadMore: mocks.loadMorePosts,
          results: mocks.posts,
          status: mocks.postsStatus,
        },
  useQuery: () => mocks.lifecycle,
}));

vi.mock(
  "#/features/build-collaboration/build-collaboration-asset-upload.ts",
  () => ({
    abandonGovernedCollaborationAssets: vi.fn(async () => undefined),
    uploadGovernedCollaborationAssets: (...args: unknown[]) =>
      mocks.upload(...args),
  })
);

vi.mock(
  "#/features/build-collaboration/CollaborationRichTextEditor.tsx",
  () => ({
    CollaborationRichTextEditor: ({
      ariaLabel,
      onChange,
      onDocumentChange,
    }: {
      ariaLabel: string;
      onChange: (html: string) => void;
      onDocumentChange: (document: unknown) => void;
    }) => (
      <textarea
        aria-label={ariaLabel}
        onChange={(event) => {
          onChange(event.target.value);
          onDocumentChange({
            content: [
              {
                content: [{ text: event.target.value, type: "text" }],
                type: "paragraph",
              },
            ],
            type: "doc",
          });
        }}
      />
    ),
    CollaborationRichTextPreview: ({
      value,
    }: {
      value: string;
    }) => {
      const parsed = JSON.parse(value) as {
        content?: Array<{ content?: Array<{ text?: string }> }>;
      };
      return <p>{parsed.content?.[0]?.content?.[0]?.text}</p>;
    },
  })
);

import { LenderBuildCollaboration } from "./LenderBuildCollaboration.tsx";

const buildId = "build_1" as never;
const textDocument = (text: string) =>
  JSON.stringify({
    content: [
      {
        content: [{ text, type: "text" }],
        type: "paragraph",
      },
    ],
    type: "doc",
  });

function postFixture() {
  return {
    attachments: [],
    kind: "post",
    post: {
      _id: "post_1",
      authorDisplayNameSnapshot: "Avery Lender",
      authorRole: "lender",
      commentCount: 2,
      createdAt: Date.UTC(2026, 7, 25, 12),
    },
    revision: {
      tiptapJson: textDocument("Foundation evidence is ready."),
    },
  };
}

function responseFixture() {
  return {
    attachments: [],
    comment: {
      _id: "comment_1",
      authorDisplayNameSnapshot: "Blair Builder",
      authorRole: "builder",
      contentState: "active",
      createdAt: Date.UTC(2026, 7, 25, 13),
      logicalDepth: 0,
    },
    revision: {
      tiptapJson: textDocument("Receipt package attached."),
    },
  };
}

beforeEach(() => {
  mocks.connection.isWebSocketConnected = true;
  mocks.lifecycle = { revision: 0, state: "open" };
  mocks.posts = [];
  mocks.postsStatus = "Exhausted";
  mocks.responses = [];
  mocks.responsesStatus = "Exhausted";
  mocks.upload.mockResolvedValue([]);
  mocks.publish.mockResolvedValue("post_new");
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Lender Build Collaboration", () => {
  test("keeps New post reachable in the empty state and publishes a fixed Build update", async () => {
    render(<LenderBuildCollaboration buildId={buildId} />);

    expect(
      screen.getByText(/No participant-visible updates have been posted/)
    ).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "New post" })[0]!);
    fireEvent.change(screen.getByLabelText("New Build update"), {
      target: { value: "Lender update" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));

    await waitFor(() =>
      expect(mocks.publish).toHaveBeenCalledWith({
        attachmentAssetIds: [],
        buildId,
        plainText: "Lender update",
        tiptapJson: textDocument("Lender update"),
      })
    );
  });

  test("expands, paginates, and replies in the authorized response thread", async () => {
    mocks.posts = [postFixture()];
    mocks.postsStatus = "Exhausted";
    mocks.responses = [responseFixture()];
    mocks.responsesStatus = "CanLoadMore";

    render(<LenderBuildCollaboration buildId={buildId} />);
    expect(screen.getByText("Foundation evidence is ready.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "2 responses" }));
    expect(screen.getByText("Receipt package attached.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Load more responses" }));
    expect(mocks.loadMoreResponses).toHaveBeenCalledWith(20);
    fireEvent.click(screen.getAllByRole("button", { name: "Reply" })[0]!);
    fireEvent.change(screen.getByLabelText("Reply to this update"), {
      target: { value: "Lender response" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() =>
      expect(mocks.addResponse).toHaveBeenCalledWith({
        attachmentAssetIds: [],
        buildId,
        parentCommentId: undefined,
        plainText: "Lender response",
        postId: "post_1",
        tiptapJson: textDocument("Lender response"),
      })
    );
  });

  test("shows governed attachment state and routes files through the shared uploader", async () => {
    render(<LenderBuildCollaboration buildId={buildId} />);
    fireEvent.click(screen.getAllByRole("button", { name: "New post" })[0]!);
    fireEvent.change(screen.getByLabelText("New Build update"), {
      target: { value: "Update with file" },
    });
    const file = new File(["evidence"], "evidence.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(screen.getByLabelText("Attach files"), {
      target: { files: [file] },
    });
    expect(screen.getByText(/will be hashed and scanned/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() => expect(mocks.upload).toHaveBeenCalled());
  });

  test("preserves the composer and exposes publication failures", async () => {
    mocks.publish.mockRejectedValueOnce(new Error("Publication failed"));
    render(<LenderBuildCollaboration buildId={buildId} />);
    fireEvent.click(screen.getAllByRole("button", { name: "New post" })[0]!);
    fireEvent.change(screen.getByLabelText("New Build update"), {
      target: { value: "Retry me" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Publication failed"
    );
    expect(screen.getByLabelText("New Build update")).toBeTruthy();
  });

  test("fails closed when the collaboration archive is closed or offline", () => {
    mocks.lifecycle = { revision: 3, state: "closed" };
    render(<LenderBuildCollaboration buildId={buildId} />);

    expect(
      screen.getByText("This Build collaboration archive is read-only.")
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "New post" }).hasAttribute("disabled")
    ).toBe(true);
  });
});
