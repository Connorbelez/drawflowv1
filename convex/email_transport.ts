import { type EmailEvent, Resend, vOnEmailEventArgs } from "@convex-dev/resend";
import { ConvexError, v } from "convex/values";

import { components, internal } from "./_generated/api";
import { internalMutation } from "./fluent";
import type { Doc, Id, MutationCtx } from "./types";

const MAX_SAFE_DETAIL_LENGTH = 500;

export type CommunicationIntentKind =
  | "identity_invitation"
  | "cost_document_integrity_action_required"
  | "cost_document_receipt"
  | "quote_invitation_initial"
  | "quote_package_revision"
  | "quote_invitation_rotation"
  | "quote_invitation_recipient_replaced"
  | "quote_invitation_reminder_manual"
  | "quote_invitation_reminder_auto"
  | "quote_invitation_revoked"
  | "quote_round_cancelled"
  | "quote_response_submitted"
  | "quote_response_resubmitted"
  | "quote_response_withdrawn"
  | "lender_portal_approval_required"
  | "lender_portal_proposal_updated_after_decline"
  | "lender_portal_withdrawal"
  | "lender_portal_approval_outcome";

export interface CommunicationIntentInput {
  brokerageId: Id<"brokerages">;
  buildId?: Id<"activeBuilds">;
  idempotencyKey: string;
  kind: CommunicationIntentKind;
  nextAttemptAt?: number;
  organizationId: string;
  payloadSnapshot: string;
  quoteInvitationAccessCredentialId?: Id<"quoteInvitationAccessCredentials">;
  quotePackageRevisionId?: Id<"quotePackageRevisions">;
  quoteRoundId?: Id<"quoteRounds">;
  quoteRoundInvitationId?: Id<"quoteRoundInvitations">;
  recipientEmailSnapshot: string;
  recipientNameSnapshot?: string;
  relatedEntityId: string;
  relatedEntityType: string;
  templateKey: string;
}

/**
 * The application-owned communication outbox. This helper is intentionally
 * mutation-only and performs no provider calls, so the caller can commit the
 * domain transition and its mandatory email intent in one transaction.
 */
export async function enqueueCommunicationIntent(
  ctx: MutationCtx,
  input: CommunicationIntentInput
) {
  const normalized = normalizeIntentInput(input);
  const existing = await ctx.db
    .query("communicationIntents")
    .withIndex("by_organizationId_and_idempotencyKey", (query) =>
      query
        .eq("organizationId", normalized.organizationId)
        .eq("idempotencyKey", normalized.idempotencyKey)
    )
    .unique();
  if (existing) {
    assertIntentReplayMatches(existing, normalized);
    return existing._id;
  }
  const now = Date.now();
  return await ctx.db.insert("communicationIntents", {
    attemptCount: 0,
    brokerageId: normalized.brokerageId,
    buildId: normalized.buildId,
    channel: "email",
    createdAt: now,
    idempotencyKey: normalized.idempotencyKey,
    kind: normalized.kind,
    lastAttemptAt: undefined,
    lastError: undefined,
    lastOutcomeAt: undefined,
    nextAttemptAt: normalized.nextAttemptAt ?? now,
    organizationId: normalized.organizationId,
    payloadSnapshot: normalized.payloadSnapshot,
    providerEmailMessageId: undefined,
    quoteInvitationAccessCredentialId:
      normalized.quoteInvitationAccessCredentialId,
    quotePackageRevisionId: normalized.quotePackageRevisionId,
    quoteRoundId: normalized.quoteRoundId,
    quoteRoundInvitationId: normalized.quoteRoundInvitationId,
    recipientEmailSnapshot: normalized.recipientEmailSnapshot,
    recipientNameSnapshot: normalized.recipientNameSnapshot,
    relatedEntityId: normalized.relatedEntityId,
    relatedEntityType: normalized.relatedEntityType,
    status: "pending",
    templateKey: normalized.templateKey,
    updatedAt: now,
  });
}

/**
 * Creates the official Resend client at call time. The component remains the
 * only provider transport; app-level intent/attempt rows are our durable
 * domain correlation and operational state.
 */
export function resendClient() {
  return new Resend(components.resend, {
    onEmailEvent: internal.email_transport.handleResendEmailEvent,
    testMode: false,
  });
}

export function requiredSender() {
  const sender = process.env.RESEND_FROM_EMAIL?.trim();
  if (!sender) {
    throw new Error("RESEND_FROM_EMAIL is not configured.");
  }
  return sender;
}

/**
 * Derives a reusable invitation bearer token from an opaque application intent
 * identity. The raw value exists only in the dispatcher action's memory; the
 * application stores the SHA-256 verifier on the credential row.
 */
export async function deriveCommunicationSecret(intentId: string) {
  const secret = process.env.COMMUNICATION_TOKEN_SECRET?.trim();
  if (!secret || new TextEncoder().encode(secret).byteLength < 32) {
    throw new Error(
      "COMMUNICATION_TOKEN_SECRET must be configured with at least 32 bytes."
    );
  }
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"]
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`drawflow-communication:v1:${intentId}`)
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export const handleResendEmailEvent = internalMutation
  .input(vOnEmailEventArgs)
  .returns(v.null())
  .handler(async (ctx, args) => {
    const message = await ctx.db
      .query("emailMessages")
      .withIndex("by_resendEmailId", (query) =>
        query.eq("resendEmailId", args.id)
      )
      .unique();
    if (!message) {
      return null;
    }

    const providerCreatedAt = parseProviderTimestamp(args.event.created_at);
    const eventFingerprint = `${args.id}:${args.event.type}:${args.event.created_at}`;
    const duplicateDeliveryEvent = await ctx.db
      .query("emailDeliveryEvents")
      .withIndex("by_eventFingerprint", (query) =>
        query.eq("eventFingerprint", eventFingerprint)
      )
      .unique();
    if (duplicateDeliveryEvent) {
      return null;
    }

    const receivedAt = Date.now();
    const safeDetail = safeEventDetail(args.event);
    await ctx.db.insert("emailDeliveryEvents", {
      brokerageId: message.brokerageId,
      emailMessageId: message._id,
      eventFingerprint,
      eventType: args.event.type,
      organizationId: message.organizationId,
      providerCreatedAt,
      receivedAt,
      resendEmailId: args.id,
      safeDetail,
    });

    const eventPrecedence = providerEventPrecedence(args.event.type);
    const intent = message.communicationIntentId
      ? await ctx.db.get(message.communicationIntentId)
      : null;
    if (intent) {
      const duplicateOutcome = await ctx.db
        .query("communicationOutcomes")
        .withIndex("by_eventFingerprint", (query) =>
          query.eq("eventFingerprint", eventFingerprint)
        )
        .unique();
      if (!duplicateOutcome) {
        await ctx.db.insert("communicationOutcomes", {
          brokerageId: message.brokerageId,
          buildId: intent.buildId,
          communicationAttemptId: message.communicationAttemptId,
          communicationIntentId: intent._id,
          eventFingerprint,
          outcomeType: args.event.type,
          precedence: eventPrecedence,
          providerCreatedAt,
          providerResendEmailId: args.id,
          organizationId: message.organizationId,
          receivedAt,
          safeDetail,
        });
      }
      await applyCommunicationOutcome(ctx, intent, message, {
        eventType: args.event.type,
        providerCreatedAt,
        providerEventPrecedence: eventPrecedence,
        providerResendEmailId: args.id,
        receivedAt,
        safeDetail,
      });
    }
    return null;
  })
  .internal();

export interface CommunicationProviderOutcome {
  eventType: EmailEvent["type"];
  providerCreatedAt: number;
  providerEventPrecedence: number;
  providerResendEmailId: string;
  receivedAt: number;
  safeDetail?: string;
}

async function applyCommunicationOutcome(
  ctx: MutationCtx,
  intent: Doc<"communicationIntents">,
  message: Doc<"emailMessages">,
  outcome: CommunicationProviderOutcome
) {
  const currentProviderAt = message.providerCreatedAt ?? 0;
  const currentPrecedence = providerEventPrecedence(message.providerEventType);
  const newer =
    outcome.providerCreatedAt > currentProviderAt ||
    (outcome.providerCreatedAt === currentProviderAt &&
      outcome.providerEventPrecedence > currentPrecedence);
  if (!newer) {
    return;
  }
  // A terminal provider failure is an immutable delivery fact. A later open,
  // click, sent, or delivered callback cannot rehabilitate the address.
  if (
    isFailureStatus(message.status) &&
    outcome.providerEventPrecedence < currentPrecedence
  ) {
    return;
  }

  const status = statusAfterEvent(message.status, outcome.eventType);
  await ctx.db.patch(message._id, {
    finalizedAt: isFinalStatus(status)
      ? outcome.providerCreatedAt
      : message.finalizedAt,
    lastError: isFailureStatus(status) ? outcome.safeDetail : undefined,
    providerCreatedAt: outcome.providerCreatedAt,
    providerEventType: outcome.eventType,
    status,
    updatedAt: outcome.receivedAt,
  });

  const intentStatus = communicationStatusAfterProvider(status);
  await ctx.db.patch(intent._id, {
    actionRequiredReason:
      intentStatus === "action_required"
        ? (outcome.safeDetail ??
          `Provider reported ${outcome.eventType} for this communication.`)
        : undefined,
    lastError: isFailureStatus(status) ? outcome.safeDetail : undefined,
    lastOutcomeAt: outcome.receivedAt,
    providerEmailMessageId: message._id,
    status: intentStatus,
    updatedAt: outcome.receivedAt,
  });
}

function normalizeIntentInput(input: CommunicationIntentInput) {
  const normalized = {
    ...input,
    idempotencyKey: input.idempotencyKey.trim(),
    organizationId: input.organizationId.trim(),
    payloadSnapshot: input.payloadSnapshot.trim(),
    recipientEmailSnapshot: input.recipientEmailSnapshot.trim().toLowerCase(),
    recipientNameSnapshot: input.recipientNameSnapshot?.trim() || undefined,
    relatedEntityId: input.relatedEntityId.trim(),
    relatedEntityType: input.relatedEntityType.trim(),
    templateKey: input.templateKey.trim(),
  };
  if (
    !(
      normalized.idempotencyKey &&
      normalized.organizationId &&
      normalized.payloadSnapshot &&
      normalized.recipientEmailSnapshot &&
      normalized.relatedEntityId &&
      normalized.relatedEntityType &&
      normalized.templateKey
    )
  ) {
    throw new ConvexError("Communication intent metadata must not be blank.");
  }
  if (normalized.payloadSnapshot.length > 100_000) {
    throw new ConvexError("Communication intent payload is too large.");
  }
  if (normalized.idempotencyKey.length > 256) {
    throw new ConvexError("Communication idempotency key is too long.");
  }
  return normalized;
}

function assertIntentReplayMatches(
  existing: Doc<"communicationIntents">,
  input: ReturnType<typeof normalizeIntentInput>
) {
  if (
    existing.brokerageId !== input.brokerageId ||
    existing.buildId !== input.buildId ||
    existing.kind !== input.kind ||
    existing.templateKey !== input.templateKey ||
    existing.recipientEmailSnapshot !== input.recipientEmailSnapshot ||
    existing.recipientNameSnapshot !== input.recipientNameSnapshot ||
    existing.relatedEntityId !== input.relatedEntityId ||
    existing.relatedEntityType !== input.relatedEntityType ||
    existing.payloadSnapshot !== input.payloadSnapshot ||
    existing.quoteRoundId !== input.quoteRoundId ||
    existing.quoteRoundInvitationId !== input.quoteRoundInvitationId ||
    existing.quotePackageRevisionId !== input.quotePackageRevisionId ||
    existing.quoteInvitationAccessCredentialId !==
      input.quoteInvitationAccessCredentialId
  ) {
    throw new ConvexError(
      "Communication idempotency key was reused with different content."
    );
  }
}

function parseProviderTimestamp(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Date.now();
}

/**
 * Equal provider timestamps use this explicit precedence. Terminal provider
 * failures win over positive delivery facts, and delivery wins over send or
 * delayed status. The value is persisted with every outcome for audits.
 */
export function providerEventPrecedence(
  eventType: EmailEvent["type"] | undefined
) {
  switch (eventType) {
    case "email.bounced":
    case "email.complained":
    case "email.failed":
      return 60;
    case "email.delivered":
      return 50;
    case "email.opened":
    case "email.clicked":
      return 40;
    case "email.sent":
      return 30;
    case "email.delivery_delayed":
      return 20;
    default:
      return 0;
  }
}

function statusAfterEvent(
  current: Doc<"emailMessages">["status"],
  eventType: EmailEvent["type"]
): Doc<"emailMessages">["status"] {
  if (current === "cancelled") {
    return current;
  }
  switch (eventType) {
    case "email.sent":
      return current === "queued" ? "sent" : current;
    case "email.delivered":
    case "email.opened":
    case "email.clicked":
      return "delivered";
    case "email.delivery_delayed":
      return current === "queued" || current === "sent"
        ? "delivery_delayed"
        : current;
    case "email.bounced":
      return "bounced";
    case "email.failed":
      return "failed";
    case "email.complained":
      return "complained";
  }
}

function communicationStatusAfterProvider(
  status: Doc<"emailMessages">["status"]
): Doc<"communicationIntents">["status"] {
  if (status === "delivered") {
    return "delivered";
  }
  if (isFailureStatus(status)) {
    return "action_required";
  }
  return "sent";
}

function safeEventDetail(event: EmailEvent) {
  let detail: string | undefined;
  if (event.type === "email.bounced") {
    detail = event.data.bounce.message;
  } else if (event.type === "email.failed") {
    detail = event.data.failed.reason;
  }
  return detail?.replace(/\s+/g, " ").trim().slice(0, MAX_SAFE_DETAIL_LENGTH);
}

function isFailureStatus(status: string) {
  return status === "bounced" || status === "failed" || status === "complained";
}

function isFinalStatus(status: string) {
  return (
    status === "delivered" ||
    status === "bounced" ||
    status === "failed" ||
    status === "complained" ||
    status === "cancelled"
  );
}
