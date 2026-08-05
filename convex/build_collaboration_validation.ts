import { ConvexError } from "convex/values";

export const BUILD_COLLABORATION_VALIDATION_ERROR =
  "BUILD_COLLABORATION_VALIDATION_ERROR";

export function buildCollaborationValidationError(message: string) {
  return new ConvexError({
    code: BUILD_COLLABORATION_VALIDATION_ERROR,
    message,
  });
}

export function isBuildCollaborationValidationError(error: unknown) {
  const data =
    error instanceof ConvexError
      ? error.data
      : error && typeof error === "object" && "data" in error
        ? (error as { data?: unknown }).data
        : undefined;
  return (
    Boolean(data) &&
    typeof data === "object" &&
    (data as { code?: unknown }).code === BUILD_COLLABORATION_VALIDATION_ERROR
  );
}
