"use client";

import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock3,
  Copy,
  ExternalLink,
  Loader2,
  MapPin,
  Search,
  Timer,
  XCircle,
} from "lucide-react";
import { type ReactElement, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { FieldRichTextPreview } from "#/components/rich-text/field-rich-text.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Card, CardContent } from "#/components/ui/card.tsx";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "#/components/ui/collapsible.tsx";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog.tsx";
import {
  Empty,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "#/components/ui/empty.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Label } from "#/components/ui/label.tsx";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetPanel,
  SheetTitle,
} from "#/components/ui/sheet.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import { ToggleGroup, ToggleGroupItem } from "#/components/ui/toggle-group.tsx";
import { richTextHtmlToPlainText } from "#/lib/rich-text-html.ts";
import { cn } from "#/lib/utils.ts";

import {
  absoluteSiteVisitUrl,
  formatTokenCountdown,
  operationalStatusBadgeVariant,
  operationalStatusLabel,
  tokenStateLabel,
} from "./site-visit-format.ts";
import type {
  BrokerageSiteVisitBuildGroup,
  BrokerageSiteVisitRow,
  BrokerageSiteVisitsResult,
  SiteVisitPulseFilter,
  SiteVisitViewMode,
} from "./site-visit-types.ts";

export interface SiteVisitControlRoomHandlers {
  onCancelVisit: (input: {
    buildId: string;
    reason: string;
    visitId: string;
  }) => Promise<void>;
}

interface SiteVisitControlRoomProps extends SiteVisitControlRoomHandlers {
  data: BrokerageSiteVisitsResult | undefined;
  pending: boolean;
}

function matchesPulseFilter(
  visit: BrokerageSiteVisitRow,
  filter: SiteVisitPulseFilter
) {
  if (filter === "all") {
    return true;
  }
  if (filter === "geofence") {
    return visit.geofenceFlagged;
  }
  if (filter === "expiring15") {
    return (
      visit.operationalStatus === "open" &&
      visit.tokenMsRemaining > 0 &&
      visit.tokenMsRemaining <= 15 * 60 * 1000
    );
  }
  return visit.operationalStatus === filter;
}

function matchesSearch(visit: BrokerageSiteVisitRow, query: string) {
  if (!query.trim()) {
    return true;
  }
  const haystack = [
    visit.buildName,
    visit.buildDisplayId,
    visit.builderName,
    visit.location,
    visit.milestoneName,
    visit.milestoneKey,
    visit.note ?? "",
    visit.recordNoteFormat === "html"
      ? richTextHtmlToPlainText(visit.recordNote ?? "")
      : (visit.recordNote ?? ""),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query.trim().toLowerCase());
}

function filterVisits(
  visits: BrokerageSiteVisitRow[],
  pulseFilter: SiteVisitPulseFilter,
  search: string
) {
  return visits.filter(
    (visit) =>
      matchesPulseFilter(visit, pulseFilter) && matchesSearch(visit, search)
  );
}

export function SiteVisitControlRoom({
  data,
  onCancelVisit,
  pending,
}: SiteVisitControlRoomProps): ReactElement {
  const [pulseFilter, setPulseFilter] = useState<SiteVisitPulseFilter>("all");
  const [viewMode, setViewMode] = useState<SiteVisitViewMode>("by_build");
  const [search, setSearch] = useState("");
  const [selectedVisitId, setSelectedVisitId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] =
    useState<BrokerageSiteVisitRow | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelPending, setCancelPending] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const visits = data?.visits ?? [];
  const filteredVisits = useMemo(
    () => filterVisits(visits, pulseFilter, search),
    [visits, pulseFilter, search]
  );

  const filteredBuilds = useMemo(() => {
    const visitIds = new Set(filteredVisits.map((visit) => visit.visitId));
    return (data?.builds ?? [])
      .map((group) => ({
        ...group,
        visits: group.visits.filter((visit) => visitIds.has(visit.visitId)),
      }))
      .filter((group) => group.visits.length > 0);
  }, [data?.builds, filteredVisits]);

  const selectedVisit = useMemo(
    () => visits.find((visit) => visit.visitId === selectedVisitId) ?? null,
    [selectedVisitId, visits]
  );

  const summary = data?.summary;

  async function handleCopyLink(visit: BrokerageSiteVisitRow) {
    try {
      await navigator.clipboard.writeText(absoluteSiteVisitUrl(visit.url));
      toast.success("Site visit link copied");
    } catch {
      toast.error("Could not copy link");
    }
  }

  async function handleCancel() {
    if (!cancelTarget || cancelReason.trim().length < 3) {
      return;
    }
    setCancelPending(true);
    try {
      await onCancelVisit({
        buildId: String(cancelTarget.buildId),
        reason: cancelReason.trim(),
        visitId: cancelTarget.visitId,
      });
      toast.success("Site visit cancelled");
      setCancelTarget(null);
      setCancelReason("");
      if (selectedVisitId === cancelTarget.visitId) {
        setSelectedVisitId(null);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Cancel failed");
    } finally {
      setCancelPending(false);
    }
  }

  if (pending && !data) {
    return (
      <div className="grid min-h-[24rem] place-items-center">
        <div className="flex items-center gap-2 rounded-lg border bg-background p-4 text-sm">
          <Loader2 className="size-4 animate-spin" />
          Loading site visits...
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="font-display font-semibold text-2xl tracking-tight">
          Site visits
        </h1>
        <p className="max-w-2xl text-muted-foreground text-sm">
          Org-wide verification pipeline: open tokens, field capture, and
          completed visits across every active build.
        </p>
      </header>

      {summary ? (
        <PulseStrip
          active={pulseFilter}
          onChange={setPulseFilter}
          summary={summary}
        />
      ) : null}

      <Frame>
        <FramePanel className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative min-w-0 flex-1 lg:max-w-md">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search build, milestone, builder, address..."
                value={search}
              />
            </div>
            <ToggleGroup
              onValueChange={(value) => {
                const nextValue = value.at(-1);
                if (nextValue === "by_build" || nextValue === "table") {
                  setViewMode(nextValue);
                }
              }}
              value={[viewMode]}
              variant="outline"
            >
              <ToggleGroupItem value="by_build">By build</ToggleGroupItem>
              <ToggleGroupItem value="table">All visits</ToggleGroupItem>
            </ToggleGroup>
          </div>

          {filteredVisits.length === 0 ? (
            <Empty className="border border-dashed">
              <EmptyMedia variant="icon">
                <ClipboardList />
              </EmptyMedia>
              <EmptyTitle>No site visits match</EmptyTitle>
              <EmptyDescription>
                {visits.length === 0
                  ? "When milestones need verification, schedule a visit from a build workspace."
                  : "Try clearing filters or widening your search."}
              </EmptyDescription>
              {visits.length === 0 ? (
                <Button render={<Link to="/backoffice" />}>
                  Open backoffice home
                </Button>
              ) : null}
            </Empty>
          ) : viewMode === "table" ? (
            <VisitsTable
              now={now}
              onCopyLink={handleCopyLink}
              onOpen={setSelectedVisitId}
              visits={filteredVisits}
            />
          ) : (
            <div className="flex flex-col gap-3">
              {filteredBuilds.map((group) => (
                <BuildVisitGroup
                  group={group}
                  key={String(group.buildId)}
                  now={now}
                  onCopyLink={handleCopyLink}
                  onOpen={setSelectedVisitId}
                />
              ))}
            </div>
          )}
        </FramePanel>
      </Frame>

      <VisitDetailSheet
        now={now}
        onCancel={(visit) => {
          setCancelTarget(visit);
          setCancelReason("");
        }}
        onClose={() => setSelectedVisitId(null)}
        onCopyLink={handleCopyLink}
        open={selectedVisit !== null}
        visit={selectedVisit}
      />

      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            setCancelTarget(null);
            setCancelReason("");
          }
        }}
        open={cancelTarget !== null}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel site visit</DialogTitle>
            <DialogDescription>
              Cancelling is audited. Provide a reason brokers can defend in the
              audit trail.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="cancel-reason">Reason</Label>
            <Textarea
              id="cancel-reason"
              onChange={(event) => setCancelReason(event.target.value)}
              placeholder="Why is this visit being cancelled?"
              rows={3}
              value={cancelReason}
            />
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Keep visit
            </DialogClose>
            <Button
              disabled={cancelReason.trim().length < 3 || cancelPending}
              onClick={handleCancel}
              variant="destructive"
            >
              {cancelPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "Cancel visit"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PulseStrip({
  active,
  onChange,
  summary,
}: {
  active: SiteVisitPulseFilter;
  onChange: (filter: SiteVisitPulseFilter) => void;
  summary: BrokerageSiteVisitsResult["summary"];
}) {
  const chips: Array<{
    filter: SiteVisitPulseFilter;
    label: string;
    tone?: "destructive" | "warning" | "default";
    value: number;
  }> = [
    { filter: "open", label: "Open", value: summary.open },
    { filter: "in_field", label: "In field", value: summary.inField },
    {
      filter: "expiring15",
      label: "Expiring <15m",
      tone: summary.expiringWithin15Min > 0 ? "destructive" : "default",
      value: summary.expiringWithin15Min,
    },
    {
      filter: "expired",
      label: "Expired",
      tone: summary.expired > 0 ? "warning" : "default",
      value: summary.expired,
    },
    {
      filter: "geofence",
      label: "Geofence flagged",
      tone: summary.geofenceFlagged > 0 ? "warning" : "default",
      value: summary.geofenceFlagged,
    },
    { filter: "complete", label: "Complete", value: summary.complete },
    { filter: "cancelled", label: "Cancelled", value: summary.cancelled },
    { filter: "all", label: "All", value: summary.total },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((chip) => (
        <button
          className={cn(
            "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
            active === chip.filter
              ? "border-primary/40 bg-primary/10"
              : "border-border bg-background hover:bg-muted/60"
          )}
          key={chip.filter}
          onClick={() => onChange(chip.filter)}
          type="button"
        >
          <span className="font-medium">{chip.label}</span>
          <span
            className={cn(
              "tabular-nums",
              chip.tone === "destructive" && "text-destructive",
              chip.tone === "warning" && "text-warning"
            )}
          >
            {chip.value}
          </span>
        </button>
      ))}
    </div>
  );
}

function BuildVisitGroup({
  group,
  now,
  onCopyLink,
  onOpen,
}: {
  group: BrokerageSiteVisitBuildGroup;
  now: number;
  onCopyLink: (visit: BrokerageSiteVisitRow) => Promise<void>;
  onOpen: (visitId: string) => void;
}) {
  const [open, setOpen] = useState(group.activeVisitCount > 0);

  return (
    <Collapsible onOpenChange={setOpen} open={open}>
      <Card className="overflow-hidden py-0">
        <CollapsibleTrigger
          className="flex w-full items-start gap-3 p-4 text-left"
          type="button"
        >
          <div className="mt-0.5 rounded-md bg-muted p-2">
            <Building2 className="size-4 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{group.buildName}</span>
              <Badge variant="outline">{group.buildDisplayId}</Badge>
              {group.activeVisitCount > 0 ? (
                <Badge variant="warning">{group.activeVisitCount} active</Badge>
              ) : null}
            </div>
            <p className="text-muted-foreground text-sm">{group.builderName}</p>
            <p className="flex items-center gap-1 text-muted-foreground text-xs">
              <MapPin className="size-3 shrink-0" />
              {group.location || "No address on file"}
            </p>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="text-xs tabular-nums">
              {group.visits.length} visit{group.visits.length === 1 ? "" : "s"}
            </span>
            <ChevronRight
              className={cn("size-4 transition-transform", open && "rotate-90")}
            />
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="flex flex-col gap-2 border-t pt-0 pb-4">
            <div className="flex justify-end pt-2">
              <Button
                render={
                  <Link
                    params={{ buildId: String(group.buildId) }}
                    to="/backoffice/builds/$buildId"
                  />
                }
                size="sm"
                variant="outline"
              >
                Open build
                <ExternalLink className="size-3.5" />
              </Button>
            </div>
            {group.visits.map((visit) => (
              <VisitRowCard
                key={visit.visitId}
                now={now}
                onCopyLink={onCopyLink}
                onOpen={() => onOpen(visit.visitId)}
                visit={visit}
              />
            ))}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function VisitRowCard({
  now,
  onCopyLink,
  onOpen,
  visit,
}: {
  now: number;
  onCopyLink: (visit: BrokerageSiteVisitRow) => Promise<void>;
  onOpen: () => void;
  visit: BrokerageSiteVisitRow;
}) {
  const msRemaining = Math.max(0, visit.tokenExpiresAt - now);
  const showCountdown =
    visit.operationalStatus === "open" ||
    visit.operationalStatus === "in_field";

  return (
    <Card className="gap-2 rounded-lg p-3 transition-colors hover:bg-muted/40">
      <button
        className="flex w-full flex-col gap-2 text-left"
        onClick={onOpen}
        type="button"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-medium">{visit.milestoneName}</p>
            <p className="text-muted-foreground text-xs">{visit.milestoneKey}</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge
              variant={operationalStatusBadgeVariant(visit.operationalStatus)}
            >
              {operationalStatusLabel(visit.operationalStatus)}
            </Badge>
            {visit.geofenceFlagged ? (
              <Badge variant="warning">Geofence</Badge>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-muted-foreground text-xs">
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="size-3.5" />
            {visit.scheduledDateLabel}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock3 className="size-3.5" />
            {tokenStateLabel(visit.tokenState)}
          </span>
          {showCountdown ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 font-medium tabular-nums",
                msRemaining <= 15 * 60 * 1000 && "text-destructive"
              )}
            >
              <Timer className="size-3.5" />
              {formatTokenCountdown(msRemaining)}
            </span>
          ) : null}
        </div>
        {visit.note ? (
          <p className="line-clamp-2 text-muted-foreground text-xs">
            {visit.note}
          </p>
        ) : null}
      </button>
      <div className="flex justify-end gap-1">
        <Button
          onClick={() => onCopyLink(visit)}
          size="sm"
          type="button"
          variant="ghost"
        >
          <Copy className="size-3.5" />
          Copy link
        </Button>
      </div>
    </Card>
  );
}

function VisitsTable({
  now,
  onCopyLink,
  onOpen,
  visits,
}: {
  now: number;
  onCopyLink: (visit: BrokerageSiteVisitRow) => Promise<void>;
  onOpen: (visitId: string) => void;
  visits: BrokerageSiteVisitRow[];
}) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Build</TableHead>
            <TableHead>Milestone</TableHead>
            <TableHead>Scheduled</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Token</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visits.map((visit) => {
            const msRemaining = Math.max(0, visit.tokenExpiresAt - now);
            return (
              <TableRow
                className="cursor-pointer"
                key={visit.visitId}
                onClick={() => onOpen(visit.visitId)}
              >
                <TableCell>
                  <div className="font-medium">{visit.buildName}</div>
                  <div className="text-muted-foreground text-xs">
                    {visit.buildDisplayId} · {visit.builderName}
                  </div>
                </TableCell>
                <TableCell>
                  <div>{visit.milestoneName}</div>
                  <div className="text-muted-foreground text-xs">
                    {visit.milestoneKey}
                  </div>
                </TableCell>
                <TableCell>{visit.scheduledDateLabel}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    <Badge
                      variant={operationalStatusBadgeVariant(
                        visit.operationalStatus
                      )}
                    >
                      {operationalStatusLabel(visit.operationalStatus)}
                    </Badge>
                    {visit.geofenceFlagged ? (
                      <Badge variant="warning">Geofence</Badge>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="text-sm">
                  <div>{tokenStateLabel(visit.tokenState)}</div>
                  {(visit.operationalStatus === "open" ||
                    visit.operationalStatus === "in_field") && (
                    <div className="text-muted-foreground text-xs tabular-nums">
                      {formatTokenCountdown(msRemaining)}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    onClick={async (event) => {
                      event.stopPropagation();
                      await onCopyLink(visit);
                    }}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    <Copy className="size-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function VisitDetailSheet({
  now,
  onCancel,
  onClose,
  onCopyLink,
  open,
  visit,
}: {
  now: number;
  onCancel: (visit: BrokerageSiteVisitRow) => void;
  onClose: () => void;
  onCopyLink: (visit: BrokerageSiteVisitRow) => Promise<void>;
  open: boolean;
  visit: BrokerageSiteVisitRow | null;
}) {
  if (!visit) {
    return null;
  }

  const msRemaining = Math.max(0, visit.tokenExpiresAt - now);
  const canCancel =
    visit.operationalStatus === "open" ||
    visit.operationalStatus === "in_field" ||
    visit.operationalStatus === "expired";

  return (
    <Sheet onOpenChange={(next) => !next && onClose()} open={open}>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{visit.milestoneName}</SheetTitle>
          <SheetDescription>
            {visit.buildName} · {visit.buildDisplayId}
          </SheetDescription>
        </SheetHeader>
        <SheetPanel className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <Badge
              variant={operationalStatusBadgeVariant(visit.operationalStatus)}
            >
              {operationalStatusLabel(visit.operationalStatus)}
            </Badge>
            <Badge variant="outline">{tokenStateLabel(visit.tokenState)}</Badge>
            {visit.geofenceFlagged ? (
              <Badge variant="warning">
                <AlertTriangle className="size-3" />
                Location unverified evidence
              </Badge>
            ) : null}
          </div>

          <dl className="grid gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Builder</dt>
              <dd>{visit.builderName}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Site</dt>
              <dd>{visit.location || "No address on file"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Scheduled</dt>
              <dd>{visit.scheduledDateLabel}</dd>
            </div>
            {(visit.operationalStatus === "open" ||
              visit.operationalStatus === "in_field") && (
              <div>
                <dt className="text-muted-foreground">Token expires in</dt>
                <dd className="font-medium tabular-nums">
                  {formatTokenCountdown(msRemaining)}
                </dd>
              </div>
            )}
            {visit.note ? (
              <div>
                <dt className="text-muted-foreground">Request note</dt>
                <dd>{visit.note}</dd>
              </div>
            ) : null}
            {visit.recordNote ? (
              <div>
                <dt className="text-muted-foreground">Field report</dt>
                <dd>
                  {visit.recordNoteFormat === "html" ? (
                    <FieldRichTextPreview
                      ariaLabel="Field report"
                      className="mt-1"
                      value={visit.recordNote}
                    />
                  ) : (
                    visit.recordNote
                  )}
                </dd>
              </div>
            ) : null}
            {visit.recommendedOutcome ? (
              <div>
                <dt className="text-muted-foreground">Recommended outcome</dt>
                <dd className="capitalize">{visit.recommendedOutcome}</dd>
              </div>
            ) : null}
            {visit.completedAt ? (
              <div>
                <dt className="text-muted-foreground">Completed</dt>
                <dd>{new Date(visit.completedAt).toLocaleString()}</dd>
              </div>
            ) : null}
          </dl>

          <div className="flex flex-col gap-2">
            <Button onClick={() => onCopyLink(visit)} variant="outline">
              <Copy className="size-4" />
              Copy field link
            </Button>
            <Button
              render={
                <Link
                  params={{ buildId: String(visit.buildId) }}
                  search={{ milestone: visit.milestoneKey }}
                  to="/backoffice/builds/$buildId"
                />
              }
            >
              Open build workspace
              <ExternalLink className="size-4" />
            </Button>
            {canCancel ? (
              <Button onClick={() => onCancel(visit)} variant="destructive">
                <XCircle className="size-4" />
                Cancel visit
              </Button>
            ) : null}
          </div>

          {visit.operationalStatus === "complete" ? (
            <div className="flex items-start gap-2 rounded-lg border border-success/30 bg-success/10 p-3 text-sm">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
              <p>
                This visit is complete. Milestone decisions and draw release
                stay in the build workspace.
              </p>
            </div>
          ) : null}
        </SheetPanel>
      </SheetContent>
    </Sheet>
  );
}
