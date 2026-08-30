import { Badge, type BadgeProps } from "#/components/ui/badge.tsx";
import { cn } from "#/lib/utils.ts";
import type { QuoteStatus } from "./contractor-quotes-prototype-types.ts";

function statusMeta(
  status: QuoteStatus,
): { dot: string; label: string; variant: BadgeProps["variant"] } {
  switch (status) {
    case "draft":
      return { dot: "bg-warning", label: "Draft", variant: "warning" };
    case "submitted":
      return { dot: "bg-success", label: "Submitted", variant: "success" };
    case "stale":
      return { dot: "bg-warning", label: "Stale", variant: "warning" };
    case "offer":
      return { dot: "bg-primary", label: "Offer pending", variant: "info" };
    case "closed":
      return {
        dot: "bg-muted-foreground",
        label: "Closed",
        variant: "secondary",
      };
    case "public":
      return { dot: "bg-primary", label: "Open bid", variant: "info" };
  }
}

export function StatusBadge({ status }: { status: QuoteStatus }) {
  const meta = statusMeta(status);
  return (
    <Badge size="sm" variant={meta.variant}>
      <span className={cn("size-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </Badge>
  );
}

export function statusLabel(status: QuoteStatus) {
  return statusMeta(status).label;
}

export function actionLabel(status: QuoteStatus) {
  switch (status) {
    case "draft":
      return "Continue draft";
    case "stale":
      return "Review quote";
    case "submitted":
      return "View submission";
    case "offer":
      return "Review offer";
    case "public":
      return "Start bid";
    case "closed":
      return "View history";
  }
}
