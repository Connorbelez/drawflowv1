import type { Doc, Id, MutationCtx, QueryCtx } from "../types";
import { getParticipantForUser } from "./authorization";
import { presence } from "./context";
import { displayNameForWorkosUser } from "./identity";

export async function listPresenceForRoom(ctx: QueryCtx, roomToken: string) {
  const rows = await presence.list(ctx, roomToken);
  const enriched = [];
  for (const row of rows) {
    enriched.push({
      ...row,
      name: await displayNameForWorkosUser(ctx, row.userId),
    });
  }
  return enriched;
}

export async function heartbeatPresence(
  ctx: MutationCtx,
  input: {
    interval: number;
    roomId: string;
    sessionId: string;
    userId: string;
    workosUserId: string;
  }
) {
  const sessionId = parseRoomSessionId(ctx, input.roomId);
  const session = await ctx.db.get(sessionId);
  if (!session || session.status !== "active") {
    throw new Error("Collaboration session is not active.");
  }
  await assertParticipantCanEditOrView(ctx, session, input.workosUserId);
  return await presence.heartbeat(
    ctx,
    input.roomId,
    input.workosUserId,
    input.sessionId,
    input.interval
  );
}

export async function updatePresenceData(
  ctx: MutationCtx,
  input: {
    cursor?: { x: number; y: number };
    roomId: string;
    workosUserId: string;
  }
) {
  const sessionId = parseRoomSessionId(ctx, input.roomId);
  const session = await ctx.db.get(sessionId);
  if (!session || session.status !== "active") {
    throw new Error("Collaboration session is not active.");
  }
  await assertParticipantCanEditOrView(ctx, session, input.workosUserId);
  await presence.updateRoomUser(ctx, input.roomId, input.workosUserId, {
    cursor: input.cursor,
    updatedAt: Date.now(),
  });
}

export async function disconnectPresence(
  ctx: MutationCtx,
  sessionToken: string
) {
  return await presence.disconnect(ctx, sessionToken);
}


async function assertParticipantCanEditOrView(
  ctx: QueryCtx | MutationCtx,
  session: Doc<"proposalCollaborationSessions">,
  workosUserId: string
) {
  const participant = await getParticipantForUser(
    ctx,
    session._id,
    workosUserId
  );
  if (!participant || participant.status === "revoked") {
    throw new Error("Forbidden: collaboration participant");
  }
}

function parseRoomSessionId(
  ctx: QueryCtx | MutationCtx,
  roomId: string
): Id<"proposalCollaborationSessions"> {
  const marker = ":session:";
  const rawSessionId = roomId.includes(marker)
    ? roomId.slice(roomId.lastIndexOf(marker) + marker.length)
    : "";
  const sessionId = ctx.db.normalizeId(
    "proposalCollaborationSessions",
    rawSessionId
  );
  if (!sessionId) {
    throw new Error("Invalid collaboration room.");
  }
  return sessionId;
}
