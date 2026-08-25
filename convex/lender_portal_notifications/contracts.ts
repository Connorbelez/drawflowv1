import { v } from "convex/values";
import { FAIRLEND_WORKOS_ORGANIZATION_ID } from "../fairLendConfig";
import { authenticatedQuery } from "../fluent";
import { activeWorkosRecipient } from "./enqueue";
import { lenderPortalCommunicationSuppressionReason } from "./suppression";
import {
  isExpectedNotificationLinkPath,
  LENDER_PORTAL_NOTIFICATION_EVENT_CLASSES,
  notificationLinkUnavailable,
  parseLenderPortalPayload,
  resolveViewerWorkosUserId,
} from "./shared";

export const authorizeLenderPortalNotificationLink = authenticatedQuery
  .input({
    intentId: v.id("communicationIntents"),
    workosOrganizationId: v.string(),
  })
  .returns(
    v.object({
      audience: v.union(
        v.literal("backoffice"),
        v.literal("builder"),
        v.literal("lender")
      ),
      eventClass: v.union(
        v.literal("approval-required"),
        v.literal("proposal-updated-after-decline"),
        v.literal("withdrawal"),
        v.literal("approval-outcome")
      ),
      linkPath: v.string(),
      readOnly: v.boolean(),
    })
  )
  .handler(async (ctx, args) => {
    const intent = await ctx.db.get(args.intentId);
    if (!intent?.kind.startsWith("lender_portal_")) {
      throw notificationLinkUnavailable();
    }
    const payload = parseLenderPortalPayload(intent.payloadSnapshot);
    if (!isExpectedNotificationLinkPath(payload)) {
      throw notificationLinkUnavailable();
    }
    const viewerWorkosUserId = await resolveViewerWorkosUserId(
      ctx,
      ctx.viewer.subject
    );
    if (payload.recipientWorkosUserId !== viewerWorkosUserId) {
      throw notificationLinkUnavailable();
    }
    const expectedWorkosOrganizationId =
      payload.audience === "lender"
        ? FAIRLEND_WORKOS_ORGANIZATION_ID
        : intent.organizationId;
    if (args.workosOrganizationId !== expectedWorkosOrganizationId) {
      throw notificationLinkUnavailable();
    }
    const viewer = await activeWorkosRecipient(
      ctx,
      viewerWorkosUserId,
      args.workosOrganizationId
    );
    if (!viewer) {
      throw notificationLinkUnavailable();
    }
    const suppressionReason = await lenderPortalCommunicationSuppressionReason(
      ctx,
      intent,
      {
        requireRecipientEmailMatch: false,
      }
    );
    if (suppressionReason) {
      throw notificationLinkUnavailable();
    }
    return {
      audience: payload.audience,
      eventClass: payload.eventClass,
      linkPath: payload.linkPath,
      readOnly: payload.eventClass === "withdrawal",
    };
  })
  .public();

export {
  LENDER_PORTAL_NOTIFICATION_EVENT_CLASSES,
} from "./shared";
export type { LenderPortalNotificationEventClass } from "./shared";
