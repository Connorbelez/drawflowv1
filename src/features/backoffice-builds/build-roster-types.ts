import type { FunctionReturnType } from "convex/server";

import type { api } from "../../../convex/_generated/api";

export type BackofficeBuildRosterResult = FunctionReturnType<
  typeof api.production_proposals.listBackofficeBuildRoster
>;

export type BuildRosterRow = BackofficeBuildRosterResult["builds"][number];
export type BuildRosterPhase = BuildRosterRow["phase"];

export interface BuildPhaseMeta {
  hint: string;
  label: string;
  tone: "default" | "info" | "success" | "warning" | "secondary" | "outline";
}

export const BUILD_PHASE_META: Record<BuildRosterPhase, BuildPhaseMeta> = {
  active: {
    hint: "Build is underway with no open broker queue items.",
    label: "Active",
    tone: "default",
  },
  attention: {
    hint: "Expired site visits, draw requests, or milestone reviews need broker action.",
    label: "Needs attention",
    tone: "warning",
  },
  completed: {
    hint: "Loan facility is closed or every milestone is complete.",
    label: "Completed",
    tone: "success",
  },
  scheduled: {
    hint: "Build is approved and waiting for the start date.",
    label: "Scheduled",
    tone: "info",
  },
};

export const BUILD_PHASE_ORDER: BuildRosterPhase[] = [
  "attention",
  "active",
  "scheduled",
  "completed",
];

const currencyFormatter = new Intl.NumberFormat("en-US", {
  currency: "USD",
  maximumFractionDigits: 0,
  style: "currency",
});

const compactCurrencyFormatter = new Intl.NumberFormat("en-US", {
  currency: "USD",
  maximumFractionDigits: 1,
  notation: "compact",
  style: "currency",
});

export function formatBuildCurrency(cents: number): string {
  return currencyFormatter.format(Math.round(cents) / 100);
}

export function formatBuildCompactCurrency(cents: number): string {
  return compactCurrencyFormatter.format(Math.round(cents) / 100);
}

const RELATIVE_DIVISIONS: {
  amount: number;
  unit: Intl.RelativeTimeFormatUnit;
}[] = [
  { amount: 60, unit: "second" },
  { amount: 60, unit: "minute" },
  { amount: 24, unit: "hour" },
  { amount: 7, unit: "day" },
  { amount: 4.345, unit: "week" },
  { amount: 12, unit: "month" },
  { amount: Number.POSITIVE_INFINITY, unit: "year" },
];

export function formatBuildRelativeTime(timestampMs: number): string {
  const deltaSeconds = Math.round((timestampMs - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  let duration = deltaSeconds;
  for (const division of RELATIVE_DIVISIONS) {
    if (Math.abs(duration) < division.amount) {
      return formatter.format(Math.round(duration), division.unit);
    }
    duration /= division.amount;
  }
  return formatter.format(0, "second");
}

export function formatBuildStartDate(isoDate: string): string {
  const parsed = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return isoDate;
  }
  return parsed.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
