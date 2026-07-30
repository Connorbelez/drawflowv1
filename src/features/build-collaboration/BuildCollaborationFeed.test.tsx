// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { getFunctionName } from "convex/server";
import { afterEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  acceptedCommentId: undefined as string | undefined,
  comments: [] as Array<Record<string, unknown>>,
  drafts: [] as Array<Record<string, unknown>>,
  feedStatus: "Exhausted" as "CanLoadMore" | "Exhausted",
  focusedPostId: "post-1" as string | null,
  loadMore: vi.fn(),
  mutate: vi.fn().mockResolvedValue(null),
  onOpenReference: vi.fn(),
  postContentState: "active" as "active" | "tombstoned",
  postResolutionSummary: undefined as string | undefined,
  postRevision: 1,
  postThreadState: "open" as "open" | "resolved",
  postType: "update" as
    | "update"
    | "question"
    | "decision"
    | "issue"
    | "announcement",
  postViewerCanModerate: false,
  postViewerIsAuthor: true,
}));

vi.mock("convex/react", () => ({
  useMutation: () => mocks.mutate,
  usePaginatedQuery: () => ({
    loadMore: mocks.loadMore,
    results: [
      {
        kind: "restricted",
        placeholderKey: "restricted-first-page-0",
      },
      {
        kind: "restricted",
        placeholderKey: "restricted-second-page-0",
      },
      {
        acknowledgement: { acknowledged: false, required: false },
        actionItems: [
          {
            _id: "action-1",
            assignmentState: "unassigned",
            currentRevision: 1,
            priority: "high",
            requiresAcceptance: false,
            status: "todo",
            title: "Upload engineer seal",
          },
        ],
        following: true,
        kind: "post",
        pins: [],
        post: {
          _id: "post-1",
          acceptedCommentId: mocks.acceptedCommentId,
          announcementProminent: false,
          audienceMode: "build_wide",
          authorDisplayNameSnapshot: "Alex Chen",
          authorRole: "builder",
          contentState: mocks.postContentState,
          createdAt: Date.parse("2026-07-28T12:00:00.000Z"),
          postType: mocks.postType,
          readRevision: mocks.postRevision,
          resolutionSummary: mocks.postResolutionSummary,
          revision: mocks.postRevision,
          threadState: mocks.postThreadState,
          updatedAt: Date.parse("2026-07-28T12:00:00.000Z"),
          viewerCanAppeal: false,
          viewerCanModerate: mocks.postViewerCanModerate,
          viewerCanResolveAppeal: false,
          viewerCanManageThread: true,
          viewerIsAuthor: mocks.postViewerIsAuthor,
        },
        reactions: [],
        receipts: [],
        references: [
          {
            _id: "reference-1",
            entityId: "evidence-1",
            entityKind: "evidenceAsset",
            labelSnapshot: "Foundation completion photo",
            summarySnapshot: "Location verified · uploaded today",
          },
        ],
        revision: {
          plainText: "Foundation evidence is ready for review.",
          tiptapJson: JSON.stringify({
            content: [
              {
                content: [
                  {
                    text: "Foundation evidence is ready for review.",
                    type: "text",
                  },
                ],
                type: "paragraph",
              },
            ],
            type: "doc",
          }),
        },
      },
    ],
    status: mocks.feedStatus,
  }),
  useQuery: (reference: unknown) => {
    const functionName = getFunctionName(
      reference as Parameters<typeof getFunctionName>[0]
    );
    if (
      functionName ===
      "build_collaboration_focus:getFocusedBuildActionItemContext"
    ) {
      return mocks.focusedPostId
        ? { postId: mocks.focusedPostId }
        : null;
    }
    if (
      functionName ===
      "build_collaboration_threads:listBuildCollaborationComments"
    ) {
      return mocks.comments;
    }
    if (
      functionName ===
      "build_collaboration_moderation:getBuildCollaborationModerationContext"
    ) {
      return {
        canAppeal: false,
        canModerate: mocks.postViewerCanModerate,
        canResolveAppeal: false,
        events: [],
      };
    }
    if (
      functionName ===
        "build_collaboration_editing:listBuildCollaborationPostRevisionHistory" ||
      functionName ===
        "build_collaboration_editing:listBuildCollaborationCommentRevisionHistory"
    ) {
      return [
        {
          _id: "revision-1",
          authorWorkosUserId: "user-builder",
          createdAt: Date.parse("2026-07-28T12:00:00.000Z"),
          plainText: "Foundation evidence is ready for review.",
          revision: 1,
          tiptapJson: JSON.stringify({
            content: [
              {
                content: [
                  {
                    text: "Foundation evidence is ready for review.",
                    type: "text",
                  },
                ],
                type: "paragraph",
              },
            ],
            type: "doc",
          }),
        },
      ];
    }
    if (
      functionName ===
      "build_collaboration_drafts:listMyBuildCollaborationDrafts"
    ) {
      return mocks.drafts;
    }
    if (
      functionName ===
      "build_collaboration_notifications:getMyBuildCollaborationNotificationPreferences"
    ) {
      return {
        channels: ["in_app", "email"],
        digestCadence: "daily",
        digestEnabled: true,
        ordinaryMuted: false,
      };
    }
    return [
      {
        entityId: "user-broker",
        entityKind: "participant",
        eyebrow: "Broker",
        href: "?tab=details&focus=participant%3Auser-broker",
        label: "Priya Raman",
        searchTerms: ["broker"],
        summary: "Broker on this Build",
      },
      {
            entityId: "evidence-1",
            entityKind: "evidenceAsset",
            eyebrow: "Evidence",
            href: "/backoffice/builds/build-1?tab=evidence&evidence=evidence-1",
            label: "Foundation completion photo",
            searchTerms: ["foundation", "photo"],
            summary: "Location verified · uploaded today",
          },
        ];
  },
}));

vi.mock(
  "./CollaborationRichTextEditor.tsx",
  () => ({
  CollaborationRichTextEditor: () => <div data-testid="mock-editor" />,
  CollaborationRichTextPreview: ({
    value,
  }: {
    value: { content?: Array<{ content?: Array<{ text?: string }> }> };
  }) => (
    <p>
      {value.content
        ?.flatMap((node) => node.content ?? [])
        .map((node) => node.text ?? "")
        .join("")}
    </p>
  ),
  }),
);

import { BuildCollaborationFeed } from "./BuildCollaborationFeed";

afterEach(() => {
  cleanup();
  mocks.mutate.mockClear();
  mocks.loadMore.mockClear();
  mocks.onOpenReference.mockClear();
  mocks.drafts = [];
  mocks.comments = [];
  mocks.acceptedCommentId = undefined;
  mocks.feedStatus = "Exhausted";
  mocks.focusedPostId = "post-1";
  mocks.postContentState = "active";
  mocks.postResolutionSummary = undefined;
  mocks.postRevision = 1;
  mocks.postThreadState = "open";
  mocks.postType = "update";
  mocks.postViewerCanModerate = false;
  mocks.postViewerIsAuthor = true;
});

describe("BuildCollaborationFeed", () => {
  test("keeps restricted posts opaque and filters to followed threads", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    render(
      <BuildCollaborationFeed
        buildId="build-1"
        organizationId="org-1"
      />,
    );

    expect(screen.getAllByText("Restricted update")).toHaveLength(2);
    expect(
      screen.queryByText(/Alex Chen.*restricted/i),
    ).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Following" }));

    expect(
      screen.getByText("Foundation evidence is ready for review."),
    ).toBeTruthy();
    expect(screen.queryByText("Restricted update")).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  test("opens a typed reference preview and routes its focused workspace", () => {
    render(
      <BuildCollaborationFeed
        buildId="build-1"
        onOpenReference={mocks.onOpenReference}
        organizationId="org-1"
      />,
    );

    fireEvent.click(screen.getByText("Foundation completion photo"));
    expect(
      screen.getByRole("heading", {
        name: "Foundation completion photo",
      }),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Open focused workspace" }),
    );

    expect(mocks.onOpenReference).toHaveBeenCalledWith({
      entityId: "evidence-1",
      entityKind: "evidenceAsset",
      href: "/backoffice/builds/build-1?tab=evidence&evidence=evidence-1",
    });
    expect(
      screen.queryByRole("heading", {
        name: "Foundation completion photo",
      }),
    ).toBeNull();
  });

  test("opens the containing Action Items tab for a focused Action Item", async () => {
    render(
      <BuildCollaborationFeed
        buildId="build-1"
        focusedReference="actionItem:action-1"
        organizationId="org-1"
      />,
    );

    await waitFor(() =>
      expect(screen.getByText("Upload engineer seal")).toBeTruthy(),
    );
    expect(
      document.querySelector(
        '[data-collaboration-focus="actionItem:action-1"]',
      ),
    ).toBeTruthy();
  });

  test("loads older feed pages until a focused Action Item post is present", async () => {
    mocks.feedStatus = "CanLoadMore";
    mocks.focusedPostId = "post-outside-first-page";

    render(
      <BuildCollaborationFeed
        buildId="build-1"
        focusedReference="actionItem:action-older"
        organizationId="org-1"
      />,
    );

    await waitFor(() => expect(mocks.loadMore).toHaveBeenCalledWith(20));
  });

  test("opens a focused detail sheet for any Build participant role", async () => {
    render(
      <BuildCollaborationFeed
        buildId="build-1"
        focusedReference="participant:user-broker"
        organizationId="org-1"
      />,
    );

    expect(
      await screen.findByRole("heading", { name: "Priya Raman" }),
    ).toBeTruthy();
    expect(
      screen
        .getByTestId("build-collaboration-focused-reference")
        .getAttribute("data-reference-key"),
    ).toBe("participant:user-broker");
    expect(screen.getByText("Focused participant detail for this Build.")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Open focused workspace" }),
    ).toBeNull();
  });

  test("labels a revised post as edited without treating thread receipt changes as edits", () => {
    mocks.postRevision = 2;
    render(
      <BuildCollaborationFeed
        buildId="build-1"
        organizationId="org-1"
      />
    );

    expect(screen.getByText("Edited")).toBeTruthy();
  });

  test("lets a non-author reader inspect an edited post without edit authority", async () => {
    mocks.postRevision = 2;
    mocks.postViewerIsAuthor = false;
    render(
      <BuildCollaborationFeed
        buildId="build-1"
        organizationId="org-1"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Post actions" }));
    fireEvent.click(
      await screen.findByRole("menuitem", {
        name: "View revision history",
      })
    );

    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: "Revision history",
      })
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Save revision" })
    ).toBeNull();
  });

  test("opens the hierarchy-safe moderation action from the post menu", async () => {
    mocks.postViewerCanModerate = true;
    mocks.postViewerIsAuthor = false;
    render(
      <BuildCollaborationFeed
        buildId="build-1"
        organizationId="org-1"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Post actions" }));
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Moderate content" })
    );
    expect(
      await screen.findByRole("heading", { name: "Content moderation" })
    ).toBeTruthy();
    fireEvent.change(
      screen.getByRole("textbox", { name: "Moderation reason" }),
      { target: { value: "Unsafe instruction" } }
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Moderate content" })
    );
    await waitFor(() =>
      expect(mocks.mutate).toHaveBeenCalledWith({
        buildId: "build-1",
        entityId: "post-1",
        entityKind: "post",
        expectedRevision: 1,
        organizationId: "org-1",
        reason: "Unsafe instruction",
      })
    );
  });

  test("does not offer a guaranteed-failure reply action on moderated content", () => {
    mocks.comments = [
      {
        comment: {
          _id: "comment-1",
          authorDisplayNameSnapshot: "Trade Partner",
          authorRole: "contractor",
          contentState: "moderated",
          createdAt: Date.parse("2026-07-28T13:00:00.000Z"),
          logicalDepth: 0,
          revision: 1,
          updatedAt: Date.parse("2026-07-28T13:05:00.000Z"),
          viewerCanAppeal: false,
          viewerCanModerate: false,
          viewerCanResolveAppeal: false,
          viewerIsAuthor: false,
        },
        references: [],
        revision: {
          plainText:
            "This reply is unavailable while it is under moderation.",
          tiptapJson: JSON.stringify({
            content: [
              {
                content: [
                  {
                    text: "This reply is unavailable while it is under moderation.",
                    type: "text",
                  },
                ],
                type: "paragraph",
              },
            ],
            type: "doc",
          }),
        },
      },
    ];
    render(
      <BuildCollaborationFeed
        buildId="build-1"
        organizationId="org-1"
      />
    );

    const comment = screen.getByTestId("collaboration-comment-comment-1");
    expect(within(comment).getByText("Moderated")).toBeTruthy();
    expect(
      within(comment).queryByRole("button", { name: "Reply" })
    ).toBeNull();
  });

  test("presents the accepted visible reply as the resolved Question outcome", () => {
    mocks.acceptedCommentId = "comment-1";
    mocks.postResolutionSummary = "The revised engineer seal is acceptable.";
    mocks.postThreadState = "resolved";
    mocks.postType = "question";
    mocks.comments = [
      {
        comment: {
          _id: "comment-1",
          authorDisplayNameSnapshot: "Maya Singh",
          authorRole: "builder-staff",
          contentState: "active",
          createdAt: Date.parse("2026-07-28T13:00:00.000Z"),
          logicalDepth: 0,
          revision: 1,
          updatedAt: Date.parse("2026-07-28T13:00:00.000Z"),
          viewerCanAppeal: false,
          viewerCanModerate: false,
          viewerCanResolveAppeal: false,
          viewerIsAuthor: false,
        },
        references: [],
        revision: {
          plainText: "The revised engineer seal is acceptable.",
          tiptapJson: JSON.stringify({
            content: [
              {
                content: [
                  {
                    text: "The revised engineer seal is acceptable.",
                    type: "text",
                  },
                ],
                type: "paragraph",
              },
            ],
            type: "doc",
          }),
        },
      },
    ];

    render(
      <BuildCollaborationFeed
        buildId="build-1"
        organizationId="org-1"
      />
    );

    expect(screen.getAllByText("Accepted answer")).toHaveLength(2);
    expect(
      screen.getAllByText("The revised engineer seal is acceptable.")
    ).toHaveLength(2);
    expect(screen.getByText("Resolved")).toBeTruthy();
  });

  test("shows the complete effective bundle before a human approves an agent draft", async () => {
    mocks.drafts = [
      {
        _creationTime: Date.now(),
        _id: "draft-1",
        approvalOwnerWorkosUserId: "user_admin",
        bundleJson: JSON.stringify({
          acknowledgementRequired: true,
          actionItems: [
            {
              assigneeWorkosUserId: "user_builder",
              descriptionPlainText: "Attach the sealed report.",
              descriptionTiptapJson: JSON.stringify({
                content: [
                  {
                    content: [
                      { text: "Attach the sealed report.", type: "text" },
                    ],
                    type: "paragraph",
                  },
                ],
                type: "doc",
              }),
              effectiveAssignmentState: "assigned",
              priority: "high",
              requiresAcceptance: false,
              title: "Upload engineer seal",
            },
          ],
          attachmentAssetIds: ["asset-1"],
          audienceMode: "custom",
          effectiveNotificationEffects: [
            {
              channel: "email",
              recipientWorkosUserIds: ["user_broker"],
              summary: "Notify the lender reviewer",
            },
          ],
          effectiveReaderIds: ["user_admin", "user_broker"],
          excludedReaderIds: ["user_contractor"],
          mandatoryReaderIds: ["user_admin"],
          notificationEffects: [
            {
              channel: "email",
              recipientWorkosUserIds: ["user_broker"],
              summary: "Notify the lender reviewer",
            },
          ],
          plainText: "Foundation evidence is ready.",
          postType: "update",
          references: [
            {
              entityId: "evidence-1",
              entityKind: "evidenceAsset",
              label: "Foundation completion photo",
              primary: true,
              summary: "Location verified",
            },
          ],
          requestedReaderIds: ["user_broker"],
          sharedMutations: [
            {
              entityId: "evidence-package-1",
              entityKind: "evidencePackage",
              operation: "request_review",
              summary: "Request lender evidence review",
            },
          ],
          tiptapJson: JSON.stringify({
            content: [
              {
                content: [
                  { text: "Foundation evidence is ready.", type: "text" },
                ],
                type: "paragraph",
              },
            ],
            type: "doc",
          }),
        }),
        preparedByActorKind: "agent",
        preparedByAgent: true,
        preparedByWorkosUserId: "svc-opaque-2847",
        revision: 1,
        state: "active",
        updatedAt: Date.now(),
      },
    ];

    render(
      <BuildCollaborationFeed
        buildId="build-1"
        organizationId="org-1"
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Review exact bundle" }),
    );

    expect(screen.getByText("Human approval checkpoint")).toBeTruthy();
    expect(screen.getByText("You will be the author")).toBeTruthy();
    expect(
      screen.getByText(/Effective readers: user_admin, user_broker/),
    ).toBeTruthy();
    expect(screen.getByText(/Mandatory readers: user_admin/)).toBeTruthy();
    expect(
      screen.getByText(/Explicit exclusions: user_contractor/),
    ).toBeTruthy();
    expect(screen.getAllByText(/Foundation completion photo/)).toHaveLength(2);
    expect(screen.getByText(/asset-1/)).toBeTruthy();
    expect(screen.getByText(/Upload engineer seal/)).toBeTruthy();
    expect(screen.getAllByText(/Attach the sealed report/)).toHaveLength(2);
    expect(screen.getByText(/assigned/)).toBeTruthy();
    expect(screen.getByText(/Notify the lender reviewer/)).toBeTruthy();
    expect(screen.getByText(/Request lender evidence review/)).toBeTruthy();
    expect(screen.getByText(/evidence-package-1/)).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Approve exact bundle & publish",
      }),
    );
    await waitFor(() =>
      expect(mocks.mutate).toHaveBeenCalledWith({
        buildId: "build-1",
        draftId: "draft-1",
        organizationId: "org-1",
      }),
    );
  });
});
