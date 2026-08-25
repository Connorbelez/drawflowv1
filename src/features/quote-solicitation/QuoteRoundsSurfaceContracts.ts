import type { FunctionReturnType } from "convex/server";

import type { api } from "../../../convex/_generated/api";

export type QuoteRoundListProjection = FunctionReturnType<
  typeof api.quote_rounds.listQuoteRounds
>;
export type QuoteRoundRegisterRow = QuoteRoundListProjection["rounds"][number];
export type QuoteRoundRegisterMode = "all" | QuoteRoundRegisterRow["mode"];
export type QuoteRoundRegisterSort =
  | "attention"
  | "deadline"
  | "recent"
  | "title";

export const LIFECYCLE_PHASES: QuoteRoundRegisterRow["state"][] = [
  "draft",
  "open",
  "closed",
  "cancelled",
];
export const APP_TIME_ZONE = "America/Toronto";

export interface QuoteRoundsSurfaceProps {
  buildId: string;
  onCreate?: () => void;
  onOpen?: (roundId: string) => void;
  organizationId: string;
  readOnly?: boolean;
  readOnlyLabel?: string;
}

export type QuoteRoundsQueryProps = QuoteRoundsSurfaceProps & {
  cachedList?: QuoteRoundListProjection;
  deleteError?: string;
  deletingId?: string;
  onData: (value: QuoteRoundListProjection) => void;
  onDeleteDraft: (row: QuoteRoundRegisterRow) => Promise<void>;
  onDeleteErrorReset: () => void;
  onRetry: () => void;
};

export type QuoteRoundsRegisterContext = QuoteRoundsSurfaceProps & {
  deleteError?: string;
  deletingId?: string;
  onDeleteDraft: (row: QuoteRoundRegisterRow) => Promise<void>;
  onDeleteErrorReset: () => void;
};

export function formatDeadline(value: number | undefined) {
  if (!value) {
    return "Not set";
  }
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: APP_TIME_ZONE,
  }).format(new Date(value));
}

export function formatLastActivity(value: number) {
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: APP_TIME_ZONE,
  }).format(new Date(value));
}

export function hasScopeUpdate(row: QuoteRoundRegisterRow) {
  return (
    row.state !== "closed" &&
    row.state !== "cancelled" &&
    row.scopeUpdateAvailable === true
  );
}

export function formatDeadlineRelative(
  deadline: number | undefined,
  state: QuoteRoundRegisterRow["state"],
  now: number
) {
  if (state === "closed") {
    return "Closed";
  }
  if (state === "cancelled") {
    return "Cancelled";
  }
  if (!deadline) {
    return "Not set";
  }
  const delta = deadline - now;
  if (delta <= 0) {
    return "Overdue";
  }
  const hours = Math.ceil(delta / (60 * 60 * 1000));
  if (hours < 48) {
    return `${hours}h`;
  }
  return `${Math.ceil(hours / 24)}d`;
}

export function modeLabel(mode: QuoteRoundRegisterRow["mode"]) {
  return mode === "combined"
    ? "Labour + Materials"
    : mode === "labour"
      ? "Labour"
      : "Materials";
}

export function stateLabel(state: QuoteRoundRegisterRow["state"]) {
  return state === "open"
    ? "Open"
    : state === "closed"
      ? "Closed"
      : state === "cancelled"
        ? "Cancelled"
        : "Draft";
}

export function actionLabel(row: QuoteRoundRegisterRow) {
  return row.state === "draft"
    ? "Continue draft"
    : row.state === "open"
      ? "Review responses"
      : row.state === "closed"
        ? "Compare responses"
        : "View history";
}

export const DETAIL_UNAVAILABLE_LABEL = "View (quote detail unavailable)";
export const DETAIL_UNAVAILABLE_TITLE =
  "Quote detail view is unavailable in this workspace.";

export function primaryActionLabel(
  row: QuoteRoundRegisterRow,
  onOpen: ((roundId: string) => void) | undefined,
  readOnly: boolean,
  mobile = false
) {
  if (!onOpen) {
    return DETAIL_UNAVAILABLE_LABEL;
  }
  if (readOnly) {
    return mobile ? "View round" : "View";
  }
  return actionLabel(row);
}

export function deliveryLabel(row: QuoteRoundRegisterRow) {
  if (row.delivery.status === "not_dispatched") {
    return row.delivery.undispatched > 0
      ? `${row.delivery.undispatched} not dispatched`
      : "Not dispatched";
  }
  const parts: string[] = [];
  if (row.delivery.delivered) {
    parts.push(`${row.delivery.delivered} delivered`);
  }
  if (row.delivery.pending) {
    parts.push(`${row.delivery.pending} pending`);
  }
  if (row.delivery.failed) {
    parts.push(`${row.delivery.failed} failed`);
  }
  if (row.delivery.undispatched) {
    parts.push(`${row.delivery.undispatched} not dispatched`);
  }
  return parts.join(" · ") || "Not dispatched";
}

export function communicationSummary(row: QuoteRoundRegisterRow) {
  const recipientDelivery = row.recipientDelivery ?? [];
  const actionRequired = recipientDelivery.filter(
    (recipient) => recipient.actionRequired
  ).length;
  const retrying = recipientDelivery.filter(
    (recipient) => recipient.recoveryState === "retrying"
  ).length;
  const reminders = recipientDelivery.filter(
    (recipient) => recipient.reminderEligible
  ).length;
  const parts = [`${recipientDelivery.length} tracked`];
  if (actionRequired) {
    parts.push(`${actionRequired} action required`);
  }
  if (retrying) {
    parts.push(`${retrying} retrying`);
  }
  if (reminders) {
    parts.push(`${reminders} reminder${reminders === 1 ? "" : "s"} eligible`);
  }
  return parts.join(" · ");
}
