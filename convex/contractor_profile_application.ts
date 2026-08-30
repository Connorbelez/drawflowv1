import type { RoleSlug } from "./authz";
import { normalizeContractorEmail } from "./contractorWorkspace/access";
import type { Doc, Id, MutationCtx } from "./types";

type ContractorProfileInsert = Omit<
  Doc<"contractorProfiles">,
  "_creationTime" | "_id"
>;

export type ContractorProfileCreateFields = Omit<
  ContractorProfileInsert,
  | "brokerageId"
  | "createdAt"
  | "organizationId"
  | "status"
  | "trades"
  | "updatedAt"
> &
  Partial<Pick<ContractorProfileInsert, "status" | "trades">>;

export type ContractorProfilePatch = Partial<
  Omit<
    ContractorProfileInsert,
    "brokerageId" | "createdAt" | "organizationId" | "updatedAt"
  >
>;

function hasOwn(value: object, key: PropertyKey) {
  return Object.getOwnPropertyDescriptor(value, key) !== undefined;
}

export function buildCanonicalContractorProfileInsert(input: {
  brokerageId: Id<"brokerages">;
  fields: ContractorProfileCreateFields;
  now: number;
  organizationId: string;
}): ContractorProfileInsert {
  const organizationId = input.organizationId.trim();
  const name = input.fields.name.trim();
  if (!organizationId) {
    throw new Error("Contractor organization is required.");
  }
  if (!name) {
    throw new Error("Contractor name is required.");
  }
  const email = input.fields.email?.trim() || undefined;
  const normalizedEmail = normalizeContractorEmail(email) || undefined;
  if (
    input.fields.normalizedEmail !== undefined &&
    input.fields.normalizedEmail !== normalizedEmail
  ) {
    throw new Error("Contractor normalized email is inconsistent.");
  }
  return {
    ...input.fields,
    brokerageId: input.brokerageId,
    createdAt: input.now,
    email,
    name,
    normalizedEmail,
    organizationId,
    status: input.fields.status ?? "active",
    trades: input.fields.trades ?? [],
    updatedAt: input.now,
  };
}

export async function createCanonicalContractorProfile(
  ctx: MutationCtx,
  input: {
    brokerageId: Id<"brokerages">;
    fields: ContractorProfileCreateFields;
    now: number;
    organizationId: string;
  }
) {
  return await ctx.db.insert(
    "contractorProfiles",
    buildCanonicalContractorProfileInsert(input)
  );
}

export function buildCanonicalContractorProfilePatch(
  current: Doc<"contractorProfiles">,
  patch: ContractorProfilePatch,
  now: number
): ContractorProfilePatch & { updatedAt: number } {
  const next = { ...patch };
  if (hasOwn(next, "name")) {
    const name = next.name?.trim();
    if (!name) {
      throw new Error("Contractor name is required.");
    }
    next.name = name;
  }
  if (hasOwn(next, "email")) {
    const email = next.email?.trim() || undefined;
    const normalizedEmail = normalizeContractorEmail(email) || undefined;
    if (
      next.normalizedEmail !== undefined &&
      next.normalizedEmail !== normalizedEmail
    ) {
      throw new Error("Contractor normalized email is inconsistent.");
    }
    next.email = email;
    next.normalizedEmail = normalizedEmail;
  } else if (
    hasOwn(next, "normalizedEmail") &&
    next.normalizedEmail !== normalizeContractorEmail(current.email)
  ) {
    throw new Error("Contractor normalized email is inconsistent.");
  }
  return { ...next, updatedAt: now };
}

/** The single persistence seam for canonical Contractor Profile changes. */
export async function patchCanonicalContractorProfile(
  ctx: MutationCtx,
  input: {
    brokerageId: Id<"brokerages">;
    contractorId: Id<"contractorProfiles">;
    now: number;
    organizationId: string;
    patch: ContractorProfilePatch;
  }
) {
  const contractor = await ctx.db.get(input.contractorId);
  if (
    !contractor ||
    contractor.brokerageId !== input.brokerageId ||
    contractor.organizationId !== input.organizationId
  ) {
    throw new Error("Contractor not found in brokerage.");
  }
  await ctx.db.patch(
    contractor._id,
    buildCanonicalContractorProfilePatch(contractor, input.patch, input.now)
  );
  const updated = await ctx.db.get(contractor._id);
  if (!updated) {
    throw new Error("Contractor profile became unavailable during update.");
  }
  return updated;
}

/** Shared audit adapter for canonical Contractor Profile lifecycle changes. */
export async function writeContractorIdentityEvent(
  ctx: MutationCtx,
  input: {
    actorRoles: readonly RoleSlug[];
    actorSubject: string;
    brokerageId: Id<"brokerages">;
    command: string;
    contractorId: Id<"contractorProfiles">;
    entityType?: string;
    eventType: string;
    newState?: string;
    organizationId: string;
    priorState?: string;
    reason?: string;
    warnings?: string[];
  }
) {
  await ctx.db.insert("auditEvents", {
    actorRoles: input.actorRoles as RoleSlug[],
    actorWorkosUserId: input.actorSubject,
    brokerageId: input.brokerageId,
    command: input.command,
    createdAt: Date.now(),
    entityId: String(input.contractorId),
    entityType: input.entityType ?? "contractorProfile",
    eventType: input.eventType,
    newState: input.newState,
    organizationId: input.organizationId,
    priorState: input.priorState,
    reason: input.reason,
    warnings: input.warnings ?? [],
  });
}
