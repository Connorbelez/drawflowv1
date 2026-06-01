import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import {
  ArrowLeft,
  ClipboardList,
  FileText,
  Loader2,
  Plus,
  UserRoundX,
} from "lucide-react";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#/components/ui/card.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import type { ProposalKanbanCard } from "#/features/backoffice-dashboard/mock-data.ts";
import { isProductionVisualParityFixtureEnabled } from "#/features/production-proposals/visualParityFixtures.ts";
import { api } from "../../../../convex/_generated/api";

export const Route = createFileRoute("/backoffice/proposals/unassigned")({
  ssr: false,
  component: BackofficeUnassignedDraftsRoute,
});

type UnassignedDraft = Pick<
  ProposalKanbanCard,
  | "address"
  | "borrowerWorkingCapitalLimitCents"
  | "builder"
  | "createdAt"
  | "id"
  | "loanAmount"
  | "name"
  | "proposalId"
  | "statusLabel"
  | "totalBudgetCents"
  | "updatedAt"
>;

const visualDrafts: UnassignedDraft[] = [
  {
    address: "Hamilton, ON",
    borrowerWorkingCapitalLimitCents: 40_000_000,
    builder: "Unassigned builder",
    createdAt: Date.UTC(2026, 4, 29, 14, 30),
    id: "proposal_visual_unassigned",
    loanAmount: "$1,250,000",
    name: "Hamilton Infill Build",
    proposalId: "proposal_visual_unassigned",
    statusLabel: "Draft",
    totalBudgetCents: 125_000_000,
    updatedAt: Date.UTC(2026, 4, 29, 15, 15),
  },
];

function BackofficeUnassignedDraftsRoute() {
  const context = Route.useRouteContext();
  const navigate = useNavigate();
  const workosOrganizationId = context.organizationId as string;
  const visualFixtureEnabled = isProductionVisualParityFixtureEnabled();
  const draftsQuery = useQuery(
    api.production_proposals.listUnassignedDraftProposals,
    visualFixtureEnabled ? "skip" : { workosOrganizationId },
  );
  const drafts = visualFixtureEnabled ? visualDrafts : draftsQuery?.drafts;

  if (!drafts) {
    return (
      <main className="grid min-h-[24rem] place-items-center bg-muted/30 p-4">
        <div className="flex items-center gap-2 rounded-lg border bg-background p-4 text-sm">
          <Loader2 className="size-4 animate-spin" />
          Loading unassigned broker drafts...
        </div>
      </main>
    );
  }

  return (
    <UnassignedDraftsSurface
      drafts={drafts}
      onBack={() => void navigate({ to: "/backoffice" })}
      onNewBuild={() => void navigate({ to: "/backoffice/proposals/new" })}
      onOpenDraft={(draft) =>
        void navigate({
          params: { planId: draft.proposalId ?? draft.id },
          to: "/backoffice/proposals/$planId",
        })
      }
    />
  );
}

export function UnassignedDraftsSurface({
  drafts,
  onBack,
  onNewBuild,
  onOpenDraft,
}: {
  drafts: UnassignedDraft[];
  onBack: () => void;
  onNewBuild: () => void;
  onOpenDraft: (draft: UnassignedDraft) => void;
}) {
  return (
    <main className="min-h-[calc(100vh-4rem)] bg-muted/30 p-3 sm:p-4 lg:p-6">
      <Frame className="mx-auto w-full max-w-7xl">
        <FramePanel className="flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Button onClick={onBack} size="sm" variant="outline">
                <ArrowLeft />
                Backoffice
              </Button>
              <Badge variant="outline">Broker drafts</Badge>
            </div>
            <h1 className="text-balance font-semibold text-2xl tracking-tight">
              Unassigned Build Proposal drafts
            </h1>
            <p className="max-w-3xl text-muted-foreground text-sm">
              Broker-initiated setup packages that have a draft timeline and no
              builder profile attached yet.
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
            <Button onClick={onNewBuild}>
              <Plus />
              New Build
            </Button>
          </div>
        </FramePanel>

        <FramePanel className="p-4 sm:p-5">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="font-semibold text-base">Draft queue</h2>
              <p className="text-muted-foreground text-sm">
                {drafts.length} unassigned{" "}
                {drafts.length === 1 ? "draft" : "drafts"} awaiting builder
                assignment.
              </p>
            </div>
            <Badge variant={drafts.length ? "warning" : "success"}>
              {drafts.length ? "Needs assignment" : "Clear"}
            </Badge>
          </div>

          {drafts.length > 0 ? (
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,22rem),1fr))]">
              {drafts.map((draft) => (
                <UnassignedDraftCard
                  draft={draft}
                  key={draft.proposalId ?? draft.id}
                  onOpenDraft={onOpenDraft}
                />
              ))}
            </div>
          ) : (
            <div className="grid min-h-64 place-items-center rounded-xl border border-dashed bg-background/70 p-6 text-center">
              <div className="grid max-w-md justify-items-center gap-3">
                <div className="grid size-12 place-items-center rounded-xl bg-muted text-muted-foreground">
                  <ClipboardList aria-hidden="true" />
                </div>
                <div>
                  <h2 className="font-semibold">No unassigned drafts</h2>
                  <p className="mt-1 text-muted-foreground text-sm">
                    New broker-initiated Build Proposals appear here after the
                    setup workflow generates the draft timeline.
                  </p>
                </div>
                <Button onClick={onNewBuild}>
                  <Plus />
                  Start New Build
                </Button>
              </div>
            </div>
          )}
        </FramePanel>
      </Frame>
    </main>
  );
}

function UnassignedDraftCard({
  draft,
  onOpenDraft,
}: {
  draft: UnassignedDraft;
  onOpenDraft: (draft: UnassignedDraft) => void;
}) {
  return (
    <Card
      aria-label={`Open unassigned draft ${draft.name}`}
      className="min-h-64 text-left transition-colors hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      onClick={() => onOpenDraft(draft)}
      render={<button type="button" />}
    >
      <CardHeader className="gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="grid min-w-0 gap-1">
            <Badge className="w-fit" variant="outline">
              {draft.statusLabel ?? "Draft"}
            </Badge>
            <CardTitle className="line-clamp-2 text-base">
              {draft.name}
            </CardTitle>
            <CardDescription className="line-clamp-2">
              {draft.address}
            </CardDescription>
          </div>
          <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-warning/10 text-warning-foreground">
            <UserRoundX aria-hidden="true" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 p-4 pt-0">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <DraftMetric label="Budget" value={draft.loanAmount} />
          <DraftMetric label="Builder" value="Unassigned" />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-muted-foreground text-xs">
          <span className="inline-flex items-center gap-1">
            <FileText aria-hidden="true" className="size-3.5" />
            Created {formatDraftDate(draft.createdAt)}
          </span>
          <span>Updated {formatDraftDate(draft.updatedAt)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function DraftMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border bg-background/70 p-3">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="truncate font-semibold">{value}</div>
    </div>
  );
}

function formatDraftDate(value?: number) {
  if (!value) {
    return "not recorded";
  }
  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}
