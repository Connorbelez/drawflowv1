import { ConvexError, v } from "convex/values";

import {
  type ActiveBuildAuthorization,
  authorizeActiveBuildAccess,
} from "./activeBuildAccess";
import {
  type AuthorizedViewer,
  authenticatedMutation,
  authenticatedQuery,
} from "./authz";
import { isCleanCollaborationAsset } from "./build_collaboration_asset_access";
import {
  normalizeOperationalIdempotencyKey,
  operationalRequestFingerprint,
} from "./build_operational_idempotency";
import {
  createInitialQuoteInvitationCredentialAndDispatch,
  defaultQuoteInvitationAccessExpiry,
} from "./quote_invitation_access";
import type { Doc, Id, MutationCtx, QueryCtx } from "./types";

const MAX_DRAFT_LABOUR_LINES = 100;
const MAX_DRAFT_MATERIAL_LINES = 100;
const MAX_DRAFT_RECIPIENTS = 100;
const MAX_MATERIAL_ASSIGNMENTS_PER_ROW = 100;
// A quote package writes a row for every material assignment alongside
// package lines, attachments, response fields, invitations, and credentials.
// Keep the aggregate below Convex's 4,096 range headroom rather than allowing
// the per-row limit to multiply into a publication-sized transaction.
const MAX_TOTAL_MATERIAL_ASSIGNMENTS = 3000;
// The Build roadmap itself is capped at 500 Sub-milestones. Enforce that
// cardinality before hydration so one valid payload cannot fan out above
// Convex's 1,000 concurrent-I/O or 4,096 range-read transaction limits.
const MAX_DISTINCT_MATERIAL_SUBMILESTONES = 500;
const MAX_INHERITED_ATTACHMENTS = 200;
// Link discovery is global across the package, including internal and permit
// links that are intentionally excluded from the attachment result.
const MAX_INHERITED_LINKS_SCANNED = 1000;
const MAX_CURRENT_PERMIT_CANDIDATES = 500;
const MAX_TIPTAP_JSON_LENGTH = 250_000;
const MATERIAL_ROW_KEY_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/;

const quoteRoundModeValidator = v.union(
  v.literal("labour"),
  v.literal("material"),
  v.literal("combined")
);
const quoteRoundStateValidator = v.union(
  v.literal("draft"),
  v.literal("open"),
  v.literal("closed"),
  v.literal("cancelled")
);
const quoteRoundMaterialSourceValidator = v.union(
  v.literal("build_cost_item"),
  v.literal("ad_hoc")
);
const quoteRecipientCapabilityValidator = v.union(
  v.literal("contractor"),
  v.literal("supplier")
);
const quoteResponseTemplateAudienceValidator = v.union(
  v.literal("contractor"),
  v.literal("supplier"),
  v.literal("either")
);
const quoteResponseTemplateFieldKindValidator = v.union(
  v.literal("priced_line"),
  v.literal("short_text"),
  v.literal("long_text"),
  v.literal("date"),
  v.literal("choice"),
  v.literal("attachment")
);
const quoteResponseTemplateFieldScopeValidator = v.union(
  v.literal("whole_quote"),
  v.literal("labour"),
  v.literal("materials")
);
const quoteResponseTemplateFieldRendererValidator = v.union(
  v.literal("input"),
  v.literal("tiptap")
);
const quoteResponseTemplateFieldValidationValidator = v.object({
  allowedMimeTypes: v.optional(v.array(v.string())),
  maxFiles: v.optional(v.number()),
  maxLength: v.optional(v.number()),
  maxValueCents: v.optional(v.number()),
  minFiles: v.optional(v.number()),
  minLength: v.optional(v.number()),
  minValueCents: v.optional(v.number()),
  pattern: v.optional(v.string()),
});
const quoteResponseTemplateTaxValidator = v.object({
  label: v.string(),
  rateBps: v.number(),
});

const materialDraftRowInputValidator = v.object({
  assignedSubmilestoneIds: v.array(v.id("buildSubmilestones")),
  deliveryEndDay: v.optional(v.number()),
  deliveryInstructions: v.optional(v.string()),
  deliveryLocation: v.optional(v.string()),
  deliveryStartDay: v.optional(v.number()),
  description: v.optional(v.string()),
  quantity: v.optional(v.number()),
  rowKey: v.string(),
  source: quoteRoundMaterialSourceValidator,
  sourceBuildCostItemId: v.optional(v.id("buildCostItems")),
  specificationTiptapJson: v.optional(v.string()),
  title: v.optional(v.string()),
  unit: v.optional(v.string()),
});

const quoteTemplateFieldProjectionValidator = v.object({
  _id: v.id("quoteResponseTemplateFields"),
  allowAlternates: v.boolean(),
  allowExclusions: v.boolean(),
  choiceOptions: v.optional(v.array(v.string())),
  fieldKey: v.string(),
  isPermanent: v.boolean(),
  kind: quoteResponseTemplateFieldKindValidator,
  label: v.string(),
  order: v.number(),
  renderer: quoteResponseTemplateFieldRendererValidator,
  repeatable: v.boolean(),
  required: v.boolean(),
  richTextDefaultHtml: v.optional(v.string()),
  scope: quoteResponseTemplateFieldScopeValidator,
  supportsTax: v.boolean(),
  tax: v.optional(quoteResponseTemplateTaxValidator),
  validation: v.optional(quoteResponseTemplateFieldValidationValidator),
});

const quoteTemplateVersionProjectionValidator = v.object({
  _id: v.id("quoteResponseTemplateVersions"),
  audience: quoteResponseTemplateAudienceValidator,
  description: v.optional(v.string()),
  fields: v.array(quoteTemplateFieldProjectionValidator),
  name: v.string(),
  templateId: v.id("quoteResponseTemplates"),
  version: v.number(),
});

const labourSourceProjectionValidator = v.object({
  _id: v.id("buildSubmilestones"),
  budgetCents: v.optional(v.number()),
  buildMilestoneId: v.id("buildMilestones"),
  durationDays: v.optional(v.number()),
  milestoneKey: v.string(),
  milestoneName: v.string(),
  name: v.string(),
  order: v.number(),
  scopeOfWorkTiptapJson: v.string(),
  startDay: v.optional(v.number()),
  submilestoneKey: v.string(),
});

const materialSourceProjectionValidator = v.object({
  _id: v.id("buildCostItems"),
  deliveryEndDay: v.optional(v.number()),
  deliveryInstructions: v.optional(v.string()),
  deliveryLocation: v.optional(v.string()),
  deliveryStartDay: v.optional(v.number()),
  description: v.optional(v.string()),
  milestoneKey: v.string(),
  quantity: v.number(),
  relevantSubmilestoneKeys: v.array(v.string()),
  specificationTiptapJson: v.optional(v.string()),
  title: v.string(),
  unit: v.optional(v.string()),
});

const quoteRecipientProjectionValidator = v.object({
  _id: v.id("contractorProfiles"),
  email: v.string(),
  name: v.string(),
  quoteRecipientCapabilities: v.array(quoteRecipientCapabilityValidator),
  quoteRecipientProvisioningState: v.optional(
    v.union(v.literal("provisional"), v.literal("claimed"))
  ),
});

const composerProjectionValidator = v.object({
  build: v.object({
    _id: v.id("activeBuilds"),
    buildName: v.string(),
    location: v.string(),
    locationLatitude: v.optional(v.number()),
    locationLongitude: v.optional(v.number()),
    locationPlaceId: v.optional(v.string()),
    startDate: v.string(),
    timelineCurrentDay: v.optional(v.number()),
    timelineRangeMax: v.optional(v.number()),
    timelineRangeMin: v.optional(v.number()),
  }),
  eligibleRecipients: v.array(quoteRecipientProjectionValidator),
  labourSubmilestones: v.array(labourSourceProjectionValidator),
  materialCostItems: v.array(materialSourceProjectionValidator),
  permit: v.union(
    v.object({
      _id: v.id("buildDocuments"),
      fileName: v.string(),
      governedAssetId: v.optional(v.id("buildCollaborationAssets")),
      mimeType: v.string(),
      version: v.number(),
    }),
    v.null()
  ),
  responseTemplates: v.array(quoteTemplateVersionProjectionValidator),
});

const draftMaterialRowProjectionValidator = v.object({
  assignedSubmilestoneIds: v.array(v.id("buildSubmilestones")),
  deliveryEndDay: v.optional(v.number()),
  deliveryInstructions: v.optional(v.string()),
  deliveryLocation: v.optional(v.string()),
  deliveryStartDay: v.optional(v.number()),
  description: v.optional(v.string()),
  quantity: v.optional(v.number()),
  rowKey: v.string(),
  source: quoteRoundMaterialSourceValidator,
  sourceBuildCostItemId: v.optional(v.id("buildCostItems")),
  specificationTiptapJson: v.optional(v.string()),
  title: v.optional(v.string()),
  unit: v.optional(v.string()),
});

const quoteRoundDraftProjectionValidator = v.object({
  labourSubmilestoneIds: v.array(v.id("buildSubmilestones")),
  materialRows: v.array(draftMaterialRowProjectionValidator),
  recipientProfileIds: v.array(v.id("contractorProfiles")),
  responseDeadline: v.optional(v.number()),
  templateVersionId: v.optional(v.id("quoteResponseTemplateVersions")),
});

const packageAttachmentProjectionValidator = v.object({
  contentHashSha256Snapshot: v.string(),
  fileNameSnapshot: v.string(),
  kind: v.union(v.literal("permit"), v.literal("inherited")),
  mimeTypeSnapshot: v.string(),
  sourceBuildDocumentId: v.id("buildDocuments"),
  sourceBuildSubmilestoneId: v.optional(v.id("buildSubmilestones")),
});

const packageLabourLineProjectionValidator = v.object({
  buildSubmilestoneId: v.id("buildSubmilestones"),
  milestoneKey: v.string(),
  milestoneName: v.string(),
  scopeOfWorkTiptapJson: v.string(),
  startDay: v.optional(v.number()),
  submilestoneKey: v.string(),
  submilestoneName: v.string(),
});

const packageMaterialAssignmentProjectionValidator = v.object({
  buildSubmilestoneId: v.id("buildSubmilestones"),
  milestoneKey: v.string(),
  milestoneName: v.string(),
  submilestoneKey: v.string(),
  submilestoneName: v.string(),
});

const packageMaterialLineProjectionValidator = v.object({
  assignments: v.array(packageMaterialAssignmentProjectionValidator),
  deliveryEndDay: v.number(),
  deliveryInstructions: v.string(),
  deliveryLocation: v.string(),
  deliveryStartDay: v.number(),
  description: v.optional(v.string()),
  quantity: v.number(),
  source: quoteRoundMaterialSourceValidator,
  sourceBuildCostItemId: v.optional(v.id("buildCostItems")),
  specificationTiptapJson: v.string(),
  title: v.string(),
  unit: v.string(),
});

const packageResponseFieldProjectionValidator = v.object({
  allowAlternates: v.boolean(),
  allowExclusions: v.boolean(),
  choiceOptions: v.optional(v.array(v.string())),
  fieldKey: v.string(),
  isPermanent: v.boolean(),
  kind: quoteResponseTemplateFieldKindValidator,
  label: v.string(),
  order: v.number(),
  renderer: quoteResponseTemplateFieldRendererValidator,
  repeatable: v.boolean(),
  required: v.boolean(),
  richTextDefaultHtml: v.optional(v.string()),
  scope: quoteResponseTemplateFieldScopeValidator,
  supportsTax: v.boolean(),
  tax: v.optional(quoteResponseTemplateTaxValidator),
  validation: v.optional(quoteResponseTemplateFieldValidationValidator),
});

const quotePackageRevisionProjectionValidator = v.object({
  _id: v.id("quotePackageRevisions"),
  attachments: v.array(packageAttachmentProjectionValidator),
  labourLines: v.array(packageLabourLineProjectionValidator),
  materialLines: v.array(packageMaterialLineProjectionValidator),
  permitDocumentId: v.id("buildDocuments"),
  responseDeadline: v.number(),
  responseFields: v.array(packageResponseFieldProjectionValidator),
  revision: v.number(),
  roadmapSnapshotFingerprint: v.string(),
  siteAddressSnapshot: v.string(),
  siteLatitudeSnapshot: v.optional(v.number()),
  siteLongitudeSnapshot: v.optional(v.number()),
  siteMapUrlSnapshot: v.string(),
  sitePlaceIdSnapshot: v.optional(v.string()),
  templateVersionId: v.id("quoteResponseTemplateVersions"),
  timelineCurrentDaySnapshot: v.optional(v.number()),
  timelineRangeMaxSnapshot: v.optional(v.number()),
  timelineRangeMinSnapshot: v.optional(v.number()),
  timelineStartDateSnapshot: v.string(),
});

const quoteInvitationProjectionValidator = v.object({
  _id: v.id("quoteRoundInvitations"),
  participationState: v.union(v.literal("active"), v.literal("revoked")),
  recipientCapabilitiesSnapshot: v.array(quoteRecipientCapabilityValidator),
  recipientEmailSnapshot: v.string(),
  recipientNameSnapshot: v.string(),
  recipientProfileId: v.id("contractorProfiles"),
});

const quoteRoundProjectionValidator = v.object({
  _id: v.id("quoteRounds"),
  buildId: v.id("activeBuilds"),
  draft: v.union(quoteRoundDraftProjectionValidator, v.null()),
  invitations: v.array(quoteInvitationProjectionValidator),
  mode: quoteRoundModeValidator,
  packageRevision: v.union(quotePackageRevisionProjectionValidator, v.null()),
  revision: v.number(),
  state: quoteRoundStateValidator,
  title: v.string(),
  updatedAt: v.number(),
});

const quoteRoundSummaryValidator = v.object({
  _id: v.id("quoteRounds"),
  invitationCount: v.number(),
  mode: quoteRoundModeValidator,
  packageRevisionId: v.optional(v.id("quotePackageRevisions")),
  packageRevisionNumber: v.optional(v.number()),
  responseDeadline: v.optional(v.number()),
  revision: v.number(),
  state: quoteRoundStateValidator,
  title: v.string(),
  updatedAt: v.number(),
});

const quoteRoundListValidator = v.object({
  rounds: v.array(quoteRoundSummaryValidator),
});

const quoteRoundDraftMutationResultValidator = v.object({
  quoteRoundId: v.id("quoteRounds"),
  revision: v.number(),
  state: quoteRoundStateValidator,
});

const quoteRoundPublicationResultValidator = v.object({
  idempotentReplay: v.boolean(),
  invitationCount: v.number(),
  invitationIds: v.array(v.id("quoteRoundInvitations")),
  packageRevisionId: v.id("quotePackageRevisions"),
  packageRevisionNumber: v.number(),
  quoteRoundId: v.id("quoteRounds"),
  responseDeadline: v.number(),
  state: v.literal("open"),
});

type QuoteRoundCtx = (QueryCtx | MutationCtx) & {
  viewer: AuthorizedViewer;
};

interface DraftMaterialRowInput {
  assignedSubmilestoneIds: Id<"buildSubmilestones">[];
  deliveryEndDay?: number;
  deliveryInstructions?: string;
  deliveryLocation?: string;
  deliveryStartDay?: number;
  description?: string;
  quantity?: number;
  rowKey: string;
  source: "build_cost_item" | "ad_hoc";
  sourceBuildCostItemId?: Id<"buildCostItems">;
  specificationTiptapJson?: string;
  title?: string;
  unit?: string;
}

type NormalizedAdHocMaterialRow = Omit<
  DraftMaterialRowInput,
  "assignedSubmilestoneIds" | "sourceBuildCostItemId"
> & {
  deliveryEndDay: number;
  deliveryInstructions: string;
  deliveryLocation: string;
  deliveryStartDay: number;
  quantity: number;
  specificationTiptapJson: string;
  title: string;
  unit: string;
};

interface DraftState {
  draft: Doc<"quoteRoundDrafts">;
  labourScope: Doc<"quoteRoundDraftLabourScope">[];
  materialAssignmentsByRowId: Map<
    Id<"quoteRoundDraftMaterialRows">,
    Doc<"quoteRoundDraftMaterialAssignments">[]
  >;
  materialRows: Doc<"quoteRoundDraftMaterialRows">[];
  recipients: Doc<"quoteRoundDraftRecipients">[];
}

function requiredText(
  value: string | undefined,
  label: string,
  maxLength: number
) {
  const normalized = value?.trim() ?? "";
  if (!normalized) {
    throw new ConvexError(`${label} is required.`);
  }
  if (normalized.length > maxLength) {
    throw new ConvexError(`${label} must be ${maxLength} characters or fewer.`);
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
    throw new ConvexError(`${label} must be ${maxLength} characters or fewer.`);
  }
  return normalized || undefined;
}

function requiredFiniteNumber(value: number | undefined, label: string) {
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    throw new ConvexError(`${label} must be a positive number.`);
  }
  return value;
}

function requiredInteger(value: number | undefined, label: string) {
  if (value === undefined || !Number.isInteger(value)) {
    throw new ConvexError(`${label} must be an integer.`);
  }
  return value;
}

function requiredNonNegativeInteger(value: number | undefined, label: string) {
  const normalized = requiredInteger(value, label);
  if (normalized < 0) {
    throw new ConvexError(`${label} must be on or after T0.`);
  }
  return normalized;
}

function normalizeTiptapJson(value: string | undefined, label: string) {
  const normalized = requiredText(value, label, MAX_TIPTAP_JSON_LENGTH);
  let document: unknown;
  try {
    document = JSON.parse(normalized);
  } catch {
    throw new ConvexError(`${label} must be valid TipTap JSON.`);
  }
  if (
    !document ||
    typeof document !== "object" ||
    !("type" in document) ||
    document.type !== "doc"
  ) {
    throw new ConvexError(`${label} must contain a TipTap document root.`);
  }
  // Preserve the exact canonical string rather than flattening or serializing
  // it again. Package snapshots must retain supported TipTap structure.
  return normalized;
}

function plainTextTiptapJson(value: string) {
  return JSON.stringify({
    content: [
      {
        content: [{ text: value, type: "text" }],
        type: "paragraph",
      },
    ],
    type: "doc",
  });
}

function assertAuthoringRole(viewer: AuthorizedViewer) {
  if (
    !(
      viewer.roles.includes("builder") || viewer.roles.includes("builder-staff")
    )
  ) {
    throw new ConvexError(
      "Forbidden: only Builder or Builder Staff may author Quote Rounds."
    );
  }
}

async function authorizeQuoteRoundPath(
  ctx: QuoteRoundCtx,
  input: { buildId: Id<"activeBuilds">; workosOrganizationId: string }
) {
  assertAuthoringRole(ctx.viewer);
  return await authorizeActiveBuildAccess(ctx, {
    buildId: input.buildId,
    organizationId: input.workosOrganizationId,
  });
}

function requireRoundScope(
  round: Doc<"quoteRounds"> | null,
  authorization: ActiveBuildAuthorization,
  quoteRoundId: Id<"quoteRounds">
) {
  if (
    !round ||
    round._id !== quoteRoundId ||
    round.buildId !== authorization.build._id ||
    round.proposalId !== authorization.proposal._id ||
    round.organizationId !== authorization.organizationId ||
    round.brokerageId !== authorization.brokerage._id
  ) {
    throw new ConvexError("Quote Round is unavailable for this Build.");
  }
  return round;
}

function requireDraftState(round: Doc<"quoteRounds">) {
  if (round.state !== "draft") {
    throw new ConvexError("Published Quote Round rows are immutable.");
  }
}

function assertExpectedRevision(
  round: Doc<"quoteRounds">,
  expectedRevision: number
) {
  if (
    !Number.isInteger(expectedRevision) ||
    expectedRevision !== round.revision
  ) {
    throw new ConvexError({
      code: "QUOTE_ROUND_REVISION_CONFLICT",
      currentRevision: round.revision,
      message: "Quote Round changed. Reload the latest draft before saving.",
    });
  }
}

function requireModeScope(
  mode: Doc<"quoteRounds">["mode"],
  input: { labourCount: number; materialCount: number }
) {
  const hasLabour = input.labourCount > 0;
  const hasMaterial = input.materialCount > 0;
  if (mode === "labour" && (!hasLabour || hasMaterial)) {
    throw new ConvexError("Labour Quote Rounds require Labour scope only.");
  }
  if (mode === "material" && (hasLabour || !hasMaterial)) {
    throw new ConvexError("Material Quote Rounds require Material scope only.");
  }
  if (mode === "combined" && !(hasLabour && hasMaterial)) {
    throw new ConvexError(
      "Combined Quote Rounds require both Labour and Material scope."
    );
  }
}

function capabilityRequirement(mode: Doc<"quoteRounds">["mode"]) {
  if (mode === "labour") {
    return ["contractor"] as const;
  }
  if (mode === "material") {
    return ["supplier"] as const;
  }
  return ["contractor", "supplier"] as const;
}

function profileCapabilities(profile: Doc<"contractorProfiles">) {
  return profile.quoteRecipientCapabilities ?? ["contractor"];
}

function mapUrlForBuild(build: Doc<"activeBuilds">) {
  const location = build.location.trim();
  if (!location) {
    throw new ConvexError(
      "Build location is required before publishing a Quote Round."
    );
  }
  const query =
    build.locationLatitude !== undefined &&
    build.locationLongitude !== undefined
      ? `${build.locationLatitude},${build.locationLongitude}`
      : location;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function rowKey(value: string) {
  const normalized = requiredText(value, "Material row key", 128);
  if (!MATERIAL_ROW_KEY_PATTERN.test(normalized)) {
    throw new ConvexError("Material row key contains unsupported characters.");
  }
  return normalized;
}

function normalizedAdHocMaterialRow(
  input: DraftMaterialRowInput
): NormalizedAdHocMaterialRow {
  const deliveryStartDay = requiredNonNegativeInteger(
    input.deliveryStartDay,
    "Delivery start day"
  );
  const deliveryEndDay = requiredNonNegativeInteger(
    input.deliveryEndDay,
    "Delivery end day"
  );
  if (deliveryEndDay < deliveryStartDay) {
    throw new ConvexError(
      "Delivery end day cannot precede delivery start day."
    );
  }
  return {
    deliveryEndDay,
    deliveryInstructions: requiredText(
      input.deliveryInstructions,
      "Delivery instructions",
      4000
    ),
    deliveryLocation: requiredText(
      input.deliveryLocation,
      "Delivery location",
      500
    ),
    deliveryStartDay,
    description: optionalText(input.description, "Material description", 4000),
    quantity: requiredFiniteNumber(input.quantity, "Material quantity"),
    rowKey: rowKey(input.rowKey),
    source: "ad_hoc",
    specificationTiptapJson: normalizeTiptapJson(
      input.specificationTiptapJson,
      "Material specification"
    ),
    title: requiredText(input.title, "Material title", 240),
    unit: requiredText(input.unit, "Material unit", 80),
  };
}

function requireBuildCostItemSourceId(input: DraftMaterialRowInput) {
  if (!input.sourceBuildCostItemId) {
    throw new ConvexError(
      "A Build material row requires its canonical Build Cost Item."
    );
  }
  if (
    input.title !== undefined ||
    input.description !== undefined ||
    input.quantity !== undefined ||
    input.unit !== undefined ||
    input.specificationTiptapJson !== undefined ||
    input.deliveryLocation !== undefined ||
    input.deliveryStartDay !== undefined ||
    input.deliveryEndDay !== undefined ||
    input.deliveryInstructions !== undefined
  ) {
    throw new ConvexError(
      "Build Cost Item material values are server-derived and cannot be overridden in a Quote Draft."
    );
  }
  return input.sourceBuildCostItemId;
}

function assertAdHocSourceInput(input: DraftMaterialRowInput) {
  if (input.sourceBuildCostItemId) {
    throw new ConvexError(
      "Ad-hoc material rows cannot point at a Build Cost Item."
    );
  }
}

async function readDraftState(
  ctx: QueryCtx | MutationCtx,
  round: Doc<"quoteRounds">
): Promise<DraftState> {
  const draft = await ctx.db
    .query("quoteRoundDrafts")
    .withIndex("by_quoteRoundId", (query) =>
      query.eq("quoteRoundId", round._id)
    )
    .unique();
  if (
    !draft ||
    draft.buildId !== round.buildId ||
    draft.organizationId !== round.organizationId ||
    draft.brokerageId !== round.brokerageId
  ) {
    throw new ConvexError("Quote Round draft state is unavailable.");
  }
  const [labourScope, materialRows, recipients] = await Promise.all([
    ctx.db
      .query("quoteRoundDraftLabourScope")
      .withIndex("by_quoteRoundId_and_order", (query) =>
        query.eq("quoteRoundId", round._id)
      )
      .take(MAX_DRAFT_LABOUR_LINES + 1),
    ctx.db
      .query("quoteRoundDraftMaterialRows")
      .withIndex("by_quoteRoundId_and_order", (query) =>
        query.eq("quoteRoundId", round._id)
      )
      .take(MAX_DRAFT_MATERIAL_LINES + 1),
    ctx.db
      .query("quoteRoundDraftRecipients")
      .withIndex("by_quoteRoundId_and_order", (query) =>
        query.eq("quoteRoundId", round._id)
      )
      .take(MAX_DRAFT_RECIPIENTS + 1),
  ]);
  if (
    labourScope.length > MAX_DRAFT_LABOUR_LINES ||
    materialRows.length > MAX_DRAFT_MATERIAL_LINES ||
    recipients.length > MAX_DRAFT_RECIPIENTS
  ) {
    throw new ConvexError("Quote Round draft exceeds supported scope limits.");
  }
  const rows = materialRows as Doc<"quoteRoundDraftMaterialRows">[];
  const assignmentEntries = await Promise.all(
    rows.map(async (row) => {
      const assignments = await ctx.db
        .query("quoteRoundDraftMaterialAssignments")
        .withIndex("by_quoteRoundDraftMaterialRowId_and_order", (query) =>
          query.eq("quoteRoundDraftMaterialRowId", row._id)
        )
        .take(MAX_MATERIAL_ASSIGNMENTS_PER_ROW + 1);
      if (assignments.length > MAX_MATERIAL_ASSIGNMENTS_PER_ROW) {
        throw new ConvexError(
          "A Material row has too many Sub-milestone assignments."
        );
      }
      return [row._id, assignments] as const;
    })
  );
  assertAggregateMaterialAssignments(
    assignmentEntries.reduce(
      (total, [, assignments]) => total + assignments.length,
      0
    )
  );
  return {
    draft,
    labourScope: labourScope as Doc<"quoteRoundDraftLabourScope">[],
    materialAssignmentsByRowId: new Map(assignmentEntries),
    materialRows: rows,
    recipients: recipients as Doc<"quoteRoundDraftRecipients">[],
  };
}

async function requireBuildSubmilestone(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization,
  id: Id<"buildSubmilestones">
) {
  const submilestone = await ctx.db.get(id);
  if (
    !submilestone ||
    submilestone.buildId !== authorization.build._id ||
    submilestone.organizationId !== authorization.organizationId ||
    submilestone.brokerageId !== authorization.brokerage._id
  ) {
    throw new ConvexError("Sub-milestone is unavailable for this Build.");
  }
  const milestone = await ctx.db.get(submilestone.buildMilestoneId);
  if (
    !milestone ||
    milestone.buildId !== authorization.build._id ||
    milestone.organizationId !== authorization.organizationId ||
    milestone.brokerageId !== authorization.brokerage._id
  ) {
    throw new ConvexError(
      "Sub-milestone has an invalid Build Milestone source."
    );
  }
  return { milestone, submilestone };
}

async function validateLabourSubmilestoneIds(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization,
  ids: Id<"buildSubmilestones">[]
) {
  if (ids.length > MAX_DRAFT_LABOUR_LINES) {
    throw new ConvexError(
      "A Quote Round supports at most 100 Labour Sub-milestones."
    );
  }
  if (new Set(ids.map(String)).size !== ids.length) {
    throw new ConvexError("Labour Sub-milestones must be unique.");
  }
  await Promise.all(
    ids.map((id) => requireBuildSubmilestone(ctx, authorization, id))
  );
  return ids;
}

function validateMaterialAssignments(ids: Id<"buildSubmilestones">[]) {
  if (ids.length === 0) {
    throw new ConvexError(
      "Every Material row must be assigned to at least one Sub-milestone."
    );
  }
  if (ids.length > MAX_MATERIAL_ASSIGNMENTS_PER_ROW) {
    throw new ConvexError(
      "A Material row supports at most 100 Sub-milestone assignments."
    );
  }
  if (new Set(ids.map(String)).size !== ids.length) {
    throw new ConvexError("Material Sub-milestone assignments must be unique.");
  }
  return ids;
}

function assertAggregateMaterialAssignments(total: number) {
  if (total > MAX_TOTAL_MATERIAL_ASSIGNMENTS) {
    throw new ConvexError(
      "A Quote Round supports at most 3,000 Material Sub-milestone assignments."
    );
  }
}

function assertDistinctMaterialSubmilestones(total: number) {
  if (total > MAX_DISTINCT_MATERIAL_SUBMILESTONES) {
    throw new ConvexError(
      "A Quote Round supports at most 500 distinct Material Sub-milestones."
    );
  }
}

async function requireBuildCostItem(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization,
  id: Id<"buildCostItems">
) {
  const item = await ctx.db.get(id);
  if (
    !item ||
    item.buildId !== authorization.build._id ||
    item.proposalId !== authorization.proposal._id ||
    item.organizationId !== authorization.organizationId ||
    item.brokerageId !== authorization.brokerage._id ||
    item.itemType !== "material"
  ) {
    throw new ConvexError("Material Cost Item is unavailable for this Build.");
  }
  return item;
}

function materialFieldsFromSource(input: {
  deliveryEndDay?: number;
  deliveryInstructions?: string;
  deliveryLocation?: string;
  deliveryStartDay?: number;
  description?: string;
  quantity?: number;
  specificationTiptapJson?: string;
  title?: string;
  unit?: string;
}) {
  const deliveryStartDay = requiredInteger(
    input.deliveryStartDay,
    "Delivery start day"
  );
  const deliveryEndDay = requiredInteger(
    input.deliveryEndDay,
    "Delivery end day"
  );
  if (deliveryEndDay < deliveryStartDay) {
    throw new ConvexError(
      "Delivery end day cannot precede delivery start day."
    );
  }
  return {
    deliveryEndDay,
    deliveryInstructions: requiredText(
      input.deliveryInstructions,
      "Delivery instructions",
      4000
    ),
    deliveryLocation: requiredText(
      input.deliveryLocation,
      "Delivery location",
      500
    ),
    deliveryStartDay,
    description: optionalText(input.description, "Material description", 4000),
    quantity: requiredFiniteNumber(input.quantity, "Material quantity"),
    specificationTiptapJson: normalizeTiptapJson(
      input.specificationTiptapJson,
      "Material specification"
    ),
    title: requiredText(input.title, "Material title", 240),
    unit: requiredText(input.unit, "Material unit", 80),
  };
}

async function validateDraftMaterialRows(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization,
  rows: DraftMaterialRowInput[]
) {
  if (rows.length > MAX_DRAFT_MATERIAL_LINES) {
    throw new ConvexError("A Quote Round supports at most 100 Material rows.");
  }
  assertAggregateMaterialAssignments(
    rows.reduce((total, row) => total + row.assignedSubmilestoneIds.length, 0)
  );
  const keys = new Set<string>();
  const materialAssignmentIds = new Set<Id<"buildSubmilestones">>();
  const sourceCostItemIds = new Set<Id<"buildCostItems">>();
  const normalized: Array<{
    assignments: Id<"buildSubmilestones">[];
    input: DraftMaterialRowInput;
    normalizedAdHoc?: NormalizedAdHocMaterialRow;
  }> = [];
  for (const candidate of rows) {
    const key = rowKey(candidate.rowKey);
    if (keys.has(key)) {
      throw new ConvexError("Material row keys must be unique.");
    }
    keys.add(key);
    const assignments = validateMaterialAssignments(
      candidate.assignedSubmilestoneIds
    );
    for (const assignmentId of assignments) {
      materialAssignmentIds.add(assignmentId);
    }
    if (candidate.source === "build_cost_item") {
      const sourceBuildCostItemId = requireBuildCostItemSourceId(candidate);
      sourceCostItemIds.add(sourceBuildCostItemId);
      normalized.push({ assignments, input: { ...candidate, rowKey: key } });
      continue;
    }
    assertAdHocSourceInput(candidate);
    normalized.push({
      assignments,
      input: { ...candidate, rowKey: key },
      normalizedAdHoc: normalizedAdHocMaterialRow({
        ...candidate,
        rowKey: key,
      }),
    });
  }
  assertDistinctMaterialSubmilestones(materialAssignmentIds.size);
  await Promise.all([
    ...[...materialAssignmentIds].map((id) =>
      requireBuildSubmilestone(ctx, authorization, id)
    ),
    ...[...sourceCostItemIds].map((id) =>
      requireBuildCostItem(ctx, authorization, id)
    ),
  ]);
  return normalized;
}

async function validateRecipients(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization,
  mode: Doc<"quoteRounds">["mode"],
  recipientProfileIds: Id<"contractorProfiles">[]
) {
  if (recipientProfileIds.length > MAX_DRAFT_RECIPIENTS) {
    throw new ConvexError("A Quote Round supports at most 100 recipients.");
  }
  if (
    new Set(recipientProfileIds.map(String)).size !== recipientProfileIds.length
  ) {
    throw new ConvexError("Quote Round recipients must be unique.");
  }
  const requiredCapabilities = capabilityRequirement(mode);
  return await Promise.all(
    recipientProfileIds.map(async (recipientProfileId) => {
      const profile = await ctx.db.get(recipientProfileId);
      if (
        !profile ||
        profile.status !== "active" ||
        profile.organizationId !== authorization.organizationId ||
        profile.brokerageId !== authorization.brokerage._id
      ) {
        throw new ConvexError(
          "Quote recipient is unavailable for this organization."
        );
      }
      const email = requiredText(
        profile.email,
        "Quote recipient email",
        320
      ).toLowerCase();
      const capabilities = profileCapabilities(profile);
      if (
        !requiredCapabilities.every((capability) =>
          capabilities.includes(capability)
        )
      ) {
        throw new ConvexError(
          "Quote recipient does not have the required capability for this Quote Round mode."
        );
      }
      return {
        capabilities,
        email,
        profile,
      };
    })
  );
}

async function requirePublishedTemplateVersion(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization,
  mode: Doc<"quoteRounds">["mode"],
  templateVersionId: Id<"quoteResponseTemplateVersions">
) {
  const version = await ctx.db.get(templateVersionId);
  if (
    !version ||
    version.status !== "published" ||
    version.validationState !== "valid" ||
    version.organizationId !== authorization.organizationId ||
    version.brokerageId !== authorization.brokerage._id
  ) {
    throw new ConvexError(
      "A published Quote Response Template version is required."
    );
  }
  const template = await ctx.db.get(version.templateId);
  if (
    !template ||
    template.status !== "active" ||
    template.organizationId !== authorization.organizationId ||
    template.brokerageId !== authorization.brokerage._id
  ) {
    throw new ConvexError(
      "Quote Response Template is unavailable for this organization."
    );
  }
  const audienceAllowed =
    version.audience === "either" ||
    (mode === "labour" && version.audience === "contractor") ||
    (mode === "material" && version.audience === "supplier");
  if (!audienceAllowed) {
    throw new ConvexError(
      "Quote Response Template audience is incompatible with this Quote Round mode."
    );
  }
  const fields = await ctx.db
    .query("quoteResponseTemplateFields")
    .withIndex("by_version_order", (query) =>
      query.eq("versionId", version._id)
    )
    .take(101);
  if (fields.length === 0 || fields.length > 100) {
    throw new ConvexError("Quote Response Template fields are unavailable.");
  }
  for (const field of fields) {
    if (
      field.templateId !== template._id ||
      field.versionId !== version._id ||
      field.organizationId !== authorization.organizationId ||
      field.brokerageId !== authorization.brokerage._id
    ) {
      throw new ConvexError(
        "Quote Response Template field crosses organization scope."
      );
    }
  }
  return { fields, template, version };
}

async function requireGovernedBuildDocument(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization,
  document: Doc<"buildDocuments">,
  label: string
) {
  if (
    document.buildId !== authorization.build._id ||
    document.proposalId !== authorization.proposal._id ||
    document.organizationId !== authorization.organizationId ||
    document.brokerageId !== authorization.brokerage._id ||
    document.status === "superseded" ||
    document.supersededByDocumentId ||
    !document.storageId ||
    !document.governedAssetId
  ) {
    throw new ConvexError(`${label} is not a current governed Build Document.`);
  }
  const asset = await ctx.db.get(document.governedAssetId);
  if (
    !asset ||
    asset.organizationId !== authorization.organizationId ||
    asset.brokerageId !== authorization.brokerage._id ||
    asset.buildId !== authorization.build._id ||
    asset.storageId !== document.storageId ||
    !isCleanCollaborationAsset(asset)
  ) {
    throw new ConvexError(
      `${label} must resolve to a clean governed Build asset.`
    );
  }
  if (
    asset.fileName !== document.fileName ||
    asset.mimeType !== document.mimeType ||
    asset.sizeBytes !== document.sizeBytes
  ) {
    throw new ConvexError(
      `${label} metadata does not match its clean governed Build asset.`
    );
  }
  if (!asset.contentHashSha256) {
    throw new ConvexError(`${label} is missing a governed SHA-256 hash.`);
  }
  return { asset, document };
}

function governedAssetContentHash(asset: Doc<"buildCollaborationAssets">) {
  if (!asset.contentHashSha256) {
    throw new ConvexError("Governed Build asset is missing a SHA-256 hash.");
  }
  return asset.contentHashSha256;
}

async function resolveCurrentPermitDocument(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization
) {
  let inspected = 0;
  const permits = ctx.db
    .query("buildDocuments")
    .withIndex("by_build_type", (query) =>
      query.eq("buildId", authorization.build._id).eq("documentType", "permit")
    )
    .order("desc");
  for await (const document of permits) {
    inspected += 1;
    if (inspected > MAX_CURRENT_PERMIT_CANDIDATES) {
      throw new ConvexError("Build Permit history exceeds supported limits.");
    }
    if (
      document.proposalId === authorization.proposal._id &&
      document.organizationId === authorization.organizationId &&
      document.brokerageId === authorization.brokerage._id &&
      document.status !== "superseded" &&
      !document.supersededByDocumentId
    ) {
      return document;
    }
  }
  return null;
}

async function currentPermitDocument(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization
) {
  const active = await resolveCurrentPermitDocument(ctx, authorization);
  if (!active) {
    throw new ConvexError(
      "A current governed Build Permit is required before publishing a Quote Round."
    );
  }
  return await requireGovernedBuildDocument(
    ctx,
    authorization,
    active,
    "Build Permit"
  );
}

function draftProjection(state: DraftState) {
  return {
    labourSubmilestoneIds: state.labourScope.map(
      (scope) => scope.buildSubmilestoneId
    ),
    materialRows: state.materialRows.map((row) => ({
      assignedSubmilestoneIds: (
        state.materialAssignmentsByRowId.get(row._id) ?? []
      ).map((assignment) => assignment.buildSubmilestoneId),
      deliveryEndDay: row.deliveryEndDay,
      deliveryInstructions: row.deliveryInstructions,
      deliveryLocation: row.deliveryLocation,
      deliveryStartDay: row.deliveryStartDay,
      description: row.description,
      quantity: row.quantity,
      rowKey: row.rowKey,
      source: row.source,
      sourceBuildCostItemId: row.sourceBuildCostItemId,
      specificationTiptapJson: row.specificationTiptapJson,
      title: row.title,
      unit: row.unit,
    })),
    recipientProfileIds: state.recipients.map(
      (recipient) => recipient.recipientProfileId
    ),
    responseDeadline: state.draft.responseDeadline,
    templateVersionId: state.draft.templateVersionId,
  };
}

async function packageRevisionProjection(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization,
  packageRevision: Doc<"quotePackageRevisions">
) {
  if (
    packageRevision.buildId !== authorization.build._id ||
    packageRevision.organizationId !== authorization.organizationId ||
    packageRevision.brokerageId !== authorization.brokerage._id
  ) {
    throw new ConvexError("Quote Package Revision crosses Build scope.");
  }
  const [attachments, labourLines, materialLines, responseFields] =
    await Promise.all([
      ctx.db
        .query("quotePackageRevisionAttachments")
        .withIndex("by_quotePackageRevisionId_and_order", (query) =>
          query.eq("quotePackageRevisionId", packageRevision._id)
        )
        .take(MAX_INHERITED_ATTACHMENTS + 1),
      ctx.db
        .query("quotePackageRevisionLabourLines")
        .withIndex("by_quotePackageRevisionId_and_order", (query) =>
          query.eq("quotePackageRevisionId", packageRevision._id)
        )
        .take(MAX_DRAFT_LABOUR_LINES + 1),
      ctx.db
        .query("quotePackageRevisionMaterialLines")
        .withIndex("by_quotePackageRevisionId_and_order", (query) =>
          query.eq("quotePackageRevisionId", packageRevision._id)
        )
        .take(MAX_DRAFT_MATERIAL_LINES + 1),
      ctx.db
        .query("quotePackageRevisionResponseFields")
        .withIndex("by_quotePackageRevisionId_and_order", (query) =>
          query.eq("quotePackageRevisionId", packageRevision._id)
        )
        .take(101),
    ]);
  if (
    attachments.length > MAX_INHERITED_ATTACHMENTS ||
    labourLines.length > MAX_DRAFT_LABOUR_LINES ||
    materialLines.length > MAX_DRAFT_MATERIAL_LINES ||
    responseFields.length === 0 ||
    responseFields.length > 100
  ) {
    throw new ConvexError(
      "Quote Package Revision exceeds supported scope limits."
    );
  }
  const materialWithAssignments = await Promise.all(
    materialLines.map(async (line) => {
      const assignments = await ctx.db
        .query("quotePackageRevisionMaterialAssignments")
        .withIndex("by_quotePackageRevisionMaterialLineId_and_order", (query) =>
          query.eq("quotePackageRevisionMaterialLineId", line._id)
        )
        .take(MAX_MATERIAL_ASSIGNMENTS_PER_ROW + 1);
      if (assignments.length > MAX_MATERIAL_ASSIGNMENTS_PER_ROW) {
        throw new ConvexError(
          "Quote Package Material line has too many assignments."
        );
      }
      return {
        assignments: assignments.map((assignment) => ({
          buildSubmilestoneId: assignment.buildSubmilestoneId,
          milestoneKey: assignment.milestoneKey,
          milestoneName: assignment.milestoneName,
          submilestoneKey: assignment.submilestoneKey,
          submilestoneName: assignment.submilestoneName,
        })),
        deliveryEndDay: line.deliveryEndDay,
        deliveryInstructions: line.deliveryInstructions,
        deliveryLocation: line.deliveryLocation,
        deliveryStartDay: line.deliveryStartDay,
        description: line.description,
        quantity: line.quantity,
        source: line.source,
        sourceBuildCostItemId: line.sourceBuildCostItemId,
        specificationTiptapJson: line.specificationTiptapJson,
        title: line.title,
        unit: line.unit,
      };
    })
  );
  return {
    _id: packageRevision._id,
    attachments: attachments.map((attachment) => ({
      contentHashSha256Snapshot: attachment.contentHashSha256Snapshot,
      fileNameSnapshot: attachment.fileNameSnapshot,
      kind: attachment.kind,
      mimeTypeSnapshot: attachment.mimeTypeSnapshot,
      sourceBuildDocumentId: attachment.sourceBuildDocumentId,
      sourceBuildSubmilestoneId: attachment.sourceBuildSubmilestoneId,
    })),
    labourLines: labourLines.map((line) => ({
      buildSubmilestoneId: line.buildSubmilestoneId,
      milestoneKey: line.milestoneKey,
      milestoneName: line.milestoneName,
      scopeOfWorkTiptapJson: line.scopeOfWorkTiptapJson,
      startDay: line.startDay,
      submilestoneKey: line.submilestoneKey,
      submilestoneName: line.submilestoneName,
    })),
    materialLines: materialWithAssignments,
    permitDocumentId: packageRevision.permitDocumentId,
    responseDeadline: packageRevision.responseDeadline,
    responseFields: responseFields.map((field) => ({
      allowAlternates: field.allowAlternates,
      allowExclusions: field.allowExclusions,
      choiceOptions: field.choiceOptions,
      fieldKey: field.fieldKey,
      isPermanent: field.isPermanent,
      kind: field.kind,
      label: field.label,
      order: field.order,
      renderer: field.renderer,
      repeatable: field.repeatable,
      required: field.required,
      richTextDefaultHtml: field.richTextDefaultHtml,
      scope: field.scope,
      supportsTax: field.supportsTax,
      tax: field.tax,
      validation: field.validation,
    })),
    revision: packageRevision.revision,
    roadmapSnapshotFingerprint: packageRevision.roadmapSnapshotFingerprint,
    siteAddressSnapshot: packageRevision.siteAddressSnapshot,
    siteLatitudeSnapshot: packageRevision.siteLatitudeSnapshot,
    siteLongitudeSnapshot: packageRevision.siteLongitudeSnapshot,
    siteMapUrlSnapshot: packageRevision.siteMapUrlSnapshot,
    sitePlaceIdSnapshot: packageRevision.sitePlaceIdSnapshot,
    templateVersionId: packageRevision.templateVersionId,
    timelineCurrentDaySnapshot: packageRevision.timelineCurrentDaySnapshot,
    timelineRangeMaxSnapshot: packageRevision.timelineRangeMaxSnapshot,
    timelineRangeMinSnapshot: packageRevision.timelineRangeMinSnapshot,
    timelineStartDateSnapshot: packageRevision.timelineStartDateSnapshot,
  };
}

async function quoteRoundProjection(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization,
  round: Doc<"quoteRounds">
) {
  const invitations = await ctx.db
    .query("quoteRoundInvitations")
    .withIndex("by_quoteRoundId_and_participationState", (query) =>
      query.eq("quoteRoundId", round._id).eq("participationState", "active")
    )
    .take(MAX_DRAFT_RECIPIENTS + 1);
  if (invitations.length > MAX_DRAFT_RECIPIENTS) {
    throw new ConvexError("Quote Round has too many invitations.");
  }
  const draft =
    round.state === "draft" ? await readDraftState(ctx, round) : null;
  const packageRevision = round.currentPackageRevisionId
    ? await ctx.db.get(round.currentPackageRevisionId)
    : null;
  return {
    _id: round._id,
    buildId: round.buildId,
    draft: draft ? draftProjection(draft) : null,
    invitations: invitations.map((invitation) => ({
      _id: invitation._id,
      participationState: invitation.participationState,
      recipientCapabilitiesSnapshot: invitation.recipientCapabilitiesSnapshot,
      recipientEmailSnapshot: invitation.recipientEmailSnapshot,
      recipientNameSnapshot: invitation.recipientNameSnapshot,
      recipientProfileId: invitation.recipientProfileId,
    })),
    mode: round.mode,
    packageRevision: packageRevision
      ? await packageRevisionProjection(ctx, authorization, packageRevision)
      : null,
    revision: round.revision,
    state: round.state,
    title: round.title,
    updatedAt: round.updatedAt,
  };
}

async function appendQuoteRoundEvent(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  input: {
    command: string;
    eventType: string;
    newState?: Record<string, unknown>;
    priorState?: Record<string, unknown>;
    quoteRoundId: Id<"quoteRounds">;
    warnings?: string[];
  },
  now: number
) {
  const newState = input.newState ? JSON.stringify(input.newState) : undefined;
  const priorState = input.priorState
    ? JSON.stringify(input.priorState)
    : undefined;
  await ctx.db.insert("auditEvents", {
    actorRoles: authorization.viewer.roles,
    actorWorkosUserId: authorization.viewer.subject,
    brokerageId: authorization.brokerage._id,
    command: input.command,
    createdAt: now,
    entityId: String(input.quoteRoundId),
    entityType: "quoteRound",
    eventType: input.eventType,
    newState,
    organizationId: authorization.organizationId,
    priorState,
    warnings: input.warnings ?? [],
  });
  await ctx.db.insert("eventOutbox", {
    brokerageId: authorization.brokerage._id,
    createdAt: now,
    eventType: input.eventType,
    organizationId: authorization.organizationId,
    payloadPreview: JSON.stringify({
      buildId: authorization.build._id,
      quoteRoundId: input.quoteRoundId,
      ...(input.newState ?? {}),
    }),
    relatedEntityId: String(input.quoteRoundId),
    relatedEntityType: "quoteRound",
    status: "pending",
  });
}

async function replaceDraftLabourScope(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  round: Doc<"quoteRounds">,
  existing: Doc<"quoteRoundDraftLabourScope">[],
  ids: Id<"buildSubmilestones">[],
  now: number
) {
  const validIds = await validateLabourSubmilestoneIds(ctx, authorization, ids);
  for (const row of existing) {
    await ctx.db.delete(row._id);
  }
  for (const [order, buildSubmilestoneId] of validIds.entries()) {
    await ctx.db.insert("quoteRoundDraftLabourScope", {
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      buildSubmilestoneId,
      createdAt: now,
      order,
      organizationId: authorization.organizationId,
      quoteRoundId: round._id,
      updatedAt: now,
    });
  }
}

async function replaceDraftMaterialRows(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  round: Doc<"quoteRounds">,
  existingRows: Doc<"quoteRoundDraftMaterialRows">[],
  assignmentsByRowId: DraftState["materialAssignmentsByRowId"],
  inputRows: DraftMaterialRowInput[],
  now: number
) {
  const rows = await validateDraftMaterialRows(ctx, authorization, inputRows);
  for (const row of existingRows) {
    for (const assignment of assignmentsByRowId.get(row._id) ?? []) {
      await ctx.db.delete(assignment._id);
    }
    await ctx.db.delete(row._id);
  }
  for (const [order, item] of rows.entries()) {
    const sourceCostItemId = item.input.sourceBuildCostItemId;
    const adHoc = item.normalizedAdHoc;
    const rowId = await ctx.db.insert("quoteRoundDraftMaterialRows", {
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      createdAt: now,
      deliveryEndDay: adHoc?.deliveryEndDay,
      deliveryInstructions: adHoc?.deliveryInstructions,
      deliveryLocation: adHoc?.deliveryLocation,
      deliveryStartDay: adHoc?.deliveryStartDay,
      description: adHoc?.description,
      order,
      organizationId: authorization.organizationId,
      quantity: adHoc?.quantity,
      quoteRoundId: round._id,
      rowKey: item.input.rowKey,
      source: item.input.source,
      sourceBuildCostItemId: sourceCostItemId,
      specificationTiptapJson: adHoc?.specificationTiptapJson,
      title: adHoc?.title,
      unit: adHoc?.unit,
      updatedAt: now,
    });
    for (const [
      assignmentOrder,
      buildSubmilestoneId,
    ] of item.assignments.entries()) {
      await ctx.db.insert("quoteRoundDraftMaterialAssignments", {
        brokerageId: authorization.brokerage._id,
        buildId: authorization.build._id,
        buildSubmilestoneId,
        createdAt: now,
        order: assignmentOrder,
        organizationId: authorization.organizationId,
        quoteRoundDraftMaterialRowId: rowId,
        quoteRoundId: round._id,
        updatedAt: now,
      });
    }
  }
}

async function replaceDraftRecipients(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  round: Doc<"quoteRounds">,
  existing: Doc<"quoteRoundDraftRecipients">[],
  recipientProfileIds: Id<"contractorProfiles">[],
  now: number
) {
  await validateRecipients(ctx, authorization, round.mode, recipientProfileIds);
  for (const row of existing) {
    await ctx.db.delete(row._id);
  }
  for (const [order, recipientProfileId] of recipientProfileIds.entries()) {
    await ctx.db.insert("quoteRoundDraftRecipients", {
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      createdAt: now,
      order,
      organizationId: authorization.organizationId,
      quoteRoundId: round._id,
      recipientProfileId,
      updatedAt: now,
    });
  }
}

interface PreparedLabourLine {
  milestone: Doc<"buildMilestones">;
  scopeOfWorkTiptapJson: string;
  submilestone: Doc<"buildSubmilestones">;
}

interface PreparedMaterialLine {
  assignments: {
    milestone: Doc<"buildMilestones">;
    submilestone: Doc<"buildSubmilestones">;
  }[];
  deliveryEndDay: number;
  deliveryInstructions: string;
  deliveryLocation: string;
  deliveryStartDay: number;
  description?: string;
  quantity: number;
  row: Doc<"quoteRoundDraftMaterialRows">;
  sourceBuildCostItemId?: Id<"buildCostItems">;
  specificationTiptapJson: string;
  title: string;
  unit: string;
}

interface PreparedPackageAttachment {
  asset: Doc<"buildCollaborationAssets">;
  document: Doc<"buildDocuments">;
  kind: "permit" | "inherited";
  sourceBuildSubmilestoneId?: Id<"buildSubmilestones">;
}

interface PreparedPublication {
  attachments: PreparedPackageAttachment[];
  deadline: number;
  labourLines: PreparedLabourLine[];
  materialLines: PreparedMaterialLine[];
  permit: PreparedPackageAttachment;
  recipients: Awaited<ReturnType<typeof validateRecipients>>;
  roadmapSnapshotFingerprint: string;
  template: Awaited<ReturnType<typeof requirePublishedTemplateVersion>>;
}

interface QuoteRoundPublicationResult {
  idempotentReplay: boolean;
  invitationCount: number;
  invitationIds: Id<"quoteRoundInvitations">[];
  packageRevisionId: Id<"quotePackageRevisions">;
  packageRevisionNumber: number;
  quoteRoundId: Id<"quoteRounds">;
  responseDeadline: number;
  state: "open";
}

async function preparedLabourLines(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization,
  state: DraftState
) {
  return await Promise.all(
    state.labourScope.map(async (scope) => {
      if (
        scope.buildId !== authorization.build._id ||
        scope.organizationId !== authorization.organizationId ||
        scope.brokerageId !== authorization.brokerage._id
      ) {
        throw new ConvexError("Draft Labour scope crosses Build scope.");
      }
      const { milestone, submilestone } = await requireBuildSubmilestone(
        ctx,
        authorization,
        scope.buildSubmilestoneId
      );
      const scopeOfWorkTiptapJson = submilestone.scopeOfWorkTiptapJson
        ? normalizeTiptapJson(
            submilestone.scopeOfWorkTiptapJson,
            "Sub-milestone Scope of Work"
          )
        : plainTextTiptapJson(
            submilestone.fieldNote?.trim() || submilestone.name
          );
      return { milestone, scopeOfWorkTiptapJson, submilestone };
    })
  );
}

async function preparedMaterialLines(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization,
  state: DraftState
) {
  const assignmentRowsByMaterialRow = new Map<
    Id<"quoteRoundDraftMaterialRows">,
    Doc<"quoteRoundDraftMaterialAssignments">[]
  >();
  const submilestoneIds = new Set<Id<"buildSubmilestones">>();
  const sourceCostItemIds = new Set<Id<"buildCostItems">>();

  for (const row of state.materialRows) {
    if (
      row.buildId !== authorization.build._id ||
      row.organizationId !== authorization.organizationId ||
      row.brokerageId !== authorization.brokerage._id
    ) {
      throw new ConvexError("Draft Material row crosses Build scope.");
    }
    const assignmentRows = state.materialAssignmentsByRowId.get(row._id) ?? [];
    if (assignmentRows.length === 0) {
      throw new ConvexError(
        "Every Material row must be assigned to at least one Sub-milestone."
      );
    }
    assignmentRowsByMaterialRow.set(row._id, assignmentRows);
    for (const assignment of assignmentRows) {
      if (
        assignment.quoteRoundId !== row.quoteRoundId ||
        assignment.buildId !== authorization.build._id ||
        assignment.organizationId !== authorization.organizationId ||
        assignment.brokerageId !== authorization.brokerage._id
      ) {
        throw new ConvexError("Draft Material assignment crosses Build scope.");
      }
      submilestoneIds.add(assignment.buildSubmilestoneId);
    }
    if (row.source === "build_cost_item") {
      if (!row.sourceBuildCostItemId) {
        throw new ConvexError(
          "Draft Material row is missing its Build Cost Item source."
        );
      }
      sourceCostItemIds.add(row.sourceBuildCostItemId);
    }
  }
  assertAggregateMaterialAssignments(
    [...assignmentRowsByMaterialRow.values()].reduce(
      (total, assignments) => total + assignments.length,
      0
    )
  );
  assertDistinctMaterialSubmilestones(submilestoneIds.size);
  const submilestoneSources = new Map(
    await Promise.all(
      [...submilestoneIds].map(async (id) => {
        const source = await requireBuildSubmilestone(ctx, authorization, id);
        return [id, source] as const;
      })
    )
  );
  const costItemSources = new Map(
    await Promise.all(
      [...sourceCostItemIds].map(async (id) => {
        const source = await requireBuildCostItem(ctx, authorization, id);
        return [id, source] as const;
      })
    )
  );
  return state.materialRows.map((row) => {
    const assignmentRows = assignmentRowsByMaterialRow.get(row._id) ?? [];
    const assignments = assignmentRows.map((assignment) => {
      const source = submilestoneSources.get(assignment.buildSubmilestoneId);
      if (!source) {
        throw new ConvexError(
          "Sub-milestone source is unavailable for this Build."
        );
      }
      return source;
    });
    if (row.source === "build_cost_item") {
      if (!row.sourceBuildCostItemId) {
        throw new ConvexError(
          "Draft Material row is missing its Build Cost Item source."
        );
      }
      const source = costItemSources.get(row.sourceBuildCostItemId);
      if (!source) {
        throw new ConvexError(
          "Material Cost Item is unavailable for this Build."
        );
      }
      return {
        assignments,
        ...materialFieldsFromSource(source),
        row,
        sourceBuildCostItemId: source._id,
      };
    }
    if (row.source !== "ad_hoc") {
      throw new ConvexError("Draft Material row has an unsupported source.");
    }
    return {
      assignments,
      ...materialFieldsFromSource(row),
      row,
    };
  });
}

function assertSubmilestoneDocumentLinkScope(
  link: Doc<"buildSubmilestoneDocumentLinks">,
  authorization: ActiveBuildAuthorization,
  buildSubmilestoneId: Id<"buildSubmilestones">
) {
  if (
    link.buildId !== authorization.build._id ||
    link.organizationId !== authorization.organizationId ||
    link.brokerageId !== authorization.brokerage._id ||
    link.buildSubmilestoneId !== buildSubmilestoneId
  ) {
    throw new ConvexError("Sub-milestone document link crosses Build scope.");
  }
}

async function inheritedAttachmentForLink(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization,
  link: Doc<"buildSubmilestoneDocumentLinks">,
  buildSubmilestoneId: Id<"buildSubmilestones">,
  permitDocumentId: Id<"buildDocuments">
): Promise<PreparedPackageAttachment | null> {
  assertSubmilestoneDocumentLinkScope(link, authorization, buildSubmilestoneId);
  if (link.visibility === "unclassified") {
    throw new ConvexError(
      "A linked Sub-milestone document must be classified before publishing a Quote Round."
    );
  }
  if (
    link.visibility === "internal" ||
    link.buildDocumentId === permitDocumentId
  ) {
    return null;
  }
  if (link.visibility !== "recipient_shareable") {
    throw new ConvexError(
      "Sub-milestone document link has an unsupported visibility."
    );
  }
  const document = await ctx.db.get(link.buildDocumentId);
  if (!document) {
    throw new ConvexError("Linked Sub-milestone document is unavailable.");
  }
  const governed = await requireGovernedBuildDocument(
    ctx,
    authorization,
    document,
    "Linked Sub-milestone document"
  );
  return {
    asset: governed.asset,
    document: governed.document,
    kind: "inherited",
    sourceBuildSubmilestoneId: buildSubmilestoneId,
  };
}

async function inheritedPackageAttachments(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization,
  submilestoneIds: Id<"buildSubmilestones">[],
  permitDocumentId: Id<"buildDocuments">
) {
  const documents = new Map<Id<"buildDocuments">, PreparedPackageAttachment>();
  let inspectedLinkCount = 0;
  for (const buildSubmilestoneId of submilestoneIds) {
    const remainingLinkBudget =
      MAX_INHERITED_LINKS_SCANNED - inspectedLinkCount;
    const links = await ctx.db
      .query("buildSubmilestoneDocumentLinks")
      .withIndex("by_buildSubmilestoneId", (query) =>
        query.eq("buildSubmilestoneId", buildSubmilestoneId)
      )
      .take(Math.min(MAX_INHERITED_ATTACHMENTS + 1, remainingLinkBudget + 1));
    inspectedLinkCount += links.length;
    if (inspectedLinkCount > MAX_INHERITED_LINKS_SCANNED) {
      throw new ConvexError(
        "Quote Package linked-document discovery exceeded its safe scan limit."
      );
    }
    if (links.length > MAX_INHERITED_ATTACHMENTS) {
      throw new ConvexError(
        "Sub-milestone has too many linked documents for a Quote Package."
      );
    }
    for (const link of links) {
      const attachment = await inheritedAttachmentForLink(
        ctx,
        authorization,
        link,
        buildSubmilestoneId,
        permitDocumentId
      );
      if (!attachment) {
        continue;
      }
      documents.set(attachment.document._id, attachment);
      if (documents.size > MAX_INHERITED_ATTACHMENTS - 1) {
        throw new ConvexError(
          "Quote Package supports at most 200 inherited documents."
        );
      }
    }
  }
  return [...documents.values()].sort(
    (left, right) =>
      left.document.fileName.localeCompare(right.document.fileName) ||
      String(left.document._id).localeCompare(String(right.document._id))
  );
}

async function roadmapSnapshotFingerprint(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization
) {
  const [milestones, submilestones] = await Promise.all([
    ctx.db
      .query("buildMilestones")
      .withIndex("by_build_order", (query) =>
        query.eq("buildId", authorization.build._id)
      )
      .take(501),
    ctx.db
      .query("buildSubmilestones")
      .withIndex("by_build", (query) =>
        query.eq("buildId", authorization.build._id)
      )
      .take(501),
  ]);
  if (milestones.length > 500 || submilestones.length > 500) {
    throw new ConvexError(
      "Build roadmap exceeds the Quote Package snapshot limit."
    );
  }
  return await operationalRequestFingerprint({
    buildId: String(authorization.build._id),
    startDate: authorization.build.startDate,
    timelineCurrentDay: authorization.build.timelineCurrentDay,
    timelineRangeMax: authorization.build.timelineRangeMax,
    timelineRangeMin: authorization.build.timelineRangeMin,
    milestones: milestones.map((milestone) => ({
      dayEnd: milestone.dayEnd,
      dayStart: milestone.dayStart,
      id: String(milestone._id),
      key: milestone.key,
      status: milestone.status,
      updatedAt: milestone.updatedAt,
    })),
    submilestones: submilestones
      .sort(
        (left, right) =>
          String(left.buildMilestoneId).localeCompare(
            String(right.buildMilestoneId)
          ) ||
          left.order - right.order ||
          String(left._id).localeCompare(String(right._id))
      )
      .map((submilestone) => ({
        buildMilestoneId: String(submilestone.buildMilestoneId),
        durationDays: submilestone.durationDays,
        id: String(submilestone._id),
        key: submilestone.key,
        startDay: submilestone.startDay,
        status: submilestone.status,
        updatedAt: submilestone.updatedAt,
      })),
  });
}

async function preparePublication(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization,
  round: Doc<"quoteRounds">,
  state: DraftState,
  now: number
): Promise<PreparedPublication> {
  if (!state.draft.templateVersionId) {
    throw new ConvexError(
      "Select a published Quote Response Template before publishing."
    );
  }
  if (state.draft.responseDeadline === undefined) {
    throw new ConvexError(
      "A Quote Response Deadline is required before publishing."
    );
  }
  const deadline = requiredInteger(
    state.draft.responseDeadline,
    "Quote Response Deadline"
  );
  if (deadline <= now) {
    throw new ConvexError("Quote Response Deadline must be in the future.");
  }
  const [template, labourLines, materialLines, permit] = await Promise.all([
    requirePublishedTemplateVersion(
      ctx,
      authorization,
      round.mode,
      state.draft.templateVersionId
    ),
    preparedLabourLines(ctx, authorization, state),
    preparedMaterialLines(ctx, authorization, state),
    currentPermitDocument(ctx, authorization),
  ]);
  requireModeScope(round.mode, {
    labourCount: labourLines.length,
    materialCount: materialLines.length,
  });
  const recipients = await validateRecipients(
    ctx,
    authorization,
    round.mode,
    state.recipients.map((recipient) => recipient.recipientProfileId)
  );
  if (recipients.length === 0) {
    throw new ConvexError(
      "At least one compatible Quote recipient is required before publishing."
    );
  }
  const scopedSubmilestoneIds = [
    ...new Set([
      ...labourLines.map((line) => line.submilestone._id),
      ...materialLines.flatMap((line) =>
        line.assignments.map((assignment) => assignment.submilestone._id)
      ),
    ]),
  ];
  const [attachments, roadmapHash] = await Promise.all([
    inheritedPackageAttachments(
      ctx,
      authorization,
      scopedSubmilestoneIds,
      permit.document._id
    ),
    roadmapSnapshotFingerprint(ctx, authorization),
  ]);
  return {
    attachments,
    deadline,
    labourLines,
    materialLines,
    permit: {
      asset: permit.asset,
      document: permit.document,
      kind: "permit",
    },
    recipients,
    roadmapSnapshotFingerprint: roadmapHash,
    template,
  };
}

async function replayQuoteRoundPublication(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  round: Doc<"quoteRounds">,
  existingRequest: Doc<"quoteRoundPublicationRequests"> | null,
  expectedRevision: number,
  requestFingerprint: string
): Promise<QuoteRoundPublicationResult | null> {
  if (!existingRequest) {
    return null;
  }
  if (
    existingRequest.buildId !== authorization.build._id ||
    existingRequest.organizationId !== authorization.organizationId ||
    existingRequest.brokerageId !== authorization.brokerage._id ||
    existingRequest.requestFingerprint !== requestFingerprint ||
    existingRequest.expectedDraftRevision !== expectedRevision
  ) {
    throw new ConvexError(
      "Quote Round publication idempotency key was reused with a different request."
    );
  }
  const packageRevision = await ctx.db.get(
    existingRequest.quotePackageRevisionId
  );
  if (
    !packageRevision ||
    packageRevision.quoteRoundId !== round._id ||
    packageRevision.buildId !== authorization.build._id ||
    packageRevision.organizationId !== authorization.organizationId ||
    packageRevision.brokerageId !== authorization.brokerage._id
  ) {
    throw new ConvexError("Quote Round publication record is inconsistent.");
  }
  const invitations = await ctx.db
    .query("quoteRoundInvitations")
    .withIndex("by_quoteRoundId_and_participationState", (query) =>
      query.eq("quoteRoundId", round._id).eq("participationState", "active")
    )
    .take(MAX_DRAFT_RECIPIENTS + 1);
  if (invitations.length === 0 || invitations.length > MAX_DRAFT_RECIPIENTS) {
    throw new ConvexError(
      "Quote Round publication invitations are inconsistent."
    );
  }
  await Promise.all(
    invitations.map(async (invitation) => {
      if (
        invitation.buildId !== authorization.build._id ||
        invitation.organizationId !== authorization.organizationId ||
        invitation.brokerageId !== authorization.brokerage._id ||
        invitation.quotePackageRevisionId !== packageRevision._id
      ) {
        throw new ConvexError("Quote Round invitation crosses Build scope.");
      }
      const credentials = await ctx.db
        .query("quoteInvitationAccessCredentials")
        .withIndex("by_quoteRoundInvitationId_and_state", (query) =>
          query
            .eq("quoteRoundInvitationId", invitation._id)
            .eq("state", "active")
        )
        .take(2);
      if (credentials.length !== 1) {
        throw new ConvexError(
          "Quote Round invitation credential is inconsistent."
        );
      }
    })
  );
  return {
    idempotentReplay: true,
    invitationCount: invitations.length,
    invitationIds: invitations.map((invitation) => invitation._id),
    packageRevisionId: packageRevision._id,
    packageRevisionNumber: packageRevision.revision,
    quoteRoundId: round._id,
    responseDeadline: packageRevision.responseDeadline,
    state: "open",
  };
}

async function publishedTemplateProjection(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization,
  versionId: Id<"quoteResponseTemplateVersions">
) {
  const version = await ctx.db.get(versionId);
  if (
    !version ||
    version.status !== "published" ||
    version.validationState !== "valid" ||
    version.organizationId !== authorization.organizationId ||
    version.brokerageId !== authorization.brokerage._id
  ) {
    return null;
  }
  const template = await ctx.db.get(version.templateId);
  if (
    !template ||
    template.status !== "active" ||
    template.organizationId !== authorization.organizationId ||
    template.brokerageId !== authorization.brokerage._id
  ) {
    return null;
  }
  const fields = await ctx.db
    .query("quoteResponseTemplateFields")
    .withIndex("by_version_order", (query) =>
      query.eq("versionId", version._id)
    )
    .take(101);
  if (fields.length === 0 || fields.length > 100) {
    return null;
  }
  for (const field of fields) {
    if (
      field.templateId !== template._id ||
      field.versionId !== version._id ||
      field.organizationId !== authorization.organizationId ||
      field.brokerageId !== authorization.brokerage._id
    ) {
      throw new ConvexError(
        "Quote Response Template field crosses organization scope."
      );
    }
  }
  return {
    _id: version._id,
    audience: version.audience,
    description: version.description,
    fields: fields.map((field) => ({
      _id: field._id,
      allowAlternates: field.allowAlternates,
      allowExclusions: field.allowExclusions,
      choiceOptions: field.choiceOptions,
      fieldKey: field.fieldKey,
      isPermanent: field.isPermanent,
      kind: field.kind,
      label: field.label,
      order: field.order,
      renderer: field.renderer,
      repeatable: field.repeatable,
      required: field.required,
      richTextDefaultHtml: field.richTextDefaultHtml,
      scope: field.scope,
      supportsTax: field.supportsTax,
      tax: field.tax,
      validation: field.validation,
    })),
    name: version.name,
    templateId: template._id,
    version: version.version,
  };
}

export const getQuoteRoundComposer = authenticatedQuery
  .input({ buildId: v.string(), workosOrganizationId: v.string() })
  .returns(v.union(composerProjectionValidator, v.null()))
  .handler(async (ctx, args) => {
    const buildId = ctx.db.normalizeId("activeBuilds", args.buildId);
    if (!buildId) {
      return null;
    }
    const authorization = await authorizeQuoteRoundPath(ctx, {
      buildId,
      workosOrganizationId: args.workosOrganizationId,
    });
    const [milestones, submilestones, costItems, profiles, templates] =
      await Promise.all([
        ctx.db
          .query("buildMilestones")
          .withIndex("by_build_order", (query) =>
            query.eq("buildId", authorization.build._id)
          )
          .take(501),
        ctx.db
          .query("buildSubmilestones")
          .withIndex("by_build", (query) =>
            query.eq("buildId", authorization.build._id)
          )
          .take(501),
        ctx.db
          .query("buildCostItems")
          .withIndex("by_build", (query) =>
            query.eq("buildId", authorization.build._id)
          )
          .take(501),
        ctx.db
          .query("contractorProfiles")
          .withIndex("by_brokerage", (query) =>
            query.eq("brokerageId", authorization.brokerage._id)
          )
          .take(MAX_DRAFT_RECIPIENTS + 1),
        ctx.db
          .query("quoteResponseTemplates")
          .withIndex("by_organization_status", (query) =>
            query
              .eq("organizationId", authorization.organizationId)
              .eq("status", "active")
          )
          .take(101),
      ]);
    if (
      milestones.length > 500 ||
      submilestones.length > 500 ||
      costItems.length > 500 ||
      profiles.length > MAX_DRAFT_RECIPIENTS ||
      templates.length > 100
    ) {
      throw new ConvexError(
        "Quote Round composer source exceeds supported limits."
      );
    }

    const milestoneById = new Map(
      milestones.map((milestone) => [milestone._id, milestone])
    );
    const labourSubmilestones = submilestones
      .filter(
        (submilestone) =>
          submilestone.organizationId === authorization.organizationId &&
          submilestone.brokerageId === authorization.brokerage._id
      )
      .sort(
        (left, right) =>
          left.order - right.order || left.name.localeCompare(right.name)
      )
      .map((submilestone) => {
        const milestone = milestoneById.get(submilestone.buildMilestoneId);
        if (
          !milestone ||
          milestone.organizationId !== authorization.organizationId ||
          milestone.brokerageId !== authorization.brokerage._id
        ) {
          throw new ConvexError("Build roadmap source is inconsistent.");
        }
        return {
          _id: submilestone._id,
          budgetCents: submilestone.budgetCents,
          buildMilestoneId: milestone._id,
          durationDays: submilestone.durationDays,
          milestoneKey: milestone.key,
          milestoneName: milestone.name,
          name: submilestone.name,
          order: submilestone.order,
          scopeOfWorkTiptapJson: submilestone.scopeOfWorkTiptapJson
            ? normalizeTiptapJson(
                submilestone.scopeOfWorkTiptapJson,
                "Sub-milestone Scope of Work"
              )
            : plainTextTiptapJson(
                submilestone.fieldNote?.trim() || submilestone.name
              ),
          startDay: submilestone.startDay,
          submilestoneKey: submilestone.key,
        };
      });
    const materialCostItems = costItems
      .filter(
        (item) =>
          item.itemType === "material" &&
          item.organizationId === authorization.organizationId &&
          item.brokerageId === authorization.brokerage._id &&
          item.proposalId === authorization.proposal._id
      )
      .sort((left, right) => left.itemKey.localeCompare(right.itemKey))
      .map((item) => ({
        _id: item._id,
        deliveryEndDay: item.deliveryEndDay,
        deliveryInstructions: item.deliveryInstructions,
        deliveryLocation: item.deliveryLocation,
        deliveryStartDay: item.deliveryStartDay,
        description: item.description,
        milestoneKey: item.milestoneKey,
        quantity: item.quantity,
        relevantSubmilestoneKeys: item.relevantSubmilestoneKeys,
        specificationTiptapJson: item.specificationTiptapJson,
        title: item.title,
        unit: item.unit,
      }));
    const currentPermit = await resolveCurrentPermitDocument(
      ctx,
      authorization
    );
    const responseTemplates: NonNullable<
      Awaited<ReturnType<typeof publishedTemplateProjection>>
    >[] = [];
    for (const template of templates) {
      const versionId = template.selectedVersionId ?? template.currentVersionId;
      if (!versionId) {
        continue;
      }
      const version = await publishedTemplateProjection(
        ctx,
        authorization,
        versionId
      );
      if (version) {
        responseTemplates.push(version);
      }
    }
    return {
      build: {
        _id: authorization.build._id,
        buildName: authorization.build.buildName,
        location: authorization.build.location,
        locationLatitude: authorization.build.locationLatitude,
        locationLongitude: authorization.build.locationLongitude,
        locationPlaceId: authorization.build.locationPlaceId,
        startDate: authorization.build.startDate,
        timelineCurrentDay: authorization.build.timelineCurrentDay,
        timelineRangeMax: authorization.build.timelineRangeMax,
        timelineRangeMin: authorization.build.timelineRangeMin,
      },
      eligibleRecipients: profiles
        .filter(
          (profile) =>
            profile.organizationId === authorization.organizationId &&
            profile.status === "active"
        )
        .sort((left, right) => left.name.localeCompare(right.name))
        .flatMap((profile) => {
          const email = profile.email?.trim().toLowerCase();
          return email
            ? [
                {
                  _id: profile._id,
                  email,
                  name: profile.name,
                  quoteRecipientCapabilities: profileCapabilities(profile),
                  quoteRecipientProvisioningState:
                    profile.quoteRecipientProvisioningState,
                },
              ]
            : [];
        }),
      labourSubmilestones,
      materialCostItems,
      permit: currentPermit
        ? {
            _id: currentPermit._id,
            fileName: currentPermit.fileName,
            governedAssetId: currentPermit.governedAssetId,
            mimeType: currentPermit.mimeType,
            version: currentPermit.version ?? 1,
          }
        : null,
      responseTemplates,
    };
  })
  .public();

export const listQuoteRounds = authenticatedQuery
  .input({ buildId: v.id("activeBuilds"), workosOrganizationId: v.string() })
  .returns(quoteRoundListValidator)
  .handler(async (ctx, args) => {
    const authorization = await authorizeQuoteRoundPath(ctx, args);
    const rounds = await ctx.db
      .query("quoteRounds")
      .withIndex("by_buildId", (query) =>
        query.eq("buildId", authorization.build._id)
      )
      .order("desc")
      .take(101);
    if (rounds.length > 100) {
      throw new ConvexError("Build has too many Quote Rounds to load at once.");
    }
    const summaries = await Promise.all(
      rounds.map(async (round) => {
        requireRoundScope(round, authorization, round._id);
        const [packageRevision, invitations] = await Promise.all([
          round.currentPackageRevisionId
            ? ctx.db.get(round.currentPackageRevisionId)
            : Promise.resolve(null),
          ctx.db
            .query("quoteRoundInvitations")
            .withIndex("by_quoteRoundId_and_participationState", (query) =>
              query
                .eq("quoteRoundId", round._id)
                .eq("participationState", "active")
            )
            .take(MAX_DRAFT_RECIPIENTS + 1),
        ]);
        if (invitations.length > MAX_DRAFT_RECIPIENTS) {
          throw new ConvexError("Quote Round has too many invitations.");
        }
        if (
          packageRevision &&
          (packageRevision.quoteRoundId !== round._id ||
            packageRevision.buildId !== authorization.build._id ||
            packageRevision.organizationId !== authorization.organizationId ||
            packageRevision.brokerageId !== authorization.brokerage._id)
        ) {
          throw new ConvexError("Quote Package Revision crosses Build scope.");
        }
        return {
          _id: round._id,
          invitationCount: invitations.length,
          mode: round.mode,
          packageRevisionId: packageRevision?._id,
          packageRevisionNumber: packageRevision?.revision,
          responseDeadline: packageRevision?.responseDeadline,
          revision: round.revision,
          state: round.state,
          title: round.title,
          updatedAt: round.updatedAt,
        };
      })
    );
    return { rounds: summaries };
  })
  .public();

export const getQuoteRound = authenticatedQuery
  .input({
    buildId: v.string(),
    quoteRoundId: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(v.union(quoteRoundProjectionValidator, v.null()))
  .handler(async (ctx, args) => {
    const buildId = ctx.db.normalizeId("activeBuilds", args.buildId);
    const quoteRoundId = ctx.db.normalizeId("quoteRounds", args.quoteRoundId);
    if (!(buildId && quoteRoundId)) {
      return null;
    }
    const authorization = await authorizeQuoteRoundPath(ctx, {
      buildId,
      workosOrganizationId: args.workosOrganizationId,
    });
    const round = await ctx.db.get(quoteRoundId);
    if (!round) {
      return null;
    }
    requireRoundScope(round, authorization, quoteRoundId);
    return await quoteRoundProjection(ctx, authorization, round);
  })
  .public();

export const createQuoteRoundDraft = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    mode: quoteRoundModeValidator,
    title: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(quoteRoundDraftMutationResultValidator)
  .handler(async (ctx, args) => {
    const authorization = await authorizeQuoteRoundPath(ctx, args);
    const now = Date.now();
    const quoteRoundId = await ctx.db.insert("quoteRounds", {
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      createdAt: now,
      createdByWorkosUserId: authorization.viewer.subject,
      mode: args.mode,
      organizationId: authorization.organizationId,
      proposalId: authorization.proposal._id,
      revision: 0,
      state: "draft",
      title: requiredText(args.title, "Quote Round title", 240),
      updatedAt: now,
    });
    await ctx.db.insert("quoteRoundDrafts", {
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      createdAt: now,
      organizationId: authorization.organizationId,
      quoteRoundId,
      updatedAt: now,
    });
    await appendQuoteRoundEvent(
      ctx,
      authorization,
      {
        command: "createQuoteRoundDraft",
        eventType: "quote_round.draft_created",
        newState: {
          mode: args.mode,
          state: "draft",
          title: requiredText(args.title, "Quote Round title", 240),
        },
        quoteRoundId,
      },
      now
    );
    return { quoteRoundId, revision: 0, state: "draft" };
  })
  .public();

export const updateQuoteRoundDraft = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    expectedRevision: v.number(),
    labourSubmilestoneIds: v.optional(v.array(v.id("buildSubmilestones"))),
    materialRows: v.optional(v.array(materialDraftRowInputValidator)),
    quoteRoundId: v.id("quoteRounds"),
    recipientProfileIds: v.optional(v.array(v.id("contractorProfiles"))),
    responseDeadline: v.optional(v.union(v.number(), v.null())),
    templateVersionId: v.optional(
      v.union(v.id("quoteResponseTemplateVersions"), v.null())
    ),
    title: v.optional(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(quoteRoundDraftMutationResultValidator)
  .handler(async (ctx, args) => {
    const authorization = await authorizeQuoteRoundPath(ctx, args);
    const round = requireRoundScope(
      await ctx.db.get(args.quoteRoundId),
      authorization,
      args.quoteRoundId
    );
    requireDraftState(round);
    assertExpectedRevision(round, args.expectedRevision);
    const state = await readDraftState(ctx, round);
    const hasMutation =
      args.title !== undefined ||
      args.templateVersionId !== undefined ||
      args.responseDeadline !== undefined ||
      args.labourSubmilestoneIds !== undefined ||
      args.materialRows !== undefined ||
      args.recipientProfileIds !== undefined;
    if (!hasMutation) {
      throw new ConvexError(
        "A Quote Round draft update requires at least one changed field."
      );
    }
    if (
      round.mode === "labour" &&
      args.materialRows &&
      args.materialRows.length > 0
    ) {
      throw new ConvexError(
        "Labour Quote Rounds cannot contain Material scope."
      );
    }
    if (
      round.mode === "material" &&
      args.labourSubmilestoneIds &&
      args.labourSubmilestoneIds.length > 0
    ) {
      throw new ConvexError(
        "Material Quote Rounds cannot contain Labour scope."
      );
    }
    if (args.templateVersionId) {
      await requirePublishedTemplateVersion(
        ctx,
        authorization,
        round.mode,
        args.templateVersionId
      );
    }
    if (args.responseDeadline !== undefined && args.responseDeadline !== null) {
      const deadline = requiredInteger(
        args.responseDeadline,
        "Quote Response Deadline"
      );
      if (deadline <= 0) {
        throw new ConvexError("Quote Response Deadline must be positive.");
      }
    }
    const nextTitle =
      args.title === undefined
        ? round.title
        : requiredText(args.title, "Quote Round title", 240);
    const now = Date.now();
    if (args.labourSubmilestoneIds !== undefined) {
      await replaceDraftLabourScope(
        ctx,
        authorization,
        round,
        state.labourScope,
        args.labourSubmilestoneIds,
        now
      );
    }
    if (args.materialRows !== undefined) {
      await replaceDraftMaterialRows(
        ctx,
        authorization,
        round,
        state.materialRows,
        state.materialAssignmentsByRowId,
        args.materialRows,
        now
      );
    }
    if (args.recipientProfileIds !== undefined) {
      await replaceDraftRecipients(
        ctx,
        authorization,
        round,
        state.recipients,
        args.recipientProfileIds,
        now
      );
    }
    await ctx.db.patch(state.draft._id, {
      ...(args.responseDeadline === undefined
        ? {}
        : { responseDeadline: args.responseDeadline ?? undefined }),
      ...(args.templateVersionId === undefined
        ? {}
        : { templateVersionId: args.templateVersionId ?? undefined }),
      updatedAt: now,
    });
    const revision = round.revision + 1;
    await ctx.db.patch(round._id, {
      revision,
      title: nextTitle,
      updatedAt: now,
    });
    await appendQuoteRoundEvent(
      ctx,
      authorization,
      {
        command: "updateQuoteRoundDraft",
        eventType: "quote_round.draft_updated",
        newState: {
          revision,
          templateVersionId:
            args.templateVersionId === undefined
              ? state.draft.templateVersionId
              : args.templateVersionId,
          title: nextTitle,
        },
        priorState: { revision: round.revision, title: round.title },
        quoteRoundId: round._id,
      },
      now
    );
    return { quoteRoundId: round._id, revision, state: "draft" };
  })
  .public();

export const publishQuoteRoundDraft = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    expectedRevision: v.number(),
    idempotencyKey: v.string(),
    quoteRoundId: v.id("quoteRounds"),
    workosOrganizationId: v.string(),
  })
  .returns(quoteRoundPublicationResultValidator)
  .handler(async (ctx, args) => {
    const authorization = await authorizeQuoteRoundPath(ctx, args);
    const round = requireRoundScope(
      await ctx.db.get(args.quoteRoundId),
      authorization,
      args.quoteRoundId
    );
    const idempotencyKey = normalizeOperationalIdempotencyKey(
      args.idempotencyKey,
      "Quote Round publication idempotency key"
    );
    if (!Number.isInteger(args.expectedRevision)) {
      throw new ConvexError(
        "Quote Round expected revision must be an integer."
      );
    }
    const requestFingerprint = await operationalRequestFingerprint({
      buildId: String(authorization.build._id),
      expectedRevision: args.expectedRevision,
      quoteRoundId: String(round._id),
    });
    const existingRequest = await ctx.db
      .query("quoteRoundPublicationRequests")
      .withIndex("by_quoteRoundId_and_idempotencyKey", (query) =>
        query.eq("quoteRoundId", round._id).eq("idempotencyKey", idempotencyKey)
      )
      .unique();
    const replay = await replayQuoteRoundPublication(
      ctx,
      authorization,
      round,
      existingRequest,
      args.expectedRevision,
      requestFingerprint
    );
    if (replay) {
      return replay;
    }

    requireDraftState(round);
    assertExpectedRevision(round, args.expectedRevision);
    if (round.currentPackageRevisionId) {
      throw new ConvexError("Published Quote Round rows are immutable.");
    }
    const state = await readDraftState(ctx, round);
    const now = Date.now();
    const prepared = await preparePublication(
      ctx,
      authorization,
      round,
      state,
      now
    );
    const accessExpiresAt = defaultQuoteInvitationAccessExpiry({
      publishedAt: now,
      responseDeadline: prepared.deadline,
    });
    const packageRevisionId = await ctx.db.insert("quotePackageRevisions", {
      accessExpiresAt,
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      permitDocumentId: prepared.permit.document._id,
      permitDocumentVersion: prepared.permit.document.version ?? 1,
      publishedAt: now,
      publishedByWorkosUserId: authorization.viewer.subject,
      quoteRoundId: round._id,
      responseDeadline: prepared.deadline,
      revision: 1,
      roadmapSnapshotFingerprint: prepared.roadmapSnapshotFingerprint,
      siteAddressSnapshot: authorization.build.location,
      siteLatitudeSnapshot: authorization.build.locationLatitude,
      siteLongitudeSnapshot: authorization.build.locationLongitude,
      siteMapUrlSnapshot: mapUrlForBuild(authorization.build),
      sitePlaceIdSnapshot: authorization.build.locationPlaceId,
      sourceDraftRevision: round.revision,
      templateId: prepared.template.template._id,
      templateVersionId: prepared.template.version._id,
      timelineCurrentDaySnapshot: authorization.build.timelineCurrentDay,
      timelineRangeMaxSnapshot: authorization.build.timelineRangeMax,
      timelineRangeMinSnapshot: authorization.build.timelineRangeMin,
      timelineStartDateSnapshot: authorization.build.startDate,
      organizationId: authorization.organizationId,
    });
    const packageAttachments = [prepared.permit, ...prepared.attachments];
    for (const [order, attachment] of packageAttachments.entries()) {
      await ctx.db.insert("quotePackageRevisionAttachments", {
        brokerageId: authorization.brokerage._id,
        buildId: authorization.build._id,
        contentHashSha256Snapshot: governedAssetContentHash(attachment.asset),
        createdAt: now,
        fileNameSnapshot: attachment.asset.fileName,
        kind: attachment.kind,
        mimeTypeSnapshot: attachment.asset.mimeType,
        order,
        organizationId: authorization.organizationId,
        quotePackageRevisionId: packageRevisionId,
        quoteRoundId: round._id,
        sizeBytesSnapshot: attachment.asset.sizeBytes,
        sourceBuildDocumentId: attachment.document._id,
        sourceBuildSubmilestoneId: attachment.sourceBuildSubmilestoneId,
        sourceDocumentVersionSnapshot: attachment.document.version ?? 1,
        storageIdSnapshot: attachment.asset.storageId,
      });
    }
    for (const [order, labourLine] of prepared.labourLines.entries()) {
      await ctx.db.insert("quotePackageRevisionLabourLines", {
        brokerageId: authorization.brokerage._id,
        buildId: authorization.build._id,
        buildMilestoneId: labourLine.milestone._id,
        buildSubmilestoneId: labourLine.submilestone._id,
        budgetCents: labourLine.submilestone.budgetCents,
        createdAt: now,
        durationDays: labourLine.submilestone.durationDays,
        milestoneKey: labourLine.milestone.key,
        milestoneName: labourLine.milestone.name,
        order,
        organizationId: authorization.organizationId,
        quotePackageRevisionId: packageRevisionId,
        quoteRoundId: round._id,
        scopeOfWorkTiptapJson: labourLine.scopeOfWorkTiptapJson,
        startDay: labourLine.submilestone.startDay,
        submilestoneKey: labourLine.submilestone.key,
        submilestoneName: labourLine.submilestone.name,
      });
    }
    for (const [order, materialLine] of prepared.materialLines.entries()) {
      const materialLineId = await ctx.db.insert(
        "quotePackageRevisionMaterialLines",
        {
          brokerageId: authorization.brokerage._id,
          buildId: authorization.build._id,
          createdAt: now,
          deliveryEndDay: materialLine.deliveryEndDay,
          deliveryInstructions: materialLine.deliveryInstructions,
          deliveryLocation: materialLine.deliveryLocation,
          deliveryStartDay: materialLine.deliveryStartDay,
          description: materialLine.description,
          organizationId: authorization.organizationId,
          order,
          quantity: materialLine.quantity,
          quotePackageRevisionId: packageRevisionId,
          quoteRoundId: round._id,
          source: materialLine.row.source,
          sourceBuildCostItemId: materialLine.sourceBuildCostItemId,
          sourceDraftRowKey:
            materialLine.row.source === "ad_hoc"
              ? materialLine.row.rowKey
              : undefined,
          specificationTiptapJson: materialLine.specificationTiptapJson,
          title: materialLine.title,
          unit: materialLine.unit,
        }
      );
      for (const [
        assignmentOrder,
        assignment,
      ] of materialLine.assignments.entries()) {
        await ctx.db.insert("quotePackageRevisionMaterialAssignments", {
          brokerageId: authorization.brokerage._id,
          buildId: authorization.build._id,
          buildMilestoneId: assignment.milestone._id,
          buildSubmilestoneId: assignment.submilestone._id,
          createdAt: now,
          durationDays: assignment.submilestone.durationDays,
          milestoneKey: assignment.milestone.key,
          milestoneName: assignment.milestone.name,
          order: assignmentOrder,
          organizationId: authorization.organizationId,
          quotePackageRevisionId: packageRevisionId,
          quotePackageRevisionMaterialLineId: materialLineId,
          quoteRoundId: round._id,
          startDay: assignment.submilestone.startDay,
          submilestoneKey: assignment.submilestone.key,
          submilestoneName: assignment.submilestone.name,
        });
      }
    }
    for (const field of prepared.template.fields) {
      await ctx.db.insert("quotePackageRevisionResponseFields", {
        allowAlternates: field.allowAlternates,
        allowExclusions: field.allowExclusions,
        brokerageId: authorization.brokerage._id,
        buildId: authorization.build._id,
        choiceOptions: field.choiceOptions,
        createdAt: now,
        fieldKey: field.fieldKey,
        isPermanent: field.isPermanent,
        kind: field.kind,
        label: field.label,
        order: field.order,
        organizationId: authorization.organizationId,
        quotePackageRevisionId: packageRevisionId,
        quoteRoundId: round._id,
        renderer: field.renderer,
        repeatable: field.repeatable,
        required: field.required,
        richTextDefaultHtml: field.richTextDefaultHtml,
        scope: field.scope,
        sourceTemplateFieldId: field._id,
        supportsTax: field.supportsTax,
        tax: field.tax,
        validation: field.validation,
      });
    }
    const packageRevision = await ctx.db.get(packageRevisionId);
    if (!packageRevision) {
      throw new ConvexError("Quote Package Revision was not created.");
    }
    const invitationIds: Id<"quoteRoundInvitations">[] = [];
    for (const recipient of prepared.recipients) {
      const invitationId = await ctx.db.insert("quoteRoundInvitations", {
        brokerageId: authorization.brokerage._id,
        buildId: authorization.build._id,
        createdAt: now,
        organizationId: authorization.organizationId,
        participationState: "active",
        quotePackageRevisionId: packageRevisionId,
        quoteRoundId: round._id,
        recipientCapabilitiesSnapshot: recipient.capabilities,
        recipientEmailSnapshot: recipient.email,
        recipientNameSnapshot: recipient.profile.name,
        recipientProfileId: recipient.profile._id,
        updatedAt: now,
      });
      const invitation = await ctx.db.get(invitationId);
      if (!invitation) {
        throw new ConvexError("Quote Invitation was not created.");
      }
      await createInitialQuoteInvitationCredentialAndDispatch(ctx, {
        accessExpiresAt,
        brokerage: authorization.brokerage,
        build: authorization.build,
        invitation,
        packageRevision,
        publishedAt: now,
        quoteRound: round,
        responseDeadline: prepared.deadline,
      });
      invitationIds.push(invitationId);
    }
    const revision = round.revision + 1;
    await ctx.db.patch(round._id, {
      currentPackageRevisionId: packageRevisionId,
      revision,
      state: "open",
      updatedAt: now,
    });
    await ctx.db.insert("quoteRoundPublicationRequests", {
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      createdAt: now,
      expectedDraftRevision: args.expectedRevision,
      idempotencyKey,
      organizationId: authorization.organizationId,
      quotePackageRevisionId: packageRevisionId,
      quoteRoundId: round._id,
      requestFingerprint,
    });
    await appendQuoteRoundEvent(
      ctx,
      authorization,
      {
        command: "publishQuoteRoundDraft",
        eventType: "quote_round.opened",
        newState: {
          invitationCount: invitationIds.length,
          packageRevision: 1,
          responseDeadline: prepared.deadline,
          revision,
          state: "open",
        },
        priorState: { revision: round.revision, state: "draft" },
        quoteRoundId: round._id,
      },
      now
    );
    return {
      idempotentReplay: false,
      invitationCount: invitationIds.length,
      invitationIds,
      packageRevisionId,
      packageRevisionNumber: 1,
      quoteRoundId: round._id,
      responseDeadline: prepared.deadline,
      state: "open",
    };
  })
  .public();
