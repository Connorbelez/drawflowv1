import { cn } from "#/lib/utils.ts";
import type {
  MaterialPlanningBudgetTreatment,
  MaterialPlanningItem,
  MaterialPlanningItemType,
  MaterialPlanningPayload,
} from "./MaterialPlanningTab.tsx";

export interface ItemFormState {
  budgetSubmilestoneKey: string;
  budgetTreatment: MaterialPlanningBudgetTreatment;
  costCents: string;
  description: string;
  itemType: MaterialPlanningItemType;
  milestoneKey: string;
  quantity: string;
  reason: string;
  relevantSubmilestoneKeys: string[];
  supplier: string;
  title: string;
}

export function summarizeItems(items: MaterialPlanningItem[]) {
  const suppliers = new Set(
    items
      .map((item) => item.supplier?.trim())
      .filter((supplier): supplier is string => Boolean(supplier))
  );
  return {
    equipmentCount: items.filter((item) => item.itemType === "equipment")
      .length,
    materialCount: items.filter((item) => item.itemType === "material").length,
    supplierCount: suppliers.size,
    totalCents: items.reduce((sum, item) => sum + totalForItem(item), 0),
  };
}

export function itemToFormState(
  item: MaterialPlanningItem | undefined,
  milestoneKey: string,
  defaultBudgetSubmilestoneKey: string | undefined,
  defaultBudgetTreatment: MaterialPlanningBudgetTreatment
): ItemFormState {
  const budgetTreatment =
    item === undefined
      ? defaultBudgetTreatment
      : normalizeBudgetTreatment(item.budgetTreatment);
  return {
    // Existing active-build rows own their budget target. Preserve it even
    // when the budget controls are hidden/locked; only a new draft may use
    // the caller's default target.
    budgetSubmilestoneKey:
      item === undefined
        ? defaultBudgetTreatment === "logOnly"
          ? ""
          : (defaultBudgetSubmilestoneKey ?? "")
        : budgetTreatment === "logOnly"
          ? ""
          : (item.budgetSubmilestoneKey ?? defaultBudgetSubmilestoneKey ?? ""),
    budgetTreatment,
    costCents: item ? centsToDollarsInput(item.costCents) : "",
    description: item?.description ?? "",
    itemType: item?.itemType ?? "material",
    milestoneKey: item?.milestoneKey ?? milestoneKey,
    quantity: String(item?.quantity ?? 1),
    reason: "",
    relevantSubmilestoneKeys: item?.relevantSubmilestoneKeys ?? [],
    supplier: item?.supplier ?? "",
    title: item?.title ?? "",
  };
}

export function formToPayload(form: ItemFormState): MaterialPlanningPayload {
  return {
    budgetSubmilestoneKey:
      form.budgetTreatment === "logOnly"
        ? null
        : form.budgetSubmilestoneKey || null,
    budgetTreatment: form.budgetTreatment,
    costCents: dollarsInputToCents(form.costCents),
    description: optionalText(form.description),
    itemType: form.itemType,
    milestoneKey: form.milestoneKey,
    quantity: numberFromInput(form.quantity, 1),
    reason: optionalText(form.reason),
    relevantSubmilestoneKeys: form.relevantSubmilestoneKeys,
    supplier: optionalText(form.supplier),
    title: form.title.trim(),
  };
}

export function numberFromInput(value: string, fallback = 0) {
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function dollarsInputToCents(value: string) {
  return Math.round(numberFromInput(value) * 100);
}

export function centsToDollarsInput(cents: number) {
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? String(dollars) : dollars.toFixed(2);
}

export function costDollarsValid(value: string) {
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) && parsed >= 0;
}

export function materialSubmitGuidance({
  budgetTargetMissing,
  costInvalid,
  maintainOverBudget,
  milestoneEntered,
  pending,
  quantityEntered,
  quantityInvalid,
  submitLabel,
  titleEntered,
}: {
  budgetTargetMissing: boolean;
  costInvalid: boolean;
  maintainOverBudget: boolean;
  milestoneEntered: boolean;
  pending: boolean;
  quantityEntered: boolean;
  quantityInvalid: boolean;
  submitLabel: string;
  titleEntered: boolean;
}) {
  if (pending) {
    return `${submitLabel} is unavailable while this item is saving.`;
  }
  if (costInvalid && quantityInvalid) {
    return `${submitLabel} is unavailable because Cost per unit cannot be negative and Quantity must be greater than zero.`;
  }
  if (costInvalid) {
    return `${submitLabel} is unavailable because Cost per unit cannot be negative.`;
  }
  if (quantityInvalid) {
    return `${submitLabel} is unavailable because Quantity must be greater than zero.`;
  }
  if (budgetTargetMissing) {
    return `${submitLabel} is unavailable because a budget sub-milestone is required.`;
  }
  if (maintainOverBudget) {
    return `${submitLabel} is unavailable because maintained cost items exceed the sub-milestone budget.`;
  }

  const missingFields = [
    titleEntered ? null : "Title",
    milestoneEntered ? null : "Milestone",
    quantityEntered ? null : "Quantity",
  ].filter((field): field is string => Boolean(field));

  return `${submitLabel} is unavailable because ${missingFields.join(", ")} ${missingFields.length === 1 ? "is" : "are"} required.`;
}

export function quantityPositive(value: string) {
  return numberFromInput(value, 0) > 0;
}

export function optionalText(value: string) {
  const text = value.trim();
  return text.length > 0 ? text : undefined;
}

export function totalForItem(item: MaterialPlanningItem) {
  return item.totalCents ?? Math.round(item.costCents * item.quantity);
}

export function normalizeBudgetTreatment(
  treatment: MaterialPlanningBudgetTreatment | undefined
): MaterialPlanningBudgetTreatment {
  return treatment ?? "add";
}

export function budgetTreatmentLabel(
  treatment: MaterialPlanningBudgetTreatment
) {
  if (treatment === "logOnly") {
    return "Log only";
  }
  if (treatment === "maintain") {
    return "Maintain total";
  }
  return "Add to budget";
}

export function budgetTreatmentDescription(
  treatment: MaterialPlanningBudgetTreatment
) {
  if (treatment === "logOnly") {
    return "Records the item without changing the sub-milestone budget.";
  }
  if (treatment === "maintain") {
    return "Keeps the sub-milestone total fixed and reduces its unallocated balance.";
  }
  return "Increases the selected sub-milestone and proposal budgets.";
}

export function calculateDrawAvailability(
  budgetCents: number,
  borrowerCoPayBps: number
) {
  return Math.round((budgetCents * (10_000 - borrowerCoPayBps)) / 10_000);
}

export function formatCents(cents: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(cents / 100);
}

export function formatQuantity(quantity: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 3,
  }).format(quantity);
}

export function fieldId(item: MaterialPlanningItem | undefined, field: string) {
  return cn("material-planning", item?._id ?? "new", field).replace(
    /\s+/g,
    "-"
  );
}
