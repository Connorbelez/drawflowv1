import {
  type ActiveBuildAuthorization,
  authorizeActiveBuildAccess,
  selectActiveBuildAuthorizationCapacity,
} from "../activeBuildAccess";
import { type AuthorizedViewer } from "../authz";
import { canReadCollaborationPost } from "../build_collaboration_access";
import {
  authorizeActiveBuildCollaborationAccess,
  BUILD_COLLABORATION_UNAVAILABLE_ERROR,
} from "../build_collaboration_rollout";
import { canReadCanonicalMilestoneSubmilestone } from "../build_collaboration_system_event_access";
import type { BuildCollaborationRole } from "../build_collaboration_model";
import type { Doc, Id, QueryCtx } from "../types";
import type {
  CollaborationState,
  WorkspaceContext,
  StrictWorkspaceContext,
} from "./types";
import {
  MAX_BOOTSTRAP_ROWS,
  MAX_COMPANION_CANDIDATES,
} from "./types";

type AuditStateRecord = Record<string, unknown>;

export function parseAuditState(value: string | undefined): unknown {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    // Audit rows are immutable, but a malformed legacy snapshot must not make
    // a canonical workspace query fail. Keep the row visible without trying
    // to infer identity or status from invalid JSON.
    return undefined;
  }
}

function auditStateTouchesSubmilestone(
  value: unknown,
  submilestoneKey: string
): boolean {
  if (Array.isArray(value)) {
    return value.some((entry) =>
      auditStateTouchesSubmilestone(entry, submilestoneKey)
    );
  }
  if (!value || typeof value !== "object") return false;
  const record = value as AuditStateRecord;
  if (record.submilestoneKey === submilestoneKey) return true;
  if (
    Array.isArray(record.submilestoneKeys) &&
    record.submilestoneKeys.some((key) => key === submilestoneKey)
  ) {
    return true;
  }
  return false;
}

export function stringFromState(value: unknown, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const candidate = (value as AuditStateRecord)[key];
  return typeof candidate === "string" && candidate.trim()
    ? candidate.trim()
    : undefined;
}

export function contractorIdFromAuditEvent(ctx: QueryCtx, event: Doc<"auditEvents">) {
  const state = parseAuditState(event.newState);
  const candidate = stringFromState(state, "contractorId");
  return candidate
    ? (ctx.db.normalizeId("contractorProfiles", candidate) ?? undefined)
    : undefined;
}

export async function loadCanonicalPeopleHistoryEvents(
  ctx: QueryCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    milestone: Doc<"buildMilestones">;
    submilestone: Doc<"buildSubmilestones">;
    after?: { createdAt: number; id: string };
  }
): Promise<{
  events: Doc<"auditEvents">[];
  partial: boolean;
}> {
  const rawEvents = await ctx.db
    .query("auditEvents")
    .withIndex("by_entity", (query) =>
      query
        .eq("entityType", "activeBuild")
        .eq("entityId", String(input.authorization.build._id))
    )
    .order("desc")
    .take(MAX_BOOTSTRAP_ROWS * 5 + 1);
  const events = rawEvents
    .filter(
      (event) =>
        event.organizationId === input.authorization.organizationId &&
        event.brokerageId === input.authorization.brokerage._id &&
        event.eventType.startsWith(
          "active_build.contractor.milestone_assignment_"
        ) &&
        [
          parseAuditState(event.newState),
          parseAuditState(event.priorState),
        ].some(
          (state) =>
            auditStateTouchesSubmilestone(state, input.submilestone.key) &&
            stringFromState(state, "milestoneKey") === input.milestone.key
        )
    )
    .sort(compareAuditEventsDescending)
    .filter((event) =>
      input.after ? compareAuditEventKey(event, input.after) < 0 : true
    )
    .slice(0, MAX_BOOTSTRAP_ROWS * 5 + 1);
  return {
    events,
    // The query is intentionally bounded before tenant/sub-milestone
    // filtering. If it reaches the bound, a later matching event may have
    // been excluded by the pre-filter window, so callers must not claim a
    // complete history projection.
    partial: rawEvents.length > MAX_BOOTSTRAP_ROWS * 5,
  };
}

function compareAuditEventKey(
  event: Doc<"auditEvents">,
  cursor: { createdAt: number; id: string }
) {
  if (event.createdAt !== cursor.createdAt) {
    return event.createdAt - cursor.createdAt;
  }
  const eventId = String(event._id);
  if (eventId < cursor.id) return -1;
  if (eventId > cursor.id) return 1;
  return 0;
}

function compareAuditEventsDescending(
  left: Doc<"auditEvents">,
  right: Doc<"auditEvents">
) {
  return compareAuditEventKey(right, {
    createdAt: left.createdAt,
    id: String(left._id),
  });
}

export function viewerCanReadPeopleIdentity(authorization: ActiveBuildAuthorization) {
  return (
    authorization.effectiveRole.role !== "contractor" &&
    authorization.effectiveRole.role !== "homeowner"
  );
}

export function viewerCanReadContractorCandidates(
  authorization: ActiveBuildAuthorization
) {
  // Candidate identities are only needed by roles that can add/remove a
  // canonical milestone assignment. Lender/broker viewers can inspect the
  // current assignment, but must not receive a directory of contractor
  // profiles that they cannot assign.
  return (
    authorization.effectiveRole.role === "admin" ||
    authorization.effectiveRole.role === "builder" ||
    authorization.effectiveRole.role === "builder-staff"
  );
}

export function viewerCanReadMaterialCosts(authorization: ActiveBuildAuthorization) {
  return (
    authorization.effectiveRole.role !== "contractor" &&
    authorization.effectiveRole.role !== "homeowner"
  );
}

function isWorkspaceAccessDenial(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }
  return (
    error.message.startsWith("Forbidden:") ||
    error.message === BUILD_COLLABORATION_UNAVAILABLE_ERROR ||
    error.message ===
      "Build Collaboration is temporarily frozen for a rollback rehearsal snapshot."
  );
}

/**
 * Canonical-first reader used by the Overview/Evidence/People/Materials
 * surfaces. Canonical facts are authorized directly from the active Build;
 * generated collaboration companions are an optional, explicitly degraded
 * projection and never gate the canonical target.
 */
export async function resolveCanonicalBuildSubmilestoneWorkspaceContext(
  ctx: QueryCtx & { viewer: AuthorizedViewer },
  args: {
    buildId: Id<"activeBuilds">;
    buildSubmilestoneId: Id<"buildSubmilestones">;
    companionActionItemId?: Id<"buildActionItems">;
    organizationId: string;
    viewerCapacity?: BuildCollaborationRole;
  }
): Promise<{ state: "revoked" } | ({ state: "visible" } & WorkspaceContext)> {
  let authorization: ActiveBuildAuthorization;
  try {
    authorization = selectActiveBuildAuthorizationCapacity(
      await authorizeActiveBuildAccess(ctx, args),
      args.viewerCapacity
    );
  } catch (error) {
    if (isWorkspaceAccessDenial(error)) {
      return { state: "revoked" };
    }
    throw error;
  }
  const submilestone = await ctx.db.get(args.buildSubmilestoneId);
  if (!submilestone) return { state: "revoked" };
  const milestone = await ctx.db.get(submilestone.buildMilestoneId);
  if (
    !milestone ||
    submilestone.buildId !== authorization.build._id ||
    submilestone.organizationId !== authorization.organizationId ||
    submilestone.brokerageId !== authorization.brokerage._id ||
    milestone.buildId !== authorization.build._id ||
    milestone.organizationId !== authorization.organizationId ||
    milestone.brokerageId !== authorization.brokerage._id ||
    submilestone.milestoneKey !== milestone.key
  ) {
    return { state: "revoked" };
  }
  const canRead = await canReadCanonicalWorkspaceTarget(ctx, {
    authorization,
    milestone,
    submilestone,
  });
  if (!canRead) return { state: "revoked" };

  const collaboration = await resolveOptionalCompanion(ctx, {
    authorization,
    args,
    milestone,
    submilestone,
  });
  return {
    authorization,
    collaboration: collaboration.state,
    companion: collaboration.companion,
    milestone,
    post: collaboration.post,
    state: "visible",
    submilestone,
  };
}

async function canReadCanonicalWorkspaceTarget(
  ctx: QueryCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    milestone: Doc<"buildMilestones">;
    submilestone: Doc<"buildSubmilestones">;
  }
) {
  if (input.authorization.effectiveRole.role === "homeowner") {
    // Homeowner read access is an explicit active Build audience grant. A
    // membership or token role alone never widens this projection.
    return input.authorization.participants.some(
      (participant) =>
        participant.workosUserId === input.authorization.viewer.subject &&
        participant.role === "homeowner" &&
        participant.source === "grant"
    );
  }
  return canReadCanonicalMilestoneSubmilestone(ctx, {
    build: input.authorization.build,
    milestone: input.milestone,
    role: input.authorization.effectiveRole.role,
    submilestone: input.submilestone,
    workosUserId: input.authorization.viewer.subject,
  });
}

async function resolveOptionalCompanion(
  ctx: QueryCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    args: { companionActionItemId?: Id<"buildActionItems"> };
    milestone: Doc<"buildMilestones">;
    submilestone: Doc<"buildSubmilestones">;
  }
): Promise<{
  companion?: Doc<"buildActionItems">;
  post?: Doc<"buildCollaborationPosts">;
  state: CollaborationState;
}> {
  const tenant = await ctx.db
    .query("buildCollaborationTenantSettings")
    .withIndex("by_organizationId", (query) =>
      query.eq("organizationId", input.authorization.organizationId)
    )
    .unique();
  if (tenant?.status !== "active") {
    return {
      state: {
        code: "COLLABORATION_TENANT_INACTIVE",
        message:
          "Collaboration is unavailable; canonical facts remain readable.",
        state: "degraded",
      },
    };
  }
  const candidates = await ctx.db
    .query("buildActionItems")
    .withIndex("by_canonicalBuildSubmilestoneId_and_systemMode", (query) =>
      query
        .eq("canonicalBuildSubmilestoneId", input.submilestone._id)
        .eq("systemMode", "generated_milestone_submilestone")
    )
    .take(MAX_COMPANION_CANDIDATES + 1);
  if (candidates.length > MAX_COMPANION_CANDIDATES) {
    return {
      state: {
        code: "COMPANION_AMBIGUOUS",
        message: "Collaboration companion binding is ambiguous.",
        state: "degraded",
      },
    };
  }
  const eligible = candidates.filter((candidate) =>
    input.submilestone.planningState === "superseded"
      ? candidate.canonicalPlanningState === "superseded" ||
        candidate.canonicalCompanionDisposition === "historical"
      : candidate.canonicalPlanningState !== "superseded" &&
        (candidate.canonicalCompanionDisposition === undefined ||
          candidate.canonicalCompanionDisposition === "active")
  );
  if (eligible.length === 0) {
    return {
      state: {
        code: "COMPANION_MISSING",
        message:
          "Collaboration companion is missing; canonical facts remain readable.",
        state: "degraded",
      },
    };
  }
  if (eligible.length !== 1) {
    return {
      state: {
        code: "COMPANION_DUPLICATE",
        message: "Multiple collaboration companions are bound to this target.",
        state: "degraded",
      },
    };
  }
  const companion = eligible[0]!;
  if (
    input.args.companionActionItemId &&
    input.args.companionActionItemId !== companion._id
  ) {
    const requestedCompanion = await ctx.db.get(
      input.args.companionActionItemId
    );
    const validatesHistoricalIdentity =
      requestedCompanion?.systemMode === "generated_milestone_submilestone" &&
      requestedCompanion.historicalCanonicalBuildSubmilestoneId ===
        input.submilestone._id &&
      requestedCompanion.canonicalCompanionSurvivorId === companion._id &&
      requestedCompanion.buildId === input.authorization.build._id &&
      requestedCompanion.organizationId ===
        input.authorization.organizationId &&
      requestedCompanion.brokerageId === input.authorization.brokerage._id &&
      requestedCompanion.canonicalBuildMilestoneId === input.milestone._id;
    if (!validatesHistoricalIdentity) {
      return {
        state: {
          code: "COMPANION_ID_MISMATCH",
          message:
            "The requested companion does not match the canonical target.",
          state: "degraded",
        },
      };
    }
  }
  const post = await ctx.db.get(companion.originatingPostId);
  if (
    !post ||
    companion.buildId !== input.authorization.build._id ||
    companion.organizationId !== input.authorization.organizationId ||
    companion.brokerageId !== input.authorization.brokerage._id ||
    companion.canonicalBuildMilestoneId !== input.milestone._id ||
    post.buildId !== input.authorization.build._id ||
    post.organizationId !== input.authorization.organizationId ||
    post.brokerageId !== input.authorization.brokerage._id ||
    post.canonicalBuildMilestoneId !== input.milestone._id ||
    post.systemPostKind !== "milestone" ||
    !(await canReadCollaborationPost(ctx, input.authorization, post))
  ) {
    return {
      state: {
        code: "COMPANION_BINDING_INVALID",
        message:
          "Collaboration companion binding is malformed; canonical facts remain readable.",
        state: "degraded",
      },
    };
  }
  return { companion, post, state: { state: "available" } };
}

export async function resolveBuildSubmilestoneWorkspaceContext(
  ctx: QueryCtx & { viewer: AuthorizedViewer },
  args: {
    buildId: Id<"activeBuilds">;
    buildSubmilestoneId: Id<"buildSubmilestones">;
    companionActionItemId?: Id<"buildActionItems">;
    organizationId: string;
    viewerCapacity?: BuildCollaborationRole;
  }
): Promise<
  | { state: "revoked" }
  | { code: string; message: string; state: "integrity_error" }
  | ({ state: "visible" } & StrictWorkspaceContext)
> {
  let authorization: ActiveBuildAuthorization;
  try {
    authorization = selectActiveBuildAuthorizationCapacity(
      await authorizeActiveBuildCollaborationAccess(ctx, args),
      args.viewerCapacity
    );
  } catch (error) {
    if (isWorkspaceAccessDenial(error)) {
      return { state: "revoked" };
    }
    throw error;
  }
  const submilestone = await ctx.db.get(args.buildSubmilestoneId);
  if (!submilestone) {
    return { state: "revoked" };
  }
  const milestone = await ctx.db.get(submilestone.buildMilestoneId);
  if (
    !milestone ||
    submilestone.buildId !== authorization.build._id ||
    submilestone.organizationId !== authorization.organizationId ||
    submilestone.brokerageId !== authorization.brokerage._id ||
    milestone.buildId !== authorization.build._id ||
    milestone.organizationId !== authorization.organizationId ||
    milestone.brokerageId !== authorization.brokerage._id ||
    submilestone.milestoneKey !== milestone.key
  ) {
    return { state: "revoked" };
  }
  const canRead = await canReadCanonicalMilestoneSubmilestone(ctx, {
    build: authorization.build,
    milestone,
    role: authorization.effectiveRole.role,
    submilestone,
    workosUserId: authorization.viewer.subject,
  });
  if (!canRead) {
    return { state: "revoked" };
  }
  const candidates = await ctx.db
    .query("buildActionItems")
    .withIndex("by_canonicalBuildSubmilestoneId_and_systemMode", (query) =>
      query
        .eq("canonicalBuildSubmilestoneId", submilestone._id)
        .eq("systemMode", "generated_milestone_submilestone")
    )
    .take(MAX_COMPANION_CANDIDATES + 1);
  if (candidates.length > MAX_COMPANION_CANDIDATES) {
    return {
      code: "COMPANION_AMBIGUOUS",
      message:
        "Too many collaboration companions are bound to this Sub-milestone.",
      state: "integrity_error",
    };
  }
  const eligible = candidates.filter((candidate) =>
    submilestone.planningState === "superseded"
      ? candidate.canonicalPlanningState === "superseded" ||
        candidate.canonicalCompanionDisposition === "historical"
      : candidate.canonicalPlanningState !== "superseded" &&
        (candidate.canonicalCompanionDisposition === undefined ||
          candidate.canonicalCompanionDisposition === "active")
  );
  if (eligible.length !== 1) {
    return {
      code: eligible.length === 0 ? "COMPANION_MISSING" : "COMPANION_DUPLICATE",
      message:
        eligible.length === 0
          ? "The collaboration companion is unavailable for this Sub-milestone."
          : "More than one collaboration companion is bound to this Sub-milestone.",
      state: "integrity_error",
    };
  }
  const companion = eligible[0]!;
  if (
    args.companionActionItemId &&
    args.companionActionItemId !== companion._id
  ) {
    const requestedCompanion = await ctx.db.get(args.companionActionItemId);
    const validatesHistoricalIdentity =
      requestedCompanion?.systemMode === "generated_milestone_submilestone" &&
      requestedCompanion.historicalCanonicalBuildSubmilestoneId ===
        submilestone._id &&
      requestedCompanion.canonicalCompanionSurvivorId === companion._id &&
      requestedCompanion.buildId === authorization.build._id &&
      requestedCompanion.organizationId === authorization.organizationId &&
      requestedCompanion.brokerageId === authorization.brokerage._id &&
      requestedCompanion.canonicalBuildMilestoneId === milestone._id;
    if (!validatesHistoricalIdentity) {
      return {
        code: "COMPANION_ID_MISMATCH",
        message:
          "The requested companion does not match the canonical Sub-milestone.",
        state: "integrity_error",
      };
    }
  }
  const post = await ctx.db.get(companion.originatingPostId);
  if (
    !post ||
    companion.buildId !== authorization.build._id ||
    companion.organizationId !== authorization.organizationId ||
    companion.brokerageId !== authorization.brokerage._id ||
    companion.canonicalBuildMilestoneId !== milestone._id ||
    post.buildId !== authorization.build._id ||
    post.organizationId !== authorization.organizationId ||
    post.brokerageId !== authorization.brokerage._id ||
    post.canonicalBuildMilestoneId !== milestone._id ||
    post.systemPostKind !== "milestone" ||
    !(await canReadCollaborationPost(ctx, authorization, post))
  ) {
    return {
      code: "COMPANION_BINDING_INVALID",
      message:
        "The collaboration companion binding is malformed or unavailable.",
      state: "integrity_error",
    };
  }
  return {
    authorization,
    companion,
    collaboration: { state: "available" },
    milestone,
    post,
    state: "visible",
    submilestone,
  };
}
