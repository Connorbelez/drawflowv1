import {
  type BuildCollaborationRole,
  normalizeBuildCollaborationRole,
} from "../../../../../convex/build_collaboration_model";

/**
 * Backoffice routes choose the highest backoffice capacity explicitly. This
 * keeps a dual-role identity on the lender surface instead of allowing the
 * active route to inherit a Builder execution capacity.
 */
export function resolveBackofficeBuildViewerCapacity(
  roles: readonly unknown[]
): BuildCollaborationRole | undefined {
  const normalized = new Set(
    roles
      .map(normalizeBuildCollaborationRole)
      .filter((role): role is BuildCollaborationRole => role !== null)
  );
  return ["admin", "principle-broker", "broker", "broker-staff"].find((role) =>
    normalized.has(role as BuildCollaborationRole)
  ) as BuildCollaborationRole | undefined;
}
