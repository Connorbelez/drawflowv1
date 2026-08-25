import type { Doc, Id, QueryCtx } from "../types";
import type { ActiveBuildAuthorization } from "../activeBuildAccess";
import type {
  CollaborationState,
  WorkspaceCollection,
  WorkspaceCollectionArgs,
  WorkspaceCollectionRow,
  WorkspaceCursorDecode,
  WorkspaceQueryContext,
} from "./types";
import {
  DEFAULT_PAGE_SIZE,
  MAX_BOOTSTRAP_ROWS,
  MAX_PAGE_SIZE,
} from "./types";
import {
  contractorIdFromAuditEvent,
  loadCanonicalPeopleHistoryEvents,
  parseAuditState,
  stringFromState,
  viewerCanReadContractorCandidates,
  viewerCanReadMaterialCosts,
  viewerCanReadPeopleIdentity,
} from "./context";
import { resolveCanonicalBuildSubmilestoneWorkspaceContext } from "./context";

export async function loadWorkspaceCollection(
  ctx: WorkspaceQueryContext,
  args: WorkspaceCollectionArgs
) {
  const resolved = await resolveCanonicalBuildSubmilestoneWorkspaceContext(
    ctx,
    args
  );
  if (resolved.state !== "visible") {
    return resolved;
  }
  const { authorization, collaboration, companion, milestone, submilestone } =
    resolved;
  const superseded =
    submilestone.planningState === "superseded" ||
    companion?.canonicalPlanningState === "superseded" ||
    (companion?.canonicalCompanionDisposition !== undefined &&
      companion.canonicalCompanionDisposition !== "active");
  const rows = await loadWorkspaceCollectionRows(ctx, {
    authorization,
    collection: args.collection,
    companion,
    collaboration,
    cursor: args.cursor ?? null,
    limit: normalizeLimit(args.limit),
    milestone,
    submilestone,
  });
  if ("code" in rows) {
    return rows;
  }
  const page = rows.rows.filter(
    (row): row is WorkspaceCollectionRow => row !== null
  );
  return {
    canonicalWorkflowRevision: submilestone.workflowRevision ?? 0,
    collection: args.collection,
    ...(companion ? { companionActionItemId: companion._id } : {}),
    ...(companion ? { companionRevision: companion.currentRevision } : {}),
    collaboration,
    hasMore: rows.hasMore,
    nextCursor: rows.nextCursor,
    page,
    partial: rows.partial || rows.rows.some((row) => row === null),
    state: superseded ? ("superseded" as const) : ("visible" as const),
  };
}

function normalizeLimit(limit: number | undefined) {
  if (limit === undefined || !Number.isFinite(limit)) {
    return DEFAULT_PAGE_SIZE;
  }
  return Math.max(1, Math.min(MAX_PAGE_SIZE, Math.floor(limit)));
}

const WORKSPACE_CURSOR_VERSION = "ws1";

function workspaceCursorMode(
  collection: WorkspaceCollection
): "indexed" | "offset" | "history" {
  if (collection === "materials") {
    return "offset";
  }
  if (collection === "people_history") {
    return "history";
  }
  return "indexed";
}

function encodeWorkspaceCursor(
  collection: WorkspaceCollection,
  mode: "indexed" | "offset" | "history",
  value: string
) {
  return [
    WORKSPACE_CURSOR_VERSION,
    mode,
    collection,
    encodeURIComponent(value),
  ].join("|");
}

function decodeWorkspaceCursor(
  collection: WorkspaceCollection,
  cursor: string | null
): WorkspaceCursorDecode {
  if (cursor === null) return null;
  const parts = cursor.split("|");
  if (parts.length !== 4 || parts[0] !== WORKSPACE_CURSOR_VERSION) {
    return integrityError(
      "INVALID_WORKSPACE_CURSOR",
      "The workspace cursor is malformed or from an older contract."
    );
  }
  const mode = parts[1];
  const cursorCollection = parts[2];
  const expectedMode = workspaceCursorMode(collection);
  if (cursorCollection !== collection || mode !== expectedMode) {
    return integrityError(
      "WORKSPACE_CURSOR_MISMATCH",
      "The workspace cursor belongs to a different collection."
    );
  }
  let value: string;
  try {
    value = decodeURIComponent(parts[3]);
  } catch {
    return integrityError(
      "INVALID_WORKSPACE_CURSOR",
      "The workspace cursor value is malformed."
    );
  }
  if (expectedMode === "offset") {
    if (!/^(0|[1-9][0-9]*)$/.test(value)) {
      return integrityError(
        "INVALID_WORKSPACE_CURSOR",
        "The offset workspace cursor is invalid."
      );
    }
    const offset = Number(value);
    if (!Number.isSafeInteger(offset)) {
      return integrityError(
        "INVALID_WORKSPACE_CURSOR",
        "The offset workspace cursor is out of range."
      );
    }
    return { mode: "offset", offset };
  }
  if (expectedMode === "history") {
    let decoded: unknown;
    try {
      decoded = JSON.parse(value) as unknown;
    } catch {
      return integrityError(
        "INVALID_WORKSPACE_CURSOR",
        "The people history workspace cursor is malformed."
      );
    }
    if (
      !decoded ||
      typeof decoded !== "object" ||
      Array.isArray(decoded) ||
      typeof (decoded as { createdAt?: unknown }).createdAt !== "number" ||
      !Number.isFinite((decoded as { createdAt: number }).createdAt) ||
      typeof (decoded as { id?: unknown }).id !== "string" ||
      !(decoded as { id: string }).id
    ) {
      return integrityError(
        "INVALID_WORKSPACE_CURSOR",
        "The people history workspace cursor is invalid."
      );
    }
    return {
      mode: "history",
      createdAt: (decoded as { createdAt: number }).createdAt,
      id: (decoded as { id: string }).id,
    };
  }
  if (!value) {
    return integrityError(
      "INVALID_WORKSPACE_CURSOR",
      "The indexed workspace cursor is empty."
    );
  }
  return { mode: "indexed", cursor: value };
}

function integrityError(code: string, message: string) {
  return { code, message, state: "integrity_error" as const };
}

function validateBootstrapProjectionScope(input: {
  authorization: ActiveBuildAuthorization;
  milestone: Doc<"buildMilestones">;
  packageItems: Doc<"buildSubmilestoneEvidencePackageItems">[];
  packageRevision: Doc<"buildSubmilestoneEvidencePackageRevisions"> | null;
  proposalSubmilestone: Doc<"proposalSubmilestones"> | null;
  assignments: Doc<"milestoneContractorAssignments">[];
  materialRows: Doc<"buildCostItems">[];
  requirements: Doc<"buildSubmilestoneEvidenceRequirements">[];
  siteVisitRequirement: Doc<"buildSubmilestoneSiteVisitRequirements"> | null;
  submilestone: Doc<"buildSubmilestones">;
}) {
  const inScope = (record: {
    brokerageId: Id<"brokerages">;
    buildId: Id<"activeBuilds">;
    buildMilestoneId: Id<"buildMilestones">;
    buildSubmilestoneId: Id<"buildSubmilestones">;
    organizationId: string;
  }) =>
    record.buildId === input.authorization.build._id &&
    record.organizationId === input.authorization.organizationId &&
    record.brokerageId === input.authorization.brokerage._id &&
    record.buildMilestoneId === input.milestone._id &&
    record.buildSubmilestoneId === input.submilestone._id;
  if (
    input.proposalSubmilestone === null ||
    (input.submilestone.evidencePackageRevisionId !== undefined &&
      input.packageRevision === null) ||
    (input.packageRevision &&
      input.packageRevision._id !==
        input.submilestone.evidencePackageRevisionId) ||
    (input.submilestone.siteVisitRequirementId !== undefined &&
      input.siteVisitRequirement === null) ||
    (input.siteVisitRequirement &&
      input.siteVisitRequirement._id !==
        input.submilestone.siteVisitRequirementId) ||
    (input.packageRevision && !inScope(input.packageRevision)) ||
    (input.siteVisitRequirement && !inScope(input.siteVisitRequirement)) ||
    input.requirements.some((record) => !inScope(record)) ||
    input.packageItems.some(
      (record) =>
        !inScope(record) ||
        record.packageRevisionId !== input.packageRevision?._id
    ) ||
    (input.proposalSubmilestone !== null &&
      (input.proposalSubmilestone.organizationId !==
        input.authorization.organizationId ||
        input.proposalSubmilestone.brokerageId !==
          input.authorization.brokerage._id ||
        input.proposalSubmilestone.proposalId !==
          input.authorization.proposal._id ||
        input.proposalSubmilestone.proposalMilestoneId !==
          input.milestone.proposalMilestoneId ||
        input.proposalSubmilestone.key !== input.submilestone.key)) ||
    input.assignments.some(
      (record) =>
        !(
          record.buildId === input.authorization.build._id &&
          record.organizationId === input.authorization.organizationId &&
          record.brokerageId === input.authorization.brokerage._id
        ) ||
        record.buildMilestoneId !== input.milestone._id ||
        record.buildSubmilestoneId !== input.submilestone._id ||
        record.milestoneKey !== input.milestone.key ||
        record.submilestoneKey !== input.submilestone.key
    ) ||
    input.materialRows
      .filter(
        (record) =>
          record.budgetSubmilestoneKey === input.submilestone.key ||
          record.relevantSubmilestoneKeys.includes(input.submilestone.key)
      )
      .some(
        (record) =>
          !(
            record.buildId === input.authorization.build._id &&
            record.organizationId === input.authorization.organizationId &&
            record.brokerageId === input.authorization.brokerage._id
          ) ||
          record.buildMilestoneId !== input.milestone._id ||
          !(
            record.budgetSubmilestoneKey === input.submilestone.key ||
            record.relevantSubmilestoneKeys.includes(input.submilestone.key)
          )
      )
  ) {
    return integrityError(
      "CANONICAL_PROJECTION_SCOPE_INVALID",
      "A canonical Sub-milestone projection is outside the authorized Build scope."
    );
  }
  return null;
}

async function loadWorkspaceCollectionRows(
  ctx: QueryCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    collection: WorkspaceCollection;
    companion?: Doc<"buildActionItems">;
    collaboration: CollaborationState;
    cursor: string | null;
    limit: number;
    milestone: Doc<"buildMilestones">;
    submilestone: Doc<"buildSubmilestones">;
  }
): Promise<
  | { state: "integrity_error"; code: string; message: string }
  | {
      hasMore: boolean;
      nextCursor?: string;
      rows: Array<WorkspaceCollectionRow | null>;
      partial: boolean;
    }
> {
  const {
    authorization,
    collection,
    companion,
    collaboration,
    cursor,
    limit,
    milestone,
    submilestone,
  } = input;
  const canonicalScope = (record: {
    brokerageId: Id<"brokerages">;
    buildId: Id<"activeBuilds">;
    organizationId: string;
  }) =>
    record.buildId === authorization.build._id &&
    record.organizationId === authorization.organizationId &&
    record.brokerageId === authorization.brokerage._id;
  const companionScope = (record: {
    actionItemId: Id<"buildActionItems">;
    brokerageId: Id<"brokerages">;
    buildId: Id<"activeBuilds">;
    organizationId: string;
  }) =>
    Boolean(companion) &&
    canonicalScope(record) &&
    record.actionItemId === companion?._id;
  let rows: Array<WorkspaceCollectionRow | null> = [];
  let hasMore = false;
  let nextCursor: string | undefined;
  let partial = false;
  const decodedCursor = decodeWorkspaceCursor(collection, cursor);
  if (decodedCursor && "state" in decodedCursor) {
    return decodedCursor;
  }
  const indexedCursor =
    decodedCursor?.mode === "indexed" ? decodedCursor.cursor : null;
  const offset = decodedCursor?.mode === "offset" ? decodedCursor.offset : 0;
  let historyCursor: { createdAt: number; id: string } | undefined;
  if (decodedCursor?.mode === "history") {
    const cursorId = ctx.db.normalizeId("auditEvents", decodedCursor.id);
    if (!cursorId) {
      return integrityError(
        "INVALID_WORKSPACE_CURSOR",
        "The people history workspace cursor references an invalid audit event."
      );
    }
    historyCursor = {
      createdAt: decodedCursor.createdAt,
      id: String(cursorId),
    };
  }
  const applyIndexedPagination = (page: {
    continueCursor: string;
    isDone: boolean;
  }) => {
    hasMore = !page.isDone;
    nextCursor = page.isDone
      ? undefined
      : encodeWorkspaceCursor(collection, "indexed", page.continueCursor);
  };

  if (
    collaboration.state === "degraded" &&
    collection.startsWith("collaboration_")
  ) {
    return integrityError(
      collaboration.code ?? "COLLABORATION_DEGRADED",
      collaboration.message ?? "Collaboration companion is unavailable."
    );
  }
  if (!companion && collection.startsWith("collaboration_")) {
    return integrityError(
      "COLLABORATION_COMPANION_MISSING",
      "Collaboration data is unavailable for this canonical target."
    );
  }

  if (collection === "evidence_requirements") {
    const result = await ctx.db
      .query("buildSubmilestoneEvidenceRequirements")
      .withIndex("by_submilestone", (query) =>
        query.eq("buildSubmilestoneId", submilestone._id).eq("active", true)
      )
      .paginate({ cursor: indexedCursor, numItems: limit });
    applyIndexedPagination(result);
    const records = result.page;
    if (
      records.some(
        (record) =>
          !canonicalScope(record) ||
          record.buildMilestoneId !== milestone._id ||
          record.buildSubmilestoneId !== submilestone._id
      )
    ) {
      return integrityError(
        "COLLECTION_SCOPE_INVALID",
        "Evidence requirements are outside the authorized Sub-milestone scope."
      );
    }
    rows = records.map((record) => ({
      createdAt: record.createdAt,
      description: record.description,
      detail: record.description,
      id: record._id,
      kind: record.kind,
      locationRequired: record.locationRequired,
      required: record.required,
      status: record.active ? "active" : "inactive",
      title: record.label,
      // Keep the canonical requirement identity in the collection payload;
      // callers must send this key when a package has multiple requirements.
      requirementKey: record.requirementKey,
    }));
  } else if (collection === "evidence_assets") {
    const result = await ctx.db
      .query("buildEvidenceAssets")
      .withIndex("by_build_milestone_submilestone", (query) =>
        query
          .eq("buildId", authorization.build._id)
          .eq("milestoneKey", milestone.key)
          .eq("submilestoneKey", submilestone.key)
      )
      .order("desc")
      .paginate({ cursor: indexedCursor, numItems: limit });
    applyIndexedPagination(result);
    const source = result.page;
    if (source.some((record) => !canonicalScope(record))) {
      return integrityError(
        "COLLECTION_SCOPE_INVALID",
        "Evidence assets are outside the authorized Sub-milestone scope."
      );
    }
    rows = source.map((record) => ({
      createdAt: record.createdAt,
      detail: record.fileName,
      id: record._id,
      kind: record.tag,
      locationVerified: record.locationVerified,
      ...(record.sourceDiscussionAssetId
        ? { sourceDiscussionAssetId: record.sourceDiscussionAssetId }
        : {}),
      ...(record.sourceDiscussionPostId
        ? { sourceDiscussionPostId: record.sourceDiscussionPostId }
        : {}),
      ...(record.source ? { sourceKind: record.source } : {}),
      title: record.label,
    }));
  } else if (collection === "people_assignments") {
    const result = await ctx.db
      .query("milestoneContractorAssignments")
      .withIndex("by_submilestone", (query) =>
        query
          .eq("buildId", authorization.build._id)
          .eq("milestoneKey", milestone.key)
          .eq("submilestoneKey", submilestone.key)
      )
      .paginate({ cursor: indexedCursor, numItems: limit });
    applyIndexedPagination(result);
    const records = result.page;
    if (
      records.some(
        (record) =>
          !canonicalScope(record) ||
          record.buildMilestoneId !== milestone._id ||
          record.buildSubmilestoneId !== submilestone._id
      )
    ) {
      return integrityError(
        "COLLECTION_SCOPE_INVALID",
        "People assignments are outside the authorized Sub-milestone scope."
      );
    }
    const canReadAssignmentCosts =
      authorization.effectiveRole.role !== "contractor" &&
      authorization.effectiveRole.role !== "homeowner";
    const canReadPeopleIdentity =
      authorization.effectiveRole.role !== "contractor" &&
      authorization.effectiveRole.role !== "homeowner";
    const contractorProfiles = canReadPeopleIdentity
      ? await Promise.all(
          records.map((record) => ctx.db.get(record.contractorId))
        )
      : records.map(() => null);
    rows = records.map((record, index) => ({
      amountCents: canReadAssignmentCosts
        ? (record.actualCostCents ?? record.estimatedCostCents)
        : undefined,
      createdAt: record.createdAt,
      detail: record.note,
      id: record._id,
      kind: "contractor_assignment",
      assignmentId: record._id,
      contractorId: canReadPeopleIdentity ? record.contractorId : undefined,
      ...(contractorProfiles[index] &&
      contractorProfiles[index]!.brokerageId === authorization.brokerage._id &&
      contractorProfiles[index]!.organizationId === authorization.organizationId
        ? {
            displayName: contractorProfiles[index]!.name,
            email: contractorProfiles[index]!.email,
          }
        : {}),
      status: record.status,
      title: record.role,
    }));
  } else if (collection === "people_history") {
    // Assignment history is an immutable projection of the canonical active
    // Build audit stream. Never reconstruct history from the mutable current
    // assignment row: updates would erase the prior contractor and status.
    const history = await loadCanonicalPeopleHistoryEvents(ctx, {
      authorization,
      milestone,
      submilestone,
      after: historyCursor,
    });
    const pageEvents = history.events.slice(0, limit);
    hasMore = pageEvents.length < history.events.length;
    const lastEvent = pageEvents.at(-1);
    nextCursor =
      hasMore && lastEvent
        ? encodeWorkspaceCursor(
            collection,
            "history",
            JSON.stringify({
              createdAt: lastEvent.createdAt,
              id: String(lastEvent._id),
            })
          )
        : undefined;
    partial = history.partial;
    const canReadPeopleIdentity = viewerCanReadPeopleIdentity(authorization);
    const contractorIds = pageEvents
      .map((event) => contractorIdFromAuditEvent(ctx, event))
      .filter((id): id is Id<"contractorProfiles"> => id !== undefined);
    const contractorProfiles = canReadPeopleIdentity
      ? await Promise.all(contractorIds.map((id) => ctx.db.get(id)))
      : [];
    const contractorById = new Map(
      contractorIds.map((id, index) => [String(id), contractorProfiles[index]])
    );
    rows = pageEvents.map((event) => {
      const contractorId = contractorIdFromAuditEvent(ctx, event);
      const profile = contractorId
        ? contractorById.get(String(contractorId))
        : undefined;
      const state = parseAuditState(event.newState);
      const status = stringFromState(state, "status");
      const role = stringFromState(state, "role");
      return {
        ...(canReadPeopleIdentity
          ? { actorWorkosUserId: event.actorWorkosUserId }
          : {}),
        createdAt: event.createdAt,
        detail: event.reason,
        id: event._id,
        kind: "assignment_history",
        ...(canReadPeopleIdentity && contractorId ? { contractorId } : {}),
        ...(canReadPeopleIdentity &&
        profile &&
        profile.brokerageId === authorization.brokerage._id &&
        profile.organizationId === authorization.organizationId
          ? { displayName: profile.name, email: profile.email }
          : {}),
        historyType: event.eventType,
        milestoneKey: milestone.key,
        status: status || "updated",
        title: role || "Contractor assignment",
      };
    });
  } else if (collection === "materials") {
    // `relevantSubmilestoneKeys` is an array and cannot be indexed. Read a
    // bounded milestone slice, filter to the exact target, then paginate the
    // filtered canonical rows so unrelated sibling rows never consume a page.
    const source = (await ctx.db
      .query("buildCostItems")
      .withIndex("by_build_milestone", (query) =>
        query
          .eq("buildId", authorization.build._id)
          .eq("milestoneKey", milestone.key)
      )
      .take(MAX_BOOTSTRAP_ROWS * 5 + 1)) as Doc<"buildCostItems">[];
    partial = source.length > MAX_BOOTSTRAP_ROWS * 5;
    const exact = source.filter(
      (record) =>
        record.budgetSubmilestoneKey === submilestone.key ||
        record.relevantSubmilestoneKeys.includes(submilestone.key)
    );
    const pageOffset = offset;
    const pageRows = exact.slice(pageOffset, pageOffset + limit);
    hasMore = pageOffset + limit < exact.length;
    nextCursor = hasMore
      ? encodeWorkspaceCursor(collection, "offset", String(pageOffset + limit))
      : undefined;
    if (
      pageRows.some(
        (record) =>
          !canonicalScope(record) || record.buildMilestoneId !== milestone._id
      )
    ) {
      return integrityError(
        "COLLECTION_SCOPE_INVALID",
        "Materials are outside the authorized Sub-milestone scope."
      );
    }
    const canReadMaterialCosts =
      authorization.effectiveRole.role !== "contractor" &&
      authorization.effectiveRole.role !== "homeowner";
    rows = pageRows.map((record) => ({
      amountCents: canReadMaterialCosts ? record.costCents : undefined,
      budgetSubmilestoneKey: record.budgetSubmilestoneKey,
      budgetTreatment: record.budgetTreatment,
      createdAt: record.createdAt,
      description: record.description,
      detail: record.description,
      id: record._id,
      itemKey: record.itemKey,
      itemType: record.itemType,
      kind: record.itemType,
      costCents: canReadMaterialCosts ? record.costCents : undefined,
      milestoneKey: record.milestoneKey,
      quantity: record.quantity,
      relevantSubmilestoneKeys: record.relevantSubmilestoneKeys,
      status: record.budgetTreatment,
      supplier: record.supplier,
      title: record.title,
      totalCents: canReadMaterialCosts
        ? record.costCents * record.quantity
        : undefined,
      unit: record.unit,
      updatedAt: record.updatedAt,
    }));
  } else if (collection === "collaboration_comments") {
    const result = await ctx.db
      .query("buildActionItemComments")
      .withIndex("by_actionItemId_and_createdAt", (query) =>
        query.eq("actionItemId", companion!._id)
      )
      .order("desc")
      .paginate({ cursor: indexedCursor, numItems: limit });
    applyIndexedPagination(result);
    const records = result.page;
    if (records.some((record) => !companionScope(record))) {
      return integrityError(
        "COLLECTION_SCOPE_INVALID",
        "Comments are outside the authorized collaboration companion scope."
      );
    }
    rows = records.map((record) => ({
      createdAt: record.createdAt,
      detail: record.plainText,
      id: record._id,
      kind: "comment",
      title: record.authorDisplayNameSnapshot,
    }));
  } else if (collection === "collaboration_activity") {
    const result = await ctx.db
      .query("buildActionItemEvents")
      .withIndex("by_actionItemId_and_createdAt", (query) =>
        query.eq("actionItemId", companion!._id)
      )
      .order("desc")
      .paginate({ cursor: indexedCursor, numItems: limit });
    applyIndexedPagination(result);
    const records = result.page;
    if (records.some((record) => !companionScope(record))) {
      return integrityError(
        "COLLECTION_SCOPE_INVALID",
        "Activity is outside the authorized collaboration companion scope."
      );
    }
    rows = records.map((record) => ({
      createdAt: record.createdAt,
      detail: record.reason,
      id: record._id,
      kind: record.eventType,
      status: record.newState,
      title: record.eventType,
    }));
  } else if (collection === "collaboration_revisions") {
    const result = await ctx.db
      .query("buildActionItemRevisions")
      .withIndex("by_actionItemId_and_revision", (query) =>
        query.eq("actionItemId", companion!._id)
      )
      .order("desc")
      .paginate({ cursor: indexedCursor, numItems: limit });
    applyIndexedPagination(result);
    const records = result.page;
    if (records.some((record) => !companionScope(record))) {
      return integrityError(
        "COLLECTION_SCOPE_INVALID",
        "Revisions are outside the authorized collaboration companion scope."
      );
    }
    rows = records.map((record) => ({
      createdAt: record.createdAt,
      detail: record.reason,
      id: record._id,
      kind: "revision",
      status: String(record.revision),
      title: `Revision ${record.revision}`,
    }));
  } else if (collection === "collaboration_checklist") {
    const result = await ctx.db
      .query("buildActionItemChecklistItems")
      .withIndex("by_actionItemId_and_order", (query) =>
        query.eq("actionItemId", companion!._id)
      )
      .paginate({ cursor: indexedCursor, numItems: limit });
    applyIndexedPagination(result);
    const records = result.page;
    if (records.some((record) => !companionScope(record))) {
      return integrityError(
        "COLLECTION_SCOPE_INVALID",
        "Checklist rows are outside the authorized collaboration companion scope."
      );
    }
    rows = records.map((record) => ({
      completed: record.completed,
      createdAt: record.createdAt,
      id: record._id,
      kind: "checklist",
      required: record.required,
      status: record.completed ? "complete" : "open",
      title: record.label,
    }));
  } else if (collection === "collaboration_children") {
    const result = await ctx.db
      .query("buildActionItems")
      .withIndex("by_parentActionItemId_and_status", (query) =>
        query.eq("parentActionItemId", companion!._id)
      )
      .paginate({ cursor: indexedCursor, numItems: limit });
    applyIndexedPagination(result);
    const records = result.page;
    if (
      records.some(
        (record) =>
          !canonicalScope(record) ||
          record.parentActionItemId !== companion!._id
      )
    ) {
      return integrityError(
        "COLLECTION_SCOPE_INVALID",
        "Child Action Items are outside the authorized collaboration companion scope."
      );
    }
    rows = records.map((record) => ({
      createdAt: record.createdAt,
      detail: record.descriptionPlainText,
      id: record._id,
      kind: "action_item",
      status: record.status,
      title: record.title,
    }));
  } else if (collection === "collaboration_relations") {
    const result = await ctx.db
      .query("buildActionItemRelations")
      .withIndex("by_buildId_and_status", (query) =>
        query.eq("buildId", authorization.build._id).eq("status", "active")
      )
      .paginate({ cursor: indexedCursor, numItems: limit });
    applyIndexedPagination(result);
    const records = result.page;
    if (records.some((record) => !canonicalScope(record))) {
      return integrityError(
        "COLLECTION_SCOPE_INVALID",
        "Relations are outside the authorized collaboration companion scope."
      );
    }
    rows = records.map((record) =>
      record.sourceActionItemId === companion!._id ||
      record.targetActionItemId === companion!._id
        ? {
            createdAt: record.createdAt,
            detail:
              record.sourceActionItemId === companion!._id
                ? "outgoing"
                : "incoming",
            id: record._id,
            kind: record.kind,
            status: record.status,
            title: record.kind.replaceAll("_", " "),
          }
        : null
    );
  } else {
    const result = await ctx.db
      .query("buildSubmilestoneReviewDecisions")
      .withIndex("by_submilestone_createdAt", (query) =>
        query.eq("buildSubmilestoneId", submilestone._id)
      )
      .order("desc")
      .paginate({ cursor: indexedCursor, numItems: limit });
    applyIndexedPagination(result);
    const records = result.page;
    if (
      records.some(
        (record) =>
          !canonicalScope(record) ||
          record.buildMilestoneId !== milestone._id ||
          record.buildSubmilestoneId !== submilestone._id
      )
    ) {
      return integrityError(
        "COLLECTION_SCOPE_INVALID",
        "Review decisions are outside the authorized Sub-milestone scope."
      );
    }
    rows = records.map((record) => ({
      createdAt: record.createdAt,
      detail: record.reason ?? record.note,
      id: record._id,
      kind: record.kind,
      status: record.newState,
      title: record.kind.replaceAll("_", " "),
    }));
  }

  return { hasMore, nextCursor, partial, rows };
}
