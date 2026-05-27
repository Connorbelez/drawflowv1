import { AuthKit, type AuthFunctions } from "@convex-dev/workos-authkit";

import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { processWorkosEvent } from "./workosProjection";

const additionalEventTypes = [
  "organization_membership.created",
  "organization_membership.updated",
  "organization_membership.deleted",
  "role.created",
  "role.updated",
  "role.deleted",
  "organization_role.created",
  "organization_role.updated",
  "organization_role.deleted",
  "permission.created",
  "permission.updated",
  "permission.deleted",
  "organization.created",
  "organization.updated",
  "organization.deleted",
] as const;

const authFunctions: AuthFunctions = internal.auth;

export const authKit = new AuthKit<DataModel>(components.workOSAuthKit, {
  actionSecret: process.env.WORKOS_ACTION_SECRET ?? "actsec_test_drawflow",
  apiKey: process.env.WORKOS_API_KEY ?? "sk_test_drawflow",
  clientId: process.env.WORKOS_CLIENT_ID ?? "client_test_drawflow",
  webhookSecret: process.env.WORKOS_WEBHOOK_SECRET ?? "whsec_test_drawflow",
  additionalEventTypes: [...additionalEventTypes],
  authFunctions,
});

export const { authKitEvent } = authKit.events({
  "user.created": async (ctx, event) => {
    await processWorkosEvent(ctx, event);
  },
  "user.updated": async (ctx, event) => {
    await processWorkosEvent(ctx, event);
  },
  "user.deleted": async (ctx, event) => {
    await processWorkosEvent(ctx, event);
  },
  "organization_membership.created": async (ctx, event) => {
    await processWorkosEvent(ctx, event);
  },
  "organization_membership.updated": async (ctx, event) => {
    await processWorkosEvent(ctx, event);
  },
  "organization_membership.deleted": async (ctx, event) => {
    await processWorkosEvent(ctx, event);
  },
  "role.created": async (ctx, event) => {
    await processWorkosEvent(ctx, event);
  },
  "role.updated": async (ctx, event) => {
    await processWorkosEvent(ctx, event);
  },
  "role.deleted": async (ctx, event) => {
    await processWorkosEvent(ctx, event);
  },
  "organization_role.created": async (ctx, event) => {
    await processWorkosEvent(ctx, event);
  },
  "organization_role.updated": async (ctx, event) => {
    await processWorkosEvent(ctx, event);
  },
  "organization_role.deleted": async (ctx, event) => {
    await processWorkosEvent(ctx, event);
  },
  "permission.created": async (ctx, event) => {
    await processWorkosEvent(ctx, event);
  },
  "permission.updated": async (ctx, event) => {
    await processWorkosEvent(ctx, event);
  },
  "permission.deleted": async (ctx, event) => {
    await processWorkosEvent(ctx, event);
  },
  "organization.created": async (ctx, event) => {
    await processWorkosEvent(ctx, event);
  },
  "organization.updated": async (ctx, event) => {
    await processWorkosEvent(ctx, event);
  },
  "organization.deleted": async (ctx, event) => {
    await processWorkosEvent(ctx, event);
  },

  // Handle any event type
  "session.created": async (ctx, event) => {
    await processWorkosEvent(ctx, event);
  },
});
