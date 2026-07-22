import type { FunctionReturnType } from "convex/server";

import type { api } from "../../../../convex/_generated/api";

export type BuilderRosterResult = FunctionReturnType<
  typeof api.builderRoster.listBuilderRoster
>;

export type BuilderRow = BuilderRosterResult["builders"][number];
export type BuilderAccount = BuilderRow["accounts"][number];
export type BuilderProposal = BuilderRow["proposals"][number];
export type BuilderBuild = BuilderRow["builds"][number];
export type BrokerageOption = BuilderRosterResult["brokerages"][number];

export type AssignableBrokersResult = FunctionReturnType<
  typeof api.builderRoster.listAssignableBrokers
>;
export type AssignableBrokerage = AssignableBrokersResult["brokerages"][number];
export type AssignableBroker = AssignableBrokerage["brokers"][number];

export type UnprovisionedBuildersResult = FunctionReturnType<
  typeof api.builderRoster.listUnprovisionedBuilders
>;
export type UnprovisionedBuilder =
  UnprovisionedBuildersResult["candidates"][number];
export type BuilderStage =
  | "invited"
  | "no_proposal"
  | "drafting"
  | "in_review"
  | "approved"
  | "building"
  | "closed"
  | "dormant";

export type ProposalStatus = BuilderProposal["status"];

export interface StageMeta {
  /** Short operator gloss for tooltips and the detail header. */
  hint: string;
  label: string;
  /** Badge tone aligned to the semantic palette. */
  tone: "default" | "info" | "success" | "warning" | "secondary" | "outline";
}

export const STAGE_META: Record<BuilderStage, StageMeta> = {
  approved: {
    hint: "A proposal is approved and awaiting build kickoff.",
    label: "Approved",
    tone: "success",
  },
  building: {
    hint: "At least one active build is underway.",
    label: "Building",
    tone: "default",
  },
  closed: {
    hint: "Engagement wound down; only closed proposals remain.",
    label: "Closed",
    tone: "secondary",
  },
  dormant: {
    hint: "Profile is deactivated. History is retained.",
    label: "Dormant",
    tone: "outline",
  },
  drafting: {
    hint: "Builder is drafting a proposal but has not submitted.",
    label: "Drafting",
    tone: "warning",
  },
  in_review: {
    hint: "A proposal is submitted and awaiting broker review.",
    label: "In review",
    tone: "info",
  },
  invited: {
    hint: "Provisioned but no account has been linked yet.",
    label: "Invited",
    tone: "outline",
  },
  no_proposal: {
    hint: "Account linked, but no proposal has been started.",
    label: "No proposal",
    tone: "outline",
  },
};

export const PROPOSAL_STATUS_META: Record<
  ProposalStatus,
  { label: string; tone: StageMeta["tone"] }
> = {
  approved: { label: "Approved", tone: "success" },
  closed: { label: "Closed", tone: "secondary" },
  draft: { label: "Draft", tone: "warning" },
  submitted: { label: "Submitted", tone: "info" },
};

export const PROPOSAL_STATUS_ORDER: ProposalStatus[] = [
  "draft",
  "submitted",
  "approved",
  "closed",
];

const EMAIL_TAIL_RE = /@.*/;
const NAME_SPLIT_RE = /[\s._-]+/;

/** Two-letter initials from a display name, falling back to the email local part. */
export function initials(
  name: string | null | undefined,
  email: string | null | undefined
): string {
  const source = (name ?? email?.replace(EMAIL_TAIL_RE, "") ?? "").trim();
  if (!source) {
    return "?";
  }
  const parts = source.split(NAME_SPLIT_RE).filter(Boolean);
  if (parts.length === 0) {
    return "?";
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  const last = parts.at(-1) ?? "";
  return (parts[0][0] + (last[0] ?? "")).toUpperCase();
}

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

/** Full currency from integer cents (e.g. 125000000 → "$1,250,000"). */
export function formatCurrency(cents: number): string {
  return currencyFormatter.format(Math.round(cents) / 100);
}

/** Compact currency for dense cells (e.g. 125000000 → "$1.3M"). */
export function formatCompactCurrency(cents: number): string {
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
  { amount: 4.345_24, unit: "week" },
  { amount: 12, unit: "month" },
  { amount: Number.POSITIVE_INFINITY, unit: "year" },
];

const relativeFormatter = new Intl.RelativeTimeFormat("en-US", {
  numeric: "auto",
});

/** Human relative time from an epoch-ms timestamp (e.g. "3 days ago"). */
export function formatRelativeTime(
  timestamp: number,
  now = Date.now()
): string {
  if (!timestamp) {
    return "never";
  }
  let duration = (timestamp - now) / 1000;
  for (const division of RELATIVE_DIVISIONS) {
    if (Math.abs(duration) < division.amount) {
      return relativeFormatter.format(Math.round(duration), division.unit);
    }
    duration /= division.amount;
  }
  return relativeFormatter.format(Math.round(duration), "year");
}

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** Absolute date label from an epoch-ms timestamp (e.g. "12 Mar 2026"). */
export function formatDate(timestamp: number | null | undefined): string {
  if (!timestamp) {
    return "\u2014";
  }
  return dateFormatter.format(timestamp);
}
