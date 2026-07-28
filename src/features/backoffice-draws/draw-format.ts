import type { ComponentProps } from "react";

import type { Badge } from "#/components/ui/badge.tsx";

import type { BrokerageDrawRow } from "./draw-types.ts";

export type ProductionDrawStatus = BrokerageDrawRow["status"];

export function drawStatusLabel(status: ProductionDrawStatus): string {
  switch (status) {
    case "approved_for_release":
      return "Approved for release";
    case "in_review":
      return "In review";
    case "ready_for_admin":
      return "Ready for admin";
    case "rejected":
      return "Rejected";
    case "requested":
      return "Requested";
    case "released":
      return "Released";
    default:
      return "Planned";
  }
}

export function drawBadgeVariant(
  status: ProductionDrawStatus
): NonNullable<ComponentProps<typeof Badge>["variant"]> {
  if (status === "released") {
    return "success";
  }
  if (status === "requested" || status === "ready_for_admin") {
    return "warning";
  }
  if (status === "in_review" || status === "approved_for_release") {
    return "info";
  }
  if (status === "rejected") {
    return "destructive";
  }
  return "outline";
}

export function drawNeedsAction(status: ProductionDrawStatus): boolean {
  return (
    status === "requested" ||
    status === "in_review" ||
    status === "ready_for_admin"
  );
}
