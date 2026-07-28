import { v } from "convex/values";

import {
  type AuthorizedViewer,
  type RoleSlug,
  backofficeMutation,
  backofficeQuery,
  contractorMutation,
  contractorQuery,
  normalizeRoleSlugs,
} from "./authz";
import { requireContractorLinkedProfile } from "./contractorAuth";
import type { Doc, Id, MutationCtx, QueryCtx } from "./types";

/**
 * Contractor supporting evidence, acknowledgements, and scope-issue module.
 *
 * These are the contractor-initiated write surfaces inside the Contractor
 * Workspace (PRD §8.7 evidence, §13.6 acknowledgements/issues, §14.3/§14.4
 * state machines). Every function is contractor-scoped (requires the linked
 * canonical profile) OR backoffice-scoped for review, and every material
 * action writes audit history (PRD §11.3).
 *
 * Hard guarantees enforced here:
 *  - Contractor evidence is supporting context only. It never auto-satisfies
 *    completion, draw, or approval requirements (PRD §3.14, §18).
 *  - Evidence uploads are constrained to the contractor's own assigned scope
 *    (PRD §3.36, user story 36).
 *  - Evidence is visible immediately to the assigned builder side and
 *    backoffice/lender staff (PRD §3.15). Other contractors never see it
 *    (PRD §8.7, user story 36).
 */

const ALLOWED_EVIDENCE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/webp",
  "application/pdf",
]);

const contractorRoleQuery = contractorQuery.use(requireContractorLinkedProfile);
const contractorRoleMutation = contractorMutation.use(
  requireContractorLinkedProfile
);

// ---------------------------------------------------------------------------
// Shared assignment-scope authorization
// ---------------------------------------------------------------------------

interface ContractorAssignmentRef {
  assignmentType: "proposal" | "build";
  proposalAssignmentId?: Id<"proposalMilestoneContractorAssignments">;
  buildAssignmentId?: Id<"milestoneContractorAssignments">;
  proposalId?: Id<"buildProposals">;
  buildId?: Id<"activeBuilds">;
  milestoneKey: string;
  submilestoneKey?: string;
}

/**
 * Resolve + authorize that the contractor owns the target assignment scope.
 * Throws if the assignment does not belong to the linked contractor profile.
 * Returns the hydrated proposal/build ids used to key the evidence row.
 */
async function authorizeAssignmentScope(
  ctx: QueryCtx,
  contractorId: Id<"contractorProfiles">,
  input: ContractorAssignmentRef
): Promise<{
  proposalId: Id<"buildProposals"> | null;
  buildId: Id<"activeBuilds"> | null;
}> {
  if (input.assignmentType === "proposal") {
    if (!input.proposalAssignmentId) {
      throw new Error("Proposal assignment id is required.");
    }
    const assignment = await ctx.db.get(input.proposalAssignmentId);
    if (
      !assignment ||
      assignment.contractorId !== contractorId ||
      assignment.status === "removed"
    ) {
      throw new Error("Forbidden: evidence must target your own assignment");
    }
    return {
      proposalId: assignment.proposalId,
      buildId: null,
    };
  }
  if (!input.buildAssignmentId) {
    throw new Error("Build assignment id is required.");
  }
  const assignment = await ctx.db.get(input.buildAssignmentId);
  if (
    !assignment ||
    assignment.contractorId !== contractorId ||
    assignment.status === "removed"
  ) {
    throw new Error("Forbidden: evidence must target your own assignment");
  }
  return { proposalId: null, buildId: assignment.buildId };
}

async function writeEvidenceEvent(
  ctx: MutationCtx,
  input: {
    brokerageId: Id<"brokerages">;
    organizationId: string;
    actorSubject: string;
    actorRoles: readonly RoleSlug[];
    command: string;
    contractorId: Id<"contractorProfiles">;
    evidenceId?: Id<"contractorEvidence">;
    eventType: string;
    newState?: string;
    priorState?: string;
  }
) {
  await ctx.db.insert("auditEvents", {
    actorRoles: input.actorRoles as RoleSlug[],
    actorWorkosUserId: input.actorSubject,
    brokerageId: input.brokerageId,
    command: input.command,
    createdAt: Date.now(),
    entityId: input.evidenceId ? String(input.evidenceId) : String(input.contractorId),
    entityType: input.evidenceId ? "contractorEvidence" : "contractorProfile",
    eventType: input.eventType,
    newState: input.newState,
    organizationId: input.organizationId,
    priorState: input.priorState,
    warnings: [],
  });
}

// ---------------------------------------------------------------------------
// Evidence upload (PRD §8.7)
// ---------------------------------------------------------------------------

/**
 * Generate a storage upload URL for contractor evidence. The URL is
 * unauthenticated on purpose (Convex storage handles the one-time token), but
 * this endpoint still requires the contractor role + linked profile so only
 * authenticated contractors can request upload URLs at all.
 */
export const generateContractorEvidenceUploadUrl = contractorRoleMutation
  .returns(v.string())
  .handler(async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  })
  .public();

/**
 * Register an uploaded contractor evidence file. Storage id comes from the
 * completed upload. The target assignment must belong to the linked contractor
 * (PRD §3.36). Source is always `contractor_submitted` with actor role
 * `contractor` (PRD §8.7).
 */
export const uploadContractorSupportingEvidence = contractorRoleMutation
  .input({
    assignmentType: v.union(v.literal("proposal"), v.literal("build")),
    proposalAssignmentId: v.optional(
      v.id("proposalMilestoneContractorAssignments")
    ),
    buildAssignmentId: v.optional(v.id("milestoneContractorAssignments")),
    milestoneKey: v.string(),
    submilestoneKey: v.optional(v.string()),
    caption: v.string(),
    storageId: v.id("_storage"),
    fileName: v.string(),
    mimeType: v.string(),
    sizeBytes: v.number(),
    tags: v.optional(v.array(v.string())),
    takenAt: v.optional(v.number()),
    linkedReminderEventId: v.optional(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(v.id("contractorEvidence"))
  .handler(async (ctx, args) => {
    const contractor = ctx.contractorProfile;
    if (!ALLOWED_EVIDENCE_MIME_TYPES.has(args.mimeType)) {
      throw new Error(
        `Unsupported evidence file type: ${args.mimeType}. Allowed: jpg, png, heic, webp, pdf.`
      );
    }
    const { proposalId, buildId } = await authorizeAssignmentScope(
      ctx,
      contractor._id,
      {
        assignmentType: args.assignmentType,
        buildAssignmentId: args.buildAssignmentId,
        milestoneKey: args.milestoneKey,
        proposalAssignmentId: args.proposalAssignmentId,
        submilestoneKey: args.submilestoneKey,
      }
    );

    const now = Date.now();
    const evidenceId = await ctx.db.insert("contractorEvidence", {
      buildAssignmentId: args.buildAssignmentId,
      buildId: buildId ?? undefined,
      brokerageId: contractor.brokerageId,
      caption: args.caption,
      contractorId: contractor._id,
      fileName: args.fileName,
      feedbackState: "submitted",
      linkedReminderEventId: args.linkedReminderEventId,
      milestoneKey: args.milestoneKey,
      mimeType: args.mimeType,
      organizationId: args.workosOrganizationId,
      proposalAssignmentId: args.proposalAssignmentId,
      proposalId: proposalId ?? undefined,
      sizeBytes: args.sizeBytes,
      source: "contractor_submitted",
      sourceActorRole: "contractor",
      storageId: args.storageId,
      submilestoneKey: args.submilestoneKey,
      tags: args.tags,
      takenAt: args.takenAt,
      targetType: args.assignmentType,
      uploadedAt: now,
      updatedAt: now,
    });

    await writeEvidenceEvent(ctx, {
      actorRoles: viewerRoles(ctx),
      actorSubject: viewerSubject(ctx),
      brokerageId: contractor.brokerageId,
      command: "uploadContractorSupportingEvidence",
      contractorId: contractor._id,
      evidenceId,
      eventType: "contractor.evidence.uploaded",
      newState: JSON.stringify({
        assignmentType: args.assignmentType,
        milestoneKey: args.milestoneKey,
      }),
      organizationId: args.workosOrganizationId,
    });

    return evidenceId;
  })
  .public();

/**
 * Contractor-visible evidence history (their own submissions + relevant scope
 * feedback). PRD §8.7: contractor sees their own submitted evidence only.
 */
export const listContractorEvidence = contractorRoleQuery
  .input({
    proposalId: v.optional(v.id("buildProposals")),
    buildId: v.optional(v.id("activeBuilds")),
    workosOrganizationId: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const contractor = ctx.contractorProfile;
    let rows: Doc<"contractorEvidence">[];
    if (args.buildId) {
      rows = await ctx.db
        .query("contractorEvidence")
        .withIndex("by_build", (q) => q.eq("buildId", args.buildId as Id<"activeBuilds">))
        .filter((q) => q.eq(q.field("contractorId"), contractor._id))
        .collect();
    } else if (args.proposalId) {
      rows = await ctx.db
        .query("contractorEvidence")
        .withIndex("by_proposal", (q) => q.eq("proposalId", args.proposalId as Id<"buildProposals">))
        .filter((q) => q.eq(q.field("contractorId"), contractor._id))
        .collect();
    } else {
      rows = await ctx.db
        .query("contractorEvidence")
        .withIndex("by_contractor", (q) =>
          q.eq("contractorId", contractor._id)
        )
        .collect();
    }
    return rows
      .sort((a, b) => b.uploadedAt - a.uploadedAt)
      .map((row) => redactContractorEvidence(row));
  })
  .public();

/**
 * Evidence visible to builder/backoffice for a given scope (PRD §8.7 visibility,
 * user story 49/64). Builder-side sees contractor evidence for their own
 * proposal/build immediately; backoffice sees brokerage-wide.
 */
export const listContractorEvidenceForReview = backofficeQuery
  .input({
    proposalId: v.optional(v.id("buildProposals")),
    buildId: v.optional(v.id("activeBuilds")),
    contractorId: v.optional(v.id("contractorProfiles")),
    workosOrganizationId: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const scope = await resolveBrokerageScopeOrThrow(
      ctx,
      args.workosOrganizationId
    );
    let rows: Doc<"contractorEvidence">[];
    if (args.buildId) {
      rows = await ctx.db
        .query("contractorEvidence")
        .withIndex("by_build", (q) => q.eq("buildId", args.buildId as Id<"activeBuilds">))
        .collect();
    } else if (args.proposalId) {
      rows = await ctx.db
        .query("contractorEvidence")
        .withIndex("by_proposal", (q) => q.eq("proposalId", args.proposalId as Id<"buildProposals">))
        .collect();
    } else if (args.contractorId) {
      rows = await ctx.db
        .query("contractorEvidence")
        .withIndex("by_contractor", (q) =>
          q.eq("contractorId", args.contractorId as Id<"contractorProfiles">)
        )
        .collect();
    } else {
      rows = await ctx.db
        .query("contractorEvidence")
        .withIndex("by_feedback", (q) => q.eq("feedbackState", "submitted"))
        .collect();
    }
    return rows
      .filter((row) => row.brokerageId === scope.brokerage._id)
      .sort((a, b) => b.uploadedAt - a.uploadedAt)
      .map((row) => redactContractorEvidence(row));
  })
  .public();

/**
 * Backoffice/builder review of contractor evidence (PRD user story 65, §8.7
 * feedback states). Marks useful / not relevant / more context requested /
 * replacement requested. Never auto-satisfies completion or draw eligibility
 * (PRD §3.14).
 */
export const reviewContractorEvidence = backofficeMutation
  .input({
    evidenceId: v.id("contractorEvidence"),
    feedbackState: v.union(
      v.literal("useful"),
      v.literal("not_relevant"),
      v.literal("more_context_requested"),
      v.literal("replacement_requested"),
      v.literal("addressed")
    ),
    note: v.optional(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(v.id("contractorEvidence"))
  .handler(async (ctx, args) => {
    const scope = await resolveBrokerageScopeOrThrow(
      ctx,
      args.workosOrganizationId
    );
    const evidence = await ctx.db.get(args.evidenceId);
    if (!evidence || evidence.brokerageId !== scope.brokerage._id) {
      throw new Error("Evidence not found in brokerage.");
    }
    const now = Date.now();
    const priorState = evidence.feedbackState;
    await ctx.db.patch(args.evidenceId, {
      feedbackAt: now,
      feedbackByWorkosUserId: scope.subject,
      feedbackNote: args.note,
      feedbackState: args.feedbackState,
      updatedAt: now,
    });
    await ctx.db.insert("contractorNotifications", {
      brokerageId: scope.brokerage._id,
      body: args.note,
      buildId: evidence.buildId,
      channel: "in_app",
      contractorId: evidence.contractorId,
      evidenceId: evidence._id,
      kind: "evidence_feedback",
      milestoneKey: evidence.milestoneKey,
      organizationId: args.workosOrganizationId,
      proposalId: evidence.proposalId,
      title: `Evidence feedback: ${args.feedbackState.replace(/_/g, " ")}`,
      createdAt: now,
    });
    await writeEvidenceEvent(ctx, {
      actorRoles: scope.roles,
      actorSubject: scope.subject,
      brokerageId: scope.brokerage._id,
      command: "reviewContractorEvidence",
      contractorId: evidence.contractorId,
      evidenceId: evidence._id,
      eventType: "contractor.evidence.reviewed",
      newState: JSON.stringify({ feedbackState: args.feedbackState }),
      organizationId: args.workosOrganizationId,
      priorState: JSON.stringify({ feedbackState: priorState }),
    });
    return evidence._id;
  })
  .public();

/**
 * Contractor marks evidence feedback as addressed (PRD user story 39, §14.4).
 * Transitions more_context_requested / replacement_requested → addressed.
 */
export const addressContractorEvidenceFeedback = contractorRoleMutation
  .input({
    evidenceId: v.id("contractorEvidence"),
    note: v.optional(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(v.id("contractorEvidence"))
  .handler(async (ctx, args) => {
    const contractor = ctx.contractorProfile;
    const evidence = await ctx.db.get(args.evidenceId);
    if (!evidence || evidence.contractorId !== contractor._id) {
      throw new Error("Forbidden: evidence does not belong to your profile.");
    }
    if (
      evidence.feedbackState !== "more_context_requested" &&
      evidence.feedbackState !== "replacement_requested"
    ) {
      throw new Error(
        `Cannot address feedback in state ${evidence.feedbackState}`
      );
    }
    const now = Date.now();
    const prior = evidence.feedbackState;
    await ctx.db.patch(args.evidenceId, {
      feedbackNote: args.note ?? evidence.feedbackNote,
      feedbackState: "addressed",
      updatedAt: now,
    });
    await writeEvidenceEvent(ctx, {
      actorRoles: viewerRoles(ctx),
      actorSubject: viewerSubject(ctx),
      brokerageId: contractor.brokerageId,
      command: "addressContractorEvidenceFeedback",
      contractorId: contractor._id,
      evidenceId: evidence._id,
      eventType: "contractor.evidence.feedback_addressed",
      newState: JSON.stringify({ feedbackState: "addressed" }),
      organizationId: args.workosOrganizationId,
      priorState: JSON.stringify({ feedbackState: prior }),
    });
    return evidence._id;
  })
  .public();

function redactContractorEvidence(row: Doc<"contractorEvidence">) {
  return {
    _id: row._id,
    assignmentType: row.targetType,
    proposalAssignmentId: row.proposalAssignmentId ?? null,
    buildAssignmentId: row.buildAssignmentId ?? null,
    proposalId: row.proposalId ?? null,
    buildId: row.buildId ?? null,
    milestoneKey: row.milestoneKey,
    submilestoneKey: row.submilestoneKey ?? null,
    caption: row.caption,
    fileName: row.fileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    storageId: row.storageId,
    tags: row.tags ?? [],
    source: row.source,
    feedbackState: row.feedbackState,
    feedbackNote: row.feedbackNote ?? null,
    uploadedAt: row.uploadedAt,
    takenAt: row.takenAt ?? null,
  };
}

// ---------------------------------------------------------------------------
// Assignment + schedule acknowledgements (PRD §13.6, §14.3)
// ---------------------------------------------------------------------------

/**
 * Acknowledge an assignment or schedule change (PRD user story 26, §14.3).
 * Idempotent: re-acknowledging updates the timestamp. Records the transition so
 * builder/backoffice know the contractor saw the assignment/change.
 */
export const acknowledgeContractorAssignment = contractorRoleMutation
  .input({
    assignmentType: v.union(v.literal("proposal"), v.literal("build")),
    proposalAssignmentId: v.optional(
      v.id("proposalMilestoneContractorAssignments")
    ),
    buildAssignmentId: v.optional(v.id("milestoneContractorAssignments")),
    kind: v.union(v.literal("assignment"), v.literal("schedule")),
    workosOrganizationId: v.string(),
  })
  .returns(v.id("contractorAcknowledgements"))
  .handler(async (ctx, args) => {
    const contractor = ctx.contractorProfile;
    await authorizeAssignmentScope(ctx, contractor._id, {
      assignmentType: args.assignmentType,
      buildAssignmentId: args.buildAssignmentId,
      milestoneKey: "",
      proposalAssignmentId: args.proposalAssignmentId,
    });
    const now = Date.now();
    const existing = await findAcknowledgement(ctx, contractor._id, args);
    if (existing) {
      await ctx.db.patch(existing._id, {
        acknowledgedAt: now,
        state: "acknowledged",
        updatedAt: now,
      });
      return existing._id;
    }
    return await ctx.db.insert("contractorAcknowledgements", {
      acknowledgedAt: now,
      assignmentType: args.assignmentType,
      brokerageId: contractor.brokerageId,
      buildAssignmentId: args.buildAssignmentId,
      contractorId: contractor._id,
      kind: args.kind,
      organizationId: args.workosOrganizationId,
      proposalAssignmentId: args.proposalAssignmentId,
      state: "acknowledged",
      createdAt: now,
      updatedAt: now,
    });
  })
  .public();

/**
 * Acknowledge a schedule change specifically (PRD user story 26). Same storage
 * as assignment ack but kind=schedule, so builders/backoffice can distinguish
 * "saw my assignment" from "saw the schedule update".
 */
export const acknowledgeContractorScheduleChange = contractorRoleMutation
  .input({
    assignmentType: v.union(v.literal("proposal"), v.literal("build")),
    proposalAssignmentId: v.optional(
      v.id("proposalMilestoneContractorAssignments")
    ),
    buildAssignmentId: v.optional(v.id("milestoneContractorAssignments")),
    workosOrganizationId: v.string(),
  })
  .returns(v.id("contractorAcknowledgements"))
  .handler(async (ctx, args) => {
    const contractor = ctx.contractorProfile;
    await authorizeAssignmentScope(ctx, contractor._id, {
      assignmentType: args.assignmentType,
      buildAssignmentId: args.buildAssignmentId,
      milestoneKey: "",
      proposalAssignmentId: args.proposalAssignmentId,
    });
    const now = Date.now();
    const existing = await findAcknowledgement(ctx, contractor._id, {
      ...args,
      kind: "schedule",
    });
    if (existing) {
      await ctx.db.patch(existing._id, {
        acknowledgedAt: now,
        state: "acknowledged",
        updatedAt: now,
      });
      return existing._id;
    }
    return await ctx.db.insert("contractorAcknowledgements", {
      acknowledgedAt: now,
      assignmentType: args.assignmentType,
      brokerageId: contractor.brokerageId,
      buildAssignmentId: args.buildAssignmentId,
      contractorId: contractor._id,
      kind: "schedule",
      organizationId: args.workosOrganizationId,
      proposalAssignmentId: args.proposalAssignmentId,
      state: "acknowledged",
      createdAt: now,
      updatedAt: now,
    });
  })
  .public();

async function findAcknowledgement(
  ctx: QueryCtx,
  contractorId: Id<"contractorProfiles">,
  input: {
    assignmentType: "proposal" | "build";
    proposalAssignmentId?: Id<"proposalMilestoneContractorAssignments">;
    buildAssignmentId?: Id<"milestoneContractorAssignments">;
    kind: "assignment" | "schedule";
  }
): Promise<Doc<"contractorAcknowledgements"> | null> {
  const rows = await ctx.db
    .query("contractorAcknowledgements")
    .withIndex("by_contractor_kind_state", (q) =>
      q
        .eq("contractorId", contractorId)
        .eq("kind", input.kind)
    )
    .collect();
  return (
    rows.find(
      (row) =>
        row.assignmentType === input.assignmentType &&
        ((input.assignmentType === "proposal" &&
          row.proposalAssignmentId === input.proposalAssignmentId) ||
          (input.assignmentType === "build" &&
            row.buildAssignmentId === input.buildAssignmentId))
    ) ?? null
  );
}

// ---------------------------------------------------------------------------
// Scope clarification + disputes (PRD §13.6, §14.3, user stories 27-29)
// ---------------------------------------------------------------------------

/**
 * Request a scope clarification (PRD user story 28). Opens a clarification
 * issue against an assigned scope; routes to builder/backoffice for response.
 */
export const requestContractorScopeClarification = contractorRoleMutation
  .input({
    assignmentType: v.union(v.literal("proposal"), v.literal("build")),
    proposalAssignmentId: v.optional(
      v.id("proposalMilestoneContractorAssignments")
    ),
    buildAssignmentId: v.optional(v.id("milestoneContractorAssignments")),
    milestoneKey: v.string(),
    submilestoneKey: v.optional(v.string()),
    summary: v.string(),
    detail: v.optional(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(v.id("contractorScopeIssues"))
  .handler(async (ctx, args) => {
    const contractor = ctx.contractorProfile;
    const { proposalId, buildId } = await authorizeAssignmentScope(
      ctx,
      contractor._id,
      args
    );
    return await createScopeIssue(ctx, {
      args,
      buildId,
      contractorId: contractor._id,
      kind: "clarification",
      proposalId,
      raisedByRole: "contractor",
      raisedBySubject: viewerSubject(ctx),
      roles: viewerRoles(ctx),
      scopeBrokerageId: contractor.brokerageId,
    });
  })
  .public();

/**
 * Flag a scope mismatch (PRD user story 27). Surfaces scope risk as an
 * attention flag visible to backoffice (PRD user story 66).
 */
export const flagContractorScopeMismatch = contractorRoleMutation
  .input({
    assignmentType: v.union(v.literal("proposal"), v.literal("build")),
    proposalAssignmentId: v.optional(
      v.id("proposalMilestoneContractorAssignments")
    ),
    buildAssignmentId: v.optional(v.id("milestoneContractorAssignments")),
    milestoneKey: v.string(),
    submilestoneKey: v.optional(v.string()),
    summary: v.string(),
    detail: v.optional(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(v.id("contractorScopeIssues"))
  .handler(async (ctx, args) => {
    const contractor = ctx.contractorProfile;
    const { proposalId, buildId } = await authorizeAssignmentScope(
      ctx,
      contractor._id,
      args
    );
    return await createScopeIssue(ctx, {
      args,
      buildId,
      contractorId: contractor._id,
      kind: "mismatch",
      proposalId,
      raisedByRole: "contractor",
      raisedBySubject: viewerSubject(ctx),
      roles: viewerRoles(ctx),
      scopeBrokerageId: contractor.brokerageId,
    });
  })
  .public();

async function createScopeIssue(
  ctx: MutationCtx,
  input: {
    args: {
      assignmentType: "proposal" | "build";
      milestoneKey: string;
      submilestoneKey?: string;
      summary: string;
      detail?: string;
      workosOrganizationId: string;
      proposalAssignmentId?: Id<"proposalMilestoneContractorAssignments">;
      buildAssignmentId?: Id<"milestoneContractorAssignments">;
    };
    buildId: Id<"activeBuilds"> | null;
    contractorId: Id<"contractorProfiles">;
    kind: "clarification" | "mismatch" | "schedule_conflict";
    proposalId: Id<"buildProposals"> | null;
    raisedByRole: string;
    raisedBySubject: string;
    roles: readonly RoleSlug[];
    scopeBrokerageId: Id<"brokerages">;
  }
) {
  const now = Date.now();
  const issueId = await ctx.db.insert("contractorScopeIssues", {
    assignmentType: input.args.assignmentType,
    brokerageId: input.scopeBrokerageId,
    buildAssignmentId: input.args.buildAssignmentId,
    buildId: input.buildId ?? undefined,
    contractorId: input.contractorId,
    createdAt: now,
    detail: input.args.detail,
    kind: input.kind,
    milestoneKey: input.args.milestoneKey,
    organizationId: input.args.workosOrganizationId,
    proposalAssignmentId: input.args.proposalAssignmentId,
    proposalId: input.proposalId ?? undefined,
    raisedByRole: input.raisedByRole,
    raisedByWorkosUserId: input.raisedBySubject,
    status: "open",
    submilestoneKey: input.args.submilestoneKey,
    summary: input.args.summary,
    updatedAt: now,
  });
  await writeEvidenceEvent(ctx, {
    actorRoles: input.roles,
    actorSubject: input.raisedBySubject,
    brokerageId: input.scopeBrokerageId,
    command: input.kind === "mismatch" ? "flagContractorScopeMismatch" : "requestContractorScopeClarification",
    contractorId: input.contractorId,
    eventType:
      input.kind === "mismatch"
        ? "contractor.scope.mismatch_flagged"
        : "contractor.scope.clarification_requested",
    newState: JSON.stringify({ issueId, milestoneKey: input.args.milestoneKey }),
    organizationId: input.args.workosOrganizationId,
  });
  return issueId;
}

/**
 * Builder/backoffice resolve a contractor scope issue (PRD user story 50, §14.3
 * resolved transitions).
 */
export const resolveContractorScopeIssue = backofficeMutation
  .input({
    issueId: v.id("contractorScopeIssues"),
    note: v.optional(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(v.id("contractorScopeIssues"))
  .handler(async (ctx, args) => {
    const scope = await resolveBrokerageScopeOrThrow(
      ctx,
      args.workosOrganizationId
    );
    const issue = await ctx.db.get(args.issueId);
    if (!issue || issue.brokerageId !== scope.brokerage._id) {
      throw new Error("Scope issue not found in brokerage.");
    }
    const now = Date.now();
    await ctx.db.patch(args.issueId, {
      resolutionNote: args.note,
      resolvedAt: now,
      resolvedByWorkosUserId: scope.subject,
      status: "resolved",
      updatedAt: now,
    });
    await ctx.db.insert("contractorNotifications", {
      brokerageId: scope.brokerage._id,
      body: args.note,
      buildId: issue.buildId,
      channel: "in_app",
      contractorId: issue.contractorId,
      kind: "clarification_resolved",
      milestoneKey: issue.milestoneKey,
      organizationId: args.workosOrganizationId,
      proposalId: issue.proposalId,
      scopeIssueId: issue._id,
      title: "Scope issue resolved",
      createdAt: now,
    });
    await ctx.db.insert("auditEvents", {
      actorRoles: scope.roles as RoleSlug[],
      actorWorkosUserId: scope.subject,
      brokerageId: scope.brokerage._id,
      command: "resolveContractorScopeIssue",
      createdAt: now,
      entityId: String(issue._id),
      entityType: "contractorScopeIssue",
      eventType: "contractor.scope.resolved",
      newState: JSON.stringify({ note: args.note }),
      organizationId: args.workosOrganizationId,
      warnings: [],
    });
    return issue._id;
  })
  .public();

/**
 * Contractor-visible scope issues for their profile (PRD user story 29).
 */
export const listContractorScopeIssues = contractorRoleQuery
  .returns(v.any())
  .handler(async (ctx) => {
    const contractor = ctx.contractorProfile;
    const rows = await ctx.db
      .query("contractorScopeIssues")
      .withIndex("by_contractor", (q) =>
        q.eq("contractorId", contractor._id)
      )
      .collect();
    return rows
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((row) => ({
        _id: row._id,
        assignmentType: row.assignmentType,
        milestoneKey: row.milestoneKey,
        submilestoneKey: row.submilestoneKey ?? null,
        kind: row.kind,
        status: row.status,
        summary: row.summary,
        detail: row.detail ?? null,
        resolutionNote: row.resolutionNote ?? null,
        resolvedAt: row.resolvedAt ?? null,
        createdAt: row.createdAt,
        proposalId: row.proposalId ?? null,
        buildId: row.buildId ?? null,
      }));
  })
  .public();

// ---------------------------------------------------------------------------
// Notification read-back (PRD §10)
// ---------------------------------------------------------------------------

export const listContractorNotifications = contractorRoleQuery
  .input({ includeRead: v.optional(v.boolean()) })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const contractor = ctx.contractorProfile;
    const rows = await ctx.db
      .query("contractorNotifications")
      .withIndex("by_contractor_created", (q) =>
        q.eq("contractorId", contractor._id)
      )
      .collect();
    return rows
      .filter((row) => (args.includeRead ? true : row.readAt === undefined))
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 50)
      .map((row) => ({
        _id: row._id,
        kind: row.kind,
        channel: row.channel,
        title: row.title,
        body: row.body ?? null,
        proposalId: row.proposalId ?? null,
        buildId: row.buildId ?? null,
        milestoneKey: row.milestoneKey ?? null,
        readAt: row.readAt ?? null,
        createdAt: row.createdAt,
      }));
  })
  .public();

export const markContractorNotificationRead = contractorRoleMutation
  .input({ notificationId: v.id("contractorNotifications") })
  .returns(v.boolean())
  .handler(async (ctx, args) => {
    const contractor = ctx.contractorProfile;
    const notification = await ctx.db.get(args.notificationId);
    if (!notification || notification.contractorId !== contractor._id) {
      throw new Error("Forbidden: notification does not belong to your profile.");
    }
    await ctx.db.patch(args.notificationId, { readAt: Date.now() });
    return true;
  })
  .public();

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function viewerSubject(ctx: unknown): string {
  return (ctx as { viewer: AuthorizedViewer }).viewer.subject;
}

function viewerRoles(ctx: unknown): readonly RoleSlug[] {
  return (ctx as { viewer: AuthorizedViewer }).viewer.roles;
}

interface BrokerageScope {
  brokerage: Doc<"brokerages">;
  roles: RoleSlug[];
  subject: string;
}

async function resolveBrokerageScopeOrThrow(
  ctx: QueryCtx | MutationCtx,
  workosOrganizationId: string
): Promise<BrokerageScope> {
  const viewer = (ctx as unknown as { viewer: AuthorizedViewer }).viewer;
  const subject = viewer.subject;
  const membership = await ctx.db
    .query("workosOrganizationMemberships")
    .withIndex("by_user", (q) => q.eq("workosUserId", subject))
    .filter((q) =>
      q.eq(q.field("workosOrganizationId"), workosOrganizationId)
    )
    .first();
  const activeTokenOrganizationId = viewer.organizationId?.trim();
  if (
    (!membership || membership.status !== "active") &&
    activeTokenOrganizationId !== workosOrganizationId
  ) {
    throw new Error("Forbidden: WorkOS membership");
  }
  const brokerage = await ctx.db
    .query("brokerages")
    .withIndex("by_workos_organization", (q) =>
      q.eq("workosOrganizationId", workosOrganizationId)
    )
    .unique();
  if (!brokerage) {
    throw new Error("Forbidden: brokerage");
  }
  const roles = normalizeRoleSlugs(
    viewer.roles ?? membership?.roleSlugs ?? []
  );
  return { brokerage, roles, subject };
}
