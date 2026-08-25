/**
 * Production proposals active build submilestone evidence bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { ConvexError, v } from "convex/values";
import { authenticatedMutation } from "../authz";
import { assertActiveSubmilestoneEvidenceRequirementKind, resolveActiveSubmilestoneEvidencePackageReadiness, resolveActiveSubmilestoneEvidenceRequirements } from "../build_submilestone_evidence";
import { resolveSiteVisitGeofenceAttempt } from "../demo_site_visit_tokens";
import { activeBuildStartTarget } from "./active_planning.js";
import { authorizeActiveBuildOrThrow, requireBackofficeActiveBuildWrite } from "./authorization_core.js";
import { siteVisitLocationAttemptValidator } from "./brokerage_site_visits.js";
import { requireActiveBuildAppPermission } from "./builder_staff_access.js";
import { writeActiveBuildEvent } from "./proposal_copy_audit.js";
import { authorizeCanonicalSubmilestoneOperator, assertExpectedSubmilestoneRevision, canonicalCommandFingerprint, findSubmilestoneIdempotentAudit, insertSubmilestoneCommandReceipt, ensureDraftSubmilestoneEvidencePackage, getScopedSubmilestonePackageRevision } from "./submilestone_commands.js";

export const addActiveBuildSubmilestoneEvidence = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    evidence: v.object({
      evidenceKey: v.optional(v.string()),
      fileName: v.string(),
      label: v.optional(v.string()),
      locationAttempt: v.optional(siteVisitLocationAttemptValidator),
      mimeType: v.string(),
      requirementKey: v.optional(v.string()),
      sizeBytes: v.number(),
      storageId: v.optional(v.id("_storage")),
      tag: v.optional(v.string()),
    }),
    expectedRevision: v.number(),
    idempotencyKey: v.string(),
    milestoneKey: v.string(),
    submilestoneKey: v.string(),
    uploadedOnBehalfOfBuilder: v.optional(v.boolean()),
    workosOrganizationId: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const auth = args.uploadedOnBehalfOfBuilder
      ? await authorizeActiveBuildOrThrow(
          ctx,
          args.buildId,
          args.workosOrganizationId,
        )
      : await authorizeCanonicalSubmilestoneOperator(ctx, args);
    if (args.uploadedOnBehalfOfBuilder) {
      requireBackofficeActiveBuildWrite(auth);
      await requireActiveBuildAppPermission(ctx, auth, "evidence", "create");
    }
    const { milestone, submilestone } = await activeBuildStartTarget(ctx, {
      buildId: args.buildId,
      milestoneKey: args.milestoneKey,
      submilestoneKey: args.submilestoneKey,
    });
    const command = "addActiveBuildSubmilestoneEvidence";
    const fingerprint = await canonicalCommandFingerprint(command, args);
    const existing = await findSubmilestoneIdempotentAudit(ctx, {
      command,
      fingerprint,
      submilestoneId: submilestone._id,
      idempotencyKey: args.idempotencyKey,
    });
    if (existing) {
      return {
        ...(JSON.parse(existing.resultJson) as Record<string, unknown>),
        replayed: true,
      };
    }
    if (
      submilestone.status !== "in_progress" &&
      !args.uploadedOnBehalfOfBuilder
    ) {
      throw new ConvexError({
        code: "SUBMILESTONE_NOT_ACTIVE",
        message: "Evidence can be added only while work is active.",
      });
    }
    if (!args.evidence.storageId) {
      throw new ConvexError({
        code: "EVIDENCE_STORAGE_REQUIRED",
        message: "Evidence must reference a stored file before upload.",
      });
    }
    assertExpectedSubmilestoneRevision(submilestone, args.expectedRevision);
    const requirements = await resolveActiveSubmilestoneEvidenceRequirements(
      ctx,
      { build: auth.build, milestone, submilestone },
    );
    const requestedRequirementKey = args.evidence.requirementKey?.trim();
    if (!requestedRequirementKey && requirements.length > 1) {
      throw new ConvexError({
        code: "EVIDENCE_REQUIREMENT_KEY_REQUIRED",
        message:
          "A requirementKey is required when a sub-milestone has multiple evidence requirements.",
      });
    }
    const requirement =
      requirements.find((row) => row.requirementKey === requestedRequirementKey) ??
      (!requestedRequirementKey ? requirements[0] : undefined);
    if (!requirement && !args.uploadedOnBehalfOfBuilder) {
      throw new ConvexError({
        code: "EVIDENCE_REQUIREMENT_NOT_FOUND",
        message: "Evidence must target a current Sub-milestone requirement.",
        requirementKey: requestedRequirementKey || undefined,
      });
    }
    const requirementKey =
      requirement?.requirementKey ?? "builder-submitted-evidence";
    if (requirement) {
      assertActiveSubmilestoneEvidenceRequirementKind({
        asset: {
          fileName: args.evidence.fileName,
          mimeType: args.evidence.mimeType,
          tag: args.evidence.tag ?? milestone.name,
        },
        requirement,
        sourceKind: "canonical_upload",
      });
    }
    const now = Date.now();
    const locationAttempt = args.evidence.locationAttempt
      ? resolveSiteVisitGeofenceAttempt({
          locationAttempt: args.evidence.locationAttempt,
          siteLatitude: auth.build.locationLatitude,
          siteLongitude: auth.build.locationLongitude,
        })
      : undefined;
    const packageRevision = await ensureDraftSubmilestoneEvidencePackage(ctx, {
      auth,
      milestone,
      submilestone,
    });
    const evidenceKey =
      args.evidence.evidenceKey?.trim() ||
      `submilestone-${submilestone.key}-${args.idempotencyKey.trim()}`;
    const duplicateEvidence = await ctx.db
      .query("buildEvidenceAssets")
      .withIndex("by_build_key", (query) =>
        query.eq("buildId", args.buildId).eq("evidenceKey", evidenceKey),
      )
      .unique();
    if (duplicateEvidence) {
      throw new ConvexError({
        code: "EVIDENCE_KEY_CONFLICT",
        message: "Evidence key already exists; choose a new key.",
      });
    }
    const persistedAssetId = await ctx.db.insert("buildEvidenceAssets", {
      brokerageId: auth.brokerage._id,
      buildId: args.buildId,
      collaborationEventRevision: 1,
      createdAt: now,
      evidenceKey,
      evidencePackageRevisionId: packageRevision._id,
      fileName: args.evidence.fileName.trim(),
      label: args.evidence.label?.trim() || args.evidence.fileName.trim(),
      locationVerified: locationAttempt?.verified ?? false,
      ...(locationAttempt?.accuracyMeters === undefined
        ? {}
        : { locationAccuracyMeters: locationAttempt.accuracyMeters }),
      ...(locationAttempt?.attemptedAt === undefined
        ? {}
        : { locationAttemptedAt: locationAttempt.attemptedAt }),
      ...(locationAttempt?.distanceMeters === undefined
        ? {}
        : { locationDistanceMeters: locationAttempt.distanceMeters }),
      ...(locationAttempt?.failureReason
        ? { locationFailureReason: locationAttempt.failureReason }
        : {}),
      ...(locationAttempt?.geofenceRadiusMeters === undefined
        ? {}
        : { locationGeofenceRadiusMeters: locationAttempt.geofenceRadiusMeters }),
      milestoneKey: milestone.key,
      mimeType: args.evidence.mimeType.trim().toLowerCase(),
      organizationId: auth.build.organizationId,
      proposalId: auth.proposal._id,
      sizeBytes: Math.max(0, Math.round(args.evidence.sizeBytes)),
      source: args.uploadedOnBehalfOfBuilder
        ? "backoffice_builder_evidence_upload"
        : "active_build_submilestone_evidence_upload",
      storageId: args.evidence.storageId,
      submilestoneKey: submilestone.key,
      tag: args.evidence.tag?.trim() || milestone.name,
      updatedAt: now,
    });
    await ctx.db.insert("buildSubmilestoneEvidencePackageItems", {
      brokerageId: auth.brokerage._id,
      buildId: args.buildId,
      buildMilestoneId: milestone._id,
      buildSubmilestoneId: submilestone._id,
      createdAt: now,
      evidenceAssetId: persistedAssetId,
      locationVerified: locationAttempt?.verified ?? false,
      organizationId: auth.build.organizationId,
      packageRevisionId: packageRevision._id,
      requirementKey,
      sourceKind: "canonical_upload",
      sourceUploaderWorkosUserId: auth.subject,
    });
    const nextWorkflowRevision = (submilestone.workflowRevision ?? 0) + 1;
    await ctx.db.patch(submilestone._id, {
      evidencePackageRevisionId: packageRevision._id,
      evidenceReviewState: "not_ready",
      updatedAt: now,
      workflowRevision: nextWorkflowRevision,
    });
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command,
      entityId: String(submilestone._id),
      entityType: "buildSubmilestone",
      eventType: "active_build.submilestone.evidence_added",
      resourceType: "evidence",
      newState: JSON.stringify({
        evidenceAssetId: persistedAssetId,
        evidencePackageRevision: packageRevision.revision,
        idempotencyKey: args.idempotencyKey,
        locationVerified: locationAttempt?.verified ?? false,
        requirementKey,
        submilestoneKey: submilestone.key,
        uploadedOnBehalfOfBuilder:
          args.uploadedOnBehalfOfBuilder === true,
        uploadedByWorkosUserId: auth.subject,
      }),
      priorState: JSON.stringify({ workflowRevision: submilestone.workflowRevision ?? 0 }),
      warnings: [
        ...(args.uploadedOnBehalfOfBuilder
          ? [
              "uploaded_on_behalf_of_builder",
              "evidence_location_unverified",
            ]
          : []),
        ...(!args.uploadedOnBehalfOfBuilder &&
        locationAttempt &&
        !locationAttempt.verified
          ? ["evidence_location_unverified"]
          : []),
      ],
    });
    await insertSubmilestoneCommandReceipt(ctx, {
      buildId: args.buildId,
      command,
      fingerprint,
      idempotencyKey: args.idempotencyKey,
      organizationId: auth.build.organizationId,
      result: {
        evidenceAssetId: persistedAssetId,
        evidencePackageRevisionId: packageRevision._id,
        locationVerified: locationAttempt?.verified ?? false,
        replayed: false,
        revision: nextWorkflowRevision,
      },
      submilestoneId: submilestone._id,
    });
    const persistedAsset = await ctx.db.get(persistedAssetId);
    if (!persistedAsset) {
      throw new Error("Canonical Evidence Asset became unavailable.");
    }
    return {
      evidenceAssetId: persistedAssetId,
      evidencePackageRevisionId: packageRevision._id,
      locationVerified: persistedAsset.locationVerified,
      replayed: false,
      revision: nextWorkflowRevision,
    };
  })
  .public();

export const freezeActiveBuildSubmilestoneEvidencePackage = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    expectedRevision: v.number(),
    idempotencyKey: v.string(),
    milestoneKey: v.string(),
    packageRevisionId: v.id("buildSubmilestoneEvidencePackageRevisions"),
    submilestoneKey: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const auth = await authorizeCanonicalSubmilestoneOperator(ctx, args);
    const { milestone, submilestone } = await activeBuildStartTarget(ctx, {
      buildId: args.buildId,
      milestoneKey: args.milestoneKey,
      submilestoneKey: args.submilestoneKey,
    });
    const command = "freezeActiveBuildSubmilestoneEvidencePackage";
    const fingerprint = await canonicalCommandFingerprint(command, args);
    const existing = await findSubmilestoneIdempotentAudit(ctx, {
      command,
      fingerprint,
      idempotencyKey: args.idempotencyKey,
      submilestoneId: submilestone._id,
    });
    if (existing) {
      return {
        ...(JSON.parse(existing.resultJson) as Record<string, unknown>),
        replayed: true,
      };
    }
    assertExpectedSubmilestoneRevision(submilestone, args.expectedRevision);
    const packageRevision = await getScopedSubmilestonePackageRevision(ctx, {
      auth,
      milestone,
      packageRevisionId: args.packageRevisionId,
      submilestone,
    });
    const currentPackageRevision = await ctx.db
      .query("buildSubmilestoneEvidencePackageRevisions")
      .withIndex("by_submilestone_revision", (query) =>
        query.eq("buildSubmilestoneId", submilestone._id),
      )
      .order("desc")
      .first();
    if (
      !currentPackageRevision ||
      currentPackageRevision._id !== packageRevision._id ||
      currentPackageRevision.revision !== packageRevision.revision
    ) {
      throw new ConvexError({
        code: "STALE_EVIDENCE_PACKAGE_REVISION",
        actualPackageRevision: currentPackageRevision?.revision ?? 0,
        expectedPackageRevision: packageRevision.revision,
        message:
          "Evidence Package revision changed; refresh the current draft before freezing.",
      });
    }
    if (packageRevision.status === "frozen") {
      const result = {
        packageRevisionId: packageRevision._id,
        readyExceptFor: [],
        revision: submilestone.workflowRevision ?? 0,
        replayed: false,
        status: packageRevision.status,
      };
      await insertSubmilestoneCommandReceipt(ctx, {
        buildId: args.buildId,
        command,
        fingerprint,
        idempotencyKey: args.idempotencyKey,
        organizationId: auth.build.organizationId,
        result,
        submilestoneId: submilestone._id,
      });
      return result;
    }
    if (packageRevision.status !== "draft") {
      throw new ConvexError({
        code: "EVIDENCE_PACKAGE_STATE_INVALID",
        message: "Only a draft Evidence Package revision can be frozen.",
      });
    }
    const readiness = await resolveActiveSubmilestoneEvidencePackageReadiness(ctx, {
      build: auth.build,
      milestone,
      packageRevisionId: packageRevision._id,
      submilestone,
      includeFrozenRequirement: false,
    });
    if (readiness.readyExceptFor.length > 0) {
      throw new ConvexError({
        code: "EVIDENCE_PACKAGE_NOT_READY",
        message: "Evidence Package is not ready to freeze.",
        readyExceptFor: readiness.readyExceptFor,
      });
    }
    const now = Date.now();
    await ctx.db.patch(packageRevision._id, {
      frozenAt: now,
      frozenByWorkosUserId: auth.subject,
      status: "frozen",
      updatedAt: now,
    });
    const nextWorkflowRevision = (submilestone.workflowRevision ?? 0) + 1;
    await ctx.db.patch(submilestone._id, {
      evidencePackageRevisionId: packageRevision._id,
      updatedAt: now,
      workflowRevision: nextWorkflowRevision,
    });
    await writeActiveBuildEvent(ctx, {
      auth,
      build: auth.build,
      command,
      entityId: String(submilestone._id),
      entityType: "buildSubmilestone",
      eventType: "active_build.submilestone.evidence_package_frozen",
      resourceType: "evidence",
      newState: JSON.stringify({
        packageRevisionId: packageRevision._id,
        revision: packageRevision.revision,
        submilestoneKey: submilestone.key,
      }),
      priorState: JSON.stringify({ status: packageRevision.status }),
    });
    const result = {
      packageRevisionId: packageRevision._id,
      readyExceptFor: [],
      replayed: false,
      revision: nextWorkflowRevision,
      status: "frozen" as const,
    };
    await insertSubmilestoneCommandReceipt(ctx, {
      buildId: args.buildId,
      command,
      fingerprint,
      idempotencyKey: args.idempotencyKey,
      organizationId: auth.build.organizationId,
      result,
      submilestoneId: submilestone._id,
    });
    return result;
  })
  .public();

export const submitActiveBuildSubmilestoneCompletionForReview =
  authenticatedMutation
    .input({
      buildId: v.id("activeBuilds"),
      completionNote: v.optional(v.string()),
      declareComplete: v.boolean(),
      expectedPackageRevision: v.number(),
      expectedRevision: v.number(),
      idempotencyKey: v.string(),
      milestoneKey: v.string(),
      packageRevisionId: v.id("buildSubmilestoneEvidencePackageRevisions"),
      submilestoneKey: v.string(),
      workosOrganizationId: v.string(),
    })
    .returns(v.any())
    .handler(async (ctx, args) => {
      const auth = await authorizeCanonicalSubmilestoneOperator(ctx, args);
      const { milestone, submilestone } = await activeBuildStartTarget(ctx, {
        buildId: args.buildId,
        milestoneKey: args.milestoneKey,
        submilestoneKey: args.submilestoneKey,
      });
      const command = "submitActiveBuildSubmilestoneCompletionForReview";
      const fingerprint = await canonicalCommandFingerprint(command, args);
      const receipt = await findSubmilestoneIdempotentAudit(ctx, {
        command,
        fingerprint,
        idempotencyKey: args.idempotencyKey,
        submilestoneId: submilestone._id,
      });
      if (receipt) {
        return {
          ...(JSON.parse(receipt.resultJson) as Record<string, unknown>),
          replayed: true,
        };
      }
      const existing = await ctx.db
        .query("buildSubmilestoneCompletionSubmissions")
        .withIndex("by_submilestone_idempotency", (query) =>
          query
            .eq("buildSubmilestoneId", submilestone._id)
            .eq("idempotencyKey", args.idempotencyKey),
        )
        .first();
      if (existing) {
        if (
          existing.fingerprint === undefined ||
          existing.fingerprint !== fingerprint
        ) {
          throw new ConvexError({
            code: "IDEMPOTENCY_KEY_REUSED",
            message:
              "This idempotency key already belongs to a different completion review payload.",
          });
        }
        const round = await ctx.db
          .query("buildSubmilestoneReviewRounds")
          .withIndex("by_submilestone_round", (query) =>
            query
              .eq("buildSubmilestoneId", submilestone._id)
              .eq("round", existing.revision),
          )
          .first();
        return {
          completionSubmissionId: existing._id,
          readyExceptFor: [],
          reviewRound: round?.round ?? existing.revision,
          replayed: true,
          status: "in_review" as const,
        };
      }
      if (!args.declareComplete) {
        throw new ConvexError({
          code: "COMPLETION_DECLARATION_REQUIRED",
          message: "Explicit completion declaration is required for review entry.",
        });
      }
      if (submilestone.status !== "in_progress" || submilestone.actualStartedAt === undefined) {
        throw new ConvexError({
          code: "SUBMILESTONE_NOT_ACTIVE",
          message: "Review entry requires an actively started Sub-milestone.",
        });
      }
      assertExpectedSubmilestoneRevision(submilestone, args.expectedRevision);
      const packageRevision = await getScopedSubmilestonePackageRevision(ctx, {
        auth,
        milestone,
        packageRevisionId: args.packageRevisionId,
        submilestone,
      });
      if (
        packageRevision.status !== "frozen" ||
        packageRevision.revision !== args.expectedPackageRevision
      ) {
        throw new ConvexError({
          code: "STALE_EVIDENCE_PACKAGE_REVISION",
          message: "Evidence Package revision is stale or not frozen.",
          expectedPackageRevision: args.expectedPackageRevision,
          actualPackageRevision: packageRevision.revision,
        });
      }
      const readiness = await resolveActiveSubmilestoneEvidencePackageReadiness(ctx, {
        build: auth.build,
        milestone,
        packageRevisionId: packageRevision._id,
        submilestone,
        includeFrozenRequirement: false,
      });
      if (readiness.readyExceptFor.length > 0) {
        throw new ConvexError({
          code: "EVIDENCE_PACKAGE_NOT_READY",
          message: "Review entry is blocked by current Evidence Package requirements.",
          readyExceptFor: readiness.readyExceptFor,
        });
      }
      const now = Date.now();
      const priorRound =
        submilestone.evidenceReviewRound ?? 0;
      const nextRound = priorRound + 1;
      const submissionId = await ctx.db.insert("buildSubmilestoneCompletionSubmissions", {
        actorRoles: auth.roles,
        actorWorkosUserId: auth.subject,
        actualCostCents: submilestone.actualCostCents,
        buildId: args.buildId,
        buildMilestoneId: milestone._id,
        buildSubmilestoneId: submilestone._id,
        brokerageId: auth.brokerage._id,
        completionForecastDate: submilestone.completionForecastDate,
        declaredAt: now,
        fieldNote: args.completionNote?.trim() || submilestone.fieldNote,
        idempotencyKey: args.idempotencyKey,
        milestoneKey: milestone.key,
        organizationId: auth.build.organizationId,
        packageRevisionId: packageRevision._id,
        progressPercent: 100,
        revision: nextRound,
        submilestoneKey: submilestone.key,
        fingerprint,
      });
      await ctx.db.insert("buildSubmilestoneReviewRounds", {
        buildId: args.buildId,
        buildMilestoneId: milestone._id,
        buildSubmilestoneId: submilestone._id,
        brokerageId: auth.brokerage._id,
        completionSubmissionId: submissionId,
        enteredAt: now,
        enteredByWorkosUserId: auth.subject,
        milestoneKey: milestone.key,
        organizationId: auth.build.organizationId,
        packageRevisionId: packageRevision._id,
        remediation: [],
        reviewNote: args.completionNote?.trim() || undefined,
        round: nextRound,
        status: "in_review",
        submilestoneKey: submilestone.key,
      });
      const nextWorkflowRevision = (submilestone.workflowRevision ?? 0) + 1;
      await ctx.db.patch(submilestone._id, {
        completionSubmissionId: submissionId,
        evidencePackageRevisionId: packageRevision._id,
        evidenceReviewRound: nextRound,
        evidenceReviewState: "in_review",
        reviewDecisionState: "in_review",
        reviewRevision: (submilestone.reviewRevision ?? 0) + 1,
        progressPercent: 100,
        updatedAt: now,
        workflowRevision: nextWorkflowRevision,
      });
      await writeActiveBuildEvent(ctx, {
        auth,
        build: auth.build,
        command: "submitActiveBuildSubmilestoneCompletionForReview",
        entityId: String(submilestone._id),
        entityType: "buildSubmilestone",
        eventType: "active_build.submilestone.completion_submitted_for_review",
        resourceType: "evidence",
        newState: JSON.stringify({
          completionSubmissionId: submissionId,
          idempotencyKey: args.idempotencyKey,
          packageRevision: packageRevision.revision,
          reviewRound: nextRound,
          submilestoneKey: submilestone.key,
        }),
        priorState: JSON.stringify({
          evidenceReviewRound: submilestone.evidenceReviewRound ?? 0,
          evidenceReviewState: submilestone.evidenceReviewState ?? "not_ready",
        }),
      });
      const result = {
        completionSubmissionId: submissionId,
        readyExceptFor: [],
        reviewRound: nextRound,
        replayed: false,
        status: "in_review" as const,
      };
      await insertSubmilestoneCommandReceipt(ctx, {
        buildId: args.buildId,
        command,
        fingerprint,
        idempotencyKey: args.idempotencyKey,
        organizationId: auth.build.organizationId,
        result,
        submilestoneId: submilestone._id,
      });
      return result;
    })
    .public();
