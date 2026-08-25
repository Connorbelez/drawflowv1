import { upsertSubmilestoneScopeV1Draft } from "../submilestone_scope_contracts";
import type { Doc, Id, MutationCtx, QueryCtx } from "../types";
import { proposalTimeline } from "./context";
import {
  type ProposalPlanningSnapshot,
  proposalTimelineScope,
} from "./contracts";
import { getActiveSessionForProposal } from "./authorization";
import { upsertProposalKanbanCard } from "./audit";

export async function pushProposalPlanningSnapshot(
  ctx: MutationCtx,
  proposalId: Id<"buildProposals">
) {
  const session = await getActiveSessionForProposal(ctx, proposalId);
  if (!session) {
    return;
  }
  const snapshot = await captureProposalPlanningSnapshot(ctx, proposalId);
  const scope = proposalTimelineScope(proposalId);
  const current = await proposalTimeline.currentDocument(ctx, scope);
  if (JSON.stringify(current) === JSON.stringify(snapshot)) {
    return;
  }
  await proposalTimeline.push(ctx, scope, snapshot);
}

export async function getProposalTimelineStatus(
  ctx: QueryCtx,
  proposalId: Id<"buildProposals">
) {
  return await proposalTimeline.status(ctx, proposalTimelineScope(proposalId));
}

export async function undoProposalPlanningSnapshot(
  ctx: MutationCtx,
  proposalId: Id<"buildProposals">
) {
  await assertDraftProposalForTimeline(ctx, proposalId);
  return (await proposalTimeline.undo(
    ctx,
    proposalTimelineScope(proposalId)
  )) as ProposalPlanningSnapshot | null;
}

export async function redoProposalPlanningSnapshot(
  ctx: MutationCtx,
  proposalId: Id<"buildProposals">
) {
  await assertDraftProposalForTimeline(ctx, proposalId);
  return (await proposalTimeline.redo(
    ctx,
    proposalTimelineScope(proposalId)
  )) as ProposalPlanningSnapshot | null;
}

async function assertDraftProposalForTimeline(
  ctx: MutationCtx,
  proposalId: Id<"buildProposals">
) {
  const proposal = await ctx.db.get(proposalId);
  if (
    !proposal ||
    proposal.status !== "draft" ||
    proposal.submittedAt !== undefined
  ) {
    throw new Error("Undo/redo is only available for proposal planning edits.");
  }
}

function assertValidSnapshotScopeContent(
  value: unknown
): asserts value is string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Proposal draft Scope content is unavailable.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Proposal draft Scope content is unavailable.");
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    (parsed as { type?: unknown }).type !== "doc"
  ) {
    throw new Error("Proposal draft Scope content is unavailable.");
  }
}

type SnapshotSubmilestone =
  ProposalPlanningSnapshot["milestones"][number]["submilestones"][number];

type SnapshotFieldGuidance = NonNullable<SnapshotSubmilestone["fieldGuidance"]>;

interface PreservedCanonicalContent {
  fieldGuidance?: SnapshotFieldGuidance;
  scopeOfWorkTiptapJson?: string;
}

function hasSnapshotField<K extends keyof SnapshotSubmilestone>(
  submilestone: SnapshotSubmilestone,
  field: K
) {
  return Object.getOwnPropertyDescriptor(submilestone, field) !== undefined;
}

function stableSubmilestoneKey(milestoneKey: string, submilestoneKey: string) {
  return JSON.stringify([milestoneKey, submilestoneKey]);
}

function assertUniqueSnapshotStableKeys(snapshot: ProposalPlanningSnapshot) {
  const milestoneKeys = new Set<string>();
  const submilestoneKeys = new Set<string>();
  for (const milestone of snapshot.milestones) {
    if (milestoneKeys.has(milestone.key)) {
      throw new Error("Proposal planning milestone keys are ambiguous.");
    }
    milestoneKeys.add(milestone.key);
    for (const submilestone of milestone.submilestones) {
      const stableKey = stableSubmilestoneKey(milestone.key, submilestone.key);
      if (submilestoneKeys.has(stableKey)) {
        throw new Error(
          "Proposal planning Sub-milestone stable keys are ambiguous."
        );
      }
      submilestoneKeys.add(stableKey);
    }
  }
}

interface LegacyCanonicalRequirement {
  needsFieldGuidance: boolean;
  needsScope: boolean;
}

function collectLegacyCanonicalRequirements(
  snapshot: ProposalPlanningSnapshot
) {
  const requirements = new Map<string, LegacyCanonicalRequirement>();
  for (const milestone of snapshot.milestones) {
    for (const submilestone of milestone.submilestones) {
      const stableKey = stableSubmilestoneKey(milestone.key, submilestone.key);
      const needsScope = !hasSnapshotField(
        submilestone,
        "scopeOfWorkTiptapJson"
      );
      const needsFieldGuidance = !hasSnapshotField(
        submilestone,
        "fieldGuidance"
      );
      if (needsScope || needsFieldGuidance) {
        requirements.set(stableKey, { needsFieldGuidance, needsScope });
      }
    }
  }
  return requirements;
}

async function loadCurrentProposalSubmilestonesByStableKey(
  ctx: MutationCtx,
  proposal: Doc<"buildProposals">
) {
  const [milestones, submilestones] = await Promise.all([
    ctx.db
      .query("proposalMilestones")
      .withIndex("by_proposal_order", (query) =>
        query.eq("proposalId", proposal._id)
      )
      .take(501),
    ctx.db
      .query("proposalSubmilestones")
      .withIndex("by_proposal", (query) => query.eq("proposalId", proposal._id))
      .take(501),
  ]);
  if (milestones.length > 500 || submilestones.length > 500) {
    throw new Error("Proposal planning restore is too large.");
  }

  const milestoneById = new Map<
    Id<"proposalMilestones">,
    Doc<"proposalMilestones">
  >();
  const milestoneKeyOwners = new Set<string>();
  for (const milestone of milestones) {
    if (
      milestone.brokerageId !== proposal.brokerageId ||
      milestone.organizationId !== proposal.organizationId ||
      milestone.proposalId !== proposal._id ||
      milestoneKeyOwners.has(milestone.key)
    ) {
      throw new Error("Proposal planning milestone lineage is ambiguous.");
    }
    milestoneKeyOwners.add(milestone.key);
    milestoneById.set(milestone._id, milestone);
  }

  const byStableKey = new Map<string, Doc<"proposalSubmilestones">>();
  for (const submilestone of submilestones) {
    const milestone = milestoneById.get(submilestone.proposalMilestoneId);
    const stableKey = stableSubmilestoneKey(
      submilestone.milestoneKey,
      submilestone.key
    );
    if (
      !milestone ||
      milestone.key !== submilestone.milestoneKey ||
      submilestone.brokerageId !== proposal.brokerageId ||
      submilestone.organizationId !== proposal.organizationId ||
      submilestone.proposalId !== proposal._id ||
      byStableKey.has(stableKey)
    ) {
      throw new Error(
        "Proposal planning Sub-milestone stable keys are ambiguous."
      );
    }
    byStableKey.set(stableKey, submilestone);
  }
  return byStableKey;
}

async function resolveCurrentScopeForLegacyRestore(
  ctx: MutationCtx,
  proposal: Doc<"buildProposals">,
  submilestone: Doc<"proposalSubmilestones">
) {
  const contract = await ctx.db
    .query("submilestoneScopeContracts")
    .withIndex("by_proposalSubmilestoneId", (query) =>
      query.eq("proposalSubmilestoneId", submilestone._id)
    )
    .unique();
  if (
    !contract ||
    contract.brokerageId !== proposal.brokerageId ||
    contract.organizationId !== proposal.organizationId ||
    contract.proposalId !== proposal._id ||
    contract.proposalSubmilestoneId !== submilestone._id ||
    contract.effectiveRevisionId !== undefined ||
    contract.buildId !== undefined ||
    contract.buildSubmilestoneId !== undefined
  ) {
    throw new Error(
      "Legacy planning snapshot Scope lineage cannot be resolved."
    );
  }
  const revision = contract.activeDraftRevisionId
    ? await ctx.db.get(contract.activeDraftRevisionId)
    : await ctx.db
        .query("submilestoneScopeRevisions")
        .withIndex("by_contractId_and_version", (query) =>
          query.eq("contractId", contract._id).eq("version", 1)
        )
        .unique();
  if (
    !revision ||
    revision.brokerageId !== contract.brokerageId ||
    revision.organizationId !== contract.organizationId ||
    revision.proposalId !== contract.proposalId ||
    revision.proposalSubmilestoneId !== contract.proposalSubmilestoneId ||
    revision.contractId !== contract._id ||
    revision.version !== 1 ||
    revision.status !== "draft"
  ) {
    throw new Error(
      "Legacy planning snapshot Scope lineage cannot be resolved."
    );
  }
  assertValidSnapshotScopeContent(revision.scopeOfWorkTiptapJson);
  return revision.scopeOfWorkTiptapJson;
}

async function resolveCurrentFieldGuidanceForLegacyRestore(
  ctx: MutationCtx,
  proposal: Doc<"buildProposals">,
  submilestone: Doc<"proposalSubmilestones">
): Promise<SnapshotFieldGuidance> {
  const guidance = await ctx.db
    .query("submilestoneFieldGuidance")
    .withIndex("by_proposalSubmilestoneId", (query) =>
      query.eq("proposalSubmilestoneId", submilestone._id)
    )
    .unique();
  if (
    !guidance ||
    guidance.brokerageId !== proposal.brokerageId ||
    guidance.organizationId !== proposal.organizationId ||
    guidance.proposalId !== proposal._id ||
    guidance.proposalSubmilestoneId !== submilestone._id ||
    guidance.buildId !== undefined ||
    guidance.buildSubmilestoneId !== undefined
  ) {
    throw new Error(
      "Legacy planning snapshot Field Guidance lineage cannot be resolved."
    );
  }
  return {
    cameraAnglesTiptapJson: guidance.cameraAnglesTiptapJson,
    whatToVerifyTiptapJson: guidance.whatToVerifyTiptapJson,
  };
}

async function resolveLegacyCanonicalContentForRestore(
  ctx: MutationCtx,
  proposal: Doc<"buildProposals">,
  snapshot: ProposalPlanningSnapshot
) {
  assertUniqueSnapshotStableKeys(snapshot);
  const requirements = collectLegacyCanonicalRequirements(snapshot);
  if (requirements.size === 0) {
    return new Map<string, PreservedCanonicalContent>();
  }
  const currentByStableKey = await loadCurrentProposalSubmilestonesByStableKey(
    ctx,
    proposal
  );
  const preserved = new Map<string, PreservedCanonicalContent>();
  for (const [stableKey, required] of requirements) {
    const currentSubmilestone = currentByStableKey.get(stableKey);
    if (!currentSubmilestone) {
      throw new Error(
        "Legacy planning snapshot canonical lineage cannot be resolved."
      );
    }
    const content: PreservedCanonicalContent = {};
    if (required.needsScope) {
      content.scopeOfWorkTiptapJson = await resolveCurrentScopeForLegacyRestore(
        ctx,
        proposal,
        currentSubmilestone
      );
    }
    if (required.needsFieldGuidance) {
      content.fieldGuidance = await resolveCurrentFieldGuidanceForLegacyRestore(
        ctx,
        proposal,
        currentSubmilestone
      );
    }
    preserved.set(stableKey, content);
  }
  return preserved;
}

function resolveCanonicalContentForRestore(
  milestoneKey: string,
  submilestone: SnapshotSubmilestone,
  preservedLegacyCanonicalContent: Map<string, PreservedCanonicalContent>
) {
  const stableKey = stableSubmilestoneKey(milestoneKey, submilestone.key);
  const preserved = preservedLegacyCanonicalContent.get(stableKey);
  const scopeOfWorkTiptapJson = hasSnapshotField(
    submilestone,
    "scopeOfWorkTiptapJson"
  )
    ? submilestone.scopeOfWorkTiptapJson
    : preserved?.scopeOfWorkTiptapJson;
  if (typeof scopeOfWorkTiptapJson !== "string") {
    throw new Error(
      "Legacy planning snapshot Scope content cannot be resolved."
    );
  }
  assertValidSnapshotScopeContent(scopeOfWorkTiptapJson);

  const fieldGuidance = hasSnapshotField(submilestone, "fieldGuidance")
    ? submilestone.fieldGuidance
    : preserved?.fieldGuidance;
  if (
    !fieldGuidance ||
    typeof fieldGuidance.cameraAnglesTiptapJson !== "string" ||
    typeof fieldGuidance.whatToVerifyTiptapJson !== "string"
  ) {
    throw new Error(
      "Legacy planning snapshot Field Guidance cannot be resolved."
    );
  }
  return { fieldGuidance, scopeOfWorkTiptapJson };
}

export async function captureProposalPlanningSnapshot(
  ctx: QueryCtx | MutationCtx,
  proposalId: Id<"buildProposals">
): Promise<ProposalPlanningSnapshot> {
  const proposal = await ctx.db.get(proposalId);
  if (!proposal) {
    throw new Error("Missing proposal.");
  }
  const [
    milestones,
    submilestones,
    draws,
    capitalEvents,
    costItems,
    scopeContracts,
    fieldGuidanceRows,
  ] = await Promise.all([
    ctx.db
      .query("proposalMilestones")
      .withIndex("by_proposal_order", (q) => q.eq("proposalId", proposalId))
      .collect(),
    ctx.db
      .query("proposalSubmilestones")
      .withIndex("by_proposal", (q) => q.eq("proposalId", proposalId))
      .collect(),
    ctx.db
      .query("proposalDrawScheduleRows")
      .withIndex("by_proposal_order", (q) => q.eq("proposalId", proposalId))
      .collect(),
    ctx.db
      .query("proposalCapitalEvents")
      .withIndex("by_proposal_order", (q) => q.eq("proposalId", proposalId))
      .collect(),
    ctx.db
      .query("proposalCostItems")
      .withIndex("by_proposal", (q) => q.eq("proposalId", proposalId))
      .collect(),
    ctx.db
      .query("submilestoneScopeContracts")
      .withIndex("by_organizationId_and_proposalId", (q) =>
        q
          .eq("organizationId", proposal.organizationId)
          .eq("proposalId", proposalId)
      )
      .take(501),
    ctx.db
      .query("submilestoneFieldGuidance")
      .withIndex("by_organizationId_and_proposalId", (q) =>
        q
          .eq("organizationId", proposal.organizationId)
          .eq("proposalId", proposalId)
      )
      .take(501),
  ]);
  if (scopeContracts.length > 500 || fieldGuidanceRows.length > 500) {
    throw new Error("Proposal canonical Sub-milestone lineage is too large.");
  }
  const submilestoneById = new Map(
    submilestones.map((submilestone) => [submilestone._id, submilestone])
  );
  const seenScopeOwners = new Set<Id<"proposalSubmilestones">>();
  for (const contract of scopeContracts) {
    const submilestone = submilestoneById.get(contract.proposalSubmilestoneId);
    if (
      !submilestone ||
      seenScopeOwners.has(contract.proposalSubmilestoneId) ||
      contract.brokerageId !== proposal.brokerageId ||
      contract.organizationId !== proposal.organizationId ||
      contract.proposalId !== proposalId ||
      submilestone.brokerageId !== proposal.brokerageId ||
      submilestone.organizationId !== proposal.organizationId ||
      submilestone.proposalId !== proposalId
    ) {
      throw new Error("Proposal draft Scope lineage is unavailable.");
    }
    seenScopeOwners.add(contract.proposalSubmilestoneId);
  }
  const scopeBySubmilestoneId = new Map<Id<"proposalSubmilestones">, string>(
    await Promise.all(
      scopeContracts.map(async (contract) => {
        // The v1 draft pointer is normally authoritative, but a legacy or
        // interrupted write can leave it unset after the detached draft row
        // was created. Resolve that exact contract/version pair instead of
        // silently dropping Scope from the collaboration snapshot.
        const revision = contract.activeDraftRevisionId
          ? await ctx.db.get(contract.activeDraftRevisionId)
          : await ctx.db
              .query("submilestoneScopeRevisions")
              .withIndex("by_contractId_and_version", (query) =>
                query.eq("contractId", contract._id).eq("version", 1)
              )
              .unique();
        if (
          !revision ||
          revision.brokerageId !== contract.brokerageId ||
          revision.organizationId !== contract.organizationId ||
          revision.proposalId !== contract.proposalId ||
          revision.proposalSubmilestoneId !== contract.proposalSubmilestoneId ||
          revision.contractId !== contract._id ||
          revision.version !== 1 ||
          revision.status !== "draft"
        ) {
          throw new Error("Proposal draft Scope lineage is unavailable.");
        }
        assertValidSnapshotScopeContent(revision.scopeOfWorkTiptapJson);
        return [
          contract.proposalSubmilestoneId,
          revision.scopeOfWorkTiptapJson,
        ] as const;
      })
    )
  );
  const seenGuidanceOwners = new Set<Id<"proposalSubmilestones">>();
  for (const row of fieldGuidanceRows) {
    const submilestone = submilestoneById.get(row.proposalSubmilestoneId);
    if (
      !submilestone ||
      seenGuidanceOwners.has(row.proposalSubmilestoneId) ||
      row.brokerageId !== proposal.brokerageId ||
      row.organizationId !== proposal.organizationId ||
      row.proposalId !== proposalId ||
      submilestone.brokerageId !== proposal.brokerageId ||
      submilestone.organizationId !== proposal.organizationId ||
      submilestone.proposalId !== proposalId
    ) {
      throw new Error("Proposal draft Field Guidance lineage is unavailable.");
    }
    seenGuidanceOwners.add(row.proposalSubmilestoneId);
  }
  const guidanceBySubmilestoneId = new Map(
    fieldGuidanceRows.map((row) => [
      row.proposalSubmilestoneId,
      {
        cameraAnglesTiptapJson: row.cameraAnglesTiptapJson,
        whatToVerifyTiptapJson: row.whatToVerifyTiptapJson,
      },
    ])
  );
  const submilestonesByMilestoneKey = new Map<
    string,
    Doc<"proposalSubmilestones">[]
  >();
  for (const submilestone of submilestones) {
    const rows =
      submilestonesByMilestoneKey.get(submilestone.milestoneKey) ?? [];
    rows.push(submilestone);
    submilestonesByMilestoneKey.set(submilestone.milestoneKey, rows);
  }
  return {
    capitalEvents: capitalEvents.map((event) => ({
      amountCents: event.amountCents,
      capitalEventKey: event.capitalEventKey,
      eventKind: event.eventKind,
      interestAnnualBps: event.interestAnnualBps,
      label: event.label,
      order: event.order,
      x: event.x,
    })),
    costItems: costItems.map((item) => ({
      budgetSubmilestoneKey: item.budgetSubmilestoneKey,
      budgetTreatment: item.budgetTreatment,
      costCents: item.costCents,
      description: item.description,
      itemKey: item.itemKey,
      itemType: item.itemType,
      milestoneKey: item.milestoneKey,
      quantity: item.quantity,
      relevantSubmilestoneKeys: item.relevantSubmilestoneKeys,
      supplier: item.supplier,
      title: item.title,
    })),
    draws: draws.map((draw) => ({
      amountCents: draw.amountCents,
      customDate: draw.customDate,
      drawKey: draw.drawKey,
      label: draw.label,
      milestoneKey: draw.milestoneKey,
      order: draw.order,
      requestNote: draw.requestNote,
      requestReviewNote: draw.requestReviewNote,
      requestStatus: draw.requestStatus,
      requestedAt: draw.requestedAt,
      reviewedAt: draw.reviewedAt,
      source: draw.source,
      timingDay: draw.timingDay,
    })),
    milestones: milestones.map((milestone) => ({
      budgetCents: milestone.budgetCents,
      dayEnd: milestone.dayEnd,
      dayStart: milestone.dayStart,
      dependencyKeys: milestone.dependencyKeys,
      drawAvailabilityCents: milestone.drawAvailabilityCents,
      durationDays: milestone.durationDays,
      evidenceState: milestone.evidenceState,
      icon: milestone.icon,
      key: milestone.key,
      lane: milestone.lane,
      markerLabel: milestone.markerLabel,
      name: milestone.name,
      order: milestone.order,
      policyState: milestone.policyState,
      submilestones: (submilestonesByMilestoneKey.get(milestone.key) ?? [])
        .sort((a, b) => a.order - b.order || a.key.localeCompare(b.key))
        .map((submilestone) => {
          const fieldGuidance = guidanceBySubmilestoneId.get(submilestone._id);
          const scopeOfWorkTiptapJson = scopeBySubmilestoneId.get(
            submilestone._id
          );
          return {
            budgetCents: submilestone.budgetCents,
            durationDays: submilestone.durationDays,
            ...(fieldGuidance === undefined ? {} : { fieldGuidance }),
            key: submilestone.key,
            name: submilestone.name,
            order: submilestone.order,
            ...(scopeOfWorkTiptapJson === undefined
              ? {}
              : { scopeOfWorkTiptapJson }),
          };
        }),
      timelineStatus: milestone.timelineStatus,
      tone: milestone.tone,
    })),
    proposal: {
      borrowerStartingCashCents:
        proposal.borrowerStartingCashCents ??
        proposal.timelineStartingCashCents ??
        proposal.borrowerWorkingCapitalLimitCents,
      lenderDrawPolicyLimitCents: proposal.lenderDrawPolicyLimitCents,
      timelineCurrentDay: proposal.timelineCurrentDay,
      timelineProgressValue: proposal.timelineProgressValue,
      timelineRangeMax: proposal.timelineRangeMax,
      timelineRangeMin: -30,
      timelineRouteState: proposal.timelineRouteState,
      timelineStartingCashCents: proposal.timelineStartingCashCents,
      totalBudgetCents: proposal.totalBudgetCents,
    },
    version: 1,
  };
}

export async function restoreProposalPlanningSnapshot(
  ctx: MutationCtx,
  auth: {
    brokerage: Doc<"brokerages">;
    proposal: Doc<"buildProposals">;
    subject: string;
  },
  snapshot: ProposalPlanningSnapshot
) {
  if (
    auth.proposal.status !== "draft" ||
    auth.proposal.submittedAt !== undefined
  ) {
    throw new Error("Proposal planning restore is available only in draft.");
  }
  const now = Date.now();
  const preservedLegacyCanonicalContent =
    await resolveLegacyCanonicalContentForRestore(ctx, auth.proposal, snapshot);
  const costItemsToRestore =
    snapshot.costItems ??
    (await ctx.db
      .query("proposalCostItems")
      .withIndex("by_proposal", (q) => q.eq("proposalId", auth.proposal._id))
      .collect());
  await deleteDraftCanonicalLineageForRestore(ctx, auth.proposal);
  await deletePlanningRowsForRestore(ctx, auth.proposal._id);
  const milestoneIdByKey = new Map<string, Id<"proposalMilestones">>();
  for (const milestone of snapshot.milestones) {
    const milestoneId = await ctx.db.insert("proposalMilestones", {
      brokerageId: auth.brokerage._id,
      budgetCents: milestone.budgetCents,
      createdAt: now,
      dayEnd: milestone.dayEnd,
      dayStart: milestone.dayStart,
      dependencyKeys: milestone.dependencyKeys,
      drawAvailabilityCents: milestone.drawAvailabilityCents,
      durationDays: milestone.durationDays,
      evidenceState: milestone.evidenceState,
      icon: milestone.icon,
      key: milestone.key,
      lane: milestone.lane,
      markerLabel: milestone.markerLabel,
      name: milestone.name,
      order: milestone.order,
      organizationId: auth.proposal.organizationId,
      policyState: milestone.policyState,
      proposalId: auth.proposal._id,
      timelineStatus: milestone.timelineStatus,
      tone: milestone.tone,
      updatedAt: now,
    });
    milestoneIdByKey.set(milestone.key, milestoneId);
    for (const submilestone of milestone.submilestones) {
      const { fieldGuidance, scopeOfWorkTiptapJson } =
        resolveCanonicalContentForRestore(
          milestone.key,
          submilestone,
          preservedLegacyCanonicalContent
        );
      const proposalSubmilestoneId = await ctx.db.insert(
        "proposalSubmilestones",
        {
          brokerageId: auth.brokerage._id,
          budgetCents: submilestone.budgetCents,
          createdAt: now,
          durationDays: submilestone.durationDays,
          key: submilestone.key,
          milestoneKey: milestone.key,
          name: submilestone.name,
          order: submilestone.order,
          organizationId: auth.proposal.organizationId,
          proposalId: auth.proposal._id,
          proposalMilestoneId: milestoneId,
          updatedAt: now,
        }
      );
      await upsertSubmilestoneScopeV1Draft(ctx, {
        authoredByWorkosUserId: auth.subject,
        brokerageId: auth.brokerage._id,
        now,
        organizationId: auth.proposal.organizationId,
        proposalId: auth.proposal._id,
        proposalSubmilestoneId,
        scopeOfWorkTiptapJson,
      });
      await ctx.db.insert("submilestoneFieldGuidance", {
        brokerageId: auth.brokerage._id,
        cameraAnglesTiptapJson: fieldGuidance.cameraAnglesTiptapJson,
        createdAt: now,
        organizationId: auth.proposal.organizationId,
        proposalId: auth.proposal._id,
        proposalSubmilestoneId,
        updatedAt: now,
        updatedByWorkosUserId: auth.subject,
        whatToVerifyTiptapJson: fieldGuidance.whatToVerifyTiptapJson,
      });
    }
  }
  for (const item of costItemsToRestore) {
    const proposalMilestoneId = milestoneIdByKey.get(item.milestoneKey);
    if (!proposalMilestoneId) {
      continue;
    }
    await ctx.db.insert("proposalCostItems", {
      brokerageId: auth.brokerage._id,
      budgetSubmilestoneKey: item.budgetSubmilestoneKey,
      budgetTreatment: item.budgetTreatment ?? "add",
      costCents: item.costCents,
      createdAt: now,
      createdByWorkosUserId: auth.subject,
      description: item.description,
      itemKey: item.itemKey,
      itemType: item.itemType,
      milestoneKey: item.milestoneKey,
      organizationId: auth.proposal.organizationId,
      proposalId: auth.proposal._id,
      proposalMilestoneId,
      quantity: item.quantity,
      relevantSubmilestoneKeys: item.relevantSubmilestoneKeys,
      supplier: item.supplier,
      title: item.title,
      updatedAt: now,
      updatedByWorkosUserId: auth.subject,
    });
  }
  for (const draw of snapshot.draws) {
    await ctx.db.insert("proposalDrawScheduleRows", {
      amountCents: draw.amountCents,
      brokerageId: auth.brokerage._id,
      createdAt: now,
      customDate: draw.customDate,
      drawKey: draw.drawKey,
      label: draw.label,
      milestoneKey: draw.milestoneKey,
      order: draw.order,
      organizationId: auth.proposal.organizationId,
      proposalId: auth.proposal._id,
      proposalMilestoneId: draw.milestoneKey
        ? milestoneIdByKey.get(draw.milestoneKey)
        : undefined,
      requestNote: draw.requestNote,
      requestReviewNote: draw.requestReviewNote,
      requestStatus: draw.requestStatus,
      requestedAt: draw.requestedAt,
      reviewedAt: draw.reviewedAt,
      source: draw.source,
      timingDay: draw.timingDay,
      updatedAt: now,
    });
  }
  for (const event of snapshot.capitalEvents) {
    await ctx.db.insert("proposalCapitalEvents", {
      amountCents: event.amountCents,
      brokerageId: auth.brokerage._id,
      capitalEventKey: event.capitalEventKey,
      createdAt: now,
      eventKind: event.eventKind,
      interestAnnualBps: event.interestAnnualBps,
      label: event.label,
      order: event.order,
      organizationId: auth.proposal.organizationId,
      proposalId: auth.proposal._id,
      updatedAt: now,
      x: event.x,
    });
  }
  await ctx.db.patch(auth.proposal._id, {
    borrowerStartingCashCents: snapshot.proposal.borrowerStartingCashCents,
    // Dual-write until the legacy field is narrowed out after backfill.
    borrowerWorkingCapitalLimitCents:
      snapshot.proposal.borrowerStartingCashCents,
    lenderDrawPolicyLimitCents: snapshot.proposal.lenderDrawPolicyLimitCents,
    timelineCurrentDay: snapshot.proposal.timelineCurrentDay,
    timelineProgressValue: snapshot.proposal.timelineProgressValue,
    timelineRangeMax: snapshot.proposal.timelineRangeMax,
    timelineRangeMin: -30,
    timelineRouteState: snapshot.proposal.timelineRouteState,
    timelineStartingCashCents: snapshot.proposal.timelineStartingCashCents,
    totalBudgetCents: snapshot.proposal.totalBudgetCents,
    updatedAt: now,
    updatedByWorkosUserId: auth.subject,
  });
  await upsertProposalKanbanCard(ctx, auth.proposal._id, now);
}


async function deleteDraftCanonicalLineageForRestore(
  ctx: MutationCtx,
  proposal: Doc<"buildProposals">
) {
  const submilestones = await ctx.db
    .query("proposalSubmilestones")
    .withIndex("by_proposal", (q) => q.eq("proposalId", proposal._id))
    .take(501);
  if (submilestones.length > 500) {
    throw new Error("Proposal Sub-milestone restore is too large.");
  }
  for (const submilestone of submilestones) {
    const [contract, guidance] = await Promise.all([
      ctx.db
        .query("submilestoneScopeContracts")
        .withIndex("by_proposalSubmilestoneId", (q) =>
          q.eq("proposalSubmilestoneId", submilestone._id)
        )
        .unique(),
      ctx.db
        .query("submilestoneFieldGuidance")
        .withIndex("by_proposalSubmilestoneId", (q) =>
          q.eq("proposalSubmilestoneId", submilestone._id)
        )
        .unique(),
    ]);
    await deleteDraftScopeContractForRestore(ctx, proposal, contract);
    await deleteDraftGuidanceForRestore(ctx, proposal, guidance);
  }
}

async function deleteDraftScopeContractForRestore(
  ctx: MutationCtx,
  proposal: Doc<"buildProposals">,
  contract: Doc<"submilestoneScopeContracts"> | null
) {
  if (!contract) {
    return;
  }
  if (
    contract.organizationId !== proposal.organizationId ||
    contract.brokerageId !== proposal.brokerageId ||
    contract.proposalId !== proposal._id ||
    contract.effectiveRevisionId !== undefined ||
    contract.buildId !== undefined ||
    contract.buildSubmilestoneId !== undefined
  ) {
    throw new Error("Published Scope cannot be replaced by planning restore.");
  }
  const revisions = await ctx.db
    .query("submilestoneScopeRevisions")
    .withIndex("by_contractId_and_version", (q) =>
      q.eq("contractId", contract._id)
    )
    .take(501);
  if (
    revisions.length > 500 ||
    revisions.some((revision) => revision.status !== "draft")
  ) {
    throw new Error("Published Scope cannot be replaced by planning restore.");
  }
  for (const revision of revisions) {
    await ctx.db.delete(revision._id);
  }
  await ctx.db.delete(contract._id);
}

async function deleteDraftGuidanceForRestore(
  ctx: MutationCtx,
  proposal: Doc<"buildProposals">,
  guidance: Doc<"submilestoneFieldGuidance"> | null
) {
  if (!guidance) {
    return;
  }
  if (
    guidance.organizationId !== proposal.organizationId ||
    guidance.brokerageId !== proposal.brokerageId ||
    guidance.proposalId !== proposal._id ||
    guidance.buildId !== undefined ||
    guidance.buildSubmilestoneId !== undefined
  ) {
    throw new Error(
      "Build-linked Field Guidance cannot be replaced by planning restore."
    );
  }
  await ctx.db.delete(guidance._id);
}

async function deletePlanningRowsForRestore(
  ctx: MutationCtx,
  proposalId: Id<"buildProposals">
) {
  for (const table of [
    "proposalCapitalEvents",
    "proposalDrawScheduleRows",
    "proposalCostItems",
    "proposalSubmilestones",
    "proposalMilestones",
  ] as const) {
    const rows = await ctx.db
      .query(table)
      .withIndex("by_proposal", (q) => q.eq("proposalId", proposalId))
      .collect();
    for (const row of rows) {
      await ctx.db.delete(row._id);
    }
  }
}
