import { ConvexError } from "convex/values";

import {
  type ActiveBuildAuthorization,
  authorizeActiveBuildAccess,
} from "../activeBuildAccess";
import {
  assertQuoteAuthoringRole,
  hasQuoteAuthoringRole,
} from "../quote_authoring_access";
import type { AuthorizedViewer } from "../authz";
import type { Doc, Id, MutationCtx, QueryCtx } from "../types";
import {
  MAX_PACKAGE_ASSIGNMENTS_PER_LINE,
  MAX_PACKAGE_ASSIGNMENTS_TOTAL,
  MAX_PACKAGE_ATTACHMENTS,
  MAX_PACKAGE_LABOUR_LINES,
  MAX_PACKAGE_MATERIAL_LINES,
  MAX_PACKAGE_RESPONSE_FIELDS,
  MAX_QUOTE_AMOUNT_CENTS,
  MAX_SUBMISSION_EVENTS,
  MAX_SUBMISSION_LINES,
  MAX_SUBMISSION_ANSWERS,
  MAX_SUBMISSION_ATTACHMENTS,
  MAX_HISTORY,
} from "./contract";

export type ComparisonCtx = (QueryCtx | MutationCtx) & {
  viewer: AuthorizedViewer;
};
export type ComparisonReaderKind = "backoffice" | "builder" | "homeowner";

const COMPARISON_READER_ROLES: Record<ComparisonReaderKind, string[]> = {
  backoffice: ["admin", "principle-broker", "broker", "broker-staff"],
  builder: ["builder", "builder-staff"],
  homeowner: ["homeowner"],
};

export function assertComparisonReadRole(roles: readonly string[]) {
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

export function canViewRecipientSensitiveFacts(roles: readonly string[]) {
  return hasQuoteAuthoringRole(roles);
}

export function redactedRecipientEmail(
  email: string,
  authorization: ActiveBuildAuthorization
) {
  return canViewRecipientSensitiveFacts(authorization.roles)
    ? email
    : "Recipient email redacted";
}

export function visibleAttachmentStorageId(
  storageId: Id<"_storage"> | undefined,
  authorization: ActiveBuildAuthorization
) {
  return canViewRecipientSensitiveFacts(authorization.roles)
    ? storageId
    : undefined;
}

export function visiblePreferredActor(
  workosUserId: string,
  authorization: ActiveBuildAuthorization
) {
  return canViewRecipientSensitiveFacts(authorization.roles)
    ? workosUserId
    : "redacted";
}

function assertComparisonWriteRole(roles: readonly string[]) {
  assertQuoteAuthoringRole(roles);
}

export async function authorizeComparisonPath(
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

export function requireRound(
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

export function unavailable(reason: string) {
  return { reason, status: "unavailable" as const };
}

export function assertScoped(
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

export function assertQuoteResponseScope(
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

export async function loadPackageComparison(
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
      sourceScopeChangeReason: line.sourceScopeChangeReason,
      sourceScopeRevisionId: line.sourceScopeRevisionId,
      sourceScopeVersion: line.sourceScopeVersion,
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

export function sumLineItems(lines: readonly { quotedAmountCents?: number }[]) {
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

export function lifecycleForEvents(
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
