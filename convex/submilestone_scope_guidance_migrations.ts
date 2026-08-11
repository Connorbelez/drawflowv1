import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { resolveExactBuildLineage } from "./fluent";
import { migrations } from "./migrations";
import { attachSubmilestoneFieldGuidanceBuildLineage } from "./submilestone_field_guidance";
import {
  attachSubmilestoneScopeBuildLineage,
  resolveEffectiveScopeRevisionForBuildSubmilestone,
} from "./submilestone_scope_contracts";
import type { MutationCtx } from "./types";

const BATCH_SIZE = 25;
const MIGRATION_ACTOR = "migration:submilestone-scope-guidance-cutover";
const DISTINCT_BUILD_SCOPE_REASON =
  "Migration preserved distinct active Build Scope content.";

interface ScopeSource {
  scopeOfWorkTiptapJson: string;
  source: "build" | "generated" | "proposal";
}

type LegacyProposalSubmilestone = Doc<"proposalSubmilestones"> & {
  scopeOfWorkTiptapJson?: string;
};

type LegacyBuildSubmilestone = Doc<"buildSubmilestones"> & {
  scopeOfWorkTiptapJson?: string;
};

type LegacyProposalScopePatch = (
  id: Id<"proposalSubmilestones">,
  patch: { scopeOfWorkTiptapJson: undefined }
) => Promise<void>;

type LegacyBuildScopePatch = (
  id: Id<"buildSubmilestones">,
  patch: { scopeOfWorkTiptapJson: undefined }
) => Promise<void>;

function legacyProposalScope(row: Doc<"proposalSubmilestones">) {
  return (row as LegacyProposalSubmilestone).scopeOfWorkTiptapJson;
}

function legacyBuildScope(row: Doc<"buildSubmilestones"> | undefined) {
  return (row as LegacyBuildSubmilestone | undefined)?.scopeOfWorkTiptapJson;
}

async function unsetLegacyProposalScope(
  ctx: MutationCtx,
  id: Id<"proposalSubmilestones">
) {
  await (ctx.db.patch as unknown as LegacyProposalScopePatch)(id, {
    scopeOfWorkTiptapJson: undefined,
  });
}

async function unsetLegacyBuildScope(
  ctx: MutationCtx,
  id: Id<"buildSubmilestones">
) {
  await (ctx.db.patch as unknown as LegacyBuildScopePatch)(id, {
    scopeOfWorkTiptapJson: undefined,
  });
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
  if (record.type === "horizontalRule") {
    return true;
  }
  if (record.type === "image") {
    const attrs =
      record.attrs && typeof record.attrs === "object"
        ? (record.attrs as Record<string, unknown>)
        : undefined;
    return typeof attrs?.src === "string" && Boolean(attrs.src.trim());
  }
  return (
    Array.isArray(record.content) &&
    record.content.some(hasSemanticTiptapContent)
  );
}

/** Returns the original bytes only when they are a non-empty TipTap document. */
export function validNonEmptyTiptapJson(value: string | undefined) {
  if (!value?.trim()) {
    return;
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !("type" in parsed) ||
      parsed.type !== "doc" ||
      !hasSemanticTiptapContent(parsed)
    ) {
      return;
    }
    return value;
  } catch {
    return;
  }
}

function textTiptapDocument(text: string) {
  return JSON.stringify({
    content: [
      {
        content: [{ text, type: "text" }],
        type: "paragraph",
      },
    ],
    type: "doc",
  });
}

function generatedScope(proposalSubmilestone: Doc<"proposalSubmilestones">) {
  return textTiptapDocument(
    `Migration-generated test Scope for Sub-milestone "${proposalSubmilestone.name}" (${proposalSubmilestone.key}).`
  );
}

function generatedGuidance(
  proposalSubmilestone: Doc<"proposalSubmilestones">,
  kind: "cameraAngles" | "whatToVerify"
) {
  const instruction =
    kind === "whatToVerify"
      ? "Verify completed work against the approved plans and visible quality requirements."
      : "Capture a wide context view and detailed views of the completed work.";
  return textTiptapDocument(
    `Migration-generated test Field Guidance for Sub-milestone "${proposalSubmilestone.name}" (${proposalSubmilestone.key}): ${instruction}`
  );
}

function guidanceSourceText(value: string | string[] | undefined) {
  if (typeof value === "string") {
    return value.trim() || undefined;
  }
  const lines = value?.map((item) => item.trim()).filter(Boolean);
  return lines && lines.length > 0 ? lines.join("\n") : undefined;
}

function historicalPublicationTimestamp(proposal: Doc<"buildProposals">) {
  return (
    proposal.submittedAt ??
    proposal.approvedAt ??
    proposal.closedAt ??
    proposal.updatedAt
  );
}

function resolveLegacyScopePlan(
  proposalSubmilestone: Doc<"proposalSubmilestones">,
  buildSubmilestone: Doc<"buildSubmilestones"> | undefined,
  proposalStatus: Doc<"buildProposals">["status"]
) {
  const proposalScope = validNonEmptyTiptapJson(
    legacyProposalScope(proposalSubmilestone)
  );
  const buildScope = validNonEmptyTiptapJson(
    legacyBuildScope(buildSubmilestone)
  );
  const firstSource: ScopeSource = proposalScope
    ? { scopeOfWorkTiptapJson: proposalScope, source: "proposal" }
    : buildScope
      ? { scopeOfWorkTiptapJson: buildScope, source: "build" }
      : {
          scopeOfWorkTiptapJson: generatedScope(proposalSubmilestone),
          source: "generated",
        };
  const distinctBuildScope =
    proposalScope && buildScope && buildScope !== proposalScope
      ? buildScope
      : undefined;
  if (proposalStatus === "draft" && distinctBuildScope) {
    throw new Error(
      "Scope migration cannot attach an active Build Scope to a draft Proposal lineage."
    );
  }
  return { distinctBuildScope, firstSource };
}

function assertExistingContractLineage(
  contract: Doc<"submilestoneScopeContracts">,
  proposalSubmilestone: Doc<"proposalSubmilestones">
) {
  if (
    contract.brokerageId !== proposalSubmilestone.brokerageId ||
    contract.organizationId !== proposalSubmilestone.organizationId ||
    contract.proposalId !== proposalSubmilestone.proposalId
  ) {
    throw new Error("Scope migration found a cross-lineage contract.");
  }
}

export const backfillSubmilestoneScopeContracts = migrations.define({
  batchSize: BATCH_SIZE,
  table: "proposalSubmilestones",
  migrateOne: async (ctx, proposalSubmilestone) => {
    const existingContracts = await ctx.db
      .query("submilestoneScopeContracts")
      .withIndex("by_proposalSubmilestoneId", (query) =>
        query.eq("proposalSubmilestoneId", proposalSubmilestone._id)
      )
      .take(2);
    if (existingContracts.length > 1) {
      throw new Error(
        `Scope migration found duplicate contracts for Proposal Sub-milestone ${proposalSubmilestone._id}.`
      );
    }
    const existingContract = existingContracts[0];
    if (existingContract) {
      assertExistingContractLineage(existingContract, proposalSubmilestone);
      return;
    }

    const proposal = await ctx.db.get(proposalSubmilestone.proposalId);
    if (
      !proposal ||
      proposal.brokerageId !== proposalSubmilestone.brokerageId ||
      proposal.organizationId !== proposalSubmilestone.organizationId
    ) {
      throw new Error("Scope migration Proposal lineage is unavailable.");
    }
    const buildLineage = await resolveExactBuildLineage(
      ctx,
      {
        brokerageId: proposalSubmilestone.brokerageId,
        organizationId: proposalSubmilestone.organizationId,
        proposalId: proposalSubmilestone.proposalId,
        proposalSubmilestoneId: proposalSubmilestone._id,
      },
      "Scope migration Build lineage is unavailable or conflicting."
    );
    const { distinctBuildScope, firstSource } = resolveLegacyScopePlan(
      proposalSubmilestone,
      buildLineage?.buildSubmilestone,
      proposal.status
    );

    const isDraft = proposal.status === "draft";
    const v1Timestamp = isDraft
      ? proposalSubmilestone.updatedAt
      : historicalPublicationTimestamp(proposal);
    const latestVersion = distinctBuildScope ? 2 : 1;
    const contractId = await ctx.db.insert("submilestoneScopeContracts", {
      brokerageId: proposalSubmilestone.brokerageId,
      organizationId: proposalSubmilestone.organizationId,
      proposalId: proposalSubmilestone.proposalId,
      proposalSubmilestoneId: proposalSubmilestone._id,
      latestVersion,
      createdAt: proposalSubmilestone.createdAt,
      updatedAt: v1Timestamp,
    });
    const v1RevisionId = await ctx.db.insert("submilestoneScopeRevisions", {
      brokerageId: proposalSubmilestone.brokerageId,
      organizationId: proposalSubmilestone.organizationId,
      proposalId: proposalSubmilestone.proposalId,
      proposalSubmilestoneId: proposalSubmilestone._id,
      contractId,
      version: 1,
      status: isDraft ? "draft" : "published",
      scopeOfWorkTiptapJson: firstSource.scopeOfWorkTiptapJson,
      authoredByWorkosUserId: MIGRATION_ACTOR,
      createdAt: proposalSubmilestone.createdAt,
      savedAt: v1Timestamp,
      ...(isDraft
        ? {}
        : {
            publishedAt: v1Timestamp,
            publishedByWorkosUserId: MIGRATION_ACTOR,
          }),
      changeReason: `Migration imported ${firstSource.source} Scope content.`,
    });

    let effectiveRevisionId: Id<"submilestoneScopeRevisions"> | undefined =
      isDraft ? undefined : v1RevisionId;
    let updatedAt = v1Timestamp;
    if (distinctBuildScope && buildLineage) {
      updatedAt = Math.max(
        v1Timestamp,
        buildLineage.buildSubmilestone.updatedAt
      );
      effectiveRevisionId = await ctx.db.insert("submilestoneScopeRevisions", {
        brokerageId: proposalSubmilestone.brokerageId,
        organizationId: proposalSubmilestone.organizationId,
        proposalId: proposalSubmilestone.proposalId,
        proposalSubmilestoneId: proposalSubmilestone._id,
        contractId,
        version: 2,
        status: "published",
        scopeOfWorkTiptapJson: distinctBuildScope,
        basedOnRevisionId: v1RevisionId,
        authoredByWorkosUserId: MIGRATION_ACTOR,
        createdAt: updatedAt,
        savedAt: updatedAt,
        publishedAt: updatedAt,
        publishedByWorkosUserId: MIGRATION_ACTOR,
        changeReason: DISTINCT_BUILD_SCOPE_REASON,
      });
    }
    await ctx.db.patch(contractId, {
      ...(isDraft
        ? { activeDraftRevisionId: v1RevisionId }
        : { effectiveRevisionId }),
      updatedAt,
    });
  },
});

export const backfillSubmilestoneFieldGuidance = migrations.define({
  batchSize: BATCH_SIZE,
  table: "proposalSubmilestones",
  migrateOne: async (ctx, proposalSubmilestone) => {
    const existingRows = await ctx.db
      .query("submilestoneFieldGuidance")
      .withIndex("by_proposalSubmilestoneId", (query) =>
        query.eq("proposalSubmilestoneId", proposalSubmilestone._id)
      )
      .take(2);
    if (existingRows.length > 1) {
      throw new Error(
        `Field Guidance migration found duplicate rows for Proposal Sub-milestone ${proposalSubmilestone._id}.`
      );
    }
    const existing = existingRows[0];
    if (existing) {
      if (
        existing.brokerageId !== proposalSubmilestone.brokerageId ||
        existing.organizationId !== proposalSubmilestone.organizationId ||
        existing.proposalId !== proposalSubmilestone.proposalId
      ) {
        throw new Error("Field Guidance migration found a cross-lineage row.");
      }
      return;
    }

    const proposalMilestone = await ctx.db.get(
      proposalSubmilestone.proposalMilestoneId
    );
    if (
      !proposalMilestone ||
      proposalMilestone.brokerageId !== proposalSubmilestone.brokerageId ||
      proposalMilestone.organizationId !==
        proposalSubmilestone.organizationId ||
      proposalMilestone.proposalId !== proposalSubmilestone.proposalId
    ) {
      throw new Error(
        "Field Guidance migration milestone lineage is unavailable."
      );
    }
    const whatToVerify = guidanceSourceText(
      proposalMilestone.siteVisitGuidance?.whatToVerify
    );
    const cameraAngles = guidanceSourceText(
      proposalMilestone.siteVisitGuidance?.cameraAngles
    );
    await ctx.db.insert("submilestoneFieldGuidance", {
      brokerageId: proposalSubmilestone.brokerageId,
      organizationId: proposalSubmilestone.organizationId,
      proposalId: proposalSubmilestone.proposalId,
      proposalSubmilestoneId: proposalSubmilestone._id,
      whatToVerifyTiptapJson: whatToVerify
        ? textTiptapDocument(whatToVerify)
        : generatedGuidance(proposalSubmilestone, "whatToVerify"),
      cameraAnglesTiptapJson: cameraAngles
        ? textTiptapDocument(cameraAngles)
        : generatedGuidance(proposalSubmilestone, "cameraAngles"),
      updatedByWorkosUserId: MIGRATION_ACTOR,
      createdAt: proposalSubmilestone.createdAt,
      updatedAt: proposalSubmilestone.updatedAt,
    });
  },
});

export const linkBuildSubmilestoneLineage = migrations.define({
  batchSize: BATCH_SIZE,
  table: "proposalSubmilestones",
  migrateOne: async (ctx, proposalSubmilestone) => {
    const lineage = {
      brokerageId: proposalSubmilestone.brokerageId,
      organizationId: proposalSubmilestone.organizationId,
      proposalId: proposalSubmilestone.proposalId,
      proposalSubmilestoneId: proposalSubmilestone._id,
    };
    await attachSubmilestoneScopeBuildLineage(ctx, lineage);
    await attachSubmilestoneFieldGuidanceBuildLineage(ctx, lineage);
  },
});

/**
 * Normalizes mutable Quote Round draft rows only. Historical published Package
 * Revision labour lines remain byte-for-byte immutable and deliberately keep
 * optional source identity when they predate this cutover.
 */
export const backfillQuoteRoundDraftScopePins = migrations.define({
  batchSize: BATCH_SIZE,
  table: "quoteRoundDraftLabourScope",
  migrateOne: async (ctx, row) => {
    if (
      row.sourceScopeRevisionId !== undefined &&
      row.sourceScopeVersion !== undefined &&
      row.scopeOfWorkTiptapJson !== undefined
    ) {
      return;
    }
    const buildSubmilestone = await ctx.db.get(row.buildSubmilestoneId);
    if (
      !buildSubmilestone ||
      buildSubmilestone.brokerageId !== row.brokerageId ||
      buildSubmilestone.organizationId !== row.organizationId ||
      buildSubmilestone.buildId !== row.buildId
    ) {
      throw new Error(
        "Quote draft Scope migration Build lineage is unavailable."
      );
    }
    const build = await ctx.db.get(row.buildId);
    if (
      !build ||
      build.brokerageId !== row.brokerageId ||
      build.organizationId !== row.organizationId
    ) {
      throw new Error("Quote draft Scope migration Build is unavailable.");
    }
    const quoteRound = await ctx.db.get(row.quoteRoundId);
    if (
      !quoteRound ||
      quoteRound.brokerageId !== row.brokerageId ||
      quoteRound.organizationId !== row.organizationId ||
      quoteRound.buildId !== row.buildId ||
      quoteRound.proposalId !== build.proposalId
    ) {
      throw new Error(
        "Quote draft Scope migration Quote Round is unavailable."
      );
    }
    const exactLineage = await resolveExactBuildLineage(
      ctx,
      {
        brokerageId: row.brokerageId,
        organizationId: row.organizationId,
        proposalId: build.proposalId,
        proposalSubmilestoneId: buildSubmilestone.proposalSubmilestoneId,
      },
      "Quote draft Scope migration Build lineage is unavailable or conflicting."
    );
    if (
      !exactLineage ||
      exactLineage.build._id !== build._id ||
      exactLineage.buildSubmilestone._id !== buildSubmilestone._id
    ) {
      throw new Error(
        "Quote draft Scope migration exact Build owner is unavailable."
      );
    }
    const revision = await resolveEffectiveScopeRevisionForBuildSubmilestone(
      ctx,
      {
        brokerageId: row.brokerageId,
        buildId: build._id,
        buildSubmilestoneId: buildSubmilestone._id,
        organizationId: row.organizationId,
        proposalId: build.proposalId,
        proposalSubmilestoneId: buildSubmilestone.proposalSubmilestoneId,
      }
    );
    if (!revision) {
      throw new Error(
        "Quote draft Scope migration requires an effective published Scope revision."
      );
    }
    return {
      sourceScopeRevisionId: revision._id,
      sourceScopeVersion: revision.version,
      sourceScopeChangeReason: revision.changeReason,
      scopeOfWorkTiptapJson: revision.scopeOfWorkTiptapJson,
    };
  },
});

/**
 * Destructive narrowing preparation. Run only after the additive migration and
 * every canonical parity/hash gate have passed.
 */
export const cleanupProposalSubmilestoneLegacyScopeFields = migrations.define({
  batchSize: BATCH_SIZE,
  table: "proposalSubmilestones",
  migrateOne: async (ctx, proposalSubmilestone) => {
    if (legacyProposalScope(proposalSubmilestone) === undefined) {
      return;
    }
    await unsetLegacyProposalScope(ctx, proposalSubmilestone._id);
  },
});

/**
 * Destructive narrowing preparation. `fieldNote` is a separate execution note
 * and is intentionally preserved.
 */
export const cleanupBuildSubmilestoneLegacyScopeFields = migrations.define({
  batchSize: BATCH_SIZE,
  table: "buildSubmilestones",
  migrateOne: async (ctx, buildSubmilestone) => {
    if (legacyBuildScope(buildSubmilestone) === undefined) {
      return;
    }
    await unsetLegacyBuildScope(ctx, buildSubmilestone._id);
  },
});

export const runSubmilestoneScopeGuidanceBackfill = migrations.runner([
  internal.submilestone_scope_guidance_migrations
    .backfillSubmilestoneScopeContracts,
  internal.submilestone_scope_guidance_migrations
    .backfillSubmilestoneFieldGuidance,
  internal.submilestone_scope_guidance_migrations.linkBuildSubmilestoneLineage,
  internal.submilestone_scope_guidance_migrations
    .backfillQuoteRoundDraftScopePins,
]);

export const runSubmilestoneLegacyScopeFieldCleanup = migrations.runner([
  internal.submilestone_scope_guidance_migrations
    .cleanupProposalSubmilestoneLegacyScopeFields,
  internal.submilestone_scope_guidance_migrations
    .cleanupBuildSubmilestoneLegacyScopeFields,
]);
