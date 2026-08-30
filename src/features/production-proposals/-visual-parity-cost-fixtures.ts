import type {
  MaterialPlanningItem,
  MaterialPlanningPayload,
} from "#/features/material-planning/MaterialPlanningTab.tsx";

export function createVisualParityCostItem(
  payload: MaterialPlanningPayload,
  suffix = `${Date.now()}`
): MaterialPlanningItem {
  return {
    _id: `proposal-cost-visual-local-${suffix}`,
    costCents: payload.costCents,
    description: payload.description,
    itemKey: `cost-visual-local-${suffix}`,
    itemType: payload.itemType,
    milestoneKey: payload.milestoneKey,
    quantity: payload.quantity,
    relevantSubmilestoneKeys: payload.relevantSubmilestoneKeys,
    supplier: payload.supplier,
    title: payload.title,
    totalCents: Math.round(payload.costCents * payload.quantity),
    updatedAt: Date.now(),
  };
}

export function getVisualParityCostItems(): MaterialPlanningItem[] {
  return [
    {
      _id: "proposal-cost-visual-lumber",
      costCents: 1_450_000,
      description:
        "Engineered lumber package staged ahead of wall framing and roof truss work.",
      itemKey: "cost-framing-lumber",
      itemType: "material" as const,
      milestoneKey: "framing",
      quantity: 1,
      relevantSubmilestoneKeys: ["wall-framing", "roof-trusses"],
      supplier: "Hamilton Structural Supply",
      title: "Framing lumber package",
      totalCents: 1_450_000,
      updatedAt: Date.UTC(2026, 4, 27, 14, 30),
    },
    {
      _id: "proposal-cost-visual-scissor-lift",
      costCents: 220_000,
      description:
        "Four-week lift rental reserved for exterior window install and weather barrier work.",
      itemKey: "cost-exterior-lift",
      itemType: "equipment" as const,
      milestoneKey: "exterior",
      quantity: 4,
      relevantSubmilestoneKeys: ["windows", "weather-barrier"],
      supplier: "Great Lakes Equipment Rental",
      title: "Scissor lift rental",
      totalCents: 880_000,
      updatedAt: Date.UTC(2026, 4, 27, 14, 30),
    },
    {
      _id: "proposal-cost-visual-cabinets",
      costCents: 2_375_000,
      description:
        "Cabinetry package ordered as a cost-only planning line, not a construction task.",
      itemKey: "cost-finish-cabinets",
      itemType: "material" as const,
      milestoneKey: "finishes",
      quantity: 1,
      relevantSubmilestoneKeys: ["cabinetry"],
      supplier: "Northline Millwork",
      title: "Cabinetry deposit",
      totalCents: 2_375_000,
      updatedAt: Date.UTC(2026, 4, 27, 14, 30),
    },
  ];
}
