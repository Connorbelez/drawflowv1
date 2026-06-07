import type {
  TimelineItem,
  TimelineRange,
} from "#/components/roadmap/AnimatedCurvedTimeline.tsx";
import {
  coerceSiteVisitGuidance,
  guidanceLinesToHtml,
} from "#/lib/site-visit-guidance.ts";
import type { TimelineSetupTemplate } from "./-TimelineSetupFlow.tsx";
import { normalizeMilestoneTimelineItems } from "./-timeline-milestone-schedule.ts";
import { ISOMETRIC_ICON_KEYS } from "./-timeline-share-snapshot.ts";
import type {
  DemoDraw,
  DemoMilestone,
  IsometricIconKey,
} from "./-timeline-share-snapshot.ts";

export const TIMELINE_DEMO_SETTINGS_CONTRACT_REFS = {
  adapter: [
    "CC-04",
    "INT-04",
    "FLOW-04-STEP-01",
    "PSEUDO-DATA-01",
    "UML-INTERACTION-ADAPTER",
    "REQ-07",
    "SC-03",
    "VAL-04",
  ],
  scenario: ["CC-03", "INT-03", "PSEUDO-FLOW-03", "REQ-05", "VAL-03"],
  worksheet: ["CC-02", "INT-02", "PSEUDO-FLOW-02", "REQ-04", "VAL-02"],
} as const;

export const TOTAL_BPS = 10_000;
export const DEFAULT_TIMELINE_DEMO_PROJECT_BUDGET_CENTS = 125_000_000;
export const DEFAULT_TIMELINE_DEMO_REIMBURSABLE_BUDGET_CENTS = 100_000_000;
export const TIMELINE_DEMO_SETTINGS_HANDOFF_GAP_DAYS = 5;
export const TIMELINE_DEMO_SETTINGS_DRAW_OFFSET_DAYS = 2;
export const TIMELINE_DEMO_SETTINGS_MISSING_NOTICE =
  "Timeline settings missing. This request uses the read-only local fallback. Seed defaults in Backoffice Settings to persist templates and active draw scenarios.";

export interface TimelineSettingsSubmilestoneDraft {
  description: string;
  durationDays: number;
  name: string;
  order: number;
  percentageBps: number;
  submilestoneKey: string;
}

export interface TimelineSettingsSiteVisitGuidanceDraft {
  cameraAngles: string;
  whatToVerify: string;
}

export interface TimelineSettingsMilestoneDraft {
  dependencyKeys: string[];
  durationDays: number;
  icon: IsometricIconKey;
  included: boolean;
  milestoneKey: string;
  name: string;
  order: number;
  percentageBps: number;
  siteVisitGuidance: TimelineSettingsSiteVisitGuidanceDraft;
  submilestones: TimelineSettingsSubmilestoneDraft[];
  type: string;
}

export interface TimelineSettingsDrawDraft {
  amountBps: number;
  drawKey: string;
  label: string;
  order: number;
  reviewNote: string;
  timingDay: number;
}

export interface TimelineSettingsScenarioDraft {
  description: string;
  draws: TimelineSettingsDrawDraft[];
  isActive: boolean;
  isDefault: boolean;
  name: string;
  scenarioKey: string;
  sortOrder: number;
}

export interface TimelineSettingsTemplateDraft {
  description: string;
  isDefault: boolean;
  milestones: TimelineSettingsMilestoneDraft[];
  scenarios: TimelineSettingsScenarioDraft[];
  summary: string;
  templateKey: string;
  title: string;
}

export interface TimelineSettingsValidationResult {
  errors: Record<string, string>;
  ok: boolean;
  warnings: string[];
}

interface MilestoneDrawWindow {
  afterMilestoneEndDay: number;
  afterMilestoneKey: string;
  afterMilestoneName: string;
  beforeMilestoneKey: string;
  beforeMilestoneName?: string;
  beforeMilestoneStartDay: number;
}

export interface TimelineSettingsProjection {
  completeness?: {
    missingTemplateKeys: string[];
    readyTemplateCount: number;
    requiredTemplateCount: number;
    templateCount: number;
  };
  events?: unknown[];
  templates?: unknown[];
}

type RawRecord = Record<string, unknown>;

export function normalizeTimelineSettingsProjection(
  settings: TimelineSettingsProjection | null | undefined
): TimelineSettingsTemplateDraft[] {
  return (settings?.templates ?? []).map((templateRow) =>
    normalizeTemplate(templateRow as RawRecord)
  );
}

export function includedPocTotalBps(template: TimelineSettingsTemplateDraft) {
  return template.milestones
    .filter((row) => row.included)
    .reduce((total, row) => total + row.percentageBps, 0);
}

export function includedDurationDays(template: TimelineSettingsTemplateDraft) {
  return template.milestones
    .filter((row) => row.included)
    .reduce((total, row) => total + row.durationDays, 0);
}

export function scenarioDrawTotalBps(scenario: TimelineSettingsScenarioDraft) {
  return scenario.draws.reduce((total, row) => total + row.amountBps, 0);
}

export function validateTemplateDraft(
  template: TimelineSettingsTemplateDraft
): TimelineSettingsValidationResult {
  const errors: Record<string, string> = {};
  const warnings: string[] = [];
  const includedRows = template.milestones.filter((row) => row.included);
  const total = includedPocTotalBps(template);

  if (total !== TOTAL_BPS) {
    errors.pocTotal = `Included PoC must equal 100.00%; currently ${formatBps(total)}.`;
  }
  for (const row of includedRows) {
    if (!row.name.trim()) {
      errors[`milestone:${row.milestoneKey}:name`] = "Name is required.";
    }
    if (row.durationDays <= 0) {
      errors[`milestone:${row.milestoneKey}:duration`] =
        "Duration must be positive.";
    }
    for (const subRow of row.submilestones) {
      if (!subRow.name.trim()) {
        errors[`submilestone:${subRow.submilestoneKey}:name`] =
          "Sub-milestone name is required.";
      }
    }
    const removedDependencies = row.dependencyKeys.filter(
      (dependencyKey) =>
        !includedRows.some(
          (candidate) => candidate.milestoneKey === dependencyKey
        )
    );
    if (removedDependencies.length > 0) {
      warnings.push(
        `${row.name} has dependencies that will be removed during save validation.`
      );
    }
  }

  return { errors, ok: Object.keys(errors).length === 0, warnings };
}

export function validateScenarioDrafts(
  scenarios: TimelineSettingsScenarioDraft[],
  template?: TimelineSettingsTemplateDraft
): TimelineSettingsValidationResult {
  const errors: Record<string, string> = {};
  const names = new Set<string>();
  const drawWindows = template ? buildMilestoneDrawWindows(template) : [];

  for (const scenario of scenarios) {
    const name = scenario.name.trim().toLowerCase();
    if (!name) {
      errors[`scenario:${scenario.scenarioKey}:name`] =
        "Scenario name is required.";
    } else if (names.has(name)) {
      errors[`scenario:${scenario.scenarioKey}:name`] =
        "Scenario names must be unique.";
    }
    names.add(name);
    if (scenario.draws.length === 0) {
      errors[`scenario:${scenario.scenarioKey}:draws`] =
        "Scenario requires at least one draw.";
    }
    const drawTotal = scenarioDrawTotalBps(scenario);
    if (drawTotal !== TOTAL_BPS) {
      errors[`scenario:${scenario.scenarioKey}:total`] =
        `Draw total must equal 100.00%; currently ${formatBps(drawTotal)}.`;
    }
    validateScenarioDrawTiming(
      scenario.scenarioKey,
      scenario.draws,
      drawWindows,
      Boolean(template),
      errors
    );
  }
  if (
    scenarios.length > 0 &&
    scenarios.filter((row) => row.isActive).length !== 1
  ) {
    errors.activeScenario = "Exactly one active scenario is required.";
  }

  return { errors, ok: Object.keys(errors).length === 0, warnings: [] };
}

export function buildTimelineItemsFromSettings(
  template: TimelineSettingsTemplateDraft,
  projectBudgetCents = DEFAULT_TIMELINE_DEMO_PROJECT_BUDGET_CENTS
): TimelineItem<DemoMilestone>[] {
  let cursor = 0;
  const items = template.milestones
    .filter((row) => row.included)
    .sort(
      (a, b) =>
        a.order - b.order || a.milestoneKey.localeCompare(b.milestoneKey)
    )
    .map((row, index) => {
      const amount = Math.round(
        (projectBudgetCents * row.percentageBps) / TOTAL_BPS / 100
      );
      const startDay = cursor;
      const status = index === 0 ? "ready" : "upcoming";
      cursor += row.durationDays + TIMELINE_DEMO_SETTINGS_HANDOFF_GAP_DAYS;
      return {
        data: {
          amount,
          draw: `Draw ${index + 1}`,
          drawX: Math.min(
            startDay +
              row.durationDays +
              TIMELINE_DEMO_SETTINGS_HANDOFF_GAP_DAYS -
              1,
            startDay +
              row.durationDays +
              TIMELINE_DEMO_SETTINGS_DRAW_OFFSET_DAYS
          ),
          durationDays: row.durationDays,
          evidence: status === "ready" ? "Ready to start" : "Not started",
          icon: row.icon,
          name: row.name,
          policy: status === "ready" ? "Planning handoff" : "Upcoming",
          siteVisitGuidance: row.siteVisitGuidance,
          status,
          subMilestones: row.submilestones
            .sort((a, b) => a.order - b.order)
            .map((subRow) => subRow.name),
        },
        eyebrow: `Milestone ${index + 1}`,
        id: row.milestoneKey,
        label: row.name.split(" ")[0] ?? row.name,
        lane: index % 3 === 1 ? -1 : index % 3 === 2 ? 1 : 0,
        markerLabel: String(index + 1),
        tone: index === 0 ? "active" : "upcoming",
        x: startDay,
      } satisfies TimelineItem<DemoMilestone>;
    });

  return normalizeMilestoneTimelineItems(items);
}

function validateScenarioDrawTiming(
  scenarioKey: string,
  draws: TimelineSettingsDrawDraft[],
  windows: MilestoneDrawWindow[],
  requireMilestoneWindow: boolean,
  errors: Record<string, string>
) {
  for (const draw of draws) {
    if (!draw.label.trim()) {
      errors[`scenario:${scenarioKey}:draw:${draw.drawKey}:label`] =
        "Draw label is required.";
    }
    if (draw.timingDay < 0) {
      errors[`scenario:${scenarioKey}:draw:${draw.drawKey}:timingDay`] =
        "Timing day must be non-negative.";
    }
    if (draw.amountBps <= 0) {
      errors[`scenario:${scenarioKey}:draw:${draw.drawKey}:amount`] =
        "Draw amount must be positive.";
    }
    if (
      requireMilestoneWindow &&
      !windows.some(
        (window) =>
          draw.timingDay > window.afterMilestoneEndDay &&
          draw.timingDay < window.beforeMilestoneStartDay
      )
    ) {
      errors[`scenario:${scenarioKey}:draw:${draw.drawKey}:timingDayWindow`] =
        formatDrawTimingWindowError(draw, windows);
    }
  }
}

function formatDrawTimingWindowError(
  draw: TimelineSettingsDrawDraft,
  windows: MilestoneDrawWindow[]
) {
  const nearest = findNearestDrawTimingWindow(draw.timingDay, windows);
  const label = draw.label.trim() || "Unnamed draw";

  if (!nearest) {
    return `${label}, day ${draw.timingDay}: no valid handoff window exists. Include at least one milestone before saving draw timing.`;
  }

  const { firstValidDay, lastValidDay, nearestValidDay, window } = nearest;
  const validWindow =
    firstValidDay === lastValidDay
      ? `day ${firstValidDay}`
      : `days ${firstValidDay}-${lastValidDay}`;

  const beforeMilestoneText = window.beforeMilestoneName
    ? ` and ${window.beforeMilestoneName} (starts day ${window.beforeMilestoneStartDay})`
    : "";
  const windowLabel = window.beforeMilestoneName
    ? "Valid window"
    : "Valid final draw window";

  return `${label}, day ${draw.timingDay}: conflicts with ${window.afterMilestoneName} (ends day ${window.afterMilestoneEndDay})${beforeMilestoneText}. ${windowLabel}: ${validWindow}. Nearest valid day: ${nearestValidDay}.`;
}

function findNearestDrawTimingWindow(
  timingDay: number,
  windows: MilestoneDrawWindow[]
) {
  let nearest: {
    distance: number;
    firstValidDay: number;
    lastValidDay: number;
    nearestValidDay: number;
    window: MilestoneDrawWindow;
  } | null = null;

  for (const window of windows) {
    const firstValidDay = window.afterMilestoneEndDay + 1;
    const lastValidDay = window.beforeMilestoneStartDay - 1;
    if (firstValidDay > lastValidDay) {
      continue;
    }
    const nearestValidDay = Math.min(
      Math.max(timingDay, firstValidDay),
      lastValidDay
    );
    const distance = Math.abs(timingDay - nearestValidDay);

    if (!nearest || distance < nearest.distance) {
      nearest = {
        distance,
        firstValidDay,
        lastValidDay,
        nearestValidDay,
        window,
      };
    }
  }

  return nearest;
}

export function buildTimelineSetupTemplatesFromSettings(
  templates: TimelineSettingsTemplateDraft[]
): TimelineSetupTemplate[] {
  return templates.map((template) => ({
    description: template.description,
    isDefault: template.isDefault,
    rows: template.milestones
      .sort((a, b) => a.order - b.order)
      .map((row) => ({
        dependencyKeys: row.dependencyKeys,
        durationDays: row.durationDays,
        icon: row.icon,
        key: row.milestoneKey,
        name: row.name,
        percentageBps: row.percentageBps,
        siteVisitGuidance: row.siteVisitGuidance,
        subMilestones: row.submilestones
          .sort((a, b) => a.order - b.order)
          .map((subRow) => subRow.name),
        type: row.type,
      })),
    summary: template.summary,
    templateKey: template.templateKey,
    title: template.title,
  }));
}

export function buildDrawsFromActiveScenario(
  template: TimelineSettingsTemplateDraft,
  _items: TimelineItem<DemoMilestone>[],
  reimbursableBudgetCents = DEFAULT_TIMELINE_DEMO_REIMBURSABLE_BUDGET_CENTS
): DemoDraw[] {
  const scenario = getActiveScenario(template);
  if (!scenario) {
    return [];
  }
  return scenario.draws
    .sort((a, b) => a.order - b.order || a.drawKey.localeCompare(b.drawKey))
    .map((draw) => ({
      amount: Math.round(
        (reimbursableBudgetCents * draw.amountBps) / TOTAL_BPS / 100
      ),
      customDate: true,
      id: `${scenario.scenarioKey}-${draw.drawKey}`,
      label: draw.label,
      requestReviewNote: draw.reviewNote,
      x: draw.timingDay,
    }));
}

export function getActiveScenario(template: TimelineSettingsTemplateDraft) {
  return template.scenarios.find((scenario) => scenario.isActive) ?? null;
}

export function buildCashflowPreview(
  template: TimelineSettingsTemplateDraft,
  scenario: TimelineSettingsScenarioDraft | null
) {
  let cashOnHand = 0;
  const events = [
    ...template.milestones
      .filter((row) => row.included)
      .sort(
        (a, b) =>
          a.order - b.order || a.milestoneKey.localeCompare(b.milestoneKey)
      )
      .map((row, index, rows) => ({
        amountBps: row.percentageBps,
        day: milestoneEndDay(rows, index),
        label: row.name,
        type: "milestone" as const,
      })),
    ...(scenario?.draws ?? []).map((draw) => ({
      amountBps: draw.amountBps,
      day: draw.timingDay,
      label: draw.label,
      type: "draw" as const,
    })),
  ].sort((a, b) => a.day - b.day || a.type.localeCompare(b.type));

  return events.map((event) => {
    cashOnHand += event.type === "draw" ? event.amountBps : -event.amountBps;
    return {
      ...event,
      cashOnHandBps: cashOnHand,
    };
  });
}

export function formatBps(value: number) {
  return `${(value / 100).toFixed(2)}%`;
}

export function parsePercentToBps(value: string) {
  const parsed = Number(value.replace("%", "").trim());
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : Number.NaN;
}

export function formatDay(value: number) {
  return `${Math.round(value)} days`;
}

export function duplicateScenario(
  scenario: TimelineSettingsScenarioDraft,
  existing: TimelineSettingsScenarioDraft[]
): TimelineSettingsScenarioDraft {
  const scenarioKey = uniqueKey(
    `${scenario.scenarioKey}-copy`,
    existing.map((row) => row.scenarioKey)
  );
  return {
    ...scenario,
    draws: scenario.draws.map((draw, index) => ({
      ...draw,
      drawKey: uniqueKey(`${draw.drawKey}-copy`, []),
      order: index,
    })),
    isActive: false,
    isDefault: false,
    name: `${scenario.name} copy`,
    scenarioKey,
    sortOrder: existing.length,
  };
}

export function createBlankScenario(
  existing: TimelineSettingsScenarioDraft[],
  template?: TimelineSettingsTemplateDraft
): TimelineSettingsScenarioDraft {
  const scenarioKey = uniqueKey(
    "new-scenario",
    existing.map((row) => row.scenarioKey)
  );
  return {
    description: "Editable reimbursement timing scenario.",
    draws: [
      {
        amountBps: TOTAL_BPS,
        drawKey: "draw-01",
        label: "Draw 01",
        order: 0,
        reviewNote: "Generated standard draw",
        timingDay: defaultDrawTimingDay(template),
      },
    ],
    isActive: existing.length === 0,
    isDefault: false,
    name: "New reimbursement scenario",
    scenarioKey,
    sortOrder: existing.length,
  };
}

export function buildMilestoneDrawWindows(
  template: TimelineSettingsTemplateDraft
): MilestoneDrawWindow[] {
  const milestones = template.milestones
    .filter((row) => row.included)
    .slice()
    .sort(
      (a, b) =>
        a.order - b.order || a.milestoneKey.localeCompare(b.milestoneKey)
    );
  const windows: MilestoneDrawWindow[] = [];
  for (let index = 0; index < milestones.length - 1; index += 1) {
    const milestone = milestones[index];
    const next = milestones[index + 1];
    if (!(milestone && next)) {
      continue;
    }
    windows.push({
      afterMilestoneEndDay: milestoneEndDay(milestones, index),
      afterMilestoneKey: milestone.milestoneKey,
      afterMilestoneName: milestone.name,
      beforeMilestoneKey: next.milestoneKey,
      beforeMilestoneName: next.name,
      beforeMilestoneStartDay: milestoneStartDay(milestones, index + 1),
    });
  }
  const finalMilestone = milestones.at(-1);
  if (finalMilestone) {
    const finalIndex = milestones.length - 1;
    const finalEndDay = milestoneEndDay(milestones, finalIndex);
    windows.push({
      afterMilestoneEndDay: finalEndDay,
      afterMilestoneKey: finalMilestone.milestoneKey,
      afterMilestoneName: finalMilestone.name,
      beforeMilestoneKey: "final-closeout",
      beforeMilestoneStartDay:
        finalEndDay + TIMELINE_DEMO_SETTINGS_HANDOFF_GAP_DAYS,
    });
  }
  return windows;
}

export function createCustomMilestone(
  name: string,
  existing: TimelineSettingsMilestoneDraft[]
): TimelineSettingsMilestoneDraft {
  const milestoneKey = uniqueKey(
    `custom-${name}`,
    existing.map((row) => row.milestoneKey)
  );
  return {
    dependencyKeys: [],
    durationDays: 7,
    icon: "change",
    included: true,
    milestoneKey,
    name: name.trim() || "Custom milestone",
    order: existing.length,
    percentageBps: 0,
    siteVisitGuidance: {
      cameraAngles: guidanceLinesToHtml([
        "Wide shot showing the full custom milestone work area.",
        "Close-up of the primary completion detail.",
      ]),
      whatToVerify: guidanceLinesToHtml([
        "Custom milestone scope is complete and consistent with the approved draw plan.",
      ]),
    },
    submilestones: [
      {
        description:
          "Define reimbursable scope, evidence, and acceptance criteria.",
        durationDays: 1,
        name: "Scope definition",
        order: 0,
        percentageBps: 0,
        submilestoneKey: `${milestoneKey}-scope-definition-0`,
      },
    ],
    type: "custom",
  };
}

export function timelineSettingsRange(
  items: TimelineItem<DemoMilestone>[]
): TimelineRange {
  const max = Math.max(
    230,
    ...items.map((item) => item.x + (item.data?.durationDays ?? 14) + 12)
  );
  return { max, min: 0, unit: "days" };
}

function normalizeTemplate(
  templateRow: RawRecord
): TimelineSettingsTemplateDraft {
  const submilestones =
    (templateRow.submilestones as RawRecord[] | undefined) ?? [];
  const guidanceItems =
    (templateRow.guidanceItems as RawRecord[] | undefined) ?? [];
  return {
    description:
      stringValue(templateRow.description) || stringValue(templateRow.summary),
    isDefault: Boolean(templateRow.isDefault),
    milestones: ((templateRow.milestones as RawRecord[] | undefined) ?? [])
      .map((row) => normalizeMilestone(row, submilestones, guidanceItems))
      .sort((a, b) => a.order - b.order),
    scenarios: ((templateRow.scenarios as RawRecord[] | undefined) ?? [])
      .map(normalizeScenario)
      .sort((a, b) => a.sortOrder - b.sortOrder),
    summary: stringValue(templateRow.summary),
    templateKey: stringValue(templateRow.templateKey),
    title: stringValue(templateRow.title),
  };
}

function normalizeMilestone(
  row: RawRecord,
  allSubmilestones: RawRecord[],
  allGuidanceItems: RawRecord[]
): TimelineSettingsMilestoneDraft {
  const milestoneKey = stringValue(row.milestoneKey) || stringValue(row.key);
  const templateKey = stringValue(row.templateKey);
  const nestedSubmilestones =
    (row.submilestones as RawRecord[] | undefined)
      ?.map(normalizeSubmilestone)
      .sort((a, b) => a.order - b.order) ?? [];
  const submilestones =
    nestedSubmilestones.length > 0
      ? nestedSubmilestones
      : allSubmilestones
          .filter(
            (subRow) =>
              stringValue(subRow.templateKey) === templateKey &&
              stringValue(subRow.milestoneKey) === milestoneKey
          )
          .map(normalizeSubmilestone)
          .sort((a, b) => a.order - b.order);
  return {
    dependencyKeys: stringArray(row.dependencyKeys),
    durationDays: numberValue(row.durationDays, 1),
    icon: normalizeIcon(row.icon || row.type || row.archetypeKey),
    included: row.included !== false,
    milestoneKey,
    name: stringValue(row.name),
    order: numberValue(row.order, 0),
    percentageBps: numberValue(row.percentageBps, 0),
    siteVisitGuidance: normalizeGuidanceItems(
      allGuidanceItems.filter(
        (guidanceRow) =>
          stringValue(guidanceRow.templateKey) === templateKey &&
          stringValue(guidanceRow.milestoneKey) === milestoneKey
      ),
      row,
      submilestones
    ),
    submilestones,
    type:
      stringValue(row.type) ||
      stringValue(row.archetypeKey) ||
      stringValue(row.key),
  };
}

function normalizeGuidanceItems(
  rows: RawRecord[],
  milestone: RawRecord,
  submilestones: TimelineSettingsSubmilestoneDraft[]
): TimelineSettingsSiteVisitGuidanceDraft {
  const sorted = rows
    .slice()
    .sort(
      (a, b) =>
        stringValue(a.kind).localeCompare(stringValue(b.kind)) ||
        numberValue(a.order, 0) - numberValue(b.order, 0)
    );
  const guidance = coerceSiteVisitGuidance({
    cameraAngles: sorted
      .filter((row) => stringValue(row.kind) === "cameraAngle")
      .map((row) => stringValue(row.text).trim())
      .filter(Boolean),
    whatToVerify: sorted
      .filter((row) => stringValue(row.kind) === "whatToVerify")
      .map((row) => stringValue(row.text).trim())
      .filter(Boolean),
  });
  if (guidance.cameraAngles || guidance.whatToVerify) {
    return guidance;
  }
  const name = stringValue(milestone.name) || "Milestone";
  return coerceSiteVisitGuidance({
    cameraAngles: [
      "Wide shot showing the full milestone work area.",
      "Close-up of the highest-risk connection, fixture, or finish.",
    ],
    whatToVerify: (
      submilestones.length
        ? submilestones.map((submilestone) => submilestone.name)
        : [name]
    )
      .slice(0, 4)
      .map(
        (checkpoint) =>
          `${checkpoint} is complete, visible, and consistent with the approved scope.`
      ),
  });
}

function normalizeSubmilestone(
  row: RawRecord
): TimelineSettingsSubmilestoneDraft {
  return {
    description: stringValue(row.description),
    durationDays: numberValue(row.durationDays, 1),
    name: stringValue(row.name),
    order: numberValue(row.order, 0),
    percentageBps: numberValue(row.percentageBps, 0),
    submilestoneKey:
      stringValue(row.submilestoneKey) || stringValue(row.key),
  };
}

function normalizeScenario(row: RawRecord): TimelineSettingsScenarioDraft {
  return {
    description:
      stringValue(row.description) ||
      `${stringValue(row.name)} draw timing and reimbursement assumptions.`,
    draws: ((row.draws as RawRecord[] | undefined) ?? [])
      .map(normalizeDraw)
      .sort((a, b) => a.order - b.order),
    isActive:
      typeof row.isActive === "boolean" ? row.isActive : Boolean(row.isDefault),
    isDefault: Boolean(row.isDefault),
    name: stringValue(row.name),
    scenarioKey: stringValue(row.scenarioKey),
    sortOrder: numberValue(row.sortOrder, 0),
  };
}

function normalizeDraw(row: RawRecord): TimelineSettingsDrawDraft {
  return {
    amountBps: numberValue(row.amountBps, 0),
    drawKey: stringValue(row.drawKey),
    label: stringValue(row.label),
    order: numberValue(row.order, 0),
    reviewNote: stringValue(row.reviewNote),
    timingDay: numberValue(row.timingDay, 0),
  };
}

function normalizeIcon(value: unknown): IsometricIconKey {
  const icon = stringValue(value);
  return (ISOMETRIC_ICON_KEYS as readonly string[]).includes(icon)
    ? (icon as IsometricIconKey)
    : "change";
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function defaultDrawTimingDay(
  template: TimelineSettingsTemplateDraft | undefined
) {
  if (!template) {
    return 30;
  }
  const [firstWindow] = buildMilestoneDrawWindows(template);
  if (!firstWindow) {
    return 0;
  }
  return Math.min(
    firstWindow.beforeMilestoneStartDay - 1,
    firstWindow.afterMilestoneEndDay + TIMELINE_DEMO_SETTINGS_DRAW_OFFSET_DAYS
  );
}

export function milestoneStartDay(
  rows: Pick<
    TimelineSettingsMilestoneDraft,
    "durationDays" | "milestoneKey" | "order"
  >[],
  index: number
) {
  return rows
    .slice(0, index)
    .reduce(
      (day, row) =>
        day + row.durationDays + TIMELINE_DEMO_SETTINGS_HANDOFF_GAP_DAYS,
      0
    );
}

export function milestoneEndDay(
  rows: Pick<
    TimelineSettingsMilestoneDraft,
    "durationDays" | "milestoneKey" | "order"
  >[],
  index: number
) {
  return milestoneStartDay(rows, index) + (rows[index]?.durationDays ?? 0);
}

function uniqueKey(base: string, existing: string[]) {
  const normalized = slug(base);
  const seen = new Set(existing);
  if (!seen.has(normalized)) {
    return normalized;
  }
  let suffix = 2;
  while (seen.has(`${normalized}-${suffix}`)) {
    suffix += 1;
  }
  return `${normalized}-${suffix}`;
}

function slug(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "item"
  );
}
