import { resolveEffectiveCollaborationRole } from "./build_collaboration_model";
import {
  ensureMilestoneSystemPost,
  synchronizeDrawSystemPostForCanonicalDraw,
  synchronizeMilestoneSystemPostLifecycle,
} from "./build_collaboration_system_posts";
import type { Doc, MutationCtx } from "./types";

type MilestoneTransition = "submitted" | "approved" | "rejected" | "blocked";

type DrawTransition = "submitted" | "approved" | "released" | "returned";

export async function publishMilestoneCollaborationEvent(
  ctx: MutationCtx,
  input: {
    actor: { roles: string[]; workosUserId: string };
    milestone: Doc<"buildMilestones">;
    note?: string;
    transition: MilestoneTransition;
  }
) {
  const build = await ctx.db.get(input.milestone.buildId);
  if (
    !build ||
    build.organizationId !== input.milestone.organizationId ||
    build.brokerageId !== input.milestone.brokerageId
  ) {
    throw new Error(
      "Cannot synchronize a Milestone System Post without its Build.",
    );
  }
  const actorRole = resolveEffectiveCollaborationRole(input.actor.roles)?.role;
  if (!actorRole) {
    throw new Error("The Milestone System Post actor has no collaboration role.");
  }
  const ensured = await ensureMilestoneSystemPost(ctx, {
    activationReason: "recovery",
    actor: input.actor,
    build,
    milestone: input.milestone,
  });
  if (!ensured) return;
  await synchronizeMilestoneSystemPostLifecycle(ctx, {
    actorRole,
    actorWorkosUserId: input.actor.workosUserId,
    buildId: build._id,
    lifecycle: input.transition === "approved" ? "resolved" : "open",
    organizationId: build.organizationId,
    postId: ensured.postId,
    reason: input.note,
  });
}

export async function publishDrawCollaborationEvent(
  ctx: MutationCtx,
  input: {
    actor: { roles: string[]; workosUserId: string };
    draw: Doc<"activeBuildDrawRequests">;
    note?: string;
    revision: number;
    transition: DrawTransition;
  }
) {
  const build = await ctx.db.get(input.draw.buildId);
  if (!build) {
    throw new Error("Cannot publish Draw collaboration event without its Build.");
  }
  await synchronizeDrawSystemPostForCanonicalDraw(ctx, {
    actor: input.actor,
    activationReason: "draw_request",
    build,
    drawRequest: input.draw,
    reason: input.note,
  });
  // Draw transitions converge on the one deterministic System Post. The
  // canonical Draw Request remains the source of truth; no transition event
  // creates a second collaboration post or an automatic Action Item.
}
