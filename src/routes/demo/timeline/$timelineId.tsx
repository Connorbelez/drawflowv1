import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { createStandardSchemaV1, parseAsString } from "nuqs";

import { api } from "../../../../convex/_generated/api";
import { convexWorkspaceToTimelineState } from "./-timeline-convex-adapter";
import { TimelineDemoWorkspace } from "./index";

const durableTimelineSearchParsers = {
  proposal: parseAsString,
};

export const Route = createFileRoute("/demo/timeline/$timelineId")({
  component: DurableTimelineRoute,
  ssr: false,
  validateSearch: createStandardSchemaV1(durableTimelineSearchParsers, {
    partialOutput: true,
  }),
});

function DurableTimelineRoute() {
  const { timelineId } = Route.useParams();
  const { proposal } = Route.useSearch();
  const workspace = useQuery(
    api.demo_timeline_plans.demo_getTimelinePlanWorkspace,
    { planId: timelineId },
  );
  const resolvedProposal = useQuery(
    api.demo_timeline_plans.demo_resolveProposalShortLink,
    proposal ? { proposalSlug: proposal } : "skip",
  );

  if (workspace === undefined) {
    return (
      <main className="grid min-h-svh place-items-center bg-bg-base text-foreground">
        <div className="flex items-center gap-2 rounded-lg border bg-background p-4 text-sm">
          <Loader2 className="size-4 animate-spin" />
          Loading durable timeline...
        </div>
      </main>
    );
  }

  const canonicalProposal = workspace.plan.proposalSlug;
  const proposalSlug =
    proposal && resolvedProposal !== null ? proposal : canonicalProposal;
  const buildKey =
    typeof workspace.build?.key === "string" ? workspace.build.key : undefined;
  const liveBuildHref = buildKey
    ? `/builder/demo/dashboard/builds/${buildKey}`
    : undefined;

  return (
    <>
      {proposal && resolvedProposal === null ? (
        <div className="border-destructive/30 border-b bg-destructive/10 px-4 py-2 text-destructive text-sm">
          Proposal short link is invalid or disabled. Showing the canonical
          timeline by id.
        </div>
      ) : null}
      <TimelineDemoWorkspace
        durableMeta={{
          backofficeHref: "/backoffice",
          proposalHref: `/demo/timeline/${timelineId}?proposal=${canonicalProposal}`,
          proposalSlug,
          status: workspace.plan.status,
          ...(buildKey ? { buildKey } : {}),
          ...(liveBuildHref ? { liveBuildHref } : {}),
        }}
        durablePlanId={timelineId}
        initialState={convexWorkspaceToTimelineState(workspace)}
        modificationRequests={workspace.modificationRequests}
        planSummary={{
          address: workspace.plan.address,
          includedCount: workspace.milestones.length,
          templateTitle: workspace.plan.buildName,
          totalBudget: Math.round(workspace.plan.totalBudgetCents / 100),
        }}
      />
    </>
  );
}
