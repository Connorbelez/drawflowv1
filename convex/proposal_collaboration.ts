import { v } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import {
  authenticatedMutation,
  authenticatedQuery,
  normalizeRoleSlugs,
} from "./authz";
import { publicMutation } from "./fluent";
import {
  assertCanManageSession,
  assertParticipantCanEdit,
  defaultCollaborationPermission,
  disconnectPresence,
  displayNameForWorkosUser,
  eligibleBuilderProfileForUser,
  generateShareToken,
  getActiveMembership,
  getActiveSessionForProposal,
  getParticipantForUser,
  getProposalTimelineStatus,
  getSessionByShareToken,
  getSessionOrThrow,
  heartbeatPresence,
  isBrokerSideRole,
  listPresenceForRoom,
  proposalCollaborationRoomId,
  pushProposalPlanningSnapshot,
  redoProposalPlanningSnapshot,
  resolveCollaborationAuth,
  resolveWorkosScope,
  restoreProposalPlanningSnapshot,
  shareTokenHash,
  undoProposalPlanningSnapshot,
  updatePresenceData as updatePresencePayload,
  upsertProposalKanbanCard,
  upsertSessionParticipant,
  writeCollaborationAuditEvent,
} from "./proposal_collaboration_model";
import type { Id } from "./types";

const collaborationPermission = v.union(v.literal("view"), v.literal("edit"));

const cursorPayload = v.object({
  x: v.number(),
  y: v.number(),
});

export const startSession = authenticatedMutation
  .input({
    proposalId: v.id("buildProposals"),
    workosOrganizationId: v.string(),
  })
  .returns(
    v.object({
      roomId: v.string(),
      sessionId: v.id("proposalCollaborationSessions"),
      shareToken: v.string(),
    })
  )
  .handler(async (ctx, args) => {
    const auth = await resolveCollaborationAuth(
      ctx,
      args.proposalId,
      args.workosOrganizationId
    );
    const now = Date.now();
    const shareToken = generateShareToken();
    const hashedToken = await shareTokenHash(shareToken);
    const existing = await getActiveSessionForProposal(ctx, args.proposalId);
    const initiatorSide = isBrokerSideRole(auth.roles) ? "broker" : "builder";
    let sessionId: Id<"proposalCollaborationSessions">;
    if (existing) {
      await assertCanManageSession(ctx, existing, auth);
      sessionId = existing._id;
      await ctx.db.patch(existing._id, {
        shareTokenHash: hashedToken,
        updatedAt: now,
      });
    } else {
      sessionId = await ctx.db.insert("proposalCollaborationSessions", {
        brokerageId: auth.brokerage._id,
        createdAt: now,
        initiatorSide,
        organizationId: args.workosOrganizationId,
        proposalId: args.proposalId,
        shareTokenHash: hashedToken,
        startedByRoles: auth.roles,
        startedByWorkosUserId: auth.subject,
        status: "active",
        updatedAt: now,
      });
    }
    const session = await ctx.db.get(sessionId);
    if (!session) {
      throw new Error("Collaboration session was not created.");
    }
    await upsertSessionParticipant(ctx, {
      authRoles: auth.roles,
      displayName: await displayNameForWorkosUser(ctx, auth.subject),
      permission: "edit",
      session,
      source: "creator",
      status: "joined",
      workosUserId: auth.subject,
    });
    await pushProposalPlanningSnapshot(ctx, args.proposalId);
    await writeCollaborationAuditEvent(ctx, {
      auth,
      command: "startSession",
      eventType: "proposal.collaboration.started",
      newState: JSON.stringify({ sessionId, status: "active" }),
      proposal: auth.proposal,
    });
    return {
      roomId: proposalCollaborationRoomId({
        organizationId: args.workosOrganizationId,
        proposalId: args.proposalId,
        sessionId,
      }),
      sessionId,
      shareToken,
    };
  })
  .public();

export const joinSession = authenticatedMutation
  .input({
    shareToken: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(
    v.object({
      participantId: v.id("proposalCollaborationParticipants"),
      permission: collaborationPermission,
      proposalId: v.id("buildProposals"),
      roomId: v.string(),
      sessionId: v.id("proposalCollaborationSessions"),
    })
  )
  .handler(async (ctx, args) => {
    const session = await getSessionByShareToken(ctx, args.shareToken);
    if (!session || session.status !== "active") {
      throw new Error("Collaboration session not found.");
    }
    if (session.organizationId !== args.workosOrganizationId) {
      throw new Error("Forbidden: organization scope");
    }
    const scope = await resolveWorkosScope(ctx, args.workosOrganizationId);
    if (scope.brokerage._id !== session.brokerageId) {
      throw new Error("Forbidden: brokerage scope");
    }
    const proposal = await ctx.db.get(session.proposalId);
    if (!proposal) {
      throw new Error("Proposal not found.");
    }
    const existingByUser = await getParticipantForUser(
      ctx,
      session._id,
      scope.subject
    );
    const emailInvite = existingByUser
      ? null
      : await findEmailInviteForViewer(ctx, session._id);
    const existing = existingByUser ?? emailInvite;
    if (existing?.status === "revoked") {
      throw new Error("Collaboration participant access was revoked.");
    }
    const displayName = await displayNameForWorkosUser(ctx, scope.subject);
    const participant = emailInvite
      ? await bindEmailInviteToUser(ctx, {
          displayName,
          emailInvite,
          roleSlugs: scope.roles,
          workosUserId: scope.subject,
        })
      : await upsertSessionParticipant(ctx, {
          authRoles: scope.roles,
          displayName,
          permission:
            existing?.permission ?? defaultCollaborationPermission(scope.roles),
          session,
          source: existing?.source ?? "share-link",
          status: "joined",
          workosUserId: scope.subject,
        });
    return {
      participantId: participant._id,
      permission: participant.permission,
      proposalId: session.proposalId,
      roomId: proposalCollaborationRoomId({
        organizationId: session.organizationId,
        proposalId: session.proposalId,
        sessionId: session._id,
      }),
      sessionId: session._id,
    };
  })
  .public();

export const inviteParticipant = authenticatedMutation
  .input({
    inviteEmail: v.optional(v.string()),
    permission: collaborationPermission,
    sessionId: v.id("proposalCollaborationSessions"),
    targetWorkosUserId: v.optional(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(v.id("proposalCollaborationParticipants"))
  .handler(async (ctx, args) => {
    const { auth, session } = await authorizeSessionManager(ctx, {
      sessionId: args.sessionId,
      workosOrganizationId: args.workosOrganizationId,
    });
    if (!(args.targetWorkosUserId || args.inviteEmail?.trim())) {
      throw new Error("An invite target is required.");
    }
    let participantId: Id<"proposalCollaborationParticipants">;
    if (args.targetWorkosUserId) {
      const membership = await getActiveMembership(
        ctx,
        args.targetWorkosUserId,
        args.workosOrganizationId
      );
      const roles = normalizeRoleSlugs(membership.roleSlugs);
      const participant = await upsertSessionParticipant(ctx, {
        authRoles: roles,
        displayName: await displayNameForWorkosUser(
          ctx,
          args.targetWorkosUserId
        ),
        invitedByWorkosUserId: auth.subject,
        permission: args.permission,
        session,
        source: "invite",
        status: "invited",
        workosUserId: args.targetWorkosUserId,
      });
      participantId = participant._id;
    } else {
      const now = Date.now();
      const existing = await ctx.db
        .query("proposalCollaborationParticipants")
        .withIndex("by_session_invite_email", (q) =>
          q
            .eq("sessionId", session._id)
            .eq("inviteEmail", args.inviteEmail?.trim().toLowerCase())
        )
        .unique();
      const patch = {
        inviteEmail: args.inviteEmail?.trim().toLowerCase(),
        invitedByWorkosUserId: auth.subject,
        permission: args.permission,
        roleSlugs: [],
        source: "invite" as const,
        status: "invited" as const,
        updatedAt: now,
      };
      if (existing) {
        await ctx.db.patch(existing._id, patch);
        participantId = existing._id;
      } else {
        participantId = await ctx.db.insert(
          "proposalCollaborationParticipants",
          {
            ...patch,
            brokerageId: session.brokerageId,
            createdAt: now,
            organizationId: session.organizationId,
            proposalId: session.proposalId,
            sessionId: session._id,
          }
        );
      }
    }
    await writeCollaborationAuditEvent(ctx, {
      auth,
      command: "inviteParticipant",
      eventType: "proposal.collaboration.participant_invited",
      newState: JSON.stringify({
        participantId,
        permission: args.permission,
        targetWorkosUserId: args.targetWorkosUserId,
      }),
      proposal: auth.proposal,
    });
    return participantId;
  })
  .public();

export const setParticipantPermission = authenticatedMutation
  .input({
    participantId: v.optional(v.id("proposalCollaborationParticipants")),
    permission: collaborationPermission,
    reason: v.optional(v.string()),
    sessionId: v.id("proposalCollaborationSessions"),
    targetWorkosUserId: v.optional(v.string()),
    workosOrganizationId: v.string(),
  })
  .returns(v.id("proposalCollaborationParticipants"))
  .handler(async (ctx, args) => {
    const { auth, session } = await authorizeSessionManager(ctx, {
      sessionId: args.sessionId,
      workosOrganizationId: args.workosOrganizationId,
    });
    if (!(args.targetWorkosUserId || args.participantId)) {
      throw new Error("Participant target is required.");
    }
    const prior = args.participantId
      ? await ctx.db.get(args.participantId)
      : args.targetWorkosUserId
        ? await getParticipantForUser(ctx, session._id, args.targetWorkosUserId)
        : null;
    if (args.participantId && (!prior || prior.sessionId !== session._id)) {
      throw new Error("Collaboration participant not found.");
    }
    const targetWorkosUserId = args.targetWorkosUserId ?? prior?.workosUserId;
    const participant = targetWorkosUserId
      ? await updateUserParticipantPermission(ctx, {
          authSubject: auth.subject,
          permission: args.permission,
          prior,
          session,
          targetWorkosUserId,
          workosOrganizationId: args.workosOrganizationId,
        })
      : await updateInviteParticipantPermission(ctx, {
          participant: prior,
          permission: args.permission,
        });
    await writeCollaborationAuditEvent(ctx, {
      auth,
      command: "setParticipantPermission",
      eventType: "proposal.collaboration.permission_changed",
      newState: JSON.stringify({
        inviteEmail: participant.inviteEmail,
        participantId: participant._id,
        permission: args.permission,
        targetWorkosUserId: participant.workosUserId,
      }),
      priorState: prior
        ? JSON.stringify({
            inviteEmail: prior.inviteEmail,
            participantId: prior._id,
            permission: prior.permission,
            status: prior.status,
            targetWorkosUserId: prior.workosUserId,
          })
        : undefined,
      proposal: auth.proposal,
      reason: args.reason,
    });
    return participant._id;
  })
  .public();

export const stopSession = authenticatedMutation
  .input({
    reason: v.optional(v.string()),
    sessionId: v.id("proposalCollaborationSessions"),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const { auth, session } = await authorizeSessionManager(ctx, {
      sessionId: args.sessionId,
      workosOrganizationId: args.workosOrganizationId,
    });
    const now = Date.now();
    await ctx.db.patch(session._id, {
      status: "inactive",
      stopReason: args.reason,
      stoppedAt: now,
      stoppedByWorkosUserId: auth.subject,
      updatedAt: now,
    });
    await writeCollaborationAuditEvent(ctx, {
      auth,
      command: "stopSession",
      eventType: "proposal.collaboration.stopped",
      newState: JSON.stringify({ sessionId: session._id, status: "inactive" }),
      priorState: JSON.stringify({
        sessionId: session._id,
        status: session.status,
      }),
      proposal: auth.proposal,
      reason: args.reason,
    });
    return null;
  })
  .public();

export const getSession = authenticatedQuery
  .input({
    proposalId: v.id("buildProposals"),
    workosOrganizationId: v.string(),
  })
  .returns(v.any())
  .handler(async (ctx, args) => {
    const auth = await resolveCollaborationAuth(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
      { allowActiveParticipant: true }
    );
    const session = await getActiveSessionForProposal(ctx, args.proposalId);
    if (!session) {
      return {
        activeSession: null,
        canManage: false,
        participants: [],
      };
    }
    const participantRows = await ctx.db
      .query("proposalCollaborationParticipants")
      .withIndex("by_session", (q) => q.eq("sessionId", session._id))
      .collect();
    const participants = await Promise.all(
      participantRows
        .sort((a, b) => a.createdAt - b.createdAt)
        .map(async (participant) => {
          if (
            !(session.initiatorSide === "broker" && participant.workosUserId)
          ) {
            return { ...participant, assignableBuilderProfileId: null };
          }
          try {
            const profile = await eligibleBuilderProfileForUser(ctx, {
              brokerageId: auth.brokerage._id,
              targetWorkosUserId: participant.workosUserId,
              workosOrganizationId: args.workosOrganizationId,
            });
            return {
              ...participant,
              assignableBuilderProfileId: profile._id,
            };
          } catch {
            return { ...participant, assignableBuilderProfileId: null };
          }
        })
    );
    const currentParticipant = await getParticipantForUser(
      ctx,
      session._id,
      auth.subject
    );
    return {
      activeSession: session,
      canManage:
        session.startedByWorkosUserId === auth.subject ||
        auth.roles.includes("admin") ||
        auth.roles.includes("principle-broker"),
      currentPermission: currentParticipant?.permission ?? null,
      currentWorkosUserId: auth.subject,
      participants,
      roomId: proposalCollaborationRoomId({
        organizationId: session.organizationId,
        proposalId: session.proposalId,
        sessionId: session._id,
      }),
    };
  })
  .public();

export const assignSessionToBuilder = authenticatedMutation
  .input({
    reason: v.optional(v.string()),
    sessionId: v.id("proposalCollaborationSessions"),
    targetWorkosUserId: v.string(),
    workosOrganizationId: v.string(),
  })
  .returns(
    v.object({
      assigned: v.boolean(),
      builderProfileId: v.id("builderProfiles"),
    })
  )
  .handler(async (ctx, args) => {
    const { auth, session } = await authorizeSessionManager(ctx, {
      sessionId: args.sessionId,
      workosOrganizationId: args.workosOrganizationId,
    });
    if (session.initiatorSide !== "broker") {
      throw new Error(
        "Assign-to-builder is only available for broker sessions."
      );
    }
    const participant = await getParticipantForUser(
      ctx,
      session._id,
      args.targetWorkosUserId
    );
    if (!participant || participant.status === "revoked") {
      throw new Error("Participant is not eligible for assign-to-builder.");
    }
    const builderProfile = await eligibleBuilderProfileForUser(ctx, {
      brokerageId: auth.brokerage._id,
      targetWorkosUserId: args.targetWorkosUserId,
      workosOrganizationId: args.workosOrganizationId,
    });
    const priorState = JSON.stringify({
      builderProfileId: auth.proposal.builderProfileId,
    });
    const now = Date.now();
    await ctx.db.patch(auth.proposal._id, {
      builderProfileId: builderProfile._id,
      updatedAt: now,
      updatedByWorkosUserId: auth.subject,
    });
    await ctx.db.patch(session._id, {
      assignedBuilderProfileId: builderProfile._id,
      assignedBuilderWorkosUserId: args.targetWorkosUserId,
      updatedAt: now,
    });
    await upsertProposalKanbanCard(ctx, auth.proposal._id, now);
    await writeCollaborationAuditEvent(ctx, {
      auth,
      command: "assignSessionToBuilder",
      eventType: "proposal.collaboration.assigned_to_builder",
      newState: JSON.stringify({
        builderProfileId: builderProfile._id,
        targetWorkosUserId: args.targetWorkosUserId,
      }),
      priorState,
      proposal: auth.proposal,
      reason: args.reason,
    });
    return { assigned: true, builderProfileId: builderProfile._id };
  })
  .public();

export const getTimelineHistoryStatus = authenticatedQuery
  .input({
    proposalId: v.id("buildProposals"),
    workosOrganizationId: v.string(),
  })
  .returns(
    v.object({
      canRedo: v.boolean(),
      canUndo: v.boolean(),
      length: v.number(),
      position: v.union(v.number(), v.null()),
    })
  )
  .handler(async (ctx, args) => {
    const auth = await resolveCollaborationAuth(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
      { allowActiveParticipant: true }
    );
    const status = await getProposalTimelineStatus(ctx, args.proposalId);
    if (
      auth.proposal.status !== "draft" ||
      auth.proposal.submittedAt !== undefined
    ) {
      return { ...status, canRedo: false, canUndo: false };
    }
    return status;
  })
  .public();

export const undoProposalTimeline = authenticatedMutation
  .input({
    proposalId: v.id("buildProposals"),
    reason: v.optional(v.string()),
    sessionId: v.id("proposalCollaborationSessions"),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await resolveCollaborationAuth(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
      { allowActiveParticipant: true }
    );
    const session = await getSessionOrThrow(
      ctx,
      args.sessionId,
      args.workosOrganizationId
    );
    if (session.status !== "active" || session.proposalId !== args.proposalId) {
      throw new Error("Collaboration session is not active.");
    }
    await assertParticipantCanEdit(ctx, session, auth.subject);
    assertUndoableProposalState(auth.proposal);
    const snapshot = await undoProposalPlanningSnapshot(ctx, args.proposalId);
    if (!snapshot) {
      throw new Error("Nothing to undo.");
    }
    await restoreProposalPlanningSnapshot(ctx, auth, snapshot);
    await writeCollaborationAuditEvent(ctx, {
      auth,
      command: "undoProposalTimeline",
      eventType: "proposal.timeline.undo",
      newState: JSON.stringify({ version: snapshot.version }),
      proposal: auth.proposal,
      reason: args.reason,
    });
    return null;
  })
  .public();

export const redoProposalTimeline = authenticatedMutation
  .input({
    proposalId: v.id("buildProposals"),
    reason: v.optional(v.string()),
    sessionId: v.id("proposalCollaborationSessions"),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const auth = await resolveCollaborationAuth(
      ctx,
      args.proposalId,
      args.workosOrganizationId,
      { allowActiveParticipant: true }
    );
    const session = await getSessionOrThrow(
      ctx,
      args.sessionId,
      args.workosOrganizationId
    );
    if (session.status !== "active" || session.proposalId !== args.proposalId) {
      throw new Error("Collaboration session is not active.");
    }
    await assertParticipantCanEdit(ctx, session, auth.subject);
    assertUndoableProposalState(auth.proposal);
    const snapshot = await redoProposalPlanningSnapshot(ctx, args.proposalId);
    if (!snapshot) {
      throw new Error("Nothing to redo.");
    }
    await restoreProposalPlanningSnapshot(ctx, auth, snapshot);
    await writeCollaborationAuditEvent(ctx, {
      auth,
      command: "redoProposalTimeline",
      eventType: "proposal.timeline.redo",
      newState: JSON.stringify({ version: snapshot.version }),
      proposal: auth.proposal,
      reason: args.reason,
    });
    return null;
  })
  .public();

export const presenceHeartbeat = authenticatedMutation
  .input({
    interval: v.number(),
    roomId: v.string(),
    sessionId: v.string(),
    userId: v.string(),
  })
  .returns(
    v.object({
      roomToken: v.string(),
      sessionToken: v.string(),
    })
  )
  .handler(
    async (ctx, args) =>
      await heartbeatPresence(ctx, {
        interval: args.interval,
        roomId: args.roomId,
        sessionId: args.sessionId,
        userId: args.userId,
        workosUserId: ctx.viewer.subject,
      })
  )
  .public();

export const listPresence = authenticatedQuery
  .input({ roomToken: v.string() })
  .returns(v.any())
  .handler(async (ctx, args) => await listPresenceForRoom(ctx, args.roomToken))
  .public();

export const updatePresenceData = authenticatedMutation
  .input({
    cursor: v.optional(cursorPayload),
    roomId: v.string(),
    sessionId: v.id("proposalCollaborationSessions"),
    workosOrganizationId: v.string(),
  })
  .returns(v.null())
  .handler(async (ctx, args) => {
    const session = await getSessionOrThrow(
      ctx,
      args.sessionId,
      args.workosOrganizationId
    );
    if (session.status !== "active") {
      throw new Error("Collaboration session is not active.");
    }
    await updatePresencePayload(ctx, {
      cursor: args.cursor,
      roomId: args.roomId,
      workosUserId: ctx.viewer.subject,
    });
    return null;
  })
  .public();

export const presenceDisconnect = publicMutation
  .input({ sessionToken: v.string() })
  .returns(v.null())
  .handler(
    async (ctx, args) => await disconnectPresence(ctx, args.sessionToken)
  )
  .public();

async function authorizeSessionManager(
  ctx: Parameters<typeof resolveCollaborationAuth>[0],
  input: {
    sessionId: Id<"proposalCollaborationSessions">;
    workosOrganizationId: string;
  }
) {
  const session = await getSessionOrThrow(
    ctx,
    input.sessionId,
    input.workosOrganizationId
  );
  if (session.status !== "active") {
    throw new Error("Collaboration session is not active.");
  }
  const auth = await resolveCollaborationAuth(
    ctx,
    session.proposalId,
    input.workosOrganizationId
  );
  await assertCanManageSession(ctx, session, auth);
  return { auth, session };
}

async function findEmailInviteForViewer(
  ctx: any,
  sessionId: Id<"proposalCollaborationSessions">
) {
  const email = ctx.viewer?.email?.trim().toLowerCase();
  if (!email) {
    return null;
  }
  return await ctx.db
    .query("proposalCollaborationParticipants")
    .withIndex("by_session_invite_email", (q: any) =>
      q.eq("sessionId", sessionId).eq("inviteEmail", email)
    )
    .unique();
}

async function bindEmailInviteToUser(
  ctx: any,
  input: {
    displayName: string;
    emailInvite: any;
    roleSlugs: string[];
    workosUserId: string;
  }
) {
  const now = Date.now();
  await ctx.db.patch(input.emailInvite._id, {
    displayName: input.displayName,
    lastJoinedAt: now,
    roleSlugs: input.roleSlugs,
    status: "joined",
    updatedAt: now,
    workosUserId: input.workosUserId,
  });
  const participant = await ctx.db.get(input.emailInvite._id);
  if (!participant) {
    throw new Error("Collaboration participant update failed.");
  }
  return participant;
}

async function updateUserParticipantPermission(
  ctx: any,
  input: {
    authSubject: string;
    permission: "edit" | "view";
    prior: any;
    session: any;
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
  return await upsertSessionParticipant(ctx, {
    authRoles: roles,
    displayName: await displayNameForWorkosUser(ctx, input.targetWorkosUserId),
    invitedByWorkosUserId:
      input.prior?.invitedByWorkosUserId ?? input.authSubject,
    permission: input.permission,
    session: input.session,
    source: input.prior?.source ?? "invite",
    status: input.prior?.status ?? "invited",
    workosUserId: input.targetWorkosUserId,
  });
}

async function updateInviteParticipantPermission(
  ctx: any,
  input: {
    participant: any;
    permission: "edit" | "view";
  }
) {
  if (!input.participant || input.participant.status === "revoked") {
    throw new Error("Collaboration participant not found.");
  }
  if (!input.participant.inviteEmail) {
    throw new Error("Invite participant target is required.");
  }
  await ctx.db.patch(input.participant._id, {
    permission: input.permission,
    updatedAt: Date.now(),
  });
  const updated = await ctx.db.get(input.participant._id);
  if (!updated) {
    throw new Error("Collaboration participant update failed.");
  }
  return updated;
}

function assertUndoableProposalState(
  proposal: Pick<Doc<"buildProposals">, "status" | "submittedAt">
) {
  if (proposal.status === "draft" && proposal.submittedAt === undefined) {
    return;
  }
  throw new Error("Undo/redo is only available for proposal planning edits.");
}
