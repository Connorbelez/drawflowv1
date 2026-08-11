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

import type { Id } from "../../../convex/_generated/dataModel";

const localStorageValues = new Map<string, string>();
Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: {
    clear: () => localStorageValues.clear(),
    getItem: (key: string) => localStorageValues.get(key) ?? null,
    removeItem: (key: string) => localStorageValues.delete(key),
    setItem: (key: string, value: string) =>
      localStorageValues.set(key, String(value)),
  },
});

const searchAction = vi.hoisted(() => vi.fn());
const offlineDraftMocks = vi.hoisted(() => ({
  deleteDraft: vi.fn().mockResolvedValue(undefined),
  loadDraft: vi.fn().mockResolvedValue(null),
  saveDraft: vi.fn(),
}));

const mocks = vi.hoisted(() => ({
  acceptedCommentId: undefined as string | undefined,
  allQueriesUnavailable: false,
  actionItemAssignmentState: "unassigned" as
    | "unassigned"
    | "requested"
    | "assigned",
  actionItemDetailId: "action-1",
  actionItemDetailState: "visible" as "revoked" | "visible",
  actionItemRequiresAcceptance: false,
  actionItemAttachments: [] as Array<Record<string, unknown>>,
  actionItemWorkKind: "ordinary" as
    | "ordinary"
    | "approval"
    | "evidence"
    | "site_visit_remediation"
    | "draw_blocker",
  announcementExpiresAt: undefined as number | undefined,
  announcementProminent: false,
  authUserId: "user_admin" as string | undefined,
  assetStatuses: [] as Array<Record<string, unknown>>,
  buildActionItems: [] as Array<Record<string, unknown>>,
  canonicalSystemActionItem: false,
  canonicalReviewState: "in_review" as
    | "in_review"
    | "changes_requested"
    | "approved"
    | "reopened",
  canonicalMilestoneReviewState: "in_review" as
    | "in_review"
    | "ready_for_approval"
    | "approved"
    | "reopened",
  canonicalCanSubmitForReview: false,
  canonicalParentReadyForApproval: false,
  comments: [] as Array<Record<string, unknown>>,
  commentsLoading: false,
  convexConnectionState: {
    connectionCount: 1,
    connectionRetries: 0,
    hasEverConnected: true,
    hasInflightRequests: false,
    inflightActions: 0,
    inflightMutations: 0,
    isWebSocketConnected: true,
    timeOfOldestInflightRequest: null,
  },
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
  feedRows: [] as Array<Record<string, unknown>>,
  feedQueryArgs: undefined as Record<string, unknown> | undefined,
  focusedCommentContext: undefined as Record<string, unknown> | undefined,
  focusedAssetContext: undefined as Record<string, unknown> | undefined,
  focusedPostContext: undefined as Record<string, unknown> | undefined,
  focusedReferenceContext: undefined as Record<string, unknown> | undefined,
  focusedPostId: "post-1" as string | null,
  loadMore: vi.fn(),
  lifecycleState: "open" as "closed" | "open" | "purged",
  planningLifecycle: undefined as "open" | "resolved" | "reopened" | undefined,
  planningReconciliation: undefined as Record<string, unknown> | undefined,
  planningSnapshotStatus: "Exhausted" as
    | "CanLoadMore"
    | "Exhausted"
    | "LoadingFirstPage"
    | "LoadingMore",
  planningDiffStatus: "Exhausted" as
    | "CanLoadMore"
    | "Exhausted"
    | "LoadingFirstPage"
    | "LoadingMore",
  mutate: vi.fn().mockResolvedValue(null),
  onOpenReference: vi.fn(),
  personalActionItems: [] as Array<Record<string, unknown>>,
  preferenceChannels: ["in_app", "email"] as Array<"in_app" | "email" | "push">,
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
  serverDraftIdentityWorkosUserId: "user_admin",
  searchResponse: {
    continueCursor: null,
    isDone: true,
    page: [] as Array<Record<string, unknown>>,
  },
  canSchedule: false,
  workflowAssignmentMode: "direct" as "direct" | "request",
  workflowCanAccept: false,
  viewerBinding: {
    buildId: "build-1",
    organizationId: "org-1",
    role: "admin",
    roles: ["admin"],
    workosUserId: "user_admin",
  } as Record<string, unknown>,
  workflowTransitions: ["in_progress", "blocked", "cancelled"] as Array<
    "todo" | "in_progress" | "in_review" | "blocked" | "done" | "cancelled"
  >,
}));

vi.mock("@workos/authkit-tanstack-react-start/client", () => ({
  useAuth: () => ({
    loading: false,
    user: mocks.authUserId ? { id: mocks.authUserId } : null,
  }),
}));

vi.mock("./build-collaboration-offline-drafts.ts", () => ({
  buildCollaborationOfflineDraftKey: ({
    buildId,
    organizationId,
    workosUserId,
  }: {
    buildId: string;
    organizationId: string;
    workosUserId: string;
  }) => `${organizationId}:${buildId}:${workosUserId}`,
  deleteBuildCollaborationOfflineDraft: offlineDraftMocks.deleteDraft,
  filesFromBuildCollaborationOfflineDraft: () => [],
  loadBuildCollaborationOfflineDraft: offlineDraftMocks.loadDraft,
  saveBuildCollaborationOfflineDraft: offlineDraftMocks.saveDraft,
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
      threadState: mocks.postThreadState,
      updatedAt: now,
      viewerCanAppeal: false,
      viewerCanEdit: false,
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
        content: [{ content: [{ text, type: "text" }], type: "paragraph" }],
        type: "doc",
      }),
    },
  };
}

function canonicalMilestoneSystemPostEntryFixture() {
  const now = Date.parse("2026-08-03T12:00:00.000Z");
  const planningLifecycle =
    mocks.planningLifecycle ??
    (mocks.postThreadState === "resolved" ? "resolved" : "open");
  return {
    acknowledgement: { acknowledged: false, required: false },
    actionItems: [
      {
        _id: "system-action-1",
        actionableUnreadCount: 0,
        assignmentState: "unassigned",
        canonicalBindingRevision: 1,
        canonicalBuildMilestoneId: "milestone-1",
        canonicalBuildSubmilestoneId: "submilestone-1",
        createdAt: now,
        currentRevision: 1,
        dependencyCount: 0,
        priority: "none",
        requiresAcceptance: false,
        status: "todo",
        systemPresentation: {
          bindingState: "valid",
          column: "behind_schedule",
          executionOwnership: {
            state: "assignment_required",
            viewerIsAssignee: false,
          },
          plannedCompletionDate: "2026-08-04",
          plannedStartDate: "2026-08-03",
          startCommand: {
            allowed: false,
            buildName: "UI fixture Build",
            buildSubmilestoneId: "submilestone-1",
            dependencyBlockers: [],
            denialReason: "assignment_required",
            milestoneKey: "foundation",
            milestoneName: "Foundation",
            plannedStartDate: "2026-08-03",
            proposalSubmilestoneId: "proposal-submilestone-1",
            scope: "submilestone",
            source: "submilestone_detail",
            submilestoneKey: "foundation-1",
            submilestoneName: "Excavate",
          },
          state: "known",
          timezone: "America/Toronto",
          workflowRevision: 2,
        },
        systemMode: "generated_milestone_submilestone",
        title: "Excavate",
        unblocksCount: 0,
        unreadCommentCount: 0,
      },
    ],
    following: false,
    kind: "post",
    pins: [],
    post: {
      _creationTime: now,
      _id: "system-post-1",
      agentDrafted: false,
      announcementProminent: false,
      audienceMode: "build_wide",
      authorDisplayNameSnapshot: "DrawFlow System",
      authorRole: "admin",
      commentCount: 0,
      contentState: "active",
      createdAt: now,
      planningSummary: {
        attention: {
          assignmentGaps: 1,
          dependencyExceptions: 0,
          overdueCompletion: 0,
          requiredSiteVisits: 1,
          reviewSla: 0,
        },
        counts: {
          approved: 0,
          backlog: 0,
          behind_schedule: 0,
          in_progress: 1,
          in_review: 0,
          superseded: 0,
        },
        lifecycle: planningLifecycle,
        readyForApproval: false,
      },
      postType: "update",
      readRevision: 2,
      revision: 2,
      resolutionSummary: mocks.postResolutionSummary,
      source: "system",
      systemPost: {
        activationReason: "explicit_start",
        activationPlanningRevision: 1,
        authoredBy: "DrawFlow System",
        canonicalBuildMilestoneId: "milestone-1",
        kind: "milestone",
        milestoneKey: "foundation",
        currentPlanningRevision: 1,
        lifecycle: planningLifecycle,
        occurrenceKey: "milestone-system:build-1:milestone-1",
        triggeredAt: now,
        triggeredByRole: "builder",
        triggeredByWorkosUserId: "user_builder",
      },
      threadState: mocks.postThreadState,
      updatedAt: now,
      viewerCanAppeal: false,
      viewerCanEdit: true,
      viewerCanManageThread: true,
      viewerCanModerate: false,
      viewerCanResolveAppeal: false,
      viewerIsAuthor: false,
    },
    reactions: [],
    receipts: [],
    references: [
      {
        _id: "system-reference-1",
        entityId: "milestone-1",
        entityKind: "milestone",
        labelSnapshot: "Foundation",
        summarySnapshot: "Canonical Milestone",
      },
    ],
    revision: {
      plainText:
        "Foundation started. Canonical Sub-milestone cards are synchronized.",
      tiptapJson: JSON.stringify({
        content: [
          {
            content: [
              {
                text: "Foundation started. Canonical Sub-milestone cards are synchronized.",
                type: "text",
              },
            ],
            type: "paragraph",
          },
        ],
        type: "doc",
      }),
    },
  };
}

type DrawCoordinationFixtureState = {
  canJoin: boolean;
  canLeave: boolean;
  eligible: boolean;
  joined: boolean;
  oversight: boolean;
  workingAudienceCount: number;
  workingAudienceTruncated?: boolean;
};

function canonicalDrawSystemPostEntryFixture(
  options: {
    coordination?: DrawCoordinationFixtureState;
  } = {},
) {
  const now = Date.parse("2026-08-03T12:00:00.000Z");
  const plainText =
    "Foundation reimbursement is tracked in DrawFlow System. Canonical Draw Request, evidence, review, approval, and release state remain authoritative.";
  const coordination = options.coordination ?? {
    canJoin: false,
    canLeave: false,
    eligible: true,
    joined: false,
    oversight: true,
    workingAudienceCount: 0,
    workingAudienceTruncated: false,
  };
  return {
    acknowledgement: { acknowledged: false, required: false },
    actionItems: [],
    attachments: [],
    following: false,
    kind: "post" as const,
    pins: [],
    post: {
      _creationTime: now,
      _id: "draw-system-post-1",
      agentDrafted: false,
      announcementProminent: false,
      audienceMode: "custom",
      authorDisplayNameSnapshot: "DrawFlow System",
      commentCount: 0,
      contentState: "active",
      createdAt: now,
      postType: "update",
      readRevision: 1,
      revision: 1,
      source: "system",
      systemPost: {
        activationReason: "scheduled",
        authoredBy: "DrawFlow System",
        canonicalBuildDrawOccurrenceKey:
          "draw-system:build-1:proposal-1:proposal-row:proposal-draw-1",
        drawFacts: {
          approval: { state: "pending" },
          evidence: {
            assetCount: 1,
            locationUnverifiedCount: 1,
            state: "location_unverified",
          },
          generatedActionItems: 0,
          occurrenceKey:
            "draw-system:build-1:proposal-1:proposal-row:proposal-draw-1",
          planned: {
            _id: "planned-draw-1",
            amountCents: 5_000_000,
            drawKey: "foundation-draw",
            label: "Foundation reimbursement",
            scheduledDate: "2026-07-28",
            status: "planned",
            timingDay: 0,
          },
          release: { state: "not_started" },
          request: {
            _id: "draw-request-1",
            amountCents: 5_000_000,
            displayId: "DR-0001",
            note: "Foundation reimbursement requested.",
            requestedAt: "2026-08-03T12:00:00.000Z",
            requestKey: "dr-0001-1",
            status: "requested",
          },
          review: { state: "in_review" },
          siteVisit: { cancelled: 0, complete: 1, count: 1, requested: 0 },
        },
        kind: "draw",
        lifecycle: "open",
        occurrenceKey:
          "draw-system:build-1:proposal-1:proposal-row:proposal-draw-1",
        drawCoordination: coordination,
      },
      threadState: "open",
      updatedAt: now,
      viewerCanAppeal: false,
      viewerCanEdit: false,
      viewerCanManageThread: true,
      viewerCanModerate: false,
      viewerCanResolveAppeal: false,
      viewerIsAuthor: false,
    },
    reactions: [],
    receipts: [],
    references: [
      {
        _id: "draw-reference-1",
        entityId: "planned-draw-1",
        entityKind: "draw",
        labelSnapshot: "Foundation reimbursement",
        summarySnapshot: "$50,000 · Planned",
      },
    ],
    revision: {
      plainText,
      tiptapJson: JSON.stringify({
        content: [
          { content: [{ text: plainText, type: "text" }], type: "paragraph" },
        ],
        type: "doc",
      }),
    },
  };
}

function planningReconciliationFixture({
  restricted = false,
  truncated = false,
  materializationPending = false,
  diffPagesPending = false,
}: {
  restricted?: boolean;
  truncated?: boolean;
  materializationPending?: boolean;
  diffPagesPending?: boolean;
} = {}) {
  const milestoneDiff = {
    category: "dates",
    changeType: "changed",
    entityKey: "foundation:foundation-1",
    entityType: "submilestone",
    field: "startDay",
    nextValue: 5,
    priorValue: 3,
    revision: 2,
  };
  const diffs = restricted
    ? [milestoneDiff]
    : [
        milestoneDiff,
        {
          category: "allocations",
          changeType: "added",
          entityKey: "foundation:foundation-1:contractor-1:framing",
          entityType: "allocation",
          field: "estimatedCostCents",
          nextValue: 125_000,
          priorValue: undefined,
          revision: 3,
        },
      ];
  return {
    activation: {
      approvedAt: Date.parse("2026-08-03T12:00:00.000Z"),
      actorRoles: ["admin"],
      actorWorkosUserId: "user_admin",
      revision: 1,
      snapshot: {
        allocations: restricted ? [] : [{ entityType: "allocation" }],
        budgets: restricted ? [] : [{ entityType: "budget" }],
        buildId: "build-1",
        draws: restricted ? [] : [{ entityType: "draw" }],
        evidenceRequirements: restricted
          ? []
          : [{ entityType: "evidenceRequirement" }],
        milestones: [{ entityType: "milestone" }],
        submilestones: [{ entityType: "submilestone" }],
      },
    },
    current: {
      revision: 3,
      snapshot: {
        allocations: restricted ? [] : [{ entityType: "allocation" }],
        budgets: restricted ? [] : [{ entityType: "budget" }],
        buildId: "build-1",
        draws: restricted ? [] : [{ entityType: "draw" }],
        evidenceRequirements: restricted
          ? []
          : [{ entityType: "evidenceRequirement" }],
        milestones: [{ entityType: "milestone" }],
        submilestones: [{ entityType: "submilestone" }],
      },
    },
    diffs,
    diffPagesPending,
    diffsTruncated: truncated,
    materializationPending,
    revisionsTruncated: false,
    revisions: [
      {
        approvedAt: Date.parse("2026-08-03T12:00:00.000Z"),
        actorRoles: ["admin"],
        actorWorkosUserId: "user_admin",
        diffCount: 1,
        kind: "approved",
        reason: "Reconciled approved roadmap",
        revision: 3,
        sourceCommand: "update_active_timeline_milestone",
        summary: "Schedule and assignment updates",
      },
    ],
  };
}

function collaborationDraftBundleFixture(
  text: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    actionItems: [],
    attachmentAssetIds: [],
    audienceMode: "build_wide",
    effectiveNotificationEffects: [],
    effectiveReaderIds: ["user_admin"],
    excludedReaderIds: [],
    mandatoryReaderIds: ["user_admin"],
    notificationEffects: [],
    plainText: text,
    postType: "update",
    references: [],
    requestedReaderIds: [],
    sharedMutations: [],
    tiptapJson: JSON.stringify({
      content: [{ content: [{ text, type: "text" }], type: "paragraph" }],
      type: "doc",
    }),
    ...overrides,
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
      reference as Parameters<typeof getFunctionName>[0],
    );
    return functionName ===
      "build_collaboration_search:searchBuildCollaboration"
      ? searchAction
      : mocks.mutate;
  },
  useMutation: () => mocks.mutate,
  useConvexConnectionState: () => mocks.convexConnectionState,
  usePaginatedQuery: (
    reference: unknown,
    args?: Record<string, unknown> | "skip",
  ) => {
    const functionName = getFunctionName(
      reference as Parameters<typeof getFunctionName>[0],
    );
    if (
      functionName ===
        "build_collaboration_planning_reconciliation:getActiveBuildPlanningReconciliationSnapshot" ||
      functionName ===
        "build_collaboration_planning_reconciliation:getActiveBuildPlanningActivationSnapshot"
    ) {
      const planning = mocks.planningReconciliation as
        | Record<string, any>
        | undefined;
      const snapshot = functionName.endsWith("ActivationSnapshot")
        ? planning?.activation?.snapshot
        : planning?.current?.snapshot;
      const results = snapshot
        ? [
            ...(snapshot.allocations ?? []),
            ...(snapshot.budgets ?? []),
            ...(snapshot.draws ?? []),
            ...(snapshot.evidenceRequirements ?? []),
            ...(snapshot.milestones ?? []),
            ...(snapshot.submilestones ?? []),
          ]
        : [];
      return {
        loadMore: mocks.loadMore,
        results: args === "skip" ? [] : results,
        status:
          args === "skip" ? "LoadingFirstPage" : mocks.planningSnapshotStatus,
      };
    }
    if (
      functionName ===
      "build_collaboration_planning_reconciliation:listActiveBuildPlanningReconciliationDiffs"
    ) {
      return {
        loadMore: mocks.loadMore,
        results:
          args === "skip"
            ? []
            : ((mocks.planningReconciliation as Record<string, any> | undefined)
                ?.diffs ?? []),
        status: args === "skip" ? "LoadingFirstPage" : mocks.planningDiffStatus,
      };
    }
    if (
      functionName === "build_action_item_queues:listMyBuildActionItemQueue"
    ) {
      return {
        loadMore: mocks.loadMore,
        results: args === "skip" ? [] : mocks.personalActionItems,
        status: args === "skip" ? "LoadingFirstPage" : mocks.queueStatus,
      };
    }
    if (functionName === "build_action_item_queues:listBuildActionItemQueue") {
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
    mocks.feedQueryArgs = args === "skip" ? undefined : args;
    return {
      loadMore: mocks.loadMore,
      results:
        mocks.feedRows.length > 0
          ? mocks.feedRows
          : [
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
                    actionableUnreadCount: 3,
                    assigneeWorkosUserId: "user-broker",
                    assignmentState: "assigned",
                    createdAt: Date.parse("2026-07-28T12:00:00.000Z"),
                    currentRevision: 1,
                    dependencyCount: 2,
                    priority: "high",
                    requiresAcceptance: false,
                    status: "todo",
                    title: "Upload engineer seal",
                    unblocksCount: 1,
                    unreadCommentCount: 2,
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
                  viewerCanEdit: mocks.postViewerIsAuthor,
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
    if (mocks.allQueriesUnavailable) {
      return undefined;
    }
    const functionName = getFunctionName(
      reference as Parameters<typeof getFunctionName>[0],
    );
    if (
      functionName ===
      "build_collaboration_viewer:getBuildCollaborationViewerBinding"
    ) {
      return mocks.viewerBinding;
    }
    if (
      functionName ===
      "build_collaboration_lifecycle:getBuildCollaborationLifecycleState"
    ) {
      return { state: mocks.lifecycleState };
    }
    if (
      functionName ===
      "build_collaboration_planning_reconciliation:getActiveBuildPlanningReconciliation"
    ) {
      return args === "skip" ? undefined : mocks.planningReconciliation;
    }
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
      "build_collaboration_focus:getFocusedBuildCollaborationReference"
    ) {
      return args === "skip" ? undefined : mocks.focusedReferenceContext;
    }
    if (
      functionName ===
      "build_collaboration_focus:getFocusedBuildCollaborationAssetContext"
    ) {
      return args === "skip" ? undefined : mocks.focusedAssetContext;
    }
    if (functionName === "build_action_item_details:getBuildActionItemDetail") {
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
        attachments: mocks.actionItemAttachments,
        comments: [],
        item: {
          actionItemId: mocks.actionItemDetailId,
          assigneeDisplayName: "Alex Chen",
          assigneeWorkosUserId: "user-builder",
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
                content: [{ text: "Upload the engineer seal.", type: "text" }],
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
          ...(mocks.canonicalSystemActionItem
            ? {
                canonicalBuildMilestoneId: "milestone-1",
                canonicalBuildSubmilestoneId: "submilestone-1",
                systemMode: "generated_milestone_submilestone",
                systemPresentation: {
                  bindingState: "valid",
                  canAddEvidence: mocks.viewerBinding.role === "builder",
                  canReview: [
                    "admin",
                    "principle-broker",
                    "broker",
                    "broker-staff",
                  ].includes(mocks.viewerBinding.role as string),
                  canRecommendReview: [
                    "admin",
                    "principle-broker",
                    "broker",
                    "broker-staff",
                  ].includes(mocks.viewerBinding.role as string),
                  canRequestChanges: [
                    "admin",
                    "principle-broker",
                    "broker",
                    "broker-staff",
                  ].includes(mocks.viewerBinding.role as string),
                  canApproveSubmilestone:
                    mocks.viewerBinding.role === "admin" &&
                    mocks.canonicalReviewState === "in_review",
                  canWaiveSiteVisit:
                    mocks.viewerBinding.role === "admin" &&
                    mocks.canonicalReviewState === "in_review",
                  canRetractSubmilestoneApproval:
                    mocks.viewerBinding.role === "admin" &&
                    mocks.canonicalReviewState === "approved",
                  canApproveMilestone:
                    mocks.viewerBinding.role === "admin" &&
                    mocks.canonicalParentReadyForApproval,
                  canRetractMilestoneApproval:
                    mocks.viewerBinding.role === "admin" &&
                    mocks.canonicalMilestoneReviewState === "approved",
                  canSubmitForReview: mocks.canonicalCanSubmitForReview,
                  canUpdateExecution: mocks.viewerBinding.role === "builder",
                  column: "in_review",
                  evidenceCount: 2,
                  evidencePackageRevision: 1,
                  evidencePackageRevisionId: "package-1",
                  progressPercent: 100,
                  readyExceptFor: ["Forms photo"],
                  reviewDecisionState: mocks.canonicalReviewState,
                  milestoneReviewDecisionState:
                    mocks.canonicalMilestoneReviewState,
                  parentReadyForApproval: mocks.canonicalParentReadyForApproval,
                  reviewRevision: 2,
                  milestoneReviewRevision: 4,
                  siteVisitRequirement: {
                    manualSignals: ["lender_staff_recommendation"],
                    policySignals: ["lender_policy"],
                    required: true,
                    riskSignals: [],
                    status:
                      mocks.canonicalReviewState === "approved"
                        ? "satisfied"
                        : "required",
                    siteVisitId: "site-visit-1",
                  },
                  reviewHistory: [
                    {
                      actorRoles: ["broker"],
                      actorWorkosUserId: "user_broker",
                      createdAt: now - 1000,
                      kind: "recommendation",
                      note: "Inspect footings before release.",
                      reviewRound: 1,
                      scope: "submilestone",
                      warnings: [],
                    },
                    ...(mocks.canonicalReviewState === "approved"
                      ? [
                          {
                            actorRoles: ["admin"],
                            actorWorkosUserId: "user_admin",
                            createdAt: now,
                            kind: "approved",
                            reviewRound: 4,
                            scope: "milestone",
                            warnings: [],
                          },
                        ]
                      : []),
                  ],
                  startCommand: {
                    allowed: false,
                    buildName: "UI fixture Build",
                    buildSubmilestoneId: "submilestone-1",
                    dependencyBlockers: [],
                    denialReason: "already_started",
                    milestoneKey: "foundation",
                    milestoneName: "Foundation",
                    plannedStartDate: "2026-08-03",
                    proposalSubmilestoneId: "proposal-submilestone-1",
                    scope: "submilestone",
                    source: "submilestone_detail",
                    submilestoneKey: "foundation-1",
                    submilestoneName: "Excavate",
                  },
                  state: "known",
                  timezone: "America/Toronto",
                  workflowRevision: 2,
                },
              }
            : {}),
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
      "build_collaboration_drafts:getMyBuildCollaborationDraftIdentity"
    ) {
      return args === "skip"
        ? undefined
        : { workosUserId: mocks.serverDraftIdentityWorkosUserId };
    }
    if (
      functionName ===
      "build_collaboration_scheduling:getBuildCollaborationSchedulingCapabilities"
    ) {
      return args === "skip"
        ? undefined
        : { canSchedule: mocks.canSchedule, role: "admin" };
    }
    if (
      functionName ===
      "build_collaboration_assets:listBuildCollaborationAssetStatuses"
    ) {
      if (args === "skip") {
        return undefined;
      }
      const requested = new Set(
        Array.isArray(args?.assetIds) ? args.assetIds : [],
      );
      return mocks.assetStatuses.filter((asset) => requested.has(asset._id));
    }
    if (
      functionName === "build_action_item_queues:listMyBuildActionItemQueue"
    ) {
      return args === "skip" ? undefined : mocks.personalActionItems;
    }
    if (functionName === "build_action_item_queues:listBuildActionItemQueue") {
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
      "submilestone_field_guidance:getSubmilestoneFieldGuidance"
    ) {
      const tiptapJson = JSON.stringify({
        content: [
          {
            content: [{ text: "Verify the selected scope.", type: "text" }],
            type: "paragraph",
          },
        ],
        type: "doc",
      });
      return {
        guidance: {
          _id: "guidance-1",
          buildId: "build-1",
          buildSubmilestoneId: "submilestone-1",
          cameraAnglesTiptapJson: tiptapJson,
          createdAt: Date.parse("2026-08-03T12:00:00.000Z"),
          proposalSubmilestoneId: "proposal-submilestone-1",
          updatedAt: Date.parse("2026-08-03T12:00:00.000Z"),
          updatedByWorkosUserId: "user_admin",
          whatToVerifyTiptapJson: tiptapJson,
        },
        readiness: { missingSections: [], readyForSiteVisit: true },
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
        entityId: "foundation-footings",
        entityKind: "milestone",
        eyebrow: "Milestone",
        href: "/backoffice/builds/build-1?tab=milestones&milestone=foundation-footings",
        label: "Foundation & footings",
        searchTerms: ["foundation", "footings"],
        summary: "92% complete",
      },
      {
        entityId: "submilestone-1",
        entityKind: "submilestone",
        eyebrow: "Sub-milestone",
        href: "?tab=details&focus=submilestone%3Asubmilestone-1",
        label: "Excavate",
        searchTerms: ["foundation", "excavate"],
        summary: "Planned",
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

vi.mock("./CollaborationRichTextEditor.tsx", () => ({
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
}));

import {
  buildActionItemQueueHref,
  buildActionItemSheetHref,
  buildDetailTargetQueueHref,
  buildDetailTargetSheetHref,
  BuildCollaborationFeed,
  minimumScheduledPublicationTimestamp,
} from "./BuildCollaborationFeed";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: undefined,
  });
  cleanup();
  window.localStorage.clear();
  window.history.replaceState(window.history.state, "", "/");
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: true,
  });
  mocks.mutate.mockReset().mockResolvedValue(null);
  mocks.loadMore.mockClear();
  mocks.lifecycleState = "open";
  mocks.planningLifecycle = undefined;
  mocks.planningReconciliation = undefined;
  mocks.planningSnapshotStatus = "Exhausted";
  mocks.planningDiffStatus = "Exhausted";
  mocks.onOpenReference.mockClear();
  mocks.drafts = [];
  mocks.editorReferences = [];
  mocks.entityActionItems = [];
  mocks.personalActionItems = [];
  mocks.comments = [];
  mocks.commentsLoading = false;
  mocks.convexConnectionState = {
    connectionCount: 1,
    connectionRetries: 0,
    hasEverConnected: true,
    hasInflightRequests: false,
    inflightActions: 0,
    inflightMutations: 0,
    isWebSocketConnected: true,
    timeOfOldestInflightRequest: null,
  };
  mocks.acceptedCommentId = undefined;
  mocks.allQueriesUnavailable = false;
  mocks.actionItemAssignmentState = "unassigned";
  mocks.actionItemDetailId = "action-1";
  mocks.actionItemDetailState = "visible";
  mocks.actionItemAttachments = [];
  mocks.actionItemRequiresAcceptance = false;
  mocks.actionItemWorkKind = "ordinary";
  mocks.announcementExpiresAt = undefined;
  mocks.announcementProminent = false;
  mocks.authUserId = "user_admin";
  mocks.assetStatuses = [];
  mocks.buildActionItems = [];
  mocks.canonicalSystemActionItem = false;
  mocks.canonicalCanSubmitForReview = false;
  mocks.canonicalReviewState = "in_review";
  mocks.canonicalMilestoneReviewState = "in_review";
  mocks.canonicalParentReadyForApproval = false;
  mocks.feedStatus = "Exhausted";
  mocks.feedRows = [];
  mocks.feedQueryArgs = undefined;
  mocks.focusedAssetContext = undefined;
  mocks.focusedCommentContext = undefined;
  mocks.focusedPostContext = undefined;
  mocks.focusedReferenceContext = undefined;
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
  mocks.serverDraftIdentityWorkosUserId = "user_admin";
  mocks.searchResponse = { continueCursor: null, isDone: true, page: [] };
  mocks.canSchedule = false;
  mocks.workflowAssignmentMode = "direct";
  mocks.workflowCanAccept = false;
  mocks.viewerBinding = {
    buildId: "build-1",
    organizationId: "org-1",
    role: "admin",
    roles: ["admin"],
    workosUserId: "user_admin",
  };
  mocks.workflowTransitions = ["in_progress", "blocked", "cancelled"];
  searchAction.mockReset();
  offlineDraftMocks.deleteDraft.mockClear();
  offlineDraftMocks.loadDraft.mockReset().mockResolvedValue(null);
  offlineDraftMocks.saveDraft.mockReset();
});

describe("BuildCollaborationFeed", () => {
  test("keeps Action Item sheet URLs addressable without discarding other search state", () => {
    expect(
      buildActionItemSheetHref(
        "https://drawflow.test/builder/builds/build-1?tab=details&filter=mine",
        "action-9",
      ),
    ).toBe(
      "/builder/builds/build-1?tab=details&filter=mine&focus=actionItem%3Aaction-9",
    );
    expect(
      buildActionItemSheetHref(
        "https://drawflow.test/builder/builds/build-1?tab=details&focus=actionItem%3Aaction-9&filter=mine",
      ),
    ).toBe("/builder/builds/build-1?tab=details&filter=mine");
  });

  test.each([
    "/builder/builds/build-1",
    "/builder-staff/builds/build-1",
    "/contractor/builds/build-1",
    "/homeowner/builds/build-1",
  ])(
    "keeps canonical Sub-milestone navigation on the current role route %s",
    (pathname) => {
      const target = {
        companionId: "action-generated",
        kind: "submilestone" as const,
        submilestoneId:
          "submilestone-9" as Id<"buildSubmilestones">,
      };

      expect(
        buildDetailTargetSheetHref(
          `https://drawflow.test${pathname}?tab=details&filter=mine`,
          target,
        ),
      ).toBe(
        `${pathname}?tab=details&filter=mine&focus=submilestone%3Asubmilestone-9&detailTab=collaboration`,
      );
      expect(
        buildDetailTargetQueueHref(
          `https://drawflow.test${pathname}?tab=details&filter=mine`,
          "build-2",
          target,
        ),
      ).toBe(
        `${pathname.replace("build-1", "build-2")}?focus=submilestone%3Asubmilestone-9&detailTab=collaboration`,
      );
    },
  );

  test("renders the server-derived viewer binding for production persona verification", () => {
    render(<BuildCollaborationFeed buildId="build-1" organizationId="org-1" />);

    const feed = screen.getByTestId("build-collaboration-feed");
    expect(feed.getAttribute("data-build-id")).toBe("build-1");
    expect(feed.getAttribute("data-organization-id")).toBe("org-1");
    expect(feed.getAttribute("data-viewer-role")).toBe("admin");
    expect(feed.getAttribute("data-viewer-workos-user-id")).toBe("user_admin");
    expect(feed.classList.contains("build-collaboration-layout")).toBe(true);
    expect(feed.parentElement?.getAttribute("data-slot")).toBe("frame");
    expect(
      feed.parentElement?.classList.contains("build-collaboration-frame"),
    ).toBe(true);
    expect(feed.parentElement?.classList.contains("rounded-none")).toBe(true);
    expect(
      feed
        .querySelector(".build-collaboration-main")
        ?.getAttribute("data-slot"),
    ).toBeNull();
    expect(
      feed
        .querySelector('aside[aria-label="My collaboration work"]')
        ?.classList.contains("build-collaboration-rail"),
    ).toBe(true);
    expect(
      feed
        .querySelector('aside[aria-label="Build collaboration context"]')
        ?.classList.contains("build-collaboration-context-rail"),
    ).toBe(true);
  });

  test("renders Variant A Milestone System Post board and locks generated card workflow", () => {
    mocks.feedRows = [canonicalMilestoneSystemPostEntryFixture()];

    render(<BuildCollaborationFeed buildId="build-1" organizationId="org-1" />);

    expect(screen.getByTestId("system-post-experience")).toBeTruthy();
    expect(screen.getByText("Sub-milestones")).toBeTruthy();
    expect(screen.getByText("foundation · Foundation")).toBeTruthy();
    expect(screen.getAllByText("Excavate").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Behind Schedule").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: "Open Sub-milestone: Excavate" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Start Sub-milestone" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Complete Sub-milestone" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Approve Sub-milestone" }),
    ).toBeNull();
    expect(screen.queryByText("Builder evidence")).toBeNull();
    expect(screen.queryByText("Trades & suppliers")).toBeNull();
    expect(screen.getAllByText("System post").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Post actions" }));
    expect(screen.getByText("Edit post")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Action Items 1" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Show Action Items as a list" }),
    );
    expect(screen.getAllByText("Sub-milestone").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Behind Schedule").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Assignment required").length).toBeGreaterThan(
      0,
    );
    expect(screen.queryByRole("combobox", {
      name: "Status for Excavate",
    })).toBeNull();
    expect(
      screen.getByText(
        "Status follows the canonical Sub-milestone.",
      ),
    ).toBeTruthy();
  });

  test("shows builder Start and backoffice Approve on expanded Sub-milestone rows", () => {
    const builderEntry = canonicalMilestoneSystemPostEntryFixture() as {
      actionItems: Array<{
        systemPresentation: Record<string, unknown>;
      }>;
    };
    const presentation = builderEntry.actionItems[0]?.systemPresentation;
    expect(presentation).toBeTruthy();
    Object.assign(presentation!, {
      executionOwnership: {
        assigneeDisplayName: "Alex Builder",
        state: "assigned",
        viewerIsAssignee: true,
      },
      startCommand: {
        ...(presentation!.startCommand as Record<string, unknown>),
        allowed: true,
        denialReason: undefined,
      },
    });
    mocks.viewerBinding = {
      ...mocks.viewerBinding,
      role: "builder",
      roles: ["builder"],
      workosUserId: "user_builder",
    };
    mocks.feedRows = [builderEntry];
    window.history.replaceState(
      {},
      "",
      "/builder/builds/build-1?tab=collaboration",
    );

    const { unmount } = render(
      <BuildCollaborationFeed buildId="build-1" organizationId="org-1" />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Excavate/ }));
    expect(
      screen.getByRole("button", { name: "Start Sub-milestone" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Complete Sub-milestone" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Approve Sub-milestone" }),
    ).toBeNull();
    expect(screen.queryByText("Backoffice commands")).toBeNull();
    expect(screen.queryByText("Builder commands")).toBeNull();
    unmount();

    const dualRoleEntry = canonicalMilestoneSystemPostEntryFixture() as {
      actionItems: Array<{
        systemPresentation: Record<string, unknown>;
      }>;
    };
    const dualPresentation = dualRoleEntry.actionItems[0]?.systemPresentation;
    Object.assign(dualPresentation!, {
      executionOwnership: {
        assigneeDisplayName: "Alex Builder",
        state: "assigned",
        viewerIsAssignee: true,
      },
      startCommand: {
        ...(dualPresentation!.startCommand as Record<string, unknown>),
        allowed: true,
        denialReason: undefined,
      },
    });
    mocks.viewerBinding = {
      ...mocks.viewerBinding,
      role: "admin",
      roles: ["admin", "builder"],
      workosUserId: "user_admin_builder",
    };
    mocks.feedRows = [dualRoleEntry];
    window.history.replaceState(
      {},
      "",
      "/builder/builds/build-1?tab=collaboration",
    );
    const dual = render(
      <BuildCollaborationFeed buildId="build-1" organizationId="org-1" />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Excavate/ }));
    expect(
      screen.getByRole("button", { name: "Start Sub-milestone" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Approve Sub-milestone" }),
    ).toBeNull();
    expect(
      screen.queryByText(
        "You are not the assigned operator for this Sub-milestone.",
      ),
    ).toBeNull();
    dual.unmount();

    const adminOnlyEntry = canonicalMilestoneSystemPostEntryFixture() as {
      actionItems: Array<{
        systemPresentation: Record<string, unknown>;
      }>;
    };
    const adminPresentation = adminOnlyEntry.actionItems[0]?.systemPresentation;
    Object.assign(adminPresentation!, {
      executionOwnership: {
        state: "assignment_required",
        viewerIsAssignee: false,
      },
      startCommand: {
        ...(adminPresentation!.startCommand as Record<string, unknown>),
        allowed: true,
        denialReason: undefined,
      },
    });
    mocks.viewerBinding = {
      ...mocks.viewerBinding,
      role: "admin",
      roles: ["admin"],
      workosUserId: "user_admin_only",
    };
    mocks.feedRows = [adminOnlyEntry];
    window.history.replaceState(
      {},
      "",
      "/builder/builds/build-1?tab=collaboration",
    );
    const adminOnly = render(
      <BuildCollaborationFeed buildId="build-1" organizationId="org-1" />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Excavate/ }));
    const adminStart = screen.getByRole("button", {
      name: "Start Sub-milestone",
    });
    expect(adminStart).toBeTruthy();
    expect(adminStart.hasAttribute("disabled")).toBe(false);
    expect(
      screen.queryByText(
        "You are not the assigned operator for this Sub-milestone.",
      ),
    ).toBeNull();
    expect(
      screen.queryByText("You do not have Sub-milestone update permission."),
    ).toBeNull();
    adminOnly.unmount();

    const backofficeEntry = canonicalMilestoneSystemPostEntryFixture() as {
      actionItems: Array<{
        systemPresentation: Record<string, unknown>;
      }>;
    };
    const backofficePresentation =
      backofficeEntry.actionItems[0]?.systemPresentation;
    Object.assign(backofficePresentation!, {
      canApproveSubmilestone: true,
      column: "in_review",
      reviewDecisionState: "in_review",
      reviewRevision: 2,
      startCommand: {
        ...(backofficePresentation!.startCommand as Record<string, unknown>),
        allowed: false,
        denialReason: "already_started",
      },
    });
    mocks.viewerBinding = {
      ...mocks.viewerBinding,
      role: "admin",
      roles: ["admin", "builder"],
      workosUserId: "user_admin",
    };
    mocks.feedRows = [backofficeEntry];
    window.history.replaceState(
      {},
      "",
      "/backoffice/builds/build-1?tab=collaboration",
    );

    render(<BuildCollaborationFeed buildId="build-1" organizationId="org-1" />);
    fireEvent.click(screen.getByRole("button", { name: /Excavate/ }));
    expect(
      screen.getByRole("button", { name: "Approve Sub-milestone" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Start Sub-milestone" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Complete Sub-milestone" }),
    ).toBeNull();
    expect(screen.queryByText("Builder commands")).toBeNull();
    expect(screen.queryByText("Backoffice commands")).toBeNull();
    expect(
      screen.queryByText("Your role cannot start this Sub-milestone."),
    ).toBeNull();
  });

  test("orders a Site Visit with canonical Sub-milestone identity and Guidance", async () => {
    const entry = canonicalMilestoneSystemPostEntryFixture() as {
      actionItems: Array<{ systemPresentation: Record<string, unknown> }>;
    };
    Object.assign(entry.actionItems[0]!.systemPresentation, {
      canReview: true,
      siteVisitRequirement: {
        manualSignals: [],
        policySignals: [],
        required: true,
        riskSignals: [],
        status: "required",
      },
    });
    mocks.viewerBinding = {
      ...mocks.viewerBinding,
      role: "broker",
      roles: ["broker"],
      workosUserId: "user_broker",
    };
    mocks.authUserId = "user_broker";
    mocks.feedRows = [entry];

    render(<BuildCollaborationFeed buildId="build-1" organizationId="org-1" />);
    fireEvent.click(screen.getByRole("button", { name: /Excavate/ }));
    fireEvent.click(screen.getByRole("button", { name: "Order site visit" }));
    expect(screen.getByRole("dialog", { name: "Configure site visit" })).toBeTruthy();

    mocks.mutate.mockClear();
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm and order site visit" }),
    );

    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledTimes(1));
    expect(mocks.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        buildId: "build-1",
        milestoneKey: "foundation",
        submilestoneGuidanceSections: [
          expect.objectContaining({
            buildSubmilestoneId: "submilestone-1",
            proposalSubmilestoneId: "proposal-submilestone-1",
          }),
        ],
        submilestoneKeys: ["foundation-1"],
        workosOrganizationId: "org-1",
      }),
    );
  });

  test("explains revision-gated Sub-milestone controls before a refresh", () => {
    const entry = canonicalMilestoneSystemPostEntryFixture() as {
      actionItems: Array<{ systemPresentation: Record<string, unknown> }>;
    };
    const presentation = entry.actionItems[0]!.systemPresentation;
    delete presentation.workflowRevision;
    Object.assign(presentation, {
      canAddEvidence: true,
      canSubmitForReview: true,
      evidencePackageRevision: 1,
      evidencePackageRevisionId: "package-1",
      startCommand: {
        ...(presentation.startCommand as Record<string, unknown>),
        allowed: true,
        denialReason: undefined,
      },
    });
    mocks.viewerBinding = {
      ...mocks.viewerBinding,
      role: "builder",
      roles: ["builder"],
      workosUserId: "user_builder",
    };
    mocks.feedRows = [entry];
    window.history.replaceState(
      {},
      "",
      "/builder/builds/build-1?tab=collaboration",
    );

    render(<BuildCollaborationFeed buildId="build-1" organizationId="org-1" />);
    fireEvent.click(screen.getByRole("button", { name: /Excavate/ }));

    const reason =
      "Refresh this collaboration card; the canonical workflow revision is unavailable.";
    expect(screen.getAllByText(reason).length).toBeGreaterThanOrEqual(2);
    expect(
      screen.getByRole("button", { name: "Start Sub-milestone" }).hasAttribute(
        "disabled",
      ),
    ).toBe(true);
    expect(
      screen
        .getByRole("button", { name: "Complete Sub-milestone" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });

  test("freezes evidence with a stable key before submitting at the returned revision", async () => {
    const entry = canonicalMilestoneSystemPostEntryFixture() as {
      actionItems: Array<{ systemPresentation: Record<string, unknown> }>;
    };
    const presentation = entry.actionItems[0]!.systemPresentation;
    Object.assign(presentation, {
      canSubmitForReview: true,
      evidencePackageRevision: 1,
      evidencePackageRevisionId: "package-1",
      evidenceReviewState: "not_ready",
      startCommand: {
        ...(presentation.startCommand as Record<string, unknown>),
        allowed: false,
        denialReason: "already_started",
      },
    });
    mocks.viewerBinding = {
      ...mocks.viewerBinding,
      role: "builder",
      roles: ["builder"],
      workosUserId: "user_builder",
    };
    mocks.feedRows = [entry];
    mocks.mutate
      .mockReset()
      .mockResolvedValueOnce({ revision: 3 })
      .mockResolvedValueOnce({ revision: 4 });
    window.history.replaceState(
      {},
      "",
      "/builder/builds/build-1?tab=collaboration",
    );

    render(<BuildCollaborationFeed buildId="build-1" organizationId="org-1" />);
    fireEvent.click(screen.getByRole("button", { name: /Excavate/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "Complete Sub-milestone" }),
    );

    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledTimes(2));
    expect(mocks.mutate.mock.calls[0]?.[0]).toMatchObject({
      expectedRevision: 2,
      idempotencyKey: expect.stringMatching(/^evidence-freeze:/),
      packageRevisionId: "package-1",
      submilestoneKey: "foundation-1",
    });
    expect(mocks.mutate.mock.calls[1]?.[0]).toMatchObject({
      expectedRevision: 3,
      idempotencyKey: expect.stringMatching(/^completion-review:/),
      packageRevisionId: "package-1",
      submilestoneKey: "foundation-1",
    });
  });

  test("keeps canonical Milestone status transitions disabled in the detail sheet", async () => {
    mocks.canonicalSystemActionItem = true;
    mocks.feedRows = [canonicalMilestoneSystemPostEntryFixture()];

    render(<BuildCollaborationFeed buildId="build-1" organizationId="org-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Action Items 1" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Show Action Items as a list" }),
    );
    const actionCard = screen.getByRole("button", {
      name: "Open Action Item: Excavate",
    });
    expect(actionCard.getAttribute("aria-describedby")).toBeTruthy();
    expect(
      document.getElementById(actionCard.getAttribute("aria-describedby")!)
        ?.textContent,
    ).toContain("Behind Schedule · Assignment required");
    fireEvent.click(actionCard);

    const status = await screen.findByRole("combobox", {
      name: "Change Action Item status",
    });
    expect((status as HTMLSelectElement).disabled).toBe(true);
    expect(
      screen.getByText(
        "System · Milestone — status follows the canonical Sub-milestone.",
      ),
    ).toBeTruthy();
  });

  test("opens a generated companion in the unified Sub-milestone sheet", () => {
    mocks.canonicalSystemActionItem = true;
    mocks.feedRows = [canonicalMilestoneSystemPostEntryFixture()];
    const onOpenReference = vi.fn();

    render(
      <BuildCollaborationFeed
        buildId="build-1"
        onOpenReference={onOpenReference}
        organizationId="org-1"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Action Items 1" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Show Action Items as a list" }),
    );
    const actionCard = screen
      .getAllByRole("button", { name: "Open Sub-milestone: Excavate" })
      .find((button) => button.hasAttribute("aria-describedby"));
    expect(actionCard).toBeTruthy();
    if (!actionCard) {
      throw new Error("Expected the Collaboration Sub-milestone card.");
    }
    expect(actionCard.getAttribute("aria-describedby")).toBeTruthy();
    expect(
      document.getElementById(actionCard.getAttribute("aria-describedby")!)
        ?.getAttribute("aria-label"),
    ).toBe("Behind Schedule · Assignment required");
    fireEvent.click(actionCard);

    expect(onOpenReference).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: "submilestone-1",
        entityKind: "submilestone",
        href: expect.stringContaining(
          "focus=submilestone%3Asubmilestone-1&detailTab=collaboration",
        ),
      }),
    );
    expect(
      screen.queryByRole("combobox", { name: "Change Action Item status" }),
    ).toBeNull();
  });

  test("updates canonical Sub-milestone focus when no route callback is provided", () => {
    mocks.canonicalSystemActionItem = true;
    mocks.feedRows = [canonicalMilestoneSystemPostEntryFixture()];
    window.history.replaceState(
      window.history.state,
      "",
      "/builder/builds/build-1?tab=details&filter=mine",
    );

    render(<BuildCollaborationFeed buildId="build-1" organizationId="org-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Action Items 1" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Show Action Items as a list" }),
    );
    const actionCard = screen
      .getAllByRole("button", { name: "Open Sub-milestone: Excavate" })
      .find((button) => button.hasAttribute("aria-describedby"));
    if (!actionCard) {
      throw new Error("Expected the Collaboration Sub-milestone card.");
    }
    fireEvent.click(actionCard);

    expect(`${window.location.pathname}${window.location.search}`).toBe(
      "/builder/builds/build-1?tab=details&filter=mine&focus=submilestone%3Asubmilestone-1&detailTab=collaboration",
    );
  });

  test("uses the same feed for Active operations and renders archived historical facts as read-only", () => {
    const activeEntry = canonicalMilestoneSystemPostEntryFixture() as any;
    activeEntry.post._id = "active-system-post";
    activeEntry.revision.plainText = "Active canonical milestone operation.";
    activeEntry.revision.tiptapJson = JSON.stringify({
      content: [
        {
          content: [{ text: activeEntry.revision.plainText, type: "text" }],
          type: "paragraph",
        },
      ],
      type: "doc",
    });
    const archivedEntry = canonicalMilestoneSystemPostEntryFixture() as any;
    archivedEntry.post._id = "archived-backfilled-post";
    archivedEntry.post.threadState = "resolved";
    archivedEntry.post.resolutionSummary = "Canonical milestone is complete.";
    archivedEntry.post.revision = 2;
    archivedEntry.post.systemPost = {
      ...archivedEntry.post.systemPost,
      historicalBackfill: {
        materializedAt: Date.parse("2026-08-03T12:05:00.000Z"),
        source: "existing_records",
        unknownFacts: ["start", "actor", "evidence", "review", "approval"],
      },
      lifecycle: "resolved",
    };
    archivedEntry.revision.plainText = "Historical canonical milestone record.";
    archivedEntry.revision.tiptapJson = JSON.stringify({
      content: [
        {
          content: [{ text: archivedEntry.revision.plainText, type: "text" }],
          type: "paragraph",
        },
      ],
      type: "doc",
    });
    mocks.lifecycleState = "closed";
    mocks.feedRows = [activeEntry, archivedEntry];

    render(<BuildCollaborationFeed buildId="build-1" organizationId="org-1" />);

    expect(mocks.feedQueryArgs).toMatchObject({
      buildId: "build-1",
      filter: "all",
      organizationId: "org-1",
    });
    expect(screen.getByText("Historical backfill")).toBeTruthy();
    expect(screen.getByText(/Unknown historical facts:/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Active operations" }));
    expect(mocks.feedQueryArgs).toMatchObject({ filter: "active_operations" });
    expect(
      screen.getByText("Active canonical milestone operation."),
    ).toBeTruthy();
    expect(
      screen.queryByText("Historical canonical milestone record."),
    ).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "All" }));
    const archivedCard = screen.getByTestId(
      "collaboration-post-archived-backfilled-post",
    );
    fireEvent.click(
      within(archivedCard).getByRole("button", { name: "Post actions" }),
    );
    expect(within(archivedCard).queryByText("Edit post")).toBeNull();
    fireEvent.click(
      within(archivedCard).getByRole("button", { name: "Discussion 0" }),
    );
    expect(
      within(archivedCard).getByText(
        /archived discussion is available to read/i,
      ),
    ).toBeTruthy();
    expect(
      within(archivedCard).queryByRole("button", { name: "Write a reply…" }),
    ).toBeNull();
    expect(
      within(archivedCard).queryByRole("button", { name: "agree" }),
    ).toBeNull();
  });

  test("keeps server restricted placeholders in Active operations", () => {
    const activeEntry = canonicalMilestoneSystemPostEntryFixture();
    mocks.feedRows = [
      {
        kind: "restricted",
        placeholderKey: "restricted-active-operation",
      },
      activeEntry,
    ];

    render(<BuildCollaborationFeed buildId="build-1" organizationId="org-1" />);

    fireEvent.click(screen.getByRole("tab", { name: "Active operations" }));

    expect(screen.getByText("Restricted update")).toBeTruthy();
    expect(
      screen.getByText(
        "Foundation started. Canonical Sub-milestone cards are synchronized.",
      ),
    ).toBeTruthy();
  });

  test("renders live Draw facts and an explicit absence of generated work or a Draw board", () => {
    mocks.feedRows = [canonicalDrawSystemPostEntryFixture()];

    render(<BuildCollaborationFeed buildId="build-1" organizationId="org-1" />);

    expect(screen.getAllByText("System post").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Draw").length).toBeGreaterThan(0);
    expect(screen.getByTestId("system-post-draw-facts")).toBeTruthy();
    expect(screen.getByText("Canonical Draw lifecycle")).toBeTruthy();
    expect(
      screen.getAllByText("Foundation reimbursement").length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("Evidence · Location unverified")).toBeTruthy();
    expect(screen.getByText("Site Visits · 1")).toBeTruthy();
    expect(
      screen.getByText(
        "No generated Action Items or Draw board. Discussion remains available; all workflow commands stay in the canonical Draw surfaces.",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Action Items/ })).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Show Action Items as a board/ }),
    ).toBeNull();
  });

  test("surfaces a conservative lower bound when the Draw working audience is saturated", () => {
    mocks.feedRows = [
      canonicalDrawSystemPostEntryFixture({
        coordination: {
          canJoin: false,
          canLeave: false,
          eligible: true,
          joined: false,
          oversight: false,
          workingAudienceCount: 100,
          workingAudienceTruncated: true,
        },
      }),
    ];

    render(<BuildCollaborationFeed buildId="build-1" organizationId="org-1" />);

    expect(screen.getByText("Working audience · 100+")).toBeTruthy();
    expect(
      screen.getByTestId("draw-coordination-audience-truncated"),
    ).toBeTruthy();
  });

  test("keeps a Draw System Post on its kind branch when Draw facts are unavailable", () => {
    const entry = canonicalDrawSystemPostEntryFixture();
    delete (entry.post.systemPost as { drawFacts?: unknown }).drawFacts;
    mocks.feedRows = [entry];

    render(<BuildCollaborationFeed buildId="build-1" organizationId="org-1" />);

    expect(
      screen.getByTestId("system-post-draw-facts-unavailable"),
    ).toBeTruthy();
    expect(screen.queryByTestId("system-post-planning-summary")).toBeNull();
    expect(screen.queryByTestId("system-post-planning-comparison")).toBeNull();
  });

  test("keeps planning branches on a non-Draw System Post even if Draw facts are present", () => {
    const entry = canonicalMilestoneSystemPostEntryFixture();
    (entry.post.systemPost as { drawFacts?: unknown }).drawFacts = {};
    mocks.feedRows = [entry];
    mocks.planningReconciliation = planningReconciliationFixture();

    render(<BuildCollaborationFeed buildId="build-1" organizationId="org-1" />);

    expect(screen.getByTestId("system-post-planning-summary")).toBeTruthy();
    expect(screen.getByTestId("system-post-planning-comparison")).toBeTruthy();
    expect(screen.queryByTestId("system-post-draw-facts")).toBeNull();
  });

  test("lets eligible internal readers join and create ordinary Draw coordination work", async () => {
    mocks.feedRows = [
      canonicalDrawSystemPostEntryFixture({
        coordination: {
          canJoin: true,
          canLeave: false,
          eligible: true,
          joined: false,
          oversight: false,
          workingAudienceCount: 2,
        },
      }),
    ];

    render(<BuildCollaborationFeed buildId="build-1" organizationId="org-1" />);

    expect(screen.getByText("Working audience · 2")).toBeTruthy();
    mocks.mutate.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Join coordination" }));
    await waitFor(() =>
      expect(mocks.mutate).toHaveBeenCalledWith({
        buildId: "build-1",
        organizationId: "org-1",
        postId: "draw-system-post-1",
      }),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Add coordination Action Item" }),
    );
    expect(
      screen.getByRole("heading", { name: "Create accountable work" }),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Action Item title"), {
      target: { value: "Coordinate Draw evidence" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Mock Action Item description" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Create Action Item" }));
    await waitFor(() =>
      expect(mocks.mutate).toHaveBeenCalledWith(
        expect.objectContaining({
          buildId: "build-1",
          organizationId: "org-1",
          postId: "draw-system-post-1",
          title: "Coordinate Draw evidence",
        }),
      ),
    );
  });

  test("lets an explicit coordination member leave while keeping ordinary follow independent", async () => {
    mocks.feedRows = [
      canonicalDrawSystemPostEntryFixture({
        coordination: {
          canJoin: false,
          canLeave: true,
          eligible: true,
          joined: true,
          oversight: false,
          workingAudienceCount: 1,
        },
      }),
    ];

    render(<BuildCollaborationFeed buildId="build-1" organizationId="org-1" />);

    expect(
      screen.getByRole("button", { name: "Leave coordination" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Post actions" }));
    expect(
      screen.getByRole("menuitem", { name: "Follow thread" }),
    ).toBeTruthy();
    mocks.mutate.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Leave coordination" }));
    await waitFor(() =>
      expect(mocks.mutate).toHaveBeenCalledWith({
        buildId: "build-1",
        organizationId: "org-1",
        postId: "draw-system-post-1",
      }),
    );
  });

  test.each(["admin", "principal-broker"] as const)(
    "shows silent oversight for %s without joining or creating coordination work",
    (role) => {
      mocks.viewerBinding = {
        buildId: "build-1",
        organizationId: "org-1",
        role,
        workosUserId: `user_${role}`,
      };
      mocks.feedRows = [
        canonicalDrawSystemPostEntryFixture({
          coordination: {
            canJoin: true,
            canLeave: true,
            eligible: true,
            joined: false,
            oversight: true,
            workingAudienceCount: 0,
          },
        }),
      ];

      render(
        <BuildCollaborationFeed buildId="build-1" organizationId="org-1" />,
      );

      expect(screen.getByText("Oversight only")).toBeTruthy();
      expect(
        screen.queryByRole("button", { name: "Join coordination" }),
      ).toBeNull();
      expect(
        screen.queryByRole("button", { name: "Leave coordination" }),
      ).toBeNull();
      expect(
        screen.queryByRole("button", { name: "Add coordination Action Item" }),
      ).toBeNull();
    },
  );

  test("keeps external Draw readers on canonical facts without a discussion tab or deep-link actions", () => {
    mocks.viewerBinding = {
      buildId: "build-1",
      organizationId: "org-1",
      role: "broker",
      workosUserId: "user_external",
    };
    mocks.feedRows = [
      canonicalDrawSystemPostEntryFixture({
        coordination: {
          canJoin: false,
          canLeave: false,
          eligible: false,
          joined: false,
          oversight: false,
          workingAudienceCount: 0,
        },
      }),
    ];

    render(<BuildCollaborationFeed buildId="build-1" organizationId="org-1" />);

    expect(
      screen.getByText(
        "Canonical Draw facts remain visible. Internal coordination, discussion, and related work are restricted to eligible Build participants.",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Discussion/ })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Add coordination Action Item" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Post actions" })).toBeNull();
  });

  test.each(["broker", "builder"] as const)(
    "uses the dedicated admin System Post edit capability for %s readers",
    (role) => {
      const entry = canonicalMilestoneSystemPostEntryFixture();
      entry.post.revision = 2;
      entry.post.readRevision = 2;
      entry.post.viewerCanEdit = false;
      entry.post.viewerCanManageThread = true;
      mocks.viewerBinding = {
        buildId: "build-1",
        organizationId: "org-1",
        role,
        workosUserId: `user_${role}`,
      };
      mocks.authUserId = `user_${role}`;
      mocks.feedRows = [entry];

      render(
        <BuildCollaborationFeed buildId="build-1" organizationId="org-1" />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Post actions" }));
      expect(
        screen.getByRole("menuitem", { name: "View revision history" }),
      ).toBeTruthy();
      expect(screen.queryByRole("menuitem", { name: "Edit post" })).toBeNull();
    },
  );

  test("keeps hidden Draw coordination controls and edit authority out of the post surface", async () => {
    const entry = canonicalDrawSystemPostEntryFixture({
      coordination: {
        canJoin: false,
        canLeave: false,
        eligible: false,
        joined: false,
        oversight: false,
        workingAudienceCount: 0,
      },
    });
    entry.post.revision = 2;
    entry.post.readRevision = 2;
    entry.post.viewerIsAuthor = true;
    mocks.feedRows = [entry];

    render(<BuildCollaborationFeed buildId="build-1" organizationId="org-1" />);

    expect(
      screen.queryByRole("button", { name: "Add coordination Action Item" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Post actions" }));
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "View revision history" }),
    );
    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: "Revision history",
      }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save revision" })).toBeNull();
  });

  test("disables Draw coordination controls in an archived Build", () => {
    mocks.lifecycleState = "closed";
    mocks.feedRows = [
      canonicalDrawSystemPostEntryFixture({
        coordination: {
          canJoin: true,
          canLeave: false,
          eligible: true,
          joined: false,
          oversight: false,
          workingAudienceCount: 1,
        },
      }),
    ];

    render(<BuildCollaborationFeed buildId="build-1" organizationId="org-1" />);

    expect(
      screen.getByTestId("build-collaboration-read-only-banner"),
    ).toBeTruthy();
    const join = screen.getByRole("button", { name: "Join coordination" });
    const create = screen.getByRole("button", {
      name: "Add coordination Action Item",
    });
    expect(
      join.getAttribute("data-disabled") ?? join.getAttribute("disabled"),
    ).not.toBeNull();
    expect(
      create.getAttribute("data-disabled") ?? create.getAttribute("disabled"),
    ).not.toBeNull();
    mocks.mutate.mockClear();
    fireEvent.click(join);
    fireEvent.click(create);
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  test("renders mixed canonical planning counts and typed activation/current changes", () => {
    const entry = canonicalMilestoneSystemPostEntryFixture();
    entry.post.planningSummary.counts.superseded = 1;
    entry.post.systemPost.currentPlanningRevision = 3;
    mocks.feedRows = [entry];
    mocks.planningReconciliation = planningReconciliationFixture();

    render(<BuildCollaborationFeed buildId="build-1" organizationId="org-1" />);

    expect(screen.getByTestId("system-post-planning-summary")).toBeTruthy();
    expect(screen.getByText("Open")).toBeTruthy();
    expect(screen.getByText("In progress")).toBeTruthy();
    expect(screen.getByText("Superseded")).toBeTruthy();
    expect(screen.getByText("Assignment gaps · 1")).toBeTruthy();
    expect(screen.getByText("Required site visits · 1")).toBeTruthy();
    expect(screen.getByText("Not ready for approval")).toBeTruthy();

    expect(screen.getByTestId("system-post-planning-comparison")).toBeTruthy();
    expect(screen.getByText("Changed since activation")).toBeTruthy();
    expect(screen.getByText("Activation revision")).toBeTruthy();
    expect(screen.getByText("Current revision")).toBeTruthy();
    expect(screen.getByText("v1")).toBeTruthy();
    expect(screen.getByText("v3")).toBeTruthy();
    expect(screen.getByText("Schedule")).toBeTruthy();
    expect(screen.getByText("Assignments")).toBeTruthy();
    expect(screen.getByText("Structured changes · 2")).toBeTruthy();
  });

  test("surfaces when the planning diff window is truncated", () => {
    mocks.feedRows = [canonicalMilestoneSystemPostEntryFixture()];
    mocks.planningReconciliation = planningReconciliationFixture({
      truncated: true,
    });

    render(<BuildCollaborationFeed buildId="build-1" organizationId="org-1" />);

    expect(
      screen.getByTestId("planning-diffs-truncated").textContent,
    ).toContain("Structured planning diffs are truncated at 10,000 changes");
  });

  test.each([
    {
      diffStatus: "Exhausted" as const,
      name: "canonical server truncation",
      truncated: true,
      expectMore: false,
      expectTruncated: true,
    },
    {
      diffStatus: "CanLoadMore" as const,
      name: "client pagination",
      truncated: false,
      expectMore: true,
      expectTruncated: false,
    },
    {
      diffStatus: "CanLoadMore" as const,
      name: "both canonical and client truncation",
      truncated: true,
      expectMore: true,
      expectTruncated: true,
    },
  ])(
    "keeps $name planning status independent",
    ({ diffStatus, expectMore, expectTruncated, truncated }) => {
      mocks.feedRows = [canonicalMilestoneSystemPostEntryFixture()];
      mocks.planningDiffStatus = diffStatus;
      mocks.planningReconciliation = planningReconciliationFixture({
        truncated,
      });

      render(
        <BuildCollaborationFeed buildId="build-1" organizationId="org-1" />,
      );

      expect(screen.queryByTestId("planning-diffs-truncated") !== null).toBe(
        expectTruncated,
      );
      expect(
        screen.queryByTestId("planning-diffs-more-available") !== null,
      ).toBe(expectMore);
      if (expectMore) {
        expect(
          screen.getByRole("button", { name: "Load more changes" }),
        ).toBeTruthy();
      } else {
        expect(
          screen.queryByRole("button", { name: "Load more changes" }),
        ).toBeNull();
      }
    },
  );

  test("does not turn an empty client diff page into an indeterminate canonical result", () => {
    const reconciliation = planningReconciliationFixture();
    reconciliation.diffs = [];
    mocks.feedRows = [canonicalMilestoneSystemPostEntryFixture()];
    mocks.planningDiffStatus = "CanLoadMore";
    mocks.planningReconciliation = reconciliation;

    render(<BuildCollaborationFeed buildId="build-1" organizationId="org-1" />);

    expect(screen.getByTestId("planning-diffs-more-available")).toBeTruthy();
    expect(screen.queryByTestId("planning-diffs-indeterminate")).toBeNull();
    expect(
      screen.queryByText(
        "No structured planning changes are recorded after activation.",
      ),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Load more changes" }));
    expect(mocks.loadMore).toHaveBeenCalledWith(100);
  });

  test("keeps a loading-more client page distinct from canonical truncation", () => {
    mocks.feedRows = [canonicalMilestoneSystemPostEntryFixture()];
    mocks.planningDiffStatus = "LoadingMore";
    mocks.planningReconciliation = planningReconciliationFixture();

    render(<BuildCollaborationFeed buildId="build-1" organizationId="org-1" />);

    expect(
      screen.getByTestId("planning-diffs-more-available").textContent,
    ).toContain("Loading more structured planning changes");
    expect(screen.queryByTestId("planning-diffs-truncated")).toBeNull();
  });

  test("distinguishes truncated revision history from a complete empty diff set", () => {
    const reconciliation = planningReconciliationFixture();
    reconciliation.diffs = [];
    reconciliation.revisionsTruncated = true;
    mocks.feedRows = [canonicalMilestoneSystemPostEntryFixture()];
    mocks.planningReconciliation = reconciliation;

    render(<BuildCollaborationFeed buildId="build-1" organizationId="org-1" />);

    expect(
      screen.getByTestId("planning-revisions-truncated").textContent,
    ).toContain("Only the latest 100 planning revisions are shown");
    expect(
      screen.getByText(
        "No structured planning changes are recorded after activation.",
      ),
    ).toBeTruthy();
  });

  test("treats an empty truncated diff window as indeterminate", () => {
    const reconciliation = planningReconciliationFixture({ truncated: true });
    reconciliation.diffs = [];
    mocks.feedRows = [canonicalMilestoneSystemPostEntryFixture()];
    mocks.planningReconciliation = reconciliation;

    render(<BuildCollaborationFeed buildId="build-1" organizationId="org-1" />);

    expect(screen.getByTestId("planning-diffs-indeterminate")).toBeTruthy();
    expect(
      screen.queryByText(
        "No structured planning changes are recorded after activation.",
      ),
    ).toBeNull();
  });

  test("shows a loading comparison badge while structured reconciliation is unresolved", () => {
    const entry = canonicalMilestoneSystemPostEntryFixture();
    entry.post.systemPost = {
      ...entry.post.systemPost,
      currentPlanningRevision: 3,
    };
    mocks.feedRows = [entry];

    render(<BuildCollaborationFeed buildId="build-1" organizationId="org-1" />);

    expect(screen.getByText("Loading comparison…")).toBeTruthy();
    expect(screen.queryByText("Changed since activation")).toBeNull();
    expect(screen.queryByText("Matches activation")).toBeNull();
    expect(
      screen.getByText("Loading structured planning changes…"),
    ).toBeTruthy();
  });

  test("treats a missing milestone binding as indeterminate planning data", () => {
    const entry = canonicalMilestoneSystemPostEntryFixture();
    delete (entry.post.systemPost as { milestoneKey?: string }).milestoneKey;
    mocks.feedRows = [entry];
    mocks.planningReconciliation = planningReconciliationFixture();

    render(<BuildCollaborationFeed buildId="build-1" organizationId="org-1" />);

    expect(screen.getByTestId("planning-diffs-indeterminate")).toBeTruthy();
    expect(
      screen.getByText(
        "Structured planning changes cannot be determined because the available diff window is truncated. The canonical planning record remains authoritative.",
      ),
    ).toBeTruthy();
    expect(
      screen.queryByText(
        "No structured planning changes are recorded after activation.",
      ),
    ).toBeNull();
    expect(screen.queryByText(/Structured changes ·/)).toBeNull();
  });

  test("keeps restricted planning reconciliation fields out of a Contractor System Post", () => {
    const entry = canonicalMilestoneSystemPostEntryFixture();
    entry.post.planningSummary.counts.superseded = 1;
    mocks.feedRows = [entry];
    mocks.viewerBinding = {
      buildId: "build-1",
      organizationId: "org-1",
      role: "contractor",
      workosUserId: "user_contractor",
    };
    mocks.authUserId = "user_contractor";
    mocks.planningReconciliation = planningReconciliationFixture({
      restricted: true,
    });

    render(<BuildCollaborationFeed buildId="build-1" organizationId="org-1" />);

    expect(screen.getByText("Schedule")).toBeTruthy();
    expect(screen.queryByText("Assignments")).toBeNull();
    expect(screen.queryByText("Budget")).toBeNull();
    expect(screen.queryByText("Draw")).toBeNull();
  });

  test("surfaces resolved and reopened lifecycle state on the same System Post", () => {
    mocks.planningLifecycle = "resolved";
    mocks.postThreadState = "resolved";
    mocks.postResolutionSummary = "Milestone approved by Lender Admin.";
    mocks.feedRows = [canonicalMilestoneSystemPostEntryFixture()];

    const { rerender } = render(
      <BuildCollaborationFeed buildId="build-1" organizationId="org-1" />,
    );

    expect(screen.getAllByText("Resolved").length).toBeGreaterThan(0);
    expect(
      screen.getByText("Milestone approved by Lender Admin."),
    ).toBeTruthy();

    mocks.planningLifecycle = "reopened";
    mocks.postThreadState = "open";
    mocks.postResolutionSummary = undefined;
    mocks.feedRows = [canonicalMilestoneSystemPostEntryFixture()];
    rerender(
      <BuildCollaborationFeed buildId="build-1" organizationId="org-1" />,
    );

    expect(screen.getAllByText("Reopened").length).toBeGreaterThan(0);
    expect(screen.queryByText("Resolved")).toBeNull();
  });

  test("distills list Action Items into a clickable card with compact metadata", () => {
    render(<BuildCollaborationFeed buildId="build-1" organizationId="org-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Action Items 1" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Show Action Items as a list" }),
    );

    const actionItemCard = screen.getByRole("button", {
      name: "Open Action Item: Upload engineer seal",
    });
    expect(actionItemCard.getAttribute("data-slot")).toBe("card");
    expect(
      actionItemCard.querySelector('[aria-label="Assignee: Priya Raman"]'),
    ).toBeTruthy();
    expect(within(actionItemCard).getByText("Blocked by 2")).toBeTruthy();
    expect(within(actionItemCard).getByText("Blocking 1")).toBeTruthy();
    expect(
      within(actionItemCard).getByLabelText("2 unread comments"),
    ).toBeTruthy();
    expect(
      within(actionItemCard).getByLabelText("1 other unread updates"),
    ).toBeTruthy();
    expect(screen.queryByText("Assignee")).toBeNull();
    expect(screen.queryByRole("button", { name: "Open details" })).toBeNull();
    expect(
      screen.getByRole("combobox", {
        name: "Status for Upload engineer seal",
      }),
    ).toBeTruthy();
  });

  test("uses the board column as status context and opens the whole Action Item card", async () => {
    render(<BuildCollaborationFeed buildId="build-1" organizationId="org-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Action Items 1" }));
    expect(
      screen.queryByRole("combobox", {
        name: "Status for Upload engineer seal",
      }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Open details" })).toBeNull();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Open Action Item: Upload engineer seal",
      }),
    );

    expect(await screen.findByText("Structured work")).toBeTruthy();
  });

  test("contains the wide Action Item board inside its own horizontal scroller", () => {
    render(<BuildCollaborationFeed buildId="build-1" organizationId="org-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Action Items 1" }));
    const count = screen.getByText("1 Action Item anchored to this post");
    const boardSection = count.closest("section");
    const scroller = boardSection?.querySelector(":scope > div.max-w-full");
    const board = scroller?.firstElementChild;

    expect(boardSection?.className).toContain("min-w-0");
    expect(scroller?.className).toContain("overflow-x-auto");
    expect(board?.className).toContain("min-w-[68rem]");
    expect(board?.className).not.toContain("overflow-x-auto");
  });

  test("contains feed filters in their own mobile horizontal scroller", () => {
    render(<BuildCollaborationFeed buildId="build-1" organizationId="org-1" />);

    const filters = screen.getByRole("tablist", { name: "Feed filters" });
    expect(filters.className).toContain("max-w-full");
    expect(filters.className).toContain("overflow-x-auto");
    expect(filters.className).toContain("justify-start");
  });

  test("restores the last browser-only Action Item view preference", () => {
    window.localStorage.setItem(
      "drawflow:build-collaboration:action-item-view",
      "list",
    );
    render(<BuildCollaborationFeed buildId="build-1" organizationId="org-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Action Items 1" }));
    expect(
      screen.getByRole("combobox", {
        name: "Status for Upload engineer seal",
      }),
    ).toBeTruthy();
  });

  test("keeps shared controls closed until the Build lifecycle resolves", () => {
    mocks.allQueriesUnavailable = true;
    render(<BuildCollaborationFeed buildId="build-1" organizationId="org-1" />);

    expect(screen.getByText("Loading collaboration access…")).toBeTruthy();
    expect(
      screen.queryByRole("button", {
        name: "What should people involved in this Build know?",
      }),
    ).toBeNull();
  });

  test("renders a closed Build as a readable archive without shared mutation controls", () => {
    mocks.lifecycleState = "closed";
    mocks.postViewerCanModerate = true;
    render(<BuildCollaborationFeed buildId="build-1" organizationId="org-1" />);

    expect(screen.getByText("Collaboration is read-only")).toBeTruthy();
    expect(
      screen.queryByRole("button", {
        name: "What should people involved in this Build know?",
      }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Post actions" }));
    expect(
      screen.getByRole("menuitem", { name: "Save privately" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("menuitem", { name: "Pin for Build" }),
    ).toBeNull();
    expect(
      screen.queryByRole("menuitem", { name: "Moderate content" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Discussion/ }));
    expect(
      screen.getByText(/archived discussion is available to read/i),
    ).toBeTruthy();
  });

  test("keeps structured Action Item work readable but immutable in a closed Build", async () => {
    mocks.lifecycleState = "closed";
    render(<BuildCollaborationFeed buildId="build-1" organizationId="org-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Action Items 1" }));
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Open Action Item: Upload engineer seal",
      }),
    );

    expect(await screen.findByText("Structured work")).toBeTruthy();
    const archivedChecklist = screen.getByLabelText(
      "Mark Confirm file naming complete",
    );
    expect(archivedChecklist.getAttribute("data-disabled")).not.toBeNull();
    mocks.mutate.mockClear();
    fireEvent.click(archivedChecklist);
    expect(mocks.mutate).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "Add child Action Item" }),
    ).toBeNull();
    expect(screen.queryByLabelText("New checklist step")).toBeNull();
    expect(screen.queryByRole("button", { name: "Restore" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Link" })).toBeNull();
  });

  test("records a seen receipt only after half the post stays visible for one continuous second", async () => {
    vi.useFakeTimers();
    let deliverIntersection:
      | ((entries: Array<Partial<IntersectionObserverEntry>>) => void)
      | undefined;
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback: IntersectionObserverCallback) {
          deliverIntersection = (entries) =>
            callback(entries as IntersectionObserverEntry[], this as never);
        }
        disconnect() {}
        observe() {}
        takeRecords() {
          return [];
        }
        unobserve() {}
        root = null;
        rootMargin = "0px";
        thresholds = [0.5];
      },
    );
    render(<BuildCollaborationFeed buildId="build-1" organizationId="org-1" />);
    expect(mocks.mutate).not.toHaveBeenCalled();

    act(() => {
      deliverIntersection?.([{ intersectionRatio: 0.5, isIntersecting: true }]);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(999);
    });
    expect(mocks.mutate).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(mocks.mutate).toHaveBeenCalledWith({
      buildId: "build-1",
      organizationId: "org-1",
      postId: "post-1",
    });
  });

  test("advertises a whole-minute schedule boundary beyond the server minimum", () => {
    const now = Date.parse("2026-08-01T12:34:30.500Z");
    const minimum = minimumScheduledPublicationTimestamp(now);

    expect(minimum).toBe(Date.parse("2026-08-01T12:36:00.000Z"));
    expect(minimum - now).toBeGreaterThan(60_000);
    expect(minimum % 60_000).toBe(0);
  });

  test("exposes digest cadence and email delivery controls", async () => {
    render(<BuildCollaborationFeed buildId="build-1" organizationId="org-1" />);

    expect(
      screen.getByRole("combobox", { name: "Activity digest" }),
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
      }),
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
    render(<BuildCollaborationFeed buildId="build-1" organizationId="org-1" />);

    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "Push off" }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
    fireEvent.click(screen.getByRole("button", { name: "Push off" }));

    await waitFor(() =>
      expect(mocks.mutate).toHaveBeenCalledWith({
        auth: "AQI",
        buildId: "build-1",
        endpoint: "https://push.example.test/browser-subscription",
        organizationId: "org-1",
        p256dh: "AwQ",
      }),
    );
    expect(register).toHaveBeenCalledWith("/build-collaboration-push-sw.js");
    expect(subscribe).toHaveBeenCalledWith(
      expect.objectContaining({ userVisibleOnly: true }),
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

    render(<BuildCollaborationFeed buildId="build-1" organizationId="org-1" />);

    expect(
      await screen.findByRole("button", { name: "Push off" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Push on" })).toBeNull();
  });

  test("expires an Announcement badge when wall-clock time advances without a query write", () => {
    vi.useFakeTimers();
    const now = Date.parse("2026-07-30T12:00:00.000Z");
    vi.setSystemTime(now);
    mocks.announcementExpiresAt = now + 30_000;
    mocks.announcementProminent = true;
    mocks.postType = "announcement";
    render(<BuildCollaborationFeed buildId="build-1" organizationId="org-1" />);

    expect(screen.getByText("Prominent")).toBeTruthy();
    act(() => vi.advanceTimersByTime(30_001));
    expect(screen.getByText("Prominence expired")).toBeTruthy();
  });

  test("keeps restricted posts opaque and filters to followed threads", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    render(<BuildCollaborationFeed buildId="build-1" organizationId="org-1" />);

    expect(screen.getAllByText("Restricted update")).toHaveLength(2);
    expect(screen.queryByText(/Alex Chen.*restricted/i)).toBeNull();

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

  test("opens a Sub-milestone reference in its unified detail sheet", () => {
    const entry = focusedPostEntryFixture(
      "post-submilestone-reference",
      "Excavation is ready to start.",
    );
    entry.references = [
      {
        _id: "reference-submilestone-1",
        entityId: "submilestone-1",
        entityKind: "submilestone",
        labelSnapshot: "Excavate",
        summarySnapshot: "Planned",
      },
    ];
    mocks.feedRows = [entry];

    render(
      <BuildCollaborationFeed
        buildId="build-1"
        onOpenReference={mocks.onOpenReference}
        organizationId="org-1"
      />,
    );

    fireEvent.click(screen.getByText("Excavate"));

    expect(mocks.onOpenReference).toHaveBeenCalledWith({
      entityId: "submilestone-1",
      entityKind: "submilestone",
      href: "?tab=details&focus=submilestone%3Asubmilestone-1",
    });
    expect(
      screen.queryByTestId("build-collaboration-focused-reference"),
    ).toBeNull();
  });

  test("clears cached reference metadata immediately when exact access is revoked", async () => {
    mocks.focusedReferenceContext = {
      reference: {
        entityId: "evidence-1",
        entityKind: "evidenceAsset",
        eyebrow: "Evidence",
        href: "/backoffice/builds/build-1?tab=evidence&evidence=evidence-1",
        label: "Foundation completion photo",
        searchTerms: ["foundation", "photo"],
        summary: "Location verified · uploaded today",
      },
      state: "visible",
    };
    const { rerender } = render(
      <BuildCollaborationFeed
        buildId="build-1"
        focusedReference="evidenceAsset:evidence-1"
        organizationId="org-1"
      />,
    );

    expect(
      await screen.findByRole("heading", {
        name: "Foundation completion photo",
      }),
    ).toBeTruthy();

    mocks.focusedReferenceContext = { state: "revoked" };
    rerender(
      <BuildCollaborationFeed
        buildId="build-1"
        focusedReference="evidenceAsset:evidence-1"
        organizationId="org-1"
      />,
    );

    await waitFor(() =>
      expect(
        screen.queryByRole("heading", {
          name: "Foundation completion photo",
        }),
      ).toBeNull(),
    );
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

  test("opens the exact collaboration asset deep link", async () => {
    mocks.searchResponse = {
      continueCursor: null,
      isDone: true,
      page: [
        {
          audienceMode: "build_wide",
          createdAt: 1,
          entityId: "collaboration-asset-1",
          excerpt: "inspection-photo.jpg",
          focusEntityId: "collaboration-asset-1",
          focusEntityKind: "asset",
          hasAttachments: true,
          href: "/contractor/builds/build-1?tab=collaboration&focus=asset%3Acollaboration-asset-1",
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
      entityId: "collaboration-asset-1",
      entityKind: "asset",
      href: "/contractor/builds/build-1?tab=collaboration&focus=asset%3Acollaboration-asset-1",
    });
  });

  test("hydrates and focuses the exact collaboration asset", async () => {
    const focusedEntry = focusedPostEntryFixture(
      "post-outside-first-page",
      "Focused attachment thread.",
    );
    mocks.focusedAssetContext = {
      assetId: "collaboration-asset-1",
      postId: "post-outside-first-page",
      state: "visible",
    };
    mocks.focusedPostContext = {
      entry: {
        ...focusedEntry,
        attachments: [
          {
            assetId: "collaboration-asset-1",
            fileName: "inspection-photo.jpg",
            mimeType: "image/jpeg",
            scanState: "clean",
            sizeBytes: 2048,
            state: "available",
            version: 1,
          },
        ],
      },
      state: "visible",
    };

    render(
      <BuildCollaborationFeed
        buildId="build-1"
        focusedReference="asset:collaboration-asset-1"
        organizationId="org-1"
      />,
    );

    const asset = await screen.findByTestId(
      "collaboration-asset-collaboration-asset-1",
    );
    expect(asset.getAttribute("data-focused")).toBe("true");
    expect(document.activeElement).toBe(asset);
    expect(screen.getByText("Focused attachment thread.")).toBeTruthy();
  });

  test("resolves an exact entity focus outside the bounded autocomplete catalog", async () => {
    mocks.focusedReferenceContext = {
      reference: {
        entityId: "milestone-outside-catalog",
        entityKind: "milestone",
        eyebrow: "Milestone",
        href: "/contractor/builds/build-1?tab=milestones&milestone=milestone-outside-catalog",
        label: "Deep foundation inspection",
        searchTerms: ["deep", "foundation"],
        summary: "Ready for review",
      },
      state: "visible",
    };

    render(
      <BuildCollaborationFeed
        buildId="build-1"
        focusedReference="milestone:milestone-outside-catalog"
        organizationId="org-1"
      />,
    );

    expect(await screen.findByText("Deep foundation inspection")).toBeTruthy();
    expect(screen.getByText("Ready for review")).toBeTruthy();
  });

  test("opens and focuses an Action Item-owned asset", async () => {
    mocks.focusedAssetContext = {
      actionItemId: "action-1",
      assetId: "action-asset-1",
      postId: "post-1",
      state: "visible",
    };
    mocks.actionItemAttachments = [
      {
        assetId: "action-asset-1",
        fileName: "engineer-seal.pdf",
        mimeType: "application/pdf",
        scanState: "clean",
        sizeBytes: 2048,
        state: "available",
        version: 1,
      },
    ];

    render(
      <BuildCollaborationFeed
        buildId="build-1"
        focusedReference="asset:action-asset-1"
        organizationId="org-1"
      />,
    );

    expect(
      await screen.findByRole("heading", { name: "Upload engineer seal" }),
    ).toBeTruthy();
    const asset = await screen.findByTestId(
      "collaboration-asset-action-asset-1",
    );
    expect(asset.getAttribute("data-focused")).toBe("true");
    expect(document.activeElement).toBe(asset);
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

    render(<BuildCollaborationFeed buildId="build-1" organizationId="org-1" />);

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
        "action-personal",
      ),
    ).toBe(
      "/builder/builds/build-2?tab=details&focus=actionItem%3Aaction-personal",
    );
    expect(
      buildActionItemQueueHref(
        "https://drawflow.example/builder-staff/builds/build-1?tab=details",
        "build-2",
        "action-personal",
      ),
    ).toBe(
      "/builder-staff/builds/build-2?tab=details&focus=actionItem%3Aaction-personal",
    );
  });

  test("makes every queued Action Item accessible through an explicit view-all control", () => {
    mocks.personalActionItems = Array.from({ length: 16 }, (_, index) =>
      queueRowFixture({
        buildId: "build-1",
        buildName: "Foundation Build",
        id: `action-personal-${index + 1}`,
        title: `Queued action ${index + 1}`,
      }),
    );

    render(<BuildCollaborationFeed buildId="build-1" organizationId="org-1" />);

    expect(screen.queryByText("Queued action 6")).toBeNull();
    expect(screen.queryByText("Queued action 16")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show 5 more of 11" }));
    fireEvent.click(screen.getByRole("button", { name: "Show 5 more of 6" }));
    fireEvent.click(screen.getByRole("button", { name: "Show 1 more of 1" }));
    for (let index = 1; index <= 16; index += 1) {
      expect(screen.getByText(`Queued action ${index}`)).toBeTruthy();
    }
    expect(
      screen.queryByRole("button", { name: /Show .* more of/ }),
    ).toBeNull();
  });

  test("uses one compact queue disclosure to reveal every loaded Action Item", () => {
    mocks.personalActionItems = Array.from({ length: 16 }, (_, index) =>
      queueRowFixture({
        buildId: "build-1",
        buildName: "Foundation Build",
        id: `compact-action-${index + 1}`,
        title: `Compact action ${index + 1}`,
      }),
    );

    render(<BuildCollaborationFeed buildId="build-1" organizationId="org-1" />);

    expect(screen.queryByText("Compact action 16")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "View all 16" }));
    for (let index = 1; index <= 16; index += 1) {
      expect(screen.getByText(`Compact action ${index}`)).toBeTruthy();
    }
    expect(screen.getByRole("button", { name: "Show fewer" })).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /Show .* more of/ }),
    ).toBeNull();
  });

  test("loads the next server page after the visible queue page is exhausted", () => {
    mocks.queueStatus = "CanLoadMore";
    mocks.personalActionItems = Array.from({ length: 5 }, (_, index) =>
      queueRowFixture({
        buildId: "build-1",
        buildName: "Foundation Build",
        id: `paged-action-${index + 1}`,
        title: `Paged action ${index + 1}`,
      }),
    );

    render(<BuildCollaborationFeed buildId="build-1" organizationId="org-1" />);

    fireEvent.click(
      screen.getAllByRole("button", { name: "Load more Action Items" })[0],
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

    render(<BuildCollaborationFeed buildId="build-1" organizationId="org-1" />);
    fireEvent.click(screen.getByText("Foundation completion photo"));

    expect(screen.getByText("Related Action Items")).toBeTruthy();
    expect(screen.getByText("Replace blurred foundation photo")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Open Action Item: Replace blurred foundation photo",
      }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Upload engineer seal" }),
      ).toBeTruthy(),
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

  test("closes a host-managed Action Item when browser history removes focus", async () => {
    const { rerender } = render(
      <BuildCollaborationFeed
        buildId="build-1"
        detailResolutionState="visible"
        focusedReference="actionItem:action-1"
        organizationId="org-1"
        resolvedDetailTarget={{
          actionItemId: "action-1" as Id<"buildActionItems">,
          kind: "actionItem",
        }}
      />,
    );

    expect(
      await screen.findByRole("heading", { name: "Upload engineer seal" }),
    ).toBeTruthy();

    rerender(
      <BuildCollaborationFeed
        buildId="build-1"
        detailResolutionState="idle"
        organizationId="org-1"
      />,
    );

    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: "Upload engineer seal" }),
      ).toBeNull(),
    );
  });

  test("navigates host-managed Action Item history with documented shortcuts", async () => {
    const onDetailGoBack = vi.fn();
    const onDetailGoForward = vi.fn();
    render(
      <BuildCollaborationFeed
        buildId="build-1"
        detailCanGoBack
        detailCanGoForward
        detailResolutionState="visible"
        focusedReference="actionItem:action-1"
        onDetailGoBack={onDetailGoBack}
        onDetailGoForward={onDetailGoForward}
        organizationId="org-1"
        resolvedDetailTarget={{
          actionItemId: "action-1" as Id<"buildActionItems">,
          kind: "actionItem",
        }}
      />,
    );

    const dialog = await screen.findByRole("dialog");
    fireEvent.keyDown(dialog, { altKey: true, key: "ArrowLeft" });
    fireEvent.keyDown(dialog, { altKey: true, key: "ArrowRight" });

    expect(onDetailGoBack).toHaveBeenCalledTimes(1);
    expect(onDetailGoForward).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(dialog, {
      altKey: true,
      key: "ArrowLeft",
      shiftKey: true,
    });
    expect(onDetailGoBack).toHaveBeenCalledTimes(1);
  });

  test("removes the generic sheet when a generated focus resolves canonically", async () => {
    const { rerender } = render(
      <BuildCollaborationFeed
        buildId="build-1"
        detailResolutionState="visible"
        focusedReference="actionItem:action-1"
        organizationId="org-1"
        resolvedDetailTarget={{
          actionItemId: "action-1" as Id<"buildActionItems">,
          kind: "actionItem",
        }}
      />,
    );

    expect(
      await screen.findByRole("heading", { name: "Upload engineer seal" }),
    ).toBeTruthy();

    rerender(
      <BuildCollaborationFeed
        buildId="build-1"
        detailResolutionState="visible"
        focusedReference="actionItem:action-1"
        organizationId="org-1"
        resolvedDetailTarget={{
          companionId: "action-1" as Id<"buildActionItems">,
          kind: "submilestone",
          submilestoneId: "submilestone-1" as Id<"buildSubmilestones">,
        }}
      />,
    );

    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: "Upload engineer seal" }),
      ).toBeNull(),
    );
  });

  test("dispatches a generated companion before generic Action Item rendering", async () => {
    mocks.canonicalSystemActionItem = true;
    const onOpenReference = vi.fn();
    render(
      <BuildCollaborationFeed
        buildId="build-1"
        detailResolutionState="visible"
        focusedReference="actionItem:action-1"
        onOpenReference={onOpenReference}
        organizationId="org-1"
        resolvedDetailTarget={{
          actionItemId: "action-1" as Id<"buildActionItems">,
          kind: "actionItem",
        }}
      />,
    );

    await waitFor(() =>
      expect(onOpenReference).toHaveBeenCalledWith(
        expect.objectContaining({
          entityId: "submilestone-1",
          entityKind: "submilestone",
          href: expect.stringContaining("detailTab=collaboration"),
        }),
      ),
    );
    expect(
      screen.queryByRole("combobox", { name: "Change Action Item status" }),
    ).toBeNull();
    expect(screen.queryByText("Canonical Sub-milestone facts")).toBeNull();
  });

  test("creates Action Items from a live post with inherited audience context", async () => {
    render(<BuildCollaborationFeed buildId="build-1" organizationId="org-1" />);

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
    fireEvent.click(
      screen.getByRole("button", {
        name: "Mock Action Item description",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Evidence" }));
    fireEvent.click(screen.getByRole("button", { name: "Draw" }));
    fireEvent.click(screen.getByRole("button", { name: "Create Action Item" }));

    await waitFor(() =>
      expect(mocks.mutate).toHaveBeenCalledWith(
        expect.objectContaining({
          buildId: "build-1",
          descriptionPlainText: "Useful accountable work.",
          labels: ["Evidence", "Draw"],
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
    render(<BuildCollaborationFeed buildId="build-1" organizationId="org-1" />);

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

    expect(
      screen.getByLabelText("Action Item work type").textContent,
    ).toContain("evidence");
    expect(
      screen.getByText(
        "Governed work requires a due date and authority acceptance before Done.",
      ),
    ).toBeTruthy();

    mocks.mutate.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Create Action Item" }));
    expect(mocks.mutate).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Action Item due date"), {
      target: { value: "2026-08-15" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Action Item" }));

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
    render(<BuildCollaborationFeed buildId="build-1" organizationId="org-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Action Items 1" }));
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Open Action Item: Upload engineer seal",
      }),
    );

    expect(
      await screen.findByRole("heading", { name: "Upload engineer seal" }),
    ).toBeTruthy();
    expect(screen.getByText("Visible to all")).toBeTruthy();
    expect(screen.queryByText("Audience inherited from the post")).toBeNull();
    expect(
      screen.getByRole("combobox", { name: "Assign Action Item" }).textContent,
    ).toContain("Alex Chen");
    expect(
      screen.getByRole("combobox", { name: "Assign Action Item" }).textContent,
    ).not.toContain("user-builder");
    const collaborationRecord = screen
      .getByRole("heading", { name: "Discussion" })
      .closest('[data-slot="frame"]');
    expect(collaborationRecord).toBeTruthy();
    expect(
      within(collaborationRecord as HTMLElement).getByText("Revision history"),
    ).toBeTruthy();
    expect(
      within(collaborationRecord as HTMLElement).getByText("Activity"),
    ).toBeTruthy();
    expect(screen.getByText("Revision history")).toBeTruthy();
    expect(screen.getByText("Activity")).toBeTruthy();
    fireEvent.click(
      screen.getAllByRole("button", { name: /Foundation completion photo/ })[0],
    );
    expect(
      screen.getByRole("heading", { name: "Foundation completion photo" }),
    ).toBeTruthy();
  });

  test("uses the Action Item detail sheet for children, checklists, relationship conflicts, and repair", async () => {
    render(<BuildCollaborationFeed buildId="build-1" organizationId="org-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Action Items 1" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Show Action Items as a list" }),
    );
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Open Action Item: Upload engineer seal",
      }),
    );

    expect(screen.getByText("Structured work")).toBeTruthy();
    expect(screen.getByText("Collect engineer seal")).toBeTruthy();
    expect(screen.getByText("Confirm file naming")).toBeTruthy();
    expect(screen.getAllByText("Release Draw 3").length).toBeGreaterThan(0);
    expect(screen.getByText("Permission conflict")).toBeTruthy();

    mocks.mutate.mockClear();
    fireEvent.click(screen.getByLabelText("Mark Confirm file naming complete"));
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
    fireEvent.click(screen.getByRole("button", { name: "Create Action Item" }));
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
    render(<BuildCollaborationFeed buildId="build-1" organizationId="org-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Action Items 1" }));
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Open Action Item: Upload engineer seal",
      }),
    );
    mocks.mutate.mockClear();
    fireEvent.change(
      await screen.findByRole("combobox", {
        name: "Change Action Item status",
      }),
      { target: { value: "in_progress" } },
    );
    expect(
      screen.getByRole("combobox", { name: "Change Action Item status" })
        .textContent,
    ).toContain("In progress");

    await waitFor(() =>
      expect(mocks.mutate).toHaveBeenCalledWith({
        actionItemId: "action-1",
        buildId: "build-1",
        expectedRevision: 1,
        nextStatus: "in_progress",
        organizationId: "org-1",
        reason: undefined,
      }),
    );

    mocks.mutate.mockClear();
    fireEvent.change(
      screen.getByRole("combobox", { name: "Change Action Item status" }),
      { target: { value: "blocked" } },
    );
    expect(mocks.mutate).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Action Item transition reason"), {
      target: { value: "Waiting for the engineer seal" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Blocked" }));
    await waitFor(() =>
      expect(mocks.mutate).toHaveBeenCalledWith({
        actionItemId: "action-1",
        buildId: "build-1",
        expectedRevision: 1,
        nextStatus: "blocked",
        organizationId: "org-1",
        reason: "Waiting for the engineer seal",
      }),
    );
  });

  test("surfaces governed completion and upward assignment acceptance controls", async () => {
    mocks.actionItemWorkKind = "evidence";
    mocks.actionItemRequiresAcceptance = true;
    mocks.workflowAssignmentMode = "request";
    mocks.workflowCanAccept = true;
    mocks.workflowTransitions = ["in_review"];
    render(<BuildCollaborationFeed buildId="build-1" organizationId="org-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Action Items 1" }));
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Open Action Item: Upload engineer seal",
      }),
    );

    expect(screen.getByText("Governed completion")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Accept assignment" }));
    await waitFor(() =>
      expect(mocks.mutate).toHaveBeenCalledWith({
        actionItemId: "action-1",
        buildId: "build-1",
        expectedRevision: 1,
        organizationId: "org-1",
      }),
    );

    mocks.mutate.mockClear();
    fireEvent.change(
      screen.getByRole("combobox", { name: "Change Action Item status" }),
      { target: { value: "in_review" } },
    );
    await waitFor(() =>
      expect(mocks.mutate).toHaveBeenCalledWith(
        expect.objectContaining({
          actionItemId: "action-1",
          nextStatus: "in_review",
        }),
      ),
    );
  });

  test("keeps an accepted upward assignment visibly governed for ordinary work", async () => {
    mocks.actionItemAssignmentState = "assigned";
    mocks.actionItemRequiresAcceptance = true;
    mocks.workflowTransitions = ["in_review"];
    render(<BuildCollaborationFeed buildId="build-1" organizationId="org-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Action Items 1" }));
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Open Action Item: Upload engineer seal",
      }),
    );

    expect(screen.getByText("Ordinary work")).toBeTruthy();
    expect(screen.getByText("Governed completion")).toBeTruthy();
    expect(
      screen.getByRole("combobox", { name: "Change Action Item status" }),
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
      />,
    );

    expect(
      screen.queryByRole("heading", { name: "Upload engineer seal" }),
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
        "Focused notification thread.",
      ),
      state: "visible",
    };

    render(
      <BuildCollaborationFeed
        buildId="build-1"
        focusedReference="post:post-outside-first-page"
        organizationId="org-1"
      />,
    );

    expect(
      await screen.findByText("Focused notification thread."),
    ).toBeTruthy();
    expect(
      screen
        .getByTestId("collaboration-post-post-outside-first-page")
        .getAttribute("data-focused"),
    ).toBe("true");
    expect(
      screen.getByText("Foundation evidence is ready for review."),
    ).toBeTruthy();
  });

  test("keeps revoked focused posts disclosure-safe", async () => {
    mocks.focusedPostContext = { state: "revoked" };
    render(
      <BuildCollaborationFeed
        buildId="build-1"
        focusedReference="post:post-revoked"
        organizationId="org-1"
      />,
    );

    expect(
      await screen.findByText(
        "This focused post is unavailable or your access was revoked.",
      ),
    ).toBeTruthy();
    expect(
      screen.getAllByText("Foundation evidence is ready for review.").length,
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
    expect(
      screen.getByText("Focused participant detail for this Build."),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Open focused workspace" }),
    ).toBeNull();
  });

  test("hydrates a non-person search focus into the reusable reference detail sheet", async () => {
    render(
      <BuildCollaborationFeed
        buildId="build-1"
        focusedReference="milestone:foundation-footings"
        organizationId="org-1"
      />,
    );

    expect(
      await screen.findByRole("heading", { name: "Foundation & footings" }),
    ).toBeTruthy();
    expect(
      screen
        .getByTestId("build-collaboration-focused-reference")
        .getAttribute("data-reference-key"),
    ).toBe("milestone:foundation-footings");
    expect(
      screen.getByRole("button", { name: "Open focused workspace" }),
    ).toBeTruthy();
  });

  test("provides a roving keyboard entry point for ordinary discussions", () => {
    mocks.comments = [
      commentRowFixture("comment-first", "First reply"),
      commentRowFixture("comment-second", "Second reply"),
    ];
    render(<BuildCollaborationFeed buildId="build-1" organizationId="org-1" />);
    fireEvent.click(screen.getByRole("button", { name: /Discussion/ }));

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
    const originalScrollIntoView = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "scrollIntoView",
    );
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
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
      />,
    );

    const root = screen.getByTestId("collaboration-comment-comment-root");
    const deep = screen.getByTestId("collaboration-comment-comment-deep");
    expect(deep.style.marginLeft).toBe("24px");
    expect(within(deep).getByText("Replying to Parent Author")).toBeTruthy();
    expect(document.activeElement).toBe(deep);
    expect(scrollIntoView).not.toHaveBeenCalled();
    if (originalScrollIntoView) {
      Object.defineProperty(
        HTMLElement.prototype,
        "scrollIntoView",
        originalScrollIntoView,
      );
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
    }
    fireEvent.keyDown(deep, { key: "ArrowUp" });
    expect(document.activeElement).toBe(root);

    const replyButton = within(deep).getByRole("button", { name: "Reply" });
    fireEvent.click(replyButton);
    expect(screen.getByText("Replying to Deep Author.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(document.activeElement).toBe(replyButton));

    fireEvent.click(
      within(deep).getByRole("button", { name: "Acknowledge 1" }),
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
    render(<BuildCollaborationFeed buildId="build-1" organizationId="org-1" />);
    fireEvent.click(screen.getByRole("button", { name: /Discussion/ }));

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
      />,
    );

    expect(screen.getByText("Loading focused discussion…")).toBeTruthy();
    expect(screen.getAllByText("Ordinary loaded reply").length).toBeGreaterThan(
      0,
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
      rows: [commentRowFixture("comment-outside-page", "Focused older reply")],
      state: "visible",
    };
    render(
      <BuildCollaborationFeed
        buildId="build-1"
        focusedReference="comment:comment-outside-page"
        organizationId="org-1"
      />,
    );

    expect(screen.getByText("Loading focused discussion…")).toBeTruthy();
    expect(screen.getAllByText("Ordinary loaded reply").length).toBeGreaterThan(
      0,
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
      />,
    );

    expect(
      screen.getByText(
        "This focused discussion is unavailable or your access was revoked.",
      ),
    ).toBeTruthy();
  });

  test("labels a revised post as edited without treating thread receipt changes as edits", () => {
    mocks.postRevision = 2;
    render(<BuildCollaborationFeed buildId="build-1" organizationId="org-1" />);

    expect(screen.getByText("Edited")).toBeTruthy();
  });

  test("lets a non-author reader inspect an edited post without edit authority", async () => {
    mocks.postRevision = 2;
    mocks.postViewerIsAuthor = false;
    render(<BuildCollaborationFeed buildId="build-1" organizationId="org-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Post actions" }));
    fireEvent.click(
      await screen.findByRole("menuitem", {
        name: "View revision history",
      }),
    );

    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: "Revision history",
      }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save revision" })).toBeNull();
  });

  test("opens the hierarchy-safe moderation action from the post menu", async () => {
    mocks.postViewerCanModerate = true;
    mocks.postViewerIsAuthor = false;
    render(<BuildCollaborationFeed buildId="build-1" organizationId="org-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Post actions" }));
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Moderate content" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Content moderation" }),
    ).toBeTruthy();
    fireEvent.change(
      screen.getByRole("textbox", { name: "Moderation reason" }),
      { target: { value: "Unsafe instruction" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Moderate content" }));
    await waitFor(() =>
      expect(mocks.mutate).toHaveBeenCalledWith({
        buildId: "build-1",
        entityId: "post-1",
        entityKind: "post",
        expectedRevision: 1,
        organizationId: "org-1",
        reason: "Unsafe instruction",
      }),
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
          plainText: "This reply is unavailable while it is under moderation.",
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
    render(<BuildCollaborationFeed buildId="build-1" organizationId="org-1" />);
    fireEvent.click(screen.getByRole("button", { name: /Discussion/ }));

    const comment = screen.getByTestId("collaboration-comment-comment-1");
    expect(within(comment).getByText("Moderated")).toBeTruthy();
    expect(within(comment).queryByRole("button", { name: "Reply" })).toBeNull();
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

    render(<BuildCollaborationFeed buildId="build-1" organizationId="org-1" />);
    fireEvent.click(screen.getByRole("button", { name: /Discussion/ }));

    expect(screen.getAllByText("Accepted answer")).toHaveLength(2);
    expect(
      screen.getAllByText("The revised engineer seal is acceptable."),
    ).toHaveLength(2);
    expect(screen.getByText("Resolved")).toBeTruthy();
  });

  test("publishes a human-authored composer post without showing a HITL checkpoint", async () => {
    render(<BuildCollaborationFeed buildId="build-1" organizationId="org-1" />);
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

  test("autosaves composer work privately and to the human-owned server draft after one second", async () => {
    vi.useFakeTimers();
    offlineDraftMocks.saveDraft.mockImplementation(async (input) => ({
      ...input,
      updatedAt: Date.now(),
      version: 1,
    }));
    mocks.mutate.mockResolvedValueOnce({
      draftId: "draft-autosaved",
      revision: 1,
    });
    render(<BuildCollaborationFeed buildId="build-1" organizationId="org-1" />);
    fireEvent.click(
      screen.getByRole("button", {
        name: /What should people involved in this Build know\?/,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Mock Build update" }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(offlineDraftMocks.saveDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "org-1:build-1:user_admin",
      }),
    );
    expect(mocks.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        buildId: "build-1",
        organizationId: "org-1",
        preparedByAgent: false,
      }),
    );
    expect(screen.getByText(/Private draft autosaved/)).toBeTruthy();
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
    render(<BuildCollaborationFeed buildId="build-1" organizationId="org-1" />);

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
    render(<BuildCollaborationFeed buildId="build-1" organizationId="org-1" />);
    fireEvent.click(screen.getByRole("button", { name: /Discussion/ }));
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByText("mistaken-photo.jpg")).toBeTruthy();
    mocks.mutate.mockClear();
    mocks.mutate.mockResolvedValueOnce({
      bundleJson: mocks.drafts[0]?.bundleJson,
      draftId: "human-draft-remove",
      revision: 2,
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Remove mistaken-photo.jpg" }),
    );

    await waitFor(() =>
      expect(mocks.mutate).toHaveBeenCalledWith(
        expect.objectContaining({
          attachmentAssetIds: [],
          buildId: "build-1",
          draftId: "human-draft-remove",
          organizationId: "org-1",
        }),
      ),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Remove mistaken-photo.jpg" }),
      ).toBeNull(),
    );
  });

  test("keeps offline composer work private without invoking Convex", async () => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    offlineDraftMocks.saveDraft.mockImplementation(async (input) => ({
      ...input,
      updatedAt: Date.now(),
      version: 1,
    }));

    render(<BuildCollaborationFeed buildId="build-1" organizationId="org-1" />);
    expect(screen.getByText("Private offline mode")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", {
        name: "What should people involved in this Build know?",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Mock Build update" }));
    mocks.mutate.mockClear();
    fireEvent.click(
      screen.getByRole("button", { name: "Save privately on device" }),
    );

    await waitFor(() =>
      expect(offlineDraftMocks.saveDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          draftId: undefined,
          expectedRevision: undefined,
          files: [],
          key: "org-1:build-1:user_admin",
        }),
      ),
    );
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  test("removes receipts, reactions, replies, and Action Item transitions while offline", async () => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });

    render(<BuildCollaborationFeed buildId="build-1" organizationId="org-1" />);
    await waitFor(() => expect(mocks.mutate).not.toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: /Discussion/ }));
    expect(screen.queryByRole("button", { name: "Acknowledge" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Write a reply…" })).toBeNull();
    expect(
      screen.getByText(/archived discussion is available to read/i),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Action Items 1" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Show Action Items as a list" }),
    );
    expect(
      (await screen.findByRole("button", {
        name: "Add Action Item",
      })) as HTMLButtonElement,
    ).toHaveProperty("disabled", true);
    expect(
      screen.getByLabelText("Status for Upload engineer seal"),
    ).toHaveProperty("disabled", true);

    await waitFor(() => expect(mocks.mutate).not.toHaveBeenCalled());
  });

  test("keeps work private when Convex disconnects while the browser remains online", async () => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
    mocks.convexConnectionState = {
      connectionCount: 1,
      connectionRetries: 2,
      hasEverConnected: true,
      hasInflightRequests: false,
      inflightActions: 0,
      inflightMutations: 0,
      isWebSocketConnected: false,
      timeOfOldestInflightRequest: null,
    };
    offlineDraftMocks.saveDraft.mockImplementation(async (input) => ({
      ...input,
      updatedAt: Date.now(),
      version: 1,
    }));

    render(<BuildCollaborationFeed buildId="build-1" organizationId="org-1" />);
    expect(screen.getByText("Private offline mode")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", {
        name: "What should people involved in this Build know?",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Mock Build update" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Save privately on device" }),
    );

    await waitFor(() => expect(offlineDraftMocks.saveDraft).toHaveBeenCalled());
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  test("keeps a cold never-connected Convex session private", async () => {
    const bundle = collaborationDraftBundleFixture(
      "Cold offline draft remains available.",
    );
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
    mocks.allQueriesUnavailable = true;
    mocks.convexConnectionState = {
      connectionCount: 0,
      connectionRetries: 0,
      hasEverConnected: false,
      hasInflightRequests: false,
      inflightActions: 0,
      inflightMutations: 0,
      isWebSocketConnected: false,
      timeOfOldestInflightRequest: null,
    };
    offlineDraftMocks.loadDraft.mockResolvedValue({
      bundle,
      capturedAt: Date.parse("2026-08-01T11:00:00.000Z"),
      files: [],
      key: "org-1:build-1:user_admin",
      updatedAt: Date.now(),
      version: 1,
    });
    offlineDraftMocks.saveDraft.mockImplementation(async (input) => ({
      ...input,
      updatedAt: Date.now(),
      version: 1,
    }));

    render(<BuildCollaborationFeed buildId="build-1" organizationId="org-1" />);
    expect(screen.getByText("Private offline mode")).toBeTruthy();
    await waitFor(() =>
      expect(offlineDraftMocks.loadDraft).toHaveBeenCalledWith(
        "org-1:build-1:user_admin",
      ),
    );
    expect(await screen.findByText(/Private device draft from/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continue offline" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Save privately on device" }),
    );

    await waitFor(() =>
      expect(offlineDraftMocks.saveDraft).toHaveBeenCalledWith(
        expect.objectContaining({ key: "org-1:build-1:user_admin" }),
      ),
    );
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  test("revalidates the hydrated auth identity before every server reconciliation path", async () => {
    mocks.canSchedule = true;
    mocks.serverDraftIdentityWorkosUserId = "user_other";
    render(<BuildCollaborationFeed buildId="build-1" organizationId="org-1" />);
    mocks.mutate.mockClear();
    fireEvent.click(
      screen.getByRole("button", {
        name: "What should people involved in this Build know?",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Mock Build update" }));
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => expect(mocks.mutate).not.toHaveBeenCalled());
    expect(offlineDraftMocks.deleteDraft).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Publish" }));

    await waitFor(() => expect(mocks.mutate).not.toHaveBeenCalled());
    expect(offlineDraftMocks.deleteDraft).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Add attachments/ }));
    fireEvent.change(screen.getByLabelText("Scheduled publication time"), {
      target: { value: "2099-01-01T12:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review & schedule" }));

    await waitFor(() => expect(mocks.mutate).not.toHaveBeenCalled());
    expect(offlineDraftMocks.deleteDraft).not.toHaveBeenCalled();
  });

  test("reconnects an offline edit against the exact server draft revision", async () => {
    const bundle = collaborationDraftBundleFixture(
      "Offline edit awaiting reconciliation.",
    );
    offlineDraftMocks.loadDraft.mockResolvedValue({
      bundle,
      capturedAt: Date.parse("2026-08-01T11:00:00.000Z"),
      draftId: "server-draft-1",
      expectedRevision: 4,
      files: [],
      key: "org-1:build-1:user_admin",
      scheduledFor: Date.parse("2099-01-01T12:00:00.000Z"),
      updatedAt: Date.now(),
      version: 1,
    });
    mocks.mutate.mockResolvedValue({
      bundleJson: JSON.stringify(bundle),
      draftId: "server-draft-1",
      revision: 5,
    });

    render(<BuildCollaborationFeed buildId="build-1" organizationId="org-1" />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Load and reconcile" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() =>
      expect(mocks.mutate).toHaveBeenCalledWith(
        expect.objectContaining({
          draftId: "server-draft-1",
          expectedRevision: 4,
          offlineCapturedAt: Date.parse("2026-08-01T11:00:00.000Z"),
        }),
      ),
    );
  });

  test("requires exact human review before scheduling a private draft", async () => {
    mocks.canSchedule = true;
    const scheduledForInput = "2099-01-01T12:00";
    const scheduledFor = new Date(scheduledForInput).getTime();
    mocks.mutate.mockImplementation(async (args: Record<string, unknown>) => {
      if (args.preparedByAgent === false && !args.draftId) {
        const bundle = collaborationDraftBundleFixture(
          String(args.plainText ?? "Useful accountable work."),
        );
        mocks.drafts = [
          {
            _creationTime: Date.now(),
            _id: "scheduled-draft-1",
            approvalOwnerWorkosUserId: "user_admin",
            bundleJson: JSON.stringify(bundle),
            preparedByActorKind: "human",
            preparedByAgent: false,
            preparedByWorkosUserId: "user_admin",
            revision: 1,
            scheduledFor: args.scheduledFor,
            state: "active",
            updatedAt: Date.now(),
          },
        ];
        return {
          bundleJson: JSON.stringify(bundle),
          draftId: "scheduled-draft-1",
          revision: 1,
        };
      }
      return "approval-1";
    });

    render(<BuildCollaborationFeed buildId="build-1" organizationId="org-1" />);
    fireEvent.click(
      screen.getByRole("button", {
        name: "What should people involved in this Build know?",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Mock Build update" }));
    fireEvent.click(screen.getByRole("button", { name: /Add attachments/ }));
    fireEvent.change(screen.getByLabelText("Scheduled publication time"), {
      target: { value: scheduledForInput },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review & schedule" }));

    await screen.findByText("Human approval checkpoint");
    expect(screen.getByText(/Scheduled for/)).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Approve exact bundle & schedule",
      }),
    );

    await waitFor(() =>
      expect(mocks.mutate).toHaveBeenCalledWith({
        buildId: "build-1",
        draftId: "scheduled-draft-1",
        expectedRevision: 1,
        organizationId: "org-1",
        scheduledFor,
      }),
    );
  });

  test("preserves a stale participant draft beside the latest server revision", async () => {
    const initialBundle = collaborationDraftBundleFixture("Initial draft.");
    mocks.drafts = [
      {
        _creationTime: Date.now(),
        _id: "conflicted-draft-1",
        approvalOwnerWorkosUserId: "user_admin",
        bundleJson: JSON.stringify(initialBundle),
        preparedByActorKind: "human",
        preparedByAgent: false,
        preparedByWorkosUserId: "user_admin",
        revision: 1,
        state: "active",
        updatedAt: Date.now(),
      },
    ];
    mocks.mutate.mockImplementation(async (args: Record<string, unknown>) => {
      if (args.draftId === "conflicted-draft-1") {
        mocks.drafts = [
          {
            ...mocks.drafts[0],
            bundleJson: JSON.stringify(
              collaborationDraftBundleFixture("Server-side revision."),
            ),
            revision: 2,
          },
        ];
        throw new Error(
          "Draft revision conflict: expected revision 1 but found 2.",
        );
      }
      return null;
    });

    render(<BuildCollaborationFeed buildId="build-1" organizationId="org-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Mock Build update" }));
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    await screen.findByText("Draft changed elsewhere");
    expect(screen.getByText("Useful accountable work.")).toBeTruthy();
    expect(screen.getByText("Latest server revision 2")).toBeTruthy();
    expect(screen.getAllByText("Server-side revision.").length).toBeGreaterThan(
      0,
    );
    expect(offlineDraftMocks.saveDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        draftId: "conflicted-draft-1",
        expectedRevision: 1,
        key: "org-1:build-1:user_admin",
      }),
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

    render(<BuildCollaborationFeed buildId="build-1" organizationId="org-1" />);
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
