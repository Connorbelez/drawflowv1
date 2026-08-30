"use client";

import {
  Activity,
  ArrowRight,
  Banknote,
  CalendarDays,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  FileCheck2,
  FileText,
  GitCompareArrows,
  ListChecks,
  MapPin,
  MessageCircle,
  Paperclip,
  PlayCircle,
  ShieldCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
import {
  CollaborationRichTextEditor,
  CollaborationRichTextPreview,
} from "../CollaborationRichTextEditor.tsx";
import { Badge, type BadgeProps } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Card,
  CardPanel,
} from "#/components/ui/card.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Progress } from "#/components/ui/progress.tsx";
import { cn } from "#/lib/utils.ts";
import {
  BRIEF_TAG_OPTIONS,
  DRAW_BRIEF_TAG_OPTIONS,
  INITIAL_WORK_ITEMS,
  ROLE_OPTIONS,
  STATE_COLUMNS,
  type DrawState,
  type PrototypeEvent,
  type SystemPostPrototypeKind,
  type SystemPostPrototypeRole,
  type VariantProps,
  type WorkItem,
  type WorkState,
} from "./-system-post-contracts.ts";

export function SummaryMetric({
  label,
  tone,
  value,
}: {
  label: string;
  tone: BadgeProps["variant"];
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-lg bg-muted/40 px-3 py-2">
      <p className="truncate text-muted-foreground text-xs">{label}</p>
      <div className="mt-1 flex items-center justify-between gap-2">
        <p className="font-semibold text-base">{value}</p>
        {label === "Plan changed" ? (
          <Badge size="sm" variant={tone}>
            <GitCompareArrows className="size-3" />
          </Badge>
        ) : null}
      </div>
    </div>
  );
}

export function MilestoneLedger({
  items,
  onSelect,
}: {
  items: WorkItem[];
  onSelect: (id: string) => void;
}) {
  return (
    <div className="mt-4 overflow-x-auto">
      <div className="min-w-[44rem] divide-y rounded-xl border">
        {items.map((item) => (
          <button
            className="grid w-full grid-cols-[minmax(0,1fr)_8rem_8rem_7rem] items-center gap-3 px-3 py-3 text-left transition hover:bg-muted/45"
            key={item.id}
            onClick={() => onSelect(item.id)}
            type="button"
          >
            <span className="min-w-0">
              <span className="block truncate font-medium text-sm">
                {item.title}
              </span>
              <span className="mt-1 block truncate text-muted-foreground text-xs">
                {item.code} · {item.assignee}
              </span>
            </span>
            <Badge className="w-fit" variant={stateTone(item.state)}>
              {stateLabel(item.state)}
            </Badge>
            <span className="text-muted-foreground text-xs">
              {item.evidence}
            </span>
            <span className="text-right text-muted-foreground text-xs">
              {item.planned}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function GateInspector({
  drawState = "requested",
  onAdvance,
  post = "milestone",
  readOnly = false,
  role,
  selected,
  variant,
}: {
  drawState?: DrawState;
  onAdvance: () => void;
  post?: SystemPostPrototypeKind;
  readOnly?: boolean;
  role: SystemPostPrototypeRole;
  selected: WorkItem | null;
  variant: "board" | "console";
}) {
  const command =
    post === "milestone"
      ? commandForWorkItem(selected?.state, role)
      : commandForDraw(drawState, role);
  return (
    <Frame>
      <FramePanel className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-sm">
              {variant === "console" ? "Current gate" : "Selected work"}
            </p>
            <p className="mt-1 text-muted-foreground text-xs">
              {post === "milestone"
                ? selected?.code
                : "Canonical Draw projection"}
            </p>
          </div>
          <Badge variant={command.enabled ? "info" : "outline"}>
            {roleLabel(role)}
          </Badge>
        </div>
        <h3 className="mt-4 font-semibold text-lg">
          {post === "milestone" ? selected?.title : "Draw 04 · $184,000"}
        </h3>
        {post === "milestone" && selected ? (
          <div className="mt-4 space-y-3 text-sm">
            <MetaRow
              icon={<Users />}
              label="Work Allocation"
              value={selected.assignee}
            />
            <MetaRow
              icon={<CalendarDays />}
              label="Plan"
              value={selected.planned}
            />
            <MetaRow
              icon={<ListChecks />}
              label="Dependencies"
              value={selected.dependencies}
            />
            <MetaRow
              icon={<FileCheck2 />}
              label="Evidence"
              value={selected.evidence}
            />
            <MetaRow
              icon={<MapPin />}
              label="Site Visit"
              value={selected.siteVisit}
            />
            <div>
              <div className="mb-1 flex justify-between text-xs">
                <span>Reported progress</span>
                <span>{selected.progress}%</span>
              </div>
              <Progress value={selected.progress} />
              <p className="mt-1 text-muted-foreground text-xs">
                Progress never submits completion or changes state by itself.
              </p>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-3 text-sm">
            <MetaRow icon={<Banknote />} label="Requested" value="$184,000" />
            <MetaRow
              icon={<ShieldCheck />}
              label="Policy limit"
              value="Within approved availability"
            />
            <MetaRow
              icon={<FileCheck2 />}
              label="Generated work"
              value="0 Action Items"
            />
          </div>
        )}
        <div className="mt-5 rounded-lg border border-dashed bg-muted/35 p-3">
          <p className="font-medium text-xs">What happens next</p>
          <p className="mt-1 text-muted-foreground text-sm">
            {readOnly
              ? "This lifecycle state preserves the governed record without allowing workflow advancement."
              : command.reason}
          </p>
          <Button
            className="mt-3 w-full"
            disabled={readOnly || !command.enabled}
            onClick={onAdvance}
            type="button"
          >
            {readOnly ? "Workflow read-only" : command.label}{" "}
            <ArrowRight className="ml-1 size-4" />
          </Button>
        </div>
        {post === "milestone" && variant === "board" ? (
          <OperationsBrief kind="milestone" readOnly={readOnly} />
        ) : null}
      </FramePanel>
    </Frame>
  );
}

export function NextGateBand<TState extends WorkState | DrawState>({
  command,
  onAdvance,
  readOnly = false,
  role,
}: {
  command: CommandPresentation<TState>;
  onAdvance: () => void;
  readOnly?: boolean;
  role: SystemPostPrototypeRole;
}) {
  return (
    <Card className="border-primary/35 bg-primary/5 shadow-none">
      <CardPanel className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
            <PlayCircle className="size-4" />
          </div>
          <div>
            <p className="font-semibold text-sm">Next required gate</p>
            <p className="mt-1 text-muted-foreground text-xs">
              {readOnly
                ? "This lifecycle state preserves the governed record without allowing workflow advancement."
                : command.reason}
            </p>
            <p className="mt-1 text-muted-foreground text-xs">
              Viewer · {roleLabel(role)}
            </p>
          </div>
        </div>
        <Button
          disabled={readOnly || !command.enabled}
          onClick={onAdvance}
          size="sm"
          type="button"
        >
          {readOnly ? "Workflow read-only" : command.label}
        </Button>
      </CardPanel>
    </Card>
  );
}

export function EventLedger({ events }: { events: PrototypeEvent[] }) {
  return (
    <section className="mt-5">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="font-semibold text-sm">Operational event ledger</h2>
          <p className="text-muted-foreground text-xs">
            Immutable domain facts and editable discussion share one chronology
            without sharing authority.
          </p>
        </div>
        <Badge variant="outline">Newest first</Badge>
      </div>
      <div className="mt-4 border-l pl-5">
        {events.map((event) => (
          <article className="relative pb-5" key={event.id}>
            <span
              className={cn(
                "absolute top-1 -left-[1.7rem] grid size-5 place-items-center rounded-full border bg-background",
                event.kind === "domain" && "border-primary text-primary",
                event.kind === "evidence" && "border-amber-500 text-amber-700",
                event.kind === "planning" && "border-violet-500 text-violet-700"
              )}
            >
              {event.kind === "discussion" ? (
                <MessageCircle className="size-3" />
              ) : (
                <Activity className="size-3" />
              )}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium text-sm">{event.title}</p>
              <Badge
                size="sm"
                variant={event.kind === "discussion" ? "outline" : "secondary"}
              >
                {event.kind === "discussion" ? "Discussion" : "System fact"}
              </Badge>
            </div>
            <p className="mt-1 text-muted-foreground text-sm">{event.body}</p>
            <p className="mt-2 text-muted-foreground text-xs">
              {event.actor} · {event.time}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

export function DiscussionComposer() {
  return (
    <Card className="mt-2 shadow-none">
      <CardPanel className="p-3">
        <div className="flex items-center gap-2">
          <MessageCircle className="size-4 text-muted-foreground" />
          <p className="font-medium text-sm">Continue discussion</p>
          <Badge className="ml-auto" size="sm" variant="outline">
            Does not reopen workflow
          </Badge>
        </div>
        <p className="mt-2 text-muted-foreground text-xs">
          Rich text, mentions, replies, revisions, and discussion attachments
          use existing collaboration support.
        </p>
      </CardPanel>
    </Card>
  );
}

export function OperationsBrief({
  kind = "milestone",
  readOnly = false,
}: {
  kind?: SystemPostPrototypeKind;
  readOnly?: boolean;
}) {
  const [value, setValue] = useState(
    kind === "milestone"
      ? "<p>Complete the approved foundation scope and preserve the current Evidence Package before lender review.</p><ul><li>Confirm Work Allocation before start.</li><li>Use the governed evidence flow for completion proof.</li></ul>"
      : "<p>Coordinate Draw 04 review without duplicating the canonical reimbursement workflow.</p><ul><li>Keep bank and release coordination in ordinary Action Items.</li><li>Use the governed Draw commands for every financial decision.</li></ul>"
  );
  return (
    <section className="mt-5 border-t pt-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-sm">Operations Brief</p>
          <p className="text-muted-foreground text-xs">
            {readOnly
              ? "Read-only collaboration context"
              : "Editable collaboration context"}{" "}
            · domain facts remain immutable
          </p>
        </div>
        <Badge size="sm" variant="outline">
          revision 4
        </Badge>
      </div>
      <div className="mt-3 rounded-xl bg-muted/55 p-3">
        {readOnly ? (
          <CollaborationRichTextPreview
            ariaLabel="System Post Operations Brief"
            tagOptions={
              kind === "milestone" ? BRIEF_TAG_OPTIONS : DRAW_BRIEF_TAG_OPTIONS
            }
            value={value}
          />
        ) : (
          <CollaborationRichTextEditor
            ariaLabel="System Post Operations Brief"
            editorMinHeightClass="min-h-28"
            onChange={setValue}
            placeholder="Add operational context…"
            tagOptions={
              kind === "milestone" ? BRIEF_TAG_OPTIONS : DRAW_BRIEF_TAG_OPTIONS
            }
            value={value}
          />
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          <Badge variant="outline">
            <Paperclip className="mr-1 size-3" />{" "}
            {kind === "milestone"
              ? "Foundation checklist.pdf"
              : "Draw release checklist.pdf"}
          </Badge>
          <Badge variant="secondary">Discussion attachment</Badge>
        </div>
      </div>
    </section>
  );
}

export function BoardlessDraw({
  addCoordinationItem,
  advanceDraw,
  coordinationItems,
  drawState,
  role,
  workflowWritable,
}: VariantProps & { mode: "board" }) {
  return (
    <div className="space-y-4">
      <DrawSummary drawState={drawState} />
      <Frame>
        <FramePanel className="space-y-5 p-4 sm:p-5">
          <DrawLifecycle drawState={drawState} />
          <div className="grid gap-3 sm:grid-cols-3">
            <FactCard
              icon={<Banknote />}
              label="Requested amount"
              value="$184,000"
            />
            <FactCard
              icon={<FileText />}
              label="Evidence Package"
              value="Revision 3 · complete"
            />
            <FactCard
              icon={<MapPin />}
              label="Site Visit"
              value="Required · not ordered"
            />
          </div>
          <DrawCoordination
            items={coordinationItems}
            onAdd={addCoordinationItem}
            readOnly={!workflowWritable}
          />
        </FramePanel>
      </Frame>
      <div className="border-t pt-4">
        <GateInspector
          drawState={drawState}
          onAdvance={advanceDraw}
          post="draw"
          readOnly={!workflowWritable}
          role={role}
          selected={null}
          variant="console"
        />
      </div>
    </div>
  );
}

export function DrawSummary({ drawState }: { drawState: DrawState }) {
  return (
    <Frame>
      <FramePanel className="grid gap-3 p-3 sm:grid-cols-4">
        <SummaryMetric
          label="Canonical state"
          tone="warning"
          value={drawStateLabel(drawState)}
        />
        <SummaryMetric label="Requested" tone="info" value="$184,000" />
        <SummaryMetric label="Generated items" tone="success" value="0" />
        <SummaryMetric
          label="Workflow authority"
          tone="outline"
          value="Canonical Draw"
        />
      </FramePanel>
    </Frame>
  );
}

export function DrawLifecycle({ drawState }: { drawState: DrawState }) {
  const states: DrawState[] = [
    "scheduled",
    "requested",
    "in_review",
    "ready_for_admin",
    "approved",
    "released",
  ];
  const activeIndex = states.indexOf(drawState);
  return (
    <section>
      <div>
        <h2 className="font-semibold text-sm">Canonical Draw lifecycle</h2>
        <p className="text-muted-foreground text-xs">
          Projection only · the System Post never requests or releases funds by
          itself
        </p>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-6">
        {states.map((state, index) => (
          <div
            className="flex items-center gap-2 sm:flex-col sm:items-start"
            key={state}
          >
            <span
              className={cn(
                "grid size-6 shrink-0 place-items-center rounded-full border",
                index <= activeIndex &&
                  "border-primary bg-primary text-primary-foreground"
              )}
            >
              {index < activeIndex ? (
                <CheckCircle2 className="size-3.5" />
              ) : (
                <Circle className="size-3" />
              )}
            </span>
            <p
              className={cn(
                "text-xs",
                index === activeIndex
                  ? "font-semibold"
                  : "text-muted-foreground"
              )}
            >
              {drawStateLabel(state)}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function DrawCoordination({
  items,
  onAdd,
  readOnly = false,
}: {
  items: string[];
  onAdd: () => void;
  readOnly?: boolean;
}) {
  return (
    <section className="border-t pt-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold text-sm">Internal coordination</h2>
            <Badge variant="outline">0 generated</Badge>
          </div>
          <p className="mt-1 text-muted-foreground text-xs">
            Ordinary Action Items only · completion has no Draw workflow effect
          </p>
        </div>
        <Button
          disabled={readOnly}
          onClick={onAdd}
          size="sm"
          type="button"
          variant="outline"
        >
          <UserPlus className="mr-1 size-3.5" /> Add coordination item
        </Button>
      </div>
      <div className="mt-3 space-y-2">
        {items.length === 0 ? (
          <Card className="border-dashed shadow-none">
            <CardPanel className="p-4 text-center">
              <p className="font-medium text-sm">No coordination items</p>
              <p className="mt-1 text-muted-foreground text-xs">
                This is intentional. Draw System Posts never pre-generate work.
              </p>
            </CardPanel>
          </Card>
        ) : (
          items.map((item) => (
            <Card className="shadow-none" key={item}>
              <CardPanel className="flex items-center gap-3 p-3">
                <ClipboardCheck className="size-4 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-sm">{item}</p>
                  <p className="text-muted-foreground text-xs">
                    Manually added · coordination only
                  </p>
                </div>
                <Badge variant="secondary">To do</Badge>
              </CardPanel>
            </Card>
          ))
        )}
      </div>
    </section>
  );
}

export function FactCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <Card className="shadow-none">
      <CardPanel className="p-3">
        <span className="text-muted-foreground [&>svg]:size-4">{icon}</span>
        <p className="mt-3 text-muted-foreground text-xs">{label}</p>
        <p className="mt-1 font-medium text-sm">{value}</p>
      </CardPanel>
    </Card>
  );
}

export function MetaRow({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex gap-2">
      <span className="mt-0.5 text-muted-foreground [&>svg]:size-4">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className="mt-0.5 font-medium text-sm">{value}</p>
      </div>
    </div>
  );
}

export interface CommandPresentation<TState extends WorkState | DrawState> {
  enabled: boolean;
  label: string;
  nextState?: TState;
  reason: string;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: The explicit role-by-state matrix is intentionally auditable in this disposable prototype.
export function commandForWorkItem(
  state: WorkState | undefined,
  role: SystemPostPrototypeRole
): CommandPresentation<WorkState> {
  if (!state) {
    return {
      enabled: false,
      label: "No work selected",
      reason: "Select a Sub-milestone to inspect its canonical gates.",
    };
  }
  if (state === "approved") {
    return {
      enabled: false,
      label: "Approved",
      reason:
        "This child is approved. Only a formal Lender Admin retraction can reopen affected work.",
    };
  }
  if (state === "backlog" || state === "behind_schedule") {
    const enabled = role === "builder" || role === "contractor";
    return {
      enabled,
      label: enabled ? "Start work" : "Waiting for operator start",
      nextState: enabled ? "in_progress" : undefined,
      reason: enabled
        ? "Invoke the canonical Sub-milestone start command. Behind schedule is cleared by an actual start, not a card move."
        : "Only the assigned operator or authorized Builder can record the actual start.",
    };
  }
  if (state === "in_progress") {
    const enabled = role === "builder" || role === "contractor";
    return {
      enabled,
      label: enabled
        ? "Submit completion"
        : "Waiting for completion submission",
      nextState: enabled ? "in_review" : undefined,
      reason: enabled
        ? "The demo assumes required evidence is frozen. Completion remains an explicit command separate from 100% progress."
        : "The execution assignee must submit completion against the required frozen Evidence Package.",
    };
  }
  if (role === "lender_admin") {
    return {
      enabled: true,
      label: "Approve Sub-milestone",
      nextState: "approved",
      reason:
        "Evidence and the required Site Visit are ready. Final child approval is a Lender Admin command.",
    };
  }
  if (role === "lender_staff") {
    return {
      enabled: true,
      label: "Request changes",
      nextState: "in_progress",
      reason:
        "Lender Staff may review and request remediation, but cannot grant final approval.",
    };
  }
  return {
    enabled: false,
    label: "In lender review",
    reason:
      "The frozen submission is under lender review. Discussion remains available without changing state.",
  };
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: The explicit role-by-state matrix is intentionally auditable in this disposable prototype.
export function commandForDraw(
  state: DrawState,
  role: SystemPostPrototypeRole
): CommandPresentation<DrawState> {
  if (state === "released") {
    return {
      enabled: false,
      label: "Released",
      reason:
        "Funds were released and the System Post is resolved. Collaboration cannot reopen the Draw.",
    };
  }
  if (state === "scheduled") {
    const enabled = role === "builder";
    return {
      enabled,
      label: enabled ? "Request draw" : "No Draw Request",
      nextState: enabled ? "requested" : undefined,
      reason: enabled
        ? "Submit the canonical reimbursement request. Scheduled activation did not request funds."
        : "The Builder has not submitted the canonical Draw Request.",
    };
  }
  if (state === "requested") {
    const enabled = role === "lender_staff";
    return {
      enabled,
      label: enabled ? "Start review" : "Waiting for lender review",
      nextState: enabled ? "in_review" : undefined,
      reason:
        "The Draw Request exists. Coordination items do not satisfy or block this review gate.",
    };
  }
  if (state === "in_review") {
    const enabled = role === "lender_staff";
    return {
      enabled,
      label: enabled ? "Send to admin" : "Lender review in progress",
      nextState: enabled ? "ready_for_admin" : undefined,
      reason:
        "Lender Staff can recommend and advance review, while final approval remains with Lender Admin.",
    };
  }
  if (state === "ready_for_admin") {
    const enabled = role === "lender_admin";
    return {
      enabled,
      label: enabled ? "Approve draw" : "Ready for Lender Admin",
      nextState: enabled ? "approved" : undefined,
      reason: "Only Lender Admin may grant final Draw approval.",
    };
  }
  const enabled = role === "lender_admin";
  return {
    enabled,
    label: enabled ? "Release funds" : "Approved · awaiting release",
    nextState: enabled ? "released" : undefined,
    reason:
      "Approval keeps the post open. Only canonical release resolves it and begins interest.",
  };
}

export function stateLabel(state: WorkState | undefined) {
  return (
    STATE_COLUMNS.find((column) => column.key === state)?.label ?? "Unknown"
  );
}

export function stateTone(state: WorkState): BadgeProps["variant"] {
  if (state === "behind_schedule") {
    return "error";
  }
  if (state === "in_progress") {
    return "info";
  }
  if (state === "in_review") {
    return "warning";
  }
  if (state === "approved") {
    return "success";
  }
  return "secondary";
}

export function drawStateLabel(state: DrawState) {
  const labels: Record<DrawState, string> = {
    approved: "Approved",
    in_review: "In review",
    ready_for_admin: "Ready for admin",
    released: "Released",
    requested: "Requested",
    scheduled: "Scheduled",
  };
  return labels[state];
}

export function roleLabel(role: SystemPostPrototypeRole) {
  return ROLE_OPTIONS.find((option) => option.value === role)?.label ?? role;
}

export function cloneWorkItems() {
  return INITIAL_WORK_ITEMS.map((item) => ({ ...item }));
}
