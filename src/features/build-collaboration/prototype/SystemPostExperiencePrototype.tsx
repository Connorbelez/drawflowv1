"use client";

import {
  Activity,
  ArrowRight,
  Banknote,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
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
  RotateCcw,
  ShieldCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { type ReactNode, useState } from "react";

import { PrototypeSwitcher } from "#/components/prototype-switcher.tsx";
import { Avatar, AvatarFallback } from "#/components/ui/avatar.tsx";
import { Badge, type BadgeProps } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardPanel,
  CardTitle,
} from "#/components/ui/card.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Progress } from "#/components/ui/progress.tsx";
import { cn } from "#/lib/utils.ts";
import {
  CollaborationRichTextEditor,
  type CollaborationTagOption,
} from "../CollaborationRichTextEditor.tsx";

/**
 * PROTOTYPE — THROWAWAY.
 * Three System Post interface directions, switchable with ?variant=A|B|C on
 * /prototype/system-posts. Mock state only; canonical commands are simulated
 * in memory and every state change remains visible in the selected direction.
 */

export type SystemPostPrototypeVariant = "A" | "B" | "C";
export type SystemPostPrototypeKind = "milestone" | "draw";
export type SystemPostPrototypeRole =
  | "builder"
  | "contractor"
  | "lender_staff"
  | "lender_admin";

type WorkState =
  | "backlog"
  | "behind_schedule"
  | "in_progress"
  | "in_review"
  | "approved";

type DrawState =
  | "scheduled"
  | "requested"
  | "in_review"
  | "ready_for_admin"
  | "approved"
  | "released";

interface WorkItem {
  assignee: string;
  assigneeInitials: string;
  budget: string;
  code: string;
  dependencies: string;
  evidence: string;
  id: string;
  locationUnverified?: boolean;
  planned: string;
  progress: number;
  siteVisit: string;
  state: WorkState;
  title: string;
}

interface PrototypeEvent {
  actor: string;
  body: string;
  id: string;
  kind: "domain" | "discussion" | "evidence" | "planning";
  time: string;
  title: string;
  workItemId?: string;
}

const VARIANTS = [
  { label: "Inline workboard", value: "A" },
  { label: "Inline work + history", value: "B" },
  { label: "Tabbed post app", value: "C" },
] as const;

const ROLE_OPTIONS: { label: string; value: SystemPostPrototypeRole }[] = [
  { label: "Builder", value: "builder" },
  { label: "Contractor", value: "contractor" },
  { label: "Lender staff", value: "lender_staff" },
  { label: "Lender admin", value: "lender_admin" },
];

const STATE_COLUMNS: { key: WorkState; label: string }[] = [
  { key: "backlog", label: "Backlog" },
  { key: "behind_schedule", label: "Behind schedule" },
  { key: "in_progress", label: "In progress" },
  { key: "in_review", label: "In review" },
  { key: "approved", label: "Approved" },
];

const INITIAL_WORK_ITEMS: WorkItem[] = [
  {
    assignee: "Assignment required",
    assigneeInitials: "?",
    budget: "$18,500",
    code: "04.1",
    dependencies: "3 of 3 clear",
    evidence: "0 of 2 required",
    id: "layout",
    planned: "Aug 5–6",
    progress: 0,
    siteVisit: "Not required",
    state: "backlog",
    title: "Survey and footing layout",
  },
  {
    assignee: "Jordan Franks",
    assigneeInitials: "JF",
    budget: "$42,800",
    code: "04.2",
    dependencies: "2 of 2 clear",
    evidence: "0 of 3 required",
    id: "forms",
    planned: "Aug 1–4 · missed start",
    progress: 0,
    siteVisit: "Not required",
    state: "behind_schedule",
    title: "Install footing forms",
  },
  {
    assignee: "Alex Lee",
    assigneeInitials: "AL",
    budget: "$67,200",
    code: "04.3",
    dependencies: "3 of 3 clear",
    evidence: "2 of 3 · 1 unverified",
    id: "walls",
    locationUnverified: true,
    planned: "Aug 3–10 · started late",
    progress: 65,
    siteVisit: "Risk review pending",
    state: "in_progress",
    title: "Pour foundation walls",
  },
  {
    assignee: "Maya Kim",
    assigneeInitials: "MK",
    budget: "$29,600",
    code: "04.4",
    dependencies: "4 of 4 clear",
    evidence: "3 of 3 · frozen r3",
    id: "waterproofing",
    planned: "Aug 7–11",
    progress: 100,
    siteVisit: "Scheduled · Aug 12",
    state: "in_review",
    title: "Waterproof foundation",
  },
  {
    assignee: "Northstar Civil",
    assigneeInitials: "NC",
    budget: "$21,900",
    code: "04.5",
    dependencies: "4 of 4 clear",
    evidence: "Approved · frozen r2",
    id: "drainage",
    planned: "Jul 28–31",
    progress: 100,
    siteVisit: "Complete",
    state: "approved",
    title: "Install drainage and stone",
  },
];

const INITIAL_EVENTS: PrototypeEvent[] = [
  {
    actor: "DrawFlow System",
    body: "The Build-local start date passed without an actual start. This condition is system-controlled.",
    id: "evt-behind",
    kind: "domain",
    time: "Today · 12:00 AM",
    title: "Install footing forms moved behind schedule",
    workItemId: "forms",
  },
  {
    actor: "Maya Kim",
    body: "Submitted completion against frozen Evidence Package revision 3.",
    id: "evt-review",
    kind: "evidence",
    time: "Yesterday · 4:18 PM",
    title: "Waterproof foundation entered review",
    workItemId: "waterproofing",
  },
  {
    actor: "Alex Lee",
    body: "Uploaded two site photos. One location attempt could not be verified; the evidence was preserved for lender review.",
    id: "evt-evidence",
    kind: "evidence",
    time: "Yesterday · 1:42 PM",
    title: "Evidence Package updated",
    workItemId: "walls",
  },
  {
    actor: "Planning revision 7",
    body: "Survey and footing layout was added. No active execution history was replaced.",
    id: "evt-plan",
    kind: "planning",
    time: "Aug 2 · 9:10 AM",
    title: "Approved plan changed after activation",
  },
  {
    actor: "DrawFlow System",
    body: "Five canonical Sub-milestones were materialized from planning revision 6.",
    id: "evt-activated",
    kind: "domain",
    time: "Aug 1 · 12:00 AM",
    title: "Foundation & below-grade activated",
  },
];

const MAYA_TAG_OPTION: CollaborationTagOption = {
  eyebrow: "Builder",
  id: "maya-kim",
  initials: "MK",
  kind: "participant",
  label: "Maya Kim",
  summary: "Build manager",
};

const BRIEF_TAG_OPTIONS: CollaborationTagOption[] = [
  MAYA_TAG_OPTION,
  {
    eyebrow: "Contractor",
    id: "alex-lee",
    initials: "AL",
    kind: "participant",
    label: "Alex Lee",
    summary: "Foundation contractor",
  },
  {
    eyebrow: "Document",
    id: "foundation-checklist",
    kind: "document",
    label: "Foundation evidence checklist.pdf",
    summary: "Planning revision 7",
  },
];

const DRAW_BRIEF_TAG_OPTIONS: CollaborationTagOption[] = [
  MAYA_TAG_OPTION,
  {
    eyebrow: "Lender staff",
    id: "nora-patel",
    initials: "NP",
    kind: "participant",
    label: "Nora Patel",
    summary: "Draw reviewer",
  },
  {
    eyebrow: "Document",
    id: "draw-release-checklist",
    kind: "document",
    label: "Draw release checklist.pdf",
    summary: "Lender policy",
  },
];

export function isSystemPostPrototypeVariant(
  value: unknown
): value is SystemPostPrototypeVariant {
  return value === "A" || value === "B" || value === "C";
}

export function isSystemPostPrototypeKind(
  value: unknown
): value is SystemPostPrototypeKind {
  return value === "milestone" || value === "draw";
}

export function isSystemPostPrototypeRole(
  value: unknown
): value is SystemPostPrototypeRole {
  return ROLE_OPTIONS.some((option) => option.value === value);
}

export function SystemPostExperiencePrototype({
  onPostChange,
  onRoleChange,
  onVariantChange,
  post,
  role,
  variant,
}: {
  onPostChange: (post: SystemPostPrototypeKind) => void;
  onRoleChange: (role: SystemPostPrototypeRole) => void;
  onVariantChange: (variant: SystemPostPrototypeVariant) => void;
  post: SystemPostPrototypeKind;
  role: SystemPostPrototypeRole;
  variant: SystemPostPrototypeVariant;
}) {
  const [items, setItems] = useState(() => cloneWorkItems());
  const [selectedId, setSelectedId] = useState("waterproofing");
  const [events, setEvents] = useState(() => [...INITIAL_EVENTS]);
  const [drawState, setDrawState] = useState<DrawState>("requested");
  const [coordinationItems, setCoordinationItems] = useState<string[]>([]);
  const [postTab, setPostTab] = useState<"actions" | "discussion" | null>(null);
  const selected =
    items.find((item) => item.id === selectedId) ?? items[0] ?? null;

  const appendEvent = (event: Omit<PrototypeEvent, "id" | "time">) => {
    setEvents((current) => [
      {
        ...event,
        id: `demo-${current.length}-${event.title}`,
        time: "Just now · prototype",
      },
      ...current,
    ]);
  };

  const advanceSelected = () => {
    if (!selected) {
      return;
    }
    const command = commandForWorkItem(selected.state, role);
    if (!(command.enabled && command.nextState)) {
      return;
    }
    setItems((current) =>
      current.map((item) =>
        item.id === selected.id
          ? {
              ...item,
              progress:
                command.nextState === "in_review" ||
                command.nextState === "approved"
                  ? 100
                  : Math.max(item.progress, 15),
              state: command.nextState,
            }
          : item
      )
    );
    appendEvent({
      actor: roleLabel(role),
      body: `The prototype invoked “${command.label}” as a canonical domain intent. No card status was edited directly.`,
      kind: "domain",
      title: `${selected.title} · ${stateLabel(command.nextState)}`,
      workItemId: selected.id,
    });
  };

  const advanceDraw = () => {
    const command = commandForDraw(drawState, role);
    if (!(command.enabled && command.nextState)) {
      return;
    }
    setDrawState(command.nextState);
    appendEvent({
      actor: roleLabel(role),
      body: `The canonical Draw command “${command.label}” updated the projection. Coordination work had no effect.`,
      kind: "domain",
      title: `Draw 04 · ${drawStateLabel(command.nextState)}`,
    });
  };

  const addCoordinationItem = () => {
    if (coordinationItems.length > 0) {
      return;
    }
    setCoordinationItems(["Confirm lender inspection availability"]);
    appendEvent({
      actor: roleLabel(role),
      body: "A regular Action Item was added for coordination only. Generated System Action Items remain at zero.",
      kind: "discussion",
      title: "Draw coordination item added",
    });
  };

  const resetScenario = () => {
    setItems(cloneWorkItems());
    setSelectedId("waterproofing");
    setEvents([...INITIAL_EVENTS]);
    setDrawState("requested");
    setCoordinationItems([]);
    setPostTab(null);
  };

  const shared: VariantProps = {
    advanceDraw,
    advanceSelected,
    addCoordinationItem,
    coordinationItems,
    drawState,
    events,
    items,
    onSelect: setSelectedId,
    post,
    role,
    selected,
  };

  return (
    <main className="min-h-svh bg-muted/30 px-3 py-4 pb-28 text-foreground sm:px-5">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <PrototypeHeader
          drawState={drawState}
          onPostChange={(nextPost) => {
            setPostTab(null);
            onPostChange(nextPost);
          }}
          onReset={resetScenario}
          onRoleChange={onRoleChange}
          post={post}
          role={role}
          selected={selected}
          variant={variant}
        />
        <CollaborationFeedContext>
          <OrdinaryCollaborationPost
            author="Maya Kim"
            initials="MK"
            meta="Builder · Today at 8:42 AM"
          >
            Morning update: excavation is clear and the foundation crew is
            mobilizing now. I’ve attached the revised access plan for today’s
            work.
          </OrdinaryCollaborationPost>
          <SystemCollaborationPost
            actionItemCount={
              post === "milestone" ? items.length : coordinationItems.length
            }
            post={post}
            postTab={postTab}
            setPostTab={setPostTab}
          >
            {variant === "A" ? <BoardFirstVariant {...shared} /> : null}
            {variant === "B" ? <EventFirstVariant {...shared} /> : null}
            {variant === "C" ? (
              <ControlRoomVariant key={post} {...shared} />
            ) : null}
          </SystemCollaborationPost>
          <OrdinaryCollaborationPost
            author="Nora Patel"
            initials="NP"
            meta="Lender staff · Yesterday at 4:18 PM"
          >
            I’ve reviewed the latest foundation evidence. The
            location-unverified photo remains preserved and will be handled
            during the scheduled site review.
          </OrdinaryCollaborationPost>
        </CollaborationFeedContext>
      </div>
      <PrototypeSwitcher
        current={variant}
        onChange={onVariantChange}
        variants={[...VARIANTS]}
      />
    </main>
  );
}

interface VariantProps {
  addCoordinationItem: () => void;
  advanceDraw: () => void;
  advanceSelected: () => void;
  coordinationItems: string[];
  drawState: DrawState;
  events: PrototypeEvent[];
  items: WorkItem[];
  onSelect: (id: string) => void;
  post: SystemPostPrototypeKind;
  role: SystemPostPrototypeRole;
  selected: WorkItem | null;
}

function PrototypeHeader({
  drawState,
  onPostChange,
  onReset,
  onRoleChange,
  post,
  role,
  selected,
  variant,
}: {
  drawState: DrawState;
  onPostChange: (post: SystemPostPrototypeKind) => void;
  onReset: () => void;
  onRoleChange: (role: SystemPostPrototypeRole) => void;
  post: SystemPostPrototypeKind;
  role: SystemPostPrototypeRole;
  selected: WorkItem | null;
  variant: SystemPostPrototypeVariant;
}) {
  const questions = {
    A: "Can a compact workboard remain usable when it is fully contained inside a feed post?",
    B: "Can work and audit history read as one inline post without becoming a detached workspace?",
    C: "Can a stateful tabbed application feel native while remaining bounded by the post shell?",
  };
  return (
    <Frame>
      <FramePanel className="space-y-3 p-3 sm:p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="warning">Prototype controls</Badge>
              <Badge variant="outline">Not part of the post</Badge>
            </div>
            <p className="mt-2 font-medium text-sm">{questions[variant]}</p>
          </div>
          <Button onClick={onReset} size="sm" type="button" variant="ghost">
            <RotateCcw className="mr-1 size-3.5" /> Reset
          </Button>
        </div>
        <div className="flex flex-col gap-2 border-t pt-3">
          <div className="flex min-w-0 flex-wrap gap-2">
            <SegmentedChoice
              label="Post type"
              onChange={(value) =>
                onPostChange(value as SystemPostPrototypeKind)
              }
              options={[
                { label: "Milestone", value: "milestone" },
                { label: "Draw", value: "draw" },
              ]}
              value={post}
            />
            <SegmentedChoice
              label="Viewer"
              onChange={(value) =>
                onRoleChange(value as SystemPostPrototypeRole)
              }
              options={ROLE_OPTIONS}
              value={role}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="secondary">
              State ·{" "}
              {post === "milestone"
                ? stateLabel(selected?.state)
                : drawStateLabel(drawState)}
            </Badge>
            <Badge variant="secondary">Role · {roleLabel(role)}</Badge>
          </div>
        </div>
      </FramePanel>
    </Frame>
  );
}

function CollaborationFeedContext({ children }: { children: ReactNode }) {
  return (
    <section aria-label="Build collaboration feed" className="space-y-3">
      <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-muted-foreground text-xs uppercase tracking-wider">
            1480 St. Clair Ave W
          </p>
          <h1 className="mt-1 font-semibold text-2xl tracking-tight">
            Collaboration
          </h1>
          <p className="mt-1 text-muted-foreground text-sm">
            Updates, governed work, evidence, and decisions for this Build.
          </p>
        </div>
        <Button size="sm" type="button">
          Share update
        </Button>
      </div>
      <Card>
        <CardPanel className="flex items-center gap-3 p-3 sm:p-4">
          <Avatar className="size-9">
            <AvatarFallback>MK</AvatarFallback>
          </Avatar>
          <button
            className="min-h-10 flex-1 rounded-xl border bg-muted/35 px-3 text-left text-muted-foreground text-sm"
            type="button"
          >
            Share an update with this Build…
          </button>
        </CardPanel>
      </Card>
      <div className="flex flex-wrap gap-1 border-b pb-2">
        {["All", "Actionable", "Pinned", "Following"].map((label, index) => (
          <Button
            key={label}
            size="sm"
            type="button"
            variant={index === 0 ? "secondary" : "ghost"}
          >
            {label}
          </Button>
        ))}
      </div>
      {children}
    </section>
  );
}

function OrdinaryCollaborationPost({
  author,
  children,
  initials: avatarInitials,
  meta,
}: {
  author: string;
  children: ReactNode;
  initials: string;
  meta: string;
}) {
  return (
    <Card>
      <CardHeader className="gap-3 p-4">
        <div className="flex min-w-0 items-start gap-3">
          <Avatar className="size-9">
            <AvatarFallback>{avatarInitials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <CardTitle className="text-sm">{author}</CardTitle>
            <CardDescription className="mt-0.5 text-xs">
              {meta} · Update
            </CardDescription>
          </div>
          <Button
            aria-label={`More actions for ${author}'s post`}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            ···
          </Button>
        </div>
      </CardHeader>
      <CardPanel className="px-4 pt-0 pb-4 text-sm leading-6">
        {children}
      </CardPanel>
      <CardFooter className="flex items-center justify-between border-t px-4 py-3 text-muted-foreground text-xs">
        <span>Discussion 2</span>
        <span>Seen by 8</span>
      </CardFooter>
    </Card>
  );
}

function SystemCollaborationPost({
  actionItemCount,
  children,
  post,
  postTab,
  setPostTab,
}: {
  actionItemCount: number;
  children: ReactNode;
  post: SystemPostPrototypeKind;
  postTab: "actions" | "discussion" | null;
  setPostTab: (tab: "actions" | "discussion" | null) => void;
}) {
  const milestone = post === "milestone";
  return (
    <Card className="ring-1 ring-primary/15">
      <CardHeader className="gap-3 p-4">
        <div className="flex min-w-0 items-start gap-3">
          <Avatar className="size-9">
            <AvatarFallback>DF</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-sm">DrawFlow System</CardTitle>
              <Badge variant="info">System post</Badge>
            </div>
            <CardDescription className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
              <span>System</span>
              <span aria-hidden="true">·</span>
              <span>Today at 9:14 AM</span>
              <Badge variant="outline">
                {milestone ? "Milestone" : "Draw"}
              </Badge>
              <Badge variant="success">Open</Badge>
            </CardDescription>
          </div>
          <Button
            aria-label="More actions for this System Post"
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            ···
          </Button>
        </div>
      </CardHeader>
      <CardPanel className="space-y-4 px-4 pt-0 pb-4">
        <div>
          <h2 className="font-semibold text-lg tracking-tight">
            {milestone
              ? "M-04 · Foundation & below-grade"
              : "Draw 04 · Foundation reimbursement"}
          </h2>
          <p className="mt-1 text-muted-foreground text-sm">
            {milestone
              ? "This Milestone has started. Governed Sub-milestone work is ready for the Build participants assigned below."
              : "A reimbursement Draw Request is active. Financial approval remains governed by the canonical Draw workflow."}
          </p>
        </div>
        {children}
      </CardPanel>
      <div className="grid grid-cols-2 border-y">
        <button
          aria-expanded={postTab === "discussion"}
          className={cn(
            "flex min-h-11 items-center justify-center gap-2 border-r text-sm",
            postTab === "discussion" && "bg-primary/10"
          )}
          onClick={() =>
            setPostTab(postTab === "discussion" ? null : "discussion")
          }
          type="button"
        >
          <MessageCircle className="size-4" /> Discussion 4
        </button>
        <button
          aria-expanded={postTab === "actions"}
          className={cn(
            "flex min-h-11 items-center justify-center gap-2 text-sm",
            postTab === "actions" && "bg-primary/10"
          )}
          onClick={() => setPostTab(postTab === "actions" ? null : "actions")}
          type="button"
        >
          <ListChecks className="size-4" /> Action Items {actionItemCount}
        </button>
      </div>
      {postTab ? (
        <CardPanel className="border-b p-4">
          {postTab === "discussion" ? (
            <div className="space-y-3">
              <p className="font-medium text-sm">
                Discussion remains ordinary collaboration
              </p>
              <p className="text-muted-foreground text-sm">
                Replies, mentions, rich text, attachments, revision history, and
                unread state use the existing post thread.
              </p>
              <Button size="sm" type="button" variant="outline">
                Reply to thread
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="font-medium text-sm">
                {milestone
                  ? "Governed work is summarized in the System Post above."
                  : "Only manually added coordination work appears here."}
              </p>
              <p className="text-muted-foreground text-xs">
                {milestone
                  ? "Sub-milestone transitions still invoke canonical commands."
                  : "Draw coordination never satisfies or advances a financial gate."}
              </p>
            </div>
          )}
        </CardPanel>
      ) : null}
      <CardFooter className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-muted-foreground text-xs">
        <div className="flex gap-3">
          <span>Acknowledge</span>
          <span>Follow</span>
        </div>
        <span>Seen by 11</span>
      </CardFooter>
    </Card>
  );
}

function SegmentedChoice({
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

function BoardFirstVariant(props: VariantProps) {
  if (props.post === "draw") {
    return <BoardlessDraw mode="board" {...props} />;
  }
  return (
    <div className="space-y-4">
      <MilestoneSummary items={props.items} />
      <Frame className="min-w-0">
        <FramePanel className="min-w-0 overflow-hidden p-3 sm:p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-sm">Sub-milestone workboard</h3>
              <p className="text-muted-foreground text-xs">
                Inline projection · drag locked · commands only
              </p>
            </div>
            <Badge variant="outline">5 governed items</Badge>
          </div>
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
        </FramePanel>
      </Frame>
      <div className="border-t pt-4">
        <GateInspector
          onAdvance={props.advanceSelected}
          role={props.role}
          selected={props.selected}
          variant="console"
        />
      </div>
    </div>
  );
}

function EventFirstVariant(props: VariantProps) {
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

function ControlRoomVariant(props: VariantProps) {
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
              role={props.role}
              selected={props.selected}
              variant="console"
            />
          </div>
        ) : view === "details" ? (
          <OperationsBrief key={props.post} kind={props.post} />
        ) : (
          <div className="mt-4">
            <EventLedger events={props.events} />
          </div>
        )}
      </FramePanel>
    </Frame>
  );
}

function MilestoneSummary({
  compact = false,
  items,
}: {
  compact?: boolean;
  items: WorkItem[];
}) {
  return (
    <Frame>
      <FramePanel
        className={cn(
          "grid gap-3 p-3",
          compact
            ? "grid-cols-2 sm:grid-cols-5"
            : "sm:grid-cols-3 xl:grid-cols-6"
        )}
      >
        {STATE_COLUMNS.map((column) => (
          <SummaryMetric
            key={column.key}
            label={column.label}
            tone={stateTone(column.key)}
            value={String(
              items.filter((item) => item.state === column.key).length
            )}
          />
        ))}
        {compact ? null : (
          <SummaryMetric label="Plan changed" tone="warning" value="r6 → r7" />
        )}
      </FramePanel>
    </Frame>
  );
}

function SummaryMetric({
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
        <Badge size="sm" variant={tone}>
          {label === "Plan changed" ? (
            <GitCompareArrows className="size-3" />
          ) : (
            ""
          )}
        </Badge>
      </div>
    </div>
  );
}

function WorkItemCard({
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

function MilestoneLedger({
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

function GateInspector({
  drawState = "requested",
  onAdvance,
  post = "milestone",
  role,
  selected,
  variant,
}: {
  drawState?: DrawState;
  onAdvance: () => void;
  post?: SystemPostPrototypeKind;
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
          <p className="mt-1 text-muted-foreground text-sm">{command.reason}</p>
          <Button
            className="mt-3 w-full"
            disabled={!command.enabled}
            onClick={onAdvance}
            type="button"
          >
            {command.label} <ArrowRight className="ml-1 size-4" />
          </Button>
        </div>
        {post === "milestone" && variant === "board" ? (
          <OperationsBrief kind="milestone" />
        ) : null}
      </FramePanel>
    </Frame>
  );
}

function NextGateBand({
  command,
  onAdvance,
  role,
}: {
  command: CommandPresentation;
  onAdvance: () => void;
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
              {command.reason}
            </p>
            <p className="mt-1 text-muted-foreground text-xs">
              Viewer · {roleLabel(role)}
            </p>
          </div>
        </div>
        <Button
          disabled={!command.enabled}
          onClick={onAdvance}
          size="sm"
          type="button"
        >
          {command.label}
        </Button>
      </CardPanel>
    </Card>
  );
}

function EventLedger({ events }: { events: PrototypeEvent[] }) {
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

function DiscussionComposer() {
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

function OperationsBrief({
  kind = "milestone",
}: {
  kind?: SystemPostPrototypeKind;
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
            Editable collaboration context · domain facts remain immutable
          </p>
        </div>
        <Badge size="sm" variant="outline">
          revision 4
        </Badge>
      </div>
      <div className="mt-3 rounded-xl bg-muted/55 p-3">
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

function BoardlessDraw({
  addCoordinationItem,
  advanceDraw,
  coordinationItems,
  drawState,
  role,
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
          />
        </FramePanel>
      </Frame>
      <div className="border-t pt-4">
        <GateInspector
          drawState={drawState}
          onAdvance={advanceDraw}
          post="draw"
          role={role}
          selected={null}
          variant="console"
        />
      </div>
    </div>
  );
}

function DrawSummary({ drawState }: { drawState: DrawState }) {
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
          label="Post lifecycle"
          tone="outline"
          value={drawState === "released" ? "Resolved" : "Open"}
        />
      </FramePanel>
    </Frame>
  );
}

function DrawLifecycle({ drawState }: { drawState: DrawState }) {
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

function DrawCoordination({
  items,
  onAdd,
}: {
  items: string[];
  onAdd: () => void;
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
        <Button onClick={onAdd} size="sm" type="button" variant="outline">
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

function FactCard({
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

function MetaRow({
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

interface CommandPresentation {
  enabled: boolean;
  label: string;
  nextState?: WorkState | DrawState;
  reason: string;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: The explicit role-by-state matrix is intentionally auditable in this disposable prototype.
function commandForWorkItem(
  state: WorkState | undefined,
  role: SystemPostPrototypeRole
): CommandPresentation {
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
function commandForDraw(
  state: DrawState,
  role: SystemPostPrototypeRole
): CommandPresentation {
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

function stateLabel(state: WorkState | undefined) {
  return (
    STATE_COLUMNS.find((column) => column.key === state)?.label ?? "Unknown"
  );
}

function stateTone(state: WorkState): BadgeProps["variant"] {
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

function drawStateLabel(state: DrawState) {
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

function roleLabel(role: SystemPostPrototypeRole) {
  return ROLE_OPTIONS.find((option) => option.value === role)?.label ?? role;
}

function cloneWorkItems() {
  return INITIAL_WORK_ITEMS.map((item) => ({ ...item }));
}
