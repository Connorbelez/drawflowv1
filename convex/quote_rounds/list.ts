import { ConvexError, v } from "convex/values";

import {
  type ActiveBuildAuthorization,
  authorizeActiveBuildAccess,
} from "../activeBuildAccess";
import {
  type AuthorizedViewer,
  authenticatedMutation,
  authenticatedQuery,
} from "../authz";
import { isCleanCollaborationAsset } from "../build_collaboration_asset_access";
import {
  normalizeOperationalIdempotencyKey,
  operationalRequestFingerprint,
} from "../build_operational_idempotency";
import { assertOrganizationRetentionWritable } from "../data_retention";
import { assertQuoteAuthoringRole } from "../quote_authoring_access";
import {
  createInitialQuoteInvitationCredentialAndDispatch,
  defaultQuoteInvitationAccessExpiry,
} from "../quote_invitation_access";
import {
  quoteInvitationCommunicationProjection,
  quoteInvitationCommunicationProjectionValidator,
} from "../quote_notifications";
import {
  getPreferredState,
  preferredPointerFromState,
} from "../quote_preferred";
import { resolveEffectiveScopeRevisionForBuildSubmilestone } from "../submilestone_scope_contracts";
import type { Doc, Id, MutationCtx, QueryCtx } from "../types";

import {
  MAX_DRAFT_LABOUR_LINES,
  MAX_DRAFT_MATERIAL_LINES,
  MAX_DRAFT_RECIPIENTS,
  MAX_REGISTER_INVITATIONS,
  MAX_REGISTER_ACTIVE_INVITATIONS,
  MAX_REGISTER_CREDENTIALS_PER_INVITATION,
  MAX_REGISTER_NOTICES_PER_ROUND,
  MAX_MATERIAL_ASSIGNMENTS_PER_ROW,
  MAX_TOTAL_MATERIAL_ASSIGNMENTS,
  MAX_DISTINCT_MATERIAL_SUBMILESTONES,
  MAX_INHERITED_ATTACHMENTS,
  MAX_INHERITED_LINKS_SCANNED,
  MAX_CURRENT_PERMIT_CANDIDATES,
  MAX_PACKAGE_REVISION_HISTORY,
  MAX_TIPTAP_JSON_LENGTH,
  MATERIAL_ROW_KEY_PATTERN,
  quoteRoundModeValidator,
  quoteRoundStateValidator,
  quoteRoundAttentionReasonValidator,
  quoteRoundAttentionToneValidator,
  quoteRoundDeliveryStatusValidator,
  quoteRoundMaterialSourceValidator,
  quoteRecipientCapabilityValidator,
  quoteResponseTemplateAudienceValidator,
  quoteResponseTemplateFieldKindValidator,
  quoteResponseTemplateFieldScopeValidator,
  quoteResponseTemplateFieldRendererValidator,
  quoteResponseTemplateFieldValidationValidator,
  quoteResponseTemplateTaxValidator,
  materialDraftRowInputValidator,
  quoteTemplateFieldProjectionValidator,
  quoteTemplateVersionProjectionValidator,
  labourSourceProjectionValidator,
  materialSourceProjectionValidator,
  quoteRecipientProjectionValidator,
  composerProjectionValidator,
  draftMaterialRowProjectionValidator,
  quoteRoundDraftProjectionValidator,
  packageAttachmentProjectionValidator,
  packageLabourLineProjectionValidator,
  packageMaterialAssignmentProjectionValidator,
  packageMaterialLineProjectionValidator,
  packageResponseFieldProjectionValidator,
  quotePackageRevisionProjectionValidator,
  quoteInvitationProjectionValidator,
  quoteRoundProjectionValidator,
  quoteRoundSummaryValidator,
  quoteRoundListValidator,
  quoteRoundScopePinTransitionValidator,
  quoteRoundDraftMutationResultValidator,
  quoteRoundScopeRefreshMutationResultValidator,
  quoteRoundPublicationResultValidator,
  QuoteRoundCtx,
  DraftMaterialRowInput,
  NormalizedAdHocMaterialRow,
  DraftState,
  EffectiveQuoteScope,
  QuoteRoundScopePinTransition,
  QuoteScopeCache,
  QuoteRoundRegisterDelivery,
  QuoteRoundRegisterAttention,
} from "./contracts";


import {
  requiredText,
  optionalText,
  requiredFiniteNumber,
  requiredInteger,
  requiredNonNegativeInteger,
  normalizeTiptapJson,
  assertAuthoringRole,
  assertReadRole,
  canSearchQuoteRecipientIdentities,
  authorizeQuoteRoundPath,
  authorizeQuoteRoundReadPath,
  requireRoundScope,
  requireDraftState,
  assertExpectedRevision,
  requireModeScope,
  capabilityRequirement,
  profileCapabilities,
  mapUrlForBuild,
  rowKey,
  normalizedAdHocMaterialRow,
  requireBuildCostItemSourceId,
  assertAdHocSourceInput,
  readDraftState,
  requireBuildSubmilestone,
  quoteScopeLineageInput,
  quoteScopeFromEffectiveRevision,
  quoteScopeForBuildSubmilestone,
  quoteScopeForBuildSubmilestoneCached,
  requireEffectiveQuoteScope,
  draftScopePinMatches,
  packageScopePinMatches,
  validateLabourSubmilestoneIds,
  validateMaterialAssignments,
  assertAggregateMaterialAssignments,
  assertDistinctMaterialSubmilestones,
} from "./access";
import {
  draftProjection,
  packageRevisionProjection,
  quoteRoundProjection,
} from "./projections";
import {
  preparePublication,
  replayQuoteRoundPublication,
  publishedTemplateProjection,
} from "./publication";
import {
  draftScopeUpdateAvailable,
  packageScopeUpdateAvailable,
} from "./publication_validation";

export function quoteRoundModeLabel(mode: Doc<"quoteRounds">["mode"]) {
  return mode === "combined"
    ? "Labour + Materials"
    : mode === "labour"
      ? "Labour"
      : "Materials";
}

export function quoteRoundScopeLabel(input: {
  labour: Array<{ submilestoneName: string }>;
  material: Array<{ title: string }>;
  mode: Doc<"quoteRounds">["mode"];
}) {
  const names = [
    ...input.labour.map((line) => line.submilestoneName),
    ...input.material.map((line) => line.title),
  ]
    .map((name) => name.trim())
    .filter(Boolean);
  if (names.length === 0) {
    return `${quoteRoundModeLabel(input.mode)} scope`;
  }
  return `${names.slice(0, 3).join(" · ")}${names.length > 3 ? " · …" : ""}`;
}

export function quoteRoundDeliveryStatus(
  delivery: Pick<
    QuoteRoundRegisterDelivery,
    "delivered" | "failed" | "pending" | "total" | "undispatched"
  >
): QuoteRoundRegisterDelivery["status"] {
  if (delivery.total === 0 || delivery.undispatched === delivery.total) {
    return "not_dispatched";
  }
  if (delivery.undispatched > 0) {
    return "partially_dispatched";
  }
  if (delivery.failed > 0 && delivery.delivered + delivery.pending > 0) {
    return "mixed";
  }
  if (delivery.failed > 0) {
    return "failed";
  }
  if (delivery.pending > 0) {
    return "pending";
  }
  return "delivered";
}

export function quoteRoundAttention(input: {
  activeInvitationCount: number;
  delivery: QuoteRoundRegisterDelivery;
  hasPendingRevisionAcknowledgement: boolean;
  hasReminderEligibleRecipient: boolean;
  mode: Doc<"quoteRounds">["mode"];
  now: number;
  responseDeadline?: number;
  state: Doc<"quoteRounds">["state"];
}) {
  if (input.delivery.failed > 0) {
    return {
      detail: `${input.delivery.failed} recipient delivery ${input.delivery.failed === 1 ? "failed" : "failures"} recorded.`,
      label: "Delivery failed",
      rank: 1,
      reason: "delivery_failure" as const,
      tone: "critical" as const,
    } satisfies QuoteRoundRegisterAttention;
  }
  if (input.state === "open" && input.responseDeadline) {
    if (input.responseDeadline <= input.now) {
      return {
        detail: "The response deadline has passed; review the open responses.",
        label: "Deadline overdue",
        rank: 2,
        reason: "deadline_overdue" as const,
        tone: "critical" as const,
      } satisfies QuoteRoundRegisterAttention;
    }
    if (input.responseDeadline <= input.now + 48 * 60 * 60 * 1000) {
      return {
        detail: "The response deadline is within the next 48 hours.",
        label: "Deadline approaching",
        rank: 2,
        reason: "deadline_imminent" as const,
        tone: "warning" as const,
      } satisfies QuoteRoundRegisterAttention;
    }
  }
  if (input.hasPendingRevisionAcknowledgement) {
    return {
      detail: "A recipient has not acknowledged the current Package Revision.",
      label: "Revision outstanding",
      rank: 3,
      reason: "revision_wait" as const,
      tone: "warning" as const,
    } satisfies QuoteRoundRegisterAttention;
  }
  if (input.hasReminderEligibleRecipient) {
    return {
      detail: "At least one active recipient has not started a response.",
      label: "Reminder eligible",
      rank: 4,
      reason: "reminder_eligible" as const,
      tone: "warning" as const,
    } satisfies QuoteRoundRegisterAttention;
  }
  if (
    input.state === "draft" ||
    !input.responseDeadline ||
    input.activeInvitationCount === 0
  ) {
    return {
      detail:
        input.state === "draft"
          ? `${quoteRoundModeLabel(input.mode)} package still needs setup.`
          : "Recipients or a response deadline are not ready.",
      label: input.state === "draft" ? "Draft needs setup" : "Needs setup",
      rank: 5,
      reason: "scheduling_readiness" as const,
      tone: "neutral" as const,
    } satisfies QuoteRoundRegisterAttention;
  }
  return null;
}

export function isQuoteRoundDeliveryFailure(status: string) {
  return status === "bounced" || status === "failed" || status === "complained";
}

export function isQuoteRoundDeliveryPending(status: string) {
  return (
    status === "queued" || status === "sent" || status === "delivery_delayed"
  );
}

export function quoteRoundCredentialStateCounts(
  credentials: Doc<"quoteInvitationAccessCredentials">[]
) {
  return credentials.reduce(
    (counts, credential) => {
      counts.total += 1;
      counts[credential.state] += 1;
      return counts;
    },
    {
      active: 0,
      expired: 0,
      revoked: 0,
      rotated: 0,
      total: 0,
    }
  );
}

export const listQuoteRounds = authenticatedQuery
  .input({
    buildId: v.id("activeBuilds"),
    mode: v.optional(quoteRoundModeValidator),
    search: v.optional(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(quoteRoundListValidator)
  .handler(async (ctx, args) => {
    const authorization = await authorizeQuoteRoundReadPath(ctx, args);
    const normalizedSearch = args.search?.trim().toLocaleLowerCase() ?? "";
    if (normalizedSearch.length > 200) {
      throw new ConvexError("Quote Round search is limited to 200 characters.");
    }
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
    const filteredRounds = rounds.filter(
      (round) => !args.mode || round.mode === args.mode
    );
    let activeInvitationBudget = 0;
    const now = Date.now();
    const scopeCache: QuoteScopeCache = new Map();
    const summaries = await Promise.all(
      filteredRounds
        // This bounded projection intentionally composes scoped snapshots and
        // recipient dimensions in one read so the register cannot drift across
        // independent queries.
        // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: bounded register projection
        .map(async (round) => {
          requireRoundScope(round, authorization, round._id);
          const [
            packageRevision,
            draft,
            activeInvitations,
            revokedInvitations,
          ] = await Promise.all([
            round.currentPackageRevisionId
              ? ctx.db.get(round.currentPackageRevisionId)
              : Promise.resolve(null),
            ctx.db
              .query("quoteRoundDrafts")
              .withIndex("by_quoteRoundId", (query) =>
                query.eq("quoteRoundId", round._id)
              )
              .take(2),
            ctx.db
              .query("quoteRoundInvitations")
              .withIndex("by_quoteRoundId_and_participationState", (query) =>
                query
                  .eq("quoteRoundId", round._id)
                  .eq("participationState", "active")
              )
              .take(MAX_REGISTER_INVITATIONS + 1),
            ctx.db
              .query("quoteRoundInvitations")
              .withIndex("by_quoteRoundId_and_participationState", (query) =>
                query
                  .eq("quoteRoundId", round._id)
                  .eq("participationState", "revoked")
              )
              .take(MAX_REGISTER_INVITATIONS + 1),
          ]);
          if (draft.length > 1) {
            throw new ConvexError(
              "Quote Round has multiple draft projections."
            );
          }
          if (
            activeInvitations.length > MAX_REGISTER_INVITATIONS ||
            revokedInvitations.length > MAX_REGISTER_INVITATIONS
          ) {
            throw new ConvexError("Quote Round has too many invitations.");
          }
          activeInvitationBudget += activeInvitations.length;
          if (activeInvitationBudget > MAX_REGISTER_ACTIVE_INVITATIONS) {
            throw new ConvexError(
              "Quote Round register exceeds the active invitation budget."
            );
          }
          const allInvitations = [...activeInvitations, ...revokedInvitations];
          for (const invitation of allInvitations) {
            if (
              invitation.buildId !== authorization.build._id ||
              invitation.organizationId !== authorization.organizationId ||
              invitation.brokerageId !== authorization.brokerage._id ||
              invitation.quoteRoundId !== round._id
            ) {
              throw new ConvexError("Quote Invitation crosses Build scope.");
            }
          }
          if (
            packageRevision &&
            (packageRevision.quoteRoundId !== round._id ||
              packageRevision.buildId !== authorization.build._id ||
              packageRevision.organizationId !== authorization.organizationId ||
              packageRevision.brokerageId !== authorization.brokerage._id)
          ) {
            throw new ConvexError(
              "Quote Package Revision crosses Build scope."
            );
          }
          let preferredQuote: {
            canonicalTotalCents: number;
            invitationId: Id<"quoteRoundInvitations">;
            packageRevisionId: Id<"quotePackageRevisions">;
            revision: number;
            submittedAt: number;
            submissionRevisionId: Id<"quoteInvitationResponseSubmissionRevisions">;
          } | null = null;
          if (
            packageRevision &&
            (round.state === "open" || round.state === "closed")
          ) {
            const preferredState = await getPreferredState(ctx, round._id);
            const pointer = preferredPointerFromState(preferredState);
            if (preferredState && pointer) {
              if (
                preferredState.brokerageId !== authorization.brokerage._id ||
                preferredState.organizationId !==
                  authorization.organizationId ||
                preferredState.buildId !== authorization.build._id
              ) {
                throw new ConvexError(
                  "Preferred Quote state crosses Build scope."
                );
              }
              if (pointer.quotePackageRevisionId === packageRevision._id) {
                const [preferredSubmission, preferredInvitation] =
                  await Promise.all([
                    ctx.db.get(
                      pointer.quoteInvitationResponseSubmissionRevisionId
                    ),
                    ctx.db.get(pointer.quoteRoundInvitationId),
                  ]);
                if (
                  preferredSubmission?.quoteRoundId === round._id &&
                  preferredSubmission.quotePackageRevisionId ===
                    packageRevision._id &&
                  preferredSubmission.quoteRoundInvitationId ===
                    preferredInvitation?._id &&
                  preferredInvitation.quoteRoundId === round._id &&
                  preferredInvitation.participationState === "active"
                ) {
                  preferredQuote = {
                    canonicalTotalCents:
                      preferredSubmission.canonicalTotalCents,
                    invitationId: preferredInvitation._id,
                    packageRevisionId: packageRevision._id,
                    revision: preferredSubmission.revision,
                    submittedAt: preferredSubmission.submittedAt,
                    submissionRevisionId: preferredSubmission._id,
                  };
                }
              }
            }
          }
          const [
            packageLabourLines,
            packageMaterialLines,
            draftLabourLines,
            draftMaterialRows,
            notices,
          ] = await Promise.all([
            packageRevision
              ? ctx.db
                  .query("quotePackageRevisionLabourLines")
                  .withIndex("by_quotePackageRevisionId_and_order", (query) =>
                    query.eq("quotePackageRevisionId", packageRevision._id)
                  )
                  .take(MAX_DRAFT_LABOUR_LINES + 1)
              : Promise.resolve([]),
            packageRevision
              ? ctx.db
                  .query("quotePackageRevisionMaterialLines")
                  .withIndex("by_quotePackageRevisionId_and_order", (query) =>
                    query.eq("quotePackageRevisionId", packageRevision._id)
                  )
                  .take(MAX_DRAFT_MATERIAL_LINES + 1)
              : Promise.resolve([]),
            packageRevision
              ? Promise.resolve([])
              : ctx.db
                  .query("quoteRoundDraftLabourScope")
                  .withIndex("by_quoteRoundId_and_order", (query) =>
                    query.eq("quoteRoundId", round._id)
                  )
                  .take(MAX_DRAFT_LABOUR_LINES + 1),
            packageRevision
              ? Promise.resolve([])
              : ctx.db
                  .query("quoteRoundDraftMaterialRows")
                  .withIndex("by_quoteRoundId_and_order", (query) =>
                    query.eq("quoteRoundId", round._id)
                  )
                  .take(MAX_DRAFT_MATERIAL_LINES + 1),
            ctx.db
              .query("quoteRoundRecipientNoticeIntents")
              .withIndex("by_quoteRoundId_and_createdAt", (query) =>
                query.eq("quoteRoundId", round._id)
              )
              .order("desc")
              .take(MAX_REGISTER_NOTICES_PER_ROUND),
          ]);
          if (
            packageLabourLines.length > MAX_DRAFT_LABOUR_LINES ||
            packageMaterialLines.length > MAX_DRAFT_MATERIAL_LINES ||
            draftLabourLines.length > MAX_DRAFT_LABOUR_LINES ||
            draftMaterialRows.length > MAX_DRAFT_MATERIAL_LINES
          ) {
            throw new ConvexError(
              "Quote Round register projection exceeds limits."
            );
          }
          const draftLabourSubmilestones = packageRevision
            ? []
            : await Promise.all(
                draftLabourLines.map(async (line) => {
                  const submilestone = await ctx.db.get(
                    line.buildSubmilestoneId
                  );
                  if (
                    !submilestone ||
                    submilestone.buildId !== authorization.build._id ||
                    submilestone.organizationId !==
                      authorization.organizationId ||
                    submilestone.brokerageId !== authorization.brokerage._id
                  ) {
                    throw new ConvexError(
                      "Draft Labour scope crosses Build scope."
                    );
                  }
                  return submilestone;
                })
              );
          const scope = quoteRoundScopeLabel({
            labour: packageRevision
              ? packageLabourLines
              : draftLabourSubmilestones.map((submilestone) => ({
                  submilestoneName: submilestone.name,
                })),
            material: packageRevision
              ? packageMaterialLines
              : draftMaterialRows.map((row) => ({
                  title: row.title ?? "Materials",
                })),
            mode: round.mode,
          });
          // Terminal rounds are historical register rows. They remain fully
          // readable, but they must not resolve the live canonical Scope just
          // to calculate an action-oriented update badge. Detail projection
          // intentionally retains its stricter historical behavior.
          const scopeUpdateAvailable =
            round.state === "draft" || round.state === "open"
              ? packageRevision
                ? await packageScopeUpdateAvailable(
                    ctx,
                    authorization,
                    packageLabourLines,
                    scopeCache
                  )
                : await draftScopeUpdateAvailable(
                    ctx,
                    authorization,
                    draftLabourLines,
                    scopeCache
                  )
              : false;
          const searchableText = [
            String(round._id),
            round.title,
            scope,
            ...(canSearchQuoteRecipientIdentities(authorization.roles)
              ? allInvitations.flatMap((invitation) => [
                  invitation.recipientNameSnapshot,
                  invitation.recipientEmailSnapshot,
                ])
              : []),
          ]
            .join(" ")
            .toLocaleLowerCase();
          if (normalizedSearch && !searchableText.includes(normalizedSearch)) {
            return null;
          }

          const noticeByInvitation = new Map<
            Id<"quoteRoundInvitations">,
            Doc<"quoteRoundRecipientNoticeIntents">[]
          >();
          for (const notice of notices) {
            const existing = noticeByInvitation.get(
              notice.quoteRoundInvitationId
            );
            if (existing) {
              existing.push(notice);
            } else {
              noticeByInvitation.set(notice.quoteRoundInvitationId, [notice]);
            }
          }
          const activeProjection = await Promise.all(
            activeInvitations.map(
              // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: bounded invitation projection
              async (invitation) => {
                const credentials = await ctx.db
                  .query("quoteInvitationAccessCredentials")
                  .withIndex(
                    "by_quoteRoundInvitationId_and_createdAt",
                    (query) =>
                      query.eq("quoteRoundInvitationId", invitation._id)
                  )
                  .order("desc")
                  .take(MAX_REGISTER_CREDENTIALS_PER_INVITATION);
                const [draftRows, submissionStates, acknowledgements] =
                  await Promise.all([
                    packageRevision
                      ? ctx.db
                          .query("quoteInvitationResponseDrafts")
                          .withIndex(
                            "by_quoteRoundInvitationId_and_quotePackageRevisionId",
                            (query) =>
                              query
                                .eq("quoteRoundInvitationId", invitation._id)
                                .eq(
                                  "quotePackageRevisionId",
                                  packageRevision._id
                                )
                          )
                          .take(2)
                      : Promise.resolve([]),
                    packageRevision
                      ? ctx.db
                          .query("quoteInvitationResponseSubmissionStates")
                          .withIndex(
                            "by_quoteRoundInvitationId_and_quotePackageRevisionId",
                            (query) =>
                              query
                                .eq("quoteRoundInvitationId", invitation._id)
                                .eq(
                                  "quotePackageRevisionId",
                                  packageRevision._id
                                )
                          )
                          .take(2)
                      : Promise.resolve([]),
                    packageRevision
                      ? ctx.db
                          .query(
                            "quoteInvitationPackageRevisionAcknowledgements"
                          )
                          .withIndex(
                            "by_quoteRoundInvitationId_and_quotePackageRevisionId",
                            (query) =>
                              query
                                .eq("quoteRoundInvitationId", invitation._id)
                                .eq(
                                  "quotePackageRevisionId",
                                  packageRevision._id
                                )
                          )
                          .take(2)
                      : Promise.resolve([]),
                  ]);
                if (draftRows.length > 1 || submissionStates.length > 1) {
                  throw new ConvexError(
                    "Quote response projection is inconsistent."
                  );
                }
                const latestCredential = [...credentials].sort(
                  (left, right) =>
                    right.createdAt - left.createdAt ||
                    right.credentialVersion - left.credentialVersion
                )[0];
                const latestEmail = latestCredential?.deliveryEmailMessageId
                  ? await ctx.db.get(latestCredential.deliveryEmailMessageId)
                  : null;
                if (
                  latestEmail &&
                  (latestEmail.organizationId !==
                    authorization.organizationId ||
                    latestEmail.brokerageId !== authorization.brokerage._id)
                ) {
                  throw new ConvexError("Quote delivery crosses Build scope.");
                }
                const submissionState = submissionStates[0];
                const hasSubmitted = Boolean(
                  submissionState?.activeSubmissionRevisionId
                );
                const hasDraft = draftRows.length > 0;
                const pendingAcknowledgement = acknowledgements.some(
                  (acknowledgement) => acknowledgement.status === "pending"
                );
                const noticesForInvitation =
                  noticeByInvitation.get(invitation._id) ?? [];
                const hasPendingReminder = noticesForInvitation.some(
                  (notice) =>
                    notice.kind === "access_reminder" &&
                    notice.status === "pending"
                );
                const deliveryStatus = latestEmail
                  ? isQuoteRoundDeliveryFailure(latestEmail.status)
                    ? "failed"
                    : isQuoteRoundDeliveryPending(latestEmail.status)
                      ? "pending"
                      : latestEmail.status === "delivered"
                        ? "delivered"
                        : "pending"
                  : "not_dispatched";
                const communication =
                  await quoteInvitationCommunicationProjection(ctx, {
                    hasCurrentSubmission: hasSubmitted,
                    invitation,
                    now,
                    responseDeadline: packageRevision?.responseDeadline,
                  });
                return {
                  credentials,
                  communication,
                  deliveryStatus,
                  hasDraft,
                  hasPendingAcknowledgement: pendingAcknowledgement,
                  hasPendingReminder,
                  hasSubmitted,
                  lastActivityAt: Math.max(
                    invitation.updatedAt,
                    ...credentials.map((credential) => credential.updatedAt),
                    ...draftRows.map(
                      (responseDraft) => responseDraft.updatedAt
                    ),
                    ...submissionStates.map((state) => state.updatedAt),
                    ...noticesForInvitation.map((notice) => notice.createdAt)
                  ),
                };
              }
            )
          );
          const delivery = activeProjection.reduce<QuoteRoundRegisterDelivery>(
            (counts, projection) => {
              counts.total += 1;
              if (projection.deliveryStatus === "failed") {
                counts.failed += 1;
              } else if (projection.deliveryStatus === "delivered") {
                counts.delivered += 1;
              } else if (projection.deliveryStatus === "pending") {
                counts.pending += 1;
              } else if (projection.deliveryStatus === "not_dispatched") {
                counts.undispatched += 1;
              }
              return counts;
            },
            {
              delivered: 0,
              failed: 0,
              pending: 0,
              status: "not_dispatched",
              total: 0,
              undispatched: 0,
            }
          );
          delivery.status = quoteRoundDeliveryStatus(delivery);
          const activeCommunicationByInvitationId = new Map(
            activeProjection.map((projection) => [
              projection.communication.invitationId,
              projection.communication,
            ])
          );
          const recipientDelivery = await Promise.all(
            allInvitations.map((invitation) => {
              const activeCommunication = activeCommunicationByInvitationId.get(
                invitation._id
              );
              if (activeCommunication) {
                return activeCommunication;
              }
              return quoteInvitationCommunicationProjection(ctx, {
                hasCurrentSubmission: false,
                invitation,
                now,
                responseDeadline: packageRevision?.responseDeadline,
              });
            })
          );
          const access = activeProjection.reduce(
            (counts, projection) => {
              const credentialCounts = quoteRoundCredentialStateCounts(
                projection.credentials
              );
              counts.active += credentialCounts.active;
              counts.expired += credentialCounts.expired;
              counts.revoked += credentialCounts.revoked;
              counts.rotated += credentialCounts.rotated;
              counts.total += credentialCounts.total;
              return counts;
            },
            { active: 0, expired: 0, revoked: 0, rotated: 0, total: 0 }
          );
          const responses = activeProjection.reduce(
            (counts, projection) => {
              counts.total += 1;
              if (projection.hasSubmitted) {
                counts.submitted += 1;
              } else if (projection.hasDraft) {
                counts.drafting += 1;
              }
              return counts;
            },
            { drafting: 0, submitted: 0, total: 0 }
          );
          const pendingRevisionAcknowledgement = activeProjection.some(
            (projection) => projection.hasPendingAcknowledgement
          );
          const reminderEligible = activeProjection.some(
            (projection) => projection.communication.reminderEligible
          );
          const responseDeadline =
            packageRevision?.responseDeadline ?? draft[0]?.responseDeadline;
          const attention = quoteRoundAttention({
            activeInvitationCount: activeInvitations.length,
            delivery,
            hasPendingRevisionAcknowledgement: pendingRevisionAcknowledgement,
            hasReminderEligibleRecipient:
              reminderEligible && round.state === "open",
            mode: round.mode,
            responseDeadline,
            state: round.state,
            now,
          });
          const lastActivityAt = Math.max(
            round.updatedAt,
            packageRevision?.publishedAt ?? 0,
            draft[0]?.updatedAt ?? 0,
            ...allInvitations.map((invitation) => invitation.updatedAt),
            ...activeProjection.map((projection) => projection.lastActivityAt),
            ...notices.map((notice) => notice.createdAt)
          );
          return {
            _id: round._id,
            access,
            attention,
            delivery,
            invitationCount: activeInvitations.length,
            lastActivityAt,
            mode: round.mode,
            packageRevisionId: packageRevision?._id,
            packageRevisionNumber: packageRevision?.revision,
            participation: {
              active: activeInvitations.length,
              revoked: revokedInvitations.length,
              total: allInvitations.length,
            },
            preferredQuote,
            recipients: {
              active: activeInvitations.length,
              revoked: revokedInvitations.length,
              total: allInvitations.length,
            },
            recipientDelivery,
            responseDeadline,
            responses,
            revision: round.revision,
            scope,
            scopeUpdateAvailable,
            state: round.state,
            title: round.title,
            updatedAt: round.updatedAt,
          };
        })
    );
    return {
      rounds: summaries
        .filter(
          (summary): summary is NonNullable<typeof summary> => summary !== null
        )
        .sort(
          (left, right) =>
            (left.attention?.rank ?? 99) - (right.attention?.rank ?? 99) ||
            right.lastActivityAt - left.lastActivityAt ||
            left.title.localeCompare(right.title) ||
            String(left._id).localeCompare(String(right._id))
        ),
    };
  })
  .public();
