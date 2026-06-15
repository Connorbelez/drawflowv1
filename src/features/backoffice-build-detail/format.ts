export function formatCents(
  cents: number,
  opts: { compact?: boolean } = {}
): string {
  if (!Number.isFinite(cents)) {
    return "$0";
  }
  const dollars = Math.round(cents) / 100;
  if (opts.compact && Math.abs(dollars) >= 1000) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
      notation: "compact",
    }).format(dollars);
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(dollars);
}

export function formatDate(date?: string | number): string {
  if (date == null) {
    return "—";
  }
  const d = typeof date === "number" ? new Date(date) : new Date(date);
  if (Number.isNaN(d.valueOf())) {
    return "—";
  }
  return d.toISOString().slice(0, 10);
}

export function formatBuildAddress(build: {
  address?: string;
  subtitle: string;
}): string {
  const stored = build.address?.trim();
  if (stored) {
    return stored;
  }
  const location = build.subtitle.match(/·\s*([^·]+?)\s*·/)?.[1]?.trim();
  return location ? `Mock address - ${location}` : "Mock address - demo build";
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeIsoDateInput(
  fieldLabel: string,
  value: string,
  fallback: string
): string {
  const trimmed = value.trim();
  if (!ISO_DATE_RE.test(trimmed)) {
    throw new Error(`${fieldLabel} must use YYYY-MM-DD format.`);
  }
  const parsed = Date.parse(trimmed);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${fieldLabel} is not a valid calendar date.`);
  }
  return trimmed;
}

export function addDaysToIsoDate(isoDate: string, days: number): string {
  const parsed = Date.parse(isoDate);
  if (!Number.isFinite(parsed)) {
    throw new Error("Base date is not valid.");
  }
  return new Date(parsed + days * 86_400_000).toISOString().slice(0, 10);
}

export function formatRelative(ms: number): string {
  const delta = Date.now() - ms;
  if (delta < 0) {
    return "just now";
  }
  const days = Math.floor(delta / 86_400_000);
  if (days >= 1) {
    return `${days} day${days === 1 ? "" : "s"} ago`;
  }
  const hours = Math.floor(delta / 3_600_000);
  if (hours >= 1) {
    return `${hours}h ago`;
  }
  const minutes = Math.floor(delta / 60_000);
  if (minutes >= 1) {
    return `${minutes}m ago`;
  }
  return "just now";
}

export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) {
    return "?";
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function statusChipTone(
  status: string
): "approved" | "requested" | "draft" | "review" | "rejected" {
  switch (status) {
    case "release_approved":
    case "approved":
    case "completion_approved":
      return "approved";
    case "requested":
    case "completion_requested":
      return "requested";
    case "review":
    case "partially_eligible":
    case "submitted":
      return "review";
    case "rejected":
      return "rejected";
    default:
      return "draft";
  }
}

export function statusChipLabel(status: string): string {
  switch (status) {
    case "release_approved":
      return "Approved";
    case "approved":
      return "Approved";
    case "completion_approved":
      return "Complete";
    case "requested":
      return "Requested";
    case "completion_requested":
      return "Submitted";
    case "partially_eligible":
      return "Review";
    case "not_yet_eligible":
      return "Draft";
    case "rejected":
      return "Rejected";
    default:
      return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
}
