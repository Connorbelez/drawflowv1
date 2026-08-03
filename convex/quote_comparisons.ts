import { ConvexError, v } from "convex/values";
import {
  type ActiveBuildAuthorization,
  authorizeActiveBuildAccess,
} from "./activeBuildAccess";
import {
  administrativeOverrideInputFields,
  appendGovernedAuditEvent,
  authorizeAdministrativeRecovery,
  requiredAdministrativeReason,
} from "./administrative_override_policy";
import {
  type AuthorizedViewer,
  authenticatedMutation,
  authenticatedQuery,
} from "./authz";
import {
  quoteInvitationCommunicationProjection,
  quoteInvitationCommunicationProjectionValidator,
} from "./quote_notifications";
import {
  getPreferredState,
  preferredPointerFromState,
} from "./quote_preferred";
import type { Doc, Id, MutationCtx, QueryCtx } from "./types";

const MAX_PACKAGE_LABOUR_LINES = 340;
const MAX_PACKAGE_MATERIAL_LINES = 340;
const MAX_PACKAGE_ASSIGNMENTS_PER_LINE = 100;
const MAX_PACKAGE_ASSIGNMENTS_TOTAL = 500;
const MAX_PACKAGE_RESPONSE_FIELDS = 100;
const MAX_PACKAGE_ATTACHMENTS = 100;
const MAX_INVITATIONS = 100;
const MAX_SUBMISSION_LINES = 340;
const MAX_SUBMISSION_ANSWERS = 100;
const MAX_SUBMISSION_ATTACHMENTS = 25;
const MAX_SUBMISSION_EVENTS = 4;
const MAX_HISTORY = 20;
const MAX_QUOTE_AMOUNT_CENTS = 100_000_000_000;

const packageLabourLineValidator = v.object({
  _id: v.id("quotePackageRevisionLabourLines"),
  budgetCents: v.optional(v.number()),
  buildMilestoneId: v.id("buildMilestones"),
  buildSubmilestoneId: v.id("buildSubmilestones"),
  durationDays: v.optional(v.number()),
  milestoneKey: v.string(),
  milestoneName: v.string(),
  order: v.number(),
  scopeOfWorkTiptapJson: v.string(),
  startDay: v.optional(v.number()),
  submilestoneKey: v.string(),
  submilestoneName: v.string(),
});

const packageMaterialAssignmentValidator = v.object({
  _id: v.id("quotePackageRevisionMaterialAssignments"),
  buildMilestoneId: v.id("buildMilestones"),
  buildSubmilestoneId: v.id("buildSubmilestones"),
  durationDays: v.optional(v.number()),
  milestoneKey: v.string(),
  milestoneName: v.string(),
  order: v.number(),
  startDay: v.optional(v.number()),
  submilestoneKey: v.string(),
  submilestoneName: v.string(),
});

const packageMaterialLineValidator = v.object({
  _id: v.id("quotePackageRevisionMaterialLines"),
  deliveryEndDay: v.number(),
  deliveryInstructions: v.string(),
  deliveryLocation: v.string(),
  deliveryStartDay: v.number(),
  description: v.optional(v.string()),
  order: v.number(),
  quantity: v.number(),
  source: v.union(v.literal("build_cost_item"), v.literal("ad_hoc")),
  sourceBuildCostItemId: v.optional(v.id("buildCostItems")),
  sourceDraftRowKey: v.optional(v.string()),
  specificationTiptapJson: v.string(),
  title: v.string(),
  unit: v.string(),
  assignments: v.array(packageMaterialAssignmentValidator),
});

const packageResponseFieldValidator = v.object({
  _id: v.id("quotePackageRevisionResponseFields"),
  allowAlternates: v.boolean(),
  allowExclusions: v.boolean(),
  choiceOptions: v.optional(v.array(v.string())),
  fieldKey: v.string(),
  isPermanent: v.boolean(),
  kind: v.union(
    v.literal("priced_line"),
    v.literal("short_text"),
    v.literal("long_text"),
    v.literal("date"),
    v.literal("choice"),
    v.literal("attachment")
  ),
  label: v.string(),
  order: v.number(),
  repeatable: v.boolean(),
  renderer: v.union(v.literal("input"), v.literal("tiptap")),
  required: v.boolean(),
  richTextDefaultHtml: v.optional(v.string()),
  scope: v.union(
    v.literal("whole_quote"),
    v.literal("labour"),
    v.literal("materials")
  ),
  sourceTemplateFieldId: v.id("quoteResponseTemplateFields"),
  supportsTax: v.boolean(),
  tax: v.any(),
  validation: v.any(),
});

const packageAttachmentValidator = v.object({
  _id: v.id("quotePackageRevisionAttachments"),
  contentHashSha256Snapshot: v.string(),
  fileNameSnapshot: v.string(),
  kind: v.union(v.literal("permit"), v.literal("inherited")),
  mimeTypeSnapshot: v.string(),
  order: v.number(),
  sizeBytesSnapshot: v.number(),
  sourceBuildDocumentId: v.id("buildDocuments"),
  sourceBuildSubmilestoneId: v.optional(v.id("buildSubmilestones")),
  sourceDocumentVersionSnapshot: v.number(),
  storageIdSnapshot: v.optional(v.id("_storage")),
});

const packageComparisonValidator = v.object({
  _id: v.id("quotePackageRevisions"),
  accessExpiresAt: v.optional(v.number()),
  attachments: v.array(packageAttachmentValidator),
  labourLines: v.array(packageLabourLineValidator),
  materialLines: v.array(packageMaterialLineValidator),
  permitDocumentId: v.id("buildDocuments"),
  permitDocumentVersion: v.number(),
  responseDeadline: v.number(),
  responseFields: v.array(packageResponseFieldValidator),
  revision: v.number(),
  roadmapSnapshotFingerprint: v.string(),
  siteAddressSnapshot: v.string(),
  siteLatitudeSnapshot: v.optional(v.number()),
  siteLongitudeSnapshot: v.optional(v.number()),
  siteMapUrlSnapshot: v.string(),
  sitePlaceIdSnapshot: v.optional(v.string()),
  timelineCurrentDaySnapshot: v.optional(v.number()),
  timelineRangeMaxSnapshot: v.optional(v.number()),
  timelineRangeMinSnapshot: v.optional(v.number()),
  timelineStartDateSnapshot: v.string(),
});

const comparisonLineValidator = v.object({
  _id: v.id("quoteInvitationResponseSubmissionLineItems"),
  lineKey: v.string(),
  quotedAmountCents: v.optional(v.number()),
  scope: v.union(
    v.literal("labour"),
    v.literal("materials"),
    v.literal("whole_quote")
  ),
  source: v.union(
    v.literal("package_labour"),
    v.literal("package_material"),
    v.literal("template_priced"),
    v.literal("expanded_scope")
  ),
  sourcePackageRevisionLabourLineId: v.optional(
    v.id("quotePackageRevisionLabourLines")
  ),
  sourcePackageRevisionMaterialLineId: v.optional(
    v.id("quotePackageRevisionMaterialLines")
  ),
  sourcePackageRevisionResponseFieldId: v.optional(
    v.id("quotePackageRevisionResponseFields")
  ),
  title: v.string(),
});

const comparisonAnswerValidator = v.object({
  fieldKey: v.string(),
  kind: v.union(
    v.literal("priced_line"),
    v.literal("short_text"),
    v.literal("long_text"),
    v.literal("date"),
    v.literal("choice"),
    v.literal("attachment")
  ),
  label: v.string(),
  scope: v.union(
    v.literal("labour"),
    v.literal("materials"),
    v.literal("whole_quote")
  ),
  sourcePackageRevisionResponseFieldId: v.id(
    "quotePackageRevisionResponseFields"
  ),
  supportsTax: v.boolean(),
  tax: v.any(),
  value: v.string(),
});

const comparisonAttachmentValidator = v.object({
  _id: v.id("quoteInvitationResponseSubmissionAttachments"),
  createdAt: v.number(),
  fileName: v.string(),
  mimeType: v.string(),
  sizeBytes: v.number(),
  sourcePackageRevisionResponseFieldId: v.optional(
    v.id("quotePackageRevisionResponseFields")
  ),
  storageId: v.optional(v.id("_storage")),
});

const comparisonHistoryValidator = v.object({
  canonicalTotalCents: v.number(),
  revision: v.number(),
  status: v.union(
    v.literal("active"),
    v.literal("superseded"),
    v.literal("withdrawn")
  ),
  submittedAt: v.number(),
  supersededByRevision: v.optional(v.number()),
  withdrawnAt: v.optional(v.number()),
});

const comparisonCandidateValidator = v.object({
  answers: v.array(comparisonAnswerValidator),
  attachments: v.array(comparisonAttachmentValidator),
  commentsHtml: v.optional(v.string()),
  expandedScopeLines: v.array(comparisonLineValidator),
  history: v.array(comparisonHistoryValidator),
  invitation: v.object({
    _id: v.id("quoteRoundInvitations"),
    recipientCapabilitiesSnapshot: v.array(
      v.union(v.literal("contractor"), v.literal("supplier"))
    ),
    recipientEmailSnapshot: v.string(),
    recipientNameSnapshot: v.string(),
    recipientProfileId: v.id("contractorProfiles"),
  }),
  labourLines: v.array(comparisonLineValidator),
  materialLines: v.array(comparisonLineValidator),
  submission: v.object({
    _id: v.id("quoteInvitationResponseSubmissionRevisions"),
    canonicalTotalCents: v.number(),
    quotePackageRevisionId: v.id("quotePackageRevisions"),
    revision: v.number(),
    sourceDraftVersion: v.number(),
    status: v.literal("active"),
    submittedAt: v.number(),
  }),
  totals: v.object({
    canonicalTotalCents: v.number(),
    expandedScopeCents: v.number(),
    labourCents: v.number(),
    materialsCents: v.number(),
    templatePricedCents: v.number(),
  }),
});

const preferredSummaryValidator = v.object({
  selectedAt: v.number(),
  selectedByWorkosUserId: v.string(),
  submissionRevision: v.number(),
  submissionRevisionId: v.id("quoteInvitationResponseSubmissionRevisions"),
  quotePackageRevisionId: v.id("quotePackageRevisions"),
  quoteRoundInvitationId: v.id("quoteRoundInvitations"),
});

const comparisonInvitationValidator = v.object({
  _id: v.id("quoteRoundInvitations"),
  access: v.object({
    active: v.number(),
    expired: v.number(),
    revoked: v.number(),
    rotated: v.number(),
    total: v.number(),
  }),
  communication: quoteInvitationCommunicationProjectionValidator,
  currentPackageRevisionId: v.optional(v.id("quotePackageRevisions")),
  hasCurrentSubmission: v.boolean(),
  originalPackageRevisionId: v.id("quotePackageRevisions"),
  participationState: v.union(v.literal("active"), v.literal("revoked")),
  recipientCapabilitiesSnapshot: v.array(
    v.union(v.literal("contractor"), v.literal("supplier"))
  ),
  recipientEmailSnapshot: v.string(),
  recipientNameSnapshot: v.string(),
  recipientProfileId: v.id("contractorProfiles"),
});

const availableComparisonValidator = v.object({
  candidates: v.array(comparisonCandidateValidator),
  canClearPreferred: v.boolean(),
  canSetPreferred: v.boolean(),
  invitations: v.array(comparisonInvitationValidator),
  package: packageComparisonValidator,
  preferred: v.union(preferredSummaryValidator, v.null()),
  round: v.object({
    _id: v.id("quoteRounds"),
    mode: v.union(
      v.literal("labour"),
      v.literal("material"),
      v.literal("combined")
    ),
    revision: v.number(),
    state: v.union(
      v.literal("draft"),
      v.literal("open"),
      v.literal("closed"),
      v.literal("cancelled")
    ),
    title: v.string(),
    updatedAt: v.number(),
  }),
  stateVersion: v.number(),
  status: v.literal("available"),
});

const comparisonResultValidator = v.union(
  v.object({ reason: v.string(), status: v.literal("unavailable") }),
  availableComparisonValidator
);

const preferredCommandResultValidator = v.union(
  v.object({
    idempotentReplay: v.boolean(),
    preferred: v.union(preferredSummaryValidator, v.null()),
    stateVersion: v.number(),
    status: v.literal("selected"),
  }),
  v.object({
    preferred: v.union(preferredSummaryValidator, v.null()),
    stateVersion: v.number(),
    status: v.literal("cleared"),
  }),
  v.object({
    idempotentReplay: v.literal(false),
    preferred: v.union(preferredSummaryValidator, v.null()),
    stateVersion: v.number(),
    status: v.literal("conflict"),
  })
);

type ComparisonCtx = (QueryCtx | MutationCtx) & {
  viewer: AuthorizedViewer;
};
type ComparisonReaderKind = "backoffice" | "builder" | "homeowner";

const COMPARISON_READER_ROLES: Record<ComparisonReaderKind, string[]> = {
  backoffice: ["admin", "principle-broker", "broker", "broker-staff"],
  builder: ["builder", "builder-staff"],
  homeowner: ["homeowner"],
};

function assertComparisonReadRole(roles: readonly string[]) {
  if (
    !roles.some((role) =>
      [
        "admin",
        "principle-broker",
        "broker",
        "broker-staff",
        "builder",
        "builder-staff",
        "homeowner",
      ].includes(role)
    )
  ) {
    throw new ConvexError(
      "Forbidden: this Build role cannot read Quote comparison."
    );
  }
}

function canViewRecipientSensitiveFacts(roles: readonly string[]) {
  return roles.some((role) => role === "builder" || role === "builder-staff");
}

function redactedRecipientEmail(
  email: string,
  authorization: ActiveBuildAuthorization
) {
  return canViewRecipientSensitiveFacts(authorization.roles)
    ? email
    : "Recipient email redacted";
}

function visibleAttachmentStorageId(
  storageId: Id<"_storage"> | undefined,
  authorization: ActiveBuildAuthorization
) {
  return canViewRecipientSensitiveFacts(authorization.roles)
    ? storageId
    : undefined;
}

function visiblePreferredActor(
  workosUserId: string,
  authorization: ActiveBuildAuthorization
) {
  return canViewRecipientSensitiveFacts(authorization.roles)
    ? workosUserId
    : "redacted";
}

function assertComparisonWriteRole(roles: readonly string[]) {
  if (!(roles.includes("builder") || roles.includes("builder-staff"))) {
    throw new ConvexError(
      "Forbidden: only Builder or Builder Staff may change Preferred Quote."
    );
  }
}

async function authorizeComparisonPath(
  ctx: ComparisonCtx,
  input: {
    buildId: Id<"activeBuilds">;
    readerKind?: ComparisonReaderKind;
    workosOrganizationId: string;
  },
  write = false
) {
  const authorization = await authorizeActiveBuildAccess(ctx, {
    backofficePolicy: "proposal-read",
    buildId: input.buildId,
    organizationId: input.workosOrganizationId,
  });
  if (write) {
    assertComparisonWriteRole(authorization.roles);
    return authorization;
  }
  const allowedRoles = input.readerKind
    ? COMPARISON_READER_ROLES[input.readerKind]
    : undefined;
  const roles = allowedRoles
    ? authorization.roles.filter((role) => allowedRoles.includes(role))
    : authorization.roles;
  assertComparisonReadRole(roles);
  return { ...authorization, roles };
}

function requireRound(
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

function unavailable(reason: string) {
  return { reason, status: "unavailable" as const };
}

function assertScoped(
  row: {
    brokerageId: Id<"brokerages">;
    organizationId: string;
    buildId: Id<"activeBuilds">;
    quoteRoundId: Id<"quoteRounds">;
  },
  authorization: ActiveBuildAuthorization,
  quoteRoundId: Id<"quoteRounds">
) {
  if (
    row.brokerageId !== authorization.brokerage._id ||
    row.organizationId !== authorization.organizationId ||
    row.buildId !== authorization.build._id ||
    row.quoteRoundId !== quoteRoundId
  ) {
    throw new ConvexError("Quote comparison row crosses Build scope.");
  }
}

function assertQuoteResponseScope(
  row: {
    brokerageId: Id<"brokerages">;
    organizationId: string;
    buildId: Id<"activeBuilds">;
    quoteRoundId: Id<"quoteRounds">;
    quoteRoundInvitationId: Id<"quoteRoundInvitations">;
    quotePackageRevisionId: Id<"quotePackageRevisions">;
  },
  authorization: ActiveBuildAuthorization,
  round: Doc<"quoteRounds">,
  invitation: Doc<"quoteRoundInvitations">,
  packageRevisionId: Id<"quotePackageRevisions">,
  label: string
) {
  assertScoped(row, authorization, round._id);
  if (
    row.quoteRoundInvitationId !== invitation._id ||
    row.quotePackageRevisionId !== packageRevisionId
  ) {
    throw new ConvexError(`Quote response ${label} crosses Build scope.`);
  }
}

async function loadPackageComparison(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization,
  round: Doc<"quoteRounds">,
  packageRevision: Doc<"quotePackageRevisions">
) {
  assertScoped(packageRevision, authorization, round._id);
  const [labourLines, materialLines, responseFields, attachments] =
    await Promise.all([
      ctx.db
        .query("quotePackageRevisionLabourLines")
        .withIndex("by_quotePackageRevisionId_and_order", (query) =>
          query.eq("quotePackageRevisionId", packageRevision._id)
        )
        .take(MAX_PACKAGE_LABOUR_LINES + 1),
      ctx.db
        .query("quotePackageRevisionMaterialLines")
        .withIndex("by_quotePackageRevisionId_and_order", (query) =>
          query.eq("quotePackageRevisionId", packageRevision._id)
        )
        .take(MAX_PACKAGE_MATERIAL_LINES + 1),
      ctx.db
        .query("quotePackageRevisionResponseFields")
        .withIndex("by_quotePackageRevisionId_and_order", (query) =>
          query.eq("quotePackageRevisionId", packageRevision._id)
        )
        .take(MAX_PACKAGE_RESPONSE_FIELDS + 1),
      ctx.db
        .query("quotePackageRevisionAttachments")
        .withIndex("by_quotePackageRevisionId_and_order", (query) =>
          query.eq("quotePackageRevisionId", packageRevision._id)
        )
        .take(MAX_PACKAGE_ATTACHMENTS + 1),
    ]);
  if (
    labourLines.length > MAX_PACKAGE_LABOUR_LINES ||
    materialLines.length > MAX_PACKAGE_MATERIAL_LINES ||
    responseFields.length > MAX_PACKAGE_RESPONSE_FIELDS ||
    attachments.length > MAX_PACKAGE_ATTACHMENTS
  ) {
    throw new ConvexError("Quote Package Revision exceeds comparison limits.");
  }
  for (const row of [
    ...labourLines,
    ...materialLines,
    ...responseFields,
    ...attachments,
  ]) {
    assertScoped(row, authorization, round._id);
  }
  const materialLinesWithAssignments: Array<
    (typeof materialLines)[number] & {
      assignments: Doc<"quotePackageRevisionMaterialAssignments">[];
    }
  > = [];
  let totalAssignments = 0;
  for (const line of materialLines) {
    const remainingAssignmentBudget =
      MAX_PACKAGE_ASSIGNMENTS_TOTAL - totalAssignments;
    const assignments = await ctx.db
      .query("quotePackageRevisionMaterialAssignments")
      .withIndex("by_quotePackageRevisionMaterialLineId_and_order", (query) =>
        query.eq("quotePackageRevisionMaterialLineId", line._id)
      )
      .take(
        Math.min(MAX_PACKAGE_ASSIGNMENTS_PER_LINE, remainingAssignmentBudget) +
          1
      );
    if (
      assignments.length > MAX_PACKAGE_ASSIGNMENTS_PER_LINE ||
      assignments.length > remainingAssignmentBudget
    ) {
      throw new ConvexError(
        "Quote material assignments exceed comparison limits."
      );
    }
    totalAssignments += assignments.length;
    for (const assignment of assignments) {
      assertScoped(assignment, authorization, round._id);
      if (
        assignment.quotePackageRevisionId !== packageRevision._id ||
        assignment.quotePackageRevisionMaterialLineId !== line._id
      ) {
        throw new ConvexError(
          "Quote material assignment crosses package scope."
        );
      }
    }
    materialLinesWithAssignments.push({ ...line, assignments });
  }
  return {
    _id: packageRevision._id,
    accessExpiresAt: packageRevision.accessExpiresAt,
    attachments: attachments.map((attachment) => ({
      _id: attachment._id,
      contentHashSha256Snapshot: attachment.contentHashSha256Snapshot,
      fileNameSnapshot: attachment.fileNameSnapshot,
      kind: attachment.kind,
      mimeTypeSnapshot: attachment.mimeTypeSnapshot,
      order: attachment.order,
      sizeBytesSnapshot: attachment.sizeBytesSnapshot,
      sourceBuildDocumentId: attachment.sourceBuildDocumentId,
      sourceBuildSubmilestoneId: attachment.sourceBuildSubmilestoneId,
      sourceDocumentVersionSnapshot: attachment.sourceDocumentVersionSnapshot,
      storageIdSnapshot: visibleAttachmentStorageId(
        attachment.storageIdSnapshot,
        authorization
      ),
    })),
    labourLines: labourLines.map((line) => ({
      _id: line._id,
      budgetCents: line.budgetCents,
      buildMilestoneId: line.buildMilestoneId,
      buildSubmilestoneId: line.buildSubmilestoneId,
      durationDays: line.durationDays,
      milestoneKey: line.milestoneKey,
      milestoneName: line.milestoneName,
      order: line.order,
      scopeOfWorkTiptapJson: line.scopeOfWorkTiptapJson,
      startDay: line.startDay,
      submilestoneKey: line.submilestoneKey,
      submilestoneName: line.submilestoneName,
    })),
    materialLines: materialLinesWithAssignments.map((line) => ({
      _id: line._id,
      assignments: line.assignments.map((assignment) => ({
        _id: assignment._id,
        buildMilestoneId: assignment.buildMilestoneId,
        buildSubmilestoneId: assignment.buildSubmilestoneId,
        durationDays: assignment.durationDays,
        milestoneKey: assignment.milestoneKey,
        milestoneName: assignment.milestoneName,
        order: assignment.order,
        startDay: assignment.startDay,
        submilestoneKey: assignment.submilestoneKey,
        submilestoneName: assignment.submilestoneName,
      })),
      deliveryEndDay: line.deliveryEndDay,
      deliveryInstructions: line.deliveryInstructions,
      deliveryLocation: line.deliveryLocation,
      deliveryStartDay: line.deliveryStartDay,
      description: line.description,
      order: line.order,
      quantity: line.quantity,
      source: line.source,
      sourceBuildCostItemId: line.sourceBuildCostItemId,
      sourceDraftRowKey: line.sourceDraftRowKey,
      specificationTiptapJson: line.specificationTiptapJson,
      title: line.title,
      unit: line.unit,
    })),
    permitDocumentId: packageRevision.permitDocumentId,
    permitDocumentVersion: packageRevision.permitDocumentVersion,
    responseDeadline: packageRevision.responseDeadline,
    responseFields: responseFields.map((field) => ({
      _id: field._id,
      allowAlternates: field.allowAlternates,
      allowExclusions: field.allowExclusions,
      choiceOptions: field.choiceOptions,
      fieldKey: field.fieldKey,
      isPermanent: field.isPermanent,
      kind: field.kind,
      label: field.label,
      order: field.order,
      repeatable: field.repeatable,
      renderer: field.renderer,
      required: field.required,
      richTextDefaultHtml: field.richTextDefaultHtml,
      scope: field.scope,
      sourceTemplateFieldId: field.sourceTemplateFieldId,
      supportsTax: field.supportsTax,
      tax: field.tax ?? null,
      validation: field.validation ?? null,
    })),
    revision: packageRevision.revision,
    roadmapSnapshotFingerprint: packageRevision.roadmapSnapshotFingerprint,
    siteAddressSnapshot: packageRevision.siteAddressSnapshot,
    siteLatitudeSnapshot: packageRevision.siteLatitudeSnapshot,
    siteLongitudeSnapshot: packageRevision.siteLongitudeSnapshot,
    siteMapUrlSnapshot: packageRevision.siteMapUrlSnapshot,
    sitePlaceIdSnapshot: packageRevision.sitePlaceIdSnapshot,
    timelineCurrentDaySnapshot: packageRevision.timelineCurrentDaySnapshot,
    timelineRangeMaxSnapshot: packageRevision.timelineRangeMaxSnapshot,
    timelineRangeMinSnapshot: packageRevision.timelineRangeMinSnapshot,
    timelineStartDateSnapshot: packageRevision.timelineStartDateSnapshot,
  } as const;
}

function sumLineItems(lines: readonly { quotedAmountCents?: number }[]) {
  let total = 0;
  for (const line of lines) {
    if (line.quotedAmountCents === undefined) {
      continue;
    }
    if (
      !Number.isSafeInteger(line.quotedAmountCents) ||
      line.quotedAmountCents < 0 ||
      line.quotedAmountCents > MAX_QUOTE_AMOUNT_CENTS
    ) {
      throw new ConvexError("Quote line amount is invalid.");
    }
    total += line.quotedAmountCents;
    if (!Number.isSafeInteger(total) || total > MAX_QUOTE_AMOUNT_CENTS) {
      throw new ConvexError("Quote total exceeds its safe integer-cent limit.");
    }
  }
  return total;
}

function lifecycleForEvents(
  events: Doc<"quoteInvitationResponseSubmissionLifecycleEvents">[],
  revisionById: Map<Id<"quoteInvitationResponseSubmissionRevisions">, number>
) {
  if (
    events.length === 0 ||
    events.length > 3 ||
    !events.some((event) => event.eventType === "submitted")
  ) {
    throw new ConvexError(
      "Quote response submission lifecycle is inconsistent."
    );
  }
  const withdrawal = events.find((event) => event.eventType === "withdrawn");
  const supersession = events.find((event) => event.eventType === "superseded");
  if (withdrawal && supersession) {
    throw new ConvexError(
      "Quote response lifecycle has conflicting terminal events."
    );
  }
  const replacementId = supersession?.replacementSubmissionRevisionId;
  const supersededByRevision = replacementId
    ? revisionById.get(replacementId)
    : undefined;
  if (supersession && supersededByRevision === undefined) {
    throw new ConvexError("Quote response supersession is inconsistent.");
  }
  return {
    status: withdrawal
      ? ("withdrawn" as const)
      : supersession
        ? ("superseded" as const)
        : ("active" as const),
    supersededByRevision,
    withdrawnAt: withdrawal?.createdAt,
  };
}

async function candidateForInvitation(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization,
  round: Doc<"quoteRounds">,
  packageRevision: Doc<"quotePackageRevisions">,
  invitation: Doc<"quoteRoundInvitations">,
  packageComparison: Awaited<ReturnType<typeof loadPackageComparison>>
) {
  assertScoped(invitation, authorization, round._id);
  const currentPackageId =
    invitation.currentQuotePackageRevisionId ??
    invitation.quotePackageRevisionId;
  if (
    invitation.participationState !== "active" ||
    currentPackageId !== packageRevision._id
  ) {
    return null;
  }
  const states = await ctx.db
    .query("quoteInvitationResponseSubmissionStates")
    .withIndex(
      "by_quoteRoundInvitationId_and_quotePackageRevisionId",
      (query) =>
        query
          .eq("quoteRoundInvitationId", invitation._id)
          .eq("quotePackageRevisionId", packageRevision._id)
    )
    .take(2);
  if (states.length > 1) {
    throw new ConvexError("Quote response submission state is inconsistent.");
  }
  const state = states[0];
  if (!state?.activeSubmissionRevisionId) {
    return null;
  }
  assertQuoteResponseScope(
    state,
    authorization,
    round,
    invitation,
    packageRevision._id,
    "submission state"
  );
  const submission = await ctx.db.get(state.activeSubmissionRevisionId);
  if (!submission) {
    throw new ConvexError("Quote response current submission is inconsistent.");
  }
  assertQuoteResponseScope(
    submission,
    authorization,
    round,
    invitation,
    packageRevision._id,
    "submission"
  );
  const [lineItems, answers, attachments, events, revisions] =
    await Promise.all([
      ctx.db
        .query("quoteInvitationResponseSubmissionLineItems")
        .withIndex(
          "by_quoteInvitationResponseSubmissionRevisionId_and_createdAt",
          (query) =>
            query.eq(
              "quoteInvitationResponseSubmissionRevisionId",
              submission._id
            )
        )
        .order("asc")
        .take(MAX_SUBMISSION_LINES + 1),
      ctx.db
        .query("quoteInvitationResponseSubmissionAnswers")
        .withIndex("by_quoteInvitationResponseSubmissionRevisionId", (query) =>
          query.eq(
            "quoteInvitationResponseSubmissionRevisionId",
            submission._id
          )
        )
        .take(MAX_SUBMISSION_ANSWERS + 1),
      ctx.db
        .query("quoteInvitationResponseSubmissionAttachments")
        .withIndex(
          "by_quoteInvitationResponseSubmissionRevisionId_and_createdAt",
          (query) =>
            query.eq(
              "quoteInvitationResponseSubmissionRevisionId",
              submission._id
            )
        )
        .order("asc")
        .take(MAX_SUBMISSION_ATTACHMENTS + 1),
      ctx.db
        .query("quoteInvitationResponseSubmissionLifecycleEvents")
        .withIndex(
          "by_quoteInvitationResponseSubmissionRevisionId_and_createdAt",
          (query) =>
            query.eq(
              "quoteInvitationResponseSubmissionRevisionId",
              submission._id
            )
        )
        .order("asc")
        .take(MAX_SUBMISSION_EVENTS),
      ctx.db
        .query("quoteInvitationResponseSubmissionRevisions")
        .withIndex("by_quoteRoundInvitationId_and_revision", (query) =>
          query.eq("quoteRoundInvitationId", invitation._id)
        )
        .order("desc")
        .take(MAX_HISTORY),
    ]);
  if (
    lineItems.length > MAX_SUBMISSION_LINES ||
    answers.length > MAX_SUBMISSION_ANSWERS ||
    attachments.length > MAX_SUBMISSION_ATTACHMENTS
  ) {
    throw new ConvexError("Quote response exceeds comparison limits.");
  }
  for (const row of [...lineItems, ...answers, ...attachments, ...events]) {
    assertQuoteResponseScope(
      row,
      authorization,
      round,
      invitation,
      packageRevision._id,
      "row"
    );
  }
  const revisionById = new Map(
    revisions.map((revision) => [revision._id, revision.revision])
  );
  const lifecycle = lifecycleForEvents(events, revisionById);
  if (lifecycle.status !== "active") {
    throw new ConvexError(
      "Active Quote response points to a non-active revision."
    );
  }
  for (const revision of revisions) {
    if (
      revision.brokerageId !== authorization.brokerage._id ||
      revision.organizationId !== authorization.organizationId ||
      revision.buildId !== authorization.build._id ||
      revision.quoteRoundId !== round._id ||
      revision.quoteRoundInvitationId !== invitation._id
    ) {
      throw new ConvexError("Quote response history crosses Build scope.");
    }
  }
  const currentTotal = sumLineItems(lineItems);
  if (currentTotal !== submission.canonicalTotalCents) {
    throw new ConvexError(
      "Quote response total does not match its immutable ledger."
    );
  }
  const historyEvents = await Promise.all(
    revisions.map(async (revision) => {
      const revisionEvents = await ctx.db
        .query("quoteInvitationResponseSubmissionLifecycleEvents")
        .withIndex(
          "by_quoteInvitationResponseSubmissionRevisionId_and_createdAt",
          (query) =>
            query.eq(
              "quoteInvitationResponseSubmissionRevisionId",
              revision._id
            )
        )
        .order("asc")
        .take(MAX_SUBMISSION_EVENTS);
      for (const event of revisionEvents) {
        if (
          event.brokerageId !== authorization.brokerage._id ||
          event.organizationId !== authorization.organizationId ||
          event.buildId !== authorization.build._id ||
          event.quoteRoundId !== round._id ||
          event.quoteRoundInvitationId !== invitation._id ||
          event.quotePackageRevisionId !== revision.quotePackageRevisionId ||
          event.quoteInvitationResponseSubmissionRevisionId !== revision._id
        ) {
          throw new ConvexError(
            "Quote response history event crosses Build scope."
          );
        }
      }
      return [revision._id, revisionEvents] as const;
    })
  );
  const historyEventsByRevision = new Map(historyEvents);
  const fieldById = new Map(
    packageComparison.responseFields.map((field) => [field._id, field])
  );
  const labourLines = lineItems.filter(
    (line) => line.source === "package_labour"
  );
  const materialLines = lineItems.filter(
    (line) => line.source === "package_material"
  );
  const expandedScopeLines = lineItems.filter(
    (line) => line.source === "expanded_scope"
  );
  const templatePricedLines = lineItems.filter(
    (line) => line.source === "template_priced"
  );
  for (const answer of answers) {
    if (!fieldById.has(answer.sourcePackageRevisionResponseFieldId)) {
      throw new ConvexError(
        "Quote response answer points outside its package."
      );
    }
  }
  const answerProjection = answers.map((answer) => {
    const field = fieldById.get(answer.sourcePackageRevisionResponseFieldId);
    if (!field) {
      throw new ConvexError(
        "Quote response answer points outside its package."
      );
    }
    return {
      fieldKey: field.fieldKey,
      kind: field.kind,
      label: field.label,
      scope: field.scope,
      sourcePackageRevisionResponseFieldId: field._id,
      supportsTax: field.supportsTax,
      tax: field.tax,
      value: answer.value,
    };
  });
  const projectionLine = (line: (typeof lineItems)[number]) => ({
    _id: line._id,
    lineKey: line.lineKey,
    quotedAmountCents: line.quotedAmountCents,
    scope: line.scope,
    source: line.source,
    sourcePackageRevisionLabourLineId: line.sourcePackageRevisionLabourLineId,
    sourcePackageRevisionMaterialLineId:
      line.sourcePackageRevisionMaterialLineId,
    sourcePackageRevisionResponseFieldId:
      line.sourcePackageRevisionResponseFieldId,
    title: line.title,
  });
  const labourCents = sumLineItems(labourLines);
  const materialsCents = sumLineItems(materialLines);
  const expandedScopeCents = sumLineItems(expandedScopeLines);
  const templatePricedCents = sumLineItems(templatePricedLines);
  return {
    answers: answerProjection,
    attachments: attachments.map((attachment) => ({
      _id: attachment._id,
      createdAt: attachment.createdAt,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      sourcePackageRevisionResponseFieldId:
        attachment.sourcePackageRevisionResponseFieldId,
      storageId: visibleAttachmentStorageId(
        attachment.storageId,
        authorization
      ),
    })),
    commentsHtml: submission.commentsHtml,
    expandedScopeLines: expandedScopeLines.map(projectionLine),
    history: revisions.map((revision) => {
      const revisionLifecycle = lifecycleForEvents(
        historyEventsByRevision.get(revision._id) ?? [],
        revisionById
      );
      return {
        canonicalTotalCents: revision.canonicalTotalCents,
        revision: revision.revision,
        status: revisionLifecycle.status,
        submittedAt: revision.submittedAt,
        supersededByRevision: revisionLifecycle.supersededByRevision,
        withdrawnAt: revisionLifecycle.withdrawnAt,
      };
    }),
    invitation: {
      _id: invitation._id,
      recipientCapabilitiesSnapshot: invitation.recipientCapabilitiesSnapshot,
      recipientEmailSnapshot: redactedRecipientEmail(
        invitation.recipientEmailSnapshot,
        authorization
      ),
      recipientNameSnapshot: invitation.recipientNameSnapshot,
      recipientProfileId: invitation.recipientProfileId,
    },
    labourLines: labourLines.map(projectionLine),
    materialLines: materialLines.map(projectionLine),
    submission: {
      _id: submission._id,
      canonicalTotalCents: submission.canonicalTotalCents,
      quotePackageRevisionId: submission.quotePackageRevisionId,
      revision: submission.revision,
      sourceDraftVersion: submission.sourceDraftVersion,
      status: "active" as const,
      submittedAt: submission.submittedAt,
    },
    totals: {
      canonicalTotalCents: currentTotal,
      expandedScopeCents,
      labourCents,
      materialsCents,
      templatePricedCents,
    },
  };
}

async function currentPreferredSummary(
  ctx: QueryCtx | MutationCtx,
  round: Doc<"quoteRounds">,
  packageRevision: Doc<"quotePackageRevisions"> | null,
  authorization: ActiveBuildAuthorization
) {
  const state = await getPreferredState(ctx, round._id);
  const pointer = preferredPointerFromState(state);
  if (!(state && pointer && packageRevision)) {
    return null;
  }
  if (
    state.brokerageId !== authorization.brokerage._id ||
    state.organizationId !== authorization.organizationId ||
    state.buildId !== authorization.build._id
  ) {
    throw new ConvexError("Preferred Quote state crosses Build scope.");
  }
  if (pointer.quotePackageRevisionId !== packageRevision._id) {
    return null;
  }
  const submission = await ctx.db.get(
    pointer.quoteInvitationResponseSubmissionRevisionId
  );
  const invitation = await ctx.db.get(pointer.quoteRoundInvitationId);
  if (!(submission && invitation)) {
    return null;
  }
  if (
    submission.brokerageId !== authorization.brokerage._id ||
    submission.organizationId !== authorization.organizationId ||
    submission.buildId !== authorization.build._id ||
    invitation.brokerageId !== authorization.brokerage._id ||
    invitation.organizationId !== authorization.organizationId ||
    invitation.buildId !== authorization.build._id
  ) {
    throw new ConvexError("Preferred Quote target crosses Build scope.");
  }
  if (
    submission.quotePackageRevisionId !== packageRevision._id ||
    submission.quoteRoundId !== round._id ||
    submission.quoteRoundInvitationId !== invitation._id ||
    invitation.quoteRoundId !== round._id ||
    invitation.participationState !== "active"
  ) {
    return null;
  }
  return {
    selectedAt: pointer.selectedAt,
    selectedByWorkosUserId: visiblePreferredActor(
      pointer.selectedByWorkosUserId,
      authorization
    ),
    submissionRevision: pointer.submissionRevision,
    submissionRevisionId: pointer.quoteInvitationResponseSubmissionRevisionId,
    quotePackageRevisionId: pointer.quotePackageRevisionId,
    quoteRoundInvitationId: pointer.quoteRoundInvitationId,
  };
}

async function loadComparisonInvitations(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization,
  round: Doc<"quoteRounds">,
  currentPackageRevision: Doc<"quotePackageRevisions"> | null,
  now: number
) {
  const [active, revoked] = await Promise.all([
    ctx.db
      .query("quoteRoundInvitations")
      .withIndex("by_quoteRoundId_and_participationState", (query) =>
        query.eq("quoteRoundId", round._id).eq("participationState", "active")
      )
      .take(MAX_INVITATIONS + 1),
    ctx.db
      .query("quoteRoundInvitations")
      .withIndex("by_quoteRoundId_and_participationState", (query) =>
        query.eq("quoteRoundId", round._id).eq("participationState", "revoked")
      )
      .take(MAX_INVITATIONS + 1),
  ]);
  const invitations = [...active, ...revoked];
  if (invitations.length > MAX_INVITATIONS) {
    throw new ConvexError(
      "Quote Round has too many invitations for comparison."
    );
  }
  return await Promise.all(
    invitations.map(async (invitation) => {
      assertScoped(invitation, authorization, round._id);
      const packageRevisionId =
        invitation.currentQuotePackageRevisionId ??
        invitation.quotePackageRevisionId;
      const packageRevision =
        packageRevisionId === currentPackageRevision?._id
          ? currentPackageRevision
          : await ctx.db.get(packageRevisionId);
      if (!packageRevision) {
        throw new ConvexError("Quote Invitation package is unavailable.");
      }
      assertScoped(packageRevision, authorization, round._id);
      const [credentials, states] = await Promise.all([
        ctx.db
          .query("quoteInvitationAccessCredentials")
          .withIndex("by_quoteRoundInvitationId_and_createdAt", (query) =>
            query.eq("quoteRoundInvitationId", invitation._id)
          )
          .order("desc")
          .take(MAX_HISTORY + 1),
        ctx.db
          .query("quoteInvitationResponseSubmissionStates")
          .withIndex(
            "by_quoteRoundInvitationId_and_quotePackageRevisionId",
            (query) =>
              query
                .eq("quoteRoundInvitationId", invitation._id)
                .eq("quotePackageRevisionId", packageRevision._id)
          )
          .take(2),
      ]);
      if (credentials.length > MAX_HISTORY) {
        throw new ConvexError(
          "Quote Invitation access history exceeds comparison limits."
        );
      }
      if (states.length > 1) {
        throw new ConvexError(
          "Quote response submission state is inconsistent."
        );
      }
      for (const credential of credentials) {
        if (
          credential.brokerageId !== authorization.brokerage._id ||
          credential.organizationId !== authorization.organizationId ||
          credential.buildId !== authorization.build._id ||
          credential.quoteRoundId !== round._id ||
          credential.quoteRoundInvitationId !== invitation._id
        ) {
          throw new ConvexError(
            "Quote Invitation access history crosses Build scope."
          );
        }
      }
      const state = states[0];
      if (state) {
        assertScoped(state, authorization, round._id);
        if (state.quotePackageRevisionId !== packageRevision._id) {
          throw new ConvexError(
            "Quote response submission state crosses Package scope."
          );
        }
      }
      const access = credentials.reduce(
        (counts, credential) => {
          counts.total += 1;
          counts[credential.state] += 1;
          return counts;
        },
        { active: 0, expired: 0, revoked: 0, rotated: 0, total: 0 }
      );
      return {
        _id: invitation._id,
        access,
        communication: await quoteInvitationCommunicationProjection(ctx, {
          invitation,
          hasCurrentSubmission: Boolean(state?.activeSubmissionRevisionId),
          now,
          responseDeadline: packageRevision.responseDeadline,
        }),
        currentPackageRevisionId: invitation.currentQuotePackageRevisionId,
        hasCurrentSubmission: Boolean(state?.activeSubmissionRevisionId),
        originalPackageRevisionId: invitation.quotePackageRevisionId,
        participationState: invitation.participationState,
        recipientCapabilitiesSnapshot: invitation.recipientCapabilitiesSnapshot,
        recipientEmailSnapshot: redactedRecipientEmail(
          invitation.recipientEmailSnapshot,
          authorization
        ),
        recipientNameSnapshot: invitation.recipientNameSnapshot,
        recipientProfileId: invitation.recipientProfileId,
      } as const;
    })
  );
}

async function loadComparison(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization,
  round: Doc<"quoteRounds">,
  now: number
) {
  if (
    round.state === "draft" ||
    round.state === "cancelled" ||
    !round.currentPackageRevisionId
  ) {
    return unavailable(
      "Comparison is available only for an open or closed Quote Round with a package revision."
    );
  }
  const packageRevision = await ctx.db.get(round.currentPackageRevisionId);
  if (!packageRevision) {
    return unavailable("Current Quote Package Revision is unavailable.");
  }
  const packageComparison = await loadPackageComparison(
    ctx,
    authorization,
    round,
    packageRevision
  );
  const invitations = await loadComparisonInvitations(
    ctx,
    authorization,
    round,
    packageRevision,
    now
  );
  const activeInvitations = await ctx.db
    .query("quoteRoundInvitations")
    .withIndex("by_quoteRoundId_and_participationState", (query) =>
      query.eq("quoteRoundId", round._id).eq("participationState", "active")
    )
    .take(MAX_INVITATIONS + 1);
  if (activeInvitations.length > MAX_INVITATIONS) {
    throw new ConvexError(
      "Quote Round has too many invitations for comparison."
    );
  }
  const candidates = (
    await Promise.all(
      activeInvitations.map((invitation) =>
        candidateForInvitation(
          ctx,
          authorization,
          round,
          packageRevision,
          invitation,
          packageComparison
        )
      )
    )
  ).filter(
    (candidate): candidate is NonNullable<typeof candidate> =>
      candidate !== null
  );
  const preferred = await currentPreferredSummary(
    ctx,
    round,
    packageRevision,
    authorization
  );
  const state = await getPreferredState(ctx, round._id);
  const canManagePreferred = authorization.roles.some(
    (role) => role === "builder" || role === "builder-staff"
  );
  return {
    candidates,
    canClearPreferred:
      canManagePreferred &&
      Boolean(state && preferredPointerFromState(state)) &&
      (round.state === "open" || round.state === "closed"),
    canSetPreferred:
      canManagePreferred &&
      (round.state === "open" || round.state === "closed"),
    invitations,
    package: packageComparison,
    preferred,
    round: {
      _id: round._id,
      mode: round.mode,
      revision: round.revision,
      state: round.state,
      title: round.title,
      updatedAt: round.updatedAt,
    },
    stateVersion: state?.stateVersion ?? 0,
    status: "available" as const,
  };
}

export const getQuoteRoundComparison = authenticatedQuery
  .input({
    buildId: v.string(),
    now: v.number(),
    quoteRoundId: v.string(),
    readerKind: v.optional(
      v.union(
        v.literal("backoffice"),
        v.literal("builder"),
        v.literal("homeowner")
      )
    ),
    workosOrganizationId: v.string(),
  })
  .returns(comparisonResultValidator)
  .handler(async (ctx, args) => {
    const buildId = ctx.db.normalizeId("activeBuilds", args.buildId);
    const quoteRoundId = ctx.db.normalizeId("quoteRounds", args.quoteRoundId);
    if (!(buildId && quoteRoundId)) {
      return unavailable("Quote Round is unavailable.");
    }
    const authorization = await authorizeComparisonPath(ctx, {
      buildId,
      readerKind: args.readerKind,
      workosOrganizationId: args.workosOrganizationId,
    });
    const round = requireRound(
      await ctx.db.get(quoteRoundId),
      authorization,
      quoteRoundId
    );
    return await loadComparison(ctx, authorization, round, args.now);
  })
  .public();

async function submissionForPreferredCommand(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  round: Doc<"quoteRounds">,
  submissionRevisionId: Id<"quoteInvitationResponseSubmissionRevisions">
) {
  const submission = await ctx.db.get(submissionRevisionId);
  if (!submission) {
    throw new ConvexError("Quote response submission is unavailable.");
  }
  assertScoped(submission, authorization, round._id);
  const invitation = await ctx.db.get(submission.quoteRoundInvitationId);
  const packageRevision = await ctx.db.get(submission.quotePackageRevisionId);
  if (!(invitation && packageRevision)) {
    throw new ConvexError("Quote response submission scope is unavailable.");
  }
  assertScoped(invitation, authorization, round._id);
  assertScoped(packageRevision, authorization, round._id);
  if (round.state !== "open" && round.state !== "closed") {
    throw new ConvexError(
      "Preferred Quote can be changed only while a Quote Round is open or closed."
    );
  }
  if (round.currentPackageRevisionId !== packageRevision._id) {
    throw new ConvexError(
      "Only a submission from the current Quote Package Revision may be Preferred."
    );
  }
  if (
    invitation.participationState !== "active" ||
    (invitation.currentQuotePackageRevisionId ??
      invitation.quotePackageRevisionId) !== packageRevision._id
  ) {
    throw new ConvexError(
      "Only an active current Quote Invitation may be Preferred."
    );
  }
  const states = await ctx.db
    .query("quoteInvitationResponseSubmissionStates")
    .withIndex(
      "by_quoteRoundInvitationId_and_quotePackageRevisionId",
      (query) =>
        query
          .eq("quoteRoundInvitationId", invitation._id)
          .eq("quotePackageRevisionId", packageRevision._id)
    )
    .take(2);
  if (
    states.length !== 1 ||
    states[0]?.activeSubmissionRevisionId !== submission._id
  ) {
    throw new ConvexError(
      "Only the current active Quote response may be Preferred."
    );
  }
  const events = await ctx.db
    .query("quoteInvitationResponseSubmissionLifecycleEvents")
    .withIndex(
      "by_quoteInvitationResponseSubmissionRevisionId_and_createdAt",
      (query) =>
        query.eq("quoteInvitationResponseSubmissionRevisionId", submission._id)
    )
    .order("asc")
    .take(MAX_SUBMISSION_EVENTS);
  const lifecycle = lifecycleForEvents(
    events,
    new Map([[submission._id, submission.revision]])
  );
  if (lifecycle.status !== "active") {
    throw new ConvexError("Only an active Quote response may be Preferred.");
  }
  return { invitation, packageRevision, submission };
}

interface PreferredResultBase {
  preferred: {
    selectedAt: number;
    selectedByWorkosUserId: string;
    submissionRevision: number;
    submissionRevisionId: Id<"quoteInvitationResponseSubmissionRevisions">;
    quotePackageRevisionId: Id<"quotePackageRevisions">;
    quoteRoundInvitationId: Id<"quoteRoundInvitations">;
  } | null;
  stateVersion: number;
}

async function preferredResult(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  round: Doc<"quoteRounds">,
  status: "selected",
  idempotentReplay: boolean
): Promise<
  PreferredResultBase & { idempotentReplay: boolean; status: "selected" }
>;
async function preferredResult(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  round: Doc<"quoteRounds">,
  status: "cleared"
): Promise<PreferredResultBase & { status: "cleared" }>;
async function preferredResult(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  round: Doc<"quoteRounds">,
  status: "selected" | "cleared",
  idempotentReplay = false
) {
  const state = await getPreferredState(ctx, round._id);
  const preferred = await currentPreferredSummary(
    ctx,
    round,
    round.currentPackageRevisionId
      ? await ctx.db.get(round.currentPackageRevisionId)
      : null,
    authorization
  );
  if (status === "selected") {
    return {
      idempotentReplay,
      preferred,
      stateVersion: state?.stateVersion ?? 0,
      status: "selected" as const,
    };
  }
  return {
    preferred,
    stateVersion: state?.stateVersion ?? 0,
    status: "cleared" as const,
  };
}

export const setPreferredQuoteSubmissionRevision = authenticatedMutation
  .input({
    ...administrativeOverrideInputFields,
    buildId: v.string(),
    expectedStateVersion: v.number(),
    quoteRoundId: v.string(),
    reason: v.string(),
    submissionRevisionId: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(preferredCommandResultValidator)
  .handler(async (ctx, args) => {
    const buildId = ctx.db.normalizeId("activeBuilds", args.buildId);
    const quoteRoundId = ctx.db.normalizeId("quoteRounds", args.quoteRoundId);
    const submissionRevisionId = ctx.db.normalizeId(
      "quoteInvitationResponseSubmissionRevisions",
      args.submissionRevisionId
    );
    if (!(buildId && quoteRoundId && submissionRevisionId)) {
      throw new ConvexError("Preferred Quote identifiers are invalid.");
    }
    const reason = requiredAdministrativeReason(
      args.reason,
      "A Preferred Quote selection reason"
    );
    const baseAuthorization = await authorizeActiveBuildAccess(ctx, {
      buildId,
      organizationId: args.workosOrganizationId,
    });
    const { authorization, breakGlass } = await authorizeAdministrativeRecovery(
      ctx,
      baseAuthorization,
      {
        administrativeCapacity: args.administrativeCapacity,
        breakGlassConfirmed: args.breakGlassConfirmed,
        reason,
      }
    );
    const round = requireRound(
      await ctx.db.get(quoteRoundId),
      authorization,
      quoteRoundId
    );
    if (
      !Number.isSafeInteger(args.expectedStateVersion) ||
      args.expectedStateVersion < 0
    ) {
      throw new ConvexError("Preferred Quote state version is invalid.");
    }
    const currentState = await getPreferredState(ctx, round._id);
    if ((currentState?.stateVersion ?? 0) !== args.expectedStateVersion) {
      const preferred = await currentPreferredSummary(
        ctx,
        round,
        round.currentPackageRevisionId
          ? await ctx.db.get(round.currentPackageRevisionId)
          : null,
        authorization
      );
      return {
        idempotentReplay: false,
        preferred,
        stateVersion: currentState?.stateVersion ?? 0,
        status: "conflict" as const,
      };
    }
    const { invitation, packageRevision, submission } =
      await submissionForPreferredCommand(
        ctx,
        authorization,
        round,
        submissionRevisionId
      );
    const existingPointer = currentState
      ? preferredPointerFromState(currentState)
      : null;
    if (
      existingPointer?.quoteInvitationResponseSubmissionRevisionId ===
      submission._id
    ) {
      return await preferredResult(ctx, authorization, round, "selected", true);
    }
    const now = Date.now();
    const nextStateVersion = (currentState?.stateVersion ?? 0) + 1;
    const priorState = existingPointer ?? { status: "none" };
    const nextPointer = {
      quoteInvitationResponseSubmissionRevisionId: submission._id,
      quotePackageRevisionId: packageRevision._id,
      quoteRoundInvitationId: invitation._id,
      selectedAt: now,
      selectedByWorkosUserId: ctx.viewer.subject,
      submissionRevision: submission.revision,
    };
    if (currentState) {
      await ctx.db.patch(currentState._id, {
        ...nextPointer,
        stateVersion: nextStateVersion,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("quoteRoundPreferredSubmissionStates", {
        brokerageId: round.brokerageId,
        buildId: round.buildId,
        createdAt: now,
        organizationId: round.organizationId,
        quoteRoundId: round._id,
        stateVersion: nextStateVersion,
        updatedAt: now,
        ...nextPointer,
      });
    }
    await appendGovernedAuditEvent(ctx, authorization, {
      breakGlass,
      command: "setPreferredQuoteSubmissionRevision",
      entityId: String(round._id),
      entityType: "quoteRound",
      eventType: "quote_round.preferred_quote_set",
      newState: nextPointer,
      now,
      overrideKind: "preferred_set",
      priorState,
      reason,
      targetRevisions: [
        {
          entityId: String(round._id),
          entityType: "quoteRound",
          revision: round.revision,
        },
        {
          entityId: String(packageRevision._id),
          entityType: "quotePackageRevision",
          revision: packageRevision.revision,
        },
        {
          entityId: String(submission._id),
          entityType: "quoteResponseSubmissionRevision",
          revision: submission.revision,
        },
      ],
      warnings: [],
    });
    return await preferredResult(ctx, authorization, round, "selected", false);
  })
  .public();

export const clearPreferredQuoteSubmissionRevision = authenticatedMutation
  .input({
    ...administrativeOverrideInputFields,
    buildId: v.string(),
    confirmed: v.boolean(),
    expectedStateVersion: v.number(),
    quoteRoundId: v.string(),
    reason: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(preferredCommandResultValidator)
  .handler(async (ctx, args) => {
    if (!args.confirmed) {
      throw new ConvexError("Preferred Quote clear requires confirmation.");
    }
    const buildId = ctx.db.normalizeId("activeBuilds", args.buildId);
    const quoteRoundId = ctx.db.normalizeId("quoteRounds", args.quoteRoundId);
    if (!(buildId && quoteRoundId)) {
      throw new ConvexError("Preferred Quote identifiers are invalid.");
    }
    const reason = requiredAdministrativeReason(
      args.reason,
      "A Preferred Quote clear reason"
    );
    const baseAuthorization = await authorizeActiveBuildAccess(ctx, {
      buildId,
      organizationId: args.workosOrganizationId,
    });
    const { authorization, breakGlass } = await authorizeAdministrativeRecovery(
      ctx,
      baseAuthorization,
      {
        administrativeCapacity: args.administrativeCapacity,
        breakGlassConfirmed: args.breakGlassConfirmed,
        reason,
      }
    );
    const round = requireRound(
      await ctx.db.get(quoteRoundId),
      authorization,
      quoteRoundId
    );
    if (round.state !== "open" && round.state !== "closed") {
      throw new ConvexError(
        "Preferred Quote can be changed only while a Quote Round is open or closed."
      );
    }
    if (
      !Number.isSafeInteger(args.expectedStateVersion) ||
      args.expectedStateVersion < 0
    ) {
      throw new ConvexError("Preferred Quote state version is invalid.");
    }
    const state = await getPreferredState(ctx, round._id);
    if ((state?.stateVersion ?? 0) !== args.expectedStateVersion) {
      const preferred = await currentPreferredSummary(
        ctx,
        round,
        round.currentPackageRevisionId
          ? await ctx.db.get(round.currentPackageRevisionId)
          : null,
        authorization
      );
      return {
        idempotentReplay: false,
        preferred,
        stateVersion: state?.stateVersion ?? 0,
        status: "conflict" as const,
      };
    }
    if (state) {
      const pointer = preferredPointerFromState(state);
      if (pointer) {
        const now = Date.now();
        await ctx.db.patch(state._id, {
          quoteInvitationResponseSubmissionRevisionId: undefined,
          quotePackageRevisionId: undefined,
          quoteRoundInvitationId: undefined,
          selectedAt: undefined,
          selectedByWorkosUserId: undefined,
          stateVersion: state.stateVersion + 1,
          submissionRevision: undefined,
          updatedAt: now,
        });
        await appendGovernedAuditEvent(ctx, authorization, {
          breakGlass,
          command: "clearPreferredQuoteSubmissionRevision",
          entityId: String(round._id),
          entityType: "quoteRound",
          eventType: "quote_round.preferred_quote_cleared",
          newState: { status: "none" },
          now,
          overrideKind: "preferred_clear",
          priorState: pointer,
          reason,
          targetRevisions: [
            {
              entityId: String(round._id),
              entityType: "quoteRound",
              revision: round.revision,
            },
            {
              entityId: String(
                pointer.quoteInvitationResponseSubmissionRevisionId
              ),
              entityType: "quoteResponseSubmissionRevision",
              revision: pointer.submissionRevision,
            },
          ],
          warnings: [],
        });
      }
    }
    return await preferredResult(ctx, authorization, round, "cleared");
  })
  .public();
