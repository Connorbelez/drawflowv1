import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useCallback } from "react";

import { DrawControlRoom } from "#/features/backoffice-draws/draw-control-room.tsx";
import type { BrokerageDrawsResult } from "#/features/backoffice-draws/draw-types.ts";
import type { DrawWorkflowCapabilities } from "#/features/draw-workflow/drawWorkflow.ts";
import { canMakeActiveBuildFinalDecision } from "#/lib/auth/rbac.ts";
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
  const startDrawReview = useMutation(
    api.production_proposals.startActiveBuildDrawReview
  );
  const submitDrawForAdmin = useMutation(
    api.production_proposals.submitActiveBuildDrawForAdmin
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
  const onAdvanceDraw = useCallback(
    async (input: {
      buildId: string;
      drawKey: string;
      note: string;
      status: "requested" | "in_review";
    }) => {
      const mutation =
        input.status === "requested" ? startDrawReview : submitDrawForAdmin;
      await mutation({
        buildId: input.buildId as Id<"activeBuilds">,
        drawKey: input.drawKey,
        note: input.note,
        workosOrganizationId,
      });
    },
    [startDrawReview, submitDrawForAdmin, workosOrganizationId]
  );
  const canMakeFinalDecision = canMakeActiveBuildFinalDecision([
    context.role,
    ...(context.roles ?? []),
  ]);
  const drawCapabilities: DrawWorkflowCapabilities = {
    canApprove: canMakeFinalDecision && Boolean(onApproveDraw),
    canOpenReview: true,
    canReject: canMakeFinalDecision && Boolean(onRejectDraw),
    canRelease: false,
    canStartReview: Boolean(onAdvanceDraw),
    canSubmitForAdmin: Boolean(onAdvanceDraw) && !canMakeFinalDecision,
  };

  return (
    <DrawControlRoom
      data={draws}
      drawCapabilities={drawCapabilities}
      onAdvanceDraw={onAdvanceDraw}
      onApproveDraw={canMakeFinalDecision ? onApproveDraw : undefined}
      onRejectDraw={canMakeFinalDecision ? onRejectDraw : undefined}
      pending={draws === undefined}
    />
  );
}
