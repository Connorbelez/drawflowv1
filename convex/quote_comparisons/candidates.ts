import { ConvexError } from "convex/values";

import type { ActiveBuildAuthorization } from "../activeBuildAccess";
import {
  getPreferredState,
  preferredPointerFromState,
} from "../quote_preferred";
import {
  quoteInvitationCommunicationProjection,
} from "../quote_notifications";
import type { Doc, Id, MutationCtx, QueryCtx } from "../types";
import {
  assertQuoteResponseScope,
  assertScoped,
  lifecycleForEvents,
  loadPackageComparison,
  redactedRecipientEmail,
  sumLineItems,
  visibleAttachmentStorageId,
  visiblePreferredActor,
} from "./access";
import {
  MAX_HISTORY,
  MAX_INVITATIONS,
  MAX_SUBMISSION_ANSWERS,
  MAX_SUBMISSION_ATTACHMENTS,
  MAX_SUBMISSION_EVENTS,
  MAX_SUBMISSION_LINES,
} from "./contract";

export async function candidateForInvitation(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization,
  round: Doc<"quoteRounds">,
  packageRevision: Doc<"quotePackageRevisions">,
  invitation: Doc<"quoteRoundInvitations">,
  packageComparison: Awaited<ReturnType<typeof loadPackageComparison>>,
  historical: boolean
) {
  assertScoped(invitation, authorization, round._id);
  const currentPackageId =
    invitation.currentQuotePackageRevisionId ??
    invitation.quotePackageRevisionId;
  if (
    !historical &&
    (invitation.participationState !== "active" ||
      currentPackageId !== packageRevision._id)
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

export async function currentPreferredSummary(
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

export async function loadComparisonInvitations(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization,
  round: Doc<"quoteRounds">,
  selectedPackageRevision: Doc<"quotePackageRevisions">,
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
                .eq("quotePackageRevisionId", selectedPackageRevision._id)
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
        if (state.quotePackageRevisionId !== selectedPackageRevision._id) {
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
          responseDeadline: selectedPackageRevision.responseDeadline,
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
