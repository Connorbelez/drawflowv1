import { v } from "convex/values";

import { authenticatedMutation, authenticatedQuery } from "./authz";
import { publicMutation } from "./fluent";
import {
  claimQuoteInvitationProfileHandler,
  exchangeQuoteInvitationAccessHandler,
  ensureQuoteRoundRecipientHandler,
  getClaimedQuoteInvitationAccessHandler,
} from "./quote_invitation_access/handlers";

export {
  DEFAULT_ACCESS_WINDOW_AFTER_DEADLINE_MS,
  assertQuoteInvitationAccessWindow,
  createInitialQuoteInvitationCredentialAndDispatch,
  defaultQuoteInvitationAccessExpiry,
  quoteInvitationPackageRevisionAcknowledgement,
  quoteInvitationSecretVerifier,
  quoteInvitationUrl,
  requireAcknowledgedPackageRevision,
  resolveInvitationScope,
  resolveQuoteInvitationBrowserReadAccess,
  resolveQuoteInvitationBrowserWriteAccess,
  resolveQuoteInvitationClaimedReadAccess,
  resolveQuoteInvitationClaimedWriteAccess,
  type InvitationAccessCtx,
  type InvitationScope,
  type QuoteInvitationBrowserReadAccess,
  type QuoteInvitationBrowserWriteAccess,
  type QuoteInvitationClaimedAccess,
  type QuoteInvitationCredentialDispatchInput,
  type QuoteInvitationResponseAccessState,
} from "./quote_invitation_access/core";
export { quoteInvitationAccessProjection } from "./quote_invitation_access/projection";

const quoteRecipientCapabilityValidator = v.union(
  v.literal("contractor"),
  v.literal("supplier")
);

const quoteAccessLabourLineValidator = v.object({
  sourceLineId: v.id("quotePackageRevisionLabourLines"),
  budgetCents: v.optional(v.number()),
  durationDays: v.optional(v.number()),
  milestoneName: v.string(),
  scopeOfWorkTiptapJson: v.string(),
  sourceScopeChangeReason: v.optional(v.string()),
  sourceScopeRevisionId: v.optional(v.id("submilestoneScopeRevisions")),
  sourceScopeVersion: v.optional(v.number()),
  startDay: v.optional(v.number()),
  submilestoneName: v.string(),
});

const quoteAccessMaterialLineValidator = v.object({
  sourceLineId: v.id("quotePackageRevisionMaterialLines"),
  deliveryEndDay: v.number(),
  deliveryInstructions: v.string(),
  deliveryLocation: v.string(),
  deliveryStartDay: v.number(),
  description: v.optional(v.string()),
  quantity: v.number(),
  specificationTiptapJson: v.string(),
  title: v.string(),
  unit: v.string(),
});

const quoteAccessAttachmentValidator = v.object({
  sourceAttachmentId: v.id("quotePackageRevisionAttachments"),
  fileName: v.string(),
  kind: v.union(v.literal("permit"), v.literal("inherited")),
  mimeType: v.string(),
  sizeBytes: v.number(),
});

const quoteAccessResponseFieldValidator = v.object({
  sourceFieldId: v.id("quotePackageRevisionResponseFields"),
  choiceOptions: v.optional(v.array(v.string())),
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
  required: v.boolean(),
  renderer: v.union(v.literal("input"), v.literal("tiptap")),
  richTextDefaultHtml: v.optional(v.string()),
  scope: v.union(
    v.literal("whole_quote"),
    v.literal("labour"),
    v.literal("materials")
  ),
});

export const quoteInvitationAccessProjectionValidator = v.object({
  accessExpiresAt: v.number(),
  invitationId: v.id("quoteRoundInvitations"),
  issuerName: v.string(),
  package: v.object({
    attachments: v.array(quoteAccessAttachmentValidator),
    labourLines: v.array(quoteAccessLabourLineValidator),
    materialLines: v.array(quoteAccessMaterialLineValidator),
    responseDeadline: v.number(),
    responseFields: v.array(quoteAccessResponseFieldValidator),
    revision: v.number(),
    siteAddress: v.string(),
    siteMapUrl: v.string(),
    timelineCurrentDay: v.optional(v.number()),
    timelineRangeMax: v.optional(v.number()),
    timelineRangeMin: v.optional(v.number()),
    timelineStartDate: v.string(),
  }),
  recipientName: v.string(),
  roundState: v.union(
    v.literal("draft"),
    v.literal("open"),
    v.literal("closed"),
    v.literal("cancelled")
  ),
  sessionExpiresAt: v.optional(v.number()),
});

const quoteInvitationExchangeResultValidator = v.union(
  v.object({
    access: quoteInvitationAccessProjectionValidator,
    sessionExpiresAt: v.number(),
    sessionToken: v.string(),
    status: v.literal("available"),
  }),
  v.object({
    expiresAt: v.number(),
    issuerName: v.string(),
    status: v.literal("expired"),
  }),
  v.object({ status: v.literal("unavailable") })
);

const quoteRecipientProvisionResultValidator = v.object({
  capabilities: v.array(quoteRecipientCapabilityValidator),
  created: v.boolean(),
  email: v.string(),
  name: v.string(),
  profileId: v.id("contractorProfiles"),
  provisioningState: v.union(v.literal("claimed"), v.literal("provisional")),
});

const quoteRecipientClaimResultValidator = v.object({
  invitationId: v.id("quoteRoundInvitations"),
  profileId: v.id("contractorProfiles"),
  status: v.union(v.literal("already_claimed"), v.literal("claimed")),
});

export const exchangeQuoteInvitationAccess = publicMutation
  .input({
    magicToken: v.string(),
    sessionToken: v.optional(v.string()),
  })
  .returns(quoteInvitationExchangeResultValidator)
  .handler(exchangeQuoteInvitationAccessHandler)
  .public();

export const ensureQuoteRoundRecipient = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    displayName: v.optional(v.string()),
    email: v.string(),
    quoteRoundId: v.id("quoteRounds"),
    workosOrganizationId: v.string(),
  })
  .returns(quoteRecipientProvisionResultValidator)
  .handler(ensureQuoteRoundRecipientHandler)
  .public();

export const claimQuoteInvitationProfile = authenticatedMutation
  .input({ sessionToken: v.string() })
  .returns(quoteRecipientClaimResultValidator)
  .handler(claimQuoteInvitationProfileHandler)
  .public();

export const getClaimedQuoteInvitationAccess = authenticatedQuery
  .input({ quoteRoundInvitationId: v.id("quoteRoundInvitations") })
  .returns(v.union(quoteInvitationAccessProjectionValidator, v.null()))
  .handler(getClaimedQuoteInvitationAccessHandler)
  .public();
