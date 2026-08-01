import type { PaginationResult } from "convex/server";

import {
  type ActiveBuildAuthorization,
  authorizeActiveBuildAccess,
} from "./activeBuildAccess";
import { requireHumanCollaborationActor } from "./build_collaboration_human";
import {
  type BuildCollaborationRole,
  resolveEffectiveCollaborationRole,
} from "./build_collaboration_model";
import type { Doc, Id, MutationCtx, QueryCtx } from "./types";

export const LEGACY_NOTE_PLAN_VERSION = "build-collaboration-legacy-notes/v2";
export const LEGACY_NOTE_PARITY_VERSION =
  "build-collaboration-legacy-note-parity/v2";
export const MAX_PLAN_PAGE_SIZE = 50;
export const MAX_MANIFEST_WRITE_SIZE = 25;
export const MAX_IMPORT_BATCH_SIZE = 25;
export const MAX_PARITY_BATCH_SIZE = 10;

export type LegacyNoteContext = QueryCtx | MutationCtx;

export interface LegacyNoteSnapshot {
  authorRole: BuildCollaborationRole;
  authorRolesSnapshot: string[];
  authorWorkosUserId: string;
  body: string;
  brokerageId: Id<"brokerages">;
  buildId: Id<"activeBuilds">;
  createdAt: number;
  importedSourceId: string;
  organizationId: string;
  sourceNoteId: Id<"buildNotes">;
  updatedAt: number;
  visibility: "internal" | "public";
}

export async function authorizeLegacyNoteOperator(
  ctx: LegacyNoteContext,
  input: { buildId: Id<"activeBuilds">; organizationId: string },
  requireHuman = false
) {
  const authorization = await authorizeActiveBuildAccess(ctx as never, input);
  if (requireHuman) {
    await requireHumanCollaborationActor(ctx as MutationCtx, authorization);
  }
  if (
    authorization.effectiveRole.role !== "admin" &&
    authorization.effectiveRole.role !== "principle-broker"
  ) {
    throw new Error(
      "Only an administrator or principal broker can operate the legacy-note cutover."
    );
  }
  return authorization;
}

export async function requireLegacyNoteCutoverState(
  ctx: LegacyNoteContext,
  authorization: ActiveBuildAuthorization
) {
  const setting = await ctx.db
    .query("buildCollaborationTenantSettings")
    .withIndex("by_organizationId", (query) =>
      query.eq("organizationId", authorization.organizationId)
    )
    .first();
  if (setting && setting.brokerageId !== authorization.brokerage._id) {
    throw new Error("Collaboration tenant setting ownership is inconsistent.");
  }
  if (setting?.status === "active") {
    throw new Error("Legacy notes cannot be migrated after tenant activation.");
  }
  return setting?.status ?? "disabled";
}

export async function assertLegacyNoteWriteAllowed(
  ctx: MutationCtx,
  input: {
    brokerageId: Id<"brokerages">;
    organizationId: string;
  }
) {
  const setting = await ctx.db
    .query("buildCollaborationTenantSettings")
    .withIndex("by_organizationId", (query) =>
      query.eq("organizationId", input.organizationId)
    )
    .first();
  if (
    setting &&
    (setting.brokerageId !== input.brokerageId || setting.status !== "disabled")
  ) {
    throw new Error(
      "Legacy Public/Internal Notes are retired for this tenant; publish a collaboration post instead."
    );
  }
  const cutoverRun = await ctx.db
    .query("buildCollaborationLegacyNoteMigrationRuns")
    .withIndex("by_organizationId_and_updatedAt", (query) =>
      query.eq("organizationId", input.organizationId)
    )
    .order("desc")
    .first();
  if (cutoverRun) {
    throw new Error(
      "Legacy Public/Internal Notes are frozen once cutover planning begins; publish a collaboration post instead."
    );
  }
}

export function buildSnapshot(build: Doc<"activeBuilds">) {
  return {
    brokerageId: build.brokerageId,
    buildId: build._id,
    organizationId: build.organizationId,
  };
}

export function noteSnapshot(note: Doc<"buildNotes">): LegacyNoteSnapshot {
  const effectiveRole = resolveEffectiveCollaborationRole(note.authorRoles);
  if (!effectiveRole) {
    throw new Error(`Legacy note ${note._id} has no recognized author role.`);
  }
  return {
    authorRole: effectiveRole.role,
    authorRolesSnapshot: note.authorRoles,
    authorWorkosUserId: note.authorWorkosUserId,
    body: note.body,
    brokerageId: note.brokerageId,
    buildId: note.buildId,
    createdAt: note.createdAt,
    importedSourceId: `buildNote:${note._id}`,
    organizationId: note.organizationId,
    sourceNoteId: note._id,
    updatedAt: note.updatedAt,
    visibility: note.visibility,
  };
}

export function noteAudience(snapshot: LegacyNoteSnapshot) {
  const role = resolveEffectiveCollaborationRole([snapshot.authorRole]);
  return snapshot.visibility === "public"
    ? { audienceFloorTier: 0, audienceMode: "build_wide" as const }
    : {
        audienceFloorTier: role?.tier ?? -1,
        audienceMode: "author_tier_and_higher" as const,
      };
}

export function legacyNoteTiptapJson(body: string) {
  return JSON.stringify({
    content: [
      {
        content: body ? [{ text: body, type: "text" }] : [],
        type: "paragraph",
      },
    ],
    type: "doc",
  });
}

export async function initialPlanAccumulator(
  authorization: ActiveBuildAuthorization
) {
  return await sha256Hex(
    JSON.stringify({
      brokerageId: authorization.brokerage._id,
      organizationId: authorization.organizationId,
      planVersion: LEGACY_NOTE_PLAN_VERSION,
    })
  );
}

export async function advanceAccumulator(
  accumulator: string,
  kind: "build" | "note" | "report",
  value: unknown
) {
  return await sha256Hex(`${accumulator}\n${kind}:${JSON.stringify(value)}`);
}

export function planTokenFromAccumulator(accumulator: string) {
  return `${LEGACY_NOTE_PLAN_VERSION}:${accumulator}`;
}

export function requirePlanToken(value: string) {
  if (!value.startsWith(`${LEGACY_NOTE_PLAN_VERSION}:`)) {
    throw new Error("A valid legacy-note preview plan token is required.");
  }
}

export function normalizePageSize(value: number, maximum: number) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new Error(`Page size must be between 1 and ${maximum}.`);
  }
  return value;
}

export function hasMore<T>(rows: T[], limit: number) {
  return {
    items: rows.slice(0, limit),
    more: rows.length > limit,
  };
}

export function emptyRoleMatrix() {
  return Object.fromEntries(
    [
      "admin",
      "principle-broker",
      "broker",
      "builder",
      "broker-staff",
      "builder-staff",
      "homeowner",
      "contractor",
    ].map((role) => [
      role,
      {
        expectedReadable: 0,
        expectedRestricted: 0,
        mismatchCount: 0,
        observedReadable: 0,
        observedRestricted: 0,
      },
    ])
  ) as Record<
    BuildCollaborationRole,
    {
      expectedReadable: number;
      expectedRestricted: number;
      mismatchCount: number;
      observedReadable: number;
      observedRestricted: number;
    }
  >;
}

export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function nextCursor<T>(page: PaginationResult<T>) {
  return page.isDone ? undefined : page.continueCursor;
}

export async function recordLegacyNoteCutoverAudit(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  input: {
    command: string;
    entityId: string;
    eventType: string;
    newState: string;
    now: number;
    reason?: string;
  }
) {
  await ctx.db.insert("auditEvents", {
    actorRoles: authorization.roles,
    actorWorkosUserId: authorization.viewer.subject,
    brokerageId: authorization.brokerage._id,
    command: input.command,
    createdAt: input.now,
    entityId: input.entityId,
    entityType: "buildCollaborationLegacyNoteCutover",
    eventType: input.eventType,
    newState: input.newState,
    organizationId: authorization.organizationId,
    reason: input.reason,
    warnings: [],
  });
}
