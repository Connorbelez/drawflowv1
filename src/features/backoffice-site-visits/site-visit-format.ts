import type {
  BrokerageSiteVisitRow,
  SiteVisitOperationalStatus,
} from "./site-visit-types.ts";

export function formatTokenCountdown(msRemaining: number) {
  if (msRemaining <= 0) {
    return "Expired";
  }
  const totalSeconds = Math.floor(msRemaining / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

export function operationalStatusLabel(status: SiteVisitOperationalStatus) {
  switch (status) {
    case "open":
      return "Open";
    case "in_field":
      return "In field";
    case "expired":
      return "Expired";
    case "complete":
      return "Complete";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

export function operationalStatusBadgeVariant(
  status: SiteVisitOperationalStatus,
): "default" | "destructive" | "outline" | "secondary" | "success" | "warning" {
  switch (status) {
    case "open":
      return "default";
    case "in_field":
      return "secondary";
    case "expired":
      return "destructive";
    case "complete":
      return "success";
    case "cancelled":
      return "outline";
    default:
      return "outline";
  }
}

export function tokenStateLabel(
  tokenState: BrokerageSiteVisitRow["tokenState"],
) {
  switch (tokenState) {
    case "live":
      return "Token live";
    case "opened":
      return "Opened in field";
    case "consumed":
      return "Report submitted";
    case "expired":
      return "Token expired";
    case "not_sent":
      return "Not sent";
    default:
      return tokenState;
  }
}

export function absoluteSiteVisitUrl(path: string) {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  if (typeof window === "undefined") {
    return path;
  }
  return `${window.location.origin}${path.startsWith("/") ? path : `/${path}`}`;
}
