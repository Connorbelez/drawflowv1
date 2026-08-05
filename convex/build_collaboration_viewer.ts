import { v } from "convex/values";

import { authenticatedQuery } from "./authz";
import { authorizeActiveBuildCollaborationAccess } from "./build_collaboration_rollout";
import { buildCollaborationRoleValidator } from "./build_collaboration_validators";

/**
 * Server-derived identity binding for production persona verification and
 * viewer-scoped UI diagnostics. This deliberately reuses the canonical Build
 * authorization boundary so fixture declarations can never attest themselves.
 */
export const getBuildCollaborationViewerBinding = authenticatedQuery
  .input({
    buildId: v.id("activeBuilds"),
    organizationId: v.string(),
  })
  .returns(
    v.object({
      buildId: v.id("activeBuilds"),
      organizationId: v.string(),
      role: buildCollaborationRoleValidator,
      roles: v.array(buildCollaborationRoleValidator),
      workosUserId: v.string(),
    })
  )
  .handler(async (ctx, args) => {
    const authorization = await authorizeActiveBuildCollaborationAccess(
      ctx,
      args
    );
    return {
      buildId: authorization.build._id,
      organizationId: authorization.organizationId,
      role: authorization.effectiveRole.role,
      roles: authorization.roles,
      workosUserId: authorization.viewer.subject,
    };
  })
  .public();
