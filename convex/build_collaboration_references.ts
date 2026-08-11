import { v } from "convex/values";

import type {
  ActiveBuildAuthorization,
  ActiveBuildParticipantProjection,
} from "./activeBuildAccess";
import { authenticatedQuery } from "./authz";
import { collaborationTagOptionValidator } from "./build_collaboration_contracts";
import type { BuildCollaborationRole } from "./build_collaboration_model";
import { collaborationRoleTier } from "./build_collaboration_model";
import type { ReferenceInput } from "./build_collaboration_publication_bundle";
import { authorizeActiveBuildCollaborationAccess } from "./build_collaboration_rollout";
import {
  canReadCanonicalMilestoneSubmilestone,
  canReadMilestoneSystemActionItem,
  isDrawSystemPost,
} from "./build_collaboration_system_event_access";
import { buildCollaborationValidationError } from "./build_collaboration_validation";
import { isInternalDrawCoordinationEligible } from "./build_draw_coordination";
import type { Doc, QueryCtx } from "./types";

const MAX_OPTIONS_PER_KIND = 500;

export type BuildCollaborationReferenceKind = ReferenceInput["entityKind"];

export interface CanonicalBuildCollaborationReference
  extends Omit<ReferenceInput, "label" | "summary"> {
  aliases?: Array<Pick<ReferenceInput, "entityId" | "entityKind">>;
  eyebrow: string;
  href: string;
  label: string;
  searchTerms: string[];
  summary: string;
}

interface ReferenceCandidate {
  entityId: string;
  entityKind: BuildCollaborationReferenceKind;
  primary?: boolean;
}

/**
 * The sole server-side authorization and canonicalization boundary for
 * collaboration entity references. Callers submit only a type/ID pair; labels,
 * summaries, navigation targets, existence, Build scope, tenant scope, and
 * reader compatibility are all derived here.
 */
export async function resolveCanonicalBuildCollaborationReferences(
  ctx: QueryCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    readerIds: string[];
    references: ReferenceCandidate[];
  }
): Promise<CanonicalBuildCollaborationReference[]> {
  const readerIds = [...new Set(input.readerIds.map((id) => id.trim()))].filter(
    Boolean
  );
  const participantById = new Map(
    input.authorization.participants.map((participant) => [
      participant.workosUserId,
      participant,
    ])
  );
  const readers = readerIds.map((readerId) => {
    const participant = participantById.get(readerId);
    if (!participant) {
      throw buildCollaborationValidationError(
        "Every collaboration reference reader must actively participate in this Build."
      );
    }
    return participant;
  });

  const unique = new Map<string, ReferenceCandidate>();
  let selectedPrimaryKey: string | undefined;
  for (const submitted of input.references) {
    const entityId = submitted.entityId.trim();
    if (!entityId) {
      throw buildCollaborationValidationError(
        "Every collaboration reference requires an entity ID."
      );
    }
    const key = `${submitted.entityKind}:${entityId}`;
    if (submitted.primary && selectedPrimaryKey === undefined) {
      selectedPrimaryKey = key;
    }
    if (!unique.has(key)) {
      unique.set(key, {
        entityId,
        entityKind: submitted.entityKind,
      });
    }
  }
  selectedPrimaryKey ??= unique.keys().next().value;
  const canonical: CanonicalBuildCollaborationReference[] = [];
  for (const [key, submitted] of unique) {
    canonical.push(
      await resolveCanonicalReference(ctx, {
        authorization: input.authorization,
        entityId: submitted.entityId,
        entityKind: submitted.entityKind,
        primary: key === selectedPrimaryKey,
        readers,
      })
    );
  }
  const normalized = new Map<string, CanonicalBuildCollaborationReference>();
  for (const reference of canonical) {
    const key = `${reference.entityKind}:${reference.entityId}`;
    const existing = normalized.get(key);
    if (!existing) {
      normalized.set(key, reference);
      continue;
    }
    const aliases = [
      ...(existing.aliases ?? []),
      ...(reference.aliases ?? []),
    ].filter(
      (alias, index, all) =>
        all.findIndex(
          (candidate) =>
            candidate.entityId === alias.entityId &&
            candidate.entityKind === alias.entityKind,
        ) === index,
    );
    if (reference.primary && !existing.primary) {
      normalized.set(key, {
        ...existing,
        ...(aliases.length > 0 ? { aliases } : {}),
        primary: true,
      });
    } else if (aliases.length > 0) {
      normalized.set(key, { ...existing, aliases });
    }
  }
  return [...normalized.values()];
}

export async function resolveCurrentBuildCollaborationReference(
  ctx: QueryCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    entityId: string;
    entityKind: BuildCollaborationReferenceKind;
  }
) {
  const [reference] = await resolveCanonicalBuildCollaborationReferences(ctx, {
    authorization: input.authorization,
    readerIds: [input.authorization.viewer.subject],
    references: [input],
  });
  return reference;
}

export const listBuildCollaborationTagOptions = authenticatedQuery
  .input({
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
  })
  .returns(v.array(collaborationTagOptionValidator))
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildCollaborationAccess(
      ctx,
      args
    );
    const candidates = await listReferenceCandidates(ctx, authorization);
    const options: CanonicalBuildCollaborationReference[] = [];
    for (const candidate of candidates) {
      try {
        const reference = await resolveCurrentBuildCollaborationReference(ctx, {
          authorization,
          entityId: candidate.entityId,
          entityKind: candidate.entityKind,
        });
        options.push(reference);
      } catch {
        // Autocomplete is disclosure-safe: inaccessible, archived, or stale
        // entities are omitted without revealing why they were unavailable.
      }
    }
    return options.map((option) => ({
      entityId: option.entityId,
      entityKind: option.entityKind,
      eyebrow: option.eyebrow,
      href: option.href,
      label: option.label,
      searchTerms: option.searchTerms,
      summary: option.summary,
    }));
  })
  .public();

async function resolveCanonicalReference(
  ctx: QueryCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    entityId: string;
    entityKind: BuildCollaborationReferenceKind;
    primary: boolean;
    readers: ActiveBuildParticipantProjection[];
  }
): Promise<CanonicalBuildCollaborationReference> {
  const { authorization, entityId, entityKind, primary, readers } = input;
  const buildId = authorization.build._id;
  const common = {
    entityId,
    entityKind,
    href: collaborationEntityHref(buildId, entityKind, entityId),
    primary,
  };

  switch (entityKind) {
    case "participant": {
      const participant = authorization.participants.find(
        (candidate) => candidate.workosUserId === entityId
      );
      if (!participant) {
        throw unavailableReference();
      }
      return {
        ...common,
        eyebrow: roleLabel(participant.role),
        label: participant.displayName,
        searchTerms: [participant.role],
        summary: `${roleLabel(participant.role)} on this Build`,
      };
    }
    case "milestone": {
      const milestone = await getScopedDoc(
        ctx,
        "buildMilestones",
        entityId,
        authorization
      );
      return {
        ...common,
        eyebrow: "Milestone",
        label: milestone.name,
        searchTerms: [milestone.key, milestone.status],
        summary: `${milestone.progressPercent ?? 0}% complete · ${humanize(milestone.status)}`,
      };
    }
    case "submilestone": {
      const submilestone = await getScopedDoc(
        ctx,
        "buildSubmilestones",
        entityId,
        authorization
      );
      const milestone = await ctx.db.get(submilestone.buildMilestoneId);
      if (!(milestone && isScopedDoc(milestone, authorization))) {
        throw unavailableReference();
      }
      const readersCanRead = await Promise.all(
        readers.map((reader) =>
          canReadCanonicalMilestoneSubmilestone(ctx, {
            build: authorization.build,
            milestone,
            role: reader.role,
            submilestone,
            workosUserId: reader.workosUserId,
          })
        )
      );
      if (readersCanRead.includes(false)) {
        throw incompatibleReference();
      }
      return {
        ...common,
        eyebrow: "Sub-milestone",
        label: submilestone.name,
        searchTerms: [
          submilestone.key,
          submilestone.milestoneKey,
          submilestone.status,
        ],
        summary: humanize(submilestone.status),
      };
    }
    case "draw": {
      return await resolveDrawReference(ctx, {
        authorization,
        common,
        entityId,
        readers,
      });
    }
    case "evidencePackage": {
      return await resolveEvidencePackageReference(ctx, {
        authorization,
        common,
        entityId,
        readers,
      });
    }
    case "evidenceAsset": {
      requireAllReadersCanReadEvidence(readers);
      const asset = await getScopedDoc(
        ctx,
        "buildEvidenceAssets",
        entityId,
        authorization
      );
      return {
        ...common,
        eyebrow: "Evidence Asset",
        label: asset.label,
        searchTerms: [asset.evidenceKey, asset.fileName, asset.tag],
        summary: `${asset.tag} · ${
          asset.locationVerified ? "location verified" : "location unverified"
        }`,
      };
    }
    case "siteVisit": {
      const visit = await getScopedDoc(
        ctx,
        "buildSiteVisits",
        entityId,
        authorization
      );
      return {
        ...common,
        eyebrow: "Site Visit",
        label: `Site Visit ${visit.visitId}`,
        searchTerms: [visit.milestoneKey, visit.status],
        summary: humanize(visit.status),
      };
    }
    case "document": {
      return await resolveDocumentReference(ctx, {
        authorization,
        common,
        entityId,
        readers,
      });
    }
    case "material": {
      return await resolveMaterialReference(ctx, {
        authorization,
        common,
        entityId,
        readers,
      });
    }
    case "actionItem": {
      return await resolveActionItemReference(ctx, {
        authorization,
        common,
        entityId,
        readers,
      });
    }
  }
}

interface ReferenceCommon {
  entityId: string;
  entityKind: BuildCollaborationReferenceKind;
  href: string;
  primary: boolean;
}

async function resolveDrawReference(
  ctx: QueryCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    common: ReferenceCommon;
    entityId: string;
    readers: ActiveBuildParticipantProjection[];
  }
) {
  requireAllReadersCanReadFinancial(input.readers);
  const readersCanCoordinate = await Promise.all(
    input.readers.map((reader) =>
      isInternalDrawCoordinationEligible(ctx, {
        buildId: input.authorization.build._id,
        organizationId: input.authorization.organizationId,
        role: reader.role,
        workosUserId: reader.workosUserId,
      })
    )
  );
  if (readersCanCoordinate.includes(false)) {
    throw incompatibleReference();
  }
  const activeDrawId = ctx.db.normalizeId(
    "activeBuildDrawRequests",
    input.entityId
  );
  const activeDraw = activeDrawId ? await ctx.db.get(activeDrawId) : null;
  if (activeDraw) {
    requireScopedDoc(activeDraw, input.authorization);
    return {
      ...input.common,
      eyebrow: "Draw",
      label: activeDraw.label,
      searchTerms: [
        activeDraw.displayId,
        activeDraw.requestKey,
        activeDraw.status,
      ],
      summary: `${formatCents(activeDraw.amountCents)} · ${humanize(activeDraw.status)}`,
    };
  }
  const plannedDraw = await getScopedDoc(
    ctx,
    "plannedDrawScheduleRows",
    input.entityId,
    input.authorization
  );
  return {
    ...input.common,
    eyebrow: "Planned Draw",
    label: plannedDraw.label,
    searchTerms: [plannedDraw.drawKey, plannedDraw.status],
    summary: `${formatCents(plannedDraw.amountCents)} · ${humanize(plannedDraw.status)}`,
  };
}

async function resolveEvidencePackageReference(
  ctx: QueryCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    common: ReferenceCommon;
    entityId: string;
    readers: ActiveBuildParticipantProjection[];
  }
) {
  requireAllReadersCanReadEvidence(input.readers);
  const asset = await ctx.db
    .query("buildEvidenceAssets")
    .withIndex("by_build_key", (query) =>
      query
        .eq("buildId", input.authorization.build._id)
        .eq("evidenceKey", input.entityId)
    )
    .first();
  if (!(asset && isScopedDoc(asset, input.authorization))) {
    throw unavailableReference();
  }
  return {
    ...input.common,
    eyebrow: "Evidence Package",
    label: asset.evidenceKey,
    searchTerms: [asset.milestoneKey, asset.tag],
    summary: `Evidence for ${asset.milestoneKey}`,
  };
}

async function resolveDocumentReference(
  ctx: QueryCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    common: ReferenceCommon;
    entityId: string;
    readers: ActiveBuildParticipantProjection[];
  }
) {
  const document = await getScopedDoc(
    ctx,
    "buildDocuments",
    input.entityId,
    input.authorization
  );
  if (
    input.readers.some(
      (reader) =>
        reader.role === "homeowner" ||
        (reader.role === "contractor" &&
          document.documentType !== "permit" &&
          document.contractorVisible !== true)
    )
  ) {
    throw incompatibleReference();
  }
  return {
    ...input.common,
    eyebrow: "Document",
    label: document.fileName,
    searchTerms: [document.documentType, document.status],
    summary: `${document.documentType} · ${document.status}`,
  };
}

async function resolveMaterialReference(
  ctx: QueryCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    common: ReferenceCommon;
    entityId: string;
    readers: ActiveBuildParticipantProjection[];
  }
) {
  const item = await getScopedDoc(
    ctx,
    "buildCostItems",
    input.entityId,
    input.authorization
  );
  const allReadersCanReadFinancial = input.readers.every(canReadFinancial);
  return {
    ...input.common,
    eyebrow: item.itemType === "material" ? "Material" : "Cost Item",
    label: item.title,
    searchTerms: [
      item.itemKey,
      item.milestoneKey,
      ...(allReadersCanReadFinancial && item.supplier ? [item.supplier] : []),
    ],
    summary: allReadersCanReadFinancial
      ? `${formatCents(item.costCents)} · ${item.quantity} qty`
      : `${item.itemType === "material" ? "Material" : "Cost item"} · ${item.quantity} qty`,
  };
}

async function resolveActionItemReference(
  ctx: QueryCtx,
  input: {
    authorization: ActiveBuildAuthorization;
    common: ReferenceCommon;
    entityId: string;
    readers: ActiveBuildParticipantProjection[];
  }
) {
  const item = await getScopedDoc(
    ctx,
    "buildActionItems",
    input.entityId,
    input.authorization
  );
  const post = await ctx.db.get(item.originatingPostId);
  if (!(post && isScopedDoc(post, input.authorization))) {
    throw unavailableReference();
  }
  const readerAccess = await Promise.all(
    input.readers.map(async (reader) => {
      if (!(await canParticipantReadPost(ctx, post, reader))) {
        return false;
      }
      const canReadActionItem = await canReadMilestoneSystemActionItem(ctx, {
        actionItem: item,
        buildId: input.authorization.build._id,
        role: reader.role,
        workosUserId: reader.workosUserId,
      });
      if (!canReadActionItem) {
        return false;
      }
      if (
        isDrawSystemPost(post) &&
        !(await isInternalDrawCoordinationEligible(ctx, {
          buildId: input.authorization.build._id,
          organizationId: input.authorization.organizationId,
          role: reader.role,
          workosUserId: reader.workosUserId,
        }))
      ) {
        return false;
      }
      return true;
    })
  );
  if (readerAccess.includes(false)) {
    throw incompatibleReference();
  }
  if (item.systemMode === "generated_milestone_submilestone") {
    if (!item.canonicalBuildSubmilestoneId) {
      throw unavailableReference();
    }
    const canonical = await resolveCanonicalReference(ctx, {
      authorization: input.authorization,
      entityId: item.canonicalBuildSubmilestoneId,
      entityKind: "submilestone",
      primary: input.common.primary,
      readers: input.readers,
    });
    return {
      ...canonical,
      aliases: [
        ...(canonical.aliases ?? []),
        { entityId: input.entityId, entityKind: "actionItem" as const },
      ],
    };
  }
  return {
    ...input.common,
    eyebrow: "Action Item",
    label: item.title,
    searchTerms: [item.status, item.priority],
    summary: `${humanize(item.status)} · ${item.priority} priority`,
  };
}

async function listReferenceCandidates(
  ctx: QueryCtx,
  authorization: ActiveBuildAuthorization
) {
  const buildId = authorization.build._id;
  const [
    milestones,
    submilestones,
    drawRequests,
    plannedDraws,
    evidenceAssets,
    siteVisits,
    documents,
    costItems,
    actionItems,
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
      .query("activeBuildDrawRequests")
      .withIndex("by_build", (query) => query.eq("buildId", buildId))
      .take(MAX_OPTIONS_PER_KIND),
    ctx.db
      .query("plannedDrawScheduleRows")
      .withIndex("by_build_order", (query) => query.eq("buildId", buildId))
      .take(MAX_OPTIONS_PER_KIND),
    ctx.db
      .query("buildEvidenceAssets")
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
      .query("buildCostItems")
      .withIndex("by_build", (query) => query.eq("buildId", buildId))
      .take(MAX_OPTIONS_PER_KIND),
    ctx.db
      .query("buildActionItems")
      .withIndex("by_buildId_and_status_and_updatedAt", (query) =>
        query.eq("buildId", buildId)
      )
      .take(MAX_OPTIONS_PER_KIND),
  ]);

  return [
    ...authorization.participants.map((participant) => ({
      entityId: participant.workosUserId,
      entityKind: "participant" as const,
    })),
    ...milestones.map((entity) => ({
      entityId: entity._id,
      entityKind: "milestone" as const,
    })),
    ...submilestones.map((entity) => ({
      entityId: entity._id,
      entityKind: "submilestone" as const,
    })),
    ...drawRequests.map((entity) => ({
      entityId: entity._id,
      entityKind: "draw" as const,
    })),
    ...plannedDraws.map((entity) => ({
      entityId: entity._id,
      entityKind: "draw" as const,
    })),
    ...[...new Set(evidenceAssets.map((entity) => entity.evidenceKey))].map(
      (entityId) => ({
        entityId,
        entityKind: "evidencePackage" as const,
      })
    ),
    ...evidenceAssets.map((entity) => ({
      entityId: entity._id,
      entityKind: "evidenceAsset" as const,
    })),
    ...siteVisits.map((entity) => ({
      entityId: entity._id,
      entityKind: "siteVisit" as const,
    })),
    ...documents.map((entity) => ({
      entityId: entity._id,
      entityKind: "document" as const,
    })),
    ...costItems.map((entity) => ({
      entityId: entity._id,
      entityKind: "material" as const,
    })),
    ...actionItems
      .filter(
        (entity) => entity.systemMode !== "generated_milestone_submilestone"
      )
      .map((entity) => ({
        entityId: entity._id,
        entityKind: "actionItem" as const,
      })),
  ];
}

async function getScopedDoc<
  TableName extends
    | "activeBuildDrawRequests"
    | "buildActionItems"
    | "buildCostItems"
    | "buildDocuments"
    | "buildEvidenceAssets"
    | "buildMilestones"
    | "buildSiteVisits"
    | "buildSubmilestones"
    | "plannedDrawScheduleRows",
>(
  ctx: QueryCtx,
  tableName: TableName,
  entityId: string,
  authorization: ActiveBuildAuthorization
): Promise<Doc<TableName>> {
  const id = ctx.db.normalizeId(tableName, entityId);
  const document = id
    ? ((await ctx.db.get(id)) as Doc<TableName> | null)
    : null;
  if (!document) {
    throw unavailableReference();
  }
  requireScopedDoc(
    document as Doc<TableName> & {
      brokerageId: string;
      buildId: string;
      organizationId: string;
    },
    authorization
  );
  return document;
}

function requireScopedDoc(
  document: {
    brokerageId: string;
    buildId: string;
    organizationId: string;
  },
  authorization: ActiveBuildAuthorization
) {
  if (!isScopedDoc(document, authorization)) {
    throw unavailableReference();
  }
}

function isScopedDoc(
  document: {
    brokerageId: string;
    buildId: string;
    organizationId: string;
  },
  authorization: ActiveBuildAuthorization
) {
  return (
    document.buildId === authorization.build._id &&
    document.brokerageId === authorization.brokerage._id &&
    document.organizationId === authorization.organizationId
  );
}

async function canParticipantReadPost(
  ctx: QueryCtx,
  post: Doc<"buildCollaborationPosts">,
  participant: ActiveBuildParticipantProjection
) {
  if (collaborationRoleTier(participant.role) >= post.audienceFloorTier) {
    return true;
  }
  if (post.audienceMode === "build_wide") {
    return true;
  }
  const member = await ctx.db
    .query("buildCollaborationAudienceMembers")
    .withIndex("by_postId_and_workosUserId", (query) =>
      query.eq("postId", post._id).eq("workosUserId", participant.workosUserId)
    )
    .unique();
  return Boolean(member);
}

function canReadFinancial(participant: ActiveBuildParticipantProjection) {
  return participant.role !== "contractor" && participant.role !== "homeowner";
}

function requireAllReadersCanReadFinancial(
  readers: ActiveBuildParticipantProjection[]
) {
  if (readers.some((reader) => !canReadFinancial(reader))) {
    throw incompatibleReference();
  }
}

function requireAllReadersCanReadEvidence(
  readers: ActiveBuildParticipantProjection[]
) {
  if (
    readers.some(
      (reader) => reader.role === "contractor" || reader.role === "homeowner"
    )
  ) {
    throw incompatibleReference();
  }
}

function unavailableReference() {
  return buildCollaborationValidationError(
    "The referenced entity does not exist in this active Build or is archived."
  );
}

function incompatibleReference() {
  return buildCollaborationValidationError(
    "The referenced entity is not readable by every publication reader."
  );
}

function collaborationEntityHref(
  _buildId: string,
  entityKind: string,
  entityId: string
) {
  if (entityKind === "submilestone") {
    return `?tab=details&focus=${encodeURIComponent(`submilestone:${entityId}`)}&detailTab=collaboration`;
  }
  const tabByKind: Record<string, string> = {
    actionItem: "details",
    document: "documents",
    draw: "details",
    evidenceAsset: "evidence",
    evidencePackage: "evidence",
    material: "materials",
    milestone: "milestones",
    participant: "details",
    siteVisit: "calendar",
  };
  const tab = tabByKind[entityKind] ?? "details";
  return `?tab=${tab}&focus=${encodeURIComponent(`${entityKind}:${entityId}`)}`;
}

function formatCents(cents: number) {
  return new Intl.NumberFormat("en-CA", {
    currency: "CAD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(cents / 100);
}

function humanize(value: string) {
  return value.replaceAll("_", " ");
}

function roleLabel(role: BuildCollaborationRole) {
  return role
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
