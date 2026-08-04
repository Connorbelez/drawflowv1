export type BuildCollaborationSearchAuthorityRole =
  | "admin"
  | "principal-broker";

export function buildCollaborationSearchAuthorityRole(
  roles: ReadonlyArray<string | undefined>
): BuildCollaborationSearchAuthorityRole | undefined {
  const normalized = new Set(
    roles.filter((role): role is string => Boolean(role))
  );
  if (normalized.has("admin")) {
    return "admin";
  }
  return normalized.has("principal-broker") || normalized.has("principle-broker")
    ? "principal-broker"
    : undefined;
}
