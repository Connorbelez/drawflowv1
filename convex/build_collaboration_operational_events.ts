import { publishCanonicalBuildCollaborationSystemEvent } from "./build_collaboration_system_events";
import type { Doc, MutationCtx } from "./types";

const SYSTEM_LABEL = "DrawFlow Operations";

export async function publishEvidenceSubmittedCollaborationEvents(
  ctx: MutationCtx,
  input: {
    asset: Doc<"buildEvidenceAssets">;
    revision: number;
  }
) {
  const reference = {
    entityId: input.asset._id,
    entityKind: "evidenceAsset" as const,
    primary: true,
  };
  await publishCanonicalBuildCollaborationSystemEvent(ctx, {
    buildId: input.asset.buildId,
    idempotencyKey: evidenceEventKey(input.asset, input.revision, "submitted"),
    notificationTitle: "Evidence submitted",
    organizationId: input.asset.organizationId,
    plainText: `${input.asset.label} was submitted for ${input.asset.milestoneKey}.`,
    postType: "update",
    references: [reference],
    systemLabel: SYSTEM_LABEL,
  });
  if (input.asset.locationVerified) {
    return;
  }
  await publishEvidenceLocationUnverifiedCollaborationEvent(ctx, input);
}

export async function publishEvidenceLocationUnverifiedCollaborationEvent(
  ctx: MutationCtx,
  input: {
    asset: Doc<"buildEvidenceAssets">;
    revision: number;
  }
) {
  const reference = {
    entityId: input.asset._id,
    entityKind: "evidenceAsset" as const,
    primary: true,
  };
  await publishCanonicalBuildCollaborationSystemEvent(ctx, {
    buildId: input.asset.buildId,
    idempotencyKey: evidenceEventKey(
      input.asset,
      input.revision,
      "location-unverified"
    ),
    notificationKind: "blocker",
    notificationTitle: "Evidence location needs review",
    organizationId: input.asset.organizationId,
    plainText: `${input.asset.label} was preserved, but its location could not be verified. Lender review is required.`,
    postType: "issue",
    references: [reference],
    remediation: {
      description:
        "Review the preserved Evidence, verify its location context, and record the lender decision without deleting the uploaded file.",
      obligationKey: `evidence-asset:${input.asset._id}`,
      policyKey: "evidence-location-unverified",
      title: `Review unverified location for ${input.asset.label}`,
      workKind: "evidence",
    },
    systemLabel: SYSTEM_LABEL,
  });
}

export async function publishEvidenceReviewCollaborationEvent(
  ctx: MutationCtx,
  input: {
    accepted: boolean;
    milestone: Doc<"buildMilestones">;
    note?: string;
    revision: number;
  }
) {
  const evidence = await ctx.db
    .query("buildEvidenceAssets")
    .withIndex("by_build_milestone", (query) =>
      query
        .eq("buildId", input.milestone.buildId)
        .eq("milestoneKey", input.milestone.key)
    )
    .take(100);
  const references = evidence.length
    ? evidence.map((asset, index) => ({
        entityId: asset.evidenceKey,
        entityKind: "evidencePackage" as const,
        primary: index === 0,
      }))
    : [
        {
          entityId: input.milestone._id,
          entityKind: "milestone" as const,
          primary: true,
        },
      ];
  const outcome = input.accepted ? "completed" : "rejected";
  const note = input.note?.trim();
  await publishCanonicalBuildCollaborationSystemEvent(ctx, {
    buildId: input.milestone.buildId,
    idempotencyKey: `operational:evidence-review:${input.milestone._id}:r${input.revision}:${outcome}`,
    notificationKind: input.accepted ? "ordinary_activity" : "blocker",
    notificationTitle: input.accepted
      ? "Evidence review completed"
      : "Evidence changes requested",
    organizationId: input.milestone.organizationId,
    plainText: input.accepted
      ? `Evidence for ${input.milestone.name} was accepted.${note ? ` ${note}` : ""}`
      : `Evidence for ${input.milestone.name} was rejected and requires changes.${note ? ` ${note}` : ""}`,
    postType: input.accepted ? "update" : "issue",
    references,
    remediation: input.accepted
      ? undefined
      : {
          description:
            note ||
            `Resolve the requested Evidence changes for ${input.milestone.name} and resubmit the package.`,
          obligationKey: `milestone:${input.milestone._id}`,
          policyKey: "evidence-review-rejected",
          title: `Resolve Evidence changes for ${input.milestone.name}`,
          workKind: "evidence",
        },
    systemLabel: SYSTEM_LABEL,
  });
}

export async function publishSiteVisitScheduledCollaborationEvent(
  ctx: MutationCtx,
  input: {
    revision: number;
    visit: Doc<"buildSiteVisits">;
  }
) {
  await publishCanonicalBuildCollaborationSystemEvent(ctx, {
    buildId: input.visit.buildId,
    idempotencyKey: siteVisitEventKey(input.visit, input.revision, "scheduled"),
    notificationTitle: "Site Visit scheduled",
    organizationId: input.visit.organizationId,
    plainText: `Site Visit ${input.visit.visitId} was scheduled for day ${input.visit.requestedDay}${input.visit.requestedTime ? ` at ${input.visit.requestedTime}` : ""}.`,
    postType: "update",
    primaryReferenceId: input.visit._id,
    primaryReferenceKind: "siteVisit",
    systemLabel: SYSTEM_LABEL,
  });
}

export async function publishSiteVisitRescheduledCollaborationEvent(
  ctx: MutationCtx,
  input: {
    reason: string;
    revision: number;
    visit: Doc<"buildSiteVisits">;
  }
) {
  await publishCanonicalBuildCollaborationSystemEvent(ctx, {
    buildId: input.visit.buildId,
    idempotencyKey: siteVisitEventKey(
      input.visit,
      input.revision,
      "rescheduled"
    ),
    notificationTitle: "Site Visit rescheduled",
    organizationId: input.visit.organizationId,
    plainText: `Site Visit ${input.visit.visitId} was rescheduled to day ${input.visit.requestedDay}${input.visit.requestedTime ? ` at ${input.visit.requestedTime}` : ""}. ${input.reason.trim()}`,
    postType: "update",
    primaryReferenceId: input.visit._id,
    primaryReferenceKind: "siteVisit",
    systemLabel: SYSTEM_LABEL,
  });
}

export async function publishSiteVisitCompletionCollaborationEvents(
  ctx: MutationCtx,
  input: {
    revision: number;
    visit: Doc<"buildSiteVisits">;
  }
) {
  const flaggedReasons = siteVisitFlaggedReasons(input.visit);
  if (input.visit.status === "complete") {
    await publishCanonicalBuildCollaborationSystemEvent(ctx, {
      buildId: input.visit.buildId,
      idempotencyKey: siteVisitEventKey(
        input.visit,
        input.revision,
        "completed"
      ),
      notificationTitle: "Site Visit completed",
      organizationId: input.visit.organizationId,
      plainText: `Site Visit ${input.visit.visitId} was completed for ${input.visit.milestoneKey}.`,
      postType: "update",
      primaryReferenceId: input.visit._id,
      primaryReferenceKind: "siteVisit",
      systemLabel: SYSTEM_LABEL,
    });
  }
  if (flaggedReasons.length === 0) {
    return;
  }
  await publishCanonicalBuildCollaborationSystemEvent(ctx, {
    buildId: input.visit.buildId,
    idempotencyKey: siteVisitEventKey(input.visit, input.revision, "flagged"),
    notificationKind: "blocker",
    notificationTitle: "Site Visit requires remediation",
    organizationId: input.visit.organizationId,
    plainText: `Site Visit ${input.visit.visitId} was flagged: ${flaggedReasons.join("; ")}. Preserved Evidence remains available for lender review.`,
    postType: "issue",
    primaryReferenceId: input.visit._id,
    primaryReferenceKind: "siteVisit",
    remediation: {
      description: `Resolve the Site Visit exceptions: ${flaggedReasons.join("; ")}. Preserve all submitted Evidence while recording the review outcome.`,
      obligationKey: `site-visit:${input.visit._id}`,
      policyKey: "site-visit-flagged",
      title: `Resolve Site Visit ${input.visit.visitId} exceptions`,
      workKind: "site_visit_remediation",
    },
    systemLabel: SYSTEM_LABEL,
  });
}

function evidenceEventKey(
  asset: Doc<"buildEvidenceAssets">,
  revision: number,
  transition: "submitted" | "location-unverified"
) {
  return `operational:evidence:${asset._id}:r${revision}:${transition}`;
}

function siteVisitEventKey(
  visit: Doc<"buildSiteVisits">,
  revision: number,
  transition: "scheduled" | "rescheduled" | "completed" | "flagged"
) {
  return `operational:site-visit:${visit._id}:r${revision}:${transition}`;
}

function siteVisitFlaggedReasons(visit: Doc<"buildSiteVisits">) {
  const reasons: string[] = [];
  if (visit.status === "cancelled") {
    reasons.push("completion was not observed");
  }
  if (visit.locationAttempt && !visit.locationAttempt.verified) {
    reasons.push(
      visit.locationAttempt.failureReason?.trim() || "location was unverified"
    );
  }
  if (visit.missingPrerequisites?.length) {
    reasons.push(
      `missing prerequisites: ${visit.missingPrerequisites.join(", ")}`
    );
  }
  return reasons;
}
