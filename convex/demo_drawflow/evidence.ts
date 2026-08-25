import { v } from "convex/values";
import { publicMutation, withMutationTiming } from "../fluent";
import {
  activeEvidenceFiles,
  appendAudit,
  appendOutbox,
  findMilestone,
} from "./access";
import {
  ensureDraftEvidencePackage,
  recalcDrawGroupDates,
} from "./lifecycle";

export const demo_addSampleEvidence = publicMutation
  .use(withMutationTiming("demo_drawflow.addSampleEvidence"))
  .input({ milestoneKey: v.string(), persona: v.string() })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const milestone = await findMilestone(ctx, "active", args.milestoneKey);
    if (!milestone) {
      throw new Error("Milestone not found");
    }
    if (args.persona !== "builder_lead") {
      throw new Error("Only Builder Lead can add evidence.");
    }
    const packageId = await ensureDraftEvidencePackage(ctx, milestone);
    const evidenceId = await ctx.db.insert("demo_evidenceFiles", {
      buildId: milestone.buildId,
      evidencePackageId: packageId,
      fileName: `${milestone.key}-inspection-photo-01.jpg`,
      isSample: true,
      milestoneId: milestone._id,
      milestoneKey: milestone.key,
      mimeType: "image/jpeg",
      scenario: "active",
      sizeBytes: 482_000,
      uploadedAt: Date.now(),
      uploadedByPersona: args.persona,
    });
    await appendAudit(ctx, {
      actorPersona: args.persona,
      buildId: milestone.buildId,
      command: "demo_addSampleEvidence",
      entityKey: milestone.key,
      entityLabel: milestone.name,
      entityType: "milestone",
      eventType: "SampleEvidenceAdded",
      milestoneKey: milestone.key,
      scenario: "active",
    });
    return { evidenceId };
  })
  .public();
export const demo_registerUploadedEvidenceMetadata = publicMutation
  .use(withMutationTiming("demo_drawflow.registerUploadedEvidenceMetadata"))
  .input({
    fileName: v.string(),
    milestoneKey: v.string(),
    mimeType: v.string(),
    persona: v.string(),
    sizeBytes: v.number(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const milestone = await findMilestone(ctx, "active", args.milestoneKey);
    if (!milestone) {
      throw new Error("Milestone not found");
    }
    const packageId = await ensureDraftEvidencePackage(ctx, milestone);
    const evidenceId = await ctx.db.insert("demo_evidenceFiles", {
      buildId: milestone.buildId,
      evidencePackageId: packageId,
      fileName: args.fileName,
      isSample: false,
      milestoneId: milestone._id,
      milestoneKey: milestone.key,
      mimeType: args.mimeType || "application/octet-stream",
      scenario: "active",
      sizeBytes: args.sizeBytes,
      uploadedAt: Date.now(),
      uploadedByPersona: args.persona,
    });
    await appendAudit(ctx, {
      actorPersona: args.persona,
      buildId: milestone.buildId,
      command: "demo_registerUploadedEvidenceMetadata",
      entityKey: milestone.key,
      entityLabel: milestone.name,
      entityType: "milestone",
      eventType: "EvidenceMetadataRegistered",
      milestoneKey: milestone.key,
      scenario: "active",
    });
    return { evidenceId };
  })
  .public();
export const demo_removeEvidenceFile = publicMutation
  .use(withMutationTiming("demo_drawflow.removeEvidenceFile"))
  .input({ evidenceFileId: v.id("demo_evidenceFiles"), persona: v.string() })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const evidence = await ctx.db.get(args.evidenceFileId);
    if (!evidence) {
      throw new Error("Evidence not found");
    }
    const evidencePackage = evidence.evidencePackageId
      ? await ctx.db.get(evidence.evidencePackageId)
      : null;
    if (evidencePackage?.status === "submitted") {
      throw new Error("Submitted evidence packages are frozen.");
    }
    await ctx.db.patch(evidence._id, { removedAt: Date.now() });
    await appendAudit(ctx, {
      actorPersona: args.persona,
      buildId: evidence.buildId,
      command: "demo_removeEvidenceFile",
      entityKey: evidence.milestoneKey,
      entityType: "evidence_file",
      eventType: "EvidenceRemoved",
      milestoneKey: evidence.milestoneKey,
      scenario: "active",
    });
    return { ok: true };
  })
  .public();

export const demo_submitCompletionClaim = publicMutation
  .use(withMutationTiming("demo_drawflow.submitCompletionClaim"))
  .input({
    milestoneKey: v.string(),
    persona: v.string(),
    requestedAmountCents: v.number(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const milestone = await findMilestone(ctx, "active", args.milestoneKey);
    if (!milestone) {
      throw new Error("Milestone not found");
    }
    if (args.persona !== "builder_lead") {
      throw new Error("Only Builder Lead can submit completion claims.");
    }
    const files = await activeEvidenceFiles(ctx, "active", milestone.key);
    if (milestone.status !== "complete_pending_submission") {
      await appendAudit(ctx, {
        actorPersona: args.persona,
        command: "demo_submitCompletionClaim",
        entityKey: milestone.key,
        entityLabel: milestone.name,
        entityType: "milestone",
        eventType: "CompletionClaimSubmitRejected",
        milestoneKey: milestone.key,
        scenario: "active",
        validation: "rejected",
      });
      throw new Error("Milestone must be marked complete before submission.");
    }
    if (
      args.requestedAmountCents < 0 ||
      args.requestedAmountCents > milestone.approvedValueCents
    ) {
      throw new Error("Requested amount must be within approved value.");
    }
    const packageId = await ensureDraftEvidencePackage(ctx, milestone);
    await ctx.db.patch(packageId, {
      frozenAt: Date.now(),
      reviewStatus: "pending",
      status: "submitted",
      submittedAt: Date.now(),
    });
    await ctx.db.patch(milestone._id, {
      evidenceReviewStatus: "pending",
      requestedAmountCents: args.requestedAmountCents,
      status: "submitted_for_review",
      submittedAt: Date.now(),
      updatedAt: Date.now(),
    });
    if (args.requestedAmountCents < milestone.approvedValueCents) {
      await ctx.db.insert("demo_rolloverBuffers", {
        buildId: milestone.buildId,
        createdAt: Date.now(),
        milestoneId: milestone._id,
        milestoneKey: milestone.key,
        originalApprovedCents: milestone.approvedValueCents,
        requestedAmountCents: args.requestedAmountCents,
        scenario: "active",
        status: "available",
        unusedAmountCents:
          milestone.approvedValueCents - args.requestedAmountCents,
      });
    }
    await appendAudit(ctx, {
      actorPersona: args.persona,
      afterSummary: `Requested ${args.requestedAmountCents} cents`,
      buildId: milestone.buildId,
      command: "demo_submitCompletionClaim",
      entityKey: milestone.key,
      entityLabel: milestone.name,
      entityType: "milestone",
      eventType: "CompletionClaimSubmitted",
      milestoneKey: milestone.key,
      scenario: "active",
    });
    await appendOutbox(ctx, {
      buildId: milestone.buildId,
      eventType: "demo.milestone.completionClaimSubmitted",
      milestoneKey: milestone.key,
      payloadPreview: `${milestone.name} submitted with ${files.length} evidence file(s).`,
      relatedEntity: milestone.name,
      scenario: "active",
    });
    await recalcDrawGroupDates(ctx, "active");
    return { ok: true };
  })
  .public();

export const demo_reviewEvidence = publicMutation
  .use(withMutationTiming("demo_drawflow.reviewEvidence"))
  .input({
    milestoneKey: v.string(),
    notes: v.optional(v.string()),
    outcome: v.union(v.literal("accepted"), v.literal("more_information")),
    persona: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const milestone = await findMilestone(ctx, "active", args.milestoneKey);
    if (!milestone) {
      throw new Error("Milestone not found");
    }
    if (args.persona !== "lender_admin") {
      throw new Error("Only Lender Admin can review evidence.");
    }
    await ctx.db.insert("demo_reviewReports", {
      buildId: milestone.buildId,
      createdAt: Date.now(),
      milestoneId: milestone._id,
      milestoneKey: milestone.key,
      notes: args.notes ?? "",
      outcome: args.outcome,
      reviewerPersona: args.persona,
      scenario: "active",
    });
    await ctx.db.patch(milestone._id, {
      evidenceReviewStatus: args.outcome,
      status:
        args.outcome === "more_information"
          ? "more_information_requested"
          : milestone.status,
      updatedAt: Date.now(),
    });
    await appendAudit(ctx, {
      actorPersona: args.persona,
      buildId: milestone.buildId,
      command: "demo_reviewEvidence",
      entityKey: milestone.key,
      entityLabel: milestone.name,
      entityType: "milestone",
      eventType:
        args.outcome === "accepted"
          ? "EvidenceApproved"
          : "EvidenceMoreInformationRequested",
      milestoneKey: milestone.key,
      reason: args.notes,
      scenario: "active",
    });
    await appendOutbox(ctx, {
      buildId: milestone.buildId,
      eventType:
        args.outcome === "accepted"
          ? "demo.evidence.accepted"
          : "demo.evidence.moreInformationRequested",
      milestoneKey: milestone.key,
      payloadPreview:
        args.outcome === "accepted"
          ? `${milestone.name} evidence accepted.`
          : `${milestone.name} evidence needs more information.`,
      relatedEntity: milestone.name,
      scenario: "active",
    });
    return { ok: true };
  })
  .public();
