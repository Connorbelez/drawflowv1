import { publishCanonicalBuildCollaborationSystemEvent } from "./build_collaboration_system_events";
import type { Doc, MutationCtx } from "./types";

const SYSTEM_LABEL = "DrawFlow Operations";

type MilestoneTransition = "submitted" | "approved" | "rejected" | "blocked";

type DrawTransition = "submitted" | "approved" | "released" | "returned";

export async function publishMilestoneCollaborationEvent(
  ctx: MutationCtx,
  input: {
    milestone: Doc<"buildMilestones">;
    note?: string;
    revision: number;
    transition: MilestoneTransition;
  }
) {
  const note = input.note?.trim();
  const isBlocked =
    input.transition === "rejected" || input.transition === "blocked";
  const transitionLabel =
    input.transition === "blocked"
      ? "was blocked pending requested changes"
      : input.transition === "submitted"
        ? "was submitted for lender review"
        : input.transition === "approved"
          ? "was approved"
          : "was rejected";
  await publishCanonicalBuildCollaborationSystemEvent(ctx, {
    buildId: input.milestone.buildId,
    idempotencyKey: `operational:milestone:${input.milestone._id}:r${input.revision}:${input.transition}`,
    notificationKind: isBlocked ? "blocker" : "ordinary_activity",
    notificationTitle: `Milestone ${input.transition}`,
    organizationId: input.milestone.organizationId,
    plainText: `${input.milestone.name} ${transitionLabel}.${note ? ` ${note}` : ""}`,
    postType:
      input.transition === "approved"
        ? "decision"
        : isBlocked
          ? "issue"
          : "update",
    primaryReferenceId: input.milestone._id,
    primaryReferenceKind: "milestone",
    remediation: isBlocked
      ? {
          description:
            note ||
            `Resolve the requested changes for ${input.milestone.name} and resubmit the Milestone for lender review.`,
          obligationKey: `milestone:${input.milestone._id}`,
          policyKey: "milestone-review-blocked",
          title: `Resolve ${input.milestone.name} review changes`,
          workKind: "evidence",
        }
      : undefined,
    systemLabel: SYSTEM_LABEL,
  });
}

export async function publishDrawCollaborationEvent(
  ctx: MutationCtx,
  input: {
    draw: Doc<"activeBuildDrawRequests">;
    note?: string;
    revision: number;
    transition: DrawTransition;
  }
) {
  const allocations = await ctx.db
    .query("activeBuildDrawRequestAllocations")
    .withIndex("by_request", (query) =>
      query.eq("drawRequestId", input.draw._id)
    )
    .take(256);
  const milestoneIds = [
    ...new Set(allocations.map((allocation) => allocation.buildMilestoneId)),
  ];
  const references = [
    {
      entityId: input.draw._id,
      entityKind: "draw" as const,
      primary: true,
    },
    ...milestoneIds.map((milestoneId) => ({
      entityId: milestoneId,
      entityKind: "milestone" as const,
    })),
  ];
  const note = input.note?.trim();
  const transitionLabel =
    input.transition === "submitted"
      ? "was submitted for lender review"
      : input.transition === "approved"
        ? "was approved for release"
        : input.transition === "released"
          ? `was released${input.draw.releaseDate ? ` on ${input.draw.releaseDate}` : ""}`
          : "was returned for changes";
  const returned = input.transition === "returned";
  await publishCanonicalBuildCollaborationSystemEvent(ctx, {
    buildId: input.draw.buildId,
    idempotencyKey: `operational:draw:${input.draw._id}:r${input.revision}:${input.transition}`,
    notificationKind: returned ? "blocker" : "ordinary_activity",
    notificationTitle: `Draw ${input.transition}`,
    organizationId: input.draw.organizationId,
    plainText: `${input.draw.label} (${input.draw.displayId}) ${transitionLabel}.${note ? ` ${note}` : ""}`,
    postType:
      input.transition === "approved"
        ? "decision"
        : returned
          ? "issue"
          : "update",
    references,
    remediation: returned
      ? {
          description:
            note ||
            `Resolve the lender changes for ${input.draw.displayId} before submitting a replacement Draw request.`,
          obligationKey: `draw:${input.draw._id}`,
          policyKey: "draw-returned",
          title: `Resolve ${input.draw.displayId} return conditions`,
          workKind: "draw_blocker",
        }
      : undefined,
    systemLabel: SYSTEM_LABEL,
  });
}

export async function publishDocumentCollaborationEvent(
  ctx: MutationCtx,
  input: {
    document: Doc<"buildDocuments">;
    supersededDocument?: Doc<"buildDocuments">;
  }
) {
  const transition = input.supersededDocument ? "superseded" : "added";
  const version = input.document.version ?? 1;
  await publishCanonicalBuildCollaborationSystemEvent(ctx, {
    buildId: input.document.buildId,
    idempotencyKey: `operational:document:${input.document._id}:v${version}:${transition}`,
    notificationTitle: input.supersededDocument
      ? "Governing Document superseded"
      : "Governing Document added",
    organizationId: input.document.organizationId,
    plainText: input.supersededDocument
      ? `${input.document.fileName} v${version} superseded ${input.supersededDocument.fileName} v${input.supersededDocument.version ?? Math.max(1, version - 1)}.`
      : `${input.document.fileName} v${version} was added as a ${input.document.documentType} Document.`,
    postType: "update",
    references: [
      {
        entityId: input.document._id,
        entityKind: "document",
        primary: true,
      },
      ...(input.supersededDocument
        ? [
            {
              entityId: input.supersededDocument._id,
              entityKind: "document" as const,
            },
          ]
        : []),
    ],
    systemLabel: SYSTEM_LABEL,
  });
}
