import { v } from "convex/values";
import { buildCollaborationRoleValidator } from "../build_collaboration_validators";

export const siteVisitLocationAttemptValidator = v.object({
  accuracyMeters: v.optional(v.number()),
  attempted: v.boolean(),
  attemptedAt: v.optional(v.number()),
  distanceMeters: v.optional(v.number()),
  failureReason: v.optional(v.string()),
  geofenceRadiusMeters: v.optional(v.number()),
  latitude: v.optional(v.number()),
  longitude: v.optional(v.number()),
  permissionOutcome: v.union(
    v.literal("denied"),
    v.literal("granted"),
    v.literal("not_requested"),
    v.literal("unavailable")
  ),
  verified: v.boolean(),
});

export const siteVisitPrerequisiteExceptionValidator = v.object({
  acknowledged: v.boolean(),
  reason: v.string(),
});

export const demoTimelineStatusValidator = v.union(
  v.literal("complete"),
  v.literal("ready"),
  v.literal("review"),
  v.literal("upcoming")
);

export const auditEventResourceTypeValidator = v.union(
  v.literal("milestone"),
  v.literal("submilestone"),
  v.literal("draw"),
  v.literal("evidence"),
  v.literal("material"),
  v.literal("siteVisit"),
  v.literal("contractor"),
  v.literal("capitalEvent"),
  v.literal("reminder")
);

export const demoTimelineIconValidator = v.union(
  v.literal("change"),
  v.literal("closeout"),
  v.literal("drywall"),
  v.literal("exterior"),
  v.literal("finishes"),
  v.literal("foundation"),
  v.literal("framing"),
  v.literal("kitchen"),
  v.literal("plumbing"),
  v.literal("roofing"),
  v.literal("roughIn")
);

export const demoTimelineToneValidator = v.optional(
  v.union(
    v.literal("active"),
    v.literal("blocked"),
    v.literal("complete"),
    v.literal("upcoming"),
    v.literal("warning")
  )
);

export const demoTimelineSnapshotSubmilestoneStatusValidator = v.union(
  v.literal("todo"),
  v.literal("in_progress"),
  v.literal("done")
);

export const demoTimelineSnapshotSubmilestoneValidator = v.object({
  budgetCents: v.optional(v.number()),
  description: v.optional(v.string()),
  durationDays: v.optional(v.number()),
  key: v.string(),
  name: v.string(),
  order: v.number(),
  status: v.optional(demoTimelineSnapshotSubmilestoneStatusValidator),
});

export const demoTimelineSnapshotSiteVisitGuidanceValidator = v.object({
  cameraAngles: v.string(),
  whatToVerify: v.string(),
});

export const demoTimelineMilestoneDataValidator = v.object({
  amount: v.number(),
  completionClaim: v.optional(
    v.object({
      actualCost: v.optional(v.number()),
      completedDay: v.number(),
      note: v.optional(v.string()),
      qualityNote: v.optional(v.string()),
      qualityRating: v.optional(v.number()),
      submittedAt: v.string(),
    })
  ),
  completionPaymentAmount: v.optional(v.number()),
  completionReview: v.optional(
    v.object({
      note: v.optional(v.string()),
      reviewedAt: v.string(),
      siteVisit: v.optional(
        v.object({
          includedItemIds: v.optional(v.array(v.string())),
          note: v.optional(v.string()),
          requestedAt: v.string(),
          requestedDay: v.number(),
          status: v.optional(v.string()),
          tokenExpiresAt: v.optional(v.number()),
          url: v.optional(v.string()),
          visitId: v.optional(v.string()),
        })
      ),
      status: v.union(v.literal("approved"), v.literal("revisionRequested")),
    })
  ),
  draw: v.string(),
  drawAvailabilityAmount: v.optional(v.number()),
  drawX: v.optional(v.number()),
  durationDays: v.number(),
  evidence: v.string(),
  evidencePackage: v.optional(
    v.object({
      assets: v.array(
        v.object({
          fileName: v.string(),
          id: v.string(),
          label: v.string(),
          mimeType: v.string(),
          previewUrl: v.optional(v.string()),
          size: v.number(),
          tag: v.string(),
        })
      ),
    })
  ),
  icon: demoTimelineIconValidator,
  initialPaymentAmount: v.optional(v.number()),
  name: v.string(),
  policy: v.string(),
  siteVisitGuidance: v.optional(demoTimelineSnapshotSiteVisitGuidanceValidator),
  status: demoTimelineStatusValidator,
  subMilestones: v.optional(v.array(v.string())),
  submilestoneDetails: v.optional(
    v.array(demoTimelineSnapshotSubmilestoneValidator)
  ),
});

export const demoTimelineItemValidator = v.object({
  data: demoTimelineMilestoneDataValidator,
  disabled: v.optional(v.boolean()),
  eyebrow: v.optional(v.string()),
  id: v.string(),
  label: v.optional(v.string()),
  lane: v.optional(v.number()),
  markerLabel: v.optional(v.string()),
  tone: demoTimelineToneValidator,
  x: v.number(),
});

export const demoTimelineDrawValidator = v.object({
  amount: v.number(),
  customDate: v.optional(v.boolean()),
  id: v.string(),
  itemId: v.optional(v.string()),
  label: v.string(),
  requestReviewNote: v.optional(v.string()),
  requestNote: v.optional(v.string()),
  requestStatus: v.optional(
    v.union(
      v.literal("draft"),
      v.literal("requested"),
      v.literal("approved"),
      v.literal("rejected")
    )
  ),
  reviewedAt: v.optional(v.string()),
  requestedAt: v.optional(v.string()),
  x: v.number(),
});

export const demoTimelineCapitalSpikeValidator = v.object({
  amount: v.number(),
  eventKind: v.optional(
    v.union(
      v.literal("cashInfusion"),
      v.literal("cost"),
      v.literal("homeEquityTakeout")
    )
  ),
  id: v.string(),
  interestAnnualBps: v.optional(v.number()),
  label: v.string(),
  x: v.number(),
});

export const demoTimelineRangeValidator = v.object({
  max: v.number(),
  min: v.number(),
  unit: v.optional(v.string()),
});

export const demoActiveMilestoneSelectionValidator = v.object({
  itemId: v.string(),
  phase: v.union(v.literal("inProgress"), v.literal("complete")),
});

export const demoTimelinePlanStatusValidator = v.union(
  v.literal("draft"),
  v.literal("submitted"),
  v.literal("approved"),
  v.literal("archived")
);

export const demoTimelineDrawStatusValidator = v.union(
  v.literal("draft"),
  v.literal("requested"),
  v.literal("approved"),
  v.literal("rejected")
);

export const demoTimelineCapitalEventKindValidator = v.union(
  v.literal("cost"),
  v.literal("cashInfusion")
);

export const demoTimelineModificationRequestTypeValidator = v.union(
  v.literal("createMilestone"),
  v.literal("deleteMilestone"),
  v.literal("updateMilestoneBudget")
);

export const demoTimelineModificationRequestStatusValidator = v.union(
  v.literal("requested"),
  v.literal("approved"),
  v.literal("rejected")
);

export const demoTimelineSiteVisitStatusValidator = v.union(
  v.literal("unopened"),
  v.literal("in_progress"),
  v.literal("complete"),
  v.literal("expired"),
  v.literal("superseded")
);

export const demoSiteVisitGuidanceKindValidator = v.union(
  v.literal("whatToVerify"),
  v.literal("cameraAngle")
);

export const demoTimelineSubmilestoneSnapshotValidator = v.object({
  budgetCents: v.optional(v.number()),
  description: v.optional(v.string()),
  durationDays: v.optional(v.number()),
  key: v.string(),
  name: v.string(),
  order: v.number(),
  status: v.optional(
    v.union(v.literal("todo"), v.literal("in_progress"), v.literal("done"))
  ),
});

export const productionProposalStatusValidator = v.union(
  v.literal("draft"),
  v.literal("submitted"),
  v.literal("approved"),
  v.literal("closed")
);

export const productionReviewOutcomeValidator = v.union(
  v.literal("none"),
  v.literal("requested_changes"),
  v.literal("rejected"),
  v.literal("approved")
);

export const productionSelectedPlanValidator = v.object({
  metrics: v.object({
    drawCount: v.number(),
    drawFeesCents: v.number(),
    interestCostCents: v.number(),
    minimumCashReserveCents: v.number(),
    projectedDurationDays: v.number(),
    requiredWorkingCapitalCents: v.optional(v.number()),
    startingCashCents: v.number(),
    totalCostCents: v.number(),
    totalDrawAmountCents: v.number(),
  }),
  name: v.string(),
  planKey: v.union(
    v.literal("cheapestFeasible"),
    v.literal("fastest"),
    v.literal("capitalConstrained")
  ),
  recommendationReason: v.string(),
  selectedAt: v.number(),
  selectedByWorkosUserId: v.string(),
});

export const productionDocumentTypeValidator = v.union(
  v.literal("permit"),
  v.literal("budget"),
  v.literal("plan"),
  v.literal("supporting")
);

export const productionDocumentStatusValidator = v.union(
  v.literal("uploaded"),
  v.literal("linked"),
  v.literal("waived")
);

export const buildDocumentStatusValidator = v.union(
  v.literal("uploaded"),
  v.literal("linked"),
  v.literal("waived"),
  v.literal("superseded")
);

export const siteVisitGuidanceFieldValidator = v.union(
  v.string(),
  v.array(v.string())
);

export const siteVisitGuidanceValidator = v.object({
  cameraAngles: siteVisitGuidanceFieldValidator,
  whatToVerify: siteVisitGuidanceFieldValidator,
});

export const richTextFormatValidator = v.union(
  v.literal("plain_text"),
  v.literal("html")
);

export const productionBuildStatusValidator = v.union(
  v.literal("active"),
  v.literal("future_start")
);

export const productionBuildDrawStatusValidator = v.union(
  v.literal("planned"),
  v.literal("requested"),
  v.literal("approved"),
  v.literal("in_review"),
  v.literal("ready_for_admin"),
  v.literal("approved_for_release"),
  v.literal("rejected"),
  v.literal("withdrawn"),
  v.literal("cancelled"),
  v.literal("released")
);

export const activeBuildDrawRequestStatusValidator = v.union(
  v.literal("requested"),
  v.literal("approved"),
  v.literal("in_review"),
  v.literal("ready_for_admin"),
  v.literal("approved_for_release"),
  v.literal("rejected"),
  v.literal("withdrawn"),
  v.literal("cancelled"),
  v.literal("released")
);

export const systemPostBackfillUnknownFactValidator = v.union(
  v.literal("start"),
  v.literal("actor"),
  v.literal("evidence"),
  v.literal("review"),
  v.literal("approval"),
  v.literal("disposition")
);

export const systemPostHistoricalBackfillValidator = v.object({
  source: v.literal("existing_records"),
  materializedAt: v.number(),
  historicalAt: v.optional(v.number()),
  historicalActorWorkosUserId: v.optional(v.string()),
  historicalActorRole: v.optional(buildCollaborationRoleValidator),
  unknownFacts: v.array(systemPostBackfillUnknownFactValidator),
});

export const auditActorRoleValidator = v.union(
  v.literal("admin"),
  v.literal("principle-broker"),
  v.literal("broker"),
  v.literal("builder"),
  v.literal("broker-staff"),
  v.literal("builder-staff"),
  v.literal("homeowner"),
  v.literal("contractor"),
  v.literal("lender"),
  v.literal("lender-admin"),
  v.literal("lender-staff")
);

export const contractorKindValidator = v.union(
  v.literal("company"),
  v.literal("individual"),
  v.literal("crew")
);

export const contractorPayRateUnitValidator = v.union(
  v.literal("hour"),
  v.literal("day"),
  v.literal("fixed")
);

export const contractorOnboardingStatusValidator = v.union(
  v.literal("profile_only"),
  v.literal("invited"),
  v.literal("account_linked")
);

export const contractorProfileSourceValidator = v.union(
  v.literal("builder_created"),
  v.literal("backoffice_created"),
  v.literal("self_service")
);

export const quoteRecipientCapabilityValidator = v.union(
  v.literal("contractor"),
  v.literal("supplier")
);

export const costDocumentPartyTypeValidator = v.union(
  v.literal("contractor"),
  v.literal("supplier"),
  v.literal("vendor")
);

export const quoteRecipientProvisioningStateValidator = v.union(
  v.literal("provisional"),
  v.literal("claimed")
);

export const contractorProfileReviewTypeValidator = v.union(
  v.literal("legal_name_change"),
  v.literal("primary_email_change"),
  v.literal("compliance_docs"),
  v.literal("deactivation"),
  v.literal("merge"),
  v.literal("split"),
  v.literal("account_unlink")
);

export const contractorProfileReviewStatusValidator = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("rejected")
);

export const contractorOnboardingReviewStatusValidator = v.union(
  v.literal("draft"),
  v.literal("pending_backoffice_review"),
  v.literal("changes_requested"),
  v.literal("approved_pending_workos"),
  v.literal("active"),
  v.literal("rejected"),
  v.literal("merged")
);

export const contractorOnboardingReviewOutcomeValidator = v.union(
  v.literal("approved"),
  v.literal("rejected"),
  v.literal("changes_requested"),
  v.literal("merged"),
  v.literal("compliance_required"),
  v.literal("approved_missing_compliance"),
  v.literal("compliance_not_required")
);

export const contractorInviteClaimStateValidator = v.union(
  v.literal("not_invited"),
  v.literal("invited"),
  v.literal("accepted_pending_confirmation"),
  v.literal("claimed"),
  v.literal("revoked"),
  v.literal("expired")
);

export const contractorEvidenceFeedbackStateValidator = v.union(
  v.literal("submitted"),
  v.literal("useful"),
  v.literal("not_relevant"),
  v.literal("more_context_requested"),
  v.literal("replacement_requested"),
  v.literal("addressed")
);

export const contractorAssignmentAckStateValidator = v.union(
  v.literal("pending_acknowledgement"),
  v.literal("acknowledged"),
  v.literal("clarification_requested"),
  v.literal("scope_disputed"),
  v.literal("resolved")
);

export const contractorScopeIssueKindValidator = v.union(
  v.literal("clarification"),
  v.literal("mismatch"),
  v.literal("schedule_conflict")
);

export const contractorScopeIssueStatusValidator = v.union(
  v.literal("open"),
  v.literal("awaiting_contractor"),
  v.literal("awaiting_builder"),
  v.literal("awaiting_backoffice"),
  v.literal("resolved"),
  v.literal("withdrawn")
);

export const contractorNotificationKindValidator = v.union(
  v.literal("assigned_to_scope"),
  v.literal("removed_from_scope"),
  v.literal("schedule_changed"),
  v.literal("schedule_acknowledgement_requested"),
  v.literal("evidence_feedback"),
  v.literal("invite_claimed"),
  v.literal("profile_review_required"),
  v.literal("clarification_requested"),
  v.literal("clarification_responded"),
  v.literal("clarification_resolved"),
  v.literal("onboarding_result")
);

export const contractorNotificationChannelValidator = v.union(
  v.literal("in_app"),
  v.literal("email")
);

export const milestoneContractorAssignmentStatusValidator = v.union(
  v.literal("planned"),
  v.literal("active"),
  v.literal("completed"),
  v.literal("removed")
);

export const contractorQualityRatingSourceValidator = v.union(
  v.literal("builder_evidence"),
  v.literal("site_visit"),
  v.literal("backoffice")
);

export const productionCostItemTypeValidator = v.union(
  v.literal("material"),
  v.literal("equipment")
);

export const productionCostItemBudgetTreatmentValidator = v.union(
  v.literal("logOnly"),
  v.literal("add"),
  v.literal("maintain")
);

export const builderStaffPermissionScopeValidator = v.union(
  v.literal("proposal"),
  v.literal("activeBuild")
);

export const builderStaffPermissionResourceValidator = v.union(
  v.literal("milestone"),
  v.literal("submilestone"),
  v.literal("draw"),
  v.literal("evidence"),
  v.literal("contractor"),
  v.literal("material"),
  v.literal("capitalEvent"),
  v.literal("reminder")
);

export const quoteResponseTemplateAudienceValidator = v.union(
  v.literal("contractor"),
  v.literal("supplier"),
  v.literal("either")
);

export const quoteResponseTemplateFieldKindValidator = v.union(
  v.literal("priced_line"),
  v.literal("short_text"),
  v.literal("long_text"),
  v.literal("date"),
  v.literal("choice"),
  v.literal("attachment")
);

export const quoteResponseTemplateFieldScopeValidator = v.union(
  v.literal("whole_quote"),
  v.literal("labour"),
  v.literal("materials")
);

export const quoteResponseTemplateFieldRendererValidator = v.union(
  v.literal("input"),
  v.literal("tiptap")
);

export const quoteResponseTemplateFieldValidationValidator = v.object({
  allowedMimeTypes: v.optional(v.array(v.string())),
  maxFiles: v.optional(v.number()),
  maxLength: v.optional(v.number()),
  maxValueCents: v.optional(v.number()),
  minFiles: v.optional(v.number()),
  minLength: v.optional(v.number()),
  minValueCents: v.optional(v.number()),
  pattern: v.optional(v.string()),
});

export const quoteResponseTemplateTaxValidator = v.object({
  label: v.string(),
  rateBps: v.number(),
});

export const quoteRoundModeValidator = v.union(
  v.literal("labour"),
  v.literal("material"),
  v.literal("combined")
);

export const quoteRoundStateValidator = v.union(
  v.literal("draft"),
  v.literal("open"),
  v.literal("closed"),
  v.literal("cancelled")
);

export const quoteRoundMaterialSourceValidator = v.union(
  v.literal("build_cost_item"),
  v.literal("ad_hoc")
);

export const quoteInvitationParticipationStateValidator = v.union(
  v.literal("active"),
  v.literal("revoked")
);

export const quoteInvitationCredentialStateValidator = v.union(
  v.literal("active"),
  v.literal("expired"),
  v.literal("rotated"),
  v.literal("revoked")
);

export const quoteInvitationCredentialPurposeValidator = v.union(
  v.literal("initial"),
  v.literal("reminder"),
  v.literal("renewal"),
  v.literal("rotation")
);

export const quoteInvitationBrowserSessionStateValidator = v.union(
  v.literal("active"),
  v.literal("expired"),
  v.literal("revoked")
);

export const quoteInvitationAccessEventTypeValidator = v.union(
  v.literal("credential_expired"),
  v.literal("session_exchanged"),
  v.literal("session_reused"),
  v.literal("profile_claimed")
);

export const quoteRoundRecipientNoticeKindValidator = v.union(
  v.literal("package_revision_published"),
  v.literal("access_reminder"),
  v.literal("access_rotated"),
  v.literal("recipient_replaced")
);

export const quoteRoundRecipientNoticeStatusValidator = v.union(
  v.literal("pending"),
  v.literal("acknowledged"),
  v.literal("cancelled")
);

export const quoteInvitationPackageRevisionAcknowledgementStatusValidator =
  v.union(v.literal("pending"), v.literal("acknowledged"));

export const quoteInvitationResponseDraftLineSourceValidator = v.union(
  v.literal("package_labour"),
  v.literal("package_material"),
  v.literal("template_priced"),
  v.literal("expanded_scope")
);

export const quoteInvitationResponseDraftLineScopeValidator = v.union(
  v.literal("labour"),
  v.literal("materials"),
  v.literal("whole_quote")
);

export const quoteInvitationResponseDraftAttachmentStagingStateValidator =
  v.union(
    v.literal("open"),
    v.literal("finalized"),
    v.literal("consumed"),
    v.literal("abandoned")
  );

export const quoteInvitationResponseSubmissionLifecycleEventTypeValidator =
  v.union(
    v.literal("submitted"),
    v.literal("superseded"),
    v.literal("withdrawn")
  );

export const quoteInvitationResponseSubmissionActorKindValidator = v.union(
  v.literal("browser_session"),
  v.literal("claimed_account")
);

export const quotePackageAttachmentKindValidator = v.union(
  v.literal("permit"),
  v.literal("inherited")
);

export const buildSubmilestoneDocumentLinkVisibilityValidator = v.union(
  v.literal("recipient_shareable"),
  v.literal("internal"),
  v.literal("unclassified")
);

export const productionOutboxStatusValidator = v.union(
  v.literal("pending"),
  v.literal("processed"),
  v.literal("failed")
);

export const emailMessageStatusValidator = v.union(
  v.literal("queued"),
  v.literal("sent"),
  v.literal("delivered"),
  v.literal("delivery_delayed"),
  v.literal("bounced"),
  v.literal("failed"),
  v.literal("complained"),
  v.literal("cancelled")
);

export const communicationIntentKindValidator = v.union(
  v.literal("identity_invitation"),
  v.literal("cost_document_integrity_action_required"),
  v.literal("cost_document_receipt"),
  v.literal("quote_invitation_initial"),
  v.literal("quote_package_revision"),
  v.literal("quote_invitation_rotation"),
  v.literal("quote_invitation_recipient_replaced"),
  v.literal("quote_invitation_reminder_manual"),
  v.literal("quote_invitation_reminder_auto"),
  v.literal("quote_invitation_revoked"),
  v.literal("quote_round_cancelled"),
  v.literal("quote_response_submitted"),
  v.literal("quote_response_resubmitted"),
  v.literal("quote_response_withdrawn"),
  v.literal("lender_portal_approval_required"),
  v.literal("lender_portal_proposal_updated_after_decline"),
  v.literal("lender_portal_withdrawal"),
  v.literal("lender_portal_approval_outcome")
);

export const communicationIntentStatusValidator = v.union(
  v.literal("pending"),
  v.literal("dispatching"),
  v.literal("sent"),
  v.literal("retry_scheduled"),
  v.literal("delivered"),
  v.literal("suppressed"),
  v.literal("action_required"),
  v.literal("superseded"),
  v.literal("cancelled")
);

export const lenderPortalReleaseStatusValidator = v.union(
  v.literal("disabled"),
  v.literal("canary"),
  v.literal("enabled"),
  v.literal("draining")
);

export const communicationAttemptStateValidator = v.union(
  v.literal("claimed"),
  v.literal("enqueued"),
  v.literal("failed"),
  v.literal("completed"),
  v.literal("abandoned")
);

export const communicationOutcomeTypeValidator = v.union(
  v.literal("dispatch_queued"),
  v.literal("dispatch_failed"),
  v.literal("dispatch_suppressed"),
  v.literal("action_required"),
  v.literal("email.sent"),
  v.literal("email.delivered"),
  v.literal("email.delivery_delayed"),
  v.literal("email.complained"),
  v.literal("email.bounced"),
  v.literal("email.opened"),
  v.literal("email.clicked"),
  v.literal("email.failed")
);

export const resendEmailEventTypeValidator = v.union(
  v.literal("email.sent"),
  v.literal("email.delivered"),
  v.literal("email.delivery_delayed"),
  v.literal("email.complained"),
  v.literal("email.bounced"),
  v.literal("email.opened"),
  v.literal("email.clicked"),
  v.literal("email.failed")
);

export const recipientDeliveryStatusValidator = v.union(
  v.literal("unread"),
  v.literal("read"),
  v.literal("dismissed"),
  v.literal("resolved")
);

export const recipientDeliveryResolutionModeValidator = v.union(
  v.literal("domain"),
  v.literal("recipient")
);

export const buildCollaborationExternalDeliveryStatusValidator = v.union(
  v.literal("queued"),
  v.literal("dispatched"),
  v.literal("failed"),
  v.literal("sent"),
  v.literal("cancelled")
);

export const buildCollaborationExternalChannelValidator = v.union(
  v.literal("email"),
  v.literal("push")
);

export const buildCollaborationDeliveryCadenceValidator = v.union(
  v.literal("immediate"),
  v.literal("daily"),
  v.literal("weekly")
);

export const buildCollaborationDeliveryAttemptStateValidator = v.union(
  v.literal("sending"),
  v.literal("succeeded"),
  v.literal("failed")
);

export const buildCollaborationDeliveryBatchStateValidator = v.union(
  v.literal("sending"),
  v.literal("succeeded"),
  v.literal("failed"),
  v.literal("cancelled")
);

export const operationsHandoffAcknowledgementStateValidator = v.union(
  v.literal("pending_decision"),
  v.literal("returned"),
  v.literal("acknowledged")
);

export const operationsHandoffReturnDecisionValidator = v.union(
  v.literal("continue"),
  v.literal("reroute"),
  v.literal("close")
);

export const integrationEndpointStatusValidator = v.union(
  v.literal("draft"),
  v.literal("active"),
  v.literal("disabled"),
  v.literal("revoked")
);

export const integrationDeliveryStatusValidator = v.union(
  v.literal("pending"),
  v.literal("delivered"),
  v.literal("failed"),
  v.literal("retry_pending")
);

export const proposalCollaborationSessionStatusValidator = v.union(
  v.literal("active"),
  v.literal("inactive")
);

export const proposalCollaborationInitiatorSideValidator = v.union(
  v.literal("broker"),
  v.literal("builder")
);

export const proposalCollaborationPermissionValidator = v.union(
  v.literal("view"),
  v.literal("edit")
);

export const proposalCollaborationParticipantStatusValidator = v.union(
  v.literal("invited"),
  v.literal("joined"),
  v.literal("revoked")
);

export const proposalCollaborationParticipantSourceValidator = v.union(
  v.literal("creator"),
  v.literal("share-link"),
  v.literal("invite")
);
