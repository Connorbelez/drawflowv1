"use client";

import {
  CalendarPlus,
  CheckCircle2,
  ClipboardCheck,
  MapPinCheck,
} from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#/components/ui/card.tsx";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "#/components/ui/empty.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import {
  copySiteVisitLink,
  SiteVisitCancellationDialog,
  SiteVisitDetailPanel,
} from "../backoffice-site-visits/SiteVisitDetailPanel.tsx";
import {
  operationalStatusBadgeVariant,
  operationalStatusLabel,
} from "../backoffice-site-visits/site-visit-format.ts";
import type {
  BrokerageSiteVisitRow,
  BrokerageSiteVisitsResult,
} from "../backoffice-site-visits/site-visit-types.ts";

export interface SubmilestoneSiteVisitWorkspaceProps {
  canCancel: boolean;
  canOrder: boolean;
  guidanceReady: boolean;
  onCancelVisit: (input: {
    buildId: string;
    reason: string;
    visitId: string;
  }) => Promise<void>;
  onOrder: () => void;
  pending: boolean;
  siteVisits: BrokerageSiteVisitsResult | undefined;
}

export function SubmilestoneSiteVisitWorkspace(
  props: SubmilestoneSiteVisitWorkspaceProps
) {
  const { siteVisits } = props;
  if (siteVisits === undefined) {
    return (
      <Frame data-testid="site-visit-workspace-loading">
        <FramePanel
          aria-live="polite"
          className="min-h-32 animate-pulse text-muted-foreground text-sm motion-reduce:animate-none"
          role="status"
        >
          Loading Site Visit history…
        </FramePanel>
      </Frame>
    );
  }
  if (siteVisits.visits.length === 0) {
    return <SiteVisitEmptyState {...props} />;
  }
  return <SiteVisitHistory {...props} siteVisits={siteVisits} />;
}

function SiteVisitEmptyState({
  canOrder,
  guidanceReady,
  onOrder,
  pending,
}: SubmilestoneSiteVisitWorkspaceProps) {
  return (
    <Empty className="rounded-xl border border-dashed py-10 md:py-12">
      <EmptyHeader>
        <div aria-hidden="true" className="relative mb-3 h-14 w-20">
          <EmptyMedia
            className="absolute top-3 left-1 -rotate-6 text-muted-foreground"
            variant="icon"
          >
            <MapPinCheck />
          </EmptyMedia>
          <EmptyMedia
            className="absolute top-0 left-1/2 z-10 -translate-x-1/2 bg-background"
            variant="icon"
          >
            <ClipboardCheck />
          </EmptyMedia>
          <EmptyMedia
            className="absolute top-3 right-1 rotate-6 text-muted-foreground"
            variant="icon"
          >
            <CheckCircle2 />
          </EmptyMedia>
        </div>
        <EmptyTitle>No Site Visits yet</EmptyTitle>
        <EmptyDescription>
          Order a field inspection for this Sub-milestone. The request, access
          token, field report, and audited history will stay here.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        {canOrder ? (
          <Button
            disabled={pending || !guidanceReady}
            onClick={onOrder}
            type="button"
          >
            <CalendarPlus aria-hidden="true" />
            Order Site Visit
          </Button>
        ) : (
          <p className="text-muted-foreground">
            You do not have Site Visit ordering authority on this route. An
            authorized lender team member can order from the Build Workspace.
          </p>
        )}
      </EmptyContent>
    </Empty>
  );
}

function SiteVisitHistory({
  canCancel,
  canOrder,
  guidanceReady,
  onCancelVisit,
  onOrder,
  pending,
  siteVisits,
}: SubmilestoneSiteVisitWorkspaceProps & {
  siteVisits: BrokerageSiteVisitsResult;
}) {
  const [cancelTarget, setCancelTarget] =
    useState<BrokerageSiteVisitRow | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [selectedVisitId, setSelectedVisitId] = useState<string | null>(null);
  const visits = siteVisits.visits;
  const selectedVisit =
    visits.find((visit) => visit.visitId === selectedVisitId) ?? visits[0];

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="font-medium text-sm">Visit history</h4>
          <p className="text-muted-foreground text-xs">
            {visits.length} canonical Visit{visits.length === 1 ? "" : "s"},
            ordered by operational urgency.
          </p>
        </div>
        {canOrder ? (
          <Button
            disabled={pending || !guidanceReady}
            onClick={onOrder}
            size="sm"
            type="button"
            variant="outline"
          >
            <CalendarPlus aria-hidden="true" />
            Order another Site Visit
          </Button>
        ) : null}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {visits.map((visit) => (
          <SiteVisitChoice
            key={visit.visitId}
            onSelect={() => setSelectedVisitId(visit.visitId)}
            selected={visit.visitId === selectedVisit.visitId}
            visit={visit}
          />
        ))}
      </div>
      <Frame>
        <FramePanel className="p-4 sm:p-5">
          <SiteVisitDetailPanel
            now={now}
            onCancel={canCancel ? setCancelTarget : undefined}
            onCopyLink={copySiteVisitLink}
            showBuildLink={false}
            visit={selectedVisit}
          />
        </FramePanel>
      </Frame>
      <SiteVisitCancellationDialog
        onCancelVisit={onCancelVisit}
        onOpenChange={(open) => {
          if (!open) {
            setCancelTarget(null);
          }
        }}
        visit={cancelTarget}
      />
    </div>
  );
}

function SiteVisitChoice({
  onSelect,
  selected,
  visit,
}: {
  onSelect: () => void;
  selected: boolean;
  visit: BrokerageSiteVisitRow;
}) {
  return (
    <Card
      aria-pressed={selected}
      className="cursor-pointer text-left transition-colors hover:border-primary/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[selected=true]:border-primary data-[selected=true]:bg-primary/5"
      data-selected={selected}
      onClick={onSelect}
      render={<button type="button" />}
    >
      <CardHeader className="gap-1 p-4">
        <CardTitle className="truncate text-sm">{visit.visitId}</CardTitle>
        <CardDescription className="truncate text-xs">
          {visit.scheduledDateLabel}
        </CardDescription>
        <CardAction>
          <Badge
            variant={operationalStatusBadgeVariant(visit.operationalStatus)}
          >
            {operationalStatusLabel(visit.operationalStatus)}
          </Badge>
        </CardAction>
      </CardHeader>
    </Card>
  );
}
