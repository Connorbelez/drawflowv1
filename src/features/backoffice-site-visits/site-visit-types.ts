import type { FunctionReturnType } from "convex/server";

import type { api } from "../../../convex/_generated/api";

export type BrokerageSiteVisitsResult = FunctionReturnType<
  typeof api.production_proposals.listBrokerageSiteVisits
>;

export type BrokerageSiteVisitRow = BrokerageSiteVisitsResult["visits"][number];

export type BrokerageSiteVisitBuildGroup =
  BrokerageSiteVisitsResult["builds"][number];

export type SiteVisitOperationalStatus =
  BrokerageSiteVisitRow["operationalStatus"];

export type SiteVisitPulseFilter =
  | "all"
  | "open"
  | "in_field"
  | "expired"
  | "complete"
  | "cancelled"
  | "geofence"
  | "expiring15";

export type SiteVisitViewMode = "by_build" | "table";
