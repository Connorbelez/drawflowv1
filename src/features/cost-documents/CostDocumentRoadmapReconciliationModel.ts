"use client";

import type { Id } from "../../../convex/_generated/dataModel";
import type { CostDocumentSummary } from "./CostDocumentRoadmapReconciliation.tsx";
import type { CostDocumentSubmilestoneOption } from "./SingleCostDocumentCapture.tsx";

export function displayCostDocumentVendor(
  document: Pick<CostDocumentSummary, "vendor" | "vendorName">
) {
  return document.vendor?.displayName || document.vendorName;
}

export function allocationLabel(
  allocation: CostDocumentSummary["allocations"][number],
  submilestones: CostDocumentSubmilestoneOption[]
) {
  const option = submilestones.find(
    (submilestone) => submilestone.id === allocation.buildSubmilestoneId
  );
  return option?.label ?? allocation.submilestoneName;
}

export interface CostDocumentReview {
  annotation: string;
  createdAt: number;
  outcome: "accepted" | "needs_correction";
  revision: number;
}

export interface Filters {
  category: "all" | "labour" | "materials";
  duplicate: "all" | "has_duplicate" | "none";
  integrity: "all" | "attention" | "healthy";
  kind: "all" | "invoice" | "receipt";
  lifecycle: "all" | "current" | "superseded" | "voided";
  milestone: string;
  review: NonNullable<CostDocumentSummary["reviewAttention"]> | "all";
  submilestone: string;
  uploader: "all" | "other" | "self";
}

export const INITIAL_FILTERS: Filters = {
  category: "all",
  duplicate: "all",
  integrity: "all",
  kind: "all",
  lifecycle: "all",
  milestone: "all",
  review: "all",
  submilestone: "all",
  uploader: "all",
};

export interface MilestoneGroup {
  key: string;
  label: string;
  labour: CostDocumentSummary[];
  materials: CostDocumentSummary[];
}

export interface SubmilestoneDocumentEntry {
  allocationAmountCents: number;
  document: CostDocumentSummary;
}

export interface SubmilestoneGroup {
  budgetCents: number;
  id: Id<"buildSubmilestones">;
  labour: SubmilestoneDocumentEntry[];
  labourInvoicedCents: number;
  materials: SubmilestoneDocumentEntry[];
  materialsInvoicedCents: number;
  name: string;
  usesActualCost: boolean;
}

export function matchesFilters(
  document: CostDocumentSummary,
  filters: Filters,
  search: string,
  submilestones: CostDocumentSubmilestoneOption[]
) {
  const normalizedSearch = search.trim().toLocaleLowerCase("en-CA");
  const searchHaystack = [
    document.documentDate,
    document.title,
    displayCostDocumentVendor(document),
    document.vendorName,
    ...document.allocations.flatMap((allocation) => [
      allocation.submilestoneKey,
      allocation.submilestoneName,
      submilestones.find((item) => item.id === allocation.buildSubmilestoneId)
        ?.label || "",
    ]),
  ]
    .join(" ")
    .toLocaleLowerCase("en-CA");
  const allocationMilestones = document.allocations.map((allocation) =>
    milestoneForAllocation(allocation, submilestones)
  );
  return (
    (!normalizedSearch || searchHaystack.includes(normalizedSearch)) &&
    (filters.kind === "all" || document.kind === filters.kind) &&
    (filters.category === "all" || document.category === filters.category) &&
    (filters.lifecycle === "all" ||
      document.lifecycle.state === filters.lifecycle) &&
    (filters.review === "all" || document.reviewAttention === filters.review) &&
    (filters.duplicate === "all" ||
      (filters.duplicate === "has_duplicate"
        ? document.duplicateWarning
        : !document.duplicateWarning)) &&
    (filters.integrity === "all" ||
      (filters.integrity === "healthy"
        ? document.integrity?.healthy === true
        : document.integrity?.healthy === false)) &&
    (filters.uploader === "all" ||
      document.uploaderScope === filters.uploader) &&
    (filters.milestone === "all" ||
      allocationMilestones.includes(filters.milestone)) &&
    (filters.submilestone === "all" ||
      document.allocations.some(
        (allocation) =>
          String(allocation.buildSubmilestoneId) === filters.submilestone
      ))
  );
}

export function groupDocumentsByMilestone(
  documents: CostDocumentSummary[],
  submilestones: CostDocumentSubmilestoneOption[]
) {
  const groups = new Map<string, MilestoneGroup>();
  for (const document of documents) {
    const keys = new Set(
      document.allocations.map((allocation) =>
        milestoneForAllocation(allocation, submilestones)
      )
    );
    for (const key of keys) {
      const group = groups.get(key) || {
        key,
        label: milestoneLabel(key, submilestones),
        labour: [],
        materials: [],
      };
      group[document.category].push(document);
      groups.set(key, group);
    }
  }
  return [...groups.values()].sort((left, right) => {
    const leftOrder = milestoneOrderForKey(left.key, submilestones);
    const rightOrder = milestoneOrderForKey(right.key, submilestones);
    return (
      leftOrder - rightOrder || left.label.localeCompare(right.label, "en-CA")
    );
  });
}

export function groupDocumentsBySubmilestone(
  documents: CostDocumentSummary[],
  submilestones: CostDocumentSubmilestoneOption[],
  milestoneKey: string
): SubmilestoneGroup[] {
  if (!milestoneKey) {
    return [];
  }
  const scoped = submilestones.filter(
    (item) => milestoneForOption(item) === milestoneKey
  );
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: The canonical allocation fold keeps current-state totals and category entries aligned.
  return scoped.map((submilestone) => {
    const materials: SubmilestoneDocumentEntry[] = [];
    const labour: SubmilestoneDocumentEntry[] = [];
    let materialsInvoicedCents = 0;
    let labourInvoicedCents = 0;

    for (const document of documents) {
      for (const allocation of document.allocations) {
        if (allocation.buildSubmilestoneId !== submilestone.id) {
          continue;
        }
        const amountCents =
          document.lifecycle.state === "current"
            ? Math.max(0, allocation.amountCents)
            : 0;
        const entry: SubmilestoneDocumentEntry = {
          allocationAmountCents: allocation.amountCents,
          document,
        };
        if (document.category === "materials") {
          materials.push(entry);
          materialsInvoicedCents += amountCents;
        } else {
          labour.push(entry);
          labourInvoicedCents += amountCents;
        }
      }
    }

    const plannedBudget = Math.max(0, submilestone.budgetCents ?? 0);
    const actualCost = Math.max(0, submilestone.actualCostCents ?? 0);
    const usesActualCost =
      submilestone.milestoneStatus === "complete" && actualCost > 0;

    return {
      budgetCents: usesActualCost ? actualCost : plannedBudget,
      id: submilestone.id,
      labour,
      labourInvoicedCents,
      materials,
      materialsInvoicedCents,
      name: submilestoneDisplayName(submilestone),
      usesActualCost,
    };
  });
}

export function submilestoneDisplayName(
  option: CostDocumentSubmilestoneOption
) {
  const separator = " · ";
  const separatorIndex = option.label.indexOf(separator);
  if (separatorIndex === -1) {
    return option.label;
  }
  return option.label.slice(separatorIndex + separator.length);
}

export function uniqueMilestoneOptions(
  submilestones: CostDocumentSubmilestoneOption[]
) {
  const values = new Map<string, number>();
  for (const [index, submilestone] of submilestones.entries()) {
    const key = milestoneForOption(submilestone);
    if (!values.has(key)) {
      values.set(key, index);
    }
  }
  return [...values.entries()]
    .sort((left, right) => {
      const leftOrder = milestoneOrderForKey(left[0], submilestones);
      const rightOrder = milestoneOrderForKey(right[0], submilestones);
      return (
        leftOrder - rightOrder ||
        left[1] - right[1] ||
        left[0].localeCompare(right[0], "en-CA")
      );
    })
    .map(
      ([value]) =>
        [value, milestoneLabel(value, submilestones)] as [string, string]
    );
}

export function milestoneForAllocation(
  allocation: CostDocumentSummary["allocations"][number],
  submilestones: CostDocumentSubmilestoneOption[]
) {
  const matchingSubmilestone = submilestones.find(
    (item) => item.id === allocation.buildSubmilestoneId
  );
  return (
    matchingSubmilestone?.milestoneKey ||
    matchingSubmilestone?.label.split(" · ")[0] ||
    allocation.submilestoneKey ||
    "unmapped-roadmap"
  );
}

export function milestoneForOption(item: CostDocumentSubmilestoneOption) {
  return item.milestoneKey || item.label.split(" · ")[0] || "unmapped-roadmap";
}

export function milestoneLabel(
  value: string,
  submilestones: CostDocumentSubmilestoneOption[] = []
) {
  const context = submilestones.find(
    (item) => milestoneForOption(item) === value && item.milestoneName
  );
  return value === "unmapped-roadmap"
    ? "Unmapped roadmap allocation"
    : (context?.milestoneName ?? titleCase(value));
}

export function milestoneOrderForKey(
  key: string,
  submilestones: CostDocumentSubmilestoneOption[]
) {
  const order = submilestones.find(
    (item) => milestoneForOption(item) === key
  )?.milestoneOrder;
  return order ?? Number.POSITIVE_INFINITY;
}

export function milestoneContextForKey(
  submilestones: CostDocumentSubmilestoneOption[],
  key: string
) {
  const scoped = submilestones.filter(
    (item) => milestoneForOption(item) === key
  );
  if (scoped.length === 0) {
    return null;
  }
  const first = scoped[0];
  const plannedBudget =
    first.milestoneBudgetCents ??
    scoped.reduce(
      (total, item) => total + Math.max(0, item.budgetCents ?? 0),
      0
    );
  const actualCost =
    first.milestoneActualCostCents ??
    scoped.reduce(
      (total, item) => total + Math.max(0, item.actualCostCents ?? 0),
      0
    );
  const usesActualCost = first.milestoneStatus === "complete" && actualCost > 0;
  return {
    budgetCents: usesActualCost ? actualCost : plannedBudget,
    dayEnd: first.milestoneDayEnd,
    dayStart: first.milestoneDayStart,
    label: first.milestoneName ?? milestoneLabel(key, submilestones),
    usesActualCost,
  };
}

export function documentationCoveragePercent(
  documentedCents: number,
  targetCents: number
) {
  return targetCents > 0
    ? Math.min(100, (documentedCents / targetCents) * 100)
    : 0;
}

export function claimedWithoutReceiptCents(
  documentedCents: number,
  targetCents: number
) {
  return Math.max(0, targetCents - documentedCents);
}

export function formatCoverage(value: number) {
  if (value > 0 && value < 1) {
    return `${value.toFixed(1)}%`;
  }
  return `${Math.round(value)}%`;
}

export function updateFilters<Key extends keyof Filters>(
  setFilters: (update: (current: Filters) => Filters) => void,
  key: Key,
  value: Filters[Key]
) {
  setFilters((current) => ({ ...current, [key]: value }));
}

export function reviewBadgeVariant(
  review:
    | NonNullable<CostDocumentSummary["reviewAttention"]>
    | CostDocumentReview["outcome"]
) {
  if (review === "needs_correction") {
    return "warning" as const;
  }
  if (review === "reviewed" || review === "accepted") {
    return "success" as const;
  }
  return "outline" as const;
}

export function reviewAttentionLabel(
  review:
    | NonNullable<CostDocumentSummary["reviewAttention"]>
    | CostDocumentReview["outcome"]
) {
  if (review === "needs_correction") {
    return "Needs correction";
  }
  if (review === "partially_reviewed") {
    return "Partially reviewed";
  }
  if (review === "reviewed") {
    return "Reviewed";
  }
  if (review === "accepted") {
    return "Accepted";
  }
  return "Unreviewed";
}

export function isPreviewable(mimeType: string) {
  return mimeType === "application/pdf" || mimeType.startsWith("image/");
}

export function titleCase(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toLocaleUpperCase("en-CA"));
}

export function shortHash(value: string) {
  return value.length > 16 ? `${value.slice(0, 12)}…${value.slice(-4)}` : value;
}

export function formatDateTime(value: number) {
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

export function messageForCostDocumentAction(cause: unknown) {
  return cause instanceof Error
    ? cause.message
    : "This Cost Document action is unavailable.";
}
