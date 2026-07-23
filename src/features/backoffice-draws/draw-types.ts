import type { FunctionReturnType } from "convex/server";

import type { api } from "../../../convex/_generated/api";

export type BrokerageDrawsResult = FunctionReturnType<
  typeof api.production_proposals.listBrokerageDraws
>;

export type BrokerageDrawRow = BrokerageDrawsResult["draws"][number];

export type BrokerageDrawBuildGroup = BrokerageDrawsResult["builds"][number];

export type DrawPulseFilter =
  | "all"
  | "requested"
  | "approved"
  | "planned"
  | "released"
  | "rejected";

export type DrawViewMode = "by_build" | "table";
