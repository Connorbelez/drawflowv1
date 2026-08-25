import { normalizeRoleSlugs, type RoleSlug } from "../authz";
import { getActiveMembership } from "./authorization";
import type { Id, MutationCtx, QueryCtx } from "../types";

export async function eligibleBuilderProfileForUser(
  ctx: QueryCtx | MutationCtx,
  input: {
    brokerageId: Id<"brokerages">;
    targetWorkosUserId: string;
    workosOrganizationId: string;
  }
) {
  const membership = await getActiveMembership(
    ctx,
    input.targetWorkosUserId,
    input.workosOrganizationId
  );
  const roles = normalizeRoleSlugs(membership.roleSlugs);
  if (!roles.includes("builder")) {
    throw new Error("Participant is not eligible for assign-to-builder.");
  }
  const links = await ctx.db
    .query("builderAccountLinks")
    .withIndex("by_user", (q) => q.eq("workosUserId", input.targetWorkosUserId))
    .collect();
  for (const link of links.filter((row) => row.status === "active")) {
    const profile = await ctx.db.get(link.builderProfileId);
    if (
      profile &&
      profile.status === "active" &&
      profile.brokerageId === input.brokerageId
    ) {
      return profile;
    }
  }
  throw new Error("Participant is not eligible for assign-to-builder.");
}

export async function displayNameForWorkosUser(
  ctx: QueryCtx | MutationCtx,
  workosUserId: string
) {
  const user = await ctx.db
    .query("users")
    .withIndex("by_workos_user_id", (q) => q.eq("workosUserId", workosUserId))
    .first();
  if (user?.name) {
    return titleCaseName(user.name.replace(/^user[_ ]/i, ""));
  }
  if (user?.email) {
    return titleCaseName(user.email.split("@")[0] ?? workosUserId);
  }
  return titleCaseName(workosUserId.replace(/^user_/, ""));
}

function titleCaseName(value: string) {
  return value
    .replaceAll("_", " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}
