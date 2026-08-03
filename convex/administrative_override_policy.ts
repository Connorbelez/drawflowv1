import { ConvexError, v } from "convex/values";

import {
  type ActiveBuildAuthorization,
  selectActiveBuildAuthorizationCapacity,
} from "./activeBuildAccess";
import type { Id, MutationCtx, QueryCtx } from "./types";

const MAX_SECURITY_RECIPIENTS = 200;
const MAX_AUDIT_ARRAY_ITEMS = 100;
const MAX_AUDIT_OBJECT_KEYS = 100;
const MAX_AUDIT_DEPTH = 8;
const FORBIDDEN_AUDIT_KEY =
  /(?:^|_)(?:credential(?!_version(?:_|$))|verifier|api_key|file_bytes|rendered_email|raw_provider_payload|payload(?:_snapshot)?|secret|token|signature|signed|signing_key_material|magic(?:_link)?|content|body|html|tiptap)(?:_|$)/;
const AUDIT_EMAIL_KEY = /(?:^|_)(?:recipient_)?email(?:$|_)/;
const AUDIT_SECRET_VALUE =
  /(?:dfwhsec_[A-Za-z0-9-]+|bearer\s+[A-Za-z0-9._~-]+|(?:secret|token|verifier|signingKeyMaterial)\s*[:=]\s*[^\s,}]+)/gi;
const AUDIT_EMAIL_VALUE = /\b[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})\b/gi;

export const AUDIT_OVERRIDE_KINDS = [
  "delivery_retry",
  "access_rotation",
  "access_revocation",
  "revision_extension",
  "revision_reopen",
  "corrected_recipient_replacement",
  "cost_supersede",
  "cost_void",
  "preferred_set",
  "preferred_clear",
] as const;

export const auditOverrideKindValidator = v.union(
  ...AUDIT_OVERRIDE_KINDS.map((kind) => v.literal(kind))
);

export type AuditOverrideKind = (typeof AUDIT_OVERRIDE_KINDS)[number];

export const administrativeCapacityValidator = v.union(
  v.literal("builder"),
  v.literal("builder-staff"),
  v.literal("admin")
);

export const administrativeOverrideInputFields = {
  administrativeCapacity: v.optional(administrativeCapacityValidator),
  breakGlassConfirmed: v.optional(v.boolean()),
};

export interface AdministrativeRecoveryAuthorization {
  authorization: ActiveBuildAuthorization;
  breakGlass: boolean;
}

export interface AuditRevisionReference {
  entityId: string;
  entityType: string;
  revision?: number;
}

type AdministrativePolicyCtx = (QueryCtx | MutationCtx) & {
  viewer: ActiveBuildAuthorization["viewer"];
};

export function requiredAdministrativeReason(value: string, label: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new ConvexError(`${label} is required.`);
  }
  if (trimmed.length > 4000) {
    throw new ConvexError(`${label} must be 4000 characters or fewer.`);
  }
  const reason = sanitizeAuditText(trimmed);
  if (!reason.trim()) {
    throw new ConvexError(`${label} is required.`);
  }
  return reason;
}

export function maskRecipientEmailForAudit(email: string) {
  const normalized = email.trim().toLowerCase();
  const separator = normalized.lastIndexOf("@");
  if (separator < 1 || separator === normalized.length - 1) {
    return "redacted";
  }
  const local = normalized.slice(0, separator);
  const domain = normalized.slice(separator + 1);
  if (local.length === 1) {
    return `***@${domain}`;
  }
  return `${local.slice(0, 1)}${"*".repeat(Math.min(6, Math.max(2, local.length - 1)))}@${domain}`;
}

export async function authorizeAdministrativeRecovery(
  ctx: AdministrativePolicyCtx,
  baseAuthorization: ActiveBuildAuthorization,
  input: {
    administrativeCapacity?: "builder" | "builder-staff" | "admin";
    breakGlassConfirmed?: boolean;
    reason: string;
  }
): Promise<AdministrativeRecoveryAuthorization> {
  if (baseAuthorization.viewer.actorKind !== "human") {
    throw new ConvexError(
      "Forbidden: administrative recovery requires a human actor."
    );
  }
  const capacity =
    input.administrativeCapacity ??
    (baseAuthorization.roles.includes("builder")
      ? "builder"
      : baseAuthorization.roles.includes("builder-staff")
        ? "builder-staff"
        : baseAuthorization.roles.includes("admin")
          ? "admin"
          : undefined);
  if (!capacity) {
    throw new ConvexError(
      "Forbidden: this Build role cannot perform administrative recovery."
    );
  }
  let authorization: ActiveBuildAuthorization;
  try {
    authorization = selectActiveBuildAuthorizationCapacity(
      baseAuthorization,
      capacity
    );
  } catch {
    throw new ConvexError(
      "Forbidden: the requested administrative capacity is unavailable."
    );
  }
  if (
    capacity === "builder-staff" &&
    !(await hasBuilderStaffRecoveryGrant(ctx, authorization))
  ) {
    throw new ConvexError(
      "Forbidden: Builder Staff requires an explicit Build update grant for administrative recovery."
    );
  }
  if (capacity === "admin") {
    if (!input.breakGlassConfirmed) {
      throw new ConvexError(
        "Brokerage Admin recovery requires explicit break-glass confirmation."
      );
    }
    requiredAdministrativeReason(input.reason, "A break-glass reason");
    return { authorization, breakGlass: true };
  }
  if (input.breakGlassConfirmed) {
    throw new ConvexError(
      "Break-glass confirmation is valid only for Brokerage Admin recovery."
    );
  }
  return { authorization, breakGlass: false };
}

export async function appendGovernedAuditEvent(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  input: {
    breakGlass?: boolean;
    command: string;
    drawFlowCorrelationId?: string;
    entityId: string;
    entityType: string;
    eventType: string;
    newState: object;
    now: number;
    overrideKind?: AuditOverrideKind;
    priorState: object;
    providerCorrelationId?: string;
    reason: string;
    targetRevisions: AuditRevisionReference[];
    warnings?: string[];
  }
) {
  const reason = requiredAdministrativeReason(
    input.reason,
    "An administrative action reason"
  );
  const priorState = privacyMinimizedAuditState(input.priorState);
  const newState = privacyMinimizedAuditState(input.newState);
  if (
    input.overrideKind !== undefined &&
    !AUDIT_OVERRIDE_KINDS.includes(input.overrideKind)
  ) {
    throw new ConvexError("Canonical audit override kind is not allowed.");
  }
  if (input.targetRevisions.length > MAX_AUDIT_ARRAY_ITEMS) {
    throw new ConvexError("Canonical audit target revisions exceed the bound.");
  }
  const securityRecipients = input.breakGlass
    ? await securityCriticalBreakGlassRecipients(ctx, authorization)
    : undefined;
  const warnings = input.breakGlass
    ? ["BREAK_GLASS_ADMINISTRATIVE_OVERRIDE", ...(input.warnings ?? [])]
    : (input.warnings ?? []);
  if (securityRecipients?.truncated) {
    warnings.push("BREAK_GLASS_NOTIFICATION_RECIPIENTS_TRUNCATED");
  }
  const auditEventId = await ctx.db.insert("auditEvents", {
    actorKind: authorization.viewer.actorKind,
    actorRole: authorization.effectiveRole.role,
    actorRoles: authorization.viewer.roles,
    actorWorkosUserId: authorization.viewer.subject,
    breakGlass: input.breakGlass || undefined,
    brokerageId: authorization.brokerage._id,
    buildId: authorization.build._id,
    command: input.command,
    createdAt: input.now,
    drawFlowCorrelationId: input.drawFlowCorrelationId,
    effectiveCapacity: authorization.effectiveRole.role,
    entityId: input.entityId,
    entityType: input.entityType,
    eventType: input.eventType,
    newState: JSON.stringify(newState),
    organizationId: authorization.organizationId,
    providerCorrelationId: input.providerCorrelationId,
    reason,
    targetRevisions: input.targetRevisions.slice(0, MAX_AUDIT_ARRAY_ITEMS),
    overrideKind: input.overrideKind,
    priorState: JSON.stringify(priorState),
    warnings: warnings.slice(0, MAX_AUDIT_ARRAY_ITEMS),
  });
  if (input.breakGlass) {
    await notifySecurityCriticalBreakGlass(ctx, authorization, {
      auditEventId,
      command: input.command,
      entityId: input.entityId,
      entityType: input.entityType,
      now: input.now,
      recipientWorkosUserIds: securityRecipients?.recipientWorkosUserIds ?? [
        authorization.viewer.subject,
      ],
      reason,
    });
  }
  return auditEventId;
}

function privacyMinimizedAuditState(
  value: unknown,
  path = "state",
  depth = 0
): unknown {
  if (depth > MAX_AUDIT_DEPTH) {
    throw new ConvexError(
      `Canonical audit state exceeds the nesting bound at ${path}.`
    );
  }
  if (value === null || typeof value !== "object") {
    return typeof value === "string" ? sanitizeAuditText(value) : value;
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_AUDIT_ARRAY_ITEMS) {
      throw new ConvexError(
        `Canonical audit state exceeds the array bound at ${path}.`
      );
    }
    return value.map((entry, index) =>
      privacyMinimizedAuditState(entry, `${path}[${index}]`, depth + 1)
    );
  }
  const entries = Object.entries(value);
  if (entries.length > MAX_AUDIT_OBJECT_KEYS) {
    throw new ConvexError(
      `Canonical audit state exceeds the object bound at ${path}.`
    );
  }
  const output: Record<string, unknown> = {};
  for (const [key, entry] of entries) {
    const normalizedKey = key
      .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
      .replace(/[-\s]+/g, "_")
      .toLowerCase();
    if (FORBIDDEN_AUDIT_KEY.test(normalizedKey)) {
      throw new ConvexError(
        `Canonical audit rejected restricted field ${path}.${key}.`
      );
    }
    if (AUDIT_EMAIL_KEY.test(normalizedKey)) {
      output[key] = maskRecipientEmailForAudit(String(entry));
      continue;
    }
    output[key] = privacyMinimizedAuditState(
      entry,
      `${path}.${key}`,
      depth + 1
    );
  }
  return output;
}

function sanitizeAuditText(value: string) {
  return value
    .replace(AUDIT_SECRET_VALUE, "[secret redacted]")
    .replace(AUDIT_EMAIL_VALUE, (_match, domain: string) =>
      maskRecipientEmailForAudit(`r@${domain}`)
    )
    .slice(0, 4000);
}

async function hasBuilderStaffRecoveryGrant(
  ctx: QueryCtx | MutationCtx,
  authorization: ActiveBuildAuthorization
) {
  const links = await ctx.db
    .query("builderAccountLinks")
    .withIndex("by_builder_user", (query) =>
      query
        .eq("builderProfileId", authorization.build.builderProfileId)
        .eq("workosUserId", authorization.viewer.subject)
    )
    .take(20);
  const activeStaffLinks = links.filter(
    (link) => link.status === "active" && link.role === "staff"
  );
  for (const link of activeStaffLinks) {
    const grants = await ctx.db
      .query("builderStaffPermissionGrants")
      .withIndex("by_build_link_resource", (query) =>
        query
          .eq("buildId", authorization.build._id)
          .eq("builderAccountLinkId", link._id)
      )
      .take(100);
    if (grants.some((grant) => grant.canUpdate)) {
      return true;
    }
  }
  return false;
}

async function notifySecurityCriticalBreakGlass(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization,
  input: {
    auditEventId: Id<"auditEvents">;
    command: string;
    entityId: string;
    entityType: string;
    now: number;
    recipientWorkosUserIds: string[];
    reason: string;
  }
) {
  for (const recipientWorkosUserId of input.recipientWorkosUserIds) {
    const dedupeKey = `security:break-glass:${input.auditEventId}:${recipientWorkosUserId}`;
    await ctx.db.insert("recipientDeliveries", {
      actionLabel: "Review audit event",
      actionRequired: true,
      body: `${input.command} used Brokerage Admin break-glass authority. Reason: ${input.reason}`.slice(
        0,
        280
      ),
      brokerageId: authorization.brokerage._id,
      collaborationBuildId: authorization.build._id,
      createdAt: input.now,
      dedupeKey,
      entityId: input.entityId,
      entityLabel: authorization.build.buildName,
      entityType: input.entityType,
      href: `/backoffice/builds/${authorization.build._id}?tab=details&auditEvent=${input.auditEventId}`,
      inAppVisible: true,
      organizationId: authorization.organizationId,
      recipientWorkosUserId,
      resolutionMode: "recipient",
      sourceLabel: "Security",
      status: "unread",
      title: "Security-critical break-glass action",
      updatedAt: input.now,
    });
  }
}

async function securityCriticalBreakGlassRecipients(
  ctx: MutationCtx,
  authorization: ActiveBuildAuthorization
) {
  const membershipsBySecurityRole = await Promise.all(
    ["admin", "principle-broker"].map((roleSlug) =>
      ctx.db
        .query("workosOrganizationMemberships")
        .withIndex("by_organization_and_status_and_roleSlug", (query) =>
          query
            .eq("workosOrganizationId", authorization.organizationId)
            .eq("status", "active")
            .eq("roleSlug", roleSlug)
        )
        .take(MAX_SECURITY_RECIPIENTS + 1)
    )
  );
  const eligibleRecipientWorkosUserIds = [
    ...new Set(
      membershipsBySecurityRole
        .flat()
        .filter(
          (membership) =>
            membership.roleSlugs.includes("admin") ||
            membership.roleSlugs.includes("principle-broker")
        )
        .map((membership) => membership.workosUserId)
    ),
  ].sort();
  return {
    recipientWorkosUserIds:
      eligibleRecipientWorkosUserIds.length === 0
        ? [authorization.viewer.subject]
        : eligibleRecipientWorkosUserIds.slice(0, MAX_SECURITY_RECIPIENTS),
    truncated: eligibleRecipientWorkosUserIds.length > MAX_SECURITY_RECIPIENTS,
  };
}
