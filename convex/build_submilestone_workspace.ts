import { v } from "convex/values";

import {
  type ActiveBuildAuthorization,
  selectActiveBuildAuthorizationCapacity,
} from "./activeBuildAccess";
import { authenticatedQuery, type AuthorizedViewer } from "./authz";
import { canReadCollaborationPost } from "./build_collaboration_access";
import type { BuildCollaborationRole } from "./build_collaboration_model";
import {
  authorizeActiveBuildCollaborationAccess,
  BUILD_COLLABORATION_UNAVAILABLE_ERROR,
} from "./build_collaboration_rollout";
import {
  canReadCanonicalMilestoneSubmilestone,
  resolveCanonicalMilestoneExecutionOwnership,
} from "./build_collaboration_system_event_access";
import { buildCollaborationRoleValidator } from "./build_collaboration_validators";
import {
  operateDenialMessage,
  resolveSubmilestoneOperateAuthority,
} from "./build_submilestone_operate_authority";
import type { Doc, Id, QueryCtx } from "./types";

const MAX_BOOTSTRAP_ROWS = 100;
const MAX_COMPANION_CANDIDATES = 32;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 50;

const capabilityValidator = v.object({
  allowed: v.boolean(),
  reason: v.optional(v.string()),
});

const capabilitiesValidator = v.object({
  canonical: v.object({
    approveChild: capabilityValidator,
    retractChildApproval: capabilityValidator,
    start: capabilityValidator,
    submitCompletion: capabilityValidator,
    updateEvidence: capabilityValidator,
    updateExecution: capabilityValidator,
    waiveSiteVisit: capabilityValidator,
  }),
  collaboration: v.object({
    addAttachment: capabilityValidator,
    addChecklist: capabilityValidator,
    comment: capabilityValidator,
    createChild: capabilityValidator,
    linkRelation: capabilityValidator,
    toggleChecklist: capabilityValidator,
  }),
  review: v.object({
    recommend: capabilityValidator,
    requestChanges: capabilityValidator,
  }),
});

const bootstrapVisibleValidator = v.object({
  build: v.object({
    buildId: v.id("activeBuilds"),
    buildName: v.string(),
    location: v.string(),
    status: v.string(),
  }),
  capabilities: capabilitiesValidator,
  companion: v.object({
    actionItemId: v.id("buildActionItems"),
    canonicalBindingRevision: v.optional(v.number()),
    currentRevision: v.number(),
    originatingPostId: v.id("buildCollaborationPosts"),
    requestedActionItemId: v.optional(v.id("buildActionItems")),
  }),
  evidence: v.object({
    evidencePackageRevision: v.optional(v.number()),
    evidencePackageStatus: v.optional(
      v.union(v.literal("draft"), v.literal("frozen")),
    ),
    evidenceReviewState: v.string(),
    itemCount: v.number(),
    partial: v.boolean(),
    requirementCount: v.number(),
  }),
  execution: v.object({
    actualCostCents: v.optional(v.number()),
    actualStartedAt: v.optional(v.number()),
    completionForecastDate: v.optional(v.string()),
    fieldNote: v.optional(v.string()),
    progressPercent: v.number(),
  }),
  milestone: v.object({
    buildMilestoneId: v.id("buildMilestones"),
    key: v.string(),
    name: v.string(),
    planningState: v.string(),
    status: v.string(),
  }),
  ownership: v.object({
    reason: v.string(),
    state: v.string(),
  }),
  parentReadiness: v.object({
    approvedChildCount: v.number(),
    childCount: v.number(),
    partial: v.boolean(),
    readyForApproval: v.boolean(),
  }),
  persona: buildCollaborationRoleValidator,
  review: v.object({
    evidenceReviewState: v.string(),
    reviewDecisionState: v.string(),
    reviewRound: v.number(),
    siteVisitRequirementStatus: v.optional(v.string()),
  }),
  revisions: v.object({
    canonicalWorkflowRevision: v.number(),
    companionRevision: v.number(),
    evidencePackageRevision: v.optional(v.number()),
    parentReviewRevision: v.number(),
    reviewRevision: v.number(),
  }),
  schedule: v.object({
    durationDays: v.optional(v.number()),
    parentDayEnd: v.number(),
    parentDayStart: v.number(),
    startDay: v.optional(v.number()),
  }),
  state: v.union(v.literal("visible"), v.literal("superseded")),
  submilestone: v.object({
    buildSubmilestoneId: v.id("buildSubmilestones"),
    key: v.string(),
    name: v.string(),
    planningState: v.string(),
    scopeOfWorkTiptapJson: v.optional(v.string()),
    status: v.string(),
    supersededAt: v.optional(v.number()),
  }),
});

const bootstrapValidator = v.union(
  v.object({ state: v.literal("revoked") }),
  v.object({
    code: v.string(),
    message: v.string(),
    state: v.literal("integrity_error"),
  }),
  bootstrapVisibleValidator,
);

const workspaceCollectionValidator = v.union(
  v.literal("evidence_requirements"),
  v.literal("evidence_assets"),
  v.literal("people_assignments"),
  v.literal("materials"),
  v.literal("collaboration_comments"),
  v.literal("collaboration_activity"),
  v.literal("collaboration_revisions"),
  v.literal("collaboration_checklist"),
  v.literal("collaboration_children"),
  v.literal("collaboration_relations"),
  v.literal("review_decisions"),
);

const workspaceCollectionRowValidator = v.object({
  amountCents: v.optional(v.number()),
  completed: v.optional(v.boolean()),
  createdAt: v.optional(v.number()),
  detail: v.optional(v.string()),
  id: v.string(),
  kind: v.string(),
  locationVerified: v.optional(v.boolean()),
  required: v.optional(v.boolean()),
  status: v.optional(v.string()),
  title: v.string(),
});

const workspaceCollectionResultValidator = v.union(
  v.object({ state: v.literal("revoked") }),
  v.object({
    code: v.string(),
    message: v.string(),
    state: v.literal("integrity_error"),
  }),
  v.object({
    canonicalWorkflowRevision: v.number(),
    collection: workspaceCollectionValidator,
    companionActionItemId: v.id("buildActionItems"),
    companionRevision: v.number(),
    hasMore: v.boolean(),
    nextCursor: v.optional(v.string()),
    page: v.array(workspaceCollectionRowValidator),
    partial: v.boolean(),
    state: v.union(v.literal("visible"), v.literal("superseded")),
  }),
);

type WorkspaceContext = {
  authorization: ActiveBuildAuthorization;
  companion: Doc<"buildActionItems">;
  milestone: Doc<"buildMilestones">;
  post: Doc<"buildCollaborationPosts">;
  submilestone: Doc<"buildSubmilestones">;
};

type WorkspaceCollection =
  | "evidence_requirements"
  | "evidence_assets"
  | "people_assignments"
  | "materials"
  | "collaboration_comments"
  | "collaboration_activity"
  | "collaboration_revisions"
  | "collaboration_checklist"
  | "collaboration_children"
  | "collaboration_relations"
  | "review_decisions";

type WorkspaceCollectionRow = {
  amountCents?: number;
  completed?: boolean;
  createdAt?: number;
  detail?: string;
  id: string;
  kind: string;
  locationVerified?: boolean;
  required?: boolean;
  status?: string;
  title: string;
};

export const getBuildSubmilestoneWorkspaceBootstrap = authenticatedQuery
  .input({
    buildId: v.id("activeBuilds"),
    buildSubmilestoneId: v.id("buildSubmilestones"),
    companionActionItemId: v.optional(v.id("buildActionItems")),
    organizationId: v.string(),
    viewerCapacity: v.optional(buildCollaborationRoleValidator),
  })
  .returns(bootstrapValidator)
  .handler(async (ctx, args) => {
    const resolved = await resolveBuildSubmilestoneWorkspaceContext(ctx, args);
    if (resolved.state !== "visible") {
      return resolved;
    }
    const { authorization, companion, milestone, submilestone } = resolved;
    const superseded =
      submilestone.planningState === "superseded" ||
      companion.canonicalPlanningState === "superseded" ||
      (companion.canonicalCompanionDisposition !== undefined &&
        companion.canonicalCompanionDisposition !== "active");
    const ownership = await resolveCanonicalMilestoneExecutionOwnership(ctx, {
      build: authorization.build,
      includeCompleted: true,
      milestone,
      submilestone,
    });
    const [startAuthority, updateAuthority] = await Promise.all([
      resolveSubmilestoneOperateAuthority(ctx, {
        build: authorization.build,
        intent: "start",
        milestoneCompleted: milestone.status === "complete",
        ownership,
        submilestone,
        viewer: {
          roles: authorization.roles,
          workosUserId: authorization.viewer.subject,
        },
      }),
      resolveSubmilestoneOperateAuthority(ctx, {
        build: authorization.build,
        intent: "update",
        milestoneCompleted: milestone.status === "complete",
        ownership,
        submilestone,
        viewer: {
          roles: authorization.roles,
          workosUserId: authorization.viewer.subject,
        },
      }),
    ]);
    const [
      requirements,
      packageRevision,
      packageItems,
      siblings,
      siteVisitRequirement,
    ] = await Promise.all([
      ctx.db
        .query("buildSubmilestoneEvidenceRequirements")
        .withIndex("by_submilestone", (query) =>
          query.eq("buildSubmilestoneId", submilestone._id).eq("active", true),
        )
        .take(MAX_BOOTSTRAP_ROWS + 1),
      submilestone.evidencePackageRevisionId
        ? ctx.db.get(submilestone.evidencePackageRevisionId)
        : null,
      submilestone.evidencePackageRevisionId
        ? ctx.db
            .query("buildSubmilestoneEvidencePackageItems")
            .withIndex("by_package_revision", (query) =>
              query.eq(
                "packageRevisionId",
                submilestone.evidencePackageRevisionId!,
              ),
            )
            .take(MAX_BOOTSTRAP_ROWS + 1)
        : [],
      ctx.db
        .query("buildSubmilestones")
        .withIndex("by_milestone", (query) =>
          query.eq("buildMilestoneId", milestone._id),
        )
        .take(MAX_BOOTSTRAP_ROWS + 1),
      submilestone.siteVisitRequirementId
        ? ctx.db.get(submilestone.siteVisitRequirementId)
        : null,
    ]);
    const scopedSiblings = siblings.filter(
      (candidate) =>
        candidate.buildId === authorization.build._id &&
        candidate.organizationId === authorization.organizationId &&
        candidate.brokerageId === authorization.brokerage._id &&
        candidate.planningState !== "superseded",
    );
    const boundedSiblings = scopedSiblings.slice(0, MAX_BOOTSTRAP_ROWS);
    const approvedChildCount = boundedSiblings.filter(
      (candidate) => candidate.reviewDecisionState === "approved",
    ).length;
    const partial = siblings.length > MAX_BOOTSTRAP_ROWS;
    const scopeError = validateBootstrapProjectionScope({
      authorization,
      milestone,
      packageItems,
      packageRevision,
      requirements,
      siteVisitRequirement,
      submilestone,
    });
    if (scopeError) {
      return scopeError;
    }
    const capabilities = buildCapabilities({
      authorization,
      startAuthority,
      superseded,
      updateAuthority,
    });
    return {
      build: {
        buildId: authorization.build._id,
        buildName: authorization.build.buildName,
        location: authorization.build.location,
        status: authorization.build.status,
      },
      capabilities,
      companion: {
        actionItemId: companion._id,
        canonicalBindingRevision: companion.canonicalBindingRevision,
        currentRevision: companion.currentRevision,
        originatingPostId: companion.originatingPostId,
        requestedActionItemId: args.companionActionItemId,
      },
      evidence: {
        evidencePackageRevision: packageRevision?.revision,
        evidencePackageStatus: packageRevision?.status,
        evidenceReviewState: submilestone.evidenceReviewState ?? "not_ready",
        itemCount: Math.min(packageItems.length, MAX_BOOTSTRAP_ROWS),
        partial:
          requirements.length > MAX_BOOTSTRAP_ROWS ||
          packageItems.length > MAX_BOOTSTRAP_ROWS,
        requirementCount: Math.min(requirements.length, MAX_BOOTSTRAP_ROWS),
      },
      execution: {
        actualCostCents: submilestone.actualCostCents,
        actualStartedAt: submilestone.actualStartedAt,
        completionForecastDate: submilestone.completionForecastDate,
        fieldNote: submilestone.fieldNote,
        progressPercent: submilestone.progressPercent ?? 0,
      },
      milestone: {
        buildMilestoneId: milestone._id,
        key: milestone.key,
        name: milestone.name,
        planningState: milestone.planningState ?? "active",
        status: milestone.status,
      },
      ownership: { reason: ownership.reason, state: ownership.state },
      parentReadiness: {
        approvedChildCount,
        childCount: Math.min(scopedSiblings.length, MAX_BOOTSTRAP_ROWS),
        partial,
        readyForApproval:
          !partial &&
          scopedSiblings.length > 0 &&
          approvedChildCount === scopedSiblings.length,
      },
      persona: authorization.effectiveRole.role,
      review: {
        evidenceReviewState: submilestone.evidenceReviewState ?? "not_ready",
        reviewDecisionState: submilestone.reviewDecisionState ?? "in_review",
        reviewRound: submilestone.evidenceReviewRound ?? 0,
        siteVisitRequirementStatus: siteVisitRequirement?.status,
      },
      revisions: {
        canonicalWorkflowRevision: submilestone.workflowRevision ?? 0,
        companionRevision: companion.currentRevision,
        evidencePackageRevision: packageRevision?.revision,
        parentReviewRevision: milestone.reviewRevision ?? 0,
        reviewRevision: submilestone.reviewRevision ?? 0,
      },
      schedule: {
        durationDays: submilestone.durationDays,
        parentDayEnd: milestone.dayEnd,
        parentDayStart: milestone.dayStart,
        startDay: submilestone.startDay,
      },
      state: superseded ? ("superseded" as const) : ("visible" as const),
      submilestone: {
        buildSubmilestoneId: submilestone._id,
        key: submilestone.key,
        name: submilestone.name,
        planningState: submilestone.planningState ?? "active",
        scopeOfWorkTiptapJson: submilestone.scopeOfWorkTiptapJson,
        status: submilestone.status,
        supersededAt: submilestone.supersededAt,
      },
    };
  })
  .public();

function allowed(allowedValue: boolean, reason: string) {
  return allowedValue
    ? { allowed: true as const }
    : { allowed: false as const, reason };
}

function buildCapabilities(input: {
  authorization: ActiveBuildAuthorization;
  startAuthority: Awaited<
    ReturnType<typeof resolveSubmilestoneOperateAuthority>
  >;
  superseded: boolean;
  updateAuthority: Awaited<
    ReturnType<typeof resolveSubmilestoneOperateAuthority>
  >;
}) {
  const role = input.authorization.effectiveRole.role;
  const disabledReason = "Historical Sub-milestones are read-only.";
  const startReason = input.startAuthority.allowed
    ? ""
    : operateDenialMessage(input.startAuthority.denial);
  const updateReason = input.updateAuthority.allowed
    ? ""
    : operateDenialMessage(input.updateAuthority.denial);
  const canOperate = !input.superseded && input.updateAuthority.allowed;
  const lenderStaff = isLenderStaff(role);
  const lenderAdmin = role === "admin";
  const fullStructure =
    role === "admin" || role === "builder" || role === "builder-staff";
  const assignedContractor =
    role === "contractor" && input.updateAuthority.allowed;
  const canComment =
    !input.superseded &&
    (fullStructure ||
      assignedContractor ||
      role === "homeowner" ||
      lenderStaff);
  const reason = input.superseded
    ? disabledReason
    : "Not permitted for this persona.";
  const structureReason = input.superseded
    ? disabledReason
    : "Companion structure editing is not enabled for generated Sub-milestones.";
  return {
    canonical: {
      approveChild: allowed(!input.superseded && lenderAdmin, reason),
      retractChildApproval: allowed(!input.superseded && lenderAdmin, reason),
      start: allowed(
        !input.superseded && input.startAuthority.allowed,
        input.superseded ? disabledReason : startReason,
      ),
      submitCompletion: allowed(
        canOperate,
        input.superseded ? disabledReason : updateReason,
      ),
      updateEvidence: allowed(
        canOperate,
        input.superseded ? disabledReason : updateReason,
      ),
      updateExecution: allowed(
        canOperate,
        input.superseded ? disabledReason : updateReason,
      ),
      waiveSiteVisit: allowed(!input.superseded && lenderAdmin, reason),
    },
    collaboration: {
      addAttachment: allowed(canComment, reason),
      addChecklist: allowed(false, structureReason),
      comment: allowed(canComment, reason),
      createChild: allowed(false, structureReason),
      linkRelation: allowed(false, structureReason),
      toggleChecklist: allowed(false, structureReason),
    },
    review: {
      recommend: allowed(!input.superseded && lenderStaff, reason),
      requestChanges: allowed(!input.superseded && lenderStaff, reason),
    },
  };
}

export const getBuildSubmilestoneWorkspaceCollection = authenticatedQuery
  .input({
    buildId: v.id("activeBuilds"),
    buildSubmilestoneId: v.id("buildSubmilestones"),
    companionActionItemId: v.optional(v.id("buildActionItems")),
    collection: workspaceCollectionValidator,
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
    organizationId: v.string(),
    viewerCapacity: v.optional(buildCollaborationRoleValidator),
  })
  .returns(workspaceCollectionResultValidator)
  .handler(async (ctx, args) => {
    const resolved = await resolveBuildSubmilestoneWorkspaceContext(ctx, args);
    if (resolved.state !== "visible") {
      return resolved;
    }
    const { authorization, companion, milestone, submilestone } = resolved;
    const superseded =
      submilestone.planningState === "superseded" ||
      companion.canonicalPlanningState === "superseded" ||
      (companion.canonicalCompanionDisposition !== undefined &&
        companion.canonicalCompanionDisposition !== "active");
    const rows = await loadWorkspaceCollectionRows(ctx, {
      authorization,
      collection: args.collection,
      companion,
      cursor: args.cursor ?? null,
      limit: normalizeLimit(args.limit),
      milestone,
      submilestone,
    });
    if ("code" in rows) {
      return rows;
    }
    const page = rows.rows.filter(
      (row): row is WorkspaceCollectionRow => row !== null,
    );
    return {
      canonicalWorkflowRevision: submilestone.workflowRevision ?? 0,
      collection: args.collection,
      companionActionItemId: companion._id,
      companionRevision: companion.currentRevision,
      hasMore: rows.hasMore,
      nextCursor: rows.nextCursor,
      page,
      partial: rows.partial || rows.rows.some((row) => row === null),
      state: superseded ? ("superseded" as const) : ("visible" as const),
    };
  })
  .public();

function normalizeLimit(limit: number | undefined) {
  if (limit === undefined || !Number.isFinite(limit)) {
    return DEFAULT_PAGE_SIZE;
  }
  return Math.max(1, Math.min(MAX_PAGE_SIZE, Math.floor(limit)));
}

function integrityError(code: string, message: string) {
  return { code, message, state: "integrity_error" as const };
}

function validateBootstrapProjectionScope(input: {
  authorization: ActiveBuildAuthorization;
  milestone: Doc<"buildMilestones">;
  packageItems: Doc<"buildSubmilestoneEvidencePackageItems">[];
  packageRevision: Doc<"buildSubmilestoneEvidencePackageRevisions"> | null;
  requirements: Doc<"buildSubmilestoneEvidenceRequirements">[];
  siteVisitRequirement: Doc<"buildSubmilestoneSiteVisitRequirements"> | null;
  submilestone: Doc<"buildSubmilestones">;
}) {
  const inScope = (record: {
    brokerageId: Id<"brokerages">;
    buildId: Id<"activeBuilds">;
    buildMilestoneId: Id<"buildMilestones">;
    buildSubmilestoneId: Id<"buildSubmilestones">;
    organizationId: string;
  }) =>
    record.buildId === input.authorization.build._id &&
    record.organizationId === input.authorization.organizationId &&
    record.brokerageId === input.authorization.brokerage._id &&
    record.buildMilestoneId === input.milestone._id &&
    record.buildSubmilestoneId === input.submilestone._id;
  if (
    (input.submilestone.evidencePackageRevisionId !== undefined &&
      input.packageRevision === null) ||
    (input.packageRevision &&
      input.packageRevision._id !==
        input.submilestone.evidencePackageRevisionId) ||
    (input.submilestone.siteVisitRequirementId !== undefined &&
      input.siteVisitRequirement === null) ||
    (input.siteVisitRequirement &&
      input.siteVisitRequirement._id !==
        input.submilestone.siteVisitRequirementId) ||
    (input.packageRevision && !inScope(input.packageRevision)) ||
    (input.siteVisitRequirement && !inScope(input.siteVisitRequirement)) ||
    input.requirements.some((record) => !inScope(record)) ||
    input.packageItems.some(
      (record) =>
        !inScope(record) ||
        record.packageRevisionId !== input.packageRevision?._id,
    )
  ) {
    return integrityError(
      "CANONICAL_PROJECTION_SCOPE_INVALID",
      "A canonical Sub-milestone projection is outside the authorized Build scope.",
    );
  }
  return null;
}

async function loadWorkspaceCollectionRows(
  ctx: QueryCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    collection: WorkspaceCollection;
    companion: Doc<"buildActionItems">;
    cursor: string | null;
    limit: number;
    milestone: Doc<"buildMilestones">;
    submilestone: Doc<"buildSubmilestones">;
  },
): Promise<
  | { state: "integrity_error"; code: string; message: string }
  | {
      hasMore: boolean;
      nextCursor?: string;
      rows: Array<WorkspaceCollectionRow | null>;
      partial: boolean;
    }
> {
  const {
    authorization,
    collection,
    companion,
    cursor,
    limit,
    milestone,
    submilestone,
  } = input;
  const canonicalScope = (record: {
    brokerageId: Id<"brokerages">;
    buildId: Id<"activeBuilds">;
    organizationId: string;
  }) =>
    record.buildId === authorization.build._id &&
    record.organizationId === authorization.organizationId &&
    record.brokerageId === authorization.brokerage._id;
  const companionScope = (record: {
    actionItemId: Id<"buildActionItems">;
    brokerageId: Id<"brokerages">;
    buildId: Id<"activeBuilds">;
    organizationId: string;
  }) => canonicalScope(record) && record.actionItemId === companion._id;
  let rows: Array<WorkspaceCollectionRow | null> = [];
  let hasMore = false;
  let nextCursor: string | undefined;
  const applyPagination = (page: {
    continueCursor: string;
    isDone: boolean;
  }) => {
    hasMore = !page.isDone;
    nextCursor = page.isDone ? undefined : page.continueCursor;
  };

  if (collection === "evidence_requirements") {
    const result = await ctx.db
      .query("buildSubmilestoneEvidenceRequirements")
      .withIndex("by_submilestone", (query) =>
        query.eq("buildSubmilestoneId", submilestone._id).eq("active", true),
      )
      .paginate({ cursor, numItems: limit });
    applyPagination(result);
    const records = result.page;
    if (
      records.some(
        (record) =>
          !canonicalScope(record) ||
          record.buildMilestoneId !== milestone._id ||
          record.buildSubmilestoneId !== submilestone._id,
      )
    ) {
      return integrityError(
        "COLLECTION_SCOPE_INVALID",
        "Evidence requirements are outside the authorized Sub-milestone scope.",
      );
    }
    rows = records.map((record) => ({
      createdAt: record.createdAt,
      detail: record.description,
      id: record._id,
      kind: record.kind,
      required: record.required,
      status: record.active ? "active" : "inactive",
      title: record.label,
    }));
  } else if (collection === "evidence_assets") {
    const result = await ctx.db
      .query("buildEvidenceAssets")
      .withIndex("by_build_milestone", (query) =>
        query
          .eq("buildId", authorization.build._id)
          .eq("milestoneKey", milestone.key),
      )
      .order("desc")
      .paginate({ cursor, numItems: limit });
    applyPagination(result);
    const source = result.page;
    if (source.some((record) => !canonicalScope(record))) {
      return integrityError(
        "COLLECTION_SCOPE_INVALID",
        "Evidence assets are outside the authorized Sub-milestone scope.",
      );
    }
    rows = source.map((record) =>
      record.submilestoneKey === submilestone.key
        ? {
            createdAt: record.createdAt,
            detail: record.fileName,
            id: record._id,
            kind: record.tag,
            locationVerified: record.locationVerified,
            title: record.label,
          }
        : null,
    );
  } else if (collection === "people_assignments") {
    const result = await ctx.db
      .query("milestoneContractorAssignments")
      .withIndex("by_submilestone", (query) =>
        query
          .eq("buildId", authorization.build._id)
          .eq("milestoneKey", milestone.key)
          .eq("submilestoneKey", submilestone.key),
      )
      .paginate({ cursor, numItems: limit });
    applyPagination(result);
    const records = result.page;
    if (
      records.some(
        (record) =>
          !canonicalScope(record) ||
          record.buildMilestoneId !== milestone._id ||
          record.buildSubmilestoneId !== submilestone._id,
      )
    ) {
      return integrityError(
        "COLLECTION_SCOPE_INVALID",
        "People assignments are outside the authorized Sub-milestone scope.",
      );
    }
    const canReadAssignmentCosts =
      authorization.effectiveRole.role !== "contractor" &&
      authorization.effectiveRole.role !== "homeowner";
    rows = records.map((record) => ({
      amountCents: canReadAssignmentCosts
        ? (record.actualCostCents ?? record.estimatedCostCents)
        : undefined,
      createdAt: record.createdAt,
      detail: record.note,
      id: record._id,
      kind: "contractor_assignment",
      status: record.status,
      title: record.role,
    }));
  } else if (collection === "materials") {
    const result = await ctx.db
      .query("buildCostItems")
      .withIndex("by_build_milestone", (query) =>
        query
          .eq("buildId", authorization.build._id)
          .eq("milestoneKey", milestone.key),
      )
      .paginate({ cursor, numItems: limit });
    applyPagination(result);
    const source = result.page;
    if (
      source.some(
        (record) =>
          !canonicalScope(record) || record.buildMilestoneId !== milestone._id,
      )
    ) {
      return integrityError(
        "COLLECTION_SCOPE_INVALID",
        "Materials are outside the authorized Sub-milestone scope.",
      );
    }
    const canReadMaterialCosts =
      authorization.effectiveRole.role !== "contractor" &&
      authorization.effectiveRole.role !== "homeowner";
    rows = source.map((record) =>
      record.itemType === "material" &&
      (record.budgetSubmilestoneKey === submilestone.key ||
        record.relevantSubmilestoneKeys.includes(submilestone.key))
        ? {
            amountCents: canReadMaterialCosts ? record.costCents : undefined,
            createdAt: record.createdAt,
            detail: record.description,
            id: record._id,
            kind: record.itemType,
            status: record.budgetTreatment,
            title: record.title,
          }
        : null,
    );
  } else if (collection === "collaboration_comments") {
    const result = await ctx.db
      .query("buildActionItemComments")
      .withIndex("by_actionItemId_and_createdAt", (query) =>
        query.eq("actionItemId", companion._id),
      )
      .order("desc")
      .paginate({ cursor, numItems: limit });
    applyPagination(result);
    const records = result.page;
    if (records.some((record) => !companionScope(record))) {
      return integrityError(
        "COLLECTION_SCOPE_INVALID",
        "Comments are outside the authorized collaboration companion scope.",
      );
    }
    rows = records.map((record) => ({
      createdAt: record.createdAt,
      detail: record.plainText,
      id: record._id,
      kind: "comment",
      title: record.authorDisplayNameSnapshot,
    }));
  } else if (collection === "collaboration_activity") {
    const result = await ctx.db
      .query("buildActionItemEvents")
      .withIndex("by_actionItemId_and_createdAt", (query) =>
        query.eq("actionItemId", companion._id),
      )
      .order("desc")
      .paginate({ cursor, numItems: limit });
    applyPagination(result);
    const records = result.page;
    if (records.some((record) => !companionScope(record))) {
      return integrityError(
        "COLLECTION_SCOPE_INVALID",
        "Activity is outside the authorized collaboration companion scope.",
      );
    }
    rows = records.map((record) => ({
      createdAt: record.createdAt,
      detail: record.reason,
      id: record._id,
      kind: record.eventType,
      status: record.newState,
      title: record.eventType,
    }));
  } else if (collection === "collaboration_revisions") {
    const result = await ctx.db
      .query("buildActionItemRevisions")
      .withIndex("by_actionItemId_and_revision", (query) =>
        query.eq("actionItemId", companion._id),
      )
      .order("desc")
      .paginate({ cursor, numItems: limit });
    applyPagination(result);
    const records = result.page;
    if (records.some((record) => !companionScope(record))) {
      return integrityError(
        "COLLECTION_SCOPE_INVALID",
        "Revisions are outside the authorized collaboration companion scope.",
      );
    }
    rows = records.map((record) => ({
      createdAt: record.createdAt,
      detail: record.reason,
      id: record._id,
      kind: "revision",
      status: String(record.revision),
      title: `Revision ${record.revision}`,
    }));
  } else if (collection === "collaboration_checklist") {
    const result = await ctx.db
      .query("buildActionItemChecklistItems")
      .withIndex("by_actionItemId_and_order", (query) =>
        query.eq("actionItemId", companion._id),
      )
      .paginate({ cursor, numItems: limit });
    applyPagination(result);
    const records = result.page;
    if (records.some((record) => !companionScope(record))) {
      return integrityError(
        "COLLECTION_SCOPE_INVALID",
        "Checklist rows are outside the authorized collaboration companion scope.",
      );
    }
    rows = records.map((record) => ({
      completed: record.completed,
      createdAt: record.createdAt,
      id: record._id,
      kind: "checklist",
      required: record.required,
      status: record.completed ? "complete" : "open",
      title: record.label,
    }));
  } else if (collection === "collaboration_children") {
    const result = await ctx.db
      .query("buildActionItems")
      .withIndex("by_parentActionItemId_and_status", (query) =>
        query.eq("parentActionItemId", companion._id),
      )
      .paginate({ cursor, numItems: limit });
    applyPagination(result);
    const records = result.page;
    if (
      records.some(
        (record) =>
          !canonicalScope(record) ||
          record.parentActionItemId !== companion._id,
      )
    ) {
      return integrityError(
        "COLLECTION_SCOPE_INVALID",
        "Child Action Items are outside the authorized collaboration companion scope.",
      );
    }
    rows = records.map((record) => ({
      createdAt: record.createdAt,
      detail: record.descriptionPlainText,
      id: record._id,
      kind: "action_item",
      status: record.status,
      title: record.title,
    }));
  } else if (collection === "collaboration_relations") {
    const result = await ctx.db
      .query("buildActionItemRelations")
      .withIndex("by_buildId_and_status", (query) =>
        query.eq("buildId", authorization.build._id).eq("status", "active"),
      )
      .paginate({ cursor, numItems: limit });
    applyPagination(result);
    const records = result.page;
    if (records.some((record) => !canonicalScope(record))) {
      return integrityError(
        "COLLECTION_SCOPE_INVALID",
        "Relations are outside the authorized collaboration companion scope.",
      );
    }
    rows = records.map((record) =>
      record.sourceActionItemId === companion._id ||
      record.targetActionItemId === companion._id
        ? {
            createdAt: record.createdAt,
            detail:
              record.sourceActionItemId === companion._id
                ? "outgoing"
                : "incoming",
            id: record._id,
            kind: record.kind,
            status: record.status,
            title: record.kind.replaceAll("_", " "),
          }
        : null,
    );
  } else {
    const result = await ctx.db
      .query("buildSubmilestoneReviewDecisions")
      .withIndex("by_submilestone_createdAt", (query) =>
        query.eq("buildSubmilestoneId", submilestone._id),
      )
      .order("desc")
      .paginate({ cursor, numItems: limit });
    applyPagination(result);
    const records = result.page;
    if (
      records.some(
        (record) =>
          !canonicalScope(record) ||
          record.buildMilestoneId !== milestone._id ||
          record.buildSubmilestoneId !== submilestone._id,
      )
    ) {
      return integrityError(
        "COLLECTION_SCOPE_INVALID",
        "Review decisions are outside the authorized Sub-milestone scope.",
      );
    }
    rows = records.map((record) => ({
      createdAt: record.createdAt,
      detail: record.reason ?? record.note,
      id: record._id,
      kind: record.kind,
      status: record.newState,
      title: record.kind.replaceAll("_", " "),
    }));
  }

  return { hasMore, nextCursor, partial: false, rows };
}

function isLenderStaff(role: BuildCollaborationRole) {
  return (
    role === "admin" ||
    role === "principle-broker" ||
    role === "broker" ||
    role === "broker-staff"
  );
}

function isWorkspaceAccessDenial(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }
  return (
    error.message.startsWith("Forbidden:") ||
    error.message === BUILD_COLLABORATION_UNAVAILABLE_ERROR ||
    error.message ===
      "Build Collaboration is temporarily frozen for a rollback rehearsal snapshot."
  );
}

export async function resolveBuildSubmilestoneWorkspaceContext(
  ctx: QueryCtx & { viewer: AuthorizedViewer },
  args: {
    buildId: Id<"activeBuilds">;
    buildSubmilestoneId: Id<"buildSubmilestones">;
    companionActionItemId?: Id<"buildActionItems">;
    organizationId: string;
    viewerCapacity?: BuildCollaborationRole;
  },
): Promise<
  | { state: "revoked" }
  | { code: string; message: string; state: "integrity_error" }
  | ({ state: "visible" } & WorkspaceContext)
> {
  let authorization: ActiveBuildAuthorization;
  try {
    authorization = selectActiveBuildAuthorizationCapacity(
      await authorizeActiveBuildCollaborationAccess(ctx, args),
      args.viewerCapacity,
    );
  } catch (error) {
    if (isWorkspaceAccessDenial(error)) {
      return { state: "revoked" };
    }
    throw error;
  }
  const submilestone = await ctx.db.get(args.buildSubmilestoneId);
  if (!submilestone) {
    return { state: "revoked" };
  }
  const milestone = await ctx.db.get(submilestone.buildMilestoneId);
  if (
    !milestone ||
    submilestone.buildId !== authorization.build._id ||
    submilestone.organizationId !== authorization.organizationId ||
    submilestone.brokerageId !== authorization.brokerage._id ||
    milestone.buildId !== authorization.build._id ||
    milestone.organizationId !== authorization.organizationId ||
    milestone.brokerageId !== authorization.brokerage._id ||
    submilestone.milestoneKey !== milestone.key
  ) {
    return { state: "revoked" };
  }
  const canRead = await canReadCanonicalMilestoneSubmilestone(ctx, {
    build: authorization.build,
    milestone,
    role: authorization.effectiveRole.role,
    submilestone,
    workosUserId: authorization.viewer.subject,
  });
  if (!canRead) {
    return { state: "revoked" };
  }
  const candidates = await ctx.db
    .query("buildActionItems")
    .withIndex("by_canonicalBuildSubmilestoneId_and_systemMode", (query) =>
      query
        .eq("canonicalBuildSubmilestoneId", submilestone._id)
        .eq("systemMode", "generated_milestone_submilestone"),
    )
    .take(MAX_COMPANION_CANDIDATES + 1);
  if (candidates.length > MAX_COMPANION_CANDIDATES) {
    return {
      code: "COMPANION_AMBIGUOUS",
      message:
        "Too many collaboration companions are bound to this Sub-milestone.",
      state: "integrity_error",
    };
  }
  const eligible = candidates.filter((candidate) =>
    submilestone.planningState === "superseded"
      ? candidate.canonicalPlanningState === "superseded" ||
        candidate.canonicalCompanionDisposition === "historical"
      : candidate.canonicalPlanningState !== "superseded" &&
        (candidate.canonicalCompanionDisposition === undefined ||
          candidate.canonicalCompanionDisposition === "active"),
  );
  if (eligible.length !== 1) {
    return {
      code: eligible.length === 0 ? "COMPANION_MISSING" : "COMPANION_DUPLICATE",
      message:
        eligible.length === 0
          ? "The collaboration companion is unavailable for this Sub-milestone."
          : "More than one collaboration companion is bound to this Sub-milestone.",
      state: "integrity_error",
    };
  }
  const companion = eligible[0]!;
  if (
    args.companionActionItemId &&
    args.companionActionItemId !== companion._id
  ) {
    const requestedCompanion = await ctx.db.get(args.companionActionItemId);
    const validatesHistoricalIdentity =
      requestedCompanion?.systemMode === "generated_milestone_submilestone" &&
      requestedCompanion.historicalCanonicalBuildSubmilestoneId ===
        submilestone._id &&
      requestedCompanion.canonicalCompanionSurvivorId === companion._id &&
      requestedCompanion.buildId === authorization.build._id &&
      requestedCompanion.organizationId === authorization.organizationId &&
      requestedCompanion.brokerageId === authorization.brokerage._id &&
      requestedCompanion.canonicalBuildMilestoneId === milestone._id;
    if (!validatesHistoricalIdentity) {
      return {
        code: "COMPANION_ID_MISMATCH",
        message:
          "The requested companion does not match the canonical Sub-milestone.",
        state: "integrity_error",
      };
    }
  }
  const post = await ctx.db.get(companion.originatingPostId);
  if (
    !post ||
    companion.buildId !== authorization.build._id ||
    companion.organizationId !== authorization.organizationId ||
    companion.brokerageId !== authorization.brokerage._id ||
    companion.canonicalBuildMilestoneId !== milestone._id ||
    post.buildId !== authorization.build._id ||
    post.organizationId !== authorization.organizationId ||
    post.brokerageId !== authorization.brokerage._id ||
    post.canonicalBuildMilestoneId !== milestone._id ||
    post.systemPostKind !== "milestone" ||
    !(await canReadCollaborationPost(ctx, authorization, post))
  ) {
    return {
      code: "COMPANION_BINDING_INVALID",
      message:
        "The collaboration companion binding is malformed or unavailable.",
      state: "integrity_error",
    };
  }
  return {
    authorization,
    companion,
    milestone,
    post,
    state: "visible",
    submilestone,
  };
}
