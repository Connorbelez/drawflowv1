import { v } from "convex/values";
import { authorizeActiveBuildAccess } from "./activeBuildAccess";
import { authenticatedQuery } from "./authz";
import { canReadCollaborationPost } from "./build_collaboration_access";
import { collaborationTagOptionValidator } from "./build_collaboration_contracts";
import type { Doc } from "./types";

const MAX_OPTIONS_PER_KIND = 500;

export const listBuildCollaborationTagOptions = authenticatedQuery
  .input({
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
  })
  .returns(v.array(collaborationTagOptionValidator))
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildAccess(ctx, args);
    const buildId = authorization.build._id;
    const role = authorization.effectiveRole.role;
    const canReadFinancialWork = role !== "contractor" && role !== "homeowner";
    const [
      milestones,
      submilestones,
      siteVisits,
      documents,
      evidenceAssets,
      costItems,
      actionItems,
      drawRequests,
      plannedDraws,
    ] = await Promise.all([
      ctx.db
        .query("buildMilestones")
        .withIndex("by_build_order", (query) => query.eq("buildId", buildId))
        .take(MAX_OPTIONS_PER_KIND),
      ctx.db
        .query("buildSubmilestones")
        .withIndex("by_build", (query) => query.eq("buildId", buildId))
        .take(MAX_OPTIONS_PER_KIND),
      ctx.db
        .query("buildSiteVisits")
        .withIndex("by_build", (query) => query.eq("buildId", buildId))
        .take(MAX_OPTIONS_PER_KIND),
      ctx.db
        .query("buildDocuments")
        .withIndex("by_build", (query) => query.eq("buildId", buildId))
        .take(MAX_OPTIONS_PER_KIND),
      ctx.db
        .query("buildEvidenceAssets")
        .withIndex("by_build", (query) => query.eq("buildId", buildId))
        .take(MAX_OPTIONS_PER_KIND),
      ctx.db
        .query("buildCostItems")
        .withIndex("by_build", (query) => query.eq("buildId", buildId))
        .take(MAX_OPTIONS_PER_KIND),
      ctx.db
        .query("buildActionItems")
        .withIndex("by_buildId_and_status_and_updatedAt", (query) =>
          query.eq("buildId", buildId)
        )
        .take(MAX_OPTIONS_PER_KIND),
      canReadFinancialWork
        ? ctx.db
            .query("activeBuildDrawRequests")
            .withIndex("by_build", (query) => query.eq("buildId", buildId))
            .take(MAX_OPTIONS_PER_KIND)
        : Promise.resolve([]),
      canReadFinancialWork
        ? ctx.db
            .query("plannedDrawScheduleRows")
            .withIndex("by_build_order", (query) =>
              query.eq("buildId", buildId)
            )
            .take(MAX_OPTIONS_PER_KIND)
        : Promise.resolve([]),
    ]);
    const readableActionItems: Doc<"buildActionItems">[] = [];
    for (const item of actionItems) {
      const post = await ctx.db.get(item.originatingPostId);
      if (post && (await canReadCollaborationPost(ctx, authorization, post))) {
        readableActionItems.push(item);
      }
    }
    const contractorDocuments =
      role === "contractor"
        ? documents.filter(
            (document) =>
              document.documentType === "permit" ||
              document.contractorVisible === true
          )
        : documents;
    const visibleEvidence =
      role === "contractor" || role === "homeowner" ? [] : evidenceAssets;
    const evidencePackages = [
      ...new Map(
        visibleEvidence.map((asset) => [
          asset.evidenceKey,
          {
            entityId: asset.evidenceKey,
            entityKind: "evidencePackage" as const,
            eyebrow: "Evidence Package",
            href: collaborationEntityHref(
              buildId,
              "evidencePackage",
              asset.evidenceKey
            ),
            label: asset.evidenceKey,
            searchTerms: [asset.milestoneKey, asset.tag],
            summary: `Evidence for ${asset.milestoneKey}`,
          },
        ])
      ).values(),
    ];

    return [
      ...authorization.participants.map((participant) => ({
        entityId: participant.workosUserId,
        entityKind: "participant" as const,
        eyebrow: roleLabel(participant.role),
        href: collaborationEntityHref(
          buildId,
          "participant",
          participant.workosUserId
        ),
        label: participant.displayName,
        searchTerms: [participant.role],
        summary: `${roleLabel(participant.role)} on this Build`,
      })),
      ...milestones.map((milestone) => ({
        entityId: milestone._id,
        entityKind: "milestone" as const,
        eyebrow: "Milestone",
        href: collaborationEntityHref(buildId, "milestone", milestone._id),
        label: milestone.name,
        searchTerms: [milestone.key, milestone.status],
        summary: `${milestone.progressPercent ?? 0}% complete · ${milestone.status.replaceAll("_", " ")}`,
      })),
      ...submilestones.map((submilestone) => ({
        entityId: submilestone._id,
        entityKind: "submilestone" as const,
        eyebrow: "Sub-milestone",
        href: collaborationEntityHref(
          buildId,
          "submilestone",
          submilestone._id
        ),
        label: submilestone.name,
        searchTerms: [submilestone.key, submilestone.milestoneKey],
        summary: submilestone.status.replaceAll("_", " "),
      })),
      ...drawRequests.map((draw) => ({
        entityId: draw._id,
        entityKind: "draw" as const,
        eyebrow: "Draw",
        href: collaborationEntityHref(buildId, "draw", draw._id),
        label: draw.label,
        searchTerms: [draw.displayId, draw.requestKey, draw.status],
        summary: `${formatCents(draw.amountCents)} · ${draw.status.replaceAll("_", " ")}`,
      })),
      ...plannedDraws.map((draw) => ({
        entityId: draw._id,
        entityKind: "draw" as const,
        eyebrow: "Planned Draw",
        href: collaborationEntityHref(buildId, "draw", draw._id),
        label: draw.label,
        searchTerms: [draw.drawKey, draw.status],
        summary: `${formatCents(draw.amountCents)} · ${draw.status.replaceAll("_", " ")}`,
      })),
      ...evidencePackages,
      ...visibleEvidence.map((asset) => ({
        entityId: asset._id,
        entityKind: "evidenceAsset" as const,
        eyebrow: "Evidence Asset",
        href: collaborationEntityHref(buildId, "evidenceAsset", asset._id),
        label: asset.label,
        searchTerms: [asset.evidenceKey, asset.fileName, asset.tag],
        summary: `${asset.tag} · ${asset.locationVerified ? "location verified" : "location unverified"}`,
      })),
      ...siteVisits.map((visit) => ({
        entityId: visit._id,
        entityKind: "siteVisit" as const,
        eyebrow: "Site Visit",
        href: collaborationEntityHref(buildId, "siteVisit", visit._id),
        label: `Site Visit ${visit.visitId}`,
        searchTerms: [visit.milestoneKey, visit.status],
        summary: visit.status.replaceAll("_", " "),
      })),
      ...contractorDocuments.map((document) => ({
        entityId: document._id,
        entityKind: "document" as const,
        eyebrow: "Document",
        href: collaborationEntityHref(buildId, "document", document._id),
        label: document.fileName,
        searchTerms: [document.documentType, document.status],
        summary: `${document.documentType} · ${document.status}`,
      })),
      ...costItems.map((item) => ({
        entityId: item._id,
        entityKind: "material" as const,
        eyebrow: item.itemType === "material" ? "Material" : "Cost Item",
        href: collaborationEntityHref(buildId, "material", item._id),
        label: item.title,
        searchTerms: [item.itemKey, item.milestoneKey, item.supplier ?? ""],
        summary: `${formatCents(item.costCents)} · ${item.quantity} qty`,
      })),
      ...readableActionItems.map((item) => ({
        entityId: item._id,
        entityKind: "actionItem" as const,
        eyebrow: "Action Item",
        href: collaborationEntityHref(buildId, "actionItem", item._id),
        label: item.title,
        searchTerms: [item.status, item.priority],
        summary: `${item.status.replaceAll("_", " ")} · ${item.priority} priority`,
      })),
    ];
  })
  .public();

function collaborationEntityHref(
  buildId: string,
  entityKind: string,
  entityId: string
) {
  const tabByKind: Record<string, string> = {
    actionItem: "details",
    document: "documents",
    draw: "draws",
    evidenceAsset: "evidence",
    evidencePackage: "evidence",
    material: "materials",
    milestone: "milestones",
    participant: "staff",
    siteVisit: "calendar",
    submilestone: "milestones",
  };
  const tab = tabByKind[entityKind] ?? "details";
  return `/builds/${buildId}?tab=${tab}&focus=${encodeURIComponent(`${entityKind}:${entityId}`)}`;
}

function formatCents(cents: number) {
  return new Intl.NumberFormat("en-CA", {
    currency: "CAD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(cents / 100);
}

function roleLabel(role: string) {
  return role
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
