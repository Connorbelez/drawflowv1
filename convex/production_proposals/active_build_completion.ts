/**
 * Production proposals active build completion bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { ConvexError, v } from "convex/values";
import { authenticatedMutation, normalizeRoleSlugs } from "../authz";
import { publishMilestoneCollaborationEvent } from "../build_collaboration_workflow_events";
import { resolveActiveSubmilestoneEvidencePackageReadiness } from "../build_submilestone_evidence";
import { recordMilestoneStart } from "../milestone_start";
import { submitCanonicalReviewCycle } from "../lender_portal_phase5";
import { type Doc } from "../types";
import { getActiveBuildMilestoneOrThrow, assertActiveBuildPlanningTargetActive } from "./active_planning.js";
import { authorizeActiveBuildOrThrow } from "./authorization_core.js";
import { requireActiveBuildAppPermission } from "./builder_staff_access.js";
import { recordQualityRatingForMilestoneAssignments } from "./contractor_active_helpers.js";
import { activeBuildCompletionReviewRecord, activeBuildPendingCompletionReview, normalizeQualityRating } from "./contractor_policy_helpers.js";
import { resolveBuilderMilestoneDecisionDeliveries } from "./notification_delivery_helpers.js";
import { writeActiveBuildEvent } from "./proposal_copy_audit.js";
import { assertExpectedMilestoneRevision, canonicalCommandFingerprint, ensureDraftSubmilestoneEvidencePackage } from "./submilestone_commands.js";

export const submitActiveBuildMilestoneCompletion = authenticatedMutation
  .input({
    actualCostCents: v.optional(v.number()),
    actualStartedAt: v.optional(v.number()),
    buildId: v.id("activeBuilds"),
    completedDay: v.number(),
    costDocumentIds: v.optional(v.array(v.id("costDocuments"))),
    dependencyOverrideReason: v.optional(v.string()),
    expectedEvidencePackageRevision: v.optional(v.number()),
    expectedEvidencePackageRevisions: v.optional(
      v.array(
        v.object({
          revision: v.number(),
          submilestoneKey: v.string(),
        }),
      ),
    ),
    expectedRevision: v.number(),
    idempotencyKey: v.string(),
    milestoneKey: v.string(),
    note: v.optional(v.string()),
    qualityNote: v.optional(v.string()),
    qualityRating: v.optional(v.number()),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await authorizeActiveBuildOrThrow(
      ctx,
      args.buildId,
      args.workosOrganizationId,
    );
    await requireActiveBuildAppPermission(ctx, auth, "milestone", "update");
    await requireActiveBuildAppPermission(ctx, auth, "evidence", "update");
    if (args.qualityRating !== undefined) {
      await requireActiveBuildAppPermission(ctx, auth, "contractor", "update");
    }
    if (
      args.actualCostCents !== undefined &&
      (!Number.isSafeInteger(args.actualCostCents) || args.actualCostCents < 0)
    ) {
      throw new ConvexError({
        code: "INVALID_MILESTONE_ACTUAL_COST",
        message:
          "Milestone actual cost must be a non-negative whole number of cents.",
        recoverable: true,
      });
    }
    const milestone = await getActiveBuildMilestoneOrThrow(
      ctx,
      args.buildId,
      args.milestoneKey,
    );
    assertActiveBuildPlanningTargetActive(milestone);
    const command = "submitActiveBuildMilestoneCompletion";
    const fingerprint = await canonicalCommandFingerprint(command, args);
    if (
      milestone.completionClaim &&
      (milestone.completionClaim as { idempotencyKey?: string })
        .idempotencyKey === args.idempotencyKey
    ) {
      const priorFingerprint = (
        milestone.completionClaim as { commandFingerprint?: string }
      ).commandFingerprint;
      if (priorFingerprint === undefined || priorFingerprint !== fingerprint) {
        throw new ConvexError({
          code: "IDEMPOTENCY_KEY_REUSED",
          message:
            "This idempotency key already belongs to a different milestone completion payload.",
        });
      }
      const currentCycleNumber =
        milestone.currentLenderPortalReviewCycleNumber ?? 0;
      await submitCanonicalReviewCycle(ctx, {
        actorWorkosUserId: auth.subject,
        costDocumentIds: args.costDocumentIds,
        expectedCycleNumber:
          currentCycleNumber > 0 ? currentCycleNumber - 1 : 0,
        idempotencyKey: `${args.idempotencyKey}:lender-portal-cycle:${Math.max(1, currentCycleNumber)}`,
        target: { kind: "milestone", milestoneId: milestone._id },
      });
      return null;
    }
    assertExpectedMilestoneRevision(milestone, args.expectedRevision);
    const submilestones = (await ctx.db
      .query("buildSubmilestones")
      .withIndex("by_milestone", (q) => q.eq("buildMilestoneId", milestone._id))
      .collect()) as Doc<"buildSubmilestones">[];
    const incompleteSubmilestoneKeys = submilestones
      .filter((submilestone) => submilestone.status !== "complete")
      .map((submilestone) => submilestone.key);
    if (incompleteSubmilestoneKeys.length > 0) {
      throw new ConvexError({
        code: "INCOMPLETE_SUBMILESTONES",
        incompleteSubmilestoneKeys,
        message:
          "Complete every submilestone before submitting this milestone.",
        milestoneKey: milestone.key,
      });
    }
    const evidencePackages: Array<{
      alreadyInReview: boolean;
      packageRevision: Doc<"buildSubmilestoneEvidencePackageRevisions">;
      submilestone: Doc<"buildSubmilestones">;
    }> = [];
    const expectedPackageRevisionBySubmilestone = new Map(
      (args.expectedEvidencePackageRevisions ?? []).map((entry) => [
        entry.submilestoneKey,
        entry.revision,
      ]),
    );
    const expectedPackageRevisionEntries =
      args.expectedEvidencePackageRevisions ?? [];
    const submilestoneKeys = new Set(
      submilestones.map((submilestone) => submilestone.key),
    );
    const duplicateExpectedKeys = expectedPackageRevisionEntries.filter(
      (entry, index) =>
        expectedPackageRevisionEntries.findIndex(
          (candidate) => candidate.submilestoneKey === entry.submilestoneKey,
        ) !== index,
    );
    const unknownExpectedKeys = expectedPackageRevisionEntries.filter(
      (entry) => !submilestoneKeys.has(entry.submilestoneKey),
    );
    const missingExpectedKeys = submilestones
      .filter(
        (submilestone) =>
          !expectedPackageRevisionBySubmilestone.has(submilestone.key),
      )
      .map((submilestone) => submilestone.key);
    const revisionMapContainsInvalidEntries =
      expectedPackageRevisionEntries.length > 0 &&
      (duplicateExpectedKeys.length > 0 || unknownExpectedKeys.length > 0);
    const revisionMapRequiredForMilestone =
      submilestones.length > 1 &&
      (args.expectedEvidencePackageRevision !== undefined ||
        expectedPackageRevisionEntries.length > 0) &&
      (expectedPackageRevisionBySubmilestone.size === 0 ||
        missingExpectedKeys.length > 0 ||
        duplicateExpectedKeys.length > 0 ||
        unknownExpectedKeys.length > 0);
    if (revisionMapContainsInvalidEntries || revisionMapRequiredForMilestone) {
      throw new ConvexError({
        code: "EVIDENCE_PACKAGE_REVISION_MAP_REQUIRED",
        message:
          "Provide an expected Evidence Package revision for each Sub-milestone.",
        missingSubmilestoneKeys: missingExpectedKeys,
        unknownSubmilestoneKeys: unknownExpectedKeys.map(
          (entry) => entry.submilestoneKey,
        ),
      });
    }
    for (const submilestone of submilestones) {
      const alreadyInReview =
        submilestone.evidenceReviewState === "in_review" &&
        Boolean(submilestone.completionSubmissionId);
      let packageRevision: Doc<
        "buildSubmilestoneEvidencePackageRevisions"
      >;
      if (alreadyInReview) {
        if (!submilestone.evidencePackageRevisionId) {
          throw new ConvexError({
            code: "EVIDENCE_REVIEW_STATE_INVALID",
            message:
              "An in-review Sub-milestone must reference its frozen Evidence Package revision.",
            submilestoneKey: submilestone.key,
          });
        }
        const referencedPackage = await ctx.db.get(
          submilestone.evidencePackageRevisionId,
        );
        if (
          !referencedPackage ||
          referencedPackage.buildId !== auth.build._id ||
          referencedPackage.organizationId !== auth.build.organizationId ||
          referencedPackage.brokerageId !== auth.brokerage._id ||
          referencedPackage.buildMilestoneId !== milestone._id ||
          referencedPackage.buildSubmilestoneId !== submilestone._id ||
          referencedPackage.proposalId !== auth.proposal._id ||
          referencedPackage.status !== "frozen"
        ) {
          throw new ConvexError({
            code: "EVIDENCE_REVIEW_STATE_INVALID",
            message:
              "An in-review Sub-milestone must reference its current frozen Evidence Package revision.",
            submilestoneKey: submilestone.key,
          });
        }
        packageRevision = referencedPackage;
      } else {
        packageRevision = await ensureDraftSubmilestoneEvidencePackage(ctx, {
          auth,
          milestone,
          submilestone,
        });
      }
      const expectedPackageRevision =
        expectedPackageRevisionBySubmilestone.get(submilestone.key) ??
        (submilestones.length === 1
          ? args.expectedEvidencePackageRevision
          : undefined);
      if (
        expectedPackageRevision !== undefined &&
        packageRevision.revision !== expectedPackageRevision
      ) {
        throw new ConvexError({
          code: "STALE_EVIDENCE_PACKAGE_REVISION",
          actualPackageRevision: packageRevision.revision,
          expectedPackageRevision,
          message:
            "Evidence Package revision changed; refresh the canonical package before review entry.",
        });
      }
      const readiness = await resolveActiveSubmilestoneEvidencePackageReadiness(
        ctx,
        {
          build: auth.build,
          milestone,
          packageRevisionId: packageRevision._id,
          submilestone,
          includeFrozenRequirement: false,
        },
      );
      if (readiness.readyExceptFor.length > 0) {
        throw new ConvexError({
          code: "EVIDENCE_PACKAGE_NOT_READY",
          message:
            "Review entry is blocked by current Evidence Package requirements.",
          readyExceptFor: readiness.readyExceptFor,
          submilestoneKey: submilestone.key,
        });
      }
      if (!alreadyInReview) {
        const now = Date.now();
        await ctx.db.patch(packageRevision._id, {
          frozenAt: now,
          frozenByWorkosUserId: auth.subject,
          status: "frozen",
          updatedAt: now,
        });
      }
      evidencePackages.push({ alreadyInReview, packageRevision, submilestone });
    }
    let completionRevision = milestone.workflowRevision ?? 0;
    if (milestone.actualStartedAt === undefined) {
      if (args.actualStartedAt === undefined) {
        throw new ConvexError({
          code: "MISSING_ACTUAL_START",
          message:
            "Confirm the missing actual start before submitting milestone completion.",
        });
      }
      const milestones = (await ctx.db
        .query("buildMilestones")
        .withIndex("by_build", (query) => query.eq("buildId", args.buildId))
        .take(500)) as Doc<"buildMilestones">[];
      const startResult = await recordMilestoneStart(ctx, {
        actor: {
          brokerageId: auth.brokerage._id,
          organizationId: auth.build.organizationId,
          roles: auth.roles,
          workosUserId: auth.subject,
        },
        actualStartedAt: args.actualStartedAt,
        build: auth.build,
        dependencyOverrideReason: args.dependencyOverrideReason,
        expectedRevision: completionRevision,
        idempotencyKey: `${args.idempotencyKey}:start`,
        milestone,
        milestones,
        source: "completion_catch_up",
      });
      completionRevision = startResult.revision;
    }
    const completionClaim = {
      ...(args.actualCostCents === undefined
        ? {}
        : { actualCostCents: args.actualCostCents }),
      completedDay: Math.max(0, Math.round(args.completedDay)),
      commandFingerprint: fingerprint,
      ...(args.note ? { note: args.note } : {}),
      idempotencyKey: args.idempotencyKey,
      ...(args.qualityRating === undefined
        ? {}
        : { qualityRating: normalizeQualityRating(args.qualityRating) }),
      ...(args.qualityNote ? { qualityNote: args.qualityNote } : {}),
      ...(evidencePackages.length > 0
        ? {
            evidencePackageRevisionIds: evidencePackages.map(({ packageRevision, submilestone }) => ({
              revision: packageRevision.revision,
              revisionId: packageRevision._id,
              submilestoneKey: submilestone.key,
            })),
          }
        : {}),
      submittedAt: new Date().toISOString(),
    };
    const collaborationEventRevision =
      (milestone.collaborationEventRevision ?? 0) + 1;
    await ctx.db.patch(milestone._id, {
      collaborationEventRevision,
      completionClaim,
      completionReview: activeBuildPendingCompletionReview(
        milestone.completionReview,
      ),
      evidenceState:
        evidencePackages.length > 0
          ? "Submitted package"
          : (milestone.evidenceState ?? "Completion claimed"),
      progressPercent: 100,
      status: "in_progress",
      updatedAt: Date.now(),
      workflowRevision: completionRevision + 1,
    });
    for (const { alreadyInReview, packageRevision, submilestone } of evidencePackages) {
      if (alreadyInReview) continue;
      const now = Date.now();
      const revision = (submilestone.evidenceReviewRound ?? 0) + 1;
      const completionSubmissionId = await ctx.db.insert(
        "buildSubmilestoneCompletionSubmissions",
        {
          actorRoles: normalizeRoleSlugs(auth.roles),
          actorWorkosUserId: auth.subject,
          actualCostCents: submilestone.actualCostCents,
          buildId: args.buildId,
          buildMilestoneId: milestone._id,
          buildSubmilestoneId: submilestone._id,
          brokerageId: auth.brokerage._id,
          completionForecastDate: submilestone.completionForecastDate,
          declaredAt: now,
          fieldNote: submilestone.fieldNote,
          idempotencyKey: `${args.idempotencyKey}:${submilestone.key}`,
          milestoneKey: milestone.key,
          organizationId: auth.build.organizationId,
          packageRevisionId: packageRevision._id,
          progressPercent: 100,
          revision,
          submilestoneKey: submilestone.key,
        },
      );
      await ctx.db.insert("buildSubmilestoneReviewRounds", {
        buildId: args.buildId,
        buildMilestoneId: milestone._id,
        buildSubmilestoneId: submilestone._id,
        brokerageId: auth.brokerage._id,
        completionSubmissionId,
        enteredAt: now,
        enteredByWorkosUserId: auth.subject,
        milestoneKey: milestone.key,
        organizationId: auth.build.organizationId,
        packageRevisionId: packageRevision._id,
        remediation: [],
        round: revision,
        status: "in_review",
        submilestoneKey: submilestone.key,
      });
      await ctx.db.patch(submilestone._id, {
        completionSubmissionId,
        evidencePackageRevisionId: packageRevision._id,
        evidenceReviewRound: revision,
        evidenceReviewState: "in_review",
        reviewDecisionState: "in_review",
        reviewRevision: (submilestone.reviewRevision ?? 0) + 1,
        progressPercent: 100,
        updatedAt: now,
      });
    }
    const expectedLenderPortalCycleNumber =
      milestone.currentLenderPortalReviewCycleNumber ?? 0;
    await submitCanonicalReviewCycle(ctx, {
      actorWorkosUserId: auth.subject,
      costDocumentIds: args.costDocumentIds,
      expectedCycleNumber: expectedLenderPortalCycleNumber,
      idempotencyKey: `${args.idempotencyKey}:lender-portal-cycle:${expectedLenderPortalCycleNumber + 1}`,
      target: { kind: "milestone", milestoneId: milestone._id },
    });
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command: "submitActiveBuildMilestoneCompletion",
      eventType: "active_build.milestone_completion.submitted",
      newState: JSON.stringify(completionClaim),
      priorState: JSON.stringify(milestone.completionClaim),
    });
    await publishMilestoneCollaborationEvent(ctx, {
      actor: { roles: auth.roles, workosUserId: auth.subject },
      milestone,
      note: args.note,
      transition: "submitted",
    });
    if (
      activeBuildCompletionReviewRecord(milestone.completionReview).status ===
      "rejected"
    ) {
      await resolveBuilderMilestoneDecisionDeliveries(ctx, {
        auth,
        milestone,
        status: "rejected",
      });
    }
    if (args.qualityRating !== undefined) {
      await recordQualityRatingForMilestoneAssignments(ctx, {
        auth,
        buildId: args.buildId,
        milestone,
        note: args.qualityNote ?? args.note,
        rating: args.qualityRating,
        source: "builder_evidence",
        workosOrganizationId: args.workosOrganizationId,
      });
    }
    return null;
  })
  .public();
