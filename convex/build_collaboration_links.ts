import type { BuildCollaborationRole } from "./build_collaboration_model";

export function buildCollaborationDeepLink(input: {
  buildId: string;
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
  if (input.postId) {
    search.push(`collaborationPost=${encodeURIComponent(input.postId)}`);
  }
  if (input.focus) {
    search.push(`focus=${encodeURIComponent(input.focus)}`);
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
