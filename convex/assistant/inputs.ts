import { api } from "../_generated/api";
import type { RoleSlug } from "../authz";
import {
  BACKOFFICE_ROLES,
  BUILDER_ROLES,
  MUTATION_ACTION_KEYS,
  READONLY_CLIENT_ACTION_KEYS,
  TOTAL_BPS,
  type AssistantActionInput,
  type AssistantActionKey,
  type MutationActionKey,
  type ReadonlyClientActionKey,
} from "./contracts";
import type { Id, MutationCtx, QueryCtx, TableNames } from "../types";

export async function runDomainMutation(
  ctx: MutationCtx,
  name: string,
  args: Record<string, unknown>
) {
  return await (ctx as any).runMutation(
    (api as any).production_proposals[name],
    stripUndefined(args)
  );
}

export async function runCollaborationMutation(
  ctx: MutationCtx,
  name: string,
  args: Record<string, unknown>
) {
  return await (ctx as any).runMutation(
    (api as any).proposal_collaboration[name],
    stripUndefined(args)
  );
}

export function stripUndefined(value: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(value).filter(([, nested]) => nested !== undefined)
  );
}

export function optionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

export function reasonOrNote(input: AssistantActionInput) {
  return requiredReason(input.reason ?? input.note);
}

export function normalizeLoanFacility(input: AssistantActionInput) {
  const loanFacility = normalizeRecord(input.loanFacility, "loanFacility");
  return {
    interestAnnualBps: requiredNumber(
      loanFacility.interestAnnualBps ?? input.interestAnnualBps ?? 925,
      "interestAnnualBps"
    ),
    principalCents: requiredPositiveCents(
      loanFacility.principalCents ??
        input.principalCents ??
        input.approvedAmountCents,
      "Loan principal must be greater than zero."
    ),
  };
}

export function normalizeTimelineMilestoneInput(input: AssistantActionInput) {
  const milestone = normalizeRecord(input.milestone ?? input, "milestone");
  const dayStart = Math.max(
    0,
    Math.round(
      requiredNumber(milestone.dayStart ?? milestone.x ?? 0, "dayStart")
    )
  );
  const durationDays = Math.max(
    1,
    Math.round(
      requiredNumber(
        milestone.durationDays ??
          (typeof milestone.dayEnd === "number"
            ? milestone.dayEnd - dayStart
            : 1),
        "durationDays"
      )
    )
  );
  const submilestones = normalizeSubmilestones(milestone.submilestones);
  if (submilestones.length === 0) {
    throw new Error("Milestone creation requires at least one Sub-milestone.");
  }
  return {
    budgetCents: requiredPositiveCents(
      milestone.budgetCents ?? milestone.amountCents,
      "Milestone budget must be greater than zero."
    ),
    dayEnd: Math.max(
      dayStart,
      Math.round(optionalNumber(milestone.dayEnd) ?? dayStart + durationDays)
    ),
    dayStart,
    dependencyKeys: stringArray(milestone.dependencyKeys),
    durationDays,
    icon: optionalString(milestone.icon),
    key: requiredString(
      milestone.key ?? milestone.milestoneKey,
      "milestoneKey"
    ),
    name: requiredString(milestone.name ?? milestone.title, "Milestone name"),
    order: Math.max(1, Math.round(optionalNumber(milestone.order) ?? 1)),
    submilestones,
  };
}

export function timelineMilestonePatchInput(input: AssistantActionInput) {
  return stripUndefined({
    budgetCents: optionalNumber(input.budgetCents),
    dayEnd: optionalNumber(input.dayEnd),
    dayStart: optionalNumber(input.dayStart),
    dependencyKeys: Array.isArray(input.dependencyKeys)
      ? stringArray(input.dependencyKeys)
      : undefined,
    drawAvailabilityCents: optionalNumber(input.drawAvailabilityCents),
    durationDays: optionalNumber(input.durationDays),
    evidenceState: optionalString(input.evidenceState),
    icon: optionalString(input.icon),
    isDragLocked:
      typeof input.isDragLocked === "boolean" ? input.isDragLocked : undefined,
    lane: optionalNumber(input.lane),
    markerLabel: optionalString(input.markerLabel),
    milestoneKey: requiredString(input.milestoneKey, "milestoneKey"),
    name: optionalString(input.name ?? input.title),
    order: optionalNumber(input.order),
    policyState: optionalString(input.policyState),
    progressPercent: optionalNumber(input.progressPercent),
    status: optionalString(input.status),
    submilestones: input.submilestones
      ? normalizeSubmilestones(input.submilestones)
      : undefined,
    tone: optionalString(input.tone),
  });
}

export function timelineDrawInput(input: AssistantActionInput) {
  return stripUndefined({
    amountCents: requiredPositiveCents(
      input.amountCents,
      "Draw amount must be greater than zero."
    ),
    customDate:
      typeof input.customDate === "boolean" ? input.customDate : undefined,
    drawKey: requiredString(input.drawKey, "drawKey"),
    itemMilestoneKey: optionalString(
      input.itemMilestoneKey ?? input.milestoneKey
    ),
    label: requiredString(input.label ?? input.drawKey, "label"),
    order: optionalNumber(input.order),
    x: requiredNonNegativeDay(input.x ?? input.timingDay, "timingDay"),
  });
}

export function timelineDrawPatchInput(input: AssistantActionInput) {
  return stripUndefined({
    amountCents: optionalNumber(input.amountCents),
    customDate:
      typeof input.customDate === "boolean" ? input.customDate : undefined,
    drawKey: requiredString(input.drawKey, "drawKey"),
    itemMilestoneKey: optionalString(
      input.itemMilestoneKey ?? input.milestoneKey
    ),
    label: optionalString(input.label),
    order: optionalNumber(input.order),
    x: optionalNumber(input.x ?? input.timingDay),
  });
}

export function capitalEventInput(input: AssistantActionInput) {
  return stripUndefined({
    amountCents: requiredPositiveCents(
      input.amountCents,
      "Capital event amount must be greater than zero."
    ),
    capitalEventKey: requiredString(
      input.capitalEventKey ?? input.eventKey,
      "capitalEventKey"
    ),
    eventKind:
      input.eventKind === "cashInfusion" ||
      input.eventKind === "homeEquityTakeout"
        ? input.eventKind
        : "cost",
    interestAnnualBps: optionalNumber(input.interestAnnualBps),
    label: requiredString(input.label ?? input.capitalEventKey, "label"),
    order: optionalNumber(input.order),
    x: requiredProposalTimelineDay(input.x ?? input.timingDay, "x"),
  });
}

export function capitalEventPatchInput(input: AssistantActionInput) {
  return stripUndefined({
    amountCents: optionalNumber(input.amountCents),
    capitalEventKey: requiredString(
      input.capitalEventKey ?? input.eventKey,
      "capitalEventKey"
    ),
    eventKind:
      input.eventKind === "cashInfusion" ||
      input.eventKind === "cost" ||
      input.eventKind === "homeEquityTakeout"
        ? input.eventKind
        : undefined,
    interestAnnualBps: optionalNumber(input.interestAnnualBps),
    label: optionalString(input.label),
    order: optionalNumber(input.order),
    x: optionalNumber(input.x ?? input.timingDay),
  });
}

export function costItemInput(input: AssistantActionInput) {
  return stripUndefined({
    costCents: requiredPositiveCents(
      input.costCents ?? input.amountCents,
      "Cost item amount must be greater than zero."
    ),
    description: optionalString(input.description),
    itemType: input.itemType === "equipment" ? "equipment" : "material",
    milestoneKey: requiredString(input.milestoneKey, "milestoneKey"),
    quantity: Math.max(1, Math.round(optionalNumber(input.quantity) ?? 1)),
    reason: optionalString(input.reason),
    relevantSubmilestoneKeys: stringArray(input.relevantSubmilestoneKeys),
    supplier: optionalString(input.supplier),
    title: requiredString(input.title ?? input.name, "Cost item title"),
  });
}

export function costItemPatchInput(input: AssistantActionInput) {
  return stripUndefined({
    costCents: optionalNumber(input.costCents ?? input.amountCents),
    description: optionalString(input.description),
    itemId: input.itemId,
    itemType:
      input.itemType === "equipment" || input.itemType === "material"
        ? input.itemType
        : undefined,
    milestoneKey: optionalString(input.milestoneKey),
    quantity: optionalNumber(input.quantity),
    reason: optionalString(input.reason),
    relevantSubmilestoneKeys: Array.isArray(input.relevantSubmilestoneKeys)
      ? stringArray(input.relevantSubmilestoneKeys)
      : undefined,
    supplier: optionalString(input.supplier),
    title: optionalString(input.title ?? input.name),
  });
}

export function contractorAttachmentInput(input: AssistantActionInput) {
  return stripUndefined({
    agreedRateCents: optionalNumber(input.agreedRateCents),
    agreedRateUnit: optionalString(input.agreedRateUnit),
    contractorId: input.contractorId,
    endDate: optionalString(input.endDate),
    endDay: optionalNumber(input.endDay),
    notes: optionalString(input.notes ?? input.note),
    role: requiredString(input.role, "role"),
    startDate: optionalString(input.startDate),
    startDay: optionalNumber(input.startDay),
  });
}

export function contractorScopeAssignmentInput(input: AssistantActionInput) {
  return stripUndefined({
    actualCostCents: optionalNumber(input.actualCostCents),
    actualHours: optionalNumber(input.actualHours),
    agreedRateCents: optionalNumber(input.agreedRateCents),
    agreedRateUnit: optionalString(input.agreedRateUnit),
    contractorId: input.contractorId,
    costNotes: optionalString(input.costNotes),
    estimatedCostCents: optionalNumber(input.estimatedCostCents),
    estimatedHours: optionalNumber(input.estimatedHours),
    milestoneKey: requiredString(input.milestoneKey, "milestoneKey"),
    note: optionalString(input.note),
    postHoc: typeof input.postHoc === "boolean" ? input.postHoc : undefined,
    role: requiredString(input.role, "role"),
    status: optionalString(input.status),
    submilestoneKeys: stringArray(
      input.submilestoneKeys ?? input.subMilestoneKeys
    ),
  });
}

export function normalizeContractorInput(value: unknown) {
  const input = normalizeRecord(value, "contractor");
  return stripUndefined({
    accountWorkosUserId: optionalString(input.accountWorkosUserId),
    availabilityWindows: Array.isArray(input.availabilityWindows)
      ? input.availabilityWindows
      : [],
    capabilities: Array.isArray(input.capabilities) ? input.capabilities : [],
    city: optionalString(input.city),
    defaultPayRateCents: optionalNumber(input.defaultPayRateCents),
    defaultPayRateUnit: optionalString(input.defaultPayRateUnit),
    email: optionalString(input.email),
    equipment: Array.isArray(input.equipment) ? input.equipment : [],
    kind: input.kind === "individual" ? "individual" : "company",
    name: requiredString(input.name, "Contractor name"),
    phone: optionalString(input.phone),
    trades: stringArray(input.trades).length
      ? stringArray(input.trades)
      : ["general"],
  });
}

export function timelinePlanStateInput(input: AssistantActionInput) {
  return {
    currentDay: requiredNumber(input.currentDay, "currentDay"),
    minimumCashReserveCents: optionalNumber(input.minimumCashReserveCents),
    progressValue: requiredNumber(input.progressValue, "progressValue"),
    rangeMax: requiredNumber(input.rangeMax, "rangeMax"),
    rangeMin: requiredNumber(input.rangeMin, "rangeMin"),
    routeState: normalizeRecord(input.routeState, "routeState"),
    startingCashCents: requiredPositiveCents(
      input.startingCashCents,
      "Starting cash must be greater than zero."
    ),
  };
}

export function normalizeSetupMilestones(value: unknown) {
  return arrayInput(value, "milestones").map((row, index) => {
    const record = normalizeRecord(row, "milestone");
    const data = normalizeRecord(record.data ?? {}, "milestone.data");
    const key = requiredString(
      record.key ?? record.id ?? data.key ?? data.milestoneKey,
      "milestoneKey"
    );
    const dayStart = Math.max(
      0,
      Math.round(
        optionalNumber(record.dayStart ?? record.x ?? data.dayStart) ?? 0
      )
    );
    const durationDays = Math.max(
      1,
      Math.round(optionalNumber(record.durationDays ?? data.durationDays) ?? 1)
    );
    const budgetCents = requiredPositiveCents(
      record.budgetCents ??
        data.budgetCents ??
        (typeof data.amount === "number" ? data.amount * 100 : undefined),
      "Milestone budget must be greater than zero."
    );
    return {
      budgetCents,
      dayEnd: Math.max(
        dayStart,
        Math.round(
          optionalNumber(record.dayEnd ?? data.dayEnd) ??
            dayStart + durationDays
        )
      ),
      dayStart,
      dependencyKeys: stringArray(record.dependencyKeys ?? data.dependencyKeys),
      durationDays,
      icon: optionalString(record.icon ?? data.icon),
      key,
      name: requiredString(
        record.name ?? record.label ?? data.name ?? data.label,
        "Milestone name"
      ),
      order: Math.max(1, Math.round(optionalNumber(record.order) ?? index + 1)),
      submilestones: normalizeSubmilestones(
        record.submilestones ??
          record.subMilestones ??
          record.submilestoneDetails ??
          data.submilestoneDetails
      ),
    };
  });
}

export function normalizeSubmilestones(value: unknown) {
  return arrayInput(value, "submilestones", true).map((row, index) => {
    const record = normalizeRecord(row, "submilestone");
    const key = requiredString(record.key ?? record.id, "submilestone key");
    return stripUndefined({
      budgetCents: optionalNumber(record.budgetCents),
      durationDays: optionalNumber(record.durationDays),
      key,
      name: requiredString(record.name ?? record.label, "submilestone name"),
      order: Math.max(1, Math.round(optionalNumber(record.order) ?? index + 1)),
      startDay: optionalNumber(record.startDay),
    });
  });
}

export function normalizeSetupCostItems(value: unknown) {
  return arrayInput(value, "costItems", true).map((row) => {
    const input = normalizeRecord(row, "costItem");
    return costItemInput(input);
  });
}

export function normalizeSetupContractorAssignments(value: unknown) {
  return arrayInput(value, "contractorAssignments", true).map((row) => {
    const input = normalizeRecord(row, "contractorAssignment");
    return stripUndefined({
      contractorId: optionalString(input.contractorId),
      contractorName: requiredString(
        input.contractorName ?? input.name,
        "contractorName"
      ),
      estimatedCostCents: optionalNumber(input.estimatedCostCents),
      estimatedHours: optionalNumber(input.estimatedHours),
      milestoneKey: requiredString(input.milestoneKey, "milestoneKey"),
      role: requiredString(input.role, "role"),
      submilestoneKeys: stringArray(input.submilestoneKeys),
    });
  });
}

export function normalizeSetupDraws(value: unknown) {
  return arrayInput(value, "draws", true).map((row) => {
    const input = normalizeRecord(row, "draw");
    return stripUndefined({
      amountCents: requiredPositiveCents(
        input.amountCents,
        "Draw amount must be greater than zero."
      ),
      customDate:
        typeof input.customDate === "boolean" ? input.customDate : undefined,
      drawKey: requiredString(input.drawKey, "drawKey"),
      label: requiredString(input.label ?? input.drawKey, "label"),
      milestoneKey: optionalString(input.milestoneKey),
      order: optionalNumber(input.order),
      timingDay: requiredNonNegativeDay(
        input.timingDay ?? input.x,
        "timingDay"
      ),
    });
  });
}

export function arrayInput(value: unknown, label: string, optional = false) {
  if (value === undefined || value === null) {
    if (optional) {
      return [];
    }
    throw new Error(`${label} must be an array.`);
  }
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }
  return value;
}

export function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value
        .map(String)
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

export function normalizeBps(value: unknown) {
  const bps = Math.round(requiredNumber(value, "bps"));
  return Math.max(0, Math.min(TOTAL_BPS, bps));
}

export function positiveCentsOrFallback(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : Math.max(1, Math.round(fallback));
}

export function optionalId<TableName extends TableNames>(
  ctx: QueryCtx | MutationCtx,
  tableName: TableName,
  value: unknown
) {
  if (typeof value !== "string" || !value) {
    return;
  }
  return ctx.db.normalizeId(tableName as any, value) as Id<TableName> | null;
}

export function parseActionKey(value: string): AssistantActionKey {
  if (
    (MUTATION_ACTION_KEYS as readonly string[]).includes(value) ||
    (READONLY_CLIENT_ACTION_KEYS as readonly string[]).includes(value)
  ) {
    return value as AssistantActionKey;
  }
  throw new Error(`Assistant action is outside the closed catalog: ${value}`);
}

export function isMutationActionKey(
  value: AssistantActionKey
): value is MutationActionKey {
  return (MUTATION_ACTION_KEYS as readonly string[]).includes(value);
}

export function isReadonlyActionKey(
  value: AssistantActionKey
): value is ReadonlyClientActionKey {
  return (READONLY_CLIENT_ACTION_KEYS as readonly string[]).includes(value);
}

export function isBackoffice(roles: readonly RoleSlug[]) {
  return roles.some((role) =>
    (BACKOFFICE_ROLES as readonly RoleSlug[]).includes(role)
  );
}

export function isBuilder(roles: readonly RoleSlug[]) {
  return roles.some((role) =>
    (BUILDER_ROLES as readonly RoleSlug[]).includes(role)
  );
}

export function parseTargetDateKind(value: unknown) {
  if (
    value === "evidenceDue" ||
    value === "reviewTarget" ||
    value === "adminDecisionTarget" ||
    value === "drawReleaseTarget"
  ) {
    return value;
  }
  throw new Error("Calendar target date kind is not supported.");
}

export function calculateDrawAvailability(
  budgetCents: number,
  borrowerCoPayBps: number
) {
  return Math.round((budgetCents * (TOTAL_BPS - borrowerCoPayBps)) / TOTAL_BPS);
}

export function validateDayRange(dayStart: number, dayEnd: number) {
  if (dayStart < 0 || dayEnd < dayStart) {
    throw new Error("Milestone schedule range is invalid.");
  }
}

export function normalizeIsoDate(value: unknown, message: string) {
  if (typeof value !== "string") {
    throw new Error(message);
  }
  const day = value.slice(0, 10);
  const parsed = Date.parse(`${day}T00:00:00Z`);
  if (!(/^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(parsed))) {
    throw new Error(message);
  }
  return day;
}

export function requiredId<TableName extends TableNames>(
  ctx: QueryCtx | MutationCtx,
  tableName: TableName,
  value: unknown,
  field: string
) {
  if (typeof value !== "string") {
    throw new Error(`${field} is required.`);
  }
  const normalized = ctx.db.normalizeId(tableName as any, value);
  if (!normalized) {
    throw new Error(`${field} is invalid.`);
  }
  return normalized as Id<TableName>;
}

export function maybeId<TableName extends TableNames>(value: unknown) {
  return typeof value === "string" && value
    ? (value as Id<TableName>)
    : undefined;
}

export function requiredString(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} is required.`);
  }
  return value.trim();
}

export function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function optionalStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return;
  }
  const items = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

export function requiredNumber(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${field} must be a finite number.`);
  }
  return value;
}

export function requiredPositiveCents(value: unknown, message: string) {
  const amount = Math.round(requiredNumber(value, "amountCents"));
  if (amount <= 0) {
    throw new Error(message);
  }
  return amount;
}

export function requiredNonNegativeDay(value: unknown, field: string) {
  const day = Math.round(requiredNumber(value, field));
  if (day < 0) {
    throw new Error(`${field} cannot be negative.`);
  }
  return day;
}

export function requiredProposalTimelineDay(value: unknown, field: string) {
  const day = Math.round(requiredNumber(value, field));
  if (day < -30) {
    throw new Error(`${field} cannot be earlier than T-30.`);
  }
  return day;
}

export function requiredReason(value: unknown) {
  const reason = requiredString(value, "reason");
  if (reason.length < 3) {
    throw new Error("A reason is required.");
  }
  return reason;
}

export function requireReason(value: unknown) {
  requiredReason(value);
}

export function normalizeRecord(
  value: unknown,
  label: string
): AssistantActionInput {
  if (value === undefined || value === null) {
    return {};
  }
  if (
    typeof value !== "object" ||
    Array.isArray(value) ||
    value instanceof Date
  ) {
    throw new Error(`${label} must be an object.`);
  }
  return value as AssistantActionInput;
}

export function normalizeOptionalString(value: unknown) {
  return optionalString(value);
}

export function sanitizeForPersistence(value: unknown): any {
  if (Array.isArray(value)) {
    return value.map(sanitizeForPersistence);
  }
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      if (/chainofthought|rawthought|reasoning/i.test(key)) {
        continue;
      }
      if (nested === undefined) {
        continue;
      }
      output[key] = sanitizeForPersistence(nested);
    }
    return output;
  }
  return value;
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
