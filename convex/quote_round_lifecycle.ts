import { v } from "convex/values";

import {
  administrativeOverrideInputFields,
} from "./administrative_override_policy";
import { authenticatedMutation } from "./authz";
import { publicMutation } from "./fluent";
import {
  acknowledgeClaimedQuoteInvitationPackageRevisionHandler,
  acknowledgeQuoteInvitationPackageRevisionHandler,
  remindQuoteInvitationAccessHandler,
  replaceQuoteRoundInvitationEmailHandler,
  revokeQuoteRoundInvitationHandler,
  rotateQuoteInvitationAccessHandler,
} from "./quote_round_lifecycle/invitation_handlers";
import {
  cancelQuoteRoundHandler,
  closeQuoteRoundHandler,
  reopenQuoteRoundWithRevisionHandler,
} from "./quote_round_lifecycle/round_handlers";

const quoteRoundStateValidator = v.union(
  v.literal("draft"),
  v.literal("open"),
  v.literal("closed"),
  v.literal("cancelled")
);

const republishDeadlinePolicyValidator = v.union(
  v.object({ kind: v.literal("keep") }),
  v.object({
    kind: v.literal("replace"),
    responseDeadline: v.number(),
  })
);

const lifecycleResultValidator = v.object({
  quoteRoundId: v.id("quoteRounds"),
  revision: v.number(),
  state: quoteRoundStateValidator,
  status: v.union(
    v.literal("closed"),
    v.literal("cancelled"),
    v.literal("reopened")
  ),
  packageRevisionId: v.optional(v.id("quotePackageRevisions")),
  packageRevisionNumber: v.optional(v.number()),
  invitationIds: v.optional(v.array(v.id("quoteRoundInvitations"))),
  responseDeadline: v.optional(v.number()),
});

const invitationLifecycleResultValidator = v.object({
  cooldownUntil: v.optional(v.number()),
  invitationId: v.id("quoteRoundInvitations"),
  status: v.union(
    v.literal("revoked"),
    v.literal("replaced"),
    v.literal("reminded"),
    v.literal("rotated"),
    v.literal("preview")
  ),
  replacementInvitationId: v.optional(v.id("quoteRoundInvitations")),
  accessGeneration: v.optional(v.number()),
  credentialId: v.optional(v.id("quoteInvitationAccessCredentials")),
});

const acknowledgementResultValidator = v.object({
  invitationId: v.id("quoteRoundInvitations"),
  quotePackageRevisionId: v.id("quotePackageRevisions"),
  acknowledgedFieldKeys: v.array(v.string()),
  status: v.literal("acknowledged"),
});

export const closeQuoteRound = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    confirmed: v.boolean(),
    expectedRevision: v.number(),
    quoteRoundId: v.id("quoteRounds"),
    reason: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(lifecycleResultValidator)
  .handler(closeQuoteRoundHandler)
  .public();

export const cancelQuoteRound = authenticatedMutation
  .input({
    buildId: v.id("activeBuilds"),
    confirmed: v.boolean(),
    expectedRevision: v.number(),
    quoteRoundId: v.id("quoteRounds"),
    reason: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(lifecycleResultValidator)
  .handler(cancelQuoteRoundHandler)
  .public();

export const reopenQuoteRoundWithRevision = authenticatedMutation
  .input({
    ...administrativeOverrideInputFields,
    buildId: v.id("activeBuilds"),
    changedFieldKeys: v.optional(v.array(v.string())),
    confirmed: v.boolean(),
    deadlinePolicy: republishDeadlinePolicyValidator,
    expectedRevision: v.number(),
    quoteRoundId: v.id("quoteRounds"),
    reason: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(lifecycleResultValidator)
  .handler(reopenQuoteRoundWithRevisionHandler)
  .public();

export const revokeQuoteRoundInvitation = authenticatedMutation
  .input({
    ...administrativeOverrideInputFields,
    buildId: v.id("activeBuilds"),
    confirmed: v.boolean(),
    quoteRoundInvitationId: v.id("quoteRoundInvitations"),
    reason: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(invitationLifecycleResultValidator)
  .handler(revokeQuoteRoundInvitationHandler)
  .public();

export const remindQuoteInvitationAccess = authenticatedMutation
  .input({
    ...administrativeOverrideInputFields,
    buildId: v.id("activeBuilds"),
    confirmed: v.boolean(),
    preview: v.optional(v.boolean()),
    quoteRoundInvitationId: v.id("quoteRoundInvitations"),
    reason: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(invitationLifecycleResultValidator)
  .handler(remindQuoteInvitationAccessHandler)
  .public();

export const rotateQuoteInvitationAccess = authenticatedMutation
  .input({
    ...administrativeOverrideInputFields,
    buildId: v.id("activeBuilds"),
    confirmed: v.boolean(),
    quoteRoundInvitationId: v.id("quoteRoundInvitations"),
    reason: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(invitationLifecycleResultValidator)
  .handler(rotateQuoteInvitationAccessHandler)
  .public();

export const replaceQuoteRoundInvitationEmail = authenticatedMutation
  .input({
    ...administrativeOverrideInputFields,
    buildId: v.id("activeBuilds"),
    confirmed: v.boolean(),
    correctedEmail: v.string(),
    quoteRoundInvitationId: v.id("quoteRoundInvitations"),
    reason: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(invitationLifecycleResultValidator)
  .handler(replaceQuoteRoundInvitationEmailHandler)
  .public();

export const acknowledgeQuoteInvitationPackageRevision = publicMutation
  .input({
    quoteRoundInvitationId: v.id("quoteRoundInvitations"),
    acknowledgedFieldKeys: v.array(v.string()),
    sessionToken: v.string(),
  })
  .returns(acknowledgementResultValidator)
  .handler(acknowledgeQuoteInvitationPackageRevisionHandler)
  .public();

export const acknowledgeClaimedQuoteInvitationPackageRevision =
  authenticatedMutation
    .input({
      quoteRoundInvitationId: v.id("quoteRoundInvitations"),
      acknowledgedFieldKeys: v.array(v.string()),
    })
    .returns(acknowledgementResultValidator)
    .handler(acknowledgeClaimedQuoteInvitationPackageRevisionHandler)
    .public();
