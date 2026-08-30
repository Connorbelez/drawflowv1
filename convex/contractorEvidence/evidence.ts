import { v } from "convex/values";

import {
  type AuthorizedViewer,
  type RoleSlug,
  backofficeMutation,
  backofficeQuery,
  contractorMutation,
  contractorQuery,
  normalizeRoleSlugs,
} from "../authz";
import { requireContractorLinkedProfile } from "../contractorAuth";
import type { Doc, Id, MutationCtx, QueryCtx } from "../types";

import {
  ALLOWED_EVIDENCE_MIME_TYPES,
  contractorRoleQuery,
  contractorRoleMutation,
  authorizeAssignmentScope,
  writeEvidenceEvent,
  viewerSubject,
  viewerRoles,
  resolveBrokerageScopeOrThrow,
} from "./access";
export const generateContractorEvidenceUploadUrl = contractorRoleMutation
  .returns(v.string())
  .handler(async (ctx) => await ctx.storage.generateUploadUrl())
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

    const existingEvidence = await findMatchingEvidenceUpload(
      ctx,
      contractor._id,
      {
        assignmentType: args.assignmentType,
        buildAssignmentId: args.buildAssignmentId,
        caption: args.caption,
        fileName: args.fileName,
        linkedReminderEventId: args.linkedReminderEventId,
        milestoneKey: args.milestoneKey,
        mimeType: args.mimeType,
        proposalAssignmentId: args.proposalAssignmentId,
        sizeBytes: args.sizeBytes,
        storageId: args.storageId,
        submilestoneKey: args.submilestoneKey,
        tags: args.tags,
        takenAt: args.takenAt,
      }
    );
    if (existingEvidence) {
      return existingEvidence._id;
    }

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

async function findMatchingEvidenceUpload(
  ctx: QueryCtx,
  contractorId: Id<"contractorProfiles">,
  input: {
    assignmentType: "proposal" | "build";
    proposalAssignmentId?: Id<"proposalMilestoneContractorAssignments">;
    buildAssignmentId?: Id<"milestoneContractorAssignments">;
    milestoneKey: string;
    submilestoneKey?: string;
    caption: string;
    storageId: Id<"_storage">;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    tags?: string[];
    takenAt?: number;
    linkedReminderEventId?: string;
  }
): Promise<Doc<"contractorEvidence"> | null> {
  const rows = await ctx.db
    .query("contractorEvidence")
    .withIndex("by_contractor", (q) => q.eq("contractorId", contractorId))
    .collect();
  return (
    rows.find(
      (row) =>
        row.targetType === input.assignmentType &&
        row.proposalAssignmentId === input.proposalAssignmentId &&
        row.buildAssignmentId === input.buildAssignmentId &&
        row.milestoneKey === input.milestoneKey &&
        row.submilestoneKey === input.submilestoneKey &&
        row.caption === input.caption &&
        row.storageId === input.storageId &&
        row.fileName === input.fileName &&
        row.mimeType === input.mimeType &&
        row.sizeBytes === input.sizeBytes &&
        row.takenAt === input.takenAt &&
        row.linkedReminderEventId === input.linkedReminderEventId &&
        stringArrayEquals(row.tags, input.tags)
    ) ?? null
  );
}

function stringArrayEquals(left?: string[], right?: string[]): boolean {
  const leftValues = left ?? [];
  const rightValues = right ?? [];
  return (
    leftValues.length === rightValues.length &&
    leftValues.every((value, index) => value === rightValues[index])
  );
}

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
        .withIndex("by_build", (q) =>
          q.eq("buildId", args.buildId as Id<"activeBuilds">)
        )
        .filter((q) => q.eq(q.field("contractorId"), contractor._id))
        .collect();
    } else if (args.proposalId) {
      rows = await ctx.db
        .query("contractorEvidence")
        .withIndex("by_proposal", (q) =>
          q.eq("proposalId", args.proposalId as Id<"buildProposals">)
        )
        .filter((q) => q.eq(q.field("contractorId"), contractor._id))
        .collect();
    } else {
      rows = await ctx.db
        .query("contractorEvidence")
        .withIndex("by_contractor", (q) => q.eq("contractorId", contractor._id))
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
        .withIndex("by_build", (q) =>
          q.eq("buildId", args.buildId as Id<"activeBuilds">)
        )
        .collect();
    } else if (args.proposalId) {
      rows = await ctx.db
        .query("contractorEvidence")
        .withIndex("by_proposal", (q) =>
          q.eq("proposalId", args.proposalId as Id<"buildProposals">)
        )
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
