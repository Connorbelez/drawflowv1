"use client";
import type { TimelineItem } from "#/components/roadmap/AnimatedCurvedTimeline.tsx";
import {
  allocateBudgetCents,
  formatCurrency,
  parseCurrencyToCents,
} from "#/features/builder-proposal-demo/template-helpers.ts";
import type { BudgetWorkbookProposalDraft } from "#/features/proposal-import/budget-workbook-schema.ts";
import { coerceSiteVisitGuidance } from "#/lib/site-visit-guidance.ts";
import { mapSubmilestoneSnapshotRows } from "./-timeline-milestone-submilestones.ts";
import type {
  DemoMilestone,
  IsometricIconKey,
} from "./-timeline-share-snapshot.ts";
import {
  calculateDrawAvailabilityAmount,
  DEFAULT_BORROWER_CO_PAY_BPS,
} from "./-timeline-share-snapshot.ts";
import "./-timeline-setup-flow.css";
import {
  DEFAULT_GENERATED_DRAW_OFFSET_DAYS,
  DEFAULT_HANDOFF_GAP_DAYS,
  DEFAULT_NEW_MILESTONE_BUDGET_TEXT,
  DEFAULT_NEW_MILESTONE_DURATION_TEXT,
  DEFAULT_NEW_SUB_MILESTONE_BUDGET_TEXT,
  DEFAULT_NEW_SUB_MILESTONE_DURATION_TEXT,
  DURATION_PREFIX_REGEX,
  GENERATED_TIMELINE_CURRENT_DAY,
  inferImportedMilestoneIcon,
  rowBudgetCents,
  rowDurationDays,
  sanitizeSubMilestoneName,
  slugifyMilestone,
  slugifySubMilestone,
  subMilestoneDescriptions,
  type TimelineSetupMilestoneRow,
  type TimelineSetupPreset,
  type TimelineSetupPresetSubMilestone,
  type TimelineSetupSubMilestone,
  type TimelineSetupTemplate,
} from "./TimelineSetupFlowContracts.ts";

export function budgetWorkbookDraftToSetupRows(
  draft: BudgetWorkbookProposalDraft
): TimelineSetupMilestoneRow[] {
  return draft.milestones.map((milestone, index) => {
    const durationDays = Math.max(1, milestone.submilestones.length);
    const key = milestone.milestoneKey || slugifyMilestone(milestone.name);
    const subMilestoneDetails = milestone.submilestones.map((submilestone) => ({
      budgetText: formatCurrency(Math.round(submilestone.budgetAmount * 100)),
      description: `Imported budget line from ${draft.sourceName ?? "budget workbook"}`,
      durationText: "1",
      id: submilestone.budgetLineKey.replace(/[^a-zA-Z0-9_-]+/g, "-"),
      name: sanitizeSubMilestoneName(submilestone.name),
    }));

    return withSubMilestoneDetails(
      {
        budgetText: formatCurrency(Math.round(milestone.budgetAmount * 100)),
        contractorAssignments: [],
        costItems: [],
        dependencyKeys:
          index === 0
            ? []
            : [draft.milestones[index - 1]?.milestoneKey ?? ""].filter(Boolean),
        durationDays,
        durationText: String(durationDays),
        excluded: false,
        icon: inferImportedMilestoneIcon(
          `${milestone.name} ${milestone.submilestones
            .map((submilestone) => submilestone.name)
            .join(" ")}`
        ),
        key,
        name: milestone.name,
        order: index,
        percentageBps: Math.round(
          (milestone.budgetAmount / Math.max(1, draft.totalBudget)) * 10_000
        ),
        startDay: index,
        subMilestoneDetails,
        subMilestones: subMilestoneDetails.map((detail) => detail.name),
        type: "imported_budget",
      },
      subMilestoneDetails
    );
  });
}

export function allocateWeightedBudgetCents(
  totalCents: number,
  rows: Array<{ percentageBps?: number }>
) {
  const totalBps = rows.reduce(
    (sum, row) => sum + Math.max(0, Math.round(row.percentageBps ?? 0)),
    0
  );
  if (totalBps <= 0) {
    return;
  }

  const roundedTotal = Math.round(totalCents);
  const allocations = rows.map((row, order) => {
    const raw = roundedTotal * Math.max(0, Math.round(row.percentageBps ?? 0));
    return {
      cents: Math.floor(raw / totalBps),
      order,
      remainder: raw % totalBps,
    };
  });
  let remainderCents =
    roundedTotal -
    allocations.reduce((sum, allocation) => sum + allocation.cents, 0);
  const byRemainder = [...allocations].sort(
    (a, b) => b.remainder - a.remainder || a.order - b.order
  );
  for (const allocation of byRemainder) {
    if (remainderCents <= 0) {
      break;
    }
    allocation.cents += 1;
    remainderCents -= 1;
  }
  return allocations
    .sort((a, b) => a.order - b.order)
    .map((allocation) => allocation.cents);
}

export function buildSubMilestoneDetails(
  row: TimelineSetupPreset,
  budgetCents: number,
  durationDays: number,
  milestoneStartDay: number
): TimelineSetupSubMilestone[] {
  const presets: TimelineSetupPresetSubMilestone[] =
    row.subMilestoneDetails && row.subMilestoneDetails.length > 0
      ? [...row.subMilestoneDetails]
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          .map((detail) => ({
            ...detail,
            name: sanitizeSubMilestoneName(detail.name),
          }))
      : (row.subMilestones.length > 0
          ? row.subMilestones
          : ["Initial scope"]
        ).map((name) => ({ name: sanitizeSubMilestoneName(name) }));
  const count = Math.max(1, presets.length);
  const weightedBudgetCents = allocateWeightedBudgetCents(budgetCents, presets);
  const baseBudgetCents = Math.floor(Math.max(0, budgetCents) / count);
  const budgetRemainderCents =
    Math.max(0, budgetCents) - baseBudgetCents * count;
  const baseDurationDays = Math.floor(Math.max(1, durationDays) / count);
  const durationRemainderDays =
    Math.max(1, durationDays) - baseDurationDays * count;

  let subMilestoneCursor = milestoneStartDay;

  return presets.map((preset, index) => {
    const normalizedDuration = Math.max(
      1,
      Math.round(
        preset.durationDays ??
          baseDurationDays + (index < durationRemainderDays ? 1 : 0)
      )
    );
    const startDay = Number.isFinite(preset.startDay)
      ? Math.round(preset.startDay ?? milestoneStartDay)
      : subMilestoneCursor;
    subMilestoneCursor = startDay + normalizedDuration;

    return {
      budgetText: formatCurrency(
        weightedBudgetCents?.[index] ??
          baseBudgetCents + (index < budgetRemainderCents ? 1 : 0)
      ),
      description:
        preset.description ??
        subMilestoneDescriptions[index % subMilestoneDescriptions.length],
      durationText: String(normalizedDuration),
      ...(preset.fieldGuidance === undefined
        ? {}
        : { fieldGuidance: preset.fieldGuidance }),
      id:
        preset.key ?? `${row.key}-${slugifySubMilestone(preset.name)}-${index}`,
      name: preset.name,
      ...(preset.scopeOfWorkTiptapJson === undefined
        ? {}
        : { scopeOfWorkTiptapJson: preset.scopeOfWorkTiptapJson }),
      startDay,
    };
  });
}

export function withSubMilestoneDetails(
  row: TimelineSetupMilestoneRow,
  subMilestoneDetails: TimelineSetupSubMilestone[]
): TimelineSetupMilestoneRow {
  return {
    ...row,
    subMilestoneDetails,
    subMilestones: subMilestoneDetails.map((detail) =>
      sanitizeSubMilestoneName(detail.name)
    ),
  };
}

export function makeUniqueRowKey(
  name: string,
  rows: TimelineSetupMilestoneRow[]
) {
  const baseKey = `custom-${slugifySubMilestone(name)}`;
  const existingKeys = new Set(rows.map((row) => row.key));

  if (!existingKeys.has(baseKey)) {
    return baseKey;
  }

  let suffix = 2;
  while (existingKeys.has(`${baseKey}-${suffix}`)) {
    suffix += 1;
  }

  return `${baseKey}-${suffix}`;
}

export function createCustomMilestoneRow({
  name,
  order,
  rows,
}: {
  name: string;
  order: number;
  rows: TimelineSetupMilestoneRow[];
}): TimelineSetupMilestoneRow {
  const key = makeUniqueRowKey(name, rows);
  const subMilestoneDetails: TimelineSetupSubMilestone[] = [
    {
      budgetText: DEFAULT_NEW_SUB_MILESTONE_BUDGET_TEXT,
      description:
        "Define reimbursable scope, evidence, and acceptance criteria",
      durationText: DEFAULT_NEW_SUB_MILESTONE_DURATION_TEXT,
      id: `${key}-scope-definition-0`,
      name: "Scope definition",
    },
  ];

  return withSubMilestoneDetails(
    {
      budgetText: DEFAULT_NEW_MILESTONE_BUDGET_TEXT,
      contractorAssignments: [],
      costItems: [],
      dependencyKeys: [],
      durationDays: Number(DEFAULT_NEW_MILESTONE_DURATION_TEXT),
      durationText: DEFAULT_NEW_MILESTONE_DURATION_TEXT,
      excluded: false,
      icon: "change",
      key,
      name,
      order,
      percentageBps: 0,
      startDay: 0,
      subMilestoneDetails,
      subMilestones: [],
      type: "custom",
    },
    subMilestoneDetails
  );
}

export function formatRowType(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .toLowerCase();
}

export function buildDefaultTemplate(
  baseItems: TimelineItem<DemoMilestone>[]
): TimelineSetupTemplate {
  const totalAmount = Math.max(
    1,
    baseItems.reduce((sum, item) => sum + (item.data?.amount ?? 0), 0)
  );

  return {
    description:
      "The current Elm Street draw roadmap, ready for budget tuning before the live timeline.",
    isDefault: true,
    rows: baseItems.map((item) => {
      const data = item.data;
      const amount = data?.amount ?? 0;

      return {
        baseItemId: item.id,
        dependencyKeys: [],
        durationDays: data?.durationDays ?? 14,
        icon: data?.icon ?? "change",
        key: item.id,
        name: data?.name ?? item.label ?? item.id,
        percentageBps: Math.round((amount / totalAmount) * 10_000),
        siteVisitGuidance: coerceSiteVisitGuidance(data?.siteVisitGuidance),
        subMilestones: data?.subMilestones ?? [],
        type: data?.icon ?? "scope",
      } satisfies TimelineSetupPreset;
    }),
    summary: `${baseItems.length} project milestones`,
    templateKey: "single-family-full-build",
    title: "Single Family Full Build",
  } satisfies TimelineSetupTemplate;
}

export function secondaryTemplates(): TimelineSetupTemplate[] {
  return [
    {
      description:
        "Selective demolition, structural repairs, envelope work, interior rebuild, and inspection closeout.",
      rows: [
        preset(
          "renovation_permits",
          "Permit updates and mobilization",
          800,
          10,
          "foundation",
          "permitting",
          ["Permit update", "Site protection", "Mobilization"]
        ),
        preset(
          "selective_demo",
          "Selective demolition",
          1400,
          16,
          "change",
          "demolition",
          ["Interior demo", "Waste removal", "Utility safety"]
        ),
        preset(
          "structural_repairs",
          "Structural repairs",
          1800,
          24,
          "framing",
          "foundation_structural",
          ["Beam repair", "Load path", "Inspection"]
        ),
        preset(
          "mep_rework",
          "MEP rework",
          1500,
          21,
          "roughIn",
          "mechanical_electrical_plumbing",
          ["Plumbing rework", "Electrical panel", "HVAC adjustments"]
        ),
        preset(
          "envelope_repairs",
          "Envelope repairs",
          1300,
          18,
          "exterior",
          "exterior_envelope",
          ["Window repair", "Weather barrier", "Exterior patch"]
        ),
        preset(
          "renovation_interiors",
          "Interior rebuild",
          2400,
          36,
          "finishes",
          "interior_finish",
          ["Drywall", "Cabinetry", "Fixture set"]
        ),
        preset(
          "renovation_closeout",
          "Inspection closeout",
          800,
          10,
          "closeout",
          "closeout",
          ["Punch list", "Final inspection", "Closeout package"]
        ),
      ],
      summary: "7 renovation milestones",
      templateKey: "single-family-renovation",
      title: "Single Family Renovation",
    },
    {
      description:
        "Multi-unit civil work, podium, stacked framing, shared systems, unit finishes, and occupancy closeout.",
      rows: [
        preset(
          "multiplex_permits",
          "Permits and civil mobilization",
          500,
          16,
          "foundation",
          "permitting",
          ["Civil permit", "Mobilization", "Survey control"]
        ),
        preset(
          "shared_sitework",
          "Shared sitework and utilities",
          1000,
          28,
          "foundation",
          "site_preparation",
          ["Rough grading", "Utility trenching", "Site access"]
        ),
        preset(
          "podium_foundation",
          "Foundation and podium slab",
          1250,
          30,
          "foundation",
          "foundation_structural",
          ["Footings", "Podium formwork", "Concrete placement"]
        ),
        preset(
          "stacked_framing",
          "Stacked framing and dry-in",
          1900,
          42,
          "framing",
          "foundation_structural",
          ["Level framing", "Trusses", "Dry-in"]
        ),
        preset(
          "shared_mep",
          "Shared MEP rough-ins",
          1250,
          35,
          "roughIn",
          "mechanical_electrical_plumbing",
          ["Main risers", "Electrical rooms", "Mechanical trunk"]
        ),
        preset(
          "unit_finishes",
          "Unit finishes",
          1350,
          45,
          "finishes",
          "interior_finish",
          ["Drywall", "Flooring", "Kitchen package"]
        ),
        preset(
          "multiplex_closeout",
          "Final inspections and occupancy",
          750,
          18,
          "closeout",
          "closeout",
          ["Life safety", "Occupancy inspections", "Closeout binder"]
        ),
      ],
      summary: "7 multiplex milestones",
      templateKey: "multiplex-build",
      title: "Multi-plex Build",
    },
  ];
}

export function preset(
  key: string,
  name: string,
  percentageBps: number,
  durationDays: number,
  icon: IsometricIconKey,
  type: string,
  subMilestones: string[]
): TimelineSetupPreset {
  return {
    dependencyKeys: [],
    durationDays,
    icon,
    key,
    name,
    percentageBps,
    subMilestones,
    type,
  };
}

export function createRowsFromTemplate(
  template: TimelineSetupTemplate,
  budgetCents: number
): TimelineSetupMilestoneRow[] {
  const allocations = allocateBudgetCents(budgetCents, template.rows);
  let cursor = GENERATED_TIMELINE_CURRENT_DAY;

  return template.rows.map((row, order) => {
    const budgetCents = allocations[order] ?? 0;
    const startDay = cursor;
    cursor += row.durationDays + DEFAULT_HANDOFF_GAP_DAYS;

    return {
      ...row,
      budgetText: formatCurrency(budgetCents),
      contractorAssignments: [],
      costItems: [],
      durationText: String(row.durationDays),
      excluded: false,
      order,
      startDay,
      subMilestoneDetails: buildSubMilestoneDetails(
        row,
        budgetCents,
        row.durationDays,
        startDay
      ),
    };
  });
}

export function chooseStatus(
  order: number,
  includedCount: number
): DemoMilestone["status"] {
  if (includedCount > 0 && order === 0) {
    return "ready";
  }

  return "upcoming";
}

export function chooseTone(status: DemoMilestone["status"]) {
  if (status === "complete") {
    return "complete" as const;
  }

  if (status === "ready") {
    return "active" as const;
  }

  return "upcoming" as const;
}

export function buildTimelineItemsFromSetupRows(
  rows: TimelineSetupMilestoneRow[],
  coPayBps = DEFAULT_BORROWER_CO_PAY_BPS
): TimelineItem<DemoMilestone>[] {
  const includedRows = rows.filter((row) => !row.excluded);
  return includedRows.map((row, includedIndex) => {
    const budgetCents = rowBudgetCents(row);
    const durationDays = rowDurationDays(row);
    const amount = Number.isFinite(budgetCents)
      ? Math.round(budgetCents / 100)
      : 0;
    const normalizedDuration = Number.isFinite(durationDays)
      ? durationDays
      : row.durationDays;
    const startDay = Number.isFinite(row.startDay)
      ? Math.round(row.startDay)
      : GENERATED_TIMELINE_CURRENT_DAY;
    const status = chooseStatus(includedIndex, includedRows.length);
    const item: TimelineItem<DemoMilestone> = {
      data: {
        amount,
        draw: `Draw ${includedIndex + 1}`,
        drawAvailabilityAmount: calculateDrawAvailabilityAmount(
          amount,
          coPayBps
        ),
        drawX:
          startDay +
          normalizedDuration +
          Math.min(
            DEFAULT_GENERATED_DRAW_OFFSET_DAYS,
            DEFAULT_HANDOFF_GAP_DAYS - 1
          ),
        dependencyKeys: row.dependencyKeys,
        durationDays: normalizedDuration,
        evidence: status === "ready" ? "Ready to start" : "Not started",
        icon: row.icon,
        name: row.name,
        policy: status === "ready" ? "Planning handoff" : "Upcoming",
        siteVisitGuidance: row.siteVisitGuidance,
        status,
        subMilestones: row.subMilestones,
        submilestoneDetails: mapSubmilestoneSnapshotRows(
          row.subMilestoneDetails.map((detail, index) => ({
            budgetCents: (() => {
              const cents = parseCurrencyToCents(detail.budgetText);
              return Number.isFinite(cents) ? Math.max(0, cents) : undefined;
            })(),
            description: detail.description,
            durationDays: (() => {
              const parsed = Number(
                detail.durationText.replace(DURATION_PREFIX_REGEX, "")
              );
              return Number.isFinite(parsed)
                ? Math.max(1, Math.round(parsed))
                : undefined;
            })(),
            fieldGuidance: detail.fieldGuidance,
            key: detail.id,
            name: detail.name,
            order: index + 1,
            scopeOfWorkTiptapJson: detail.scopeOfWorkTiptapJson,
            startDay: Number.isFinite(detail.startDay)
              ? Math.round(detail.startDay ?? startDay)
              : startDay,
          })),
          row.key
        ),
      },
      eyebrow: `Milestone ${includedIndex + 1}`,
      id: row.key,
      label: row.name.split(" ")[0] ?? row.name,
      lane: includedIndex % 3 === 1 ? -1 : includedIndex % 3 === 2 ? 1 : 0,
      markerLabel: String(includedIndex + 1),
      tone: chooseTone(status),
      x: startDay,
    };

    return item;
  });
}
