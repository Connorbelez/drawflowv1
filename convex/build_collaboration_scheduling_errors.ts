import { ConvexError } from "convex/values";

const MATERIAL_CONFLICT_CODE = "BUILD_COLLABORATION_SCHEDULE_MATERIAL_CONFLICT";
const OPERATIONAL_FAILURE_CODE =
  "BUILD_COLLABORATION_SCHEDULE_OPERATIONAL_FAILURE";

interface ScheduledPublicationErrorData {
  code: typeof MATERIAL_CONFLICT_CODE | typeof OPERATIONAL_FAILURE_CODE;
  message: string;
}

export function scheduledPublicationMaterialConflict(error: unknown) {
  return new ConvexError<ScheduledPublicationErrorData>({
    code: MATERIAL_CONFLICT_CODE,
    message: scheduledPublicationErrorMessage(error),
  });
}

export function scheduledPublicationOperationalFailure(message: string) {
  return new ConvexError<ScheduledPublicationErrorData>({
    code: OPERATIONAL_FAILURE_CODE,
    message: normalizeMessage(message),
  });
}

export function classifyScheduledPublicationFailure(error: unknown): {
  kind: "conflict" | "retryable";
  message: string;
} {
  const data = scheduledPublicationErrorData(error);
  if (data?.code === OPERATIONAL_FAILURE_CODE) {
    return { kind: "retryable", message: normalizeMessage(data.message) };
  }
  if (data?.code === MATERIAL_CONFLICT_CODE) {
    return { kind: "conflict", message: normalizeMessage(data.message) };
  }
  // Unknown failures fail closed. Only an explicitly typed operational error
  // is eligible for automatic retry; deterministic validation must never loop.
  return {
    kind: "conflict",
    message: scheduledPublicationErrorMessage(error),
  };
}

function scheduledPublicationErrorData(
  error: unknown
): ScheduledPublicationErrorData | null {
  const data =
    error instanceof ConvexError
      ? error.data
      : error && typeof error === "object" && "data" in error
        ? (error as { data?: unknown }).data
        : undefined;
  if (!data || typeof data !== "object") {
    return null;
  }
  const candidate = data as Record<string, unknown>;
  if (
    (candidate.code !== MATERIAL_CONFLICT_CODE &&
      candidate.code !== OPERATIONAL_FAILURE_CODE) ||
    typeof candidate.message !== "string"
  ) {
    return null;
  }
  return candidate as ScheduledPublicationErrorData;
}

function scheduledPublicationErrorMessage(error: unknown) {
  const data = scheduledPublicationErrorData(error);
  if (data) {
    return normalizeMessage(data.message);
  }
  return normalizeMessage(
    error instanceof Error
      ? error.message
      : "Scheduled publication revalidation failed."
  );
}

function normalizeMessage(value: string) {
  return (
    value.trim().slice(0, 500) || "Scheduled publication revalidation failed."
  );
}
