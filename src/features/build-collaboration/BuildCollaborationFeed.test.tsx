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
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const searchAction = vi.hoisted(() => vi.fn());

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
  assetStatuses: [] as Array<Record<string, unknown>>,
  buildActionItems: [] as Array<Record<string, unknown>>,
  comments: [] as Array<Record<string, unknown>>,
  commentsLoading: false,
  drafts: [] as Array<Record<string, unknown>>,
  editorReferences: [] as Array<{
    eyebrow: string;
    id: string;
    kind: "evidence";
    label: string;
    summary: string;
  }>,
  entityActionItems: [] as Array<Record<string, unknown>>,
  feedStatus: "Exhausted" as "CanLoadMore" | "Exhausted",
  focusedCommentContext: undefined as
    | Record<string, unknown>
    | undefined,
  focusedPostContext: undefined as Record<string, unknown> | undefined,
  focusedPostId: "post-1" as string | null,
  loadMore: vi.fn(),
  mutate: vi.fn().mockResolvedValue(null),
  onOpenReference: vi.fn(),
  personalActionItems: [] as Array<Record<string, unknown>>,
  preferenceChannels: ["in_app", "email"] as Array<
    "in_app" | "email" | "push"
  >,
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
  pushSubscription: null as null | {
    _id: string;
    createdAt: number;
    endpoint: string;
  },
  queueStatus: "Exhausted" as
    | "CanLoadMore"
    | "Exhausted"
    | "LoadingFirstPage"
    | "LoadingMore",
  searchResponse: {
    continueCursor: null,
    isDone: true,
    page: [] as Array<Record<string, unknown>>,
  },
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

function focusedPostEntryFixture(id: string, text: string) {
  const now = Date.parse("2026-07-28T12:00:00.000Z");
  return {
    acknowledgement: { acknowledged: false, required: false },
    actionItems: [],
    following: false,
    kind: "post",
    pins: [],
    post: {
      _creationTime: now,
      _id: id,
      agentDrafted: false,
      announcementProminent: false,
      audienceMode: "build_wide",
      authorDisplayNameSnapshot: "Priya Raman",
      authorRole: "broker",
      commentCount: 0,
      contentState: "active",
      createdAt: now,
      postType: "update",
      readRevision: 1,
      revision: 1,
      source: "human",
      threadState: "open",
      updatedAt: now,
      viewerCanAppeal: false,
      viewerCanManageThread: true,
      viewerCanModerate: false,
      viewerCanResolveAppeal: false,
      viewerIsAuthor: false,
    },
    reactions: [],
    receipts: [],
    references: [],
    revision: {
      _creationTime: now,
      _id: `revision-${id}`,
      createdAt: now,
      plainText: text,
      revision: 1,
      tiptapJson: JSON.stringify({
        content: [
          { content: [{ text, type: "text" }], type: "paragraph" },
        ],
        type: "doc",
      }),
    },
  };
}

function queueRowFixture(input: {
  buildId: string;
  buildName: string;
  id: string;
  overdue?: boolean;
  title: string;
}) {
  const now = Date.parse("2026-07-28T12:00:00.000Z");
  return {
    buildId: input.buildId,
    buildName: input.buildName,
    checklist: [],
    item: {
      _id: input.id,
      assignmentState: "assigned",
      currentRevision: 1,
      dueAt: now - 1,
      priority: "high",
      status: "todo",
      title: input.title,
      updatedAt: now,
    },
    overdue: input.overdue ?? false,
    overdueByMs: input.overdue ? 1 : undefined,
    queueScope: "personal",
    relations: [],
  };
}

vi.mock("convex/react", () => ({
  useAction: (reference: unknown) => {
    const functionName = getFunctionName(
      reference as Parameters<typeof getFunctionName>[0]
    );
    return functionName ===
      "build_collaboration_search:searchBuildCollaboration"
      ? searchAction
      : mocks.mutate;
  },
  useMutation: () => mocks.mutate,
  usePaginatedQuery: (reference: unknown, args?: Record<string, unknown> | "skip") => {
    const functionName = getFunctionName(
      reference as Parameters<typeof getFunctionName>[0]
    );
    if (
      functionName ===
      "build_action_item_queues:listMyBuildActionItemQueue"
    ) {
      return {
        loadMore: mocks.loadMore,
        results: args === "skip" ? [] : mocks.personalActionItems,
        status: args === "skip" ? "LoadingFirstPage" : mocks.queueStatus,
      };
    }
    if (
      functionName === "build_action_item_queues:listBuildActionItemQueue"
    ) {
      return {
        loadMore: mocks.loadMore,
        results:
          args === "skip"
            ? []
            : args?.scope === "entity"
              ? mocks.entityActionItems
              : mocks.buildActionItems,
        status: args === "skip" ? "LoadingFirstPage" : mocks.queueStatus,
      };
    }
    return {
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
    };
  },
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
      "build_collaboration_focus:getFocusedBuildCollaborationPostContext"
    ) {
      return args === "skip" ? undefined : mocks.focusedPostContext;
    }
    if (
      functionName ===
      "build_action_item_details:getBuildActionItemDetail"
    ) {
      if (args !== "skip" && typeof args?.actionItemId !== "string") {
        throw new Error("Action Item detail queries require a string ID.");
      }
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
      "build_action_item_structure:getBuildActionItemStructureContext"
    ) {
      return {
        checklist: [
          {
            checklistItemId: "checklist-1",
            completed: false,
            label: "Confirm file naming",
            order: 0,
            required: true,
          },
        ],
        children: [
          {
            actionItemId: "action-child-1",
            assigneeWorkosUserId: "user-builder",
            priority: "medium",
            status: "in_progress",
            title: "Collect engineer seal",
          },
        ],
        relations: [
          {
            direction: "outgoing",
            kind: "blocks",
            otherActionItemId: "action-2",
            otherActionItemTitle: "Release Draw 3",
            relationId: "relation-1",
            status: "active",
          },
          {
            direction: "incoming",
            kind: "related",
            otherActionItemId: "action-3",
            otherActionItemTitle: "Foundation inspection",
            relationId: "relation-2",
            sourceRevision: 7,
            status: "suspended",
            suspensionReason: "permission_conflict",
          },
        ],
        state: "visible",
        viewerCanAddChecklist: true,
        viewerCanCreateChild: true,
        viewerCanLinkRelation: true,
        viewerCanRepairRelations: true,
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
      "build_collaboration_assets:listBuildCollaborationAssetStatuses"
    ) {
      if (args === "skip") {
        return undefined;
      }
      const requested = new Set(
        Array.isArray(args?.assetIds) ? args.assetIds : []
      );
      return mocks.assetStatuses.filter((asset) =>
        requested.has(asset._id)
      );
    }
    if (
      functionName ===
      "build_action_item_queues:listMyBuildActionItemQueue"
    ) {
      return args === "skip" ? undefined : mocks.personalActionItems;
    }
    if (
      functionName ===
      "build_action_item_queues:listBuildActionItemQueue"
    ) {
      if (args === "skip") {
        return undefined;
      }
      return args?.scope === "entity"
        ? mocks.entityActionItems
        : mocks.buildActionItems;
    }
    if (
      functionName ===
      "build_collaboration_notifications:getMyBuildCollaborationNotificationPreferences"
    ) {
      return {
        channels: mocks.preferenceChannels,
        digestCadence: "daily",
        digestEnabled: true,
        ordinaryMuted: false,
      };
    }
    if (
      functionName ===
      "build_collaboration_delivery_api:getMyBuildCollaborationPushSubscription"
    ) {
      return args !== "skip" &&
        mocks.pushSubscription?.endpoint === args?.endpoint
        ? mocks.pushSubscription
        : args === "skip"
          ? undefined
          : null;
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
      {
        entityId: "action-4",
        entityKind: "actionItem",
        eyebrow: "Action Item",
        href: "?tab=details&focus=actionItem%3Aaction-4",
        label: "Pour foundation wall",
        searchTerms: ["foundation", "wall"],
        summary: "In progress · assigned to Marco Ruiz",
      },
    ];
  },
}));

beforeEach(() => {
  searchAction.mockImplementation(async () => mocks.searchResponse);
});

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

import {
  buildActionItemQueueHref,
  BuildCollaborationFeed,
} from "./BuildCollaborationFeed";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: undefined,
  });
  cleanup();
  mocks.mutate.mockClear();
  mocks.loadMore.mockClear();
  mocks.onOpenReference.mockClear();
  mocks.drafts = [];
  mocks.editorReferences = [];
  mocks.entityActionItems = [];
  mocks.personalActionItems = [];
  mocks.comments = [];
  mocks.commentsLoading = false;
  mocks.acceptedCommentId = undefined;
  mocks.actionItemAssignmentState = "unassigned";
  mocks.actionItemDetailState = "visible";
  mocks.actionItemRequiresAcceptance = false;
  mocks.actionItemWorkKind = "ordinary";
  mocks.announcementExpiresAt = undefined;
  mocks.announcementProminent = false;
  mocks.assetStatuses = [];
  mocks.buildActionItems = [];
  mocks.feedStatus = "Exhausted";
  mocks.focusedCommentContext = undefined;
  mocks.focusedPostContext = undefined;
  mocks.focusedPostId = "post-1";
  mocks.postContentState = "active";
  mocks.postResolutionSummary = undefined;
  mocks.postRevision = 1;
  mocks.postThreadState = "open";
  mocks.postType = "update";
  mocks.postViewerCanModerate = false;
  mocks.postViewerIsAuthor = true;
  mocks.preferenceChannels = ["in_app", "email"];
  mocks.pushSubscription = null;
  mocks.queueStatus = "Exhausted";
  mocks.searchResponse = { continueCursor: null, isDone: true, page: [] };
  mocks.workflowAssignmentMode = "direct";
  mocks.workflowCanAccept = false;
  mocks.workflowTransitions = ["in_progress", "blocked", "cancelled"];
  searchAction.mockReset();
});

describe("BuildCollaborationFeed", () => {
  test("exposes digest cadence and email delivery controls", async () => {
    render(
      <BuildCollaborationFeed buildId="build-1" organizationId="org-1" />
    );

    expect(
      screen.getByRole("combobox", { name: "Activity digest" })
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Email on" }));

    await waitFor(() =>
      expect(mocks.mutate).toHaveBeenCalledWith({
        buildId: "build-1",
        channels: ["in_app"],
        digestCadence: "daily",
        digestEnabled: true,
        ordinaryMuted: false,
        organizationId: "org-1",
      })
    );
  });

  test("atomically registers the current browser before showing push as enabled", async () => {
    vi.stubEnv("VITE_BUILD_COLLABORATION_PUSH_PUBLIC_KEY", "AQIDBA");
    const unsubscribe = vi.fn().mockResolvedValue(true);
    const subscribe = vi.fn().mockResolvedValue({
      endpoint: "https://push.example.test/browser-subscription",
      getKey: (name: string) =>
        name === "auth"
          ? new Uint8Array([1, 2]).buffer
          : new Uint8Array([3, 4]).buffer,
      unsubscribe,
    });
    const register = vi.fn().mockResolvedValue({
      pushManager: { subscribe },
    });
    const getRegistration = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("Notification", {
      requestPermission: vi.fn().mockResolvedValue("granted"),
    });
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { getRegistration, register },
    });
    render(
      <BuildCollaborationFeed buildId="build-1" organizationId="org-1" />
    );

    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "Push off" }) as HTMLButtonElement)
          .disabled
      ).toBe(false)
    );
    fireEvent.click(screen.getByRole("button", { name: "Push off" }));

    await waitFor(() =>
      expect(mocks.mutate).toHaveBeenCalledWith({
        auth: "AQI",
        buildId: "build-1",
        endpoint: "https://push.example.test/browser-subscription",
        organizationId: "org-1",
        p256dh: "AwQ",
      })
    );
    expect(register).toHaveBeenCalledWith(
      "/build-collaboration-push-sw.js"
    );
    expect(subscribe).toHaveBeenCalledWith(
      expect.objectContaining({ userVisibleOnly: true })
    );
    expect(unsubscribe).not.toHaveBeenCalled();
  });

  test("does not treat another registered device as this browser's push opt-in", async () => {
    mocks.preferenceChannels = ["in_app", "email", "push"];
    mocks.pushSubscription = {
      _id: "subscription-device-one",
      createdAt: Date.now(),
      endpoint: "https://push.example.test/device-one",
    };
    const browserSubscription = {
      endpoint: "https://push.example.test/device-two",
      getKey: vi.fn(),
      unsubscribe: vi.fn(),
    };
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        getRegistration: vi.fn().mockResolvedValue({
          pushManager: {
            getSubscription: vi.fn().mockResolvedValue(browserSubscription),
          },
        }),
      },
    });

    render(
      <BuildCollaborationFeed buildId="build-1" organizationId="org-1" />
    );

    expect(await screen.findByRole("button", { name: "Push off" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Push on" })).toBeNull();
  });

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

  test("routes every searchable entity kind through its exact authorized deep link", async () => {
    const entityKinds = [
      "participant",
      "milestone",
      "submilestone",
      "draw",
      "evidencePackage",
      "evidenceAsset",
      "siteVisit",
      "document",
      "material",
      "actionItem",
    ];
    mocks.searchResponse = {
      continueCursor: null,
      isDone: true,
      page: entityKinds.map((entityKind) => ({
        audienceMode: "build_wide",
        createdAt: 1,
        entityId: `entity-${entityKind}`,
        entityKind,
        excerpt: `Authorized ${entityKind} result`,
        hasAttachments: false,
        href: `/role-safe/${entityKind}`,
        id: `reference-${entityKind}`,
        matchKind: "keyword",
        postId: "post-1",
        resolutionState: "open",
        resultType: "reference",
        score: 10,
        status: "open",
        title: `Search ${entityKind}`,
        updatedAt: 1,
      })),
    };
    render(
      <BuildCollaborationFeed
        buildId="build-1"
        onOpenReference={mocks.onOpenReference}
        organizationId="org-1"
      />,
    );
    fireEvent.change(
      screen.getByRole("textbox", {
        name: "Search all authorized Build collaboration",
      }),
      { target: { value: "foundation" } },
    );

    await screen.findByRole("button", { name: "Open Search participant" });
    for (const entityKind of entityKinds) {
      fireEvent.click(
        screen.getByRole("button", { name: `Open Search ${entityKind}` }),
      );
      expect(mocks.onOpenReference).toHaveBeenLastCalledWith({
        entityId: `entity-${entityKind}`,
        entityKind,
        href: `/role-safe/${entityKind}`,
      });
    }
  });

  test("opens a collaboration asset in its owning thread instead of an Evidence record", async () => {
    mocks.searchResponse = {
      continueCursor: null,
      isDone: true,
      page: [
        {
          audienceMode: "build_wide",
          createdAt: 1,
          entityId: "collaboration-asset-1",
          excerpt: "inspection-photo.jpg",
          focusEntityId: "comment-1",
          focusEntityKind: "comment",
          hasAttachments: true,
          href: "/contractor/builds/build-1?tab=collaboration&focus=comment%3Acomment-1",
          id: "collaboration-asset-1",
          matchKind: "keyword",
          postId: "post-1",
          resolutionState: "open",
          resultType: "asset",
          score: 10,
          status: "available",
          title: "inspection-photo.jpg",
          updatedAt: 1,
        },
      ],
    };
    render(
      <BuildCollaborationFeed
        buildId="build-1"
        onOpenReference={mocks.onOpenReference}
        organizationId="org-1"
      />,
    );
    fireEvent.change(
      screen.getByRole("textbox", {
        name: "Search all authorized Build collaboration",
      }),
      { target: { value: "inspection photo" } },
    );

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Open inspection-photo.jpg",
      }),
    );
    expect(mocks.onOpenReference).toHaveBeenLastCalledWith({
      entityId: "comment-1",
      entityKind: "comment",
      href: "/contractor/builds/build-1?tab=collaboration&focus=comment%3Acomment-1",
    });
  });

  test("shows the viewer's authorized cross-Build assignment queue", () => {
    mocks.personalActionItems = [
      queueRowFixture({
        buildId: "build-2",
        buildName: "Lake House",
        id: "action-personal",
        overdue: true,
        title: "Confirm framing inspection",
      }),
    ];
    mocks.buildActionItems = [
      {
        ...queueRowFixture({
          buildId: "build-1",
          buildName: "Foundation Build",
          id: "action-build",
          title: "Resolve site access",
        }),
        queueScope: "build",
      },
    ];

    render(
      <BuildCollaborationFeed buildId="build-1" organizationId="org-1" />
    );

    expect(screen.getByText("My Action Items")).toBeTruthy();
    expect(screen.getByText("Confirm framing inspection")).toBeTruthy();
    expect(screen.getByText("Lake House")).toBeTruthy();
    expect(screen.getByText("Overdue")).toBeTruthy();
    expect(screen.getByText("Build Action Items")).toBeTruthy();
    expect(screen.getByText("Resolve site access")).toBeTruthy();
    expect(
      buildActionItemQueueHref(
        "https://drawflow.example/builder/builds/build-1?tab=details&rail=closed",
        "build-2",
        "action-personal"
      )
    ).toBe(
      "/builder/builds/build-2?tab=details&focus=actionItem%3Aaction-personal"
    );
    expect(
      buildActionItemQueueHref(
        "https://drawflow.example/builder-staff/builds/build-1?tab=details",
        "build-2",
        "action-personal"
      )
    ).toBe(
      "/builder-staff/builds/build-2?tab=details&focus=actionItem%3Aaction-personal"
    );
  });

  test("makes every queued Action Item accessible through an explicit view-all control", () => {
    mocks.personalActionItems = Array.from({ length: 16 }, (_, index) =>
      queueRowFixture({
        buildId: "build-1",
        buildName: "Foundation Build",
        id: `action-personal-${index + 1}`,
        title: `Queued action ${index + 1}`,
      })
    );

    render(
      <BuildCollaborationFeed buildId="build-1" organizationId="org-1" />
    );

    expect(screen.queryByText("Queued action 6")).toBeNull();
    expect(screen.queryByText("Queued action 16")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Show 5 more of 11" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Show 5 more of 6" }));
    fireEvent.click(screen.getByRole("button", { name: "Show 1 more of 1" }));
    for (let index = 1; index <= 16; index += 1) {
      expect(screen.getByText(`Queued action ${index}`)).toBeTruthy();
    }
    expect(screen.queryByRole("button", { name: /Show .* more of/ })).toBeNull();
  });

  test("loads the next server page after the visible queue page is exhausted", () => {
    mocks.queueStatus = "CanLoadMore";
    mocks.personalActionItems = Array.from({ length: 5 }, (_, index) =>
      queueRowFixture({
        buildId: "build-1",
        buildName: "Foundation Build",
        id: `paged-action-${index + 1}`,
        title: `Paged action ${index + 1}`,
      })
    );

    render(
      <BuildCollaborationFeed buildId="build-1" organizationId="org-1" />
    );

    fireEvent.click(
      screen.getAllByRole("button", { name: "Load more Action Items" })[0]
    );
    expect(mocks.loadMore).toHaveBeenCalledWith(20);
  });

  test("projects related Action Items into a referenced entity sheet", async () => {
    mocks.entityActionItems = [
      {
        ...queueRowFixture({
          buildId: "build-1",
          buildName: "Foundation Build",
          id: "action-entity",
          title: "Replace blurred foundation photo",
        }),
        queueScope: "entity",
      },
    ];

    render(
      <BuildCollaborationFeed buildId="build-1" organizationId="org-1" />
    );
    fireEvent.click(screen.getByText("Foundation completion photo"));

    expect(screen.getByText("Related Action Items")).toBeTruthy();
    expect(screen.getByText("Replace blurred foundation photo")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Open Replace blurred foundation photo",
      })
    );
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Upload engineer seal" })
      ).toBeTruthy()
    );
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
        kind: "evidence",
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
              entityKind: "evidencePackage",
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

  test("uses the Action Item detail sheet for children, checklists, relationship conflicts, and repair", async () => {
    render(
      <BuildCollaborationFeed buildId="build-1" organizationId="org-1" />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Action Items 1" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Open details" }),
    );

    expect(screen.getByText("Structured work")).toBeTruthy();
    expect(screen.getByText("Collect engineer seal")).toBeTruthy();
    expect(screen.getByText("Confirm file naming")).toBeTruthy();
    expect(screen.getByText("Release Draw 3")).toBeTruthy();
    expect(screen.getByText("Permission conflict")).toBeTruthy();

    mocks.mutate.mockClear();
    fireEvent.click(
      screen.getByLabelText("Mark Confirm file naming complete"),
    );
    await waitFor(() =>
      expect(mocks.mutate).toHaveBeenCalledWith({
        buildId: "build-1",
        checklistItemId: "checklist-1",
        expectedRevision: 1,
        organizationId: "org-1",
      }),
    );

    mocks.mutate.mockClear();
    fireEvent.change(screen.getByLabelText("Relationship repair reason"), {
      target: { value: "Aligned the post audiences" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    await waitFor(() =>
      expect(mocks.mutate).toHaveBeenCalledWith({
        buildId: "build-1",
        expectedSourceRevision: 7,
        organizationId: "org-1",
        reason: "Aligned the post audiences",
        relationId: "relation-2",
      }),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Add child Action Item" }),
    );
    expect(
      screen.getByRole("heading", { name: "Create child Action Item" }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Independent work under Upload engineer seal; visibility remains inherited from the same post.",
      ),
    ).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Action Item title"), {
      target: { value: "Confirm engineer seal filename" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Mock Action Item description" }),
    );
    mocks.mutate.mockClear();
    fireEvent.click(
      screen.getByRole("button", { name: "Create Action Item" }),
    );
    await waitFor(() =>
      expect(mocks.mutate).toHaveBeenCalledWith(
        expect.objectContaining({
          expectedParentRevision: 1,
          parentActionItemId: "action-1",
          postId: "post-1",
          title: "Confirm engineer seal filename",
        }),
      ),
    );
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

  test("hydrates and focuses a notification post outside the loaded feed page", async () => {
    mocks.focusedPostContext = {
      entry: focusedPostEntryFixture(
        "post-outside-first-page",
        "Focused notification thread."
      ),
      state: "visible",
    };

    render(
      <BuildCollaborationFeed
        buildId="build-1"
        focusedReference="post:post-outside-first-page"
        organizationId="org-1"
      />
    );

    expect(await screen.findByText("Focused notification thread.")).toBeTruthy();
    expect(
      screen
        .getByTestId("collaboration-post-post-outside-first-page")
        .getAttribute("data-focused")
    ).toBe("true");
    expect(screen.getByText("Foundation evidence is ready for review.")).toBeTruthy();
  });

  test("keeps revoked focused posts disclosure-safe", async () => {
    mocks.focusedPostContext = { state: "revoked" };
    render(
      <BuildCollaborationFeed
        buildId="build-1"
        focusedReference="post:post-revoked"
        organizationId="org-1"
      />
    );

    expect(
      await screen.findByText(
        "This focused post is unavailable or your access was revoked."
      )
    ).toBeTruthy();
    expect(
      screen.getAllByText("Foundation evidence is ready for review.").length
    ).toBeGreaterThan(0);
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

  test("announces focused discussion hydration without replacing ordinary rows", () => {
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
    expect(screen.getAllByText("Ordinary loaded reply").length).toBeGreaterThan(
      0
    );
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
    expect(screen.getAllByText("Ordinary loaded reply").length).toBeGreaterThan(
      0
    );
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

  test("publishes a human-authored composer post without showing a HITL checkpoint", async () => {
    render(
      <BuildCollaborationFeed buildId="build-1" organizationId="org-1" />,
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: /What should people involved in this Build know\?/,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Mock Build update" }));
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));

    await waitFor(() =>
      expect(mocks.mutate).toHaveBeenCalledWith(
        expect.objectContaining({
          buildId: "build-1",
          organizationId: "org-1",
          plainText: "Useful accountable work.",
        }),
      ),
    );
    expect(screen.queryByText("Human approval checkpoint")).toBeNull();
  });

  test("offers direct publish for a human-authored saved draft", async () => {
    mocks.drafts = [
      {
        _creationTime: Date.now(),
        _id: "human-draft-1",
        approvalOwnerWorkosUserId: "user_admin",
        bundleJson: JSON.stringify({
          actionItems: [],
          attachmentAssetIds: [],
          audienceMode: "build_wide",
          effectiveNotificationEffects: [],
          effectiveReaderIds: ["user_admin"],
          excludedReaderIds: [],
          mandatoryReaderIds: ["user_admin"],
          notificationEffects: [],
          plainText: "Human saved draft.",
          postType: "update",
          references: [],
          requestedReaderIds: [],
          sharedMutations: [],
          tiptapJson: JSON.stringify({
            content: [
              {
                content: [{ text: "Human saved draft.", type: "text" }],
                type: "paragraph",
              },
            ],
            type: "doc",
          }),
        }),
        preparedByActorKind: "human",
        preparedByAgent: false,
        preparedByWorkosUserId: "user_admin",
        revision: 1,
        state: "active",
        updatedAt: Date.now(),
      },
    ];
    render(
      <BuildCollaborationFeed buildId="build-1" organizationId="org-1" />,
    );

    expect(
      screen.queryByRole("button", { name: "Review exact bundle" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() =>
      expect(mocks.mutate).toHaveBeenCalledWith({
        buildId: "build-1",
        draftId: "human-draft-1",
        organizationId: "org-1",
      }),
    );
    expect(screen.queryByText("Human approval checkpoint")).toBeNull();
  });

  test("removes an individual governed attachment from an edited draft", async () => {
    mocks.assetStatuses = [
      {
        _id: "asset-remove-1",
        contentHashSha256: "a".repeat(64),
        fileName: "mistaken-photo.jpg",
        mimeType: "image/jpeg",
        scanState: "clean",
        sizeBytes: 2048,
        state: "available",
        version: 1,
      },
    ];
    mocks.drafts = [
      {
        _creationTime: Date.now(),
        _id: "human-draft-remove",
        approvalOwnerWorkosUserId: "user_admin",
        bundleJson: JSON.stringify({
          actionItems: [],
          attachmentAssetIds: ["asset-remove-1"],
          audienceMode: "build_wide",
          effectiveNotificationEffects: [],
          effectiveReaderIds: ["user_admin"],
          excludedReaderIds: [],
          mandatoryReaderIds: ["user_admin"],
          notificationEffects: [],
          plainText: "Draft with one mistaken attachment.",
          postType: "update",
          references: [],
          requestedReaderIds: [],
          sharedMutations: [],
          tiptapJson: JSON.stringify({
            content: [
              {
                content: [
                  { text: "Draft with one mistaken attachment.", type: "text" },
                ],
                type: "paragraph",
              },
            ],
            type: "doc",
          }),
        }),
        preparedByActorKind: "human",
        preparedByAgent: false,
        preparedByWorkosUserId: "user_admin",
        revision: 1,
        state: "active",
        updatedAt: Date.now(),
      },
    ];
    render(
      <BuildCollaborationFeed buildId="build-1" organizationId="org-1" />
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByText("mistaken-photo.jpg")).toBeTruthy();
    mocks.mutate.mockClear();

    fireEvent.click(
      screen.getByRole("button", { name: "Remove mistaken-photo.jpg" })
    );

    await waitFor(() =>
      expect(mocks.mutate).toHaveBeenCalledWith(
        expect.objectContaining({
          attachmentAssetIds: [],
          buildId: "build-1",
          draftId: "human-draft-remove",
          organizationId: "org-1",
        })
      )
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Remove mistaken-photo.jpg" })
      ).toBeNull()
    );
  });

  test("shows the complete effective bundle before a human approves an agent draft", async () => {
    mocks.assetStatuses = [
      {
        _id: "asset-1",
        contentHashSha256:
          "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        fileName: "engineer-seal.pdf",
        mimeType: "application/pdf",
        scanState: "clean",
        sizeBytes: 24_576,
        state: "available",
        version: 1,
      },
    ];
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
    expect(screen.getByText("engineer-seal.pdf")).toBeTruthy();
    expect(screen.getByText(/Scan: clean/)).toBeTruthy();
    expect(screen.getByText(/SHA-256 1234567890ab/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open" })).toBeTruthy();
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
