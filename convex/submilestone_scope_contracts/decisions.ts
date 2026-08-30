import { ConvexError } from "convex/values";

import {
  backofficeRoleSlugs,
  type AuthorizedViewer,
} from "../authz";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../types";
import { requireRevisionContract } from "./revisions";
import {
  authorizeContract,
  authorizeProposalSubmilestone,
} from "./shared";

type ScopeDecisionKind = Doc<"submilestoneScopeDecisions">["kind"];
type BypassedScopeDecisionKind = Exclude<ScopeDecisionKind, "admin_override">;

const MAX_SCOPE_DECISION_ROWS = 500;
const MAX_SCOPE_DECISION_REASON_LENGTH = 5000;
const MAX_SCOPE_IDEMPOTENCY_KEY_LENGTH = 200;

function requiredScopeDecisionReason(value: string, label: string) {
  const reason = value.trim();
  if (!reason) {
    throw new Error(`${label} requires a non-empty reason.`);
  }
  if (reason.length > MAX_SCOPE_DECISION_REASON_LENGTH) {
    throw new Error(`${label} reason exceeds the supported length.`);
  }
  return reason;
}

function requiredScopeDecisionIdempotencyKey(value: string) {
  const key = value.trim();
  if (!key || key.length > MAX_SCOPE_IDEMPOTENCY_KEY_LENGTH) {
    throw new Error(
      `Scope decision idempotency key must be 1 to ${MAX_SCOPE_IDEMPOTENCY_KEY_LENGTH} characters.`
    );
  }
  return key;
}

function isBackofficeRole(viewer: AuthorizedViewer) {
  return viewer.roles.some((role) =>
    (backofficeRoleSlugs as readonly string[]).includes(role)
  );
}

function isLenderAdmin(viewer: AuthorizedViewer) {
  return (
    viewer.roles.includes("admin") || viewer.roles.includes("principle-broker")
  );
}

function assertLenderAdmin(viewer: AuthorizedViewer) {
  if (!isLenderAdmin(viewer)) {
    throw new Error("Forbidden: lender-admin authority");
  }
}

async function authorizeScopeDecisionRevision(
  ctx: MutationCtx,
  viewer: AuthorizedViewer,
  revisionId: Id<"submilestoneScopeRevisions">,
  workosOrganizationId: string
) {
  const { contract, revision } = await requireRevisionContract(ctx, revisionId);
  const { proposal, submilestone } = await authorizeContract(
    ctx,
    viewer,
    contract,
    workosOrganizationId
  );
  if (
    contract.brokerageId !== proposal.brokerageId ||
    contract.organizationId !== proposal.organizationId ||
    contract.proposalId !== proposal._id ||
    contract.proposalSubmilestoneId !== submilestone._id ||
    revision.brokerageId !== contract.brokerageId ||
    revision.organizationId !== contract.organizationId ||
    revision.proposalId !== contract.proposalId ||
    revision.proposalSubmilestoneId !== contract.proposalSubmilestoneId ||
    revision.contractId !== contract._id
  ) {
    throw new Error("Forbidden: Scope revision lineage");
  }
  if (revision.status !== "published") {
    throw new Error("Scope decisions require a published revision.");
  }
  return { contract, proposal, revision, submilestone };
}

async function assertBorrowerDecisionAuthority(
  ctx: MutationCtx,
  viewer: AuthorizedViewer,
  proposal: Doc<"buildProposals">,
  workosOrganizationId: string
) {
  // A lender-side identity must not use a broad backoffice/admin capability to
  // impersonate the borrower. The active builder-account link is the
  // proposal-lineage authority for both the owner and delegated staff.
  if (
    !(
      viewer.roles.includes("builder") || viewer.roles.includes("builder-staff")
    ) ||
    isBackofficeRole(viewer) ||
    !proposal.builderProfileId
  ) {
    throw new Error("Forbidden: borrower Scope decision authority");
  }
  const builderProfile = await ctx.db.get(proposal.builderProfileId);
  if (
    !builderProfile ||
    builderProfile.status !== "active" ||
    builderProfile.organizationId !== workosOrganizationId ||
    builderProfile.brokerageId !== proposal.brokerageId
  ) {
    throw new Error("Forbidden: borrower Scope decision authority");
  }
  const links = await ctx.db
    .query("builderAccountLinks")
    .withIndex("by_builder_user", (query) =>
      query
        .eq("builderProfileId", builderProfile._id)
        .eq("workosUserId", viewer.subject)
    )
    .take(21);
  if (
    !links.some(
      (link) =>
        link.status === "active" &&
        link.brokerageId === proposal.brokerageId &&
        (link.role === "owner" || link.role === "staff")
    )
  ) {
    throw new Error("Forbidden: borrower Scope decision authority");
  }
}

function lenderAdminGateRequired(proposal: Doc<"buildProposals">) {
  return (
    proposal.status === "approved" ||
    proposal.status === "closed" ||
    Boolean(proposal.activeBuildId)
  );
}

function normalizeScopeDecisionActorRoles(roles: readonly string[]) {
  return [...new Set(roles)].sort();
}

async function loadScopeRevisionDecisions(
  ctx: MutationCtx,
  revisionId: Id<"submilestoneScopeRevisions">
) {
  const decisions = await ctx.db
    .query("submilestoneScopeDecisions")
    .withIndex("by_revisionId_and_createdAt", (query) =>
      query.eq("revisionId", revisionId)
    )
    .order("asc")
    .take(MAX_SCOPE_DECISION_ROWS + 1);
  if (decisions.length > MAX_SCOPE_DECISION_ROWS) {
    throw new Error("Scope decision history has reached its supported limit.");
  }
  return decisions;
}

function scopeDecisionKindsForGate(
  proposal: Doc<"buildProposals">,
  decisions: Pick<Doc<"submilestoneScopeDecisions">, "kind">[]
) {
  const hasBorrowerAcknowledgement = decisions.some(
    (decision) => decision.kind === "borrower_acknowledged"
  );
  const hasBorrowerRejection = decisions.some(
    (decision) => decision.kind === "borrower_rejected"
  );
  const hasLenderAdminApproval = decisions.some(
    (decision) => decision.kind === "lender_admin_approved"
  );
  const missing: BypassedScopeDecisionKind[] = [];
  if (hasBorrowerRejection) {
    missing.push("borrower_rejected");
  } else if (!hasBorrowerAcknowledgement) {
    missing.push("borrower_acknowledged");
  }
  if (lenderAdminGateRequired(proposal) && !hasLenderAdminApproval) {
    missing.push("lender_admin_approved");
  }
  return {
    hasBorrowerAcknowledgement,
    hasBorrowerRejection,
    hasLenderAdminApproval,
    missing,
    ready:
      hasBorrowerAcknowledgement &&
      !hasBorrowerRejection &&
      (!lenderAdminGateRequired(proposal) || hasLenderAdminApproval),
  };
}

async function advanceEffectiveScopeRevision(
  ctx: MutationCtx,
  contract: Doc<"submilestoneScopeContracts">,
  revision: Doc<"submilestoneScopeRevisions">,
  ready: boolean,
  now: number
) {
  if (!ready) {
    return contract.effectiveRevisionId ?? null;
  }
  const current = contract.effectiveRevisionId
    ? await ctx.db.get(contract.effectiveRevisionId)
    : null;
  if (current && current.version >= revision.version) {
    return current._id;
  }
  await ctx.db.patch(contract._id, {
    effectiveRevisionId: revision._id,
    updatedAt: now,
  });
  return revision._id;
}

function scopeDecisionPayloadMatches(
  existing: Doc<"submilestoneScopeDecisions">,
  input: {
    actorRoles: string[];
    actorWorkosUserId: string;
    kind: ScopeDecisionKind;
    reason?: string;
    revisionId: Id<"submilestoneScopeRevisions">;
    version: number;
  }
) {
  return (
    existing.actorWorkosUserId === input.actorWorkosUserId &&
    normalizeScopeDecisionActorRoles(existing.actorRoles).join("\u0000") ===
      normalizeScopeDecisionActorRoles(input.actorRoles).join("\u0000") &&
    existing.kind === input.kind &&
    existing.reason === input.reason &&
    existing.revisionId === input.revisionId &&
    existing.version === input.version
  );
}

async function existingScopeDecisionForKey(
  ctx: MutationCtx,
  contractId: Id<"submilestoneScopeContracts">,
  idempotencyKey: string
) {
  return await ctx.db
    .query("submilestoneScopeDecisions")
    .withIndex("by_contractId_and_idempotencyKey", (query) =>
      query.eq("contractId", contractId).eq("idempotencyKey", idempotencyKey)
    )
    .unique();
}

function assertScopeDecisionIdempotencyPayload(
  existing: Doc<"submilestoneScopeDecisions">,
  input: {
    actorRoles: string[];
    actorWorkosUserId: string;
    kind: ScopeDecisionKind;
    reason?: string;
    revisionId: Id<"submilestoneScopeRevisions">;
    version: number;
  }
) {
  if (!scopeDecisionPayloadMatches(existing, input)) {
    throw new ConvexError({
      code: "IDEMPOTENCY_KEY_REUSED",
      message:
        "This Scope decision idempotency key was reused for a different payload.",
    });
  }
}

function assertScopeDecisionIsNotDuplicateOrConflicting(
  kind: Exclude<ScopeDecisionKind, "admin_override">,
  decisions: Pick<Doc<"submilestoneScopeDecisions">, "kind">[]
) {
  if (decisions.some((decision) => decision.kind === kind)) {
    throw new Error(
      `Scope decision ${kind} is already recorded for this revision; reuse the original idempotency key to replay it instead of creating a duplicate.`
    );
  }
  const conflictingKind =
    kind === "borrower_acknowledged"
      ? "borrower_rejected"
      : kind === "borrower_rejected"
        ? "borrower_acknowledged"
        : null;
  if (
    conflictingKind &&
    decisions.some((decision) => decision.kind === conflictingKind)
  ) {
    throw new Error(
      `Borrower Scope decision conflicts with existing ${conflictingKind} decision.`
    );
  }
}

function scopeDecisionResult(
  decision: Doc<"submilestoneScopeDecisions">,
  effectiveRevisionId: Id<"submilestoneScopeRevisions"> | null,
  replayed: boolean
) {
  return {
    decisionId: decision._id,
    effectiveRevisionId,
    kind: decision.kind,
    replayed,
  };
}

async function recordScopeDecisionAudit(
  ctx: MutationCtx,
  input: {
    actorRoles: string[];
    actorWorkosUserId: string;
    brokerageId: Id<"brokerages">;
    command: string;
    contract: Doc<"submilestoneScopeContracts">;
    entityId: string;
    eventType: string;
    newState: string;
    priorState: string;
    reason?: string;
    warnings: string[];
  }
) {
  await ctx.db.insert("auditEvents", {
    actorRoles: input.actorRoles,
    actorWorkosUserId: input.actorWorkosUserId,
    brokerageId: input.brokerageId,
    command: input.command,
    createdAt: Date.now(),
    entityId: input.entityId,
    entityType: "submilestoneScopeRevision",
    eventType: input.eventType,
    newState: input.newState,
    organizationId: input.contract.organizationId,
    overrideKind:
      input.eventType === "submilestone_scope_revision.admin_override"
        ? "submilestone_scope_revision"
        : undefined,
    priorState: input.priorState,
    reason: input.reason,
    warnings: input.warnings,
  });
}

async function recordScopeDecision(
  ctx: MutationCtx,
  input: {
    actorRoles: string[];
    actorWorkosUserId: string;
    contract: Doc<"submilestoneScopeContracts">;
    kind: Exclude<ScopeDecisionKind, "admin_override">;
    proposal: Doc<"buildProposals">;
    reason?: string;
    revision: Doc<"submilestoneScopeRevisions">;
    idempotencyKey: string;
  }
) {
  const actorRoles = normalizeScopeDecisionActorRoles(input.actorRoles);
  const existing = await existingScopeDecisionForKey(
    ctx,
    input.contract._id,
    input.idempotencyKey
  );
  const payload = {
    actorRoles,
    actorWorkosUserId: input.actorWorkosUserId,
    kind: input.kind,
    reason: input.reason,
    revisionId: input.revision._id,
    version: input.revision.version,
  };
  if (existing) {
    assertScopeDecisionIdempotencyPayload(existing, payload);
    return {
      decision: existing,
      effectiveRevisionId:
        existing.newEffectiveRevisionId ??
        existing.priorEffectiveRevisionId ??
        null,
      replayed: true,
    };
  }

  const decisions = await loadScopeRevisionDecisions(ctx, input.revision._id);
  assertScopeDecisionIsNotDuplicateOrConflicting(input.kind, decisions);
  const gate = scopeDecisionKindsForGate(input.proposal, [
    ...decisions,
    { kind: input.kind },
  ]);
  const priorEffectiveRevisionId = input.contract.effectiveRevisionId;
  const now = Date.now();
  const effectiveRevisionId = await advanceEffectiveScopeRevision(
    ctx,
    input.contract,
    input.revision,
    gate.ready,
    now
  );
  const decisionId = await ctx.db.insert("submilestoneScopeDecisions", {
    actorRoles,
    actorWorkosUserId: input.actorWorkosUserId,
    brokerageId: input.contract.brokerageId,
    contractId: input.contract._id,
    createdAt: now,
    idempotencyKey: input.idempotencyKey,
    kind: input.kind,
    organizationId: input.contract.organizationId,
    proposalId: input.contract.proposalId,
    proposalSubmilestoneId: input.contract.proposalSubmilestoneId,
    reason: input.reason,
    revisionId: input.revision._id,
    version: input.revision.version,
    ...(priorEffectiveRevisionId ? { priorEffectiveRevisionId } : {}),
    ...(effectiveRevisionId && effectiveRevisionId !== priorEffectiveRevisionId
      ? { newEffectiveRevisionId: effectiveRevisionId }
      : {}),
  });
  const decision = await ctx.db.get(decisionId);
  if (!decision) {
    throw new Error("Scope decision was not persisted.");
  }
  const eventType = `submilestone_scope_revision.${input.kind}`;
  await recordScopeDecisionAudit(ctx, {
    actorRoles,
    actorWorkosUserId: input.actorWorkosUserId,
    brokerageId: input.contract.brokerageId,
    command: scopeCommandForKind(input.kind),
    contract: input.contract,
    entityId: String(input.revision._id),
    eventType,
    newState: JSON.stringify({
      decisionId: String(decisionId),
      effectiveRevisionId: effectiveRevisionId
        ? String(effectiveRevisionId)
        : null,
      kind: input.kind,
      revisionId: String(input.revision._id),
      version: input.revision.version,
    }),
    priorState: JSON.stringify({
      effectiveRevisionId: priorEffectiveRevisionId
        ? String(priorEffectiveRevisionId)
        : null,
      priorEffectiveRevisionId: priorEffectiveRevisionId
        ? String(priorEffectiveRevisionId)
        : null,
      proposalStatus: input.proposal.status,
    }),
    reason: input.reason,
    warnings: [],
  });
  return { decision, effectiveRevisionId, replayed: false };
}

function scopeCommandForKind(
  kind: Exclude<ScopeDecisionKind, "admin_override">
) {
  switch (kind) {
    case "borrower_acknowledged":
      return "acknowledgeSubmilestoneScopeRevision";
    case "borrower_rejected":
      return "rejectSubmilestoneScopeRevision";
    case "lender_admin_approved":
      return "approveSubmilestoneScopeRevision";
  }
}


export async function acknowledgeScopeRevision(
  ctx: MutationCtx & { viewer: AuthorizedViewer },
  args: { idempotencyKey: string; revisionId: Id<"submilestoneScopeRevisions">; workosOrganizationId: string }
) {
    const { contract, proposal, revision } =
      await authorizeScopeDecisionRevision(
        ctx,
        ctx.viewer,
        args.revisionId,
        args.workosOrganizationId
      );
    await assertBorrowerDecisionAuthority(
      ctx,
      ctx.viewer,
      proposal,
      args.workosOrganizationId
    );
    const result = await recordScopeDecision(ctx, {
      actorRoles: ctx.viewer.roles,
      actorWorkosUserId: ctx.viewer.subject,
      contract,
      idempotencyKey: requiredScopeDecisionIdempotencyKey(args.idempotencyKey),
      kind: "borrower_acknowledged",
      proposal,
      revision,
    });
    return scopeDecisionResult(
      result.decision,
      result.effectiveRevisionId,
      result.replayed
    );
}

export async function rejectScopeRevision(
  ctx: MutationCtx & { viewer: AuthorizedViewer },
  args: { idempotencyKey: string; reason: string; revisionId: Id<"submilestoneScopeRevisions">; workosOrganizationId: string }
) {
    const { contract, proposal, revision } =
      await authorizeScopeDecisionRevision(
        ctx,
        ctx.viewer,
        args.revisionId,
        args.workosOrganizationId
      );
    await assertBorrowerDecisionAuthority(
      ctx,
      ctx.viewer,
      proposal,
      args.workosOrganizationId
    );
    const result = await recordScopeDecision(ctx, {
      actorRoles: ctx.viewer.roles,
      actorWorkosUserId: ctx.viewer.subject,
      contract,
      idempotencyKey: requiredScopeDecisionIdempotencyKey(args.idempotencyKey),
      kind: "borrower_rejected",
      proposal,
      reason: requiredScopeDecisionReason(args.reason, "Borrower rejection"),
      revision,
    });
    return scopeDecisionResult(
      result.decision,
      result.effectiveRevisionId,
      result.replayed
    );
}

export async function approveScopeRevision(
  ctx: MutationCtx & { viewer: AuthorizedViewer },
  args: { idempotencyKey: string; revisionId: Id<"submilestoneScopeRevisions">; workosOrganizationId: string }
) {
    assertLenderAdmin(ctx.viewer);
    const { contract, proposal, revision } =
      await authorizeScopeDecisionRevision(
        ctx,
        ctx.viewer,
        args.revisionId,
        args.workosOrganizationId
      );
    const result = await recordScopeDecision(ctx, {
      actorRoles: ctx.viewer.roles,
      actorWorkosUserId: ctx.viewer.subject,
      contract,
      idempotencyKey: requiredScopeDecisionIdempotencyKey(args.idempotencyKey),
      kind: "lender_admin_approved",
      proposal,
      revision,
    });
    return scopeDecisionResult(
      result.decision,
      result.effectiveRevisionId,
      result.replayed
    );
}

export async function overrideScopeRevision(
  ctx: MutationCtx & { viewer: AuthorizedViewer },
  args: { idempotencyKey: string; reason: string; revisionId: Id<"submilestoneScopeRevisions">; workosOrganizationId: string }
) {
    assertLenderAdmin(ctx.viewer);
    const { contract, proposal, revision } =
      await authorizeScopeDecisionRevision(
        ctx,
        ctx.viewer,
        args.revisionId,
        args.workosOrganizationId
      );
    const idempotencyKey = requiredScopeDecisionIdempotencyKey(
      args.idempotencyKey
    );
    const reason = requiredScopeDecisionReason(args.reason, "Scope override");
    const actorRoles = normalizeScopeDecisionActorRoles(ctx.viewer.roles);
    const existing = await existingScopeDecisionForKey(
      ctx,
      contract._id,
      idempotencyKey
    );
    const payload = {
      actorRoles,
      actorWorkosUserId: ctx.viewer.subject,
      kind: "admin_override" as const,
      reason,
      revisionId: revision._id,
      version: revision.version,
    };
    if (existing) {
      assertScopeDecisionIdempotencyPayload(existing, payload);
      return {
        bypassedDecisionKinds: existing.bypassedDecisionKinds ?? [],
        decisionId: existing._id,
        effectiveRevisionId:
          existing.newEffectiveRevisionId ??
          existing.priorEffectiveRevisionId ??
          null,
        kind: "admin_override" as const,
        replayed: true,
      };
    }

    const decisions = await loadScopeRevisionDecisions(ctx, revision._id);
    const gate = scopeDecisionKindsForGate(proposal, decisions);
    const priorEffectiveRevisionId = contract.effectiveRevisionId;
    const now = Date.now();
    const effectiveRevisionId = await advanceEffectiveScopeRevision(
      ctx,
      contract,
      revision,
      true,
      now
    );
    const decisionId = await ctx.db.insert("submilestoneScopeDecisions", {
      actorRoles,
      actorWorkosUserId: ctx.viewer.subject,
      brokerageId: contract.brokerageId,
      bypassedDecisionKinds: gate.missing,
      contractId: contract._id,
      createdAt: now,
      idempotencyKey,
      kind: "admin_override",
      organizationId: contract.organizationId,
      ...(priorEffectiveRevisionId ? { priorEffectiveRevisionId } : {}),
      ...(effectiveRevisionId &&
      effectiveRevisionId !== priorEffectiveRevisionId
        ? { newEffectiveRevisionId: effectiveRevisionId }
        : {}),
      proposalId: contract.proposalId,
      proposalSubmilestoneId: contract.proposalSubmilestoneId,
      reason,
      revisionId: revision._id,
      version: revision.version,
    });
    const decision = await ctx.db.get(decisionId);
    if (!decision) {
      throw new Error("Scope override decision was not persisted.");
    }
    const warnings = gate.missing.map((kind) => `bypassed:${kind}`);
    await recordScopeDecisionAudit(ctx, {
      actorRoles,
      actorWorkosUserId: ctx.viewer.subject,
      brokerageId: contract.brokerageId,
      command: "overrideSubmilestoneScopeRevision",
      contract,
      entityId: String(revision._id),
      eventType: "submilestone_scope_revision.admin_override",
      newState: JSON.stringify({
        bypassedDecisionKinds: gate.missing,
        decisionId: String(decisionId),
        effectiveRevisionId: effectiveRevisionId
          ? String(effectiveRevisionId)
          : null,
        ...(effectiveRevisionId &&
        effectiveRevisionId !== priorEffectiveRevisionId
          ? { newEffectiveRevisionId: String(effectiveRevisionId) }
          : {}),
        revisionId: String(revision._id),
        version: revision.version,
      }),
      priorState: JSON.stringify({
        effectiveRevisionId: priorEffectiveRevisionId
          ? String(priorEffectiveRevisionId)
          : null,
        priorEffectiveRevisionId: priorEffectiveRevisionId
          ? String(priorEffectiveRevisionId)
          : null,
        proposalStatus: proposal.status,
      }),
      reason,
      warnings,
    });
    return {
      bypassedDecisionKinds: gate.missing,
      decisionId,
      effectiveRevisionId,
      kind: "admin_override" as const,
      replayed: false,
    };
}
