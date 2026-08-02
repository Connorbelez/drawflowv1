import { v } from "convex/values";

import type { ActiveBuildAuthorization } from "./activeBuildAccess";
import { authorizeActiveBuildAccess } from "./activeBuildAccess";
import { authenticatedMutation, authenticatedQuery } from "./authz";
import { isCleanCollaborationAsset } from "./build_collaboration_asset_access";
import { enqueueTransactionalEmail } from "./email_transport";
import type { Doc, Id, MutationCtx, QueryCtx } from "./types";

const SUPPORTING_CONTEXT_DISCLOSURE =
  "This Cost Document does not prove payment, completion, reimbursement eligibility, Draw inclusion, or approval.";
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_PAGES = 50;
const MAX_ALLOCATIONS = 100;

const costDocumentKindValidator = v.union(
  v.literal("invoice"),
  v.literal("receipt")
);
const costDocumentCategoryValidator = v.union(
  v.literal("labour"),
  v.literal("materials")
);

const costDocumentPageProjectionValidator = v.object({
  assetId: v.id("buildCollaborationAssets"),
  contentHashSha256: v.string(),
  fileName: v.string(),
  mimeType: v.string(),
  order: v.number(),
});

const costDocumentAllocationProjectionValidator = v.object({
  amountCents: v.number(),
  buildSubmilestoneId: v.id("buildSubmilestones"),
  order: v.number(),
  submilestoneKey: v.string(),
  submilestoneName: v.string(),
});

const costDocumentProjectionValidator = v.object({
  _id: v.id("costDocuments"),
  allocations: v.array(costDocumentAllocationProjectionValidator),
  category: costDocumentCategoryValidator,
  currency: v.literal("CAD"),
  description: v.optional(v.string()),
  documentDate: v.string(),
  grossTotalCents: v.number(),
  kind: costDocumentKindValidator,
  pages: v.array(costDocumentPageProjectionValidator),
  state: v.literal("submitted"),
  submittedAt: v.number(),
  supportingContextDisclosure: v.string(),
  title: v.string(),
  uploaderWorkosUserId: v.string(),
  vendorName: v.string(),
});

const activeBuildScopeFields = {
  buildId: v.id("activeBuilds"),
  organizationId: v.string(),
};

export const submitCostDocument = authenticatedMutation
  .input({
    ...activeBuildScopeFields,
    allocations: v.array(
      v.object({
        amountCents: v.number(),
        buildSubmilestoneId: v.id("buildSubmilestones"),
      })
    ),
    category: costDocumentCategoryValidator,
    currency: v.literal("CAD"),
    description: v.optional(v.string()),
    documentDate: v.string(),
    grossTotalCents: v.number(),
    kind: costDocumentKindValidator,
    pageAssetIds: v.array(v.id("buildCollaborationAssets")),
    title: v.string(),
    vendorName: v.string(),
  })
  .returns(v.id("costDocuments"))
  .handler(async (ctx, args) => {
    const authorization = await authorizeCostDocumentBuilder(ctx, args);
    const now = Date.now();
    const title = requiredText(args.title, "Title", 240);
    const vendorName = requiredText(args.vendorName, "Vendor", 240);
    const description = optionalText(args.description, "Description", 4_000);
    const documentDate = requiredDocumentDate(args.documentDate);
    const grossTotalCents = positiveCents(
      args.grossTotalCents,
      "Gross Document Total"
    );
    const pages = await requireAvailableSourcePages(ctx, authorization, {
      now,
      pageAssetIds: args.pageAssetIds,
    });
    const allocations = await requireExactAllocations(ctx, authorization, {
      allocations: args.allocations,
      grossTotalCents,
    });
    const uploaderEmail = authorization.viewer.email?.trim().toLowerCase();
    if (!uploaderEmail) {
      throw new Error("A verified uploader email is required for the receipt.");
    }

    const costDocumentId = await ctx.db.insert("costDocuments", {
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      category: args.category,
      createdAt: now,
      currency: "CAD",
      description,
      documentDate,
      grossTotalCents,
      kind: args.kind,
      organizationId: authorization.organizationId,
      state: "submitted",
      submittedAt: now,
      title,
      uploaderEmailSnapshot: uploaderEmail,
      uploaderWorkosUserId: authorization.viewer.subject,
      vendorName,
    });

    for (const [index, asset] of pages.entries()) {
      await ctx.db.insert("costDocumentPages", {
        assetId: asset._id,
        brokerageId: authorization.brokerage._id,
        buildId: authorization.build._id,
        contentHashSha256Snapshot: requiredAssetHash(asset),
        costDocumentId,
        createdAt: now,
        fileNameSnapshot: asset.fileName,
        mimeTypeSnapshot: asset.mimeType,
        order: index + 1,
        organizationId: authorization.organizationId,
      });
      await ctx.db.patch(asset._id, {
        publishedAt: asset.publishedAt ?? now,
      });
    }
    for (const [index, allocation] of allocations.entries()) {
      await ctx.db.insert("costDocumentAllocations", {
        amountCents: allocation.amountCents,
        brokerageId: authorization.brokerage._id,
        buildId: authorization.build._id,
        buildSubmilestoneId: allocation.submilestone._id,
        costDocumentId,
        createdAt: now,
        order: index + 1,
        organizationId: authorization.organizationId,
        submilestoneKeySnapshot: allocation.submilestone.key,
        submilestoneNameSnapshot: allocation.submilestone.name,
      });
    }

    await ctx.db.insert("auditEvents", {
      actorRoles: authorization.viewer.roles,
      actorWorkosUserId: authorization.viewer.subject,
      brokerageId: authorization.brokerage._id,
      command: "submitCostDocument",
      createdAt: now,
      entityId: String(costDocumentId),
      entityType: "costDocument",
      eventType: "cost_document.submitted",
      newState: JSON.stringify({
        allocationCount: allocations.length,
        category: args.category,
        currency: "CAD",
        grossTotalCents,
        kind: args.kind,
        pageCount: pages.length,
        state: "submitted",
      }),
      organizationId: authorization.organizationId,
      warnings: [],
    });
    await ctx.db.insert("eventOutbox", {
      brokerageId: authorization.brokerage._id,
      createdAt: now,
      eventType: "cost_document.submitted",
      organizationId: authorization.organizationId,
      payloadPreview: JSON.stringify({
        buildId: authorization.build._id,
        grossTotalCents,
        state: "submitted",
      }),
      relatedEntityId: String(costDocumentId),
      relatedEntityType: "costDocument",
      status: "pending",
    });
    await enqueueTransactionalEmail(ctx, {
      brokerageId: authorization.brokerage._id,
      idempotencyKey: `cost-document:${costDocumentId}:submitted-receipt`,
      organizationId: authorization.organizationId,
      recipientEmail: uploaderEmail,
      relatedEntityId: String(costDocumentId),
      relatedEntityType: "costDocument",
      subject: `Cost Document submitted: ${title}`,
      text: [
        `${args.kind === "invoice" ? "Invoice" : "Receipt"} “${title}” was submitted for ${formatCad(grossTotalCents)} CAD.`,
        SUPPORTING_CONTEXT_DISCLOSURE,
      ].join("\n\n"),
    });
    return costDocumentId;
  })
  .public();

export const getCostDocument = authenticatedQuery
  .input({
    ...activeBuildScopeFields,
    costDocumentId: v.id("costDocuments"),
  })
  .returns(v.union(costDocumentProjectionValidator, v.null()))
  .handler(async (ctx, args) => {
    const authorization = await authorizeCostDocumentBuilder(ctx, args);
    const document = await ctx.db.get(args.costDocumentId);
    if (!isDocumentInScope(document, authorization)) {
      return null;
    }
    return await projectCostDocument(ctx, document);
  })
  .public();

export const authorizeCostDocumentPageDownload = authenticatedMutation
  .input({
    ...activeBuildScopeFields,
    assetId: v.id("buildCollaborationAssets"),
    costDocumentId: v.id("costDocuments"),
  })
  .returns(v.string())
  .handler(async (ctx, args) => {
    const authorization = await authorizeCostDocumentBuilder(ctx, args);
    const document = await ctx.db.get(args.costDocumentId);
    if (!isDocumentInScope(document, authorization)) {
      throw new Error("The Cost Document is unavailable.");
    }
    const page = await ctx.db
      .query("costDocumentPages")
      .withIndex("by_buildId_and_assetId", (query) =>
        query.eq("buildId", authorization.build._id).eq("assetId", args.assetId)
      )
      .filter((query) => query.eq(query.field("costDocumentId"), document._id))
      .unique();
    if (!page) {
      throw new Error("The Cost Document page is unavailable.");
    }
    const asset = await ctx.db.get(page.assetId);
    if (
      !asset ||
      asset.organizationId !== authorization.organizationId ||
      asset.brokerageId !== authorization.brokerage._id ||
      !isCleanCollaborationAsset(asset)
    ) {
      throw new Error("The Cost Document page is unavailable.");
    }
    const url = await ctx.storage.getUrl(asset.storageId);
    if (!url) {
      throw new Error("The Cost Document page file is unavailable.");
    }
    await ctx.db.insert("auditEvents", {
      actorRoles: authorization.viewer.roles,
      actorWorkosUserId: authorization.viewer.subject,
      brokerageId: authorization.brokerage._id,
      command: "authorizeCostDocumentPageDownload",
      createdAt: Date.now(),
      entityId: String(document._id),
      entityType: "costDocument",
      eventType: "cost_document.page_download_authorized",
      newState: JSON.stringify({
        assetId: asset._id,
        pageOrder: page.order,
      }),
      organizationId: authorization.organizationId,
      warnings: [],
    });
    return url;
  })
  .public();

type AuthorizedCostDocumentCtx = (QueryCtx | MutationCtx) & {
  viewer: ActiveBuildAuthorization["viewer"];
};

async function authorizeCostDocumentBuilder(
  ctx: AuthorizedCostDocumentCtx,
  input: { buildId: Id<"activeBuilds">; organizationId: string }
) {
  const authorization = await authorizeActiveBuildAccess(ctx, input);
  if (
    authorization.viewer.actorKind !== "human" ||
    (authorization.effectiveRole.role !== "builder" &&
      authorization.effectiveRole.role !== "builder-staff")
  ) {
    throw new Error("Forbidden: Cost Document Builder access");
  }
  return authorization;
}

async function requireAvailableSourcePages(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  input: { now: number; pageAssetIds: Id<"buildCollaborationAssets">[] }
) {
  if (
    input.pageAssetIds.length < 1 ||
    input.pageAssetIds.length > MAX_PAGES ||
    new Set(input.pageAssetIds).size !== input.pageAssetIds.length
  ) {
    throw new Error(`A Cost Document requires 1-${MAX_PAGES} unique pages.`);
  }
  const pages: Doc<"buildCollaborationAssets">[] = [];
  for (const assetId of input.pageAssetIds) {
    const asset = await ctx.db.get(assetId);
    const session = asset?.stagingSessionId
      ? await ctx.db.get(asset.stagingSessionId)
      : null;
    if (
      !asset ||
      asset.organizationId !== authorization.organizationId ||
      asset.brokerageId !== authorization.brokerage._id ||
      asset.buildId !== authorization.build._id ||
      !isCleanCollaborationAsset(asset) ||
      asset.publishedAt ||
      !session ||
      session.organizationId !== authorization.organizationId ||
      session.buildId !== authorization.build._id ||
      session.ownerWorkosUserId !== authorization.viewer.subject ||
      session.state !== "finalized" ||
      session.expiresAt <= input.now
    ) {
      throw new Error("Every Cost Document source page must be available.");
    }
    pages.push(asset);
  }
  return pages;
}

async function requireExactAllocations(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  input: {
    allocations: {
      amountCents: number;
      buildSubmilestoneId: Id<"buildSubmilestones">;
    }[];
    grossTotalCents: number;
  }
) {
  if (
    input.allocations.length < 1 ||
    input.allocations.length > MAX_ALLOCATIONS ||
    new Set(input.allocations.map((allocation) => allocation.buildSubmilestoneId))
      .size !== input.allocations.length
  ) {
    throw new Error(
      `A Cost Document requires 1-${MAX_ALLOCATIONS} unique Cost Allocations.`
    );
  }
  let allocatedCents = 0;
  const allocations: {
    amountCents: number;
    submilestone: Doc<"buildSubmilestones">;
  }[] = [];
  for (const allocation of input.allocations) {
    const amountCents = positiveCents(
      allocation.amountCents,
      "Cost Allocation amount"
    );
    allocatedCents += amountCents;
    if (!Number.isSafeInteger(allocatedCents)) {
      throw new Error("Cost Allocation total exceeds safe integer cents.");
    }
    const submilestone = await ctx.db.get(allocation.buildSubmilestoneId);
    if (
      !submilestone ||
      submilestone.organizationId !== authorization.organizationId ||
      submilestone.brokerageId !== authorization.brokerage._id ||
      submilestone.buildId !== authorization.build._id
    ) {
      throw new Error("Cost Allocation Sub-milestone is unavailable.");
    }
    allocations.push({ amountCents, submilestone });
  }
  if (allocatedCents !== input.grossTotalCents) {
    throw new Error(
      "Cost Allocations must equal the Gross Document Total exactly."
    );
  }
  return allocations;
}

async function projectCostDocument(
  ctx: QueryCtx,
  document: Doc<"costDocuments">
) {
  const [pages, allocations] = await Promise.all([
    ctx.db
      .query("costDocumentPages")
      .withIndex("by_costDocumentId_and_order", (query) =>
        query.eq("costDocumentId", document._id)
      )
      .order("asc")
      .collect(),
    ctx.db
      .query("costDocumentAllocations")
      .withIndex("by_costDocumentId_and_order", (query) =>
        query.eq("costDocumentId", document._id)
      )
      .order("asc")
      .collect(),
  ]);
  return {
    _id: document._id,
    allocations: allocations.map((allocation) => ({
      amountCents: allocation.amountCents,
      buildSubmilestoneId: allocation.buildSubmilestoneId,
      order: allocation.order,
      submilestoneKey: allocation.submilestoneKeySnapshot,
      submilestoneName: allocation.submilestoneNameSnapshot,
    })),
    category: document.category,
    currency: document.currency,
    description: document.description,
    documentDate: document.documentDate,
    grossTotalCents: document.grossTotalCents,
    kind: document.kind,
    pages: pages.map((page) => ({
      assetId: page.assetId,
      contentHashSha256: page.contentHashSha256Snapshot,
      fileName: page.fileNameSnapshot,
      mimeType: page.mimeTypeSnapshot,
      order: page.order,
    })),
    state: document.state,
    submittedAt: document.submittedAt,
    supportingContextDisclosure: SUPPORTING_CONTEXT_DISCLOSURE,
    title: document.title,
    uploaderWorkosUserId: document.uploaderWorkosUserId,
    vendorName: document.vendorName,
  };
}

function isDocumentInScope(
  document: Doc<"costDocuments"> | null,
  authorization: ActiveBuildAuthorization
): document is Doc<"costDocuments"> {
  return Boolean(
    document &&
      document.organizationId === authorization.organizationId &&
      document.brokerageId === authorization.brokerage._id &&
      document.buildId === authorization.build._id
  );
}

function requiredText(value: string, label: string, maxLength: number) {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${label} is required.`);
  }
  if (normalized.length > maxLength) {
    throw new Error(`${label} must be at most ${maxLength} characters.`);
  }
  return normalized;
}

function optionalText(
  value: string | undefined,
  label: string,
  maxLength: number
) {
  if (value === undefined) {
    return;
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new Error(`${label} must be at most ${maxLength} characters.`);
  }
  return normalized || undefined;
}

function requiredDocumentDate(value: string) {
  const normalized = value.trim();
  if (
    !DATE_PATTERN.test(normalized) ||
    Number.isNaN(Date.parse(`${normalized}T00:00:00.000Z`))
  ) {
    throw new Error("Document date must be a valid YYYY-MM-DD date.");
  }
  return normalized;
}

function positiveCents(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer number of cents.`);
  }
  return value;
}

function requiredAssetHash(asset: Doc<"buildCollaborationAssets">) {
  if (!asset.contentHashSha256) {
    throw new Error("Every Cost Document source page requires a verified hash.");
  }
  return asset.contentHashSha256;
}

function formatCad(amountCents: number) {
  return new Intl.NumberFormat("en-CA", {
    currency: "CAD",
    style: "currency",
  }).format(amountCents / 100);
}
