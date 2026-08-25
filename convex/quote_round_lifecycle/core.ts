import { ConvexError } from "convex/values";

import {
  type ActiveBuildAuthorization,
  authorizeActiveBuildAccess,
} from "../activeBuildAccess";
import {
  type AuditOverrideKind,
  appendGovernedAuditEvent,
} from "../administrative_override_policy";
import { type AuthorizedViewer } from "../authz";
import { assertOrganizationRetentionWritable } from "../data_retention";
import { authorizeQuoteAdministrativeRecovery } from "../quote_authoring_access";
import {
  type MutationCtx,
} from "../types";
import { migratePriorRevisionDraftForAccess } from "../quote_response_drafts";
import {
  resolveQuoteInvitationBrowserWriteAccess,
  resolveQuoteInvitationClaimedWriteAccess,
} from "../quote_invitation_access";
import { prepareEffectiveLabourLinesForPackageRevision } from "../quote_rounds";

import type { Doc, Id } from "../types";

export const MAX_REOPEN_CLONE_SERIALIZED_BYTES = 12 * 1024 * 1024;
export const MAX_PACKAGE_REVISION_HISTORY = 20;
export type LifecycleCtx = MutationCtx & { viewer: AuthorizedViewer };

export function requiredReason(value: string, label: string) {
  const reason = value.trim();
  if (!reason) {
    throw new ConvexError(`${label} is required.`);
  }
  if (reason.length > 4000) {
    throw new ConvexError(`${label} must be 4000 characters or fewer.`);
  }
  return reason;
}

export function requiredConfirmation(confirmed: boolean, action: string) {
  if (!confirmed) {
    throw new ConvexError(`Explicit confirmation is required to ${action}.`);
  }
}

export async function authorizeLifecyclePath(
  ctx: LifecycleCtx,
  input: {
    administrativeCapacity?: "builder" | "builder-staff" | "admin";
    breakGlassConfirmed?: boolean;
    buildId: Id<"activeBuilds">;
    reason: string;
    workosOrganizationId: string;
  }
) {
  const baseAuthorization = await authorizeActiveBuildAccess(ctx, {
    buildId: input.buildId,
    organizationId: input.workosOrganizationId,
  });
  await assertOrganizationRetentionWritable(
    ctx,
    baseAuthorization.organizationId
  );
  return await authorizeQuoteAdministrativeRecovery(
    ctx,
    baseAuthorization,
    input
  );
}

export async function quoteInvitationReminderCooldownUntil(
  ctx: MutationCtx,
  invitationId: Id<"quoteRoundInvitations">,
  now: number
) {
  const reminders = await ctx.db
    .query("communicationIntents")
    .withIndex("by_quoteRoundInvitationId_and_createdAt", (query) =>
      query.eq("quoteRoundInvitationId", invitationId)
    )
    .order("desc")
    .take(20);
  const latestReminder = reminders.find(
    (intent) =>
      (intent.kind === "quote_invitation_reminder_manual" ||
        intent.kind === "quote_invitation_reminder_auto") &&
      intent.status !== "suppressed" &&
      intent.createdAt + 24 * 60 * 60 * 1000 > now
  );
  return latestReminder
    ? latestReminder.createdAt + 24 * 60 * 60 * 1000
    : undefined;
}

export function requireRound(
  round: Doc<"quoteRounds"> | null,
  authorization: ActiveBuildAuthorization,
  quoteRoundId: Id<"quoteRounds">
) {
  if (
    !round ||
    round._id !== quoteRoundId ||
    round.buildId !== authorization.build._id ||
    round.proposalId !== authorization.proposal._id ||
    round.brokerageId !== authorization.brokerage._id ||
    round.organizationId !== authorization.organizationId
  ) {
    throw new ConvexError("Quote Round is unavailable for this Build.");
  }
  return round;
}

export function assertExpectedRevision(
  round: Doc<"quoteRounds">,
  expectedRevision: number
) {
  if (
    !Number.isInteger(expectedRevision) ||
    expectedRevision !== round.revision
  ) {
    throw new ConvexError({
      code: "QUOTE_ROUND_REVISION_CONFLICT",
      currentRevision: round.revision,
      message: "Quote Round changed. Reload the latest lifecycle state.",
    });
  }
}

export function assertSafeFutureDeadline(
  deadline: number,
  now: number,
  label = "Quote Response Deadline"
) {
  if (!Number.isSafeInteger(deadline) || deadline <= now) {
    throw new ConvexError(`${label} must be a future safe integer.`);
  }
}

export async function appendLifecycleAudit(
  ctx: LifecycleCtx,
  authorization: ActiveBuildAuthorization,
  input: {
    entityId: string;
    entityType: string;
    eventType: string;
    command: string;
    priorState?: Record<string, unknown>;
    newState?: Record<string, unknown>;
    payloadPreview?: Record<string, unknown>;
    reason?: string;
    breakGlass?: boolean;
    overrideKind?: AuditOverrideKind;
    warnings?: string[];
  },
  now: number
) {
  await appendGovernedAuditEvent(ctx, authorization, {
    breakGlass: input.breakGlass,
    command: input.command,
    entityId: input.entityId,
    entityType: input.entityType,
    eventType: input.eventType,
    newState: input.newState ?? { status: "unspecified" },
    now,
    overrideKind: input.overrideKind,
    priorState: input.priorState ?? { status: "unspecified" },
    reason: input.reason ?? "Recorded material Quote lifecycle transition.",
    targetRevisions: [
      {
        entityId: input.entityId,
        entityType: input.entityType,
        revision:
          typeof input.newState?.revision === "number"
            ? input.newState.revision
            : undefined,
      },
    ],
    warnings: input.warnings,
  });
  await ctx.db.insert("eventOutbox", {
    brokerageId: authorization.brokerage._id,
    createdAt: now,
    eventType: input.eventType,
    organizationId: authorization.organizationId,
    payloadPreview: JSON.stringify({
      buildId: authorization.build._id,
      entityId: input.entityId,
      entityType: input.entityType,
      ...(input.payloadPreview ?? {}),
    }),
    relatedEntityId: input.entityId,
    relatedEntityType: input.entityType,
    status: "pending",
  });
}

export async function endInvitationAccess(
  ctx: MutationCtx,
  invitation: Doc<"quoteRoundInvitations">,
  now: number,
  credentialState: "revoked" | "rotated"
) {
  const credentials = await ctx.db
    .query("quoteInvitationAccessCredentials")
    .withIndex("by_quoteRoundInvitationId_and_state", (query) =>
      query.eq("quoteRoundInvitationId", invitation._id).eq("state", "active")
    )
    .take(101);
  if (credentials.length > 100) {
    throw new ConvexError("Quote Invitation has too many active credentials.");
  }
  for (const credential of credentials) {
    await ctx.db.patch(credential._id, {
      state: credentialState,
      updatedAt: now,
    });
    const sessions = await ctx.db
      .query("quoteInvitationBrowserSessions")
      .withIndex("by_quoteInvitationAccessCredentialId_and_state", (query) =>
        query
          .eq("quoteInvitationAccessCredentialId", credential._id)
          .eq("state", "active")
      )
      .take(13);
    if (sessions.length > 12) {
      throw new ConvexError("Quote Invitation has too many active sessions.");
    }
    for (const session of sessions) {
      await ctx.db.patch(session._id, { state: "revoked", updatedAt: now });
    }
  }
}

export async function nextCredentialVersion(
  ctx: MutationCtx,
  invitationId: Id<"quoteRoundInvitations">
) {
  const latestCredential = await ctx.db
    .query("quoteInvitationAccessCredentials")
    .withIndex("by_quoteRoundInvitationId_and_credentialVersion", (query) =>
      query.eq("quoteRoundInvitationId", invitationId)
    )
    .order("desc")
    .first();
  return (latestCredential?.credentialVersion ?? 0) + 1;
}

export async function acknowledgeForAccess(
  ctx: MutationCtx,
  access:
    | Awaited<ReturnType<typeof resolveQuoteInvitationBrowserWriteAccess>>
    | Awaited<ReturnType<typeof resolveQuoteInvitationClaimedWriteAccess>>,
  acknowledgedFieldKeys: string[],
  workosUserId?: string
) {
  assertAcknowledgedFieldKeysBounds(acknowledgedFieldKeys);
  if (
    access.status === "unavailable" ||
    access.status === "superseded" ||
    !access.scope
  ) {
    throw new ConvexError(
      "Quote Invitation is unavailable for acknowledgement."
    );
  }
  if (access.status !== "available") {
    throw new ConvexError(
      "Quote Package Revision acknowledgement is read-only."
    );
  }
  const scope = access.scope;
  await assertOrganizationRetentionWritable(
    ctx,
    scope.invitation.organizationId
  );
  const acknowledgement = await ctx.db
    .query("quoteInvitationPackageRevisionAcknowledgements")
    .withIndex(
      "by_quoteRoundInvitationId_and_quotePackageRevisionId",
      (query) =>
        query
          .eq("quoteRoundInvitationId", scope.invitation._id)
          .eq("quotePackageRevisionId", scope.packageRevision._id)
    )
    .unique();
  if (!acknowledgement) {
    return {
      acknowledgedFieldKeys: [],
      invitationId: scope.invitation._id,
      quotePackageRevisionId: scope.packageRevision._id,
      status: "acknowledged" as const,
    };
  }
  const keys = normalizeChangedFieldKeys(acknowledgedFieldKeys);
  const required = new Set(acknowledgement.changedFieldKeys);
  if (keys.length !== required.size || keys.some((key) => !required.has(key))) {
    throw new ConvexError(
      "Review and acknowledge every changed Quote Package field."
    );
  }
  await migratePriorRevisionDraftForAccess(ctx, scope);
  const now = Date.now();
  await ctx.db.patch(acknowledgement._id, {
    acknowledgedAt: now,
    acknowledgedByWorkosUserId: workosUserId,
    acknowledgedFieldKeys: keys,
    status: "acknowledged",
    updatedAt: now,
  });
  const notice = await ctx.db
    .query("quoteRoundRecipientNoticeIntents")
    .withIndex(
      "by_quoteRoundInvitationId_and_quotePackageRevisionId_and_kind",
      (query) =>
        query
          .eq("quoteRoundInvitationId", scope.invitation._id)
          .eq("quotePackageRevisionId", scope.packageRevision._id)
          .eq("kind", "package_revision_published")
    )
    .order("desc")
    .first();
  if (notice && notice.status === "pending") {
    await ctx.db.patch(notice._id, {
      acknowledgedAt: now,
      status: "acknowledged",
    });
  }
  return {
    acknowledgedFieldKeys: keys,
    invitationId: scope.invitation._id,
    quotePackageRevisionId: scope.packageRevision._id,
    status: "acknowledged" as const,
  };
}

export function normalizeChangedFieldKeys(values: string[] | undefined) {
  const keys = [
    ...new Set((values ?? []).map((value) => value.trim()).filter(Boolean)),
  ];
  if (keys.some((key) => key.length > 128)) {
    throw new ConvexError(
      "Changed Quote Package field keys must be 128 characters or fewer."
    );
  }
  if (keys.length > 100) {
    throw new ConvexError(
      "A Quote Package Revision may identify at most 100 changed fields."
    );
  }
  return keys;
}

const MAX_CHANGED_FIELD_KEYS = 100;
const ADDITIONAL_SCOPE_CHANGES_FIELD_KEY = "scope:additional";

export function normalizeChangedFieldKeysWithScopeSummary(input: {
  changedScopeFieldKeys: string[];
  explicitFieldKeys?: string[];
  responseDeadlineChanged: boolean;
}) {
  const explicit = normalizeChangedFieldKeys(input.explicitFieldKeys);
  const responseDeadlineKey = "responseDeadline";
  const includesResponseDeadline = explicit.includes(responseDeadlineKey);
  const requiredKeys =
    input.responseDeadlineChanged && !includesResponseDeadline
      ? [responseDeadlineKey]
      : [];
  if (explicit.length + requiredKeys.length > MAX_CHANGED_FIELD_KEYS) {
    throw new ConvexError(
      "A Quote Package Revision may identify at most 100 changed fields."
    );
  }

  const existing = new Set([...explicit, ...requiredKeys]);
  const changedScopeFieldKeys = [
    ...new Set(
      input.changedScopeFieldKeys
        .map((key) => key.trim())
        .filter(Boolean)
        .filter((key) => !existing.has(key))
    ),
  ];
  const available = MAX_CHANGED_FIELD_KEYS - existing.size;
  if (changedScopeFieldKeys.length <= available) {
    return normalizeChangedFieldKeys([
      ...explicit,
      ...requiredKeys,
      ...changedScopeFieldKeys,
    ]);
  }

  // Keep the acknowledgement payload bounded while preserving a truthful
  // signal that more Scope changes exist than can be listed individually.
  const summaryAlreadyPresent = existing.has(
    ADDITIONAL_SCOPE_CHANGES_FIELD_KEY
  );
  if (available === 0 && !summaryAlreadyPresent) {
    throw new ConvexError(
      "A Quote Package Revision may identify at most 100 changed fields."
    );
  }
  const summarySlots = summaryAlreadyPresent ? 0 : 1;
  const specificCapacity = Math.max(0, available - summarySlots);
  return normalizeChangedFieldKeys([
    ...explicit,
    ...requiredKeys,
    ...changedScopeFieldKeys.slice(0, specificCapacity),
    ...(summaryAlreadyPresent ? [] : [ADDITIONAL_SCOPE_CHANGES_FIELD_KEY]),
  ]);
}

export function assertAcknowledgedFieldKeysBounds(values: string[]) {
  if (values.length > 100) {
    throw new ConvexError(
      "A Quote Package Revision acknowledgement may include at most 100 fields."
    );
  }
}

export async function createReplacementRecipientProfile(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  invitation: Doc<"quoteRoundInvitations">,
  email: string,
  now: number
) {
  const profileId = await ctx.db.insert("contractorProfiles", {
    brokerageId: authorization.brokerage._id,
    createdAt: now,
    email,
    kind: "company",
    name: invitation.recipientNameSnapshot,
    normalizedEmail: email,
    onboardingStatus: "profile_only",
    organizationId: authorization.organizationId,
    quoteRecipientCapabilities: invitation.recipientCapabilitiesSnapshot,
    quoteRecipientProvisioningState: "provisional",
    source: "builder_created",
    status: "active",
    trades: [],
    updatedAt: now,
  });
  const profile = await ctx.db.get(profileId);
  if (!profile) {
    throw new ConvexError(
      "Replacement Quote recipient profile was not created."
    );
  }
  return profile;
}

export async function clonePackageRevisionRows(
  ctx: MutationCtx,
  previous: Doc<"quotePackageRevisions">,
  packageRevisionId: Id<"quotePackageRevisions">,
  quoteRoundId: Id<"quoteRounds">,
  authorization: ActiveBuildAuthorization,
  now: number,
  effectiveLabourLines: Awaited<
    ReturnType<typeof prepareEffectiveLabourLinesForPackageRevision>
  >
) {
  const [attachments, materialLines, responseFields] = await Promise.all([
    ctx.db
      .query("quotePackageRevisionAttachments")
      .withIndex("by_quotePackageRevisionId_and_order", (query) =>
        query.eq("quotePackageRevisionId", previous._id)
      )
      .take(201),
    ctx.db
      .query("quotePackageRevisionMaterialLines")
      .withIndex("by_quotePackageRevisionId_and_order", (query) =>
        query.eq("quotePackageRevisionId", previous._id)
      )
      .take(101),
    ctx.db
      .query("quotePackageRevisionResponseFields")
      .withIndex("by_quotePackageRevisionId_and_order", (query) =>
        query.eq("quotePackageRevisionId", previous._id)
      )
      .take(101),
  ]);
  if (
    attachments.length > 200 ||
    effectiveLabourLines.length > 100 ||
    materialLines.length > 100 ||
    responseFields.length > 100
  ) {
    throw new ConvexError(
      "Quote Package Revision exceeds supported scope limits."
    );
  }
  const assignmentsByMaterialLineId = new Map<
    Id<"quotePackageRevisionMaterialLines">,
    Doc<"quotePackageRevisionMaterialAssignments">[]
  >();
  for (const row of materialLines) {
    const assignments = await ctx.db
      .query("quotePackageRevisionMaterialAssignments")
      .withIndex("by_quotePackageRevisionMaterialLineId_and_order", (query) =>
        query.eq("quotePackageRevisionMaterialLineId", row._id)
      )
      .take(101);
    if (assignments.length > 100) {
      throw new ConvexError(
        "Quote Package Material line has too many assignments."
      );
    }
    assignmentsByMaterialLineId.set(row._id, assignments);
  }
  const serializedBytes = [
    ...attachments,
    ...effectiveLabourLines.map((line) => ({
      previousLine: line.previousLine,
      scopeOfWorkTiptapJson: line.scopeOfWorkTiptapJson,
      sourceScopeChangeReason: line.sourceScopeChangeReason,
      sourceScopeRevisionId: line.sourceScopeRevisionId,
      sourceScopeVersion: line.sourceScopeVersion,
    })),
    ...materialLines,
    ...responseFields,
    ...Array.from(assignmentsByMaterialLineId.values()).flat(),
  ].reduce((total, row) => total + serializedStringBytes(row), 0);
  if (serializedBytes > MAX_REOPEN_CLONE_SERIALIZED_BYTES) {
    throw new ConvexError(
      "Quote Package Revision content exceeds the transaction size safety limit."
    );
  }
  for (const row of attachments) {
    await ctx.db.insert("quotePackageRevisionAttachments", {
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      contentHashSha256Snapshot: row.contentHashSha256Snapshot,
      createdAt: now,
      fileNameSnapshot: row.fileNameSnapshot,
      kind: row.kind,
      mimeTypeSnapshot: row.mimeTypeSnapshot,
      order: row.order,
      organizationId: authorization.organizationId,
      quotePackageRevisionId: packageRevisionId,
      quoteRoundId,
      sizeBytesSnapshot: row.sizeBytesSnapshot,
      sourceBuildDocumentId: row.sourceBuildDocumentId,
      sourceBuildSubmilestoneId: row.sourceBuildSubmilestoneId,
      sourceDocumentVersionSnapshot: row.sourceDocumentVersionSnapshot,
      storageIdSnapshot: row.storageIdSnapshot,
    });
  }
  for (const effectiveLine of effectiveLabourLines) {
    const row = effectiveLine.previousLine;
    await ctx.db.insert("quotePackageRevisionLabourLines", {
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      buildMilestoneId: row.buildMilestoneId,
      buildSubmilestoneId: row.buildSubmilestoneId,
      budgetCents: row.budgetCents,
      createdAt: now,
      durationDays: row.durationDays,
      milestoneKey: row.milestoneKey,
      milestoneName: row.milestoneName,
      order: row.order,
      organizationId: authorization.organizationId,
      quotePackageRevisionId: packageRevisionId,
      quoteRoundId,
      scopeOfWorkTiptapJson: effectiveLine.scopeOfWorkTiptapJson,
      sourceScopeChangeReason: effectiveLine.sourceScopeChangeReason,
      sourceScopeRevisionId: effectiveLine.sourceScopeRevisionId,
      sourceScopeVersion: effectiveLine.sourceScopeVersion,
      startDay: row.startDay,
      submilestoneKey: row.submilestoneKey,
      submilestoneName: row.submilestoneName,
    });
  }
  const materialLineMap = new Map<
    Id<"quotePackageRevisionMaterialLines">,
    Id<"quotePackageRevisionMaterialLines">
  >();
  for (const row of materialLines) {
    const nextId = await ctx.db.insert("quotePackageRevisionMaterialLines", {
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      createdAt: now,
      deliveryEndDay: row.deliveryEndDay,
      deliveryInstructions: row.deliveryInstructions,
      deliveryLocation: row.deliveryLocation,
      deliveryStartDay: row.deliveryStartDay,
      description: row.description,
      order: row.order,
      organizationId: authorization.organizationId,
      quantity: row.quantity,
      quotePackageRevisionId: packageRevisionId,
      quoteRoundId,
      source: row.source,
      sourceBuildCostItemId: row.sourceBuildCostItemId,
      sourceDraftRowKey: row.sourceDraftRowKey,
      specificationTiptapJson: row.specificationTiptapJson,
      title: row.title,
      unit: row.unit,
    });
    materialLineMap.set(row._id, nextId);
  }
  for (const row of materialLines) {
    const nextLineId = materialLineMap.get(row._id);
    if (!nextLineId) {
      continue;
    }
    const assignments = assignmentsByMaterialLineId.get(row._id) ?? [];
    for (const assignment of assignments) {
      await ctx.db.insert("quotePackageRevisionMaterialAssignments", {
        brokerageId: authorization.brokerage._id,
        buildId: authorization.build._id,
        buildMilestoneId: assignment.buildMilestoneId,
        buildSubmilestoneId: assignment.buildSubmilestoneId,
        createdAt: now,
        durationDays: assignment.durationDays,
        milestoneKey: assignment.milestoneKey,
        milestoneName: assignment.milestoneName,
        order: assignment.order,
        organizationId: authorization.organizationId,
        quotePackageRevisionId: packageRevisionId,
        quotePackageRevisionMaterialLineId: nextLineId,
        quoteRoundId,
        startDay: assignment.startDay,
        submilestoneKey: assignment.submilestoneKey,
        submilestoneName: assignment.submilestoneName,
      });
    }
  }
  for (const row of responseFields) {
    await ctx.db.insert("quotePackageRevisionResponseFields", {
      allowAlternates: row.allowAlternates,
      allowExclusions: row.allowExclusions,
      brokerageId: authorization.brokerage._id,
      buildId: authorization.build._id,
      choiceOptions: row.choiceOptions,
      createdAt: now,
      fieldKey: row.fieldKey,
      isPermanent: row.isPermanent,
      kind: row.kind,
      label: row.label,
      order: row.order,
      organizationId: authorization.organizationId,
      quotePackageRevisionId: packageRevisionId,
      quoteRoundId,
      renderer: row.renderer,
      repeatable: row.repeatable,
      required: row.required,
      richTextDefaultHtml: row.richTextDefaultHtml,
      scope: row.scope,
      sourceTemplateFieldId: row.sourceTemplateFieldId,
      supportsTax: row.supportsTax,
      tax: row.tax,
      validation: row.validation,
    });
  }
}

export function serializedStringBytes(value: unknown) {
  return new TextEncoder().encode(JSON.stringify(value) ?? "").byteLength;
}
