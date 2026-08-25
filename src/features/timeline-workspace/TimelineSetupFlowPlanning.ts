"use client";

import type { TimelineItem } from "#/components/roadmap/AnimatedCurvedTimeline.tsx";
import type { AssistantClientAction } from "#/features/assistant/assistantClientActionBridge.ts";
import {
  formatCurrency,
  parseCurrencyToCents,
} from "#/features/builder-proposal-demo/template-helpers.ts";
import type {
  TimelineMilestoneWorksheetContractorAssignment,
  TimelineMilestoneWorksheetCostItem,
} from "./-TimelineMilestoneWorksheetTable.tsx";
import { getMilestoneEndX } from "./-timeline-milestone-schedule.ts";
import type { DemoMilestone } from "./-timeline-share-snapshot.ts";
import {
  DEFAULT_BORROWER_CO_PAY_BPS,
  getMilestoneDrawAvailabilityAmount,
  getReimbursementBps,
  TOTAL_REIMBURSEMENT_BPS,
} from "./-timeline-share-snapshot.ts";
import "./-timeline-setup-flow.css";
import {
  DEFAULT_SETUP_LOAN_PERCENTAGE_TEXT,
  formatBpsPercent,
  normalizeCurrencyText,
  normalizePercentText,
  parsePercentTextToBps,
  slugifySubMilestone,
  type TimelineSetupContractorAssignment,
  type TimelineSetupCostItem,
  type TimelineSetupDrawResult,
  type TimelineSetupMilestoneRow,
  type TimelineSetupScenario,
  type TimelineSetupTemplate,
} from "./TimelineSetupFlowContracts.ts";
import { withSubMilestoneDetails } from "./TimelineSetupFlowTemplates.ts";

export function selectTimelineSetupScenario(
  template: TimelineSetupTemplate | undefined
): TimelineSetupScenario | undefined {
  return (
    template?.scenarios?.find((scenario) => scenario.isActive) ??
    template?.scenarios?.find((scenario) => scenario.isDefault) ??
    template?.scenarios?.[0]
  );
}

export function resolveAgentTemplate(
  requestedTemplateKey: string,
  templates: TimelineSetupTemplate[]
) {
  const requested = normalizeAgentTemplateToken(requestedTemplateKey);
  const aliases = new Set([requested]);
  if (
    requested === "garden-suite" ||
    requested === "garden-suite-build" ||
    requested === "garden-suite-template" ||
    requested === "laneway-suite"
  ) {
    aliases.add("garden-suite");
    aliases.add("garden-suite-build");
    aliases.add("garden-suite-template");
    aliases.add("laneway-suite");
  }
  return templates.find((template) => {
    const templateTokens = [
      template.templateKey,
      template.title,
      template.summary,
    ].map(normalizeAgentTemplateToken);
    return templateTokens.some((token) => aliases.has(token));
  });
}

export function normalizeAgentTemplateToken(value: string) {
  return value
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-z0-9-]+/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function buildTimelineSetupScenarioDraws({
  budgetCents,
  items,
  scenario,
  startingCashCents: _startingCashCents,
}: {
  budgetCents: number;
  items: TimelineItem<DemoMilestone>[];
  scenario: TimelineSetupScenario | undefined;
  startingCashCents: number;
}): TimelineSetupDrawResult[] | undefined {
  if (!scenario?.draws.length) {
    return;
  }

  const reimbursableBudgetCents = Math.min(
    Math.max(0, Math.round(budgetCents)),
    items.reduce(
      (total, item) =>
        total +
        dollarsToCents(
          getMilestoneDrawAvailabilityAmount(
            item.data,
            DEFAULT_BORROWER_CO_PAY_BPS
          )
        ),
      0
    )
  );
  const sortedScenarioDraws = [...scenario.draws].sort(
    (left, right) =>
      (left.order ?? 0) - (right.order ?? 0) ||
      left.timingDay - right.timingDay ||
      left.drawKey.localeCompare(right.drawKey)
  );
  const desiredDraws = sortedScenarioDraws.map((draw, index) => ({
    ...draw,
    amountCents: Math.max(
      0,
      Math.round(
        (reimbursableBudgetCents * Math.max(0, Math.round(draw.amountBps))) /
          TOTAL_REIMBURSEMENT_BPS
      )
    ),
    order: draw.order ?? index + 1,
    timingDay: Math.max(0, Math.round(draw.timingDay)),
  }));
  // Template amountBps are shares of the lender facility, but they can
  // front-load past cumulative completed-work eligibility for the generated
  // milestone schedule. Fit amounts (and final timing) to that envelope so
  // generate-timeline stays valid at any LTV / borrower co-pay.
  const fittedDraws = fitScenarioDrawsToCompletedWorkEligibility(
    desiredDraws,
    items,
    reimbursableBudgetCents
  );

  return fittedDraws.map((draw, index) => ({
    amountCents: draw.amountCents,
    customDate: true,
    drawKey:
      draw.drawKey.trim() || `draw-${String(index + 1).padStart(2, "0")}`,
    label: draw.label.trim() || `Draw ${String(index + 1).padStart(2, "0")}`,
    milestoneKey: milestoneKeyForScenarioDraw(items, draw.timingDay),
    order: index + 1,
    timingDay: draw.timingDay,
  }));
}

export function fitScenarioDrawsToCompletedWorkEligibility<
  T extends { amountCents: number; timingDay: number },
>(
  draws: T[],
  items: TimelineItem<DemoMilestone>[],
  reimbursableBudgetCents: number
): T[] {
  if (draws.length === 0) {
    return draws;
  }

  const milestoneEligibility = items
    .filter((item) => item.data)
    .map((item) => ({
      amountCents: dollarsToCents(
        getMilestoneDrawAvailabilityAmount(
          item.data,
          DEFAULT_BORROWER_CO_PAY_BPS
        )
      ),
      dayEnd: getMilestoneEndX(item),
    }))
    .sort((left, right) => left.dayEnd - right.dayEnd);

  const cumulativeEligibleCentsAt = (timingDay: number) =>
    milestoneEligibility.reduce(
      (total, milestone) =>
        milestone.dayEnd <= timingDay ? total + milestone.amountCents : total,
      0
    );

  const totalEligibleCents = milestoneEligibility.reduce(
    (total, milestone) => total + milestone.amountCents,
    0
  );
  const targetDrawCents = Math.min(
    Math.max(0, Math.round(reimbursableBudgetCents)),
    totalEligibleCents
  );
  const lastMilestoneDayEnd =
    milestoneEligibility.at(-1)?.dayEnd ?? draws.at(-1)?.timingDay ?? 0;

  const fitted = draws.map((draw) => ({ ...draw }));
  let allocatedCents = 0;
  let carryCents = 0;

  for (const [index, draw] of fitted.entries()) {
    const isLast = index === fitted.length - 1;
    const timingDay = isLast
      ? Math.max(draw.timingDay, lastMilestoneDayEnd)
      : draw.timingDay;
    const desiredCents = Math.max(0, Math.round(draw.amountCents)) + carryCents;
    const remainingTarget = Math.max(0, targetDrawCents - allocatedCents);
    const eligibleRemaining = Math.max(
      0,
      cumulativeEligibleCentsAt(timingDay) - allocatedCents
    );
    const amountCents = Math.min(
      desiredCents,
      remainingTarget,
      eligibleRemaining
    );
    fitted[index] = {
      ...draw,
      amountCents,
      timingDay,
    };
    allocatedCents += amountCents;
    carryCents = Math.max(0, desiredCents - amountCents);
  }

  if (carryCents > 0 && fitted.length > 0) {
    const lastIndex = fitted.length - 1;
    const last = fitted[lastIndex];
    if (!last) {
      return fitted;
    }
    const timingDay = Math.max(last.timingDay, lastMilestoneDayEnd);
    const eligibleRemaining = Math.max(
      0,
      cumulativeEligibleCentsAt(timingDay) - allocatedCents
    );
    const remainingTarget = Math.max(0, targetDrawCents - allocatedCents);
    const extraCents = Math.min(carryCents, eligibleRemaining, remainingTarget);
    fitted[lastIndex] = {
      ...last,
      amountCents: last.amountCents + extraCents,
      timingDay,
    };
  }

  return fitted;
}

export function milestoneKeyForScenarioDraw(
  items: TimelineItem<DemoMilestone>[],
  timingDay: number
) {
  const orderedItems = [...items]
    .filter((item) => item.data)
    .sort((left, right) => getMilestoneEndX(left) - getMilestoneEndX(right));
  const completed = orderedItems
    .filter((item) => getMilestoneEndX(item) <= timingDay)
    .at(-1);

  return completed?.id ?? orderedItems[0]?.id;
}

export function dollarsToCents(value: number) {
  return Math.max(0, Math.round(value * 100));
}

export function buildPlanningPayloadFromSetupRows(
  rows: TimelineSetupMilestoneRow[]
): {
  contractorAssignments: TimelineSetupContractorAssignment[];
  costItems: TimelineSetupCostItem[];
} {
  const includedRows = rows.filter((row) => !row.excluded);
  return {
    contractorAssignments: includedRows.flatMap(
      setupRowContractorAssignmentsToPayload
    ),
    costItems: includedRows.flatMap(setupRowCostItemsToPayload),
  };
}

export function setupRowContractorAssignmentsToPayload(
  row: TimelineSetupMilestoneRow
) {
  const availableSubmilestoneKeys = setupRowSubmilestoneKeys(row);
  return (row.contractorAssignments ?? [])
    .map((assignment) =>
      setupContractorAssignmentToPayload(
        row,
        availableSubmilestoneKeys,
        assignment
      )
    )
    .filter((assignment): assignment is TimelineSetupContractorAssignment =>
      Boolean(assignment)
    );
}

export function setupContractorAssignmentToPayload(
  row: TimelineSetupMilestoneRow,
  availableSubmilestoneKeys: Set<string>,
  assignment: TimelineMilestoneWorksheetContractorAssignment
): TimelineSetupContractorAssignment | null {
  const contractorName = assignment.contractorName.trim();
  const role = assignment.role.trim();
  if (!(contractorName && role)) {
    return null;
  }
  return {
    ...(assignment.contractorId
      ? { contractorId: assignment.contractorId }
      : {}),
    contractorName,
    ...(assignment.estimatedCostCents === undefined
      ? {}
      : { estimatedCostCents: assignment.estimatedCostCents }),
    ...(assignment.estimatedHours === undefined
      ? {}
      : { estimatedHours: assignment.estimatedHours }),
    milestoneKey: row.key,
    role,
    submilestoneKeys: assignment.subMilestoneIds.filter((key) =>
      availableSubmilestoneKeys.has(key)
    ),
  };
}

export function setupRowCostItemsToPayload(row: TimelineSetupMilestoneRow) {
  const availableSubmilestoneKeys = setupRowSubmilestoneKeys(row);
  return (row.costItems ?? [])
    .map((item) => setupCostItemToPayload(row, availableSubmilestoneKeys, item))
    .filter((item): item is TimelineSetupCostItem => Boolean(item));
}

export function setupCostItemToPayload(
  row: TimelineSetupMilestoneRow,
  availableSubmilestoneKeys: Set<string>,
  item: TimelineMilestoneWorksheetCostItem
): TimelineSetupCostItem | null {
  const title = item.title.trim();
  if (!title || item.costCents <= 0 || item.quantity <= 0) {
    return null;
  }
  return {
    ...(item.budgetSubmilestoneKey &&
    availableSubmilestoneKeys.has(item.budgetSubmilestoneKey)
      ? { budgetSubmilestoneKey: item.budgetSubmilestoneKey }
      : {}),
    ...(item.budgetTreatment ? { budgetTreatment: item.budgetTreatment } : {}),
    costCents: item.costCents,
    ...(item.description?.trim()
      ? { description: item.description.trim() }
      : {}),
    itemType: item.itemType,
    milestoneKey: row.key,
    quantity: item.quantity,
    relevantSubmilestoneKeys: item.relevantSubMilestoneIds.filter((key) =>
      availableSubmilestoneKeys.has(key)
    ),
    ...(item.supplier?.trim() ? { supplier: item.supplier.trim() } : {}),
    title,
  };
}

export function setupRowSubmilestoneKeys(row: TimelineSetupMilestoneRow) {
  return new Set(row.subMilestoneDetails.map((detail) => detail.id));
}

export function assistantActionInput(action: AssistantClientAction) {
  return (action.input ?? {}) as Record<string, unknown>;
}

export function assistantString(
  input: Record<string, unknown>,
  keys: string[],
  fallback = ""
) {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return fallback;
}

export function assistantNumber(
  input: Record<string, unknown>,
  keys: string[]
) {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value.replace(/[$,%\s,]/g, ""));
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return Number.NaN;
}

export function assistantBoolean(
  input: Record<string, unknown>,
  keys: string[],
  fallback = false
) {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "boolean") {
      return value;
    }
    if (typeof value === "string") {
      if (
        ["true", "yes", "included", "skipped"].includes(value.toLowerCase())
      ) {
        return true;
      }
      if (
        ["false", "no", "excluded", "required"].includes(value.toLowerCase())
      ) {
        return false;
      }
    }
  }
  return fallback;
}

export function assistantCurrencyText(
  input: Record<string, unknown>,
  keys: string[],
  fallback = "$0"
) {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return formatCurrency(Math.max(0, Math.round(value)));
    }
    if (typeof value === "string" && value.trim()) {
      return normalizeCurrencyText(value);
    }
  }
  return fallback;
}

export function assistantLoanPercentageText(
  input: Record<string, unknown>,
  keys: string[],
  fallback = DEFAULT_SETUP_LOAN_PERCENTAGE_TEXT
) {
  const loanPercentageBps = assistantNumber(input, [
    "loanPercentageBps",
    "reimbursementBps",
  ]);
  if (Number.isFinite(loanPercentageBps)) {
    return formatBpsPercent(
      Math.min(
        TOTAL_REIMBURSEMENT_BPS,
        Math.max(0, Math.round(loanPercentageBps))
      )
    );
  }
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return normalizePercentText(String(value));
    }
    if (typeof value === "string" && value.trim()) {
      return normalizePercentText(value);
    }
  }
  return fallback;
}

export function assistantBorrowerContributionText(
  input: Record<string, unknown>,
  keys: string[]
) {
  const borrowerContributionBps = assistantNumber(input, [
    "coPayBps",
    "borrowerCoPayBps",
    "borrowerContributionBps",
  ]);
  if (Number.isFinite(borrowerContributionBps)) {
    return formatBpsPercent(
      getReimbursementBps(Math.round(borrowerContributionBps))
    );
  }
  for (const key of keys) {
    const value = input[key];
    if (
      (typeof value === "number" && Number.isFinite(value)) ||
      (typeof value === "string" && value.trim())
    ) {
      const bps = parsePercentTextToBps(String(value));
      return Number.isFinite(bps)
        ? formatBpsPercent(getReimbursementBps(bps))
        : DEFAULT_SETUP_LOAN_PERCENTAGE_TEXT;
    }
  }
  return DEFAULT_SETUP_LOAN_PERCENTAGE_TEXT;
}

export function setupRowWithSubmilestoneBudgetRollup(
  row: TimelineSetupMilestoneRow
) {
  const totalBudgetCents = row.subMilestoneDetails.reduce((sum, detail) => {
    const cents = parseCurrencyToCents(detail.budgetText);
    return sum + (Number.isFinite(cents) ? Math.max(0, cents) : 0);
  }, 0);
  if (totalBudgetCents <= 0) {
    return withSubMilestoneDetails(row, row.subMilestoneDetails);
  }
  return withSubMilestoneDetails(
    { ...row, budgetText: formatCurrency(totalBudgetCents) },
    row.subMilestoneDetails
  );
}

export function makeSetupSubmilestoneId(
  row: TimelineSetupMilestoneRow,
  name: string
) {
  const baseId = `${row.key}-${slugifySubMilestone(name)}`;
  const existing = new Set(row.subMilestoneDetails.map((detail) => detail.id));
  if (!existing.has(baseId)) {
    return baseId;
  }
  let suffix = 2;
  while (existing.has(`${baseId}-${suffix}`)) {
    suffix += 1;
  }
  return `${baseId}-${suffix}`;
}
