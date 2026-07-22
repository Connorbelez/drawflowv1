"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import { InlineEdit, InlineEditNumber } from "#/components/ui/inline-edit.tsx";
import { BuildWorkspaceDemo } from "#/features/build-workspace-demo/BuildWorkspaceDemo.tsx";
import { useConvexBuildWorkspace } from "#/features/build-workspace-demo/convex-workspace-adapter.tsx";
import { BuildWorkspaceProvider } from "#/features/build-workspace-demo/workspace-adapter.tsx";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { type BuildDetailSubTab, BuildDetailTabBar } from "./BuildDetailTabs";
import { BuildTimelinePanel } from "./BuildTimelinePanel";
import { ContractorsCard } from "./ContractorsCard";
import { EventRailSheet } from "./EventRail";
import {
  formatBuildAddress,
  formatCents,
  formatDate,
  initialsFor,
  normalizeIsoDateInput,
  statusChipLabel,
  statusChipTone,
} from "./format";
import {
  MilestoneDetailSheet,
  type MilestoneSheetData,
} from "./MilestoneDetailSheet";
import {
  type KanbanCardData,
  type KanbanColumn,
  MilestoneKanban,
} from "./MilestoneKanban";
import { SitePhotoCarousel } from "./SitePhotoCarousel";

type BuildDetailsPatch = {
  address?: string;
  projectStartDate?: string;
  payoffDate?: string;
  todayDate?: string;
  daysToPayoff?: number;
  percentComplete?: number;
  openWarnings?: number;
  siteVisitsOpen?: number;
};

interface BuildDetailRouteProps {
  buildKey: string;
  initialMilestoneId?: string;
  onChangeRail: (rail: "open" | "closed") => void;
  onChangeTab: (tab: BuildDetailSubTab) => void;
  rail?: "open" | "closed";
  tab?: BuildDetailSubTab;
}

export function BuildDetailRoute({
  buildKey,
  tab,
  onChangeTab,
  initialMilestoneId,
  rail,
  onChangeRail,
}: BuildDetailRouteProps) {
  const activeTab = tab ?? "details";
  const buildId = useQuery(
    api.demo_drawflow_backoffice.demo_resolveBuildIdByKey,
    { buildKey }
  );
  if (buildId === undefined) {
    return <PageSkeleton />;
  }
  if (buildId === null) {
    return <BuildMissing buildKey={buildKey} />;
  }
  return (
    <BuildDetailShell
      activeTab={activeTab}
      buildId={buildId}
      initialMilestoneId={initialMilestoneId}
      onChangeRail={onChangeRail}
      onChangeTab={onChangeTab}
      rail={rail}
    />
  );
}

function BuildDetailShell({
  buildId,
  activeTab,
  onChangeTab,
  initialMilestoneId,
  rail,
  onChangeRail,
}: {
  buildId: Id<"demo_builds">;
  activeTab: BuildDetailSubTab;
  onChangeTab: (tab: BuildDetailSubTab) => void;
  initialMilestoneId?: string;
  rail?: "open" | "closed";
  onChangeRail: (rail: "open" | "closed") => void;
}) {
  const vm = useQuery(
    api.demo_drawflow_backoffice.demo_getBuildDetailViewModel,
    { buildId }
  );
  const approveDraw = useMutation(
    api.demo_drawflow_backoffice.demo_approveDraw
  );
  const approveMilestoneFromSheet = useMutation(
    api.demo_drawflow_backoffice.demo_approveMilestoneFromSheet
  );
  const addNote = useMutation(api.demo_drawflow_backoffice.demo_addBuildNote);
  const updateBuildDetails = useMutation(
    api.demo_drawflow_backoffice.demo_updateBuildDetails
  );
  const [activeMilestoneKey, setActiveMilestoneKey] = useState<string | null>(
    null
  );
  const [sheetPending, setSheetPending] = useState(false);
  const [sheetError, setSheetError] = useState<string>("");
  const [drawErrors, setDrawErrors] = useState<Record<string, string>>({});
  const [pendingDraws, setPendingDraws] = useState<Set<string>>(new Set());
  const [internalNoteDraft, setInternalNoteDraft] = useState("");
  const [publicNoteDraft, setPublicNoteDraft] = useState("");
  const [showCompletedKanban, setShowCompletedKanban] = useState(false);

  const eventsOpen = rail === "open";

  const kanbanCards: KanbanCardData[] = useMemo(() => {
    if (!vm || vm.needsSeed) {
      return [];
    }
    return vm.kanban.map((card: any) => ({
      milestoneKey: card.milestoneKey,
      milestoneId: card.milestoneId,
      name: card.name,
      code: card.code,
      type: card.type,
      status: card.status,
      column: card.column as KanbanColumn,
      drawGroupKey: card.drawGroupKey,
      approvedValueCents: card.approvedValueCents,
      requestedAmountCents: card.requestedAmountCents,
      progressPercent: card.progressPercent,
      forecastStartDate: card.forecastStartDate,
      forecastEndDate: card.forecastEndDate,
      submittedAt: card.submittedAt,
      requiresSiteVisit: card.requiresSiteVisit,
      evidenceReviewStatus: card.evidenceReviewStatus,
      contractors: card.contractors,
      submilestones: card.submilestones ?? [],
    }));
  }, [vm]);

  const sheetData: MilestoneSheetData | null = useMemo(() => {
    if (!vm || vm.needsSeed || !activeMilestoneKey) {
      return null;
    }
    const card = kanbanCards.find((c) => c.milestoneKey === activeMilestoneKey);
    if (!card) {
      return null;
    }
    const recentEvents = (vm.auditEvents as any[])
      .filter((ev) => ev.milestoneKey === activeMilestoneKey)
      .slice(0, 4)
      .map((ev) => ({
        _id: ev._id,
        title: ev.eventType,
        actor: ev.actorPersona,
        createdAt: ev.createdAt,
      }));
    const milestoneContractors = (vm.milestoneContractors as any[])
      .filter((row) => row.milestoneKey === activeMilestoneKey)
      .map((row) => ({
        name: row.contractor?.name ?? "Unknown",
        initials: initialsFor(row.contractor?.name ?? "?"),
        role: row.role,
      }));
    return {
      milestoneKey: card.milestoneKey,
      name: card.name,
      column: card.column,
      drawGroupKey: card.drawGroupKey,
      requestedAmountCents: card.requestedAmountCents,
      submittedAt: card.submittedAt,
      contractors:
        milestoneContractors.length > 0
          ? milestoneContractors
          : card.contractors.map((c) => ({
              name: c.name,
              initials: c.initials,
            })),
      recentEvents,
    };
  }, [vm, activeMilestoneKey, kanbanCards]);

  if (!vm) {
    return <PageSkeleton />;
  }
  if (vm.needsSeed) {
    return <BuildMissing buildKey="active-maple-ridge" />;
  }

  const onApproveDraw = async (drawGroupKey: string) => {
    if (pendingDraws.has(drawGroupKey)) {
      return;
    }
    setPendingDraws((prev) => {
      const next = new Set(prev);
      next.add(drawGroupKey);
      return next;
    });
    setDrawErrors((prev) => ({ ...prev, [drawGroupKey]: "" }));
    try {
      await approveDraw({ buildId, drawGroupKey });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("policy_limit")) {
        const reason = window.prompt(
          "Lender draw policy limit would be exceeded. Provide override reason to continue:"
        );
        if (reason && reason.trim().length > 0) {
          try {
            await approveDraw({
              buildId,
              drawGroupKey,
              overrideReason: reason.trim(),
            });
          } catch (overrideErr) {
            setDrawErrors((prev) => ({
              ...prev,
              [drawGroupKey]:
                overrideErr instanceof Error
                  ? overrideErr.message
                  : String(overrideErr),
            }));
          }
        } else {
          setDrawErrors((prev) => ({
            ...prev,
            [drawGroupKey]: "Override required to exceed policy limit.",
          }));
        }
      } else {
        setDrawErrors((prev) => ({ ...prev, [drawGroupKey]: message }));
      }
    } finally {
      setPendingDraws((prev) => {
        const next = new Set(prev);
        next.delete(drawGroupKey);
        return next;
      });
    }
  };

  const onApproveMilestone = async (milestoneKey: string, note?: string) => {
    setSheetPending(true);
    setSheetError("");
    try {
      await approveMilestoneFromSheet({ buildId, milestoneKey, note });
      setActiveMilestoneKey(null);
    } catch (err) {
      setSheetError(err instanceof Error ? err.message : String(err));
    } finally {
      setSheetPending(false);
    }
  };

  const onSaveNote = async (visibility: "internal" | "public") => {
    const body =
      visibility === "internal" ? internalNoteDraft : publicNoteDraft;
    if (!body.trim()) {
      return;
    }
    await addNote({ buildId, visibility, body });
    if (visibility === "internal") {
      setInternalNoteDraft("");
    } else {
      setPublicNoteDraft("");
    }
  };

  const build: any = vm.build;
  const derived: any = vm.derived;
  const displayId: string = vm.displayId;
  const address: string = vm.address ?? formatBuildAddress(build);

  const onUpdateBuildDetails = async (patch: BuildDetailsPatch) => {
    await updateBuildDetails({ buildId, ...patch });
  };

  return (
    <main className="min-h-screen" data-testid="build-detail-route">
      <section className="flex flex-col gap-5 p-6">
        <BreadcrumbStrip displayId={displayId} />
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="font-semibold text-2xl tracking-tight">
              <span className="font-normal text-lg text-muted-foreground">
                {displayId} —{" "}
              </span>
              {build.name}
            </h1>
            <p className="text-muted-foreground text-sm">{build.subtitle}</p>
          </div>
          <button
            className="inline-flex h-8 shrink-0 items-center justify-center rounded-md border border-border bg-background px-3 font-medium text-sm hover:bg-accent"
            data-testid="build-detail-events-trigger"
            onClick={() => onChangeRail("open")}
            type="button"
          >
            Events
          </button>
        </header>

        <BuildDetailTabBar
          activeTab={activeTab}
          onChangeTab={onChangeTab}
          tabs={["details", "timeline", "calendar", "gantt"]}
        />

        {activeTab === "details" ? (
          <DetailsTabPanel
            address={address}
            availableContractors={vm.availableContractors ?? []}
            build={build}
            buildId={buildId}
            contractors={vm.contractors}
            derived={derived}
            displayId={displayId}
            documents={vm.documents}
            drawErrors={drawErrors}
            draws={vm.draws}
            internalDraft={internalNoteDraft}
            kanbanCards={kanbanCards}
            notes={vm.notes}
            onApproveDraw={onApproveDraw}
            onCardClick={(card) => setActiveMilestoneKey(card.milestoneKey)}
            onChangeInternalDraft={setInternalNoteDraft}
            onChangePublicDraft={setPublicNoteDraft}
            onSaveNote={onSaveNote}
            onToggleShowCompleted={() =>
              setShowCompletedKanban((prev) => !prev)
            }
            onUpdateBuildDetails={onUpdateBuildDetails}
            pendingDraws={pendingDraws}
            publicDraft={publicNoteDraft}
            showCompletedKanban={showCompletedKanban}
            sitePhotos={vm.mock_sitePhotos}
          />
        ) : null}

        {activeTab === "timeline" ? (
          <BuildTimelinePanel timelinePlanId={vm.timelinePlanId ?? null} />
        ) : null}

        {activeTab === "calendar" ? <CalendarPanel /> : null}

        {activeTab === "gantt" ? (
          <BuildGanttPanel initialMilestoneId={initialMilestoneId} />
        ) : null}
      </section>

      <EventRailSheet
        auditEvents={vm.auditEvents}
        onOpenChange={(open) => onChangeRail(open ? "open" : "closed")}
        onResolve={(_event) => {}}
        onView={(_event) => {}}
        open={eventsOpen}
        quickActionEvents={vm.quickActionEvents}
      />

      <MilestoneDetailSheet
        data={sheetData}
        errorMessage={sheetError}
        onApprove={onApproveMilestone}
        onAssignVisit={() => {}}
        onClose={() => setActiveMilestoneKey(null)}
        onReject={() => setActiveMilestoneKey(null)}
        onRequestInfo={() => {}}
        pending={sheetPending}
      />
    </main>
  );
}

function PageSkeleton() {
  return (
    <main className="grid min-h-screen" data-testid="build-detail-loading">
      <div className="animate-pulse p-6 text-muted-foreground text-sm">
        Loading build…
      </div>
    </main>
  );
}

function BuildMissing({ buildKey }: { buildKey: string }) {
  return (
    <main
      className="min-h-screen bg-muted/30 p-6"
      data-testid="build-detail-missing"
    >
      <div className="rounded-lg border border-border bg-card p-6">
        <p className="font-medium">Build detail unavailable</p>
        <p className="mt-1 text-muted-foreground text-sm">
          No build found for key <code>{buildKey}</code>. Run the demo seed and
          return.
        </p>
      </div>
    </main>
  );
}

function BreadcrumbStrip({ displayId }: { displayId: string }) {
  return (
    <nav aria-label="Breadcrumbs" className="text-muted-foreground text-xs">
      <a className="hover:text-foreground" href="/backoffice">
        Backoffice
      </a>{" "}
      /{" "}
      <a className="hover:text-foreground" href="/backoffice">
        Builds
      </a>{" "}
      / <b className="font-medium text-foreground">{displayId}</b>
    </nav>
  );
}

function DetailsTabPanel({
  address,
  build,
  derived,
  displayId,
  onUpdateBuildDetails,
  documents,
  draws,
  drawErrors,
  kanbanCards,
  sitePhotos,
  notes,
  internalDraft,
  publicDraft,
  onChangeInternalDraft,
  onChangePublicDraft,
  onSaveNote,
  onApproveDraw,
  onCardClick,
  onToggleShowCompleted,
  pendingDraws,
  showCompletedKanban,
  contractors,
  availableContractors,
  buildId,
}: {
  address: string;
  build: any;
  derived: any;
  displayId: string;
  onUpdateBuildDetails: (patch: BuildDetailsPatch) => Promise<void>;
  documents: any[];
  draws: any[];
  drawErrors: Record<string, string>;
  kanbanCards: KanbanCardData[];
  sitePhotos: { url: string; caption: string; takenAt: string }[];
  notes: { internal: any[]; public: any[] };
  internalDraft: string;
  publicDraft: string;
  onChangeInternalDraft: (value: string) => void;
  onChangePublicDraft: (value: string) => void;
  onSaveNote: (visibility: "internal" | "public") => void;
  onApproveDraw: (drawGroupKey: string) => void;
  onCardClick: (card: KanbanCardData) => void;
  onToggleShowCompleted: () => void;
  pendingDraws: Set<string>;
  showCompletedKanban: boolean;
  contractors: any[];
  availableContractors: any[];
  buildId: Id<"demo_builds">;
}) {
  return (
    <div className="flex flex-col gap-5">
      <section
        className="grid grid-cols-[minmax(280px,1fr)_2fr] items-stretch gap-4"
        id="section-overview"
      >
        <BuildDetailsCard
          address={address}
          build={build}
          derived={derived}
          displayId={displayId}
          onUpdate={onUpdateBuildDetails}
        />
        <SitePhotoCarousel
          buildName={build.name}
          photos={sitePhotos}
          siteAddress={address}
        />
      </section>

      <DrawsTable
        drawErrors={drawErrors}
        draws={draws}
        onApprove={onApproveDraw}
        pendingDraws={pendingDraws}
      />

      <MilestoneKanban
        cards={kanbanCards}
        onCardClick={onCardClick}
        onToggleShowCompleted={onToggleShowCompleted}
        showCompleted={showCompletedKanban}
      />

      <section className="grid grid-cols-2 gap-4">
        <ContractorsCard
          availableContractors={availableContractors}
          buildId={buildId}
          contractors={contractors}
        />
        <DocumentsCard buildId={buildId} documents={documents} />
      </section>

      <section className="grid grid-cols-2 gap-4">
        <NotesCard
          authorHint="Lender-only · visibility=internal"
          draft={internalDraft}
          notes={notes.internal}
          onChangeDraft={onChangeInternalDraft}
          onSave={() => onSaveNote("internal")}
          testIdPrefix="internal-notes"
          title="Internal Notes"
          variant="internal"
        />
        <NotesCard
          authorHint="Borrower-visible · visibility=public"
          draft={publicDraft}
          notes={notes.public}
          onChangeDraft={onChangePublicDraft}
          onSave={() => onSaveNote("public")}
          testIdPrefix="public-notes"
          title="Public Notes"
          variant="public"
        />
      </section>
    </div>
  );
}

function BuildDetailsCard({
  address,
  build,
  derived,
  displayId,
  onUpdate,
}: {
  address: string;
  build: any;
  derived: any;
  displayId: string;
  onUpdate: (patch: BuildDetailsPatch) => Promise<void>;
}) {
  const commitDate =
    (field: "projectStartDate" | "payoffDate" | "todayDate", label: string) =>
    async (draftValue: string) => {
      await onUpdate({
        [field]: normalizeIsoDateInput(label, draftValue, build[field]),
      });
    };

  return (
    <article
      className="rounded-xl border border-border bg-card p-5"
      id="ui-build-details"
    >
      <header className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold text-sm">Build Details</h3>
        <span className="text-[11px] text-muted-foreground">demo_builds</span>
      </header>
      <dl className="grid grid-cols-[120px_minmax(0,1fr)] gap-y-1.5 text-sm">
        <Label>Loan number</Label>
        <dd className="tabular-nums">FL-{displayId}</dd>
        <Label>Address</Label>
        <dd className="min-w-0">
          <InlineEdit
            affordance="glint"
            ariaLabel="Build address"
            className="whitespace-normal! w-full max-w-full"
            displayValue={address}
            draftValue={address}
            inputWidth="100%"
            onCommit={async (draftValue) => {
              const trimmed = draftValue.trim();
              if (!trimmed) {
                return;
              }
              await onUpdate({ address: trimmed });
            }}
            reserveWidth="100%"
            size="body"
            testId="build-detail-address"
            tone="neutral"
            weight="regular"
          />
        </dd>
        <Label>Project start</Label>
        <dd>
          <InlineEdit
            affordance="glint"
            ariaLabel="Project start date"
            displayValue={formatDate(build.projectStartDate)}
            draftValue={build.projectStartDate}
            inputWidth="7.5rem"
            onCommit={commitDate("projectStartDate", "Project start")}
            reserveWidth="7.5rem"
            testId="build-detail-project-start"
          />
        </dd>
        <Label>Payoff</Label>
        <dd>
          <InlineEdit
            affordance="glint"
            ariaLabel="Payoff date"
            displayValue={formatDate(build.payoffDate)}
            draftValue={build.payoffDate}
            inputWidth="7.5rem"
            onCommit={commitDate("payoffDate", "Payoff")}
            reserveWidth="7.5rem"
            testId="build-detail-payoff"
          />
        </dd>
        <Label>Today</Label>
        <dd>
          <InlineEdit
            affordance="glint"
            ariaLabel="Today date"
            displayValue={formatDate(build.todayDate)}
            draftValue={build.todayDate}
            inputWidth="7.5rem"
            onCommit={commitDate("todayDate", "Today")}
            reserveWidth="7.5rem"
            testId="build-detail-today"
          />
        </dd>
        <Label>Days to payoff</Label>
        <dd>
          <InlineEditNumber
            affordance="glint"
            ariaLabel="Days to payoff"
            formatDisplay={(value) => String(value)}
            inputWidth="3rem"
            min={0}
            onCommit={async (value) => {
              await onUpdate({ daysToPayoff: value });
            }}
            reserveWidth="3rem"
            testId="build-detail-days-to-payoff"
            value={derived.daysToPayoff}
          />
        </dd>
        <Label>% complete</Label>
        <dd className="flex items-center gap-2">
          <InlineEditNumber
            affordance="glint"
            ariaLabel="Percent complete"
            formatDisplay={(value) => `${value}%`}
            inputWidth="3rem"
            max={100}
            min={0}
            onCommit={async (value) => {
              await onUpdate({ percentComplete: value });
            }}
            reserveWidth="3rem"
            suffix="%"
            testId="build-detail-percent-complete"
            value={derived.percentComplete}
          />
          <span
            aria-hidden
            className="h-1.5 w-24 overflow-hidden rounded-full bg-muted"
          >
            <span
              className="block h-full bg-primary"
              style={{ width: `${Math.min(100, derived.percentComplete)}%` }}
            />
          </span>
        </dd>
        <Label>Open warnings</Label>
        <dd>
          <InlineEditNumber
            affordance="glint"
            ariaLabel="Open warnings"
            className={derived.openWarnings > 0 ? "text-amber-400" : undefined}
            formatDisplay={(value) => String(value)}
            inputWidth="2.5rem"
            min={0}
            onCommit={async (value) => {
              await onUpdate({ openWarnings: value });
            }}
            reserveWidth="2.5rem"
            testId="build-detail-open-warnings"
            tone={derived.openWarnings > 0 ? "warning" : "neutral"}
            value={derived.openWarnings}
          />
        </dd>
        <Label>Site visits open</Label>
        <dd>
          <InlineEditNumber
            affordance="glint"
            ariaLabel="Site visits open"
            formatDisplay={(value) => String(value)}
            inputWidth="2.5rem"
            min={0}
            onCommit={async (value) => {
              await onUpdate({ siteVisitsOpen: value });
            }}
            reserveWidth="2.5rem"
            testId="build-detail-site-visits-open"
            value={derived.siteVisitsOpen}
          />
        </dd>
      </dl>
      <hr className="my-4 border-border" />
      <h3 className="mb-2 font-semibold text-sm">Loan Details</h3>
      <dl className="grid grid-cols-[120px_1fr] gap-y-1.5 text-sm">
        <Label>Borrower starting cash</Label>
        <span>{formatCents(build.workingCapitalLimitCents)}</span>
        <Label>Lender policy limit</Label>
        <span>{formatCents(build.lenderDrawPolicyLimitCents)}</span>
        <Label>Approved principal</Label>
        <span>{formatCents(derived.approvedPrincipalCents)}</span>
        <Label>Draw availability</Label>
        <span>
          {formatCents(derived.drawAvailableCents)} of{" "}
          {formatCents(derived.drawableTotalCents)}
        </span>
        <Label>Drawn to date</Label>
        <span>{formatCents(derived.drawnCents)}</span>
        <Label>Interest (annual)</Label>
        <span className="tabular-nums">
          {(build.interestAnnualBps / 100).toFixed(2)}%
        </span>
        <Label>Flat draw fee</Label>
        <span>{formatCents(build.flatDrawFeeCents)}</span>
      </dl>
    </article>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <dt className="text-[11px] text-muted-foreground uppercase">{children}</dt>
  );
}

function DrawsTable({
  draws,
  drawErrors,
  onApprove,
  pendingDraws,
}: {
  draws: any[];
  drawErrors: Record<string, string>;
  onApprove: (drawGroupKey: string) => void;
  pendingDraws: Set<string>;
}) {
  return (
    <section
      className="rounded-xl border border-border bg-card p-4"
      data-testid="build-detail-draws"
      id="draws-table"
    >
      <header className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold text-sm">Draws</h3>
        <span className="text-[11px] text-muted-foreground">
          demo_drawGroups + demo_timelineDraws
        </span>
      </header>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-card/70 text-[10px] text-muted-foreground uppercase">
            <tr>
              <Th>Draw</Th>
              <Th>Approved</Th>
              <Th>Requested</Th>
              <Th>Planned</Th>
              <Th>Actual</Th>
              <Th>Status</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {draws.map((draw: any) => {
              const tone = statusChipTone(draw.status);
              const pending = pendingDraws.has(draw.drawGroupKey);
              const canApprove =
                draw.status !== "release_approved" &&
                draw.status !== "rejected";
              return (
                <tr
                  className="border-border border-t"
                  data-draw-key={draw.drawGroupKey}
                  data-testid={`build-detail-draw-row-${draw.drawGroupKey}`}
                  key={draw.drawGroupKey}
                >
                  <Td>{draw.label}</Td>
                  <Td className="tabular-nums">
                    {formatCents(draw.approvedValueCents)}
                  </Td>
                  <Td className="tabular-nums">
                    {draw.requestedValueCents
                      ? formatCents(draw.requestedValueCents)
                      : "—"}
                  </Td>
                  <Td>
                    {draw.plannedDate ? formatDate(draw.plannedDate) : "—"}
                  </Td>
                  <Td>{draw.actualDate ? formatDate(draw.actualDate) : "—"}</Td>
                  <Td>
                    <StatusChip status={draw.status} tone={tone} />
                  </Td>
                  <Td>
                    {canApprove ? (
                      <button
                        className="rounded-md border border-primary/40 bg-primary/20 px-2 py-1 text-xs disabled:opacity-50"
                        data-testid={`build-detail-draw-approve-${draw.drawGroupKey}`}
                        disabled={pending}
                        onClick={() => onApprove(draw.drawGroupKey)}
                        type="button"
                      >
                        {pending ? "Approving…" : "Approve"}
                      </button>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                    {drawErrors[draw.drawGroupKey] ? (
                      <p
                        className="mt-1 text-[11px] text-destructive"
                        data-testid={`build-detail-draw-error-${draw.drawGroupKey}`}
                        role="alert"
                      >
                        {drawErrors[draw.drawGroupKey]}
                      </p>
                    ) : null}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 text-left font-medium">{children}</th>;
}
function Td({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-3 py-2 ${className ?? ""}`}>{children}</td>;
}

function StatusChip({
  status,
  tone,
}: {
  status: string;
  tone: ReturnType<typeof statusChipTone>;
}) {
  const toneClass = {
    approved: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    requested: "bg-sky-500/15 text-sky-300 border-sky-500/30",
    draft: "bg-muted/40 text-muted-foreground border-border",
    review: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    rejected: "bg-destructive/20 text-destructive border-destructive/40",
  }[tone];
  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 text-[11px] ${toneClass}`}
    >
      {statusChipLabel(status)}
    </span>
  );
}

const DOCUMENT_KINDS = [
  "permit",
  "survey",
  "contract",
  "evidence",
  "invoice",
  "insurance",
  "other",
];

function DocumentsCard({
  buildId,
  documents,
}: {
  buildId: Id<"demo_builds">;
  documents: any[];
}) {
  const addDoc = useMutation(
    api.demo_drawflow_backoffice.demo_addBuildDocument
  );
  const [name, setName] = useState("");
  const [kind, setKind] = useState("permit");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const onAdd = async () => {
    if (!name.trim() || pending) {
      return;
    }
    setPending(true);
    setError("");
    try {
      await addDoc({ buildId, name: name.trim(), kind });
      setName("");
      setKind("permit");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <article
      className="rounded-xl border border-border bg-card p-4"
      data-testid="build-detail-documents"
      id="documents"
    >
      <header className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold text-sm">
          Documents{" "}
          <span className="text-[11px] text-muted-foreground">
            demo_buildDocuments
          </span>
        </h3>
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {documents.length}
        </span>
      </header>

      <div
        className="mb-3 grid grid-cols-[1fr_120px_auto] gap-2"
        data-testid="documents-add-form"
      >
        <input
          aria-label="Document name"
          className="rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
          data-testid="documents-name"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              onAdd();
            }
          }}
          placeholder="e.g. Permit_2026-06.pdf"
          type="text"
          value={name}
        />
        <select
          aria-label="Document kind"
          className="rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
          data-testid="documents-kind"
          onChange={(e) => setKind(e.target.value)}
          value={kind}
        >
          {DOCUMENT_KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <button
          className="rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground text-sm disabled:opacity-50"
          data-testid="documents-add"
          disabled={!name.trim() || pending}
          onClick={onAdd}
          type="button"
        >
          {pending ? "Adding…" : "Add"}
        </button>
      </div>
      {error ? (
        <p
          className="mb-2 text-[11px] text-destructive"
          data-testid="documents-error"
        >
          {error}
        </p>
      ) : null}

      {documents.length === 0 ? (
        <p className="text-muted-foreground text-xs">No documents yet.</p>
      ) : (
        <ul className="space-y-1">
          {documents.map((d) => (
            <li
              className="flex items-center justify-between rounded-md border border-border bg-background/40 p-2 text-sm"
              data-testid={`build-detail-document-${d._id}`}
              key={d._id}
            >
              <span className="truncate">{d.name}</span>
              <span className="ml-2 shrink-0 text-[11px] text-muted-foreground">
                {d.kind}
                {d.sizeBytes > 0
                  ? ` · ${Math.round(d.sizeBytes / 1024)}KB`
                  : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function NotesCard({
  title,
  authorHint,
  notes,
  draft,
  onChangeDraft,
  onSave,
  testIdPrefix,
  variant,
}: {
  title: string;
  authorHint: string;
  notes: any[];
  draft: string;
  onChangeDraft: (value: string) => void;
  onSave: () => void;
  testIdPrefix: string;
  variant: "internal" | "public";
}) {
  const accent =
    variant === "internal" ? "border-amber-500/40" : "border-emerald-500/40";
  return (
    <article
      className={`rounded-xl border-2 ${accent} bg-card p-4`}
      data-testid={testIdPrefix}
      data-visibility={variant}
    >
      <header className="mb-2 flex items-center justify-between">
        <h3 className="font-semibold text-sm">
          {title}{" "}
          <span className="text-[11px] text-muted-foreground">
            demo_buildNotes
          </span>
        </h3>
        <span className="text-[11px] text-muted-foreground">{authorHint}</span>
      </header>
      <div className="min-h-[120px] rounded-md border border-border bg-background/40 p-3">
        {notes.length === 0 ? (
          <p className="text-muted-foreground text-xs">No notes yet.</p>
        ) : (
          <ul className="space-y-2 text-xs">
            {notes.map((n) => (
              <li data-testid={`${testIdPrefix}-item-${n._id}`} key={n._id}>
                <p className="text-[11px] text-muted-foreground">
                  {formatDate(n.createdAt)} · {n.authorPersona}
                </p>
                <p className="text-foreground">{n.body}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="mt-3 flex gap-2">
        <textarea
          className="min-h-[56px] flex-1 rounded-md border border-border bg-background/40 p-2 text-xs"
          data-testid={`${testIdPrefix}-input`}
          onChange={(e) => onChangeDraft(e.target.value)}
          placeholder="Add a note…"
          value={draft}
        />
        <button
          className="self-start rounded-md border border-border bg-card px-3 py-1.5 text-xs hover:bg-accent"
          data-testid={`${testIdPrefix}-save`}
          onClick={onSave}
          type="button"
        >
          Save
        </button>
      </div>
    </article>
  );
}

function CalendarPanel() {
  return (
    <section
      className="grid place-items-center rounded-xl border border-border bg-card p-12 text-center text-muted-foreground text-sm"
      data-testid="build-detail-calendar"
    >
      Calendar tab — placeholder for this round.
    </section>
  );
}

function BuildGanttPanel({
  initialMilestoneId,
}: {
  initialMilestoneId?: string;
}) {
  const workspace = useConvexBuildWorkspace("active");
  useEffect(() => {
    if (workspace.role !== "lenderAdmin") {
      workspace.setRole("lenderAdmin");
    }
  }, [workspace]);
  useEffect(() => {
    if (
      initialMilestoneId &&
      workspace.selectedMilestoneId !== initialMilestoneId &&
      workspace.milestones.some((m) => m.id === initialMilestoneId)
    ) {
      workspace.selectMilestone(initialMilestoneId);
    }
  }, [initialMilestoneId, workspace]);
  if (workspace.isLoading || workspace.needsSeed) {
    return (
      <section
        className="grid place-items-center rounded-xl border border-border bg-card p-8 text-muted-foreground text-sm"
        data-testid="build-detail-gantt-loading"
      >
        Loading gantt for active build…
      </section>
    );
  }
  return (
    <section
      className="rounded-xl border border-border bg-card"
      data-ixc-ref="UI-GANTT-MOUNT"
      data-testid="build-detail-gantt-mount"
    >
      <BuildWorkspaceProvider workspace={workspace}>
        <BuildWorkspaceDemo layout="embedded" />
      </BuildWorkspaceProvider>
    </section>
  );
}
