import { v } from "convex/values";

import {
  type AuthorizedViewer,
  authenticatedQuery,
  backofficeMutation,
  backofficeRoleSlugs,
} from "./authz";
import { resolveCanonicalMilestoneExecutionOwnership } from "./build_collaboration_system_event_access";
import {
  attachExactBuildLineage,
  type ExactBuildLineageAttachmentInput,
} from "./fluent";
import type { Doc, Id, MutationCtx, QueryCtx } from "./types";

/**
 * Field Guidance is deliberately a mutable, two-field record.  It is not a
 * Scope revision and therefore must not grow a revision, decision, or audit
 * stream of its own.
 */
const MAX_TIPTAP_JSON_LENGTH = 250_000;
const EMPTY_GUIDANCE_DENIAL = "Forbidden: Field Guidance unavailable.";

const fieldGuidanceProjectionValidator = v.object({
  _id: v.id("submilestoneFieldGuidance"),
  proposalSubmilestoneId: v.id("proposalSubmilestones"),
  buildId: v.optional(v.id("activeBuilds")),
  buildSubmilestoneId: v.optional(v.id("buildSubmilestones")),
  whatToVerifyTiptapJson: v.string(),
  cameraAnglesTiptapJson: v.string(),
  updatedByWorkosUserId: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
});

const readinessValidator = v.object({
  readyForSiteVisit: v.boolean(),
  missingSections: v.array(
    v.union(v.literal("whatToVerify"), v.literal("cameraAngles"))
  ),
});

const fieldGuidanceResultValidator = v.object({
  guidance: v.union(v.null(), fieldGuidanceProjectionValidator),
  readiness: readinessValidator,
});

type GuidanceContext = QueryCtx | MutationCtx;

function assertViewerOrganization(
  viewer: AuthorizedViewer,
  workosOrganizationId: string
) {
  if (
    !viewer.organizationId ||
    viewer.organizationId !== workosOrganizationId
  ) {
    throw new Error("Forbidden: organization scope");
  }
}

function isBackofficeViewer(viewer: AuthorizedViewer) {
  return viewer.roles.some((role) =>
    backofficeRoleSlugs.includes(role as (typeof backofficeRoleSlugs)[number])
  );
}

function isBuilderViewer(viewer: AuthorizedViewer) {
  return (
    viewer.roles.includes("builder") || viewer.roles.includes("builder-staff")
  );
}

function isContractorViewer(viewer: AuthorizedViewer) {
  return viewer.roles.includes("contractor");
}

function parseTiptapDocument(value: string, fieldName: string) {
  if (!value.trim()) {
    throw new Error(`${fieldName} must contain TipTap JSON.`);
  }
  if (value.length > MAX_TIPTAP_JSON_LENGTH) {
    throw new Error(`${fieldName} exceeds the supported length.`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`${fieldName} must be valid TipTap JSON.`);
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !("type" in parsed) ||
    parsed.type !== "doc"
  ) {
    throw new Error(`${fieldName} must contain a TipTap document root.`);
  }

  // The input string is intentionally returned by the caller unchanged. This
  // parser only validates the document shape; it never normalizes JSON bytes.
  return parsed;
}

function hasSemanticTiptapContent(node: unknown): boolean {
  if (Array.isArray(node)) {
    return node.some(hasSemanticTiptapContent);
  }
  if (!node || typeof node !== "object") {
    return false;
  }

  const record = node as Record<string, unknown>;
  if (typeof record.text === "string" && record.text.trim()) {
    return true;
  }

  const type = typeof record.type === "string" ? record.type : undefined;
  if (type === "image") {
    const attrs =
      record.attrs && typeof record.attrs === "object"
        ? (record.attrs as Record<string, unknown>)
        : undefined;
    return typeof attrs?.src === "string" && Boolean(attrs.src.trim());
  }
  if (type === "horizontalRule") {
    return true;
  }
  if (type === "hardBreak") {
    return false;
  }

  return (
    Array.isArray(record.content) &&
    record.content.some(hasSemanticTiptapContent)
  );
}

function hasGuidanceContent(value: string) {
  try {
    return hasSemanticTiptapContent(JSON.parse(value));
  } catch {
    // Rows written by this domain are valid JSON. Treat a legacy malformed row
    // as incomplete rather than allowing it to satisfy Site Visit readiness.
    return false;
  }
}

/**
 * Site Visit ordering requires both canonical Guidance sections to contain
 * semantic TipTap content.  Planning saves may still store empty documents,
 * so this check is deliberately separate from the regular save mutation.
 */
export function assertCompleteSiteVisitFieldGuidance(input: {
  cameraAnglesTiptapJson: string;
  whatToVerifyTiptapJson: string;
}) {
  parseTiptapDocument(input.whatToVerifyTiptapJson, "whatToVerifyTiptapJson");
  parseTiptapDocument(input.cameraAnglesTiptapJson, "cameraAnglesTiptapJson");
  const missingSections: string[] = [];
  if (!hasGuidanceContent(input.whatToVerifyTiptapJson)) {
    missingSections.push("whatToVerifyTiptapJson");
  }
  if (!hasGuidanceContent(input.cameraAnglesTiptapJson)) {
    missingSections.push("cameraAnglesTiptapJson");
  }
  if (missingSections.length > 0) {
    throw new Error(
      `Site Visit Field Guidance requires semantic content in: ${missingSections.join(", ")}.`
    );
  }
}

function guidanceReadiness(
  guidance: Pick<
    Doc<"submilestoneFieldGuidance">,
    "whatToVerifyTiptapJson" | "cameraAnglesTiptapJson"
  > | null
) {
  const missingSections: ("whatToVerify" | "cameraAngles")[] = [];
  if (!(guidance && hasGuidanceContent(guidance.whatToVerifyTiptapJson))) {
    missingSections.push("whatToVerify");
  }
  if (!(guidance && hasGuidanceContent(guidance.cameraAnglesTiptapJson))) {
    missingSections.push("cameraAngles");
  }
  return {
    readyForSiteVisit: missingSections.length === 0,
    missingSections,
  };
}

async function loadProposalSubmilestone(
  ctx: GuidanceContext,
  viewer: AuthorizedViewer,
  proposalSubmilestoneId: Id<"proposalSubmilestones">,
  workosOrganizationId: string
) {
  assertViewerOrganization(viewer, workosOrganizationId);

  const proposalSubmilestone = await ctx.db.get(proposalSubmilestoneId);
  if (
    !proposalSubmilestone ||
    proposalSubmilestone.organizationId !== workosOrganizationId
  ) {
    throw new Error("Forbidden: organization scope");
  }

  const proposal = await ctx.db.get(proposalSubmilestone.proposalId);
  if (
    !proposal ||
    proposal.organizationId !== workosOrganizationId ||
    proposal.brokerageId !== proposalSubmilestone.brokerageId
  ) {
    throw new Error("Forbidden: organization scope");
  }

  const proposalMilestone = await ctx.db.get(
    proposalSubmilestone.proposalMilestoneId
  );
  if (
    !proposalMilestone ||
    proposalMilestone.proposalId !== proposal._id ||
    proposalMilestone.organizationId !== workosOrganizationId ||
    proposalMilestone.brokerageId !== proposal.brokerageId
  ) {
    throw new Error("Forbidden: organization scope");
  }

  return { proposal, proposalSubmilestone };
}

async function findFieldGuidance(
  ctx: GuidanceContext,
  proposalSubmilestoneId: Id<"proposalSubmilestones">
) {
  return await ctx.db
    .query("submilestoneFieldGuidance")
    .withIndex("by_proposalSubmilestoneId", (query) =>
      query.eq("proposalSubmilestoneId", proposalSubmilestoneId)
    )
    .unique();
}

type AttachGuidanceBuildLineageInput = ExactBuildLineageAttachmentInput;

const GUIDANCE_BUILD_LINEAGE_CONFLICT =
  "Field Guidance Build lineage is unavailable or conflicting.";

/**
 * Attach an existing mutable Guidance owner to the exact active-Build
 * Sub-milestone.  This only patches missing ownership references; Guidance
 * content, timestamps, and its mutable update actor remain untouched.
 */
export async function attachSubmilestoneFieldGuidanceBuildLineage(
  ctx: MutationCtx,
  input: AttachGuidanceBuildLineageInput
) {
  return await attachExactBuildLineage(ctx, input, {
    conflictMessage: GUIDANCE_BUILD_LINEAGE_CONFLICT,
    findOwner: findFieldGuidance,
  });
}

async function hasActiveBuilderLink(
  ctx: GuidanceContext,
  viewer: AuthorizedViewer,
  proposal: Doc<"buildProposals">,
  workosOrganizationId: string
) {
  if (!(isBuilderViewer(viewer) && proposal.builderProfileId)) {
    return false;
  }

  const builderProfile = await ctx.db.get(proposal.builderProfileId);
  if (
    !builderProfile ||
    builderProfile.status !== "active" ||
    builderProfile.organizationId !== workosOrganizationId ||
    builderProfile.brokerageId !== proposal.brokerageId
  ) {
    return false;
  }

  const links = await ctx.db
    .query("builderAccountLinks")
    .withIndex("by_builder_user", (query) =>
      query
        .eq("builderProfileId", builderProfile._id)
        .eq("workosUserId", viewer.subject)
    )
    .take(21);
  // A bounded read is fail-closed. More than 20 links for one account is not
  // an authoritative active-link result.
  if (links.length > 20) {
    return false;
  }
  return links.some(
    (link) =>
      link.status === "active" &&
      link.brokerageId === proposal.brokerageId &&
      (link.role === "owner" || link.role === "staff")
  );
}

async function hasAssignedContractorReadAccess(
  ctx: QueryCtx,
  viewer: AuthorizedViewer,
  proposal: Doc<"buildProposals">,
  proposalSubmilestone: Doc<"proposalSubmilestones">,
  workosOrganizationId: string
) {
  if (!isContractorViewer(viewer)) {
    return false;
  }

  const candidateBuildSubmilestones = await ctx.db
    .query("buildSubmilestones")
    .withIndex("by_proposalSubmilestoneId", (query) =>
      query.eq("proposalSubmilestoneId", proposalSubmilestone._id)
    )
    .take(501);
  // A bounded candidate read is fail-closed. More than 500 lineage rows is
  // not an authoritative assignment result.
  if (candidateBuildSubmilestones.length > 500) {
    return false;
  }

  const builds = await ctx.db
    .query("activeBuilds")
    .withIndex("by_proposal", (query) => query.eq("proposalId", proposal._id))
    .take(101);
  if (builds.length > 100) {
    return false;
  }

  for (const build of builds) {
    if (!isBuildInProposalScope(build, proposal, workosOrganizationId)) {
      continue;
    }

    for (const buildSubmilestone of candidateBuildSubmilestones) {
      if (
        !isExactBuildSubmilestone(
          buildSubmilestone,
          build,
          proposal,
          proposalSubmilestone,
          workosOrganizationId
        )
      ) {
        continue;
      }
      if (await isAssignedToViewer(ctx, build, buildSubmilestone, viewer)) {
        return true;
      }
    }
  }
  return false;
}

function isBuildInProposalScope(
  build: Doc<"activeBuilds">,
  proposal: Doc<"buildProposals">,
  workosOrganizationId: string
) {
  return (
    build.organizationId === workosOrganizationId &&
    build.brokerageId === proposal.brokerageId &&
    build.proposalId === proposal._id
  );
}

function isExactBuildSubmilestone(
  buildSubmilestone: Doc<"buildSubmilestones">,
  build: Doc<"activeBuilds">,
  proposal: Doc<"buildProposals">,
  proposalSubmilestone: Doc<"proposalSubmilestones">,
  workosOrganizationId: string
) {
  return (
    buildSubmilestone.organizationId === workosOrganizationId &&
    buildSubmilestone.brokerageId === proposal.brokerageId &&
    buildSubmilestone.buildId === build._id &&
    buildSubmilestone.proposalSubmilestoneId === proposalSubmilestone._id
  );
}

async function isAssignedToViewer(
  ctx: QueryCtx,
  build: Doc<"activeBuilds">,
  buildSubmilestone: Doc<"buildSubmilestones">,
  viewer: AuthorizedViewer
) {
  const buildMilestone = await ctx.db.get(buildSubmilestone.buildMilestoneId);
  if (!buildMilestone) {
    return false;
  }
  const ownership = await resolveCanonicalMilestoneExecutionOwnership(ctx, {
    build,
    milestone: buildMilestone,
    submilestone: buildSubmilestone,
  });
  return (
    ownership.state === "assigned" &&
    ownership.contractor?.accountWorkosUserId === viewer.subject
  );
}

async function assertFieldGuidanceReadAccess(
  ctx: QueryCtx,
  viewer: AuthorizedViewer,
  proposal: Doc<"buildProposals">,
  proposalSubmilestone: Doc<"proposalSubmilestones">,
  workosOrganizationId: string
) {
  if (isBackofficeViewer(viewer)) {
    return;
  }
  if (
    (await hasActiveBuilderLink(ctx, viewer, proposal, workosOrganizationId)) ||
    (await hasAssignedContractorReadAccess(
      ctx,
      viewer,
      proposal,
      proposalSubmilestone,
      workosOrganizationId
    ))
  ) {
    return;
  }
  // Do not reveal whether a Guidance row exists, whether a Build exists, or
  // which assignment/profile check failed.
  throw new Error(EMPTY_GUIDANCE_DENIAL);
}

function projectFieldGuidance(
  guidance: Doc<"submilestoneFieldGuidance"> | null
) {
  if (!guidance) {
    return null;
  }
  return {
    _id: guidance._id,
    proposalSubmilestoneId: guidance.proposalSubmilestoneId,
    ...(guidance.buildId ? { buildId: guidance.buildId } : {}),
    ...(guidance.buildSubmilestoneId
      ? { buildSubmilestoneId: guidance.buildSubmilestoneId }
      : {}),
    whatToVerifyTiptapJson: guidance.whatToVerifyTiptapJson,
    cameraAnglesTiptapJson: guidance.cameraAnglesTiptapJson,
    updatedByWorkosUserId: guidance.updatedByWorkosUserId,
    createdAt: guidance.createdAt,
    updatedAt: guidance.updatedAt,
  };
}

async function assertFieldGuidanceTenant(
  ctx: GuidanceContext,
  guidance: Doc<"submilestoneFieldGuidance">,
  proposal: Doc<"buildProposals">,
  proposalSubmilestone: Doc<"proposalSubmilestones">
) {
  if (
    guidance.organizationId !== proposal.organizationId ||
    guidance.brokerageId !== proposal.brokerageId ||
    guidance.proposalId !== proposal._id ||
    guidance.proposalSubmilestoneId !== proposalSubmilestone._id
  ) {
    throw new Error("Forbidden: organization scope");
  }

  if (guidance.buildId) {
    const build = await ctx.db.get(guidance.buildId);
    if (
      !build ||
      build.organizationId !== proposal.organizationId ||
      build.brokerageId !== proposal.brokerageId ||
      build.proposalId !== proposal._id
    ) {
      throw new Error("Forbidden: organization scope");
    }
  }
  if (guidance.buildSubmilestoneId) {
    const buildSubmilestone = await ctx.db.get(guidance.buildSubmilestoneId);
    const build = buildSubmilestone
      ? await ctx.db.get(buildSubmilestone.buildId)
      : null;
    if (
      !(buildSubmilestone && build) ||
      buildSubmilestone.organizationId !== proposal.organizationId ||
      buildSubmilestone.brokerageId !== proposal.brokerageId ||
      buildSubmilestone.proposalSubmilestoneId !== proposalSubmilestone._id ||
      build.organizationId !== proposal.organizationId ||
      build.brokerageId !== proposal.brokerageId ||
      build.proposalId !== proposal._id ||
      (guidance.buildId && buildSubmilestone.buildId !== guidance.buildId)
    ) {
      throw new Error("Forbidden: organization scope");
    }
  }
}

/**
 * Read the latest saved Field Guidance through the Proposal Sub-milestone
 * lineage. The readiness object is intentionally separate from content:
 * planning may save empty TipTap documents, while Site Visit scheduling needs
 * both semantic sections to be present.
 */
export const getSubmilestoneFieldGuidance = authenticatedQuery
  .input({
    proposalSubmilestoneId: v.id("proposalSubmilestones"),
    workosOrganizationId: v.string(),
  })
  .returns(fieldGuidanceResultValidator)
  .handler(async (ctx, args) => {
    const { proposal, proposalSubmilestone } = await loadProposalSubmilestone(
      ctx,
      ctx.viewer,
      args.proposalSubmilestoneId,
      args.workosOrganizationId
    );
    await assertFieldGuidanceReadAccess(
      ctx,
      ctx.viewer,
      proposal,
      proposalSubmilestone,
      args.workosOrganizationId
    );

    const guidance = await findFieldGuidance(ctx, proposalSubmilestone._id);
    if (guidance) {
      await assertFieldGuidanceTenant(
        ctx,
        guidance,
        proposal,
        proposalSubmilestone
      );
    }
    return {
      guidance: projectFieldGuidance(guidance),
      readiness: guidanceReadiness(guidance),
    };
  })
  .public();

/**
 * Replace both canonical TipTap fields in one mutation. There is deliberately
 * no per-field save: readers can only observe the pair as one saved state.
 */
export const saveSubmilestoneFieldGuidance = backofficeMutation
  .input({
    proposalSubmilestoneId: v.id("proposalSubmilestones"),
    whatToVerifyTiptapJson: v.string(),
    cameraAnglesTiptapJson: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const { proposal, proposalSubmilestone } = await loadProposalSubmilestone(
      ctx,
      ctx.viewer,
      args.proposalSubmilestoneId,
      args.workosOrganizationId
    );

    parseTiptapDocument(args.whatToVerifyTiptapJson, "whatToVerifyTiptapJson");
    parseTiptapDocument(args.cameraAnglesTiptapJson, "cameraAnglesTiptapJson");

    const now = Date.now();
    const existing = await findFieldGuidance(ctx, proposalSubmilestone._id);
    if (existing) {
      await assertFieldGuidanceTenant(
        ctx,
        existing,
        proposal,
        proposalSubmilestone
      );
      await ctx.db.patch(existing._id, {
        // Preserve the submitted JSON bytes exactly; no parse/stringify
        // round-trip is allowed to alter key order or whitespace.
        whatToVerifyTiptapJson: args.whatToVerifyTiptapJson,
        cameraAnglesTiptapJson: args.cameraAnglesTiptapJson,
        updatedByWorkosUserId: ctx.viewer.subject,
        updatedAt: now,
      });
      await attachSubmilestoneFieldGuidanceBuildLineage(ctx, {
        brokerageId: proposal.brokerageId,
        organizationId: proposal.organizationId,
        proposalId: proposal._id,
        proposalSubmilestoneId: proposalSubmilestone._id,
      });
      return null;
    }

    // The indexed read and insert are one Convex transaction. Concurrent
    // upserts therefore conflict and retry against the newly-created row,
    // leaving one canonical document for the lineage.
    await ctx.db.insert("submilestoneFieldGuidance", {
      brokerageId: proposal.brokerageId,
      organizationId: proposal.organizationId,
      proposalId: proposal._id,
      proposalSubmilestoneId: proposalSubmilestone._id,
      whatToVerifyTiptapJson: args.whatToVerifyTiptapJson,
      cameraAnglesTiptapJson: args.cameraAnglesTiptapJson,
      updatedByWorkosUserId: ctx.viewer.subject,
      createdAt: now,
      updatedAt: now,
    });
    await attachSubmilestoneFieldGuidanceBuildLineage(ctx, {
      brokerageId: proposal.brokerageId,
      organizationId: proposal.organizationId,
      proposalId: proposal._id,
      proposalSubmilestoneId: proposalSubmilestone._id,
    });
    return null;
  })
  .public();

/**
 * Persist one canonical Guidance pair while ordering a Site Visit.  This
 * helper intentionally has no auth boundary: its caller must already have
 * authorized the active Build and validated the exact Proposal-to-Build
 * lineage.  It shares the same owner row as the regular Guidance mutation so
 * the Site Visit command does not create a second mutable source of truth.
 */
export async function upsertSiteVisitFieldGuidance(
  ctx: MutationCtx,
  input: {
    brokerageId: Id<"brokerages">;
    buildId: Id<"activeBuilds">;
    buildSubmilestoneId: Id<"buildSubmilestones">;
    cameraAnglesTiptapJson: string;
    now: number;
    organizationId: string;
    proposalId: Id<"buildProposals">;
    proposalSubmilestoneId: Id<"proposalSubmilestones">;
    updatedByWorkosUserId: string;
    whatToVerifyTiptapJson: string;
  }
) {
  assertCompleteSiteVisitFieldGuidance(input);
  const existing = await findFieldGuidance(ctx, input.proposalSubmilestoneId);
  if (existing) {
    if (
      existing.organizationId !== input.organizationId ||
      existing.brokerageId !== input.brokerageId ||
      existing.proposalId !== input.proposalId ||
      existing.proposalSubmilestoneId !== input.proposalSubmilestoneId ||
      (existing.buildId !== undefined && existing.buildId !== input.buildId) ||
      (existing.buildSubmilestoneId !== undefined &&
        existing.buildSubmilestoneId !== input.buildSubmilestoneId)
    ) {
      throw new Error("Field Guidance lineage is unavailable or conflicting.");
    }
    await ctx.db.patch(existing._id, {
      buildId: input.buildId,
      buildSubmilestoneId: input.buildSubmilestoneId,
      cameraAnglesTiptapJson: input.cameraAnglesTiptapJson,
      updatedAt: input.now,
      updatedByWorkosUserId: input.updatedByWorkosUserId,
      whatToVerifyTiptapJson: input.whatToVerifyTiptapJson,
    });
    return existing._id;
  }

  return await ctx.db.insert("submilestoneFieldGuidance", {
    brokerageId: input.brokerageId,
    buildId: input.buildId,
    buildSubmilestoneId: input.buildSubmilestoneId,
    cameraAnglesTiptapJson: input.cameraAnglesTiptapJson,
    createdAt: input.now,
    organizationId: input.organizationId,
    proposalId: input.proposalId,
    proposalSubmilestoneId: input.proposalSubmilestoneId,
    updatedAt: input.now,
    updatedByWorkosUserId: input.updatedByWorkosUserId,
    whatToVerifyTiptapJson: input.whatToVerifyTiptapJson,
  });
}
