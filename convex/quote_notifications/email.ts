import { ConvexError, v } from "convex/values";
import { Resend as ResendApi } from "resend";

import { internal } from "../_generated/api";
import { authorizeActiveBuildAccess } from "../activeBuildAccess";
import {
  administrativeOverrideInputFields,
  appendGovernedAuditEvent,
  requiredAdministrativeReason,
} from "../administrative_override_policy";
import { authenticatedMutation } from "../authz";
import { isOrganizationInRestrictedArchive } from "../data_retention";
import {
  deriveCommunicationSecret,
  enqueueCommunicationIntent,
  requiredSender,
  resendClient,
} from "../email_transport";
import {
  identityInvitationLandingUrl,
  identityInvitationSubject,
  renderIdentityInvitationEmail,
} from "../identity_invitation_emails";
import { internalAction, internalMutation, internalQuery } from "../fluent";
import { authorizeQuoteAdministrativeRecovery } from "../quote_authoring_access";
import {
  createInitialQuoteInvitationCredentialAndDispatch,
  defaultQuoteInvitationAccessExpiry,
  quoteInvitationUrl,
  resolveInvitationScope,
} from "../quote_invitation_access";
import { lenderPortalCommunicationSuppressionReason } from "../lender_portal_notifications";
import {
  lenderPortalDeliveryReleaseAccessRevision,
  lenderPortalDeliveryReleaseDecision,
  lenderPortalDeliveryReleaseReason,
  LENDER_PORTAL_RELEASE_PAUSED_REASON,
} from "../lender_portal_release";
import type { Doc, Id, MutationCtx, QueryCtx } from "../types";

import {
  MAX_INVITATIONS_PER_ROUND,
  PERMANENT_DISPATCH_ERROR_PATTERN,
  RETRYABLE_DISPATCH_ERROR_PATTERN,
} from "./contracts";

export function isReminderRoundEligible(
  round: Doc<"quoteRounds"> | null,
  now: number
): round is Doc<"quoteRounds"> {
  return Boolean(round && round.state === "open" && round.updatedAt <= now);
}

export function quoteReminderStage(responseDeadline: number, now: number) {
  const remaining = responseDeadline - now;
  if (remaining <= 24 * 60 * 60 * 1000) {
    return "24h" as const;
  }
  if (remaining <= 72 * 60 * 60 * 1000) {
    return "72h" as const;
  }
  return;
}

export async function activeReminderInvitations(
  ctx: MutationCtx,
  round: Doc<"quoteRounds">
) {
  const invitations = await ctx.db
    .query("quoteRoundInvitations")
    .withIndex("by_quoteRoundId_and_participationState", (query) =>
      query.eq("quoteRoundId", round._id).eq("participationState", "active")
    )
    .take(MAX_INVITATIONS_PER_ROUND + 1);
  if (invitations.length <= MAX_INVITATIONS_PER_ROUND) {
    return invitations;
  }
  console.error(
    "Skipping reminder sweep for Quote Round with too many active Invitations.",
    { quoteRoundId: round._id }
  );
  return;
}

export async function suppressCommunicationIntent(
  ctx: MutationCtx,
  intentId: Id<"communicationIntents">,
  reason: string,
  now: number
) {
  const intent = await ctx.db.get(intentId);
  if (!intent) {
    return;
  }
  const eventFingerprint = `suppressed:${intent._id}`;
  const existingOutcome = await ctx.db
    .query("communicationOutcomes")
    .withIndex("by_eventFingerprint", (query) =>
      query.eq("eventFingerprint", eventFingerprint)
    )
    .unique();
  if (existingOutcome) {
    return;
  }
  await ctx.db.patch(intent._id, {
    lastOutcomeAt: now,
    nextAttemptAt: now + 24 * 60 * 60 * 1000,
    status: "suppressed",
    suppressionReason: reason,
    updatedAt: now,
  });
  await ctx.db.insert("communicationOutcomes", {
    brokerageId: intent.brokerageId,
    buildId: intent.buildId,
    communicationIntentId: intent._id,
    eventFingerprint,
    outcomeType: "dispatch_suppressed",
    precedence: 20,
    providerCreatedAt: now,
    organizationId: intent.organizationId,
    receivedAt: now,
    safeDetail: reason,
  });
}

export async function nextCredentialVersionForNotification(
  ctx: MutationCtx,
  invitationId: Id<"quoteRoundInvitations">
) {
  const latest = await ctx.db
    .query("quoteInvitationAccessCredentials")
    .withIndex("by_quoteRoundInvitationId_and_credentialVersion", (query) =>
      query.eq("quoteRoundInvitationId", invitationId)
    )
    .order("desc")
    .first();
  return (latest?.credentialVersion ?? 0) + 1;
}

export async function renderCommunicationEmail(work: {
  intentId: Id<"communicationIntents">;
  kind: string;
  payloadSnapshot: string;
  recipientEmailSnapshot: string;
  recipientNameSnapshot?: string;
  templateKey: string;
}) {
  const payload = parsePayload(work.payloadSnapshot);
  const sender = requiredSender();
  const recipientName = work.recipientNameSnapshot?.trim() || "there";
  if (work.kind === "identity_invitation") {
    const roleSlug = String(payload.roleSlug ?? "");
    const workosInvitationId = String(payload.workosInvitationId ?? "");
    const invitationUrl = identityInvitationLandingUrl(workosInvitationId);
    return {
      ...renderIdentityInvitationEmail({
        invitationUrl,
        recipientName: work.recipientNameSnapshot,
        roleSlug,
      }),
      sender,
    };
  }
  if (work.templateKey.startsWith("lender_portal_")) {
    const linkPath = String(payload.linkPath ?? "");
    // Validate the immutable destination, but send recipients through the
    // authenticated link-open boundary. The intent ID identifies the record;
    // it never grants access by itself.
    lenderPortalPublicUrl(linkPath);
    const link = lenderPortalPublicUrl(
      `/notifications/${String(work.intentId)}`,
    );
    const subject = lenderPortalSubject(payload);
    const body = lenderPortalBody(payload);
    const text = `Hello ${recipientName},\n\n${body}\n\nOpen DrawFlow: ${link}`;
    return {
      html: `<p>Hello ${escapeHtml(recipientName)},</p><p>${escapeHtml(body)}</p><p><a href="${escapeHtml(link)}">Open DrawFlow</a></p>`,
      sender,
      subject,
      text,
    };
  }
  if (work.templateKey.startsWith("quote_invitation")) {
    const accessLinkAllowed = !(
      work.templateKey === "quote_invitation_revoked" ||
      work.templateKey === "quote_invitation_cancelled"
    );
    const invitationUrl = accessLinkAllowed
      ? quoteInvitationUrl(
          await deriveCommunicationSecret(String(work.intentId))
        )
      : undefined;
    const subject =
      work.templateKey === "quote_invitation_cancelled"
        ? "Quote request cancelled"
        : work.templateKey === "quote_invitation_revoked"
          ? "Quote invitation access revoked"
          : work.templateKey === "quote_invitation_rotation"
            ? "Quote invitation access link replaced"
            : "DrawFlow Quote Package update";
    const body = quoteInvitationBody(work.templateKey, payload);
    const text = invitationUrl
      ? `Hello ${recipientName},\n\n${body}\n\nOpen your secure invitation: ${invitationUrl}`
      : `Hello ${recipientName},\n\n${body}`;
    return {
      html: invitationUrl
        ? `<p>Hello ${escapeHtml(recipientName)},</p><p>${escapeHtml(body)}</p><p><a href="${escapeHtml(invitationUrl)}">Open your secure invitation</a></p>`
        : `<p>Hello ${escapeHtml(recipientName)},</p><p>${escapeHtml(body)}</p>`,
      sender,
      subject,
      text,
    };
  }
  const subject = subjectForIntentPayload(work.templateKey, payload);
  const body = bodyForIntentPayload(work.templateKey, payload, recipientName);
  return {
    html: `<p>${escapeHtml(body).replace(/\n/g, "<br />")}</p>`,
    sender,
    subject,
    text: body,
  };
}

function parsePayload(value: string) {
  try {
    const payload = JSON.parse(value) as unknown;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("payload is not an object");
    }
    return payload as Record<string, unknown>;
  } catch {
    throw new Error("Communication intent payload is invalid.");
  }
}

function quoteInvitationBody(
  templateKey: string,
  payload: Record<string, unknown>
) {
  if (templateKey === "quote_invitation_revision") {
    return `The Quote Package was updated. Review the current revision before responding (deadline ${formatDeadline(payload.responseDeadline, "updated")}).`;
  }
  if (templateKey === "quote_invitation_reminder") {
    return `This is a reminder to review the current Quote Package before its response deadline (${formatDeadline(payload.responseDeadline, "upcoming")}).`;
  }
  if (templateKey === "quote_invitation_revoked") {
    return "Your Quote Invitation access has been revoked.";
  }
  if (templateKey === "quote_invitation_cancelled") {
    return "This Quote Round has been cancelled.";
  }
  if (templateKey === "quote_invitation_replaced") {
    return "Your corrected Quote Invitation is ready to review.";
  }
  if (templateKey === "quote_invitation_rotation") {
    return "A new Quote Invitation access link was issued. Your previous link is no longer valid.";
  }
  return "You have been invited to review a private DrawFlow Quote Package.";
}

function formatDeadline(value: unknown, fallback: string) {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return fallback;
  }
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Toronto",
  }).format(new Date(timestamp));
}

export function subjectForIntent(intent: Doc<"communicationIntents">) {
  return subjectForIntentPayload(
    intent.templateKey,
    parsePayload(intent.payloadSnapshot)
  );
}

function subjectForIntentPayload(
  templateKey: string,
  payload: Record<string, unknown>
) {
  if (templateKey.startsWith("identity_invitation_")) {
    return identityInvitationSubject(String(payload.roleSlug ?? ""));
  }
  if (templateKey.startsWith("lender_portal_")) {
    return lenderPortalSubject(payload);
  }
  if (templateKey === "cost_document_integrity_action_required_v1") {
    return `Action required: ${String(payload.title ?? "Cost Document integrity")}`;
  }
  if (templateKey === "cost_document_upload_receipt_v1") {
    return `Cost Document submitted: ${String(payload.title ?? "receipt")}`;
  }
  if (templateKey === "quote_response") {
    return `Quote response ${String(payload.event ?? "updated")}`;
  }
  if (templateKey === "quote_invitation_cancelled") {
    return "Quote request cancelled";
  }
  if (templateKey === "quote_invitation_revoked") {
    return "Quote invitation access revoked";
  }
  if (templateKey === "quote_invitation_rotation") {
    return "Quote invitation access link replaced";
  }
  return "DrawFlow Quote Package update";
}

function lenderPortalSubject(payload: Record<string, unknown>) {
  const title = String(payload.title ?? "DrawFlow review");
  switch (payload.eventClass) {
    case "approval-required":
      return `Action required: ${title}`;
    case "proposal-updated-after-decline":
      return `Proposal updated: ${title}`;
    case "withdrawal":
      return `Lender assignment withdrawn: ${title}`;
    case "approval-outcome":
      return payload.outcome === "approved"
        ? `Review approved: ${title}`
        : `Review needs revision: ${title}`;
    default:
      throw new Error("Unsupported lender portal notification event.");
  }
}

function lenderPortalBody(payload: Record<string, unknown>) {
  switch (payload.eventClass) {
    case "approval-required":
      return "A current DrawFlow approval group requires your review.";
    case "proposal-updated-after-decline":
      return "The proposal has a new revision and a new full confirmation cycle ready for review.";
    case "withdrawal":
      return "The lender assignment was withdrawn. The retained proposal record is read-only.";
    case "approval-outcome":
      return payload.outcome === "approved"
        ? "The current review cycle was approved."
        : "The current review cycle needs revision. Open DrawFlow for the information available to your role.";
    default:
      throw new Error("Unsupported lender portal notification event.");
  }
}

function lenderPortalPublicUrl(linkPath: string) {
  if (!linkPath.startsWith("/") || linkPath.startsWith("//")) {
    throw new Error("Lender portal notification link is invalid.");
  }
  const configuredOrigin = (process.env.DRAWFLOW_APP_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .find(Boolean);
  if (!configuredOrigin) {
    throw new Error("DRAWFLOW_APP_ORIGINS is not configured.");
  }
  const origin = new URL(configuredOrigin);
  if (
    origin.protocol !== "https:" &&
    origin.hostname !== "localhost" &&
    origin.hostname !== "127.0.0.1"
  ) {
    throw new Error("DrawFlow application origin must use HTTPS.");
  }
  return new URL(linkPath, origin).toString();
}

function bodyForIntentPayload(
  templateKey: string,
  payload: Record<string, unknown>,
  recipientName: string
) {
  if (templateKey === "cost_document_integrity_action_required_v1") {
    return `Hello ${recipientName},\n\nDrawFlow could not verify a source page for “${String(payload.title ?? "Cost Document")}”. The recorded integrity state is ${String(payload.kind ?? "unavailable")}. Review the Cost Document before relying on it.`;
  }
  if (templateKey === "cost_document_upload_receipt_v1") {
    const disclosure = payload.supportingContextDisclosure
      ? `\n\n${String(payload.supportingContextDisclosure)}`
      : "";
    return `Hello ${recipientName},\n\n${String(payload.kind ?? "Cost Document")} “${String(payload.title ?? "document")}” was submitted for ${formatCad(Number(payload.grossTotalCents ?? 0))} CAD.\n\nThis is a durable DrawFlow submission receipt.${disclosure}`;
  }
  if (templateKey === "quote_response") {
    return `Hello ${recipientName},\n\nA Quote response was ${String(payload.event ?? "updated")} for the current package.`;
  }
  return `Hello ${recipientName},\n\nDrawFlow recorded an update for your Quote request.`;
}

function formatCad(cents: number) {
  return (Number.isFinite(cents) ? cents / 100 : 0).toLocaleString("en-CA", {
    currency: "CAD",
    style: "currency",
  });
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "'":
        return "&#39;";
      case '"':
        return "&quot;";
      default:
        return character;
    }
  });
}

export function normalizeError(error: unknown) {
  const value = error instanceof Error ? error.message : String(error);
  return (
    value.replace(/\s+/g, " ").trim().slice(0, 500) || "Email dispatch failed."
  );
}

export async function cancelCommunicationForRestrictedArchive(
  ctx: MutationCtx,
  intent: Doc<"communicationIntents">,
  attempt: Doc<"communicationAttempts"> | null,
  now: number
) {
  const reason =
    "Communication dispatch cancelled because the organization is in restricted archive.";
  if (attempt?.state === "claimed") {
    await ctx.db.patch(attempt._id, {
      finishedAt: now,
      safeError: reason,
      state: "abandoned",
      updatedAt: now,
    });
  }
  await ctx.db.patch(intent._id, {
    actionRequiredReason: undefined,
    lastError: undefined,
    lastOutcomeAt: now,
    nextAttemptAt: now + 24 * 60 * 60 * 1000,
    status: "cancelled",
    suppressionReason: reason,
    updatedAt: now,
  });
  const eventFingerprint = `restricted-archive-dispatch-suppressed:${intent._id}`;
  const existing = await ctx.db
    .query("communicationOutcomes")
    .withIndex("by_eventFingerprint", (query) =>
      query.eq("eventFingerprint", eventFingerprint)
    )
    .unique();
  if (!existing) {
    await ctx.db.insert("communicationOutcomes", {
      brokerageId: intent.brokerageId,
      buildId: intent.buildId,
      communicationAttemptId: attempt?._id,
      communicationIntentId: intent._id,
      eventFingerprint,
      organizationId: intent.organizationId,
      outcomeType: "dispatch_suppressed",
      precedence: 100,
      providerCreatedAt: now,
      receivedAt: now,
      safeDetail: reason,
    });
  }
}

export async function pauseClaimedLenderPortalIntentForReleaseControl(
  ctx: MutationCtx,
  intent: Doc<"communicationIntents">,
  attempt: Doc<"communicationAttempts"> | null,
  reason: string,
  releaseAccessRevision: number,
  now: number
) {
  if (!intent.kind.startsWith("lender_portal_")) return;
  if (attempt?.state === "claimed") {
    await ctx.db.patch(attempt._id, {
      finishedAt: now,
      safeError: reason,
      state: "abandoned",
      updatedAt: now,
    });
  }
  if (intent.status === "dispatching") {
    await ctx.db.patch(intent._id, {
      // The attempt remains durable and terminal. The same intent and provider
      // idempotency key resume after enablement; no duplicate intent is made.
      nextAttemptAt: now,
      status:
        attempt?.claimedFromStatus === "retry_scheduled"
          ? "retry_scheduled"
          : "pending",
      suppressionReason:
        reason === LENDER_PORTAL_RELEASE_PAUSED_REASON ? reason : undefined,
      updatedAt: now,
    });
  }
  const eventFingerprint = `release-gate-paused:${String(intent._id)}:${String(
    attempt?._id ?? "unclaimed"
  )}:${releaseAccessRevision}:${reason}`;
  const existingOutcome = await ctx.db
    .query("communicationOutcomes")
    .withIndex("by_eventFingerprint", (query) =>
      query.eq("eventFingerprint", eventFingerprint)
    )
    .unique();
  if (!existingOutcome) {
    await ctx.db.insert("communicationOutcomes", {
      brokerageId: intent.brokerageId,
      buildId: intent.buildId,
      communicationAttemptId: attempt?._id,
      communicationIntentId: intent._id,
      eventFingerprint,
      organizationId: intent.organizationId,
      outcomeType: "dispatch_suppressed",
      precedence: 90,
      providerCreatedAt: now,
      receivedAt: now,
      safeDetail: `${reason} Release revision ${releaseAccessRevision}.`,
    });
  }
}

export function isRetryableDispatchError(message: string) {
  if (RETRYABLE_DISPATCH_ERROR_PATTERN.test(message)) {
    return true;
  }
  return !PERMANENT_DISPATCH_ERROR_PATTERN.test(message);
}
