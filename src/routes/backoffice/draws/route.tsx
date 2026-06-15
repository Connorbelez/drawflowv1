import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useCallback } from "react";

import { DrawControlRoom } from "#/features/backoffice-draws/draw-control-room.tsx";
import type { BrokerageDrawsResult } from "#/features/backoffice-draws/draw-types.ts";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

export const Route = createFileRoute("/backoffice/draws")({
  staticData: {
    breadcrumb: {
      label: "Draws",
      to: "/backoffice/draws",
    },
  },
  component: RouteComponent,
});

function RouteComponent() {
  const context = Route.useRouteContext();
  const workosOrganizationId = context.organizationId as string;
  const draws = useQuery(api.production_proposals.listBrokerageDraws, {
    workosOrganizationId,
  }) as BrokerageDrawsResult | undefined;
  const approveDraw = useMutation(
    api.production_proposals.approveActiveBuildDraw
  );
  const rejectDraw = useMutation(
    api.production_proposals.rejectActiveBuildDraw
  );

  const onApproveDraw = useCallback(
    async (input: { buildId: string; drawKey: string; note: string }) => {
      await approveDraw({
        buildId: input.buildId as Id<"activeBuilds">,
        drawKey: input.drawKey,
        note: input.note,
        workosOrganizationId,
      });
    },
    [approveDraw, workosOrganizationId]
  );

  const onRejectDraw = useCallback(
    async (input: { buildId: string; drawKey: string; note: string }) => {
      await rejectDraw({
        buildId: input.buildId as Id<"activeBuilds">,
        drawKey: input.drawKey,
        note: input.note,
        workosOrganizationId,
      });
    },
    [rejectDraw, workosOrganizationId]
  );

  return (
    <DrawControlRoom
      data={draws}
      onApproveDraw={onApproveDraw}
      onRejectDraw={onRejectDraw}
      pending={draws === undefined}
    />
  );
}
