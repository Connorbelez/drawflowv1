import { Presence } from "@convex-dev/presence";
import { Timeline } from "convex-timeline";

import { components } from "../_generated/api";

export const presence = new Presence(components.presence);
export const proposalTimeline = new Timeline(components.timeline, {
  maxNodesPerScope: { "proposal:": 200 },
});
