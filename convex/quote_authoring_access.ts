import { ConvexError } from "convex/values";

import {
  type ActiveBuildAuthorization,
  selectActiveBuildAuthorizationCapacity,
} from "./activeBuildAccess";
import { authorizeAdministrativeRecovery } from "./administrative_override_policy";
import type { AuthorizedViewer } from "./authz";
import type { MutationCtx } from "./types";

export const QUOTE_AUTHORING_ROLES = [
  "admin",
  "principle-broker",
  "builder",
  "builder-staff",
] as const;

export function hasQuoteAuthoringRole(roles: readonly string[]) {
  return roles.some((role) =>
    (QUOTE_AUTHORING_ROLES as readonly string[]).includes(role)
  );
}

export function assertQuoteAuthoringRole(roles: readonly string[]) {
  if (!hasQuoteAuthoringRole(roles)) {
    throw new ConvexError(
      "Forbidden: only Builder, Builder Staff, Admin, or Principle Broker may author Quote Rounds."
    );
  }
}

/**
 * Quote operations treat Principle Broker as an ordinary authoring capacity,
 * without widening the platform-wide administrative break-glass policy.
 */
export async function authorizeQuoteAdministrativeRecovery(
  ctx: MutationCtx & { viewer: AuthorizedViewer },
  baseAuthorization: ActiveBuildAuthorization,
  input: {
    administrativeCapacity?: "builder" | "builder-staff" | "admin";
    breakGlassConfirmed?: boolean;
    reason: string;
  }
) {
  const standardCapacityAvailable = Boolean(
    input.administrativeCapacity ||
      baseAuthorization.roles.some((role) =>
        ["builder", "builder-staff", "admin"].includes(role)
      )
  );
  if (
    !standardCapacityAvailable &&
    baseAuthorization.roles.includes("principle-broker")
  ) {
    if (input.breakGlassConfirmed === true) {
      throw new ConvexError(
        "Break-glass confirmation is valid only for Brokerage Admin recovery."
      );
    }
    return {
      authorization: selectActiveBuildAuthorizationCapacity(
        baseAuthorization,
        "principle-broker"
      ),
      breakGlass: false,
    };
  }
  return await authorizeAdministrativeRecovery(ctx, baseAuthorization, input);
}
