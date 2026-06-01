import { createFileRoute } from "@tanstack/react-router";
import { createStandardSchemaV1 } from "nuqs";

import {
  TimelineWorkspace,
  timelineWorkspaceSearchParsers,
} from "#/features/timeline-workspace";

export * from "#/features/timeline-workspace";

export const Route = createFileRoute("/demo/timeline/")({
  component: RouteComponent,
  ssr: false,
  validateSearch: createStandardSchemaV1(timelineWorkspaceSearchParsers, {
    partialOutput: true,
  }),
});

function RouteComponent() {
  return <TimelineWorkspace workspaceMode="demo" />;
}
