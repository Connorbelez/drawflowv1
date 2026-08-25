import { normalizeRoleSlugs, type RoleSlug } from "../authz";
import type { Doc, Id, MutationCtx, QueryCtx, TableNames } from "../types";
import {
  ACTIVE_BUILD_REQUEST_ONLY_ACTION_KEYS,
  BACKOFFICE_WRITE_ROLES,
  GENERIC_REASON_REQUIRED_ACTION_KEYS,
  type ActiveBuildAuth,
  type AssistantActionInput,
  type AssistantActionKey,
  type AssistantAuth,
  type AssistantPlanItem,
  type MutationActionKey,
  type ProposalAuth,
} from "./contracts";
import {
  normalizeRecord,
  isBackoffice,
  isBuilder,
  optionalId,
  optionalString,
  requiredId,
  requiredString,
  sanitizeForPersistence,
} from "./inputs";

export async function authorizeOrganization(
  ctx: (QueryCtx | MutationCtx) & {
    viewer: { organizationId?: string; roles: RoleSlug[]; subject: string };
  },
  workosOrganizationId: string
): Promise<AssistantAuth> {
  if (ctx.viewer.organizationId !== workosOrganizationId) {
    throw new Error("Forbidden: organization scope");
  }
  const brokerage = await ctx.db
    .query("brokerages")
    .withIndex("by_workos_organization", (q) =>
      q.eq("workosOrganizationId", workosOrganizationId)
    )
    .unique();
  if (!brokerage || brokerage.status !== "active") {
    throw new Error("Forbidden: brokerage scope");
  }
  const roles = normalizeRoleSlugs(ctx.viewer.roles);
  return {
    brokerage,
    organizationId: workosOrganizationId,
    roles,
    subject: ctx.viewer.subject,
  };
}

export async function authorizeProposal(
  ctx: QueryCtx | MutationCtx,
  auth: AssistantAuth,
  input: AssistantActionInput
): Promise<ProposalAuth> {
  const proposalId = requiredId<"buildProposals">(
    ctx,
    "buildProposals",
    input.proposalId,
    "proposalId"
  );
  const proposal = await ctx.db.get(proposalId);
  if (
    !proposal ||
    proposal.organizationId !== auth.organizationId ||
    proposal.brokerageId !== auth.brokerage._id
  ) {
    throw new Error("Forbidden: proposal scope");
  }
  if (isBackoffice(auth.roles)) {
    return { ...auth, proposal };
  }
  if (!isBuilder(auth.roles)) {
    throw new Error("Forbidden: proposal scope");
  }
  if (!proposal.builderProfileId) {
    throw new Error("Forbidden: proposal builder scope");
  }
  const link = await ctx.db
    .query("builderAccountLinks")
    .withIndex("by_builder_user", (q) =>
      q
        .eq("builderProfileId", proposal.builderProfileId!)
        .eq("workosUserId", auth.subject)
    )
    .unique();
  if (!link || link.status !== "active") {
    throw new Error("Forbidden: proposal builder scope");
  }
  return { ...auth, proposal };
}

export async function authorizeActiveBuild(
  ctx: QueryCtx | MutationCtx,
  auth: AssistantAuth,
  input: AssistantActionInput
): Promise<ActiveBuildAuth> {
  const buildId = requiredId<"activeBuilds">(
    ctx,
    "activeBuilds",
    input.buildId,
    "buildId"
  );
  const build = await ctx.db.get(buildId);
  if (
    !build ||
    build.organizationId !== auth.organizationId ||
    build.brokerageId !== auth.brokerage._id
  ) {
    throw new Error("Forbidden: active build scope");
  }
  const proposal = await ctx.db.get(build.proposalId);
  if (!proposal || proposal.brokerageId !== auth.brokerage._id) {
    throw new Error("Forbidden: active build proposal scope");
  }
  if (!(isBackoffice(auth.roles) || isBuilder(auth.roles))) {
    throw new Error("Forbidden: active build scope");
  }
  return { ...auth, build, proposal };
}

export async function authorizeReminderTarget(
  ctx: QueryCtx | MutationCtx,
  auth: AssistantAuth,
  input: AssistantActionInput
): Promise<ProposalAuth | ActiveBuildAuth> {
  if (input.buildId) {
    return await authorizeActiveBuild(ctx, auth, input);
  }
  return await authorizeProposal(ctx, auth, input);
}

export async function requireThread(
  ctx: QueryCtx | MutationCtx,
  threadId: Id<"assistantThreads">,
  workosOrganizationId: string
) {
  const thread = await ctx.db.get(threadId);
  if (!thread || thread.organizationId !== workosOrganizationId) {
    throw new Error("Assistant thread not found for organization.");
  }
  return thread;
}

export function requireProposalWrite(auth: ProposalAuth) {
  if (isBackoffice(auth.roles)) {
    if (
      BACKOFFICE_WRITE_ROLES.some((role) => auth.roles.includes(role)) &&
      (auth.roles.includes("admin") ||
        auth.roles.includes("principle-broker") ||
        auth.proposal.assignedBrokerWorkosUserId === auth.subject)
    ) {
      return;
    }
    throw new Error("Forbidden: proposal write");
  }
  if (isBuilder(auth.roles) && auth.proposal.status === "draft") {
    return;
  }
  throw new Error("Forbidden: proposal write");
}

export function requireBackofficeWrite(roles: readonly RoleSlug[]) {
  if (
    roles.includes("admin") ||
    roles.includes("principle-broker") ||
    roles.includes("broker")
  ) {
    return;
  }
  throw new Error("Forbidden: backoffice write");
}

export function denyContractorMutationBatch(roles: readonly RoleSlug[]) {
  if (roles.includes("contractor")) {
    throw new Error("Contractor assistant access is read-only in v1.");
  }
}

export function previewItem(
  action: {
    actionKey: AssistantActionKey;
    clientRequestId: string;
    input: AssistantActionInput;
  },
  input: {
    after: unknown;
    before: unknown;
    entityLabel: string;
    entityType: string;
    errors?: string[];
    mutationName?: string;
    reasonRequired: boolean;
    warnings?: string[];
  }
): AssistantPlanItem {
  return {
    actionKey: action.actionKey,
    after: sanitizeForPersistence(input.after),
    before: sanitizeForPersistence(input.before),
    clientRequestId: action.clientRequestId,
    entityLabel: input.entityLabel,
    entityType: input.entityType,
    input: sanitizeForPersistence(action.input),
    ...(input.mutationName ? { mutationName: input.mutationName } : {}),
    reasonRequired: input.reasonRequired,
    status: "preview",
    validation: {
      errors: input.errors ?? [],
      warnings: input.warnings ?? [],
    },
  };
}

export async function getProposalMilestone(
  ctx: QueryCtx | MutationCtx,
  input: AssistantActionInput,
  proposalId: Id<"buildProposals">
) {
  return await getProposalMilestoneByKey(
    ctx,
    proposalId,
    requiredString(input.milestoneKey, "milestoneKey")
  );
}

export async function getProposalMilestoneByKey(
  ctx: QueryCtx | MutationCtx,
  proposalId: Id<"buildProposals">,
  milestoneKey: string
) {
  const milestone = await ctx.db
    .query("proposalMilestones")
    .withIndex("by_proposal_key", (q) =>
      q.eq("proposalId", proposalId).eq("key", milestoneKey)
    )
    .unique();
  if (!milestone) {
    throw new Error("Production proposal milestone not found.");
  }
  return milestone;
}

export async function getBuildMilestone(
  ctx: QueryCtx | MutationCtx,
  input: AssistantActionInput,
  buildId: Id<"activeBuilds">
) {
  const milestoneKey = requiredString(input.milestoneKey, "milestoneKey");
  const milestone = await ctx.db
    .query("buildMilestones")
    .withIndex("by_build_key", (q) =>
      q.eq("buildId", buildId).eq("key", milestoneKey)
    )
    .unique();
  if (!milestone) {
    throw new Error("Active-build milestone not found.");
  }
  return milestone;
}

export async function findProposalDraw(
  ctx: QueryCtx | MutationCtx,
  proposalId: Id<"buildProposals">,
  drawKey: string
) {
  return await ctx.db
    .query("proposalDrawScheduleRows")
    .withIndex("by_proposal_key", (q) =>
      q.eq("proposalId", proposalId).eq("drawKey", drawKey)
    )
    .unique();
}

export async function getProposalDraw(
  ctx: QueryCtx | MutationCtx,
  input: AssistantActionInput,
  proposalId: Id<"buildProposals">
) {
  const draw = await findProposalDraw(
    ctx,
    proposalId,
    requiredString(input.drawKey, "drawKey")
  );
  if (!draw) {
    throw new Error("Proposal draw schedule row not found.");
  }
  return draw;
}

export async function findBuildDraw(
  ctx: QueryCtx | MutationCtx,
  buildId: Id<"activeBuilds">,
  drawKey: string
) {
  const draws = (await collectByIndex(
    ctx,
    "plannedDrawScheduleRows",
    "by_build",
    buildId
  )) as Doc<"plannedDrawScheduleRows">[];
  return draws.find((row) => row.drawKey === drawKey) ?? null;
}

export async function getReminder(
  ctx: QueryCtx | MutationCtx,
  input: AssistantActionInput,
  auth: ProposalAuth | ActiveBuildAuth
) {
  const eventId = requiredId<"calendarReminderEvents">(
    ctx,
    "calendarReminderEvents",
    input.eventId,
    "eventId"
  );
  const event = await ctx.db.get(eventId);
  if (!event || event.proposalId !== auth.proposal._id) {
    throw new Error("Reminder calendar event not found.");
  }
  if ("build" in auth && event.buildId !== auth.build._id) {
    throw new Error("Reminder calendar event not found.");
  }
  return event;
}

export async function getSiteVisit(
  ctx: QueryCtx | MutationCtx,
  input: AssistantActionInput,
  buildId: Id<"activeBuilds">
) {
  const visitId = requiredString(input.visitId, "visitId");
  const visit = await ctx.db
    .query("buildSiteVisits")
    .withIndex("by_visit", (q) => q.eq("visitId", visitId))
    .unique();
  if (!visit || visit.buildId !== buildId) {
    throw new Error("Active-build site visit not found.");
  }
  return visit;
}

export async function touchProposal(
  ctx: MutationCtx,
  auth: ProposalAuth,
  now: number
) {
  await ctx.db.patch(auth.proposal._id, {
    updatedAt: now,
    updatedByWorkosUserId: auth.subject,
  });
}

export async function recalculateProposalBudget(
  ctx: MutationCtx,
  auth: ProposalAuth,
  now: number
) {
  const milestones = await collectByIndex(
    ctx,
    "proposalMilestones",
    "by_proposal",
    auth.proposal._id
  );
  const totalBudgetCents = milestones.reduce(
    (total: number, milestone: any) => total + milestone.budgetCents,
    0
  );
  await ctx.db.patch(auth.proposal._id, {
    totalBudgetCents,
    updatedAt: now,
    updatedByWorkosUserId: auth.subject,
  });
}

export async function ensureProposalPolicyLimitCoversDraws(
  ctx: MutationCtx,
  auth: ProposalAuth,
  now: number
) {
  const draws = await collectByIndex(
    ctx,
    "proposalDrawScheduleRows",
    "by_proposal",
    auth.proposal._id
  );
  const totalDrawAmountCents = draws.reduce(
    (total: number, draw: any) => total + draw.amountCents,
    0
  );
  if (totalDrawAmountCents > auth.proposal.lenderDrawPolicyLimitCents) {
    await ctx.db.patch(auth.proposal._id, {
      lenderDrawPolicyLimitCents: totalDrawAmountCents,
      updatedAt: now,
      updatedByWorkosUserId: auth.subject,
    });
  } else {
    await touchProposal(ctx, auth, now);
  }
}

export async function writeScheduleRevision(
  ctx: MutationCtx,
  auth: ProposalAuth,
  input: {
    entityKey: string;
    entityType: string;
    newState: unknown;
    priorState: unknown;
    reason: string;
    revisionType: string;
  }
) {
  await ctx.db.insert("scheduleRevisionRecords", {
    brokerageId: auth.brokerage._id,
    createdAt: Date.now(),
    entityKey: input.entityKey,
    entityType: input.entityType,
    newState: sanitizeForPersistence(input.newState),
    organizationId: auth.organizationId,
    priorState: sanitizeForPersistence(input.priorState),
    proposalId: auth.proposal._id,
    reason: input.reason,
    revisionType: input.revisionType,
    revisedByWorkosUserId: auth.subject,
    warnings: [],
  });
}

export async function writeProposalAudit(
  ctx: MutationCtx,
  auth: ProposalAuth,
  input: {
    command: string;
    entityId: string;
    entityType: string;
    eventType: string;
    newState?: unknown;
    priorState?: unknown;
    reason?: string;
    warnings?: string[];
    buildId?: Id<"activeBuilds">;
    resourceType?:
      | "milestone"
      | "submilestone"
      | "draw"
      | "evidence"
      | "material"
      | "siteVisit"
      | "contractor"
      | "capitalEvent"
      | "reminder";
  }
) {
  await ctx.db.insert("auditEvents", {
    actorRoles: auth.roles,
    actorWorkosUserId: auth.subject,
    brokerageId: auth.brokerage._id,
    buildId: input.buildId,
    command: input.command,
    createdAt: Date.now(),
    entityId: input.entityId,
    entityType: input.entityType,
    eventType: input.eventType,
    newState:
      input.newState === undefined
        ? undefined
        : JSON.stringify(sanitizeForPersistence(input.newState)),
    organizationId: auth.organizationId,
    priorState:
      input.priorState === undefined
        ? undefined
        : JSON.stringify(sanitizeForPersistence(input.priorState)),
    reason: input.reason,
    resourceType:
      input.resourceType ??
      deriveAssistantAuditResourceType(input.entityType, input.eventType),
    warnings: input.warnings ?? [],
  });
}

export async function writeActiveBuildAudit(
  ctx: MutationCtx,
  auth: ActiveBuildAuth,
  input: {
    command: string;
    entityId: string;
    entityType: string;
    eventType: string;
    newState?: unknown;
    priorState?: unknown;
    reason?: string;
    warnings?: string[];
  }
) {
  await writeProposalAudit(ctx, auth, {
    ...input,
    buildId: auth.build._id,
  });
}

export function deriveAssistantAuditResourceType(
  entityType: string,
  eventType: string
):
  | "milestone"
  | "submilestone"
  | "draw"
  | "evidence"
  | "material"
  | "siteVisit"
  | "contractor"
  | "capitalEvent"
  | "reminder" {
  if (entityType === "buildSubmilestone" || entityType === "submilestone") {
    return "submilestone";
  }
  if (entityType === "buildSiteVisit" || entityType === "siteVisit") {
    return "siteVisit";
  }
  if (entityType === "capitalEvent") {
    return "capitalEvent";
  }
  const signal = `${entityType} ${eventType}`.toLowerCase();
  if (signal.includes("site_visit") || signal.includes("site visit")) {
    return "siteVisit";
  }
  if (signal.includes("draw")) {
    return "draw";
  }
  if (signal.includes("evidence") || signal.includes("photo")) {
    return "evidence";
  }
  if (signal.includes("material") || signal.includes("cost")) {
    return "material";
  }
  if (signal.includes("contractor") || signal.includes("assign")) {
    return "contractor";
  }
  if (signal.includes("reminder")) {
    return "reminder";
  }
  return "milestone";
}

export async function writeReminderAudit(
  ctx: MutationCtx,
  auth: ProposalAuth | ActiveBuildAuth,
  input: {
    command: string;
    entityId: string;
    entityType: string;
    eventType: string;
    newState?: unknown;
    priorState?: unknown;
    reason?: string;
    warnings?: string[];
  }
) {
  if ("build" in auth) {
    await writeActiveBuildAudit(ctx, auth, {
      ...input,
      newState: {
        ...(input.newState &&
        typeof input.newState === "object" &&
        !Array.isArray(input.newState)
          ? (input.newState as Record<string, unknown>)
          : { value: input.newState }),
        buildId: auth.build._id,
      },
    });
    return;
  }
  await writeProposalAudit(ctx, auth, input);
}

export async function collectByIndex(
  ctx: QueryCtx | MutationCtx,
  table: string,
  indexName: string,
  value: unknown
) {
  return await (ctx.db.query(table as any) as any)
    .withIndex(indexName, (q: any) =>
      q.eq(indexName.includes("build") ? "buildId" : "proposalId", value)
    )
    .collect();
}

export async function genericProposalPreviewBefore(
  ctx: MutationCtx,
  auth: ProposalAuth,
  action: { actionKey: AssistantActionKey; input: AssistantActionInput }
) {
  if (action.input.milestoneKey) {
    return await getProposalMilestoneByKey(
      ctx,
      auth.proposal._id,
      String(action.input.milestoneKey)
    ).catch(() => auth.proposal);
  }
  if (action.input.drawKey) {
    return (
      (await findProposalDraw(
        ctx,
        auth.proposal._id,
        String(action.input.drawKey)
      )) ?? auth.proposal
    );
  }
  if (action.input.itemId) {
    const itemId = optionalId<"proposalCostItems">(
      ctx,
      "proposalCostItems",
      action.input.itemId
    );
    return itemId
      ? ((await ctx.db.get(itemId)) ?? auth.proposal)
      : auth.proposal;
  }
  if (action.input.capitalEventKey) {
    return (
      (await findProposalCapitalEvent(
        ctx,
        auth.proposal._id,
        String(action.input.capitalEventKey)
      )) ?? auth.proposal
    );
  }
  if (action.input.evidenceKey) {
    return (
      (await findProposalEvidenceAsset(
        ctx,
        auth.proposal._id,
        String(action.input.evidenceKey)
      )) ?? auth.proposal
    );
  }
  return auth.proposal;
}

export async function genericActiveBuildPreviewBefore(
  ctx: MutationCtx,
  auth: ActiveBuildAuth,
  action: { actionKey: AssistantActionKey; input: AssistantActionInput }
) {
  if (action.input.milestoneKey) {
    return await getBuildMilestone(ctx, action.input, auth.build._id).catch(
      () => auth.build
    );
  }
  if (action.input.drawKey) {
    return (
      (await findBuildDraw(
        ctx,
        auth.build._id,
        String(action.input.drawKey)
      )) ?? auth.build
    );
  }
  if (action.input.itemId) {
    const itemId = optionalId<"buildCostItems">(
      ctx,
      "buildCostItems",
      action.input.itemId
    );
    return itemId ? ((await ctx.db.get(itemId)) ?? auth.build) : auth.build;
  }
  if (action.input.capitalEventKey) {
    return (
      (await findActiveBuildCapitalEvent(
        ctx,
        auth.build._id,
        String(action.input.capitalEventKey)
      )) ?? auth.build
    );
  }
  if (action.input.evidenceKey) {
    return (
      (await findActiveBuildEvidenceAsset(
        ctx,
        auth.build._id,
        String(action.input.evidenceKey)
      )) ?? auth.build
    );
  }
  return auth.build;
}

export async function findProposalCapitalEvent(
  ctx: QueryCtx | MutationCtx,
  proposalId: Id<"buildProposals">,
  capitalEventKey: string
) {
  return await ctx.db
    .query("proposalCapitalEvents")
    .withIndex("by_proposal_key", (q) =>
      q.eq("proposalId", proposalId).eq("capitalEventKey", capitalEventKey)
    )
    .unique();
}

export async function findProposalEvidenceAsset(
  ctx: QueryCtx | MutationCtx,
  proposalId: Id<"buildProposals">,
  evidenceKey: string
) {
  return await ctx.db
    .query("proposalEvidenceAssets")
    .withIndex("by_proposal_key", (q) =>
      q.eq("proposalId", proposalId).eq("evidenceKey", evidenceKey)
    )
    .unique();
}

export async function findActiveBuildCapitalEvent(
  ctx: QueryCtx | MutationCtx,
  buildId: Id<"activeBuilds">,
  capitalEventKey: string
) {
  return await ctx.db
    .query("capitalEvents")
    .withIndex("by_build", (q) => q.eq("buildId", buildId))
    .collect()
    .then(
      (rows) =>
        rows.find((row) => row.capitalEventKey === capitalEventKey) ?? null
    );
}

export async function findActiveBuildEvidenceAsset(
  ctx: QueryCtx | MutationCtx,
  buildId: Id<"activeBuilds">,
  evidenceKey: string
) {
  return await ctx.db
    .query("buildEvidenceAssets")
    .withIndex("by_build_key", (q) =>
      q.eq("buildId", buildId).eq("evidenceKey", evidenceKey)
    )
    .unique();
}

export function genericPreviewLabel(before: unknown, fallback: string) {
  if (before && typeof before === "object") {
    const record = before as Record<string, unknown>;
    return String(
      record.name ??
        record.title ??
        record.label ??
        record.buildName ??
        record.drawKey ??
        record.key ??
        fallback
    );
  }
  return fallback;
}

export function genericEntityType(
  actionKey: AssistantActionKey,
  fallback: string
) {
  if (String(actionKey).includes("cost_item")) {
    return "costItem";
  }
  if (String(actionKey).includes("contractor")) {
    return "contractorAssignment";
  }
  if (String(actionKey).includes("staff")) {
    return "builderStaffPermission";
  }
  if (String(actionKey).includes("collaboration")) {
    return "proposalCollaborationSession";
  }
  if (String(actionKey).includes("milestone")) {
    return "milestone";
  }
  if (String(actionKey).includes("draw")) {
    return "draw";
  }
  if (String(actionKey).includes("capital")) {
    return "capitalEvent";
  }
  if (String(actionKey).includes("evidence")) {
    return "evidenceAsset";
  }
  return fallback;
}

export function genericReasonRequired(actionKey: MutationActionKey) {
  return (GENERIC_REASON_REQUIRED_ACTION_KEYS as readonly string[]).includes(
    actionKey
  );
}

export function genericMutationWarnings(actionKey: MutationActionKey) {
  const warnings: string[] = ["delegates-to-domain-mutation"];
  if (
    (ACTIVE_BUILD_REQUEST_ONLY_ACTION_KEYS as readonly string[]).includes(
      actionKey
    )
  ) {
    warnings.push("active-build-request-only");
  }
  if (
    actionKey === "provision_proposal_builder_staff" ||
    actionKey === "provision_active_build_builder_staff"
  ) {
    warnings.push("workos-action-runtime-required");
  }
  return warnings;
}
