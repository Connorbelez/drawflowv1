export type BuildCollaborationSearchAuthorityRole =
  | "admin"
  | "principle-broker";

export function buildCollaborationSearchAuthorityRole(
  roles: ReadonlyArray<string | undefined>
): BuildCollaborationSearchAuthorityRole | undefined {
  const normalized = new Set(
    roles.filter((role): role is string => Boolean(role))
  );
  if (normalized.has("admin")) {
    return "admin";
  }
  return normalized.has("principle-broker") ? "principle-broker" : undefined;
}
