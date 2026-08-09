import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import {
  type BuildDetailSubTab,
  BuildDetailTabBar,
} from "#/features/backoffice-build-detail/BuildDetailTabs.tsx";
import { BuildCollaborationWorkspace } from "#/features/build-collaboration/BuildCollaborationWorkspace.tsx";
import { normalizeBuildCollaborationFocus } from "#/features/build-collaboration/referenceFocus.ts";
import {
  type BuildSubmilestoneDetailTab,
  normalizeBuildSubmilestoneDetailTab,
} from "#/features/build-detail-targets/buildDetailTab.ts";
import { CostDocumentBatchWorkspace } from "#/features/cost-documents/CostDocumentBatchWorkspace.tsx";
import {
  type CostDocumentRouteSearch,
  normalizeCostDocumentSearch,
} from "#/features/cost-documents/costDocumentRouteState.ts";
import type { CostDocumentSubmilestoneOption } from "#/features/cost-documents/SingleCostDocumentCapture.tsx";
import { QuoteRoundComparisonSurface } from "#/features/quote-solicitation/QuoteRoundComparisonSurface.tsx";
import { QuoteRoundsSurface } from "#/features/quote-solicitation/QuoteRoundsSurface.tsx";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

interface HomeownerBuildSearch extends CostDocumentRouteSearch {
  detailTab?: BuildSubmilestoneDetailTab;
  focus?: string;
  roundId?: string;
  tab?: "costs" | "quotes";
}

function normalizeRoundId(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export const Route = createFileRoute("/homeowner/builds/$buildId")({
  component: HomeownerBuildCollaboration,
  staticData: {
    breadcrumb: {
      label: "Build collaboration",
      to: "/homeowner",
    },
  },
  validateSearch: (search: Record<string, unknown>): HomeownerBuildSearch => {
    const focus = normalizeBuildCollaborationFocus(search.focus);
    const detailTab = normalizeBuildSubmilestoneDetailTab(search.detailTab);
    const costDocumentSearch = normalizeCostDocumentSearch(search);
    const roundId = normalizeRoundId(search.roundId);
    const tab =
      roundId || search.tab === "quotes"
        ? "quotes"
        : search.tab === "costs" ||
            costDocumentSearch.costBatch ||
            costDocumentSearch.costDocument ||
            costDocumentSearch.costDocumentDraft
          ? "costs"
          : undefined;
    return {
      ...costDocumentSearch,
      ...(detailTab ? { detailTab } : {}),
      ...(focus ? { focus } : {}),
      ...(roundId ? { roundId } : {}),
      ...(tab ? { tab } : {}),
    };
  },
});

function HomeownerBuildCollaboration() {
  const { buildId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const costsActive = search.tab === "costs";
  const quotesActive = search.tab === "quotes" || Boolean(search.roundId);
  const scope = useQuery(api.build_participants.getMyBuildParticipationScope, {
    buildId: buildId as Id<"activeBuilds">,
    workspaceRole: "homeowner",
  });
  const costDocumentSubmilestones = useQuery(
    api.cost_documents.listCostDocumentSubmilestoneOptions,
    scope && costsActive
      ? ({
          actorCapacity: "homeowner",
          buildId: buildId as Id<"activeBuilds">,
          organizationId: scope.organizationId,
        } as never)
      : "skip",
  );

  if (scope === undefined) {
    return (
      <main className="p-4 sm:p-6">
        <Frame className="mx-auto w-full max-w-6xl">
          <FramePanel className="animate-pulse text-muted-foreground text-sm">
            Loading Build collaboration…
          </FramePanel>
        </Frame>
      </main>
    );
  }

  if (!scope) {
    return (
      <main className="p-4 sm:p-6">
        <Frame className="mx-auto w-full max-w-6xl">
          <FramePanel>
            <p className="font-medium text-sm">Build unavailable</p>
            <p className="mt-1 text-muted-foreground text-sm">
              This Build is not assigned to your homeowner workspace. Return to
              your Build list and choose an assigned Build.
            </p>
          </FramePanel>
        </Frame>
      </main>
    );
  }

  const activeTab: BuildDetailSubTab = costsActive
    ? "costs"
    : quotesActive
      ? "quotes"
      : "details";
  const onChangeTab = (tab: BuildDetailSubTab) =>
    navigate({
      params: { buildId },
      replace: true,
      search: {
        ...search,
        costBatch: tab === "costs" ? search.costBatch : undefined,
        costDocument: tab === "costs" ? search.costDocument : undefined,
        costDocumentDraft:
          tab === "costs" ? search.costDocumentDraft : undefined,
        roundId: tab === "quotes" ? search.roundId : undefined,
        tab: tab === "costs" || tab === "quotes" ? tab : undefined,
      },
      to: "/homeowner/builds/$buildId",
    } as never);

  return (
    <main className="p-4 sm:p-6">
      <div className="mx-auto w-full max-w-6xl space-y-4">
        <header>
          <p className="text-muted-foreground text-xs uppercase">
            Active build
          </p>
          <h1 className="mt-1 font-semibold text-2xl">{scope.buildName}</h1>
          <p className="mt-1 text-muted-foreground text-sm">
            {activeTab === "costs" ? "Build costs" : "Build collaboration"}
          </p>
        </header>
        <BuildDetailTabBar
          activeTab={activeTab}
          labels={{ details: "Collaboration" }}
          onChangeTab={onChangeTab}
          tabs={["details", "costs", "quotes"]}
        />
        {activeTab === "costs" ? (
          costDocumentSubmilestones === undefined ? (
            <Frame>
              <FramePanel className="animate-pulse text-muted-foreground text-sm">
                Loading Cost Documents…
              </FramePanel>
            </Frame>
          ) : (
            <CostDocumentBatchWorkspace
              actorCapacity="homeowner"
              batchId={search.costBatch}
              buildId={buildId as Id<"activeBuilds">}
              draftId={search.costDocumentDraft}
              onBatchIdChange={(costBatch) =>
                navigate({
                  params: { buildId },
                  replace: Boolean(search.costBatch) || !costBatch,
                  search: {
                    ...search,
                    costBatch,
                    costDocument: undefined,
                    costDocumentDraft: undefined,
                    tab: "costs",
                  },
                  to: "/homeowner/builds/$buildId",
                } as never)
              }
              organizationId={scope.organizationId}
              reconciliation={{
                onCostDocumentCorrectionStarted: ({ batchId, draftId }) =>
                  navigate({
                    params: { buildId },
                    replace: false,
                    search: {
                      ...search,
                      costBatch: batchId,
                      costDocument: undefined,
                      costDocumentDraft: draftId,
                      tab: "costs",
                    },
                    to: "/homeowner/builds/$buildId",
                  } as never),
                onCostDocumentIdChange: (costDocument) =>
                  navigate({
                    params: { buildId },
                    replace: !costDocument,
                    search: {
                      ...search,
                      costBatch: undefined,
                      costDocument,
                      costDocumentDraft: undefined,
                      tab: "costs",
                    },
                    to: "/homeowner/builds/$buildId",
                  } as never),
                selectedCostDocumentId: search.costDocument,
              }}
              submilestones={
                costDocumentSubmilestones as CostDocumentSubmilestoneOption[]
              }
            />
          )
        ) : quotesActive ? (
          search.roundId ? (
            <QuoteRoundComparisonSurface
              buildId={buildId}
              onExit={() =>
                navigate({
                  params: { buildId },
                  replace: true,
                  search: { ...search, roundId: undefined, tab: "quotes" },
                  to: "/homeowner/builds/$buildId",
                } as never)
              }
              organizationId={scope.organizationId}
              quoteRoundId={search.roundId}
              readerKind="homeowner"
              readOnly
            />
          ) : (
            <QuoteRoundsSurface
              buildId={buildId}
              onOpen={(roundId) =>
                navigate({
                  params: { buildId },
                  replace: false,
                  search: { ...search, roundId, tab: "quotes" },
                  to: "/homeowner/builds/$buildId",
                } as never)
              }
              organizationId={scope.organizationId}
              readOnly
              readOnlyLabel="Homeowner"
            />
          )
        ) : (
          <BuildCollaborationWorkspace
            buildId={buildId}
            detailTab={search.detailTab}
            focusedReference={search.focus}
            organizationId={scope.organizationId}
            viewerCapacity="homeowner"
          />
        )}
      </div>
    </main>
  );
}
