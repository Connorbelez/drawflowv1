"use client";

import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Circle,
  Eye,
  GitCompareArrows,
  PlayCircle,
} from "lucide-react";
import { useState } from "react";
import { Avatar, AvatarFallback } from "#/components/ui/avatar.tsx";
import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Card,
  CardFooter,
  CardHeader,
  CardPanel,
  CardTitle,
} from "#/components/ui/card.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { cn } from "#/lib/utils.ts";
import {
  STATE_COLUMNS,
  type VariantProps,
  type WorkItem,
  type WorkState,
} from "./-system-post-contracts.ts";
import {
  DrawCoordination,
  DrawSummary,
  EventLedger,
  DiscussionComposer,
  GateInspector,
  MilestoneLedger,
  NextGateBand,
  OperationsBrief,
  commandForDraw,
  commandForWorkItem,
  roleLabel,
  stateLabel,
  stateTone,
} from "./-system-post-operations.tsx";

export function EventFirstVariant(props: VariantProps) {
  const selectedEvents = props.selected
    ? props.events.filter(
        (event) => !event.workItemId || event.workItemId === props.selected?.id
      )
    : props.events;
  return (
    <div className="space-y-4">
      {props.post === "milestone" ? (
        <MilestoneSummary compact items={props.items} />
      ) : (
        <DrawSummary drawState={props.drawState} />
      )}
      <div className="space-y-4">
        {props.post === "milestone" ? (
          <MilestoneLedger items={props.items} onSelect={props.onSelect} />
        ) : null}
        <Frame>
          <FramePanel className="p-4 sm:p-5">
            <NextGateBand
              command={
                props.post === "milestone"
                  ? commandForWorkItem(props.selected?.state, props.role)
                  : commandForDraw(props.drawState, props.role)
              }
              onAdvance={
                props.post === "milestone"
                  ? props.advanceSelected
                  : props.advanceDraw
              }
              readOnly={!props.workflowWritable}
              role={props.role}
            />
            <div className="mt-5 flex flex-wrap gap-2 border-b pb-3">
              {["All", "Work", "Evidence", "Reviews", "Discussion"].map(
                (filter, index) => (
                  <Button
                    key={filter}
                    size="sm"
                    type="button"
                    variant={index === 0 ? "secondary" : "ghost"}
                  >
                    {filter}
                  </Button>
                )
              )}
              {props.selected ? (
                <Badge className="ml-auto" variant="outline">
                  {props.selected.code} · filtered
                </Badge>
              ) : null}
            </div>
            {props.post === "draw" ? (
              <div className="mt-5">
                <DrawCoordination
                  items={props.coordinationItems}
                  onAdd={props.addCoordinationItem}
                  readOnly={!props.workflowWritable}
                />
              </div>
            ) : null}
            <EventLedger events={selectedEvents} />
            <DiscussionComposer />
          </FramePanel>
        </Frame>
      </div>
    </div>
  );
}

export function ControlRoomVariant(props: VariantProps) {
  const [view, setView] = useState<"details" | "history" | "work">("work");
  return (
    <Frame className="min-w-0">
      <FramePanel className="min-w-0 p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
          <div>
            <p className="font-semibold text-sm">System Post application</p>
            <p className="text-muted-foreground text-xs">
              Stateful, but fully bounded by this post
            </p>
          </div>
          <Badge variant="outline">Viewer · {roleLabel(props.role)}</Badge>
        </div>
        <div className="mt-3 flex flex-wrap gap-1">
          {(["work", "details", "history"] as const).map((tab) => (
            <Button
              key={tab}
              onClick={() => setView(tab)}
              size="sm"
              type="button"
              variant={view === tab ? "secondary" : "ghost"}
            >
              {tab === "work"
                ? "Work"
                : tab === "details"
                  ? "Planning details"
                  : "Audit history"}
            </Button>
          ))}
        </div>
        {view === "work" ? (
          <div className="mt-4 space-y-4">
            {props.post === "milestone" ? (
              <MilestoneLedger items={props.items} onSelect={props.onSelect} />
            ) : (
              <>
                <DrawSummary drawState={props.drawState} />
                <DrawCoordination
                  items={props.coordinationItems}
                  onAdd={props.addCoordinationItem}
                  readOnly={!props.workflowWritable}
                />
              </>
            )}
            <GateInspector
              drawState={props.drawState}
              onAdvance={
                props.post === "milestone"
                  ? props.advanceSelected
                  : props.advanceDraw
              }
              post={props.post}
              readOnly={!props.workflowWritable}
              role={props.role}
              selected={props.selected}
              variant="console"
            />
          </div>
        ) : view === "details" ? (
          <OperationsBrief
            key={props.post}
            kind={props.post}
            readOnly={!props.workflowWritable}
          />
        ) : (
          <div className="mt-4">
            <EventLedger events={props.events} />
          </div>
        )}
      </FramePanel>
    </Frame>
  );
}

export function MilestoneSummary({ items }: { compact?: boolean; items: WorkItem[] }) {
  return (
    <fieldset
      aria-label="Sub-milestone state totals"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-y py-2 text-xs"
    >
      {STATE_COLUMNS.map((column) => {
        const count = items.filter((item) => item.state === column.key).length;
        return (
          <span
            className="flex items-center gap-1 text-muted-foreground"
            key={column.key}
            title={`${column.label}: ${count}`}
          >
            <StatePulseIcon state={column.key} />
            <span className="sr-only">{column.label}</span>
            <span className="font-semibold text-foreground">{count}</span>
          </span>
        );
      })}
      <span
        className="flex items-center gap-1 text-warning"
        title="Planning revision changed from 6 to 7"
      >
        <GitCompareArrows className="size-3.5" />
        <span className="sr-only">Plan changed</span>
        <span className="font-semibold">r7</span>
      </span>
    </fieldset>
  );
}

export function StatePulseIcon({ state }: { state: WorkState }) {
  if (state === "behind_schedule") {
    return <AlertTriangle className="size-3.5 text-destructive" />;
  }
  if (state === "in_progress") {
    return <PlayCircle className="size-3.5 text-info" />;
  }
  if (state === "in_review") {
    return <Eye className="size-3.5 text-warning" />;
  }
  if (state === "approved") {
    return <CheckCircle2 className="size-3.5 text-success" />;
  }
  return <Circle className="size-3.5 text-muted-foreground" />;
}

export function WorkItemCard({
  item,
  onSelect,
  selected,
}: {
  item: WorkItem;
  onSelect: (id: string) => void;
  selected: boolean;
}) {
  return (
    <Card
      className={cn(
        "w-full shadow-none transition hover:border-foreground/30",
        selected && "ring-2 ring-primary/35"
      )}
      onClick={() => onSelect(item.id)}
      render={<button type="button" />}
    >
      <CardHeader className="gap-2 p-3 pb-2 text-left">
        <div>
          <p className="font-mono text-muted-foreground text-xs">{item.code}</p>
          <CardTitle className="mt-1 text-sm leading-5">{item.title}</CardTitle>
        </div>
        <Badge size="sm" variant={stateTone(item.state)}>
          {stateLabel(item.state)}
        </Badge>
      </CardHeader>
      <CardPanel className="space-y-2 px-3 pt-0 pb-2 text-left text-xs">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Avatar className="size-5">
            <AvatarFallback>{item.assigneeInitials}</AvatarFallback>
          </Avatar>
          <span className="truncate">{item.assignee}</span>
        </div>
        <p className="flex items-center gap-1 text-muted-foreground">
          <CalendarDays className="size-3.5" /> {item.planned}
        </p>
        <div className="flex flex-wrap gap-1">
          {item.locationUnverified ? (
            <Badge size="sm" variant="warning">
              Location unverified
            </Badge>
          ) : null}
          {item.assignee === "Assignment required" ? (
            <Badge size="sm" variant="warning">
              Assignment required
            </Badge>
          ) : null}
        </div>
      </CardPanel>
      <CardFooter className="justify-between px-3 pt-1 pb-3 text-muted-foreground text-xs">
        <span>{item.evidence}</span>
        <ChevronRight className="size-3.5" />
      </CardFooter>
    </Card>
  );
}
