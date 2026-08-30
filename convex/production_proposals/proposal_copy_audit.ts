/**
 * Production proposals proposal copy audit bounded-context implementation.
 * The parent facade re-exports its handlers to preserve production_proposals function references.
 */
import { copyProposalDocumentsToActiveBuild } from "../active_build_document_lineage";
import { type RoleSlug } from "../authz";
import { type Doc, type Id, type MutationCtx, type QueryCtx } from "../types";
import { type ActiveBuildAuditResourceType, deriveActiveBuildAuditResourceType } from "./active_build_staff.js";
import { addDaysIso } from "./active_capital_evidence.js";
import { activeBuildDrawFundingSnapshot } from "./active_funding.js";
import { deleteProposalSubmilestoneCanonicalLineage } from "./proposal_cost_persistence.js";
import { normalizeCostItemBudgetTreatment } from "./proposal_cost_validation.js";
import { normalizeCapitalEventInterestRate } from "./proposal_draft_persistence.js";
import { collectByIndex } from "./storage_helpers.js";

export async function getProductionMilestoneOrThrow(
  ctx: QueryCtx | MutationCtx,
  proposalId: Id<"buildProposals">,
  milestoneKey: string,
) {
  const milestone = await ctx.db
    .query("proposalMilestones")
    .withIndex("by_proposal_key", (q) =>
      q.eq("proposalId", proposalId).eq("key", milestoneKey),
    )
    .unique();
  if (!milestone) {
    throw new Error("Production milestone not found.");
  }
  return milestone;
}

export async function getProductionDrawOrThrow(
  ctx: QueryCtx | MutationCtx,
  proposalId: Id<"buildProposals">,
  drawKey: string,
) {
  const draw = await ctx.db
    .query("proposalDrawScheduleRows")
    .withIndex("by_proposal_key", (q) =>
      q.eq("proposalId", proposalId).eq("drawKey", drawKey),
    )
    .unique();
  if (!draw) {
    throw new Error("Production draw not found.");
  }
  return draw;
}

export async function getProductionCapitalEventOrThrow(
  ctx: QueryCtx | MutationCtx,
  proposalId: Id<"buildProposals">,
  capitalEventKey: string,
) {
  const event = await ctx.db
    .query("proposalCapitalEvents")
    .withIndex("by_proposal_key", (q) =>
      q.eq("proposalId", proposalId).eq("capitalEventKey", capitalEventKey),
    )
    .unique();
  if (!event) {
    throw new Error("Production capital event not found.");
  }
  return event;
}

export async function getProductionEvidenceAssetOrThrow(
  ctx: QueryCtx | MutationCtx,
  proposalId: Id<"buildProposals">,
  evidenceKey: string,
) {
  const asset = await ctx.db
    .query("proposalEvidenceAssets")
    .withIndex("by_proposal_key", (q) =>
      q.eq("proposalId", proposalId).eq("evidenceKey", evidenceKey),
    )
    .unique();
  if (!asset) {
    throw new Error("Production evidence asset not found.");
  }
  return asset;
}

export async function deleteProposalPlanChildren(
  ctx: MutationCtx,
  proposalId: Id<"buildProposals">,
  options: {
    preserveCanonicalLineage?: boolean;
    retainedPlanKeys?: Array<{
      milestoneKey: string;
      submilestoneKeys: string[];
    }>;
  } = {},
) {
  const preservedSubmilestoneIds = new Set<Id<"proposalSubmilestones">>();
  const preservedMilestoneIds = new Set<Id<"proposalMilestones">>();
  if (options.preserveCanonicalLineage) {
    // The canonical tables have a composite tenant/proposal index. Keep the
    // query tenant-scoped while preserving Proposal Sub-milestone identities.
    const proposal = await ctx.db.get(proposalId);
    const [proposalScopeContracts, proposalGuidance] = proposal
      ? await Promise.all([
          ctx.db
            .query("submilestoneScopeContracts")
            .withIndex("by_organizationId_and_proposalId", (query) =>
              query
                .eq("organizationId", proposal.organizationId)
                .eq("proposalId", proposalId),
            )
            .collect(),
          ctx.db
            .query("submilestoneFieldGuidance")
            .withIndex("by_organizationId_and_proposalId", (query) =>
              query
                .eq("organizationId", proposal.organizationId)
                .eq("proposalId", proposalId),
            )
            .collect(),
        ])
      : [[], []];
    const milestones = (await collectByIndex(
      ctx,
      "proposalMilestones",
      "by_proposal",
      proposalId,
    )) as Doc<"proposalMilestones">[];
    const submilestones = (await collectByIndex(
      ctx,
      "proposalSubmilestones",
      "by_proposal",
      proposalId,
    )) as Doc<"proposalSubmilestones">[];
    const planKeys = options.retainedPlanKeys ?? [];
    const keyMatches = (left: string, right: string) =>
      left === right || left.trim() === right.trim();
    const retainedMilestone = (milestone: Doc<"proposalMilestones">) =>
      planKeys.some((plan) => keyMatches(plan.milestoneKey, milestone.key));
    const retainedSubmilestone = (
      milestone: Doc<"proposalMilestones">,
      submilestone: Doc<"proposalSubmilestones">,
    ) =>
      planKeys.some(
        (plan) =>
          keyMatches(plan.milestoneKey, milestone.key) &&
          plan.submilestoneKeys.some((key) =>
            keyMatches(key, submilestone.key),
          ),
      );
    const submilestoneIsRetained = (
      submilestone: Doc<"proposalSubmilestones">,
    ) => {
      const milestone = milestones.find(
        (candidate) => candidate._id === submilestone.proposalMilestoneId,
      );
      return milestone ? retainedSubmilestone(milestone, submilestone) : false;
    };
    const scopeContractsBySubmilestoneId = new Map(
      proposalScopeContracts.map((contract) => [
        contract.proposalSubmilestoneId,
        contract,
      ]),
    );
    const guidanceBySubmilestoneId = new Map(
      proposalGuidance.map((guidance) => [
        guidance.proposalSubmilestoneId,
        guidance,
      ]),
    );
    const staleSubmilestoneIds = new Set<Id<"proposalSubmilestones">>();
    const staleContracts = proposalScopeContracts.filter(
      (contract) =>
        !submilestones.some(
          (submilestone) =>
            submilestone._id === contract.proposalSubmilestoneId &&
            submilestoneIsRetained(submilestone),
        ),
    );
    const staleGuidance = proposalGuidance.filter(
      (guidance) =>
        !submilestones.some(
          (submilestone) =>
            submilestone._id === guidance.proposalSubmilestoneId &&
            submilestoneIsRetained(submilestone),
        ),
    );
    for (const contract of staleContracts) {
      staleSubmilestoneIds.add(contract.proposalSubmilestoneId);
    }
    for (const guidance of staleGuidance) {
      staleSubmilestoneIds.add(guidance.proposalSubmilestoneId);
    }
    // Validate every stale lineage before deleting any canonical row. The
    // shared helper owns the published/effective guard and deletion rules.
    for (const submilestoneId of staleSubmilestoneIds) {
      const submilestone =
        submilestones.find((row) => row._id === submilestoneId) ?? null;
      const contract = scopeContractsBySubmilestoneId.get(submilestoneId);
      const guidance = guidanceBySubmilestoneId.get(submilestoneId);
      await deleteProposalSubmilestoneCanonicalLineage(
        ctx,
        submilestone,
        { contract, guidance },
        { validateOnly: true },
      );
    }
    // Remove only abandoned, still-draft canonical rows. Published Scope is
    // immutable and causes the entire package replacement to roll back above.
    for (const submilestoneId of staleSubmilestoneIds) {
      const submilestone =
        submilestones.find((row) => row._id === submilestoneId) ?? null;
      const contract = scopeContractsBySubmilestoneId.get(submilestoneId);
      const guidance = guidanceBySubmilestoneId.get(submilestoneId);
      await deleteProposalSubmilestoneCanonicalLineage(
        ctx,
        submilestone,
        { contract, guidance },
      );
    }
    for (const submilestone of submilestones) {
      const milestone = milestones.find(
        (candidate) => candidate._id === submilestone.proposalMilestoneId,
      );
      if (
        !staleSubmilestoneIds.has(submilestone._id) &&
        milestone &&
        retainedSubmilestone(milestone, submilestone)
      ) {
        preservedSubmilestoneIds.add(submilestone._id);
      }
    }
    for (const milestone of milestones) {
      if (retainedMilestone(milestone)) {
        preservedMilestoneIds.add(milestone._id);
      }
    }
  }
  for (const table of [
    "proposalTimelineModificationRequests",
    "proposalEvidenceAssets",
    "proposalCapitalEvents",
    "proposalCostItems",
    "proposalMilestoneContractorAssignments",
    "proposalDrawScheduleRows",
    "proposalSubmilestones",
    "proposalMilestones",
  ] as const) {
    const rows = await collectByIndex(ctx, table, "by_proposal", proposalId);
    for (const row of rows) {
      if (
        table === "proposalSubmilestones" &&
        preservedSubmilestoneIds.has(row._id)
      ) {
        continue;
      }
      if (
        table === "proposalMilestones" &&
        preservedMilestoneIds.has(row._id)
      ) {
        continue;
      }
      await ctx.db.delete(row._id);
    }
  }
}

export async function upsertKanbanCard(
  ctx: MutationCtx,
  proposalId: Id<"buildProposals">,
  now: number,
) {
  const proposal = await ctx.db.get(proposalId);
  if (!proposal) {
    throw new Error("Missing proposal.");
  }
  const builder = proposal.builderProfileId
    ? await ctx.db.get(proposal.builderProfileId)
    : null;
  const existing = await ctx.db
    .query("proposalKanbanCards")
    .withIndex("by_proposal", (q) => q.eq("proposalId", proposalId))
    .unique();
  const card = {
    brokerageId: proposal.brokerageId,
    builderName: builder?.displayName ?? "Unassigned builder",
    column: proposal.status,
    href: `/backoffice/proposals/${proposalId}`,
    organizationId: proposal.organizationId,
    proposalId,
    sortAt: now,
    subtitle: proposal.location,
    title: proposal.buildName,
    totalBudgetCents: proposal.totalBudgetCents,
    updatedAt: now,
  };
  if (existing) {
    await ctx.db.patch(existing._id, card);
  } else {
    await ctx.db.insert("proposalKanbanCards", card);
  }
}

export async function writeProposalEvent(
  ctx: MutationCtx,
  input: {
    auth: { brokerage: Doc<"brokerages">; roles: RoleSlug[]; subject: string };
    command: string;
    eventType: string;
    newState?: string;
    priorState?: string;
    proposalId: Id<"buildProposals">;
    reason?: string;
    warnings?: string[];
  },
) {
  const now = Date.now();
  const proposal = await ctx.db.get(input.proposalId);
  if (!proposal) {
    throw new Error("Missing proposal.");
  }
  const event = {
    actorRoles: input.auth.roles,
    actorWorkosUserId: input.auth.subject,
    brokerageId: input.auth.brokerage._id,
    command: input.command,
    createdAt: now,
    eventType: input.eventType,
    newState: input.newState,
    organizationId: proposal.organizationId,
    priorState: input.priorState,
    proposalId: input.proposalId,
    reason: input.reason,
    warnings: input.warnings ?? [],
  };
  await ctx.db.insert("proposalEvents", event);
  await ctx.db.insert("auditEvents", {
    actorRoles: event.actorRoles,
    actorWorkosUserId: event.actorWorkosUserId,
    brokerageId: event.brokerageId,
    command: event.command,
    createdAt: event.createdAt,
    eventType: event.eventType,
    entityId: input.proposalId,
    entityType: "buildProposal",
    newState: event.newState,
    organizationId: event.organizationId,
    priorState: event.priorState,
    reason: event.reason,
    warnings: event.warnings,
  });
  await ctx.db.insert("eventOutbox", {
    brokerageId: input.auth.brokerage._id,
    createdAt: now,
    eventType: input.eventType,
    organizationId: proposal.organizationId,
    payloadPreview: JSON.stringify({
      newState: input.newState,
      proposalId: input.proposalId,
    }),
    relatedEntityId: input.proposalId,
    relatedEntityType: "buildProposal",
    status: "pending",
  });
}

export async function writeActiveBuildEvent(
  ctx: MutationCtx,
  input: {
    auth: {
      brokerage: Doc<"brokerages">;
      proposal: Doc<"buildProposals">;
      roles: RoleSlug[];
      subject: string;
    };
    build: Doc<"activeBuilds">;
    command: string;
    entityId?: string;
    entityType?: string;
    eventType: string;
    resourceType?: ActiveBuildAuditResourceType;
    newState?: string;
    priorState?: string;
    reason?: string;
    warnings?: string[];
  },
) {
  const now = Date.now();
  const entityType = input.entityType ?? "activeBuild";
  const resourceType =
    input.resourceType ??
    deriveActiveBuildAuditResourceType({
      command: input.command,
      entityType,
      eventType: input.eventType,
    });
  await ctx.db.insert("auditEvents", {
    actorRoles: input.auth.roles,
    actorWorkosUserId: input.auth.subject,
    brokerageId: input.auth.brokerage._id,
    buildId: input.build._id,
    command: input.command,
    createdAt: now,
    entityId: input.entityId ?? String(input.build._id),
    entityType,
    eventType: input.eventType,
    newState: input.newState,
    organizationId: input.build.organizationId,
    priorState: input.priorState,
    resourceType,
    reason: input.reason,
    warnings: input.warnings ?? [],
  });
  await ctx.db.insert("eventOutbox", {
    brokerageId: input.auth.brokerage._id,
    createdAt: now,
    eventType: input.eventType,
    organizationId: input.build.organizationId,
    payloadPreview: JSON.stringify({
      buildId: input.build._id,
      newState: input.newState,
      priorState: input.priorState,
    }),
    relatedEntityId: input.entityId ?? input.build._id,
    relatedEntityType: entityType,
    status: "pending",
  });
}

export async function writeProductionSettingsEvent(
  ctx: MutationCtx,
  input: {
    auth: { brokerage: Doc<"brokerages">; roles: RoleSlug[]; subject: string };
    command: string;
    entityId: string;
    eventType: string;
    newState?: string;
    organizationId: string;
    priorState?: string;
    reason?: string;
    warnings?: string[];
  },
) {
  const now = Date.now();
  await ctx.db.insert("auditEvents", {
    actorRoles: input.auth.roles,
    actorWorkosUserId: input.auth.subject,
    brokerageId: input.auth.brokerage._id,
    command: input.command,
    createdAt: now,
    entityId: input.entityId,
    entityType: "productionProposalSettings",
    eventType: input.eventType,
    newState: input.newState,
    organizationId: input.organizationId,
    priorState: input.priorState,
    reason: input.reason,
    warnings: input.warnings ?? [],
  });
  await ctx.db.insert("eventOutbox", {
    brokerageId: input.auth.brokerage._id,
    createdAt: now,
    eventType: input.eventType,
    organizationId: input.organizationId,
    payloadPreview: JSON.stringify({
      entityId: input.entityId,
      newState: input.newState,
      priorState: input.priorState,
    }),
    relatedEntityId: input.entityId,
    relatedEntityType: "productionProposalSettings",
    status: "pending",
  });
}

export async function copyProposalOperationalRowsToActiveBuild(
  ctx: MutationCtx,
  input: {
    auth: { brokerage: Doc<"brokerages">; roles: RoleSlug[]; subject: string };
    buildId: Id<"activeBuilds">;
    now: number;
    organizationId: string;
    proposalId: Id<"buildProposals">;
  },
) {
  const [documents, evidenceAssets, costItems, buildMilestones] =
    (await Promise.all([
      collectByIndex(ctx, "proposalDocuments", "by_proposal", input.proposalId),
      collectByIndex(
        ctx,
        "proposalEvidenceAssets",
        "by_proposal",
        input.proposalId,
      ),
      collectByIndex(ctx, "proposalCostItems", "by_proposal", input.proposalId),
      collectByIndex(ctx, "buildMilestones", "by_build", input.buildId),
    ])) as [
      Doc<"proposalDocuments">[],
      Doc<"proposalEvidenceAssets">[],
      Doc<"proposalCostItems">[],
      Doc<"buildMilestones">[],
    ];
  const buildMilestoneByProposalId = new Map(
    buildMilestones.map((milestone) => [
      String(milestone.proposalMilestoneId),
      milestone,
    ]),
  );
  await copyProposalDocumentsToActiveBuild(ctx, {
    brokerageId: input.auth.brokerage._id,
    buildId: input.buildId,
    documents,
    now: input.now,
    organizationId: input.organizationId,
    proposalId: input.proposalId,
  });
  for (const asset of evidenceAssets) {
    await ctx.db.insert("buildEvidenceAssets", {
      brokerageId: input.auth.brokerage._id,
      buildId: input.buildId,
      createdAt: input.now,
      evidenceKey: asset.evidenceKey,
      fileName: asset.fileName,
      label: asset.label,
      locationVerified: asset.locationVerified,
      milestoneKey: asset.milestoneKey,
      mimeType: asset.mimeType,
      organizationId: input.organizationId,
      proposalId: input.proposalId,
      sizeBytes: asset.sizeBytes,
      source: asset.source,
      storageId: asset.storageId,
      tag: asset.tag,
      updatedAt: input.now,
    });
  }
  for (const item of costItems) {
    const buildMilestone = buildMilestoneByProposalId.get(
      String(item.proposalMilestoneId),
    );
    if (!buildMilestone) {
      continue;
    }
    await ctx.db.insert("buildCostItems", {
      brokerageId: input.auth.brokerage._id,
      budgetSubmilestoneKey: item.budgetSubmilestoneKey,
      budgetTreatment: normalizeCostItemBudgetTreatment(item.budgetTreatment),
      buildId: input.buildId,
      buildMilestoneId: buildMilestone._id,
      costCents: item.costCents,
      createdAt: input.now,
      createdByWorkosUserId: item.createdByWorkosUserId,
      deliveryEndDay: item.deliveryEndDay,
      deliveryInstructions: item.deliveryInstructions,
      deliveryLocation: item.deliveryLocation,
      deliveryStartDay: item.deliveryStartDay,
      description: item.description,
      itemKey: item.itemKey,
      itemType: item.itemType,
      milestoneKey: item.milestoneKey,
      organizationId: input.organizationId,
      proposalCostItemId: item._id,
      proposalId: input.proposalId,
      quantity: item.quantity,
      relevantSubmilestoneKeys: item.relevantSubmilestoneKeys,
      specificationTiptapJson: item.specificationTiptapJson,
      supplier: item.supplier,
      title: item.title,
      unit: item.unit,
      updatedAt: input.now,
      updatedByWorkosUserId: item.updatedByWorkosUserId,
    });
  }
}

export async function copyProposalCapitalEventsToActiveBuild(
  ctx: MutationCtx,
  input: {
    brokerageId: Id<"brokerages">;
    buildId: Id<"activeBuilds">;
    buildStartDate: string;
    now: number;
    organizationId: string;
    proposal: Doc<"buildProposals">;
  },
) {
  const proposalEvents = (await collectByIndex(
    ctx,
    "proposalCapitalEvents",
    "by_proposal",
    input.proposal._id,
  )) as Doc<"proposalCapitalEvents">[];
  for (const event of proposalEvents.sort(
    (a, b) => a.order - b.order || a.x - b.x,
  )) {
    const eventDate = addDaysIso(input.buildStartDate, event.x);
    let loanFacilityId: Id<"loanFacilities"> | undefined;
    if (event.eventKind === "homeEquityTakeout") {
      const interestAnnualBps = normalizeCapitalEventInterestRate(
        event.eventKind,
        event.interestAnnualBps,
      );
      if (interestAnnualBps === undefined) {
        throw new Error(
          "Home Equity Takeout is missing an approved interest rate.",
        );
      }
      loanFacilityId = await ctx.db.insert("loanFacilities", {
        brokerageId: input.brokerageId,
        buildId: input.buildId,
        createdAt: input.now,
        facilityKind: "homeEquityTakeout",
        interestAccrualStartDate: eventDate,
        interestAnnualBps,
        interestStartsOn: "funds_released",
        organizationId: input.organizationId,
        paybackDate: addDaysIso(
          input.buildStartDate,
          input.proposal.timelineRangeMax ?? 365,
        ),
        principalCents: event.amountCents,
        proposalId: input.proposal._id,
        sourceCapitalEventKey: event.capitalEventKey,
        status: "active",
        updatedAt: input.now,
      });
    }
    await ctx.db.insert("capitalEvents", {
      amountCents: event.amountCents,
      brokerageId: input.brokerageId,
      buildId: input.buildId,
      capitalEventKey: event.capitalEventKey,
      createdAt: input.now,
      eventDate,
      eventType:
        event.eventKind === "cashInfusion"
          ? "borrower_copay"
          : event.eventKind === "homeEquityTakeout"
            ? "home_equity_takeout"
            : "cost",
      label: event.label,
      ...(loanFacilityId === undefined ? {} : { loanFacilityId }),
      organizationId: input.organizationId,
    });
  }
}

export function activeBuildDrawStatusFromProposal(
  status: Doc<"proposalDrawScheduleRows">["requestStatus"],
): Doc<"plannedDrawScheduleRows">["status"] {
  if (status === "approved") {
    return "approved_for_release";
  }
  if (status === "rejected" || status === "requested") {
    return status;
  }
  return "planned";
}

export async function getActiveBuildDrawOrThrow(
  ctx: QueryCtx | MutationCtx,
  buildId: Id<"activeBuilds">,
  drawKey: string,
) {
  const draw = await ctx.db
    .query("plannedDrawScheduleRows")
    .withIndex("by_build_order", (q) => q.eq("buildId", buildId))
    .collect()
    .then((rows) => rows.find((row) => row.drawKey === drawKey));
  if (!draw) {
    throw new Error("Production active-build draw not found.");
  }
  return draw;
}

export async function getActiveBuildDrawRequestOrThrow(
  ctx: QueryCtx | MutationCtx,
  buildId: Id<"activeBuilds">,
  requestKey: string,
) {
  const request = await ctx.db
    .query("activeBuildDrawRequests")
    .withIndex("by_build_request_key", (q) =>
      q.eq("buildId", buildId).eq("requestKey", requestKey),
    )
    .unique();
  if (!request) {
    throw new Error("Production active-build draw request not found.");
  }
  return request;
}

export async function calculateActiveBuildAvailableNowCents(
  ctx: QueryCtx | MutationCtx,
  buildId: Id<"activeBuilds">,
) {
  return (await activeBuildDrawFundingSnapshot(ctx, buildId)).availableCents;
}

export function activeBuildDrawWorkOrderKey(
  request: Pick<
    Doc<"activeBuildDrawRequests">,
    "_id" | "displayId" | "workOrderKey"
  >,
) {
  if (request.workOrderKey) {
    return request.workOrderKey;
  }
  const displaySequence = request.displayId.match(/\d+/)?.[0];
  return displaySequence
    ? `DRWO-${displaySequence.padStart(4, "0")}`
    : `DRWO-LEGACY-${String(request._id)}`;
}

export function activeBuildDrawRequestReservesAvailability(
  status: Doc<"activeBuildDrawRequests">["status"],
) {
  return (
    status === "requested" ||
    status === "approved" ||
    status === "in_review" ||
    status === "ready_for_admin" ||
    status === "approved_for_release" ||
    status === "released"
  );
}
