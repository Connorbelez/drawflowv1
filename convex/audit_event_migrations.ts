import { internal } from "./_generated/api.js";
import type { Doc, Id, MutationCtx } from "./types";
import { migrations } from "./migrations";

type AuditResourceType =
  | "milestone"
  | "submilestone"
  | "draw"
  | "evidence"
  | "material"
  | "siteVisit"
  | "contractor"
  | "capitalEvent"
  | "reminder";

type CanonicalAuditEntity = {
  brokerageId: Id<"brokerages">;
  buildId: Id<"activeBuilds">;
  entityId: string;
  entityType: string;
  organizationId: string;
  resourceType: AuditResourceType | undefined;
};

const AUDIT_RESOURCE_TYPES = new Set<AuditResourceType>([
  "milestone",
  "submilestone",
  "draw",
  "evidence",
  "material",
  "siteVisit",
  "contractor",
  "capitalEvent",
  "reminder",
]);

const CHILD_SPECIALIZED_RESOURCE_TYPES = new Set<AuditResourceType>([
  "draw",
  "evidence",
  "material",
  "siteVisit",
  "contractor",
  "capitalEvent",
  "reminder",
]);

// Historical child audit rows were not always stamped with resourceType. Keep
// this recovery table deliberately closed: a child row is classified only when
// the exact producer command/event pair is known. Unknown child rows remain
// unindexed instead of being broadened into a generic lifecycle stream.
const HISTORICAL_CHILD_RESOURCE_TYPES: Readonly<Record<string, AuditResourceType>> = {
  "recordMilestoneStart|submilestone.started": "submilestone",
  "recordMilestoneStart|milestone.started": "submilestone",
  "correctMilestoneStart|submilestone.start_corrected": "submilestone",
  "correctMilestoneStart|milestone.start_corrected": "submilestone",
  "retractMilestoneStart|submilestone.start_retracted": "submilestone",
  "retractMilestoneStart|milestone.start_retracted": "submilestone",
  "updateActiveBuildSubmilestoneExecution|active_build.submilestone.execution_updated":
    "submilestone",
  "updateActiveBuildSubmilestoneProgress|active_build.submilestone.progress_updated":
    "submilestone",
  "addActiveBuildSubmilestoneEvidence|active_build.submilestone.evidence_added":
    "evidence",
  "freezeActiveSubmilestoneEvidencePackage|active_build.submilestone.evidence_package_frozen":
    "evidence",
  "freezeActiveBuildSubmilestoneEvidencePackage|active_build.submilestone.evidence_package_frozen":
    "evidence",
  "ensureActiveSubmilestoneEvidencePackageDraft|active_build.submilestone.evidence_package_revision_superseded":
    "evidence",
  "configureActiveBuildSubmilestoneEvidenceRequirements|active_build.submilestone.evidence_requirements_configured":
    "evidence",
  "submitActiveBuildSubmilestoneCompletionForReview|active_build.submilestone.completion_submitted_for_review":
    "evidence",
  "createActiveBuildTimelineEvidenceAsset|active_build.evidence.created":
    "evidence",
  "promoteActiveBuildDiscussionAttachmentToEvidence|active_build.evidence.promoted":
    "evidence",
  "updateActiveBuildTimelineEvidenceAsset|active_build.evidence.updated":
    "evidence",
  "deleteActiveBuildTimelineEvidenceAsset|active_build.evidence.deleted":
    "evidence",
  "recommendActiveBuildSubmilestoneReview|active_build.submilestone.review.recommended":
    "evidence",
  "requestActiveBuildSubmilestoneChanges|active_build.submilestone.review.changes_requested":
    "evidence",
  "approveActiveBuildSubmilestone|active_build.submilestone.review.approved":
    "evidence",
  "retractActiveBuildSubmilestoneApproval|active_build.submilestone.review.retracted":
    "evidence",
  "recommendActiveBuildSubmilestoneReview|active_build.submilestone.site_visit.requirement_reopened":
    "siteVisit",
  "waiveActiveBuildSubmilestoneSiteVisit|active_build.submilestone.site_visit.waived":
    "siteVisit",
  "createActiveBuildCostItem|active_build.cost_item.created": "material",
  "updateActiveBuildCostItem|active_build.cost_item.updated": "material",
  "deleteActiveBuildCostItem|active_build.cost_item.deleted": "material",
  "assignActiveBuildContractorToMilestone|active_build.contractor.milestone_assignment_created":
    "contractor",
  "assignActiveBuildContractorToMilestone|active_build.contractor.milestone_assignment_updated":
    "contractor",
  "assignActiveBuildContractorToMilestone|active_build.contractor.milestone_assignment_removed":
    "contractor",
  "removeActiveBuildContractorFromMilestone|active_build.contractor.milestone_assignment_removed":
    "contractor",
  "recordContractorQualityRating|active_build.contractor.quality_rated":
    "contractor",
  "scheduleActiveBuildSiteVisit|site_visit.scheduled": "siteVisit",
  "rescheduleActiveBuildSiteVisit|site_visit.rescheduled": "siteVisit",
  "cancelActiveBuildSiteVisit|site_visit.cancelled": "siteVisit",
  "assignActiveBuildSiteVisit|active_build.site_visit.requested": "siteVisit",
  "recordActiveBuildSiteVisit|active_build.site_visit.recorded": "siteVisit",
  "requestActiveBuildSiteVisitReplacementLink|active_build.site_visit.replacement_link_requested":
    "siteVisit",
  "submitActiveBuildTokenizedSiteVisitReport|active_build.site_visit.token_report_submitted":
    "siteVisit",
  "assistant.commit.schedule_active_build_site_visit|assistant.active_build.site_visit.scheduled":
    "siteVisit",
  "assistant.commit.reschedule_active_build_site_visit|assistant.active_build.site_visit.rescheduled":
    "siteVisit",
  "assistant.commit.cancel_active_build_site_visit|assistant.active_build.site_visit.cancelled":
    "siteVisit",
};

/**
 * Backfills the Build/resource identity required by the bounded Event Rail
 * indexes. The migration only follows canonical IDs and verifies both tenant
 * fields before writing; display keys and malformed cross-tenant pointers are
 * intentionally left fail-closed for the compatibility reader.
 */
export const backfillAuditEventBuildId = migrations.define({
  batchSize: 25,
  table: "auditEvents",
  migrateOne: async (ctx, event: Doc<"auditEvents">) => {
    const resolved = await resolveCanonicalAuditEntity(ctx, event);
    if (!resolved) {
      return;
    }
    // Some historical child lifecycle rows were emitted as activeBuild. Repair
    // that identity only when the payload carries a validated canonical child
    // ID; display keys and ambiguous rows remain unindexed.
    const repairedChild =
      resolved.entityType === "activeBuild"
        ? await resolvePayloadSubmilestone(ctx, event, {
            brokerageId: resolved.brokerageId,
            buildId: resolved.buildId,
            organizationId: resolved.organizationId,
          })
        : undefined;
    const unresolvedChildPayload =
      resolved.entityType === "activeBuild" &&
      signalsChildIdentity(event) &&
      repairedChild === undefined;
    const targetResourceType = repairedChild
      ? childResourceType(event)
      : unresolvedChildPayload
        ? undefined
        : resolved.resourceType;
    const patch: Partial<Doc<"auditEvents">> = {};
    if (event.buildId === undefined) {
      patch.buildId = resolved.buildId;
    } else if (event.buildId !== resolved.buildId) {
      // Never relabel a row that already points at another Build.
      return;
    }
    if (event.resourceType !== targetResourceType) {
      patch.resourceType = targetResourceType;
    }
    if (repairedChild) {
      patch.entityType = "buildSubmilestone";
      patch.entityId = String(repairedChild._id);
      patch.resourceType = targetResourceType;
    }

    return Object.keys(patch).length > 0 ? patch : undefined;
  },
});

export const runAuditEventBuildIdBackfill = migrations.runner([
  internal.audit_event_migrations.backfillAuditEventBuildId,
]);

async function resolveCanonicalAuditEntity(
  ctx: Pick<MutationCtx, "db">,
  event: Doc<"auditEvents">,
): Promise<CanonicalAuditEntity | undefined> {
  let resolved:
    | {
        brokerageId: Id<"brokerages">;
        buildId: Id<"activeBuilds">;
        entityId: string;
        entityType: string;
        organizationId: string;
        resourceType: AuditResourceType | undefined;
      }
    | undefined;

  switch (event.entityType) {
    case "activeBuild": {
      const id = ctx.db.normalizeId("activeBuilds", event.entityId);
      const build = id ? await ctx.db.get(id) : undefined;
      if (build) {
        resolved = {
          brokerageId: build.brokerageId,
          buildId: build._id,
          entityId: String(build._id),
          entityType: "activeBuild",
          organizationId: build.organizationId,
          resourceType: deriveResourceType(event),
        };
      }
      break;
    }
    case "buildMilestone":
    case "milestone": {
      const id = ctx.db.normalizeId("buildMilestones", event.entityId);
      const milestone = id ? await ctx.db.get(id) : undefined;
      if (milestone) {
        const build = await ctx.db.get(milestone.buildId);
        if (build) {
          resolved = {
            brokerageId: build.brokerageId,
            buildId: build._id,
            entityId: String(milestone._id),
            entityType: event.entityType,
            organizationId: build.organizationId,
            resourceType: "milestone",
          };
        }
      }
      break;
    }
    case "buildSubmilestone":
    case "submilestone": {
      const id = ctx.db.normalizeId("buildSubmilestones", event.entityId);
      const submilestone = id ? await ctx.db.get(id) : undefined;
      if (submilestone) {
        const build = await ctx.db.get(submilestone.buildId);
        if (build) {
          resolved = {
            brokerageId: build.brokerageId,
            buildId: build._id,
            entityId: String(submilestone._id),
            entityType: event.entityType,
            organizationId: build.organizationId,
            resourceType: childResourceType(event),
          };
        }
      }
      break;
    }
    case "activeBuildDrawRequest":
    case "draw": {
      const requestId = ctx.db.normalizeId(
        "activeBuildDrawRequests",
        event.entityId,
      );
      const request = requestId
        ? await ctx.db.get(requestId)
        : undefined;
      if (request) {
        const build = await ctx.db.get(request.buildId);
        if (build) {
          resolved = {
            brokerageId: build.brokerageId,
            buildId: build._id,
            entityId: String(request._id),
            entityType: event.entityType,
            organizationId: build.organizationId,
            resourceType: "draw",
          };
        }
      } else {
        const plannedId = ctx.db.normalizeId(
          "plannedDrawScheduleRows",
          event.entityId,
        );
        const planned = plannedId ? await ctx.db.get(plannedId) : undefined;
        if (planned) {
          const build = await ctx.db.get(planned.buildId);
          if (build) {
            resolved = {
              brokerageId: build.brokerageId,
              buildId: build._id,
              entityId: String(planned._id),
              entityType: "plannedDrawScheduleRow",
              organizationId: build.organizationId,
              resourceType: "draw",
            };
          }
        }
      }
      break;
    }
    case "plannedDrawScheduleRow": {
      const id = ctx.db.normalizeId(
        "plannedDrawScheduleRows",
        event.entityId,
      );
      const planned = id ? await ctx.db.get(id) : undefined;
      if (planned) {
        const build = await ctx.db.get(planned.buildId);
        if (build) {
          resolved = {
            brokerageId: build.brokerageId,
            buildId: build._id,
            entityId: String(planned._id),
            entityType: event.entityType,
            organizationId: build.organizationId,
            resourceType: "draw",
          };
        }
      }
      break;
    }
    case "buildEvidenceAsset":
    case "evidence":
    case "evidencePackage": {
      const id = ctx.db.normalizeId("buildEvidenceAssets", event.entityId);
      const asset = id ? await ctx.db.get(id) : undefined;
      if (asset) {
        const build = await ctx.db.get(asset.buildId);
        if (build) {
          resolved = {
            brokerageId: build.brokerageId,
            buildId: build._id,
            entityId: String(asset._id),
            entityType: event.entityType,
            organizationId: build.organizationId,
            resourceType: "evidence",
          };
        }
      }
      break;
    }
    case "buildSiteVisit":
    case "siteVisit": {
      const id = ctx.db.normalizeId("buildSiteVisits", event.entityId);
      const visit = id ? await ctx.db.get(id) : undefined;
      if (visit) {
        const build = await ctx.db.get(visit.buildId);
        if (build) {
          resolved = {
            brokerageId: build.brokerageId,
            buildId: build._id,
            entityId: String(visit._id),
            entityType: event.entityType,
            organizationId: build.organizationId,
            resourceType: "siteVisit",
          };
        }
      }
      break;
    }
    case "buildCostItem":
    case "material": {
      const id = ctx.db.normalizeId("buildCostItems", event.entityId);
      const item = id ? await ctx.db.get(id) : undefined;
      if (item) {
        const build = await ctx.db.get(item.buildId);
        if (build) {
          resolved = {
            brokerageId: build.brokerageId,
            buildId: build._id,
            entityId: String(item._id),
            entityType: event.entityType,
            organizationId: build.organizationId,
            resourceType: "material",
          };
        }
      }
      break;
    }
    default:
      return undefined;
  }

  if (!resolved) {
    return undefined;
  }
  if (
    event.organizationId !== resolved.organizationId ||
    event.brokerageId !== resolved.brokerageId ||
    (event.buildId !== undefined && event.buildId !== resolved.buildId)
  ) {
    return undefined;
  }
  return resolved;
}

async function resolvePayloadSubmilestone(
  ctx: Pick<MutationCtx, "db">,
  event: Doc<"auditEvents">,
  scope: Pick<CanonicalAuditEntity, "brokerageId" | "buildId" | "organizationId">,
): Promise<Doc<"buildSubmilestones"> | undefined> {
  const payloads = [event.newState, event.priorState].flatMap((state) => {
    if (!state) {
      return [];
    }
    try {
      const parsed: unknown = JSON.parse(state);
      return parsed && typeof parsed === "object"
        ? [parsed as Record<string, unknown>]
        : [];
    } catch {
      return [];
    }
  });

  // milestone_start historically carried only the milestoneStartEvents ID.
  // Resolve that relation first, validating both the event tenant and the
  // canonical child tenant before repairing the audit row.
  for (const payload of payloads) {
    const eventId = payload.eventId;
    if (typeof eventId !== "string") {
      continue;
    }
    const startEventId = ctx.db.normalizeId("milestoneStartEvents", eventId);
    const startEvent = startEventId
      ? await ctx.db.get(startEventId)
      : undefined;
    if (
      !startEvent ||
      startEvent.buildId !== scope.buildId ||
      startEvent.organizationId !== scope.organizationId ||
      startEvent.brokerageId !== scope.brokerageId ||
      !startEvent.buildSubmilestoneId
    ) {
      continue;
    }
    const child = await ctx.db.get(startEvent.buildSubmilestoneId);
    if (isScopedSubmilestone(child, scope)) {
      return child;
    }
  }

  // A subset of historical producers already included the canonical child ID
  // directly in the payload even though the audit entity was still activeBuild.
  for (const payload of payloads) {
    const candidate = payload.buildSubmilestoneId ?? payload.submilestoneId;
    if (typeof candidate !== "string") {
      continue;
    }
    const childId = ctx.db.normalizeId("buildSubmilestones", candidate);
    const child = childId ? await ctx.db.get(childId) : undefined;
    if (isScopedSubmilestone(child, scope)) {
      return child;
    }
  }

  // Older producers carried only display keys. Resolve the selected Build's
  // Milestone by key, then require exactly one child under that concrete
  // Milestone/key pair. Duplicate keys, missing rows, and cross-tenant rows
  // stay fail-closed; no display key is ever cast into a canonical ID.
  const candidates = new Map<string, Doc<"buildSubmilestones">>();
  for (const payload of payloads) {
    const milestoneKey = payload.milestoneKey;
    const submilestoneKey = payload.submilestoneKey;
    if (
      typeof milestoneKey !== "string" ||
      typeof submilestoneKey !== "string" ||
      !milestoneKey.trim() ||
      !submilestoneKey.trim()
    ) {
      continue;
    }
    let milestone: Doc<"buildMilestones"> | null = null;
    try {
      milestone = await ctx.db
        .query("buildMilestones")
        .withIndex("by_build_key", (query) =>
          query.eq("buildId", scope.buildId).eq("key", milestoneKey),
        )
        .unique();
    } catch {
      // Multiple Milestones with the same display key are ambiguous.
      return undefined;
    }
    if (
      !milestone ||
      milestone.organizationId !== scope.organizationId ||
      milestone.brokerageId !== scope.brokerageId
    ) {
      continue;
    }
    const matches = await ctx.db
      .query("buildSubmilestones")
      .withIndex("by_milestone_and_key", (query) =>
        query
          .eq("buildMilestoneId", milestone._id)
          .eq("key", submilestoneKey),
      )
      .take(2);
    if (matches.length !== 1 || !isScopedSubmilestone(matches[0], scope)) {
      if (matches.length > 1) {
        return undefined;
      }
      continue;
    }
    candidates.set(String(matches[0]._id), matches[0]);
  }
  return candidates.size === 1 ? [...candidates.values()][0] : undefined;
}

function isScopedSubmilestone(
  child: Doc<"buildSubmilestones"> | null | undefined,
  scope: Pick<CanonicalAuditEntity, "brokerageId" | "buildId" | "organizationId">,
): child is Doc<"buildSubmilestones"> {
  return Boolean(
    child &&
      child.buildId === scope.buildId &&
      child.organizationId === scope.organizationId &&
      child.brokerageId === scope.brokerageId,
  );
}

function deriveResourceType(
  event: Doc<"auditEvents">,
): AuditResourceType | undefined {
  const signal = `${event.eventType} ${event.command}`.toLowerCase();
  if (signalsChildIdentity(event)) {
    return isChildSpecializedResourceType(event.resourceType)
      ? event.resourceType
      : undefined;
  }
  if (isAuditResourceType(event.resourceType)) {
    return event.resourceType;
  }
  if (signal.includes("site_visit") || signal.includes("site visit")) {
    return "siteVisit";
  }
  if (signal.includes("draw")) {
    return "draw";
  }
  if (signal.includes("evidence") || signal.includes("photo")) {
    return "evidence";
  }
  if (signal.includes("material") || signal.includes("cost_item")) {
    return "material";
  }
  if (signal.includes("assign") || signal.includes("contractor")) {
    return "contractor";
  }
  if (signal.includes("capital")) {
    return "capitalEvent";
  }
  if (signal.includes("reminder")) {
    return "reminder";
  }
  if (
    event.entityType === "buildSubmilestone" ||
    event.entityType === "submilestone"
  ) {
    return "submilestone";
  }
  return "milestone";
}

function isAuditResourceType(
  resourceType: string | undefined,
): resourceType is AuditResourceType {
  return resourceType !== undefined && AUDIT_RESOURCE_TYPES.has(resourceType as AuditResourceType);
}

function isChildSpecializedResourceType(
  resourceType: string | undefined,
): resourceType is AuditResourceType {
  return (
    resourceType !== undefined &&
    CHILD_SPECIALIZED_RESOURCE_TYPES.has(resourceType as AuditResourceType)
  );
}

function childResourceType(
  event: Doc<"auditEvents">,
): AuditResourceType | undefined {
  if (isChildSpecializedResourceType(event.resourceType)) {
    return event.resourceType;
  }
  return HISTORICAL_CHILD_RESOURCE_TYPES[
    `${event.command}|${event.eventType}`
  ];
}

function signalsChildIdentity(event: Doc<"auditEvents">): boolean {
  const signal = `${event.eventType} ${event.command}`.toLowerCase();
  if (signal.includes("submilestone")) {
    return true;
  }
  return [event.newState, event.priorState].some((state) => {
    if (!state) {
      return false;
    }
    try {
      const parsed: unknown = JSON.parse(state);
      if (!parsed || typeof parsed !== "object") {
        return false;
      }
      const payload = parsed as Record<string, unknown>;
      return (
        typeof payload.buildSubmilestoneId === "string" ||
        typeof payload.submilestoneId === "string" ||
        typeof payload.submilestoneKey === "string" ||
        (Array.isArray(payload.submilestoneKeys) &&
          payload.submilestoneKeys.length > 0)
      );
    } catch {
      return false;
    }
  });
}
