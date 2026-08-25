"use client";

import {
  CalendarCheck,
  ChevronDown,
  ChevronUp,
  FileCheck2,
  Image as ImageIcon,
  LayoutGrid,
  List,
  Package,
  Wrench,
} from "lucide-react";
import { useState } from "react";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Card, CardPanel } from "#/components/ui/card.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { cn } from "#/lib/utils.ts";
import {
  STATE_COLUMNS,
  type SystemPostPrototypeRole,
  type VariantProps,
  type WorkItem,
} from "./-system-post-contracts.ts";
import {
  BoardlessDraw,
  GateInspector,
  NextGateBand,
  commandForWorkItem,
  stateLabel,
  stateTone,
} from "./-system-post-operations.tsx";
import {
  MilestoneSummary,
  WorkItemCard,
} from "./-system-post-event-variants.tsx";

export function MilestoneHeadline() {
  return (
    <Frame>
      <FramePanel className="space-y-3 p-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-lg bg-muted/45 px-3 py-2">
            <p className="text-muted-foreground text-xs">Status</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Badge variant="info">In progress</Badge>
              <Badge size="sm" variant="warning">
                1 behind
              </Badge>
            </div>
          </div>
          <div className="rounded-lg bg-muted/45 px-3 py-2">
            <p className="text-muted-foreground text-xs">Planned start</p>
            <p className="mt-1 font-semibold text-sm">Aug 1, 2026</p>
          </div>
          <div className="rounded-lg bg-muted/45 px-3 py-2">
            <p className="text-muted-foreground text-xs">Planned completion</p>
            <p className="mt-1 font-semibold text-sm">Sep 6, 2026</p>
          </div>
          <div className="rounded-lg bg-muted/45 px-3 py-2">
            <p className="text-muted-foreground text-xs">Current forecast</p>
            <p className="mt-1 font-semibold text-sm text-warning">
              Sep 9 · 3d late
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 border-t pt-3">
          <span className="mr-1 flex items-center gap-1 font-medium text-xs">
            <Wrench className="size-3.5" /> Trades
          </span>
          <Badge variant="outline">Northstar Concrete</Badge>
          <Badge variant="outline">Apex Waterproofing</Badge>
          <span className="ml-1 flex items-center gap-1 font-medium text-xs">
            <Package className="size-3.5" /> Suppliers
          </span>
          <Badge variant="outline">Ellis Building Supply</Badge>
          <Badge variant="outline">Dufferin Concrete</Badge>
        </div>
      </FramePanel>
    </Frame>
  );
}

export function SegmentedChoice({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: { label: string; value: string }[];
  value: string;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1 rounded-lg border bg-background p-1">
      <span className="w-full px-2 pt-1 text-muted-foreground text-xs uppercase tracking-wider sm:w-auto sm:pt-0">
        {label}
      </span>
      {options.map((option) => (
        <Button
          aria-pressed={value === option.value}
          className="px-2 text-xs sm:px-3 sm:text-sm"
          key={option.value}
          onClick={() => onChange(option.value)}
          size="sm"
          type="button"
          variant={value === option.value ? "secondary" : "ghost"}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}

export function BoardFirstVariant(props: VariantProps) {
  const [workView, setWorkView] = useState<"board" | "list">("list");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [oversightOpen, setOversightOpen] = useState(false);
  if (props.post === "draw") {
    return <BoardlessDraw mode="board" {...props} />;
  }
  return (
    <div className="space-y-4">
      <MilestoneSummary items={props.items} />
      <MilestoneOversight
        onToggle={() => setOversightOpen((current) => !current)}
        open={oversightOpen}
        readOnly={!props.workflowWritable}
        role={props.role}
      />
      <Frame className="min-w-0">
        <FramePanel className="min-w-0 overflow-hidden p-3 sm:p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-sm">Sub-milestones</h3>
              <p className="text-muted-foreground text-xs">
                {workView === "board"
                  ? "Status projection · drag locked · commands only"
                  : "Select a row to reveal its complete execution record"}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Button
                aria-label="Show Sub-milestones as a list"
                aria-pressed={workView === "list"}
                onClick={() => setWorkView("list")}
                size="sm"
                type="button"
                variant={workView === "list" ? "secondary" : "ghost"}
              >
                <List className="size-4" /> List
              </Button>
              <Button
                aria-label="Show Sub-milestones as a board"
                aria-pressed={workView === "board"}
                onClick={() => setWorkView("board")}
                size="sm"
                type="button"
                variant={workView === "board" ? "secondary" : "ghost"}
              >
                <LayoutGrid className="size-4" /> Board
              </Button>
            </div>
          </div>
          {workView === "board" ? (
            <div className="-mx-3 overflow-x-auto px-3 sm:mx-0 sm:px-0">
              <div className="grid min-w-[62rem] grid-cols-5 gap-2 rounded-xl border bg-background/30 p-2.5">
                {STATE_COLUMNS.map((column) => {
                  const columnItems = props.items.filter(
                    (item) => item.state === column.key
                  );
                  return (
                    <section className="min-w-0" key={column.key}>
                      <div className="mb-2 flex items-center justify-between px-1">
                        <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
                          {column.label}
                        </span>
                        <Badge size="sm" variant="secondary">
                          {columnItems.length}
                        </Badge>
                      </div>
                      <div className="space-y-2">
                        {columnItems.map((item) => (
                          <WorkItemCard
                            item={item}
                            key={item.id}
                            onSelect={props.onSelect}
                            selected={props.selected?.id === item.id}
                          />
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
            </div>
          ) : (
            <SubMilestoneList
              expandedId={expandedId}
              items={props.items}
              onAdvance={props.advanceSelected}
              onExpand={(id) => {
                props.onSelect(id);
                setExpandedId((current) => (current === id ? null : id));
              }}
              role={props.role}
              workflowWritable={props.workflowWritable}
            />
          )}
        </FramePanel>
      </Frame>
      {workView === "board" ? (
        <div className="border-t pt-4">
          <GateInspector
            onAdvance={props.advanceSelected}
            readOnly={!props.workflowWritable}
            role={props.role}
            selected={props.selected}
            variant="console"
          />
        </div>
      ) : null}
    </div>
  );
}

export function MilestoneOversight({
  onToggle,
  open,
  readOnly,
  role,
}: {
  onToggle: () => void;
  open: boolean;
  readOnly: boolean;
  role: SystemPostPrototypeRole;
}) {
  const backoffice = role === "lender_staff" || role === "lender_admin";
  const evidence = [
    "North wall forms",
    "Rebar grid B",
    "Primer coverage",
    "Membrane termination",
    "Drain tile outlet",
    "Washed stone lift",
  ];
  return (
    <Frame>
      <FramePanel className="p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="warning">
              <CalendarCheck className="mr-1 size-3" /> 1 active visit
            </Badge>
            <Badge variant="outline">
              <FileCheck2 className="mr-1 size-3" /> 2 completed reports
            </Badge>
            <Badge variant="outline">
              <ImageIcon className="mr-1 size-3" /> 14 evidence photos
            </Badge>
            <Badge variant="info">3 new</Badge>
          </div>
          <div className="flex items-center gap-1">
            {backoffice ? (
              <Button disabled={readOnly} size="sm" type="button">
                Order site visit
              </Button>
            ) : null}
            <Button
              aria-expanded={open}
              onClick={onToggle}
              size="sm"
              type="button"
              variant="ghost"
            >
              {open ? "Hide" : "Visits & evidence"}
              {open ? (
                <ChevronUp className="size-4" />
              ) : (
                <ChevronDown className="size-4" />
              )}
            </Button>
          </div>
        </div>
        {open ? (
          <div className="mt-3 space-y-4 border-t pt-3">
            <div className="grid gap-2 sm:grid-cols-3">
              <SiteVisitCard
                meta="Aug 14 · Nora Patel · site visit ordered"
                status="Active"
                title="Foundation risk review"
              />
              <SiteVisitCard
                meta="Completed Aug 12 · 6 evidence images"
                status="Passed with note"
                title="Waterproofing report"
              />
              <SiteVisitCard
                meta="Completed Jul 31 · 4 evidence images"
                status="Approved"
                title="Drainage inspection"
              />
            </div>
            <section>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-sm">Aggregated evidence</p>
                  <p className="text-muted-foreground text-xs">
                    Builder uploads and completed Site Visit evidence
                  </p>
                </div>
                <Button size="sm" type="button" variant="outline">
                  View all 14
                </Button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {evidence.map((label, index) => (
                  <Card className="shadow-none" key={label}>
                    <CardPanel className="p-2">
                      <div className="grid aspect-[16/9] place-items-center rounded-lg bg-muted/60">
                        <ImageIcon className="size-5 text-muted-foreground" />
                      </div>
                      <p className="mt-2 truncate font-medium text-xs">
                        {label}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {index < 2 ? "Builder evidence" : "Site Visit evidence"}
                      </p>
                    </CardPanel>
                  </Card>
                ))}
              </div>
            </section>
          </div>
        ) : null}
      </FramePanel>
    </Frame>
  );
}

export function SiteVisitCard({
  meta,
  status,
  title,
}: {
  meta: string;
  status: string;
  title: string;
}) {
  return (
    <Card className="shadow-none">
      <CardPanel className="space-y-3 p-3">
        <div className="flex items-start justify-between gap-2">
          <CalendarCheck className="size-4 text-muted-foreground" />
          <Badge
            size="sm"
            variant={status === "Active" ? "warning" : "success"}
          >
            {status}
          </Badge>
        </div>
        <div>
          <p className="font-medium text-sm">{title}</p>
          <p className="mt-1 text-muted-foreground text-xs">{meta}</p>
        </div>
        <Button className="w-full" size="sm" type="button" variant="outline">
          {status === "Active" ? "View visit" : "View report"}
        </Button>
      </CardPanel>
    </Card>
  );
}

export function SubMilestoneList({
  expandedId,
  items,
  onAdvance,
  onExpand,
  role,
  workflowWritable,
}: {
  expandedId: string | null;
  items: WorkItem[];
  onAdvance: () => void;
  onExpand: (id: string) => void;
  role: SystemPostPrototypeRole;
  workflowWritable: boolean;
}) {
  return (
    <div className="space-y-2">
      {items.map((item) => {
        const expanded = expandedId === item.id;
        return (
          <Card
            className={cn("shadow-none", expanded && "ring-1 ring-primary/25")}
            key={item.id}
          >
            <button
              aria-expanded={expanded}
              className="grid w-full gap-3 p-3 text-left sm:grid-cols-[minmax(0,1fr)_8rem_9rem_8rem_auto] sm:items-center"
              onClick={() => onExpand(item.id)}
              type="button"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium text-sm">
                  {item.title}
                </span>
                <span className="mt-1 block text-muted-foreground text-xs">
                  {item.code} · {item.assignee}
                </span>
              </span>
              <Badge className="w-fit" variant={stateTone(item.state)}>
                {stateLabel(item.state)}
              </Badge>
              <span className="text-muted-foreground text-xs">
                {item.plannedStart} → {item.plannedEnd}
              </span>
              <span className="text-xs">
                <span className="font-medium">{item.budget}</span>
                <span className="block text-muted-foreground">budget</span>
              </span>
              {expanded ? (
                <ChevronUp className="size-4" />
              ) : (
                <ChevronDown className="size-4" />
              )}
            </button>
            {expanded ? (
              <SubMilestoneExpandedDetails
                item={item}
                onAdvance={onAdvance}
                role={role}
                workflowWritable={workflowWritable}
              />
            ) : null}
          </Card>
        );
      })}
    </div>
  );
}

export function SubMilestoneExpandedDetails({
  item,
  onAdvance,
  role,
  workflowWritable,
}: {
  item: WorkItem;
  onAdvance: () => void;
  role: SystemPostPrototypeRole;
  workflowWritable: boolean;
}) {
  const command = commandForWorkItem(item.state, role);
  return (
    <CardPanel className="space-y-5 border-t p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <DetailBlock label="Description" value={item.description} />
        <DetailBlock label="Field notes" value={item.fieldNotes} />
        <DetailBlock label="Scope" value={item.scope} />
        <div className="grid grid-cols-2 gap-2">
          <CompactFact label="Actual start" value={item.actualStart} />
          <CompactFact label="Actual end" value={item.actualEnd} />
          <CompactFact label="Planned start" value={item.plannedStart} />
          <CompactFact label="Planned end" value={item.plannedEnd} />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <CompactFact label="Budget" value={item.budget} />
        <CompactFact label="Actual / committed" value={item.actualCost} />
        <CompactFact label="Draw unlock" value={item.drawUnlock} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <section>
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1 font-medium text-sm">
              <Wrench className="size-4" /> Trades & suppliers
            </p>
            <Button
              disabled={!workflowWritable}
              size="sm"
              type="button"
              variant="outline"
            >
              Manage assignments
            </Button>
          </div>
          <ChipGroup label="Tradespeople" values={item.tradespeople} />
          <ChipGroup label="Suppliers" values={item.suppliers} />
          <ChipGroup label="Materials" values={item.materials} />
        </section>
        <section>
          <p className="flex items-center gap-1 font-medium text-sm">
            <CalendarCheck className="size-4" /> Site visits
          </p>
          <div className="mt-2 space-y-2">
            <CompactFact label="Ordered" value={item.orderedSiteVisit} />
            <CompactFact
              label="Completed report"
              value={item.completedVisitReport}
            />
            {item.completedVisitReport === "None" ? null : (
              <Button size="sm" type="button" variant="outline">
                View report and evidence
              </Button>
            )}
          </div>
        </section>
      </div>
      <section>
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="flex items-center gap-1 font-medium text-sm">
              <ImageIcon className="size-4" /> Builder evidence
            </p>
            <p className="text-muted-foreground text-xs">
              Every uploaded photo remains attached to its Evidence Package
              revision.
            </p>
          </div>
          <Badge variant="outline">{item.builderEvidence.length} photos</Badge>
        </div>
        {item.builderEvidence.length > 0 ? (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {item.builderEvidence.map((photo) => (
              <Card className="shadow-none" key={photo}>
                <CardPanel className="p-2">
                  <div className="grid aspect-[16/9] place-items-center rounded-lg bg-muted/60">
                    <ImageIcon className="size-5 text-muted-foreground" />
                  </div>
                  <p className="mt-2 truncate text-xs">{photo}</p>
                </CardPanel>
              </Card>
            ))}
          </div>
        ) : (
          <p className="mt-2 rounded-lg border border-dashed p-3 text-muted-foreground text-xs">
            No Builder evidence uploaded yet.
          </p>
        )}
      </section>
      <NextGateBand
        command={command}
        onAdvance={onAdvance}
        readOnly={!workflowWritable}
        role={role}
      />
    </CardPanel>
  );
}

export function DetailBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-medium text-xs">{label}</p>
      <p className="mt-1 text-muted-foreground text-sm leading-5">{value}</p>
    </div>
  );
}

export function CompactFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/45 px-3 py-2">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-1 font-medium text-sm">{value}</p>
    </div>
  );
}

export function ChipGroup({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="mt-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <div className="mt-1 flex flex-wrap gap-1">
        {values.map((value) => (
          <Badge key={value} variant="outline">
            {value}
          </Badge>
        ))}
      </div>
    </div>
  );
}
