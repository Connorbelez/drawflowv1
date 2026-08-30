import { ConvexError } from "convex/values";

import type { ActiveBuildAuthorization } from "../activeBuildAccess";

export function requireRetentionAdmin(authorization: ActiveBuildAuthorization) {
  if (
    authorization.effectiveRole.role !== "admin" &&
    authorization.effectiveRole.role !== "principle-broker"
  ) {
    throw new ConvexError(
      "Only an Admin or Principal Broker may change retention state."
    );
  }
}
export function assertExtensionDays(value: number) {
  if (!Number.isInteger(value) || value < 0 || value > 3650) {
    throw new ConvexError(
      "Tenant retention extension must be an integer from 0 to 3,650 days."
    );
  }
}

export function requiredText(value: string, label: string, maximum: number) {
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) {
    throw new ConvexError(
      `${label} is required and must be ${maximum} characters or fewer.`
    );
  }
  return normalized;
}

export function boundedJson(value: string, label = "Retention correction history") {
  const normalized = value.trim();
  if (normalized.length > 100_000) {
    throw new ConvexError(`${label} is too large.`);
  }
  if (!normalized) {
    return "{}";
  }
  try {
    JSON.parse(normalized);
  } catch {
    throw new ConvexError(`${label} must be valid JSON.`);
  }
  return normalized;
}

export function boundedError(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Unknown retention fan-out error.";
  return message.slice(0, 1000);
}
