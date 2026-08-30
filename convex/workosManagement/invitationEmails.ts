import { v } from "convex/values";

import { enqueueCommunicationIntent } from "../email_transport";
import { internalMutation } from "../fluent";
import {
  identityInvitationPayload,
  identityInvitationPersonaForRole,
  identityInvitationTemplateKey,
} from "../identity_invitation_emails";
import type { Id, MutationCtx } from "../types";

export interface IdentityInvitationEmailInput {
  brokerageId: Id<"brokerages">;
  email: string;
  organizationId: string;
  recipientName?: string;
  relatedEntityId?: string;
  relatedEntityType?: string;
  roleSlug: string;
  workosInvitationId: string;
}

export async function queueIdentityInvitationEmail(
  ctx: MutationCtx,
  input: IdentityInvitationEmailInput
) {
  const email = input.email.trim().toLowerCase();
  if (!email?.includes("@")) {
    throw new Error("A valid invitation email is required.");
  }
  const workosInvitationId = input.workosInvitationId.trim();
  if (!workosInvitationId) {
    throw new Error("WorkOS invitation ID is required.");
  }
  const persona = identityInvitationPersonaForRole(input.roleSlug);
  const relatedEntityId = input.relatedEntityId?.trim() || workosInvitationId;
  const relatedEntityType =
    input.relatedEntityType?.trim() || "workosInvitation";
  const idempotencyKey = input.relatedEntityId?.trim()
    ? `identity-invitation:${workosInvitationId}:${relatedEntityType}:${relatedEntityId}`
    : `identity-invitation:${workosInvitationId}`;
  const communicationIntentId = await enqueueCommunicationIntent(ctx, {
    brokerageId: input.brokerageId,
    idempotencyKey,
    kind: "identity_invitation",
    organizationId: input.organizationId,
    payloadSnapshot: identityInvitationPayload(
      workosInvitationId,
      input.roleSlug
    ),
    recipientEmailSnapshot: email,
    recipientNameSnapshot: input.recipientName?.trim() || undefined,
    relatedEntityId,
    relatedEntityType,
    templateKey: identityInvitationTemplateKey(persona),
  });

  // A previous onboarding attempt can durably stop at action_required when a
  // local email configuration value was missing. Replaying the same canonical
  // onboarding command is an explicit retry for an invitation that has never
  // produced a provider message; keep the idempotency key and reset only that
  // unsent intent so the worker can render it again.
  const existingIntent = await ctx.db.get(communicationIntentId);
  if (
    existingIntent?.kind === "identity_invitation" &&
    existingIntent.status === "action_required" &&
    !existingIntent.providerEmailMessageId
  ) {
    await ctx.db.patch(communicationIntentId, {
      actionRequiredReason: undefined,
      lastError: undefined,
      nextAttemptAt: Date.now(),
      status: "pending",
      updatedAt: Date.now(),
    });
  }

  return communicationIntentId;
}

export const enqueueIdentityInvitationEmail = internalMutation
  .input({
    brokerageId: v.id("brokerages"),
    email: v.string(),
    organizationId: v.string(),
    recipientName: v.optional(v.string()),
    relatedEntityId: v.optional(v.string()),
    relatedEntityType: v.optional(v.string()),
    roleSlug: v.string(),
    workosInvitationId: v.string(),
  })
  .returns(v.id("communicationIntents"))
  .handler((ctx, args) => queueIdentityInvitationEmail(ctx, args))
  .internal();
