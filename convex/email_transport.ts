import { type EmailEvent, Resend, vOnEmailEventArgs } from "@convex-dev/resend";
import { v } from "convex/values";

import { components, internal } from "./_generated/api";
import { internalMutation } from "./fluent";
import type { Id, MutationCtx } from "./types";

const MAX_SAFE_DETAIL_LENGTH = 500;

export interface TransactionalEmailInput {
  brokerageId: Id<"brokerages">;
  html?: string;
  idempotencyKey: string;
  organizationId: string;
  recipientEmail: string;
  relatedEntityId: string;
  relatedEntityType: string;
  replyTo?: string[];
  subject: string;
  text?: string;
}

/**
 * Creates the official Resend component client at call time so environment
 * changes are observed by Convex functions and tests without embedding secrets.
 */
export function resendClient() {
  return new Resend(components.resend, {
    onEmailEvent: internal.email_transport.handleResendEmailEvent,
    testMode: false,
  });
}

/**
 * Enqueue a transactional email from the same mutation that records the
 * triggering domain event. The DrawFlow row and component queue write commit
 * atomically, while the organization-scoped idempotency key prevents a domain
 * retry from creating a second message.
 */
export async function enqueueTransactionalEmail(
  ctx: MutationCtx,
  input: TransactionalEmailInput
) {
  const normalizedInput = normalizeInput(input);
  const existing = await ctx.db
    .query("emailMessages")
    .withIndex("by_organization_and_idempotencyKey", (query) =>
      query
        .eq("organizationId", normalizedInput.organizationId)
        .eq("idempotencyKey", normalizedInput.idempotencyKey)
    )
    .unique();
  if (existing) {
    assertIdempotentReplayMatches(existing, normalizedInput);
    return existing._id;
  }

  const sender = requiredSender();
  const resendEmailId = await resendClient().sendEmail(ctx, {
    from: sender,
    html: normalizedInput.html,
    replyTo: normalizedInput.replyTo,
    subject: normalizedInput.subject,
    text: normalizedInput.text,
    to: normalizedInput.recipientEmail,
  });
  const now = Date.now();
  return await ctx.db.insert("emailMessages", {
    brokerageId: normalizedInput.brokerageId,
    createdAt: now,
    idempotencyKey: normalizedInput.idempotencyKey,
    organizationId: normalizedInput.organizationId,
    recipientEmail: normalizedInput.recipientEmail,
    relatedEntityId: normalizedInput.relatedEntityId,
    relatedEntityType: normalizedInput.relatedEntityType,
    resendEmailId,
    sender,
    status: "queued",
    subject: normalizedInput.subject,
    updatedAt: now,
  });
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
    const duplicate = await ctx.db
      .query("emailDeliveryEvents")
      .withIndex("by_eventFingerprint", (query) =>
        query.eq("eventFingerprint", eventFingerprint)
      )
      .unique();
    if (duplicate) {
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

    if (providerCreatedAt >= (message.providerCreatedAt ?? 0)) {
      const status = statusAfterEvent(message.status, args.event.type);
      await ctx.db.patch(message._id, {
        finalizedAt: isFinalStatus(status) ? providerCreatedAt : undefined,
        lastError: isFailureStatus(status) ? safeDetail : undefined,
        providerCreatedAt,
        status,
        updatedAt: receivedAt,
      });
    }
    return null;
  })
  .internal();

function normalizeInput(input: TransactionalEmailInput) {
  const normalized = {
    ...input,
    idempotencyKey: input.idempotencyKey.trim(),
    organizationId: input.organizationId.trim(),
    recipientEmail: input.recipientEmail.trim().toLowerCase(),
    relatedEntityId: input.relatedEntityId.trim(),
    relatedEntityType: input.relatedEntityType.trim(),
    subject: input.subject.trim(),
  };
  if (
    !(
      normalized.idempotencyKey &&
      normalized.organizationId &&
      normalized.recipientEmail &&
      normalized.relatedEntityId &&
      normalized.relatedEntityType &&
      normalized.subject
    )
  ) {
    throw new Error("Transactional email metadata must not be blank.");
  }
  if (!(normalized.html || normalized.text)) {
    throw new Error("Transactional email requires an HTML or text body.");
  }
  return normalized;
}

function requiredSender() {
  const sender = process.env.RESEND_FROM_EMAIL?.trim();
  if (!sender) {
    throw new Error("RESEND_FROM_EMAIL is not configured.");
  }
  return sender;
}

function assertIdempotentReplayMatches(
  existing: {
    brokerageId: Id<"brokerages">;
    recipientEmail: string;
    relatedEntityId: string;
    relatedEntityType: string;
    subject: string;
  },
  input: ReturnType<typeof normalizeInput>
) {
  if (
    existing.brokerageId !== input.brokerageId ||
    existing.recipientEmail !== input.recipientEmail ||
    existing.relatedEntityId !== input.relatedEntityId ||
    existing.relatedEntityType !== input.relatedEntityType ||
    existing.subject !== input.subject
  ) {
    throw new Error("Email idempotency key was reused with different content.");
  }
}

function parseProviderTimestamp(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Date.now();
}

function statusAfterEvent(
  current:
    | "queued"
    | "sent"
    | "delivered"
    | "delivery_delayed"
    | "bounced"
    | "failed"
    | "complained"
    | "cancelled",
  eventType: EmailEvent["type"]
): typeof current {
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
