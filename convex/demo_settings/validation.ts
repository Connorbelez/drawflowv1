import {
  defaultSiteVisitGuidance,
  guidanceHtmlExceedsMaxLength,
  guidanceItemsToGuidance,
  guidanceToItems,
  normalizeSiteVisitGuidance,
  SITE_VISIT_GUIDANCE_HTML_MAX_LENGTH,
} from "../demo_site_visit_guidance";
import {
  DEFAULT_TEMPLATES,
  EMPTY_TIPTAP_JSON,
  TIMELINE_DEMO_SETTINGS_DRAW_OFFSET_DAYS,
  TIMELINE_DEMO_SETTINGS_HANDOFF_GAP_DAYS,
  TIMELINE_DEMO_KEY_PATTERN,
  TOTAL_BPS,
  canonicalTimelineDemoKey,
  requiredSeedTemplate,
  slug,
  sumBy,
  toMilestoneInput,
  toScenarioInput,
} from "./shared";
import type {
  DemoSettingsSiteVisitGuidanceInput,
  MilestoneInput,
  MilestoneDrawWindow,
  MilestoneScheduleInput,
  ScenarioDrawScheduleInput,
  ScenarioInput,
  SeedMilestone,
  SeedScenario,
} from "./shared";
export function validateTemplateRows(
  rows: {
    durationDays: number;
    included: boolean;
    milestoneKey: string;
    name: string;
    order: number;
    percentageBps: number;
    siteVisitGuidance?: DemoSettingsSiteVisitGuidanceInput;
    submilestones: {
      fieldGuidance?: {
        cameraAnglesTiptapJson: string;
        whatToVerifyTiptapJson: string;
      };
      name: string;
      scopeOfWorkTiptapJson?: string;
    }[];
  }[]
) {
  const included = rows.filter((row) => row.included);
  const total = sumBy(included, (row) => row.percentageBps);
  if (total !== TOTAL_BPS) {
    throw new Error(
      `Included PoC total must equal 100.00%; received ${(total / 100).toFixed(2)}%.`
    );
  }
  for (const row of included) {
    if (!row.name.trim()) {
      throw new Error("Included milestones require names.");
    }
    if (row.durationDays <= 0) {
      throw new Error("Included milestones require positive durations.");
    }
    if (row.submilestones.some((subRow) => !subRow.name.trim())) {
      throw new Error("Sub-milestones require names.");
    }
    const guidance = normalizeSiteVisitGuidance(row.siteVisitGuidance);
    if (guidanceHtmlExceedsMaxLength(guidance)) {
      throw new Error(
        `Field guidance must be ${SITE_VISIT_GUIDANCE_HTML_MAX_LENGTH} characters or less per section.`
      );
    }
  }
  validateMilestoneHandoffGaps(rows);
}

export function validateScenarios(
  rows: {
    draws: { amountBps: number; label: string; timingDay: number }[];
    isActive: boolean;
    name: string;
    scenarioKey?: string;
  }[],
  milestones?: MilestoneScheduleInput[]
) {
  const names = new Set<string>();
  for (const row of rows) {
    if (row.scenarioKey !== undefined) {
      validateScenarioKey(row.scenarioKey);
    }
    const normalizedName = row.name.trim().toLowerCase();
    if (!normalizedName) {
      throw new Error("Scenario name is required.");
    }
    if (names.has(normalizedName)) {
      throw new Error("Scenario names must be unique within a template.");
    }
    names.add(normalizedName);
    validateScenarioDrawRows(row.draws, milestones);
  }
  if (rows.length > 0 && rows.filter((row) => row.isActive).length !== 1) {
    throw new Error("Exactly one active scenario is required.");
  }
}

export function validateScenarioDrawRows(
  rows: { amountBps: number; label: string; timingDay: number }[],
  milestones?: MilestoneScheduleInput[]
) {
  if (rows.length === 0) {
    throw new Error("Scenario requires at least one draw.");
  }
  const total = sumBy(rows, (row) => row.amountBps);
  if (total !== TOTAL_BPS) {
    throw new Error(
      `Draw total must equal 100.00%; received ${(total / 100).toFixed(2)}%.`
    );
  }
  for (const row of rows) {
    if (!row.label.trim()) {
      throw new Error("Draw labels are required.");
    }
    if (row.timingDay < 0) {
      throw new Error("Draw timing day must be non-negative.");
    }
    if (row.amountBps <= 0) {
      throw new Error("Draw percentage must be positive.");
    }
  }
  if (milestones) {
    validateDrawTimingsAgainstMilestones(rows, milestones);
  }
}

export function assertHardCodedDefaultTemplatesConform() {
  for (const templateRow of DEFAULT_TEMPLATES) {
    validateTemplateKey(templateRow.templateKey);
    const milestones = templateRow.milestones.map(toMilestoneInput);
    validateTemplateRows(milestones);
    validateScenarios(templateRow.scenarios.map(toScenarioInput), milestones);
  }
}

export function validateTemplateKey(templateKey: string) {
  if (!TIMELINE_DEMO_KEY_PATTERN.test(templateKey)) {
    throw new Error(
      "Template key must use lowercase letters, numbers, and hyphens."
    );
  }
}

export function validateScenarioKey(scenarioKey: string) {
  if (!TIMELINE_DEMO_KEY_PATTERN.test(scenarioKey)) {
    throw new Error(
      "Scenario key must use lowercase letters, numbers, and hyphens."
    );
  }
}

export function validateMilestoneHandoffGaps(rows: MilestoneScheduleInput[]) {
  const included = sortedIncludedMilestones(rows);
  for (let index = 0; index < included.length - 1; index += 1) {
    const gap =
      milestoneStartDay(included, index + 1) - milestoneEndDay(included, index);
    if (gap > TIMELINE_DEMO_SETTINGS_HANDOFF_GAP_DAYS) {
      throw new Error(
        `Milestone handoff gap cannot exceed ${TIMELINE_DEMO_SETTINGS_HANDOFF_GAP_DAYS} days.`
      );
    }
  }
}

export function validateDrawTimingsAgainstMilestones(
  draws: ScenarioDrawScheduleInput[],
  milestones: MilestoneScheduleInput[]
) {
  void draws;
  void milestones;
}

export function buildMilestoneDrawWindows(
  rows: MilestoneScheduleInput[]
): MilestoneDrawWindow[] {
  const included = sortedIncludedMilestones(rows);
  const windows: MilestoneDrawWindow[] = [];
  for (let index = 0; index < included.length - 1; index += 1) {
    const row = included[index];
    const next = included[index + 1];
    if (!(row && next)) {
      continue;
    }
    windows.push({
      afterMilestoneEndDay: milestoneEndDay(included, index),
      afterMilestoneKey: row.milestoneKey,
      afterMilestoneName: row.name,
      beforeMilestoneKey: next.milestoneKey,
      beforeMilestoneName: next.name,
      beforeMilestoneStartDay: milestoneStartDay(included, index + 1),
    });
  }
  const final = included.at(-1);
  if (final) {
    const finalIndex = included.length - 1;
    const finalEndDay = milestoneEndDay(included, finalIndex);
    windows.push({
      afterMilestoneEndDay: finalEndDay,
      afterMilestoneKey: final.milestoneKey,
      afterMilestoneName: final.name,
      beforeMilestoneKey: "final-closeout",
      beforeMilestoneStartDay:
        finalEndDay + TIMELINE_DEMO_SETTINGS_HANDOFF_GAP_DAYS,
    });
  }
  return windows;
}

export function defaultDrawTimingDay(rows: MilestoneScheduleInput[]) {
  const [firstWindow] = buildMilestoneDrawWindows(rows);
  if (!firstWindow) {
    return 0;
  }
  return Math.min(
    firstWindow.beforeMilestoneStartDay - 1,
    firstWindow.afterMilestoneEndDay + TIMELINE_DEMO_SETTINGS_DRAW_OFFSET_DAYS
  );
}

export function sortedIncludedMilestones(rows: MilestoneScheduleInput[]) {
  return rows
    .filter((row) => row.included)
    .slice()
    .sort(
      (a, b) =>
        a.order - b.order || a.milestoneKey.localeCompare(b.milestoneKey)
    );
}

export function milestoneStartDay(rows: MilestoneScheduleInput[], index: number) {
  return rows
    .slice(0, index)
    .reduce(
      (day, row) =>
        day + row.durationDays + TIMELINE_DEMO_SETTINGS_HANDOFF_GAP_DAYS,
      0
    );
}

export function milestoneEndDay(rows: MilestoneScheduleInput[], index: number) {
  return milestoneStartDay(rows, index) + (rows[index]?.durationDays ?? 0);
}

export function seedIndex(templateKey: string) {
  return Math.max(
    0,
    DEFAULT_TEMPLATES.findIndex((row) => row.templateKey === templateKey)
  );
}

export function uniqueKey(base: string, existing: string[]) {
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

assertHardCodedDefaultTemplatesConform();
