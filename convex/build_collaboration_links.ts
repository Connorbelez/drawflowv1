import type { BuildCollaborationRole } from "./build_collaboration_model";

export function buildCollaborationDeepLink(input: {
  buildId: string;
  detailTab?: string;
  focus?: string;
  postId?: string;
  recipientRole?: BuildCollaborationRole;
}) {
  const prefix = buildCollaborationRoutePrefix(input.recipientRole);
  const search: string[] = [];
  if (
    input.recipientRole !== "contractor" &&
    input.recipientRole !== "homeowner"
  ) {
    search.push("tab=details");
  }
  const focus =
    input.focus ?? (input.postId ? `post:${input.postId}` : undefined);
  if (focus) {
    search.push(`focus=${encodeURIComponent(focus)}`);
  }
  if (input.detailTab) {
    search.push(`detailTab=${encodeURIComponent(input.detailTab)}`);
  }
  return `${prefix}/${input.buildId}${search.length ? `?${search.join("&")}` : ""}`;
}

function buildCollaborationRoutePrefix(role?: BuildCollaborationRole) {
  switch (role) {
    case "contractor":
      return "/contractor/builds";
    case "homeowner":
      return "/homeowner/builds";
    case "builder-staff":
      return "/builder-staff/builds";
    case "builder":
      return "/builder/builds";
    default:
      return "/backoffice/builds";
  }
}
