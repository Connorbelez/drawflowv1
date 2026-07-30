// @vitest-environment jsdom

import {
  act,
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
  actionItemAssignmentState: "unassigned" as
    | "unassigned"
    | "requested"
    | "assigned",
  actionItemDetailState: "visible" as "revoked" | "visible",
  actionItemRequiresAcceptance: false,
  actionItemWorkKind: "ordinary" as
    | "ordinary"
    | "approval"
    | "evidence"
    | "site_visit_remediation"
    | "draw_blocker",
  announcementExpiresAt: undefined as number | undefined,
  announcementProminent: false,
  comments: [] as Array<Record<string, unknown>>,
  commentsLoading: false,
  drafts: [] as Array<Record<string, unknown>>,
  editorReferences: [] as Array<{
    eyebrow: string;
    id: string;
    kind: "evidenceAsset";
    label: string;
    summary: string;
  }>,
  feedStatus: "Exhausted" as "CanLoadMore" | "Exhausted",
  focusedCommentContext: undefined as
    | Record<string, unknown>
    | undefined,
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
  workflowAssignmentMode: "direct" as "direct" | "request",
  workflowCanAccept: false,
  workflowTransitions: [
    "in_progress",
    "blocked",
    "cancelled",
  ] as Array<
    "todo" | "in_progress" | "in_review" | "blocked" | "done" | "cancelled"
  >,
}));

function commentRowFixture(id: string, text: string) {
  return {
    comment: {
      _id: id,
      authorDisplayNameSnapshot: "Builder Staff",
      authorRole: "builder-staff",
      contentState: "active",
      createdAt: Date.parse("2026-07-28T13:00:00.000Z"),
      logicalDepth: 0,
      pinCount: 0,
      revision: 1,
      updatedAt: Date.parse("2026-07-28T13:00:00.000Z"),
      viewerCanAppeal: false,
      viewerCanModerate: false,
      viewerCanPin: true,
      viewerCanResolveAppeal: false,
      viewerIsAuthor: true,
      viewerPinned: false,
    },
    reactions: [],
    references: [],
    revision: {
      plainText: text,
      tiptapJson: JSON.stringify({
        content: [
          {
            content: [{ text, type: "text" }],
            type: "paragraph",
          },
        ],
        type: "doc",
      }),
    },
  };
}

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
          announcementExpiresAt: mocks.announcementExpiresAt,
          announcementProminent: mocks.announcementProminent,
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
  useQuery: (reference: unknown, args?: Record<string, unknown> | "skip") => {
    const functionName = getFunctionName(
      reference as Parameters<typeof getFunctionName>[0]
    );
    if (
      functionName ===
      "build_collaboration_focus:getFocusedBuildActionItemContext"
    ) {
      if (
        args === "skip" ||
        !args?.actionItemId ||
        args.actionItemId === "not-a-convex-id"
      ) {
        return null;
      }
      return mocks.focusedPostId
        ? {
            actionItemId: args.actionItemId,
            postId: mocks.focusedPostId,
          }
        : null;
    }
    if (
      functionName ===
      "build_action_item_details:getBuildActionItemDetail"
    ) {
      if (mocks.actionItemDetailState === "revoked") {
        return { state: "revoked" };
      }
      const now = Date.parse("2026-07-28T12:00:00.000Z");
      return {
        activity: [
          {
            actorDisplayName: "Alex Chen",
            actorRole: "builder",
            createdAt: now,
            eventId: "action-event-1",
            eventType: "created",
            revision: 1,
          },
        ],
        attachments: [],
        comments: [],
        item: {
          actionItemId: "action-1",
          assignmentState: mocks.actionItemAssignmentState,
          audienceMode: "build_wide",
          createdAt: now,
          creatorDisplayName: "Alex Chen",
          creatorWorkosUserId: "user-builder",
          currentRevision: 1,
          descriptionPlainText: "Upload the engineer seal.",
          descriptionTiptapJson: JSON.stringify({
            content: [
              {
                content: [
                  { text: "Upload the engineer seal.", type: "text" },
                ],
                type: "paragraph",
              },
            ],
            type: "doc",
          }),
          originatingPostId: "post-1",
          priority: "high",
          requiresAcceptance: mocks.actionItemRequiresAcceptance,
          status: "todo",
          title: "Upload engineer seal",
          updatedAt: now,
          workKind: mocks.actionItemWorkKind,
        },
        labels: ["evidence"],
        references: [
          {
            entityId: "evidence-1",
            entityKind: "evidenceAsset",
            label: "Foundation completion photo",
            primary: true,
            summary: "Location verified · uploaded today",
          },
        ],
        revisions: [
          {
            actorDisplayName: "Alex Chen",
            actorRole: "builder",
            createdAt: now,
            revision: 1,
            snapshotJson: JSON.stringify({
              priority: "high",
              status: "todo",
              title: "Upload engineer seal",
            }),
          },
        ],
        state: "visible",
      };
    }
    if (
      functionName ===
      "build_action_item_workflow:getBuildActionItemWorkflowContext"
    ) {
      return {
        assignableParticipants: [
          {
            assignmentMode: mocks.workflowAssignmentMode,
            displayName: "Alex Chen",
            role: "builder",
            workosUserId: "user-builder",
          },
        ],
        availableTransitions: mocks.workflowTransitions,
        state: "visible",
        viewerCanAcceptAssignment: mocks.workflowCanAccept,
        viewerCanUnassign: true,
        viewerWorkosUserId: "user-builder",
      };
    }
    if (
      functionName ===
      "build_collaboration_threads:listBuildCollaborationComments"
    ) {
      return mocks.commentsLoading ? undefined : mocks.comments;
    }
    if (
      functionName ===
      "build_collaboration_threads:getFocusedBuildCollaborationCommentContext"
    ) {
      return mocks.focusedCommentContext;
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
    CollaborationRichTextEditor: ({
      ariaLabel,
      onChange,
      onDocumentChange,
    }: {
      ariaLabel: string;
      onChange: (html: string, references: unknown[]) => void;
      onDocumentChange?: (document: unknown) => void;
    }) => (
      <button
        aria-label={`Mock ${ariaLabel}`}
        data-testid="mock-editor"
        onClick={() => {
          const document = {
            content: [
              {
                content: [{ text: "Useful accountable work.", type: "text" }],
                type: "paragraph",
              },
            ],
            type: "doc",
          };
          onChange("<p>Useful accountable work.</p>", mocks.editorReferences);
          onDocumentChange?.(document);
        }}
        type="button"
      >
        Mock editor
      </button>
    ),
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
  vi.useRealTimers();
  cleanup();
  mocks.mutate.mockClear();
  mocks.loadMore.mockClear();
  mocks.onOpenReference.mockClear();
  mocks.drafts = [];
  mocks.editorReferences = [];
  mocks.comments = [];
  mocks.commentsLoading = false;
  mocks.acceptedCommentId = undefined;
  mocks.actionItemAssignmentState = "unassigned";
  mocks.actionItemDetailState = "visible";
  mocks.actionItemRequiresAcceptance = false;
  mocks.actionItemWorkKind = "ordinary";
  mocks.announcementExpiresAt = undefined;
  mocks.announcementProminent = false;
  mocks.feedStatus = "Exhausted";
  mocks.focusedCommentContext = undefined;
  mocks.focusedPostId = "post-1";
  mocks.postContentState = "active";
  mocks.postResolutionSummary = undefined;
  mocks.postRevision = 1;
  mocks.postThreadState = "open";
  mocks.postType = "update";
  mocks.postViewerCanModerate = false;
  mocks.postViewerIsAuthor = true;
  mocks.workflowAssignmentMode = "direct";
  mocks.workflowCanAccept = false;
  mocks.workflowTransitions = ["in_progress", "blocked", "cancelled"];
});

describe("BuildCollaborationFeed", () => {
  test("expires an Announcement badge when wall-clock time advances without a query write", () => {
    vi.useFakeTimers();
    const now = Date.parse("2026-07-30T12:00:00.000Z");
    vi.setSystemTime(now);
    mocks.announcementExpiresAt = now + 30_000;
    mocks.announcementProminent = true;
    mocks.postType = "announcement";
    render(
      <BuildCollaborationFeed buildId="build-1" organizationId="org-1" />
    );

    expect(screen.getByText("Prominent")).toBeTruthy();
    act(() => vi.advanceTimersByTime(30_001));
    expect(screen.getByText("Prominence expired")).toBeTruthy();
  });

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
      expect(
        screen.getByRole("heading", { name: "Upload engineer seal" }),
      ).toBeTruthy(),
    );
    expect(
      document.querySelector(
        '[data-collaboration-focus="actionItem:action-1"]',
      ),
    ).toBeTruthy();
  });

  test("creates Action Items from a live post with inherited audience context", async () => {
    render(
      <BuildCollaborationFeed buildId="build-1" organizationId="org-1" />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Action Items 1" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Add Action Item" }),
    );

    expect(
      screen.getByRole("heading", { name: "Create accountable work" }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "The Action Item inherits the post audience and cannot widen it.",
      ),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Action Item title"), {
      target: { value: "Upload signed engineer seal" },
    });
    fireEvent.click(screen.getByRole("button", {
      name: "Mock Action Item description",
    }));
    fireEvent.change(screen.getByLabelText("Action Item labels"), {
      target: { value: "Evidence, Draw 3" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Create Action Item" }),
    );

    await waitFor(() =>
      expect(mocks.mutate).toHaveBeenCalledWith(
        expect.objectContaining({
          buildId: "build-1",
          descriptionPlainText: "Useful accountable work.",
          labels: ["Evidence", "Draw 3"],
          organizationId: "org-1",
          postId: "post-1",
          priority: "none",
          requestId: expect.any(String),
          title: "Upload signed engineer seal",
        }),
      ),
    );
  });

  test("surfaces inferred governed work before creating a linked Action Item", async () => {
    mocks.editorReferences = [
      {
        eyebrow: "Evidence",
        id: "evidence-1",
        kind: "evidenceAsset",
        label: "Foundation completion photo",
        summary: "Location verified · uploaded today",
      },
    ];
    render(
      <BuildCollaborationFeed buildId="build-1" organizationId="org-1" />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Action Items 1" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Add Action Item" }),
    );
    fireEvent.change(screen.getByLabelText("Action Item title"), {
      target: { value: "Review linked evidence" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Mock Action Item description" }),
    );

    expect(screen.getByLabelText("Action Item work type").textContent).toContain(
      "evidence",
    );
    expect(
      screen.getByText(
        "Governed work requires a due date and authority acceptance before Done.",
      ),
    ).toBeTruthy();

    mocks.mutate.mockClear();
    fireEvent.click(
      screen.getByRole("button", { name: "Create Action Item" }),
    );
    expect(mocks.mutate).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Action Item due date"), {
      target: { value: "2026-08-15" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Create Action Item" }),
    );

    await waitFor(() =>
      expect(mocks.mutate).toHaveBeenCalledWith(
        expect.objectContaining({
          dueAt: new Date("2026-08-15T12:00:00").getTime(),
          references: [
            expect.objectContaining({
              entityId: "evidence-1",
              entityKind: "evidenceAsset",
            }),
          ],
          title: "Review linked evidence",
          workKind: "evidence",
        }),
      ),
    );
  });

  test("opens the reusable Action Item detail sheet from a post card", async () => {
    render(
      <BuildCollaborationFeed buildId="build-1" organizationId="org-1" />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Action Items 1" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Open details" }),
    );

    expect(
      await screen.findByRole("heading", { name: "Upload engineer seal" }),
    ).toBeTruthy();
    expect(screen.getByText("Revision history")).toBeTruthy();
    expect(screen.getByText("Activity")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: /Foundation completion photo/ })
    );
    expect(
      screen.getByRole("heading", { name: "Foundation completion photo" })
    ).toBeTruthy();
  });

  test("executes Action Item workflow transitions from the detail sheet", async () => {
    render(
      <BuildCollaborationFeed buildId="build-1" organizationId="org-1" />
    );

    fireEvent.click(screen.getByRole("button", { name: "Action Items 1" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Open details" })
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "in progress" })
    );

    await waitFor(() =>
      expect(mocks.mutate).toHaveBeenCalledWith({
        actionItemId: "action-1",
        buildId: "build-1",
        expectedRevision: 1,
        nextStatus: "in_progress",
        organizationId: "org-1",
        reason: undefined,
      })
    );
  });

  test("surfaces governed completion and upward assignment acceptance controls", async () => {
    mocks.actionItemWorkKind = "evidence";
    mocks.actionItemRequiresAcceptance = true;
    mocks.workflowAssignmentMode = "request";
    mocks.workflowCanAccept = true;
    mocks.workflowTransitions = ["in_review"];
    render(
      <BuildCollaborationFeed buildId="build-1" organizationId="org-1" />
    );

    fireEvent.click(screen.getByRole("button", { name: "Action Items 1" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Open details" })
    );

    expect(screen.getByText("Governed completion")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Accept assignment" })
    );
    await waitFor(() =>
      expect(mocks.mutate).toHaveBeenCalledWith({
        actionItemId: "action-1",
        buildId: "build-1",
        expectedRevision: 1,
        organizationId: "org-1",
      })
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Submit for review" })
    );
    await waitFor(() =>
      expect(mocks.mutate).toHaveBeenCalledWith(
        expect.objectContaining({
          actionItemId: "action-1",
          nextStatus: "in_review",
        })
      )
    );
  });

  test("keeps an accepted upward assignment visibly governed for ordinary work", async () => {
    mocks.actionItemAssignmentState = "assigned";
    mocks.actionItemRequiresAcceptance = true;
    mocks.workflowTransitions = ["in_review"];
    render(
      <BuildCollaborationFeed buildId="build-1" organizationId="org-1" />
    );

    fireEvent.click(screen.getByRole("button", { name: "Action Items 1" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Open details" })
    );

    expect(screen.getByText("Ordinary work")).toBeTruthy();
    expect(screen.getByText("Governed completion")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Submit for review" })
    ).toBeTruthy();
  });

  test("keeps restricted Action Item deep links disclosure-safe", async () => {
    mocks.actionItemDetailState = "revoked";
    render(
      <BuildCollaborationFeed
        buildId="build-1"
        focusedReference="actionItem:action-1"
        organizationId="org-1"
      />,
    );

    expect(
      await screen.findByRole("heading", { name: "Action Item unavailable" }),
    ).toBeTruthy();
    expect(screen.queryByText("Upload engineer seal.")).toBeNull();
  });

  test("ignores malformed Action Item deep links before issuing a typed detail query", () => {
    render(
      <BuildCollaborationFeed
        buildId="build-1"
        focusedReference="actionItem:not-a-convex-id"
        organizationId="org-1"
      />
    );

    expect(
      screen.queryByRole("heading", { name: "Upload engineer seal" })
    ).toBeNull();
    expect(screen.queryByText("Loading Action Item…")).toBeNull();
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

  test("provides a roving keyboard entry point for ordinary discussions", () => {
    mocks.comments = [
      commentRowFixture("comment-first", "First reply"),
      commentRowFixture("comment-second", "Second reply"),
    ];
    render(
      <BuildCollaborationFeed buildId="build-1" organizationId="org-1" />
    );

    const first = screen.getByTestId("collaboration-comment-comment-first");
    const second = screen.getByTestId("collaboration-comment-comment-second");
    expect(first.tabIndex).toBe(0);
    expect(second.tabIndex).toBe(-1);

    first.focus();
    fireEvent.keyDown(first, { key: "ArrowDown" });

    expect(document.activeElement).toBe(second);
    expect(first.tabIndex).toBe(-1);
    expect(second.tabIndex).toBe(0);
  });

  test("hydrates and keyboard-navigates a deeply focused reply with comment controls", async () => {
    const commentRow = ({
      author,
      depth,
      id,
      parentAuthor,
      parentId,
      text,
    }: {
      author: string;
      depth: number;
      id: string;
      parentAuthor?: string;
      parentId?: string;
      text: string;
    }) => ({
      comment: {
        _id: id,
        authorDisplayNameSnapshot: author,
        authorRole: "builder-staff",
        contentState: "active",
        createdAt: Date.parse("2026-07-28T13:00:00.000Z") + depth,
        logicalDepth: depth,
        parentAuthorDisplayNameSnapshot: parentAuthor,
        parentCommentId: parentId,
        pinCount: depth === 5 ? 1 : 0,
        revision: 1,
        updatedAt: Date.parse("2026-07-28T13:00:00.000Z") + depth,
        viewerCanAppeal: false,
        viewerCanModerate: false,
        viewerCanPin: depth === 5,
        viewerCanResolveAppeal: false,
        viewerIsAuthor: depth === 5,
        viewerPinned: false,
      },
      reactions:
        depth === 5
          ? [
              {
                _id: "reaction-1",
                reaction: "acknowledged",
                workosUserId: "user-broker",
              },
            ]
          : [],
      references: [],
      revision: {
        plainText: text,
        tiptapJson: JSON.stringify({
          content: [
            {
              content: [{ text, type: "text" }],
              type: "paragraph",
            },
          ],
          type: "doc",
        }),
      },
    });
    const rows = [
      commentRow({
        author: "Root Author",
        depth: 0,
        id: "comment-root",
        text: "Root context",
      }),
      commentRow({
        author: "Deep Author",
        depth: 5,
        id: "comment-deep",
        parentAuthor: "Parent Author",
        parentId: "comment-parent",
        text: "Deep focused reply",
      }),
    ];
    mocks.focusedCommentContext = {
      focusCommentId: "comment-deep",
      postId: "post-1",
      rows,
      state: "visible",
    };
    mocks.comments = rows;
    render(
      <BuildCollaborationFeed
        buildId="build-1"
        focusedReference="comment:comment-deep"
        organizationId="org-1"
      />
    );

    const root = screen.getByTestId("collaboration-comment-comment-root");
    const deep = screen.getByTestId("collaboration-comment-comment-deep");
    expect(deep.style.marginLeft).toBe("54px");
    expect(within(deep).getByText("Replying to Parent Author")).toBeTruthy();
    expect(document.activeElement).toBe(deep);
    fireEvent.keyDown(deep, { key: "ArrowUp" });
    expect(document.activeElement).toBe(root);

    const replyButton = within(deep).getByRole("button", { name: "Reply" });
    fireEvent.click(replyButton);
    expect(screen.getByText("Replying to Deep Author.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(document.activeElement).toBe(replyButton));

    fireEvent.click(
      within(deep).getByRole("button", { name: "Acknowledge 1" })
    );
    expect(mocks.mutate).toHaveBeenCalledWith({
      buildId: "build-1",
      commentId: "comment-deep",
      organizationId: "org-1",
      reaction: "acknowledged",
    });
    fireEvent.click(within(deep).getByRole("button", { name: "Pin reply" }));
    expect(mocks.mutate).toHaveBeenCalledWith({
      buildId: "build-1",
      commentId: "comment-deep",
      kind: "reply",
      organizationId: "org-1",
      postId: "post-1",
    });
  });

  test("announces deterministic discussion loading state", () => {
    mocks.commentsLoading = true;
    render(
      <BuildCollaborationFeed buildId="build-1" organizationId="org-1" />
    );

    expect(screen.getByText("Loading discussion…")).toBeTruthy();
  });

  test("announces focused discussion hydration before replacing ordinary rows", () => {
    mocks.comments = [
      commentRowFixture("comment-ordinary", "Ordinary loaded reply"),
    ];
    mocks.focusedCommentContext = undefined;
    render(
      <BuildCollaborationFeed
        buildId="build-1"
        focusedReference="comment:comment-pending"
        organizationId="org-1"
      />
    );

    expect(screen.getByText("Loading focused discussion…")).toBeTruthy();
    expect(screen.queryByText("Ordinary loaded reply")).toBeNull();
  });

  test("keeps focused hydration live while the containing post paginates in", async () => {
    mocks.feedStatus = "CanLoadMore";
    mocks.comments = [
      commentRowFixture("comment-ordinary", "Ordinary loaded reply"),
    ];
    mocks.focusedCommentContext = {
      focusCommentId: "comment-outside-page",
      postId: "post-outside-page",
      rows: [
        commentRowFixture("comment-outside-page", "Focused older reply"),
      ],
      state: "visible",
    };
    render(
      <BuildCollaborationFeed
        buildId="build-1"
        focusedReference="comment:comment-outside-page"
        organizationId="org-1"
      />
    );

    expect(screen.getByText("Loading focused discussion…")).toBeTruthy();
    expect(screen.queryByText("Ordinary loaded reply")).toBeNull();
    await waitFor(() => expect(mocks.loadMore).toHaveBeenCalledWith(20));
  });

  test("renders a disclosure-safe state when focused discussion access is revoked", () => {
    mocks.focusedCommentContext = { state: "revoked" };
    render(
      <BuildCollaborationFeed
        buildId="build-1"
        focusedReference="comment:comment-revoked"
        organizationId="org-1"
      />
    );

    expect(
      screen.getByText(
        "This focused discussion is unavailable or your access was revoked."
      )
    ).toBeTruthy();
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
