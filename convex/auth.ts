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

// biome-ignore lint/suspicious/noExplicitAny: AuthKit's event helper has a keyed generic API with no catch-all handler.
async function handleWorkosEvent(ctx: any, event: any) {
  await processWorkosEvent(ctx, event);
}

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
  "authentication.email_verification_succeeded": handleWorkosEvent,
  "authentication.magic_auth_failed": handleWorkosEvent,
  "authentication.magic_auth_succeeded": handleWorkosEvent,
  "authentication.mfa_succeeded": handleWorkosEvent,
  "authentication.oauth_failed": handleWorkosEvent,
  "authentication.oauth_succeeded": handleWorkosEvent,
  "authentication.passkey_failed": handleWorkosEvent,
  "authentication.passkey_succeeded": handleWorkosEvent,
  "authentication.password_failed": handleWorkosEvent,
  "authentication.password_succeeded": handleWorkosEvent,
  "authentication.radar_risk_detected": handleWorkosEvent,
  "authentication.sso_failed": handleWorkosEvent,
  "authentication.sso_succeeded": handleWorkosEvent,
  "invitation.accepted": handleWorkosEvent,
  "invitation.created": handleWorkosEvent,
  "invitation.revoked": handleWorkosEvent,
  "invitation.resent": handleWorkosEvent,
  "organization.created": handleWorkosEvent,
  "organization.deleted": handleWorkosEvent,
  "organization.updated": handleWorkosEvent,
  "organization_domain.created": handleWorkosEvent,
  "organization_domain.deleted": handleWorkosEvent,
  "organization_domain.updated": handleWorkosEvent,
  "organization_domain.verification_failed": handleWorkosEvent,
  "organization_domain.verified": handleWorkosEvent,
  "organization_membership.created": handleWorkosEvent,
  "organization_membership.deleted": handleWorkosEvent,
  "organization_membership.updated": handleWorkosEvent,
  "organization_role.created": handleWorkosEvent,
  "organization_role.deleted": handleWorkosEvent,
  "organization_role.updated": handleWorkosEvent,
  "permission.created": handleWorkosEvent,
  "permission.deleted": handleWorkosEvent,
  "permission.updated": handleWorkosEvent,
  "role.created": handleWorkosEvent,
  "role.deleted": handleWorkosEvent,
  "role.updated": handleWorkosEvent,
  "session.created": handleWorkosEvent,
  "session.revoked": handleWorkosEvent,
  "user.created": handleWorkosEvent,
  "user.deleted": handleWorkosEvent,
  "user.updated": handleWorkosEvent,
});
