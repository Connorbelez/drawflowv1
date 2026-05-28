import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { useMemo, useState } from "react";

import { AnimatedCurvedTimeline } from "#/components/roadmap/AnimatedCurvedTimeline.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { buildProductionRoadmapProjection } from "#/features/production-proposals/productionRoadmapAdapter.ts";
import {
  getVisualParityProposalDetail,
  isProductionVisualParityFixtureEnabled,
} from "#/features/production-proposals/visualParityFixtures.ts";
import { MilestoneCard } from "#/routes/demo/timeline/-MilestoneCard.tsx";
import { TimelineEndNodeButton } from "#/routes/demo/timeline/-TimelineEndNodeButton.tsx";
import { getMilestoneEndX } from "#/routes/demo/timeline/-timeline-milestone-schedule.ts";
import { TimelineCashflowCompoundChart } from "#/routes/demo/timeline/-TimelineCashflowCompoundChart.tsx";
import { TimelineDrawAvailabilityChart } from "#/routes/demo/timeline/-TimelineDrawAvailabilityChart.tsx";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";

export const Route = createFileRoute("/builder/proposals/$proposalId/roadmap")({
  ssr: false,
  component: ProductionProposalRoadmapRoute,
});

function ProductionProposalRoadmapRoute() {
  const { proposalId } = Route.useParams();
  const context = Route.useRouteContext();
  const [probeDay, setProbeDay] = useState<number | null>(null);
  const prefersReducedMotion = useReducedMotion();
  const workosOrganizationId = context.organizationId as string;
  const visualFixtureEnabled = isProductionVisualParityFixtureEnabled();
  const detailQuery = useQuery(
    api.production_proposals.getProposalDetail,
    visualFixtureEnabled
      ? "skip"
      : {
          proposalId: proposalId as Id<"buildProposals">,
          workosOrganizationId,
        },
  );
  const detail = visualFixtureEnabled
    ? getVisualParityProposalDetail()
    : detailQuery;
  const roadmap = useMemo(
    () => (detail ? buildProductionRoadmapProjection(detail) : null),
    [detail],
  );

  if (!(detail && roadmap)) {
    return (
      <div className="grid min-h-[24rem] place-items-center">
        <div className="flex items-center gap-2 rounded-lg border bg-background p-4 text-sm">
          <Loader2 className="size-4 animate-spin" />
          Loading production roadmap...
        </div>
      </div>
    );
  }

  return (
    <main className="flex min-h-[calc(100vh-4rem)] flex-col gap-4 bg-muted/30 p-3 md:p-5">
      <Frame>
        <FramePanel className="p-4">
          <h1 className="font-semibold text-2xl tracking-tight">
            {detail.proposal.buildName} roadmap
          </h1>
          <p className="mt-1 text-muted-foreground text-sm">
            Production preview of the proposal construction roadmap and planned
            reimbursement draw unlocks.
          </p>
        </FramePanel>
      </Frame>
      <Card>
        <CardHeader>
          <CardTitle>Cashflow preview</CardTitle>
        </CardHeader>
        <CardContent>
          <TimelineCashflowCompoundChart
            data={roadmap.cashflow.data}
            hideMilestoneEndReferenceLines
            onProbeChange={setProbeDay}
            referenceLines={roadmap.cashflow.referenceLines}
            testId="production-roadmap-cashflow-chart"
            xDomain={roadmap.cashflow.xDomain}
            xTicks={roadmap.cashflow.xTicks}
            yDomain={roadmap.cashflow.yDomain}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Construction roadmap</CardTitle>
        </CardHeader>
        <CardContent>
          <AnimatedCurvedTimeline
            baselineY={104}
            cardWidth={232}
            cardTop={150}
            endCardWidth={260}
            formatValue={formatTimelineDay}
            getItemEndValue={getMilestoneEndX}
            height={462}
            hoverValue={probeDay}
            items={roadmap.items}
            markerStackProximityPx={96}
            markers={roadmap.markers}
            minInlineNodeSpacingPx={72}
            minNodeSpacingPx={198}
            onHoverValueChange={setProbeDay}
            paddingX={112}
            pixelsPerUnit={6.4}
            range={{
              max: roadmap.cashflow.xDomain[1],
              min: 0,
              unit: "days",
            }}
            renderCard={(item, context) => (
              <MilestoneCard
                active={context.active}
                complete={item.tone === "complete"}
                item={item}
                onUpdate={() => undefined}
                readOnly
                reducedMotion={Boolean(prefersReducedMotion)}
              />
            )}
            renderEndNode={(item, context) => (
              <TimelineEndNodeButton
                active={context.active}
                complete={item.tone === "complete"}
                item={item}
                onClick={() => context.activate()}
                reducedMotion={Boolean(prefersReducedMotion)}
                testIdPrefix="production-roadmap-timeline"
              />
            )}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Draw availability</CardTitle>
        </CardHeader>
        <CardContent>
          <TimelineDrawAvailabilityChart
            data={roadmap.drawAvailability.data}
            formatMoney={formatCompactMoney}
            formatTimelineDay={formatTimelineDay}
            onProbeChange={setProbeDay}
            referenceLines={roadmap.drawAvailability.referenceLines}
            testId="production-roadmap-draw-availability-chart"
            xDomain={roadmap.drawAvailability.xDomain}
            xTicks={roadmap.drawAvailability.xTicks}
            yDomain={roadmap.drawAvailability.yDomain}
          />
        </CardContent>
      </Card>
      <p className="text-muted-foreground text-xs">
        {probeDay === null
          ? "Hover the charts to inspect projected draw timing."
          : `Inspecting ${formatTimelineDay(probeDay)}.`}
      </p>
    </main>
  );
}

function formatTimelineDay(value: number) {
  return `Day ${Math.round(value)}`;
}

function formatCompactMoney(value: number) {
  const absolute = Math.abs(value);
  const sign = value < 0 ? "-" : "";

  if (absolute >= 1_000_000) {
    return `${sign}$${(absolute / 1_000_000).toFixed(1)}M`;
  }

  if (absolute >= 1_000) {
    return `${sign}$${Math.round(absolute / 1_000)}K`;
  }

  return `${sign}$${Math.round(absolute)}`;
}
