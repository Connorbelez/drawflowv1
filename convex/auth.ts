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

function requireWorkosEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    if (process.env.VITEST || process.env.NODE_ENV === "test") {
      return `test_${name}`;
    }
    throw new Error(`${name} is required`);
  }
  return value;
}

export const authKit = new AuthKit<DataModel>(components.workOSAuthKit, {
  apiKey: requireWorkosEnv("WORKOS_API_KEY"),
  clientId: requireWorkosEnv("WORKOS_CLIENT_ID"),
  webhookSecret: requireWorkosEnv("WORKOS_WEBHOOK_SECRET"),
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
});
