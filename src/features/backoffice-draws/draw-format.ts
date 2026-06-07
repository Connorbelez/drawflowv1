import type { ComponentProps } from "react";

import type { Badge } from "#/components/ui/badge.tsx";

import type { BrokerageDrawRow } from "./draw-types.ts";

export type ProductionDrawStatus = BrokerageDrawRow["status"];

export function drawStatusLabel(status: ProductionDrawStatus): string {
  switch (status) {
    case "approved":
      return "Approved";
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
  status: ProductionDrawStatus,
): NonNullable<ComponentProps<typeof Badge>["variant"]> {
  if (status === "released") {
    return "success";
  }
  if (status === "requested") {
    return "warning";
  }
  if (status === "approved") {
    return "info";
  }
  if (status === "rejected") {
    return "destructive";
  }
  return "outline";
}

export function drawNeedsAction(status: ProductionDrawStatus): boolean {
  return status === "requested" || status === "approved";
}
