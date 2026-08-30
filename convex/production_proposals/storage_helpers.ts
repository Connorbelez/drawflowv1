/**
 * Production proposals storage helpers bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { type RoleSlug } from "../authz";
import { type Doc, type Id, type MutationCtx, type QueryCtx } from "../types";
import { hasProjectedWorkosPermission as hasPermission } from "../workos_permission_access";
import { latestBuildCapitalPlan } from "./active_cost.js";
import { builderAccountLinkWorkosState } from "./authorization_core.js";
import { getActiveBuilderStaffAccountLinksByEmail, resolveBuilderStaffViewerEmail, normalizeBuilderStaffAssignedEmail } from "./builder_staff_access.js";
import { canReadBackofficeProposal } from "./contractor_policy_helpers.js";
import { PROPOSAL_COLUMNS, BACKOFFICE_DASHBOARD_PROPOSALS_PER_COLUMN, ACTIVE_BUILD_DOCUMENT_URL_CAP, ACTIVE_BUILD_EVIDENCE_URL_CAP, ACTIVE_BUILD_SITE_PHOTOS_LIMIT } from "./contracts_foundation.js";
import { productionDaysActive, productionMilestoneIsBehindSchedule } from "./roster_projection_helpers.js";
import { productionTemplateSortOrder } from "./seed_default_builders.js";
import { PRODUCTION_DEFAULT_TEMPLATES } from "./seed_template_defaults.js";

export async function withBuildDocumentStorageUrls(
  ctx: QueryCtx,
  documents: Doc<"buildDocuments">[],
  urlCap: number = ACTIVE_BUILD_DOCUMENT_URL_CAP,
) {
  const resolveStorageUrl = createStorageUrlResolver(ctx, urlCap);
  // Prefer permit docs for URL resolution so first-paint permit viewers keep working
  // when the storage URL cap is hit.
  return await Promise.all(
    documents
      .slice()
      .sort((a, b) => {
        const aPermit = a.documentType === "permit" ? 0 : 1;
        const bPermit = b.documentType === "permit" ? 0 : 1;
        return aPermit - bPermit || a.createdAt - b.createdAt;
      })
      .map(async (document) => ({
        ...document,
        name: document.fileName,
        kind: document.documentType,
        storageUrl: await resolveStorageUrl(document.storageId),
      })),
  );
}

export async function withBuildEvidenceAssetStorageUrls(
  ctx: QueryCtx,
  evidenceAssets: Doc<"buildEvidenceAssets">[],
  urlCap: number = ACTIVE_BUILD_EVIDENCE_URL_CAP,
) {
  const resolveStorageUrl = createStorageUrlResolver(ctx, urlCap);
  return await Promise.all(
    evidenceAssets
      .slice()
      .sort((a, b) => a.createdAt - b.createdAt)
      .map(async (asset) => ({
        _id: String(asset._id),
        contractorIds: asset.contractorIds,
        createdAt: asset.createdAt,
        evidenceKey: asset.evidenceKey,
        fileName: asset.fileName,
        label: asset.label,
        locationVerified: asset.locationVerified,
        milestoneKey: asset.milestoneKey,
        mimeType: asset.mimeType,
        previewUrl: await resolveStorageUrl(asset.storageId),
        sizeBytes: asset.sizeBytes,
        source: asset.source,
        submilestoneKey: asset.submilestoneKey,
        tag: asset.tag,
        updatedAt: asset.updatedAt,
      })),
  );
}

export function createStorageUrlResolver(ctx: QueryCtx, cap: number) {
  const cache = new Map<string, Promise<string | null>>();
  let resolvedCount = 0;
  return async (
    storageId: Id<"_storage"> | null | undefined,
  ): Promise<string | null> => {
    if (!storageId) {
      return null;
    }
    const key = String(storageId);
    const cached = cache.get(key);
    if (cached) {
      return cached;
    }
    if (resolvedCount >= cap) {
      const skipped = Promise.resolve(null);
      cache.set(key, skipped);
      return skipped;
    }
    resolvedCount += 1;
    const pending = ctx.storage.getUrl(storageId);
    cache.set(key, pending);
    return pending;
  };
}

export async function productionSitePhotosForBuild(
  ctx: QueryCtx,
  build: Doc<"activeBuilds">,
  evidenceAssets: Doc<"buildEvidenceAssets">[],
) {
  const imageAssets = evidenceAssets
    .filter(
      (asset) =>
        asset.mimeType.startsWith("image/") ||
        asset.tag.toLowerCase().includes("photo"),
    )
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(0, ACTIVE_BUILD_SITE_PHOTOS_LIMIT);
  if (imageAssets.length === 0) {
    return [
      {
        caption: "Build site overview",
        evidenceKey: `build-overview-${String(build._id)}`,
        locationVerified: true,
        takenAt: new Date(build.createdAt).toISOString(),
        url: `production-build://${String(build._id)}`,
      },
    ];
  }
  return await Promise.all(
    imageAssets.map(async (asset) => ({
      caption: asset.label,
      evidenceKey: asset.evidenceKey,
      locationVerified: asset.locationVerified,
      takenAt: new Date(asset.createdAt).toISOString(),
      url: asset.storageId
        ? ((await ctx.storage.getUrl(asset.storageId)) ??
          `production-evidence://${asset.evidenceKey}`)
        : `production-evidence://${asset.evidenceKey}`,
    })),
  );
}

export async function getActiveWorkflowRule(
  ctx: QueryCtx | MutationCtx,
  brokerageId: Id<"brokerages">,
) {
  const rule = await ctx.db
    .query("workflowRules")
    .withIndex("by_brokerage_status", (q) =>
      q.eq("brokerageId", brokerageId).eq("status", "active"),
    )
    .first();
  if (!rule) {
    throw new Error("Missing active workflow rule.");
  }
  return rule;
}

export async function getWorkflowSnapshot(
  ctx: QueryCtx | MutationCtx,
  proposal: Doc<"buildProposals">,
) {
  if (!proposal.workflowRuleSnapshotId) {
    throw new Error("Proposal is missing workflow rule snapshot.");
  }
  const snapshot = await ctx.db.get(proposal.workflowRuleSnapshotId);
  if (!snapshot) {
    throw new Error("Proposal workflow rule snapshot was not found.");
  }
  return snapshot;
}

export async function getPermitDocument(
  ctx: QueryCtx | MutationCtx,
  proposalId: Id<"buildProposals">,
) {
  return await ctx.db
    .query("proposalDocuments")
    .withIndex("by_proposal_type", (q) =>
      q.eq("proposalId", proposalId).eq("documentType", "permit"),
    )
    .first();
}

export async function getPermitWaiver(
  ctx: QueryCtx | MutationCtx,
  proposalId: Id<"buildProposals">,
) {
  return await ctx.db
    .query("documentWaivers")
    .withIndex("by_proposal_type", (q) =>
      q.eq("proposalId", proposalId).eq("documentType", "permit"),
    )
    .first();
}

export async function withDocumentStorageUrls(
  ctx: QueryCtx,
  documents: Doc<"proposalDocuments">[],
) {
  return await Promise.all(
    documents.map(async (document) => ({
      ...document,
      storageUrl: document.storageId
        ? await ctx.storage.getUrl(document.storageId)
        : null,
    })),
  );
}

export async function visibleBuilderCards(
  ctx: QueryCtx,
  auth: { brokerage: Doc<"brokerages">; subject: string },
) {
  const links = await ctx.db
    .query("builderAccountLinks")
    .withIndex("by_user", (q) => q.eq("workosUserId", auth.subject))
    .collect();
  const visible: Doc<"proposalKanbanCards">[] = [];
  for (const link of links.filter((row) => row.status === "active")) {
    const proposals = await ctx.db
      .query("buildProposals")
      .withIndex("by_builder", (q) =>
        q.eq("builderProfileId", link.builderProfileId),
      )
      .collect();
    for (const proposal of proposals) {
      if (proposal.brokerageId !== auth.brokerage._id) {
        continue;
      }
      const card = await ctx.db
        .query("proposalKanbanCards")
        .withIndex("by_proposal", (q) => q.eq("proposalId", proposal._id))
        .unique();
      if (card) {
        visible.push(card);
      }
    }
  }
  return visible;
}

export async function buildAdminBuilderStaffWorkspace(
  ctx: QueryCtx,
  input: {
    brokerage: Doc<"brokerages">;
  },
) {
  const proposals = await ctx.db
    .query("buildProposals")
    .withIndex("by_brokerage", (q) => q.eq("brokerageId", input.brokerage._id))
    .collect();
  const activeBuilds = await ctx.db
    .query("activeBuilds")
    .withIndex("by_brokerage", (q) => q.eq("brokerageId", input.brokerage._id))
    .collect();

  const proposalRows = [];
  for (const proposal of proposals) {
    const row = await builderStaffProposalWorkspaceRow(
      ctx,
      input.brokerage,
      proposal._id,
    );
    if (row) {
      proposalRows.push(row);
    }
  }

  const activeBuildRows = [];
  for (const build of activeBuilds) {
    const row = await builderStaffActiveBuildWorkspaceRow(
      ctx,
      input.brokerage,
      build._id,
    );
    if (row) {
      activeBuildRows.push(row);
    }
  }

  return {
    activeBuildRows: activeBuildRows.sort(workspaceRowSort),
    proposalRows: proposalRows.sort(workspaceRowSort),
  };
}

export async function buildBuilderStaffWorkspace(
  ctx: QueryCtx,
  input: {
    auth: {
      brokerage: Doc<"brokerages">;
      email?: string;
      roles: RoleSlug[];
      subject: string;
    };
    workosOrganizationId: string;
  },
) {
  const grantsById = new Map<string, Doc<"builderStaffPermissionGrants">>();
  const directGrants = await ctx.db
    .query("builderStaffPermissionGrants")
    .withIndex("by_user", (q) => q.eq("workosUserId", input.auth.subject))
    .collect();
  for (const grant of directGrants) {
    grantsById.set(String(grant._id), grant);
  }
  const viewerEmail = await resolveBuilderStaffViewerEmail(ctx, input.auth);
  if (viewerEmail) {
    const emailLinks = await getActiveBuilderStaffAccountLinksByEmail(
      ctx,
      viewerEmail,
    );
    for (const link of emailLinks) {
      const linkGrants = await ctx.db
        .query("builderStaffPermissionGrants")
        .withIndex("by_link", (q) => q.eq("builderAccountLinkId", link._id))
        .collect();
      for (const grant of linkGrants) {
        grantsById.set(String(grant._id), grant);
      }
    }
  }
  const grants = [...grantsById.values()];
  const proposalIds = new Set<string>();
  const activeBuildIds = new Set<string>();
  const linkCache = new Map<string, Doc<"builderAccountLinks"> | null>();

  for (const grant of grants) {
    if (!builderStaffGrantHasAnyCapability(grant)) {
      continue;
    }
    const linkKey = String(grant.builderAccountLinkId);
    let link = linkCache.get(linkKey);
    if (link === undefined) {
      link = await ctx.db.get(grant.builderAccountLinkId);
      linkCache.set(linkKey, link);
    }
    const assignedEmail = normalizeBuilderStaffAssignedEmail(
      link?.assignedEmail,
    );
    if (
      !link ||
      link.status !== "active" ||
      link.role !== "staff" ||
      (link.workosUserId !== input.auth.subject &&
        (!viewerEmail || assignedEmail !== viewerEmail)) ||
      link.builderProfileId !== grant.builderProfileId
    ) {
      continue;
    }
    const workosState = await builderAccountLinkWorkosState(ctx, {
      link,
      workosOrganizationId: input.workosOrganizationId,
    });
    if (workosState.hidden) {
      continue;
    }
    if (grant.scope === "proposal" && grant.proposalId) {
      proposalIds.add(String(grant.proposalId));
    }
    if (grant.scope === "activeBuild" && grant.buildId) {
      activeBuildIds.add(String(grant.buildId));
    }
  }

  const proposalRows = [];
  for (const rawProposalId of proposalIds) {
    const proposalId = ctx.db.normalizeId("buildProposals", rawProposalId);
    if (!proposalId) {
      continue;
    }
    const row = await builderStaffProposalWorkspaceRow(
      ctx,
      input.auth.brokerage,
      proposalId,
    );
    if (row) {
      proposalRows.push(row);
    }
  }

  const activeBuildRows = [];
  for (const rawBuildId of activeBuildIds) {
    const buildId = ctx.db.normalizeId("activeBuilds", rawBuildId);
    if (!buildId) {
      continue;
    }
    const row = await builderStaffActiveBuildWorkspaceRow(
      ctx,
      input.auth.brokerage,
      buildId,
    );
    if (row) {
      activeBuildRows.push(row);
    }
  }

  return {
    activeBuildRows: activeBuildRows.sort(workspaceRowSort),
    proposalRows: proposalRows.sort(workspaceRowSort),
  };
}

export function builderStaffGrantHasAnyCapability(
  grant: Pick<
    Doc<"builderStaffPermissionGrants">,
    "canCreate" | "canDelete" | "canUpdate" | "canView"
  >,
) {
  return grant.canCreate || grant.canDelete || grant.canUpdate || grant.canView;
}

async function builderStaffProposalWorkspaceRow(
  ctx: QueryCtx,
  brokerage: Doc<"brokerages">,
  proposalId: Id<"buildProposals">,
) {
  const proposal = await ctx.db.get(proposalId);
  if (!proposal || proposal.brokerageId !== brokerage._id) {
    return null;
  }
  const [card, milestones, draws, modificationRequests] = await Promise.all([
    ctx.db
      .query("proposalKanbanCards")
      .withIndex("by_proposal", (q) => q.eq("proposalId", proposalId))
      .unique(),
    collectByIndex(ctx, "proposalMilestones", "by_proposal", proposalId),
    collectByIndex(ctx, "proposalDrawScheduleRows", "by_proposal", proposalId),
    collectByIndex(
      ctx,
      "proposalTimelineModificationRequests",
      "by_proposal",
      proposalId,
    ),
  ]);
  const proposalDraws = draws as Doc<"proposalDrawScheduleRows">[];
  const proposalModificationRequests =
    modificationRequests as Doc<"proposalTimelineModificationRequests">[];
  return {
    activeBuildId: proposal.activeBuildId
      ? String(proposal.activeBuildId)
      : undefined,
    buildKey: proposal.activeBuildId
      ? String(proposal.activeBuildId)
      : undefined,
    buildName: card?.title ?? proposal.buildName,
    drawCount: proposalDraws.length,
    kind: "proposal",
    milestoneCount: milestones.length,
    pendingDrawRequestCount: proposalDraws.filter(
      (draw) => draw.requestStatus === "requested",
    ).length,
    pendingModificationRequestCount: proposalModificationRequests.filter(
      (request) => request.status === "requested",
    ).length,
    planId: String(proposal._id),
    proposalId: String(proposal._id),
    status: builderStaffWorkspaceProposalStatus(
      card?.column ?? proposal.status,
    ),
    totalBudgetCents: card?.totalBudgetCents ?? proposal.totalBudgetCents,
    updatedAt: Math.max(card?.updatedAt ?? 0, proposal.updatedAt),
  };
}

async function activeBuildBudgetGovernanceProjection(
  ctx: QueryCtx,
  build: Doc<"activeBuilds">,
) {
  const [capitalPlans, requests, milestones, drawRequests] = await Promise.all([
    ctx.db
      .query("buildCapitalPlans")
      .withIndex("by_build", (q) => q.eq("buildId", build._id))
      .take(100),
    ctx.db
      .query("activeBuildBudgetRevisionRequests")
      .withIndex("by_build", (q) => q.eq("buildId", build._id))
      .take(100),
    ctx.db
      .query("buildMilestones")
      .withIndex("by_build_order", (q) => q.eq("buildId", build._id))
      .take(100),
    ctx.db
      .query("activeBuildDrawRequests")
      .withIndex("by_build", (q) => q.eq("buildId", build._id))
      .take(100),
  ]);
  const activePlan = latestBuildCapitalPlan(capitalPlans);
  if (!activePlan) {
    return null;
  }
  const latestRequest = requests.sort(
    (a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt,
  )[0];
  const varianceCents = latestRequest?.varianceCents ?? 0;
  const proposedVersion =
    latestRequest?.status === "requested"
      ? latestRequest.baseVersion + 1
      : null;

  return {
    activeVersion: activePlan.version,
    activeVersionLabel: `Capital plan v${activePlan.version}`,
    affectedDrawRequestCount: drawRequests.filter(
      (request) => request.status === "requested",
    ).length,
    affectedDrawRequestIds: drawRequests
      .filter((request) => request.status === "requested")
      .map((request) => String(request._id)),
    affectedMilestoneCount: milestones.length,
    affectedMilestoneKeys: milestones.map((milestone) => milestone.key),
    currentOwner:
      latestRequest?.status === "requested" ? "Lender Admin" : "Builder",
    decisionStatus:
      latestRequest?.status === "requested"
        ? "pending"
        : (latestRequest?.status ?? "current"),
    proposedVersion,
    proposedVersionLabel: proposedVersion
      ? `Proposed capital plan v${proposedVersion}`
      : null,
    requestId: latestRequest ? String(latestRequest._id) : null,
    requestReason: latestRequest?.reason ?? null,
    requestType: latestRequest ? "capitalPlanRevision" : null,
    revisionDeadline: null,
    revisionPriority:
      latestRequest?.status === "requested"
        ? varianceCents > 0
          ? "required"
          : "recommended"
        : null,
    varianceBps:
      latestRequest &&
      typeof latestRequest.priorState?.lenderDrawPolicyLimitCents ===
        "number" &&
      latestRequest.priorState.lenderDrawPolicyLimitCents > 0
        ? Math.round(
            (varianceCents /
              latestRequest.priorState.lenderDrawPolicyLimitCents) *
              10_000,
          )
        : 0,
    varianceCents,
  };
}

export async function builderStaffActiveBuildWorkspaceRow(
  ctx: QueryCtx,
  brokerage: Doc<"brokerages">,
  buildId: Id<"activeBuilds">,
) {
  const build = await ctx.db.get(buildId);
  if (!build || build.brokerageId !== brokerage._id) {
    return null;
  }
  const proposal = await ctx.db.get(build.proposalId);
  if (!proposal || proposal.brokerageId !== brokerage._id) {
    return null;
  }
  const [
    builder,
    milestones,
    submilestones,
    draws,
    drawRequests,
    facilityChangeRequests,
    evidence,
  ] = await Promise.all([
    ctx.db.get(build.builderProfileId),
    collectByIndex(ctx, "buildMilestones", "by_build", buildId),
    collectByIndex(ctx, "buildSubmilestones", "by_build", buildId),
    collectByIndex(ctx, "plannedDrawScheduleRows", "by_build", buildId),
    collectByIndex(ctx, "activeBuildDrawRequests", "by_build", buildId),
    collectByIndex(
      ctx,
      "activeBuildFacilityChangeRequests",
      "by_build",
      buildId,
    ),
    collectByIndex(ctx, "buildEvidenceAssets", "by_build", buildId),
  ]);
  const buildMilestones = milestones as Doc<"buildMilestones">[];
  const buildSubmilestones = submilestones as Doc<"buildSubmilestones">[];
  const buildDraws = draws as Doc<"plannedDrawScheduleRows">[];
  const buildDrawRequests = drawRequests as Doc<"activeBuildDrawRequests">[];
  const buildFacilityChangeRequests =
    facilityChangeRequests as Doc<"activeBuildFacilityChangeRequests">[];
  const buildEvidence = evidence as Doc<"buildEvidenceAssets">[];
  const firstImage = buildEvidence.find(
    (asset) => asset.storageId && asset.mimeType.startsWith("image/"),
  );
  const currentDay = productionDaysActive(build.startDate);
  return {
    budgetGovernance: await activeBuildBudgetGovernanceProjection(ctx, build),
    buildKey: String(build._id),
    buildName: build.buildName,
    buildStatus: build.status,
    builderName: builder?.displayName ?? "Builder",
    drawCount: buildDraws.length,
    imageUrl: firstImage?.storageId
      ? await ctx.storage.getUrl(firstImage.storageId)
      : null,
    kind: "activeBuild",
    location: build.location,
    locationLatitude: build.locationLatitude,
    locationLongitude: build.locationLongitude,
    milestoneCount: buildMilestones.length,
    milestonesBehindSchedule: buildMilestones.filter((milestone) =>
      productionMilestoneIsBehindSchedule(
        milestone,
        currentDay,
        buildSubmilestones.filter(
          (submilestone) => submilestone.milestoneKey === milestone.key,
        ),
      ),
    ).length,
    pendingDrawRequestCount: buildDrawRequests.filter(
      (request) => request.status === "requested",
    ).length,
    pendingModificationRequestCount: buildFacilityChangeRequests.filter(
      (request) => request.status === "requested",
    ).length,
    planId: String(build._id),
    proposalId: String(proposal._id),
    status: "approved",
    totalBudgetCents: build.totalBudgetCents,
    updatedAt: build.updatedAt,
  };
}

function builderStaffWorkspaceProposalStatus(
  status: (typeof PROPOSAL_COLUMNS)[number],
) {
  return status === "closed" ? "approved" : status;
}

function workspaceRowSort(
  a: { buildName: string; updatedAt: number },
  b: { buildName: string; updatedAt: number },
) {
  return b.updatedAt - a.updatedAt || a.buildName.localeCompare(b.buildName);
}

export async function visibleBackofficeCards(
  ctx: QueryCtx,
  auth: { brokerage: Doc<"brokerages">; roles: RoleSlug[]; subject: string },
) {
  const cards = await ctx.db
    .query("proposalKanbanCards")
    .withIndex("by_brokerage_column_sort", (q) =>
      q.eq("brokerageId", auth.brokerage._id),
    )
    .collect();
  const staffCanRead =
    auth.roles.includes("broker-staff") &&
    (await hasPermission(
      ctx,
      auth.brokerage.workosOrganizationId,
      auth.roles,
      "proposals:read",
    ));
  const visible: Doc<"proposalKanbanCards">[] = [];

  for (const card of cards) {
    const proposal = await ctx.db.get(card.proposalId);
    if (!proposal) {
      continue;
    }
    if (canReadBackofficeProposal(auth, proposal) || staffCanRead) {
      visible.push(card);
    }
  }

  return visible;
}

export async function visibleBackofficeDashboardProposalRows(
  ctx: QueryCtx,
  auth: { brokerage: Doc<"brokerages">; roles: RoleSlug[]; subject: string },
  staffCanRead: boolean,
) {
  const cardsByColumn = await Promise.all(
    PROPOSAL_COLUMNS.map((column) =>
      ctx.db
        .query("proposalKanbanCards")
        .withIndex("by_brokerage_column_sort", (q) =>
          q.eq("brokerageId", auth.brokerage._id).eq("column", column),
        )
        .order("desc")
        .take(BACKOFFICE_DASHBOARD_PROPOSALS_PER_COLUMN)
        .then((cards) => cards.reverse()),
    ),
  );
  const cards = cardsByColumn.flat();
  // Batch proposal loads once (deduped) instead of N+1 per kanban card.
  const uniqueProposalIds = [
    ...new Set(cards.map((card) => card.proposalId)),
  ];
  const proposalDocs = await Promise.all(
    uniqueProposalIds.map((proposalId) => ctx.db.get(proposalId)),
  );
  const proposalById = new Map(
    proposalDocs.flatMap((proposal) =>
      proposal ? [[proposal._id, proposal] as const] : [],
    ),
  );
  return cards.flatMap((card) => {
    const proposal = proposalById.get(card.proposalId);
    if (
      !(
        proposal &&
        (canReadBackofficeProposal(auth, proposal) || staffCanRead)
      )
    ) {
      return [];
    }
    return [{ card, proposal }];
  });
}

export async function buildProductionSettingsProjection(
  ctx: QueryCtx | MutationCtx,
  brokerage: Doc<"brokerages">,
) {
  const [archetypes, workflowRules, templates] = await Promise.all([
    ctx.db
      .query("milestoneArchetypes")
      .withIndex("by_brokerage_key", (q) => q.eq("brokerageId", brokerage._id))
      .collect(),
    ctx.db
      .query("workflowRules")
      .withIndex("by_brokerage", (q) => q.eq("brokerageId", brokerage._id))
      .collect(),
    collectProposalTemplateDetails(ctx, brokerage._id),
  ]);

  return {
    archetypes,
    brokerage,
    completeness: productionSettingsCompleteness(templates),
    templates,
    workflowRules,
  };
}

export async function collectProposalTemplateDetails(
  ctx: QueryCtx | MutationCtx,
  brokerageId: Id<"brokerages">,
) {
  const templates = (
    await ctx.db
      .query("proposalTemplates")
      .withIndex("by_brokerage", (q) => q.eq("brokerageId", brokerageId))
      .collect()
  )
    .filter((template) => template.status === "active")
    .sort(
      (a, b) =>
        Number(b.isDefault) - Number(a.isDefault) ||
        productionTemplateSortOrder(a.templateKey) -
          productionTemplateSortOrder(b.templateKey) ||
        a.createdAt - b.createdAt ||
        a.templateKey.localeCompare(b.templateKey),
    );
  const templateDetails = [];
  for (const template of templates) {
    const [milestones, scenarios] = await Promise.all([
      ctx.db
        .query("proposalTemplateMilestones")
        .withIndex("by_template_order", (q) => q.eq("templateId", template._id))
        .collect(),
      ctx.db
        .query("drawScheduleScenarios")
        .withIndex("by_template", (q) => q.eq("templateId", template._id))
        .collect(),
    ]);
    const milestoneDetails = [];
    for (const milestone of milestones) {
      const submilestones = (
        await ctx.db
          .query("proposalTemplateSubmilestones")
          .withIndex("by_template_milestone", (q) =>
            q.eq("templateMilestoneId", milestone._id),
          )
          .collect()
      ).sort((a, b) => a.order - b.order || a.key.localeCompare(b.key));
      milestoneDetails.push({
        ...milestone,
        icon: milestone.archetypeKey ?? milestone.key,
        included: true,
        milestoneKey: milestone.key,
        submilestones: submilestones.map((submilestone) => ({
          ...submilestone,
          description: `${submilestone.name} completion target.`,
          submilestoneKey: submilestone.key,
        })),
        type: milestone.archetypeKey ?? milestone.key,
      });
    }
    const scenarioDetails = [];
    for (const scenario of scenarios
      .filter((row) => row.status === "active")
      .sort(
        (a, b) =>
          Number(a.sortOrder ?? Number.MAX_SAFE_INTEGER) -
            Number(b.sortOrder ?? Number.MAX_SAFE_INTEGER) ||
          Number(b.isDefault) - Number(a.isDefault) ||
          a.createdAt - b.createdAt ||
          a.scenarioKey.localeCompare(b.scenarioKey),
      )) {
      scenarioDetails.push({
        ...scenario,
        description:
          scenario.description ??
          `${scenario.name} draw timing and reimbursement amount assumptions.`,
        draws: await listProductionScenarioDraws(
          ctx,
          template._id,
          scenario.scenarioKey,
        ),
        isActive: scenario.isActive ?? scenario.isDefault,
        sortOrder: scenario.sortOrder ?? scenarioDetails.length,
      });
    }
    templateDetails.push({
      ...template,
      description: template.summary,
      milestones: milestoneDetails,
      scenarios: scenarioDetails,
    });
  }
  return templateDetails;
}

export async function listProductionScenarioDraws(
  ctx: QueryCtx | MutationCtx,
  templateId: Id<"proposalTemplates">,
  scenarioKey: string,
) {
  return await ctx.db
    .query("drawScheduleScenarioRows")
    .withIndex("by_template_scenario_order", (q) =>
      q.eq("templateId", templateId).eq("scenarioKey", scenarioKey),
    )
    .collect()
    .then((rows) =>
      rows.sort(
        (a, b) => a.order - b.order || a.drawKey.localeCompare(b.drawKey),
      ),
    );
}

function productionSettingsCompleteness(
  templates: Array<{
    milestones: unknown[];
    scenarios: Array<{ draws?: unknown[]; isActive?: boolean }>;
    templateKey: string;
  }>,
) {
  const requiredTemplateKeys = PRODUCTION_DEFAULT_TEMPLATES.map(
    (template) => template.templateKey,
  );
  return {
    missingTemplateKeys: requiredTemplateKeys.filter(
      (templateKey) =>
        !templates.some((template) => template.templateKey === templateKey),
    ),
    readyTemplateCount: templates.filter(
      (template) =>
        template.milestones.length > 0 &&
        template.scenarios.some((scenario) => scenario.isActive) &&
        template.scenarios.every(
          (scenario) => (scenario.draws ?? []).length > 0,
        ),
    ).length,
    requiredTemplateCount: requiredTemplateKeys.length,
    templateCount: templates.length,
  };
}

export async function collectByIndex<TableName extends keyof any>(
  ctx: QueryCtx | MutationCtx,
  table: TableName,
  indexName: string,
  id: string,
) {
  const fieldName =
    indexName === "by_build"
      ? "buildId"
      : indexName === "by_contractor"
        ? "contractorId"
        : "proposalId";
  return await (ctx.db.query(table as never) as any)
    .withIndex(indexName, (q: any) => q.eq(fieldName, id))
    .collect();
}
