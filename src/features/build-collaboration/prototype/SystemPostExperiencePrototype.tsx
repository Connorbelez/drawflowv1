"use client";

import {
  Activity,
  AlertTriangle,
  Banknote,
  CalendarCheck,
  ChevronDown,
  ChevronUp,
  ListChecks,
  MessageCircle,
  PlayCircle,
  RotateCcw,
  ShieldCheck,
  Users,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { PrototypeSwitcher } from "#/components/prototype-switcher.tsx";
import { Avatar, AvatarFallback } from "#/components/ui/avatar.tsx";
import { Badge } from "#/components/ui/badge.tsx";
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
import { cn } from "#/lib/utils.ts";
import {
  INITIAL_EVENTS,
  ROLE_OPTIONS,
  SCENARIO_OPTIONS,
  VARIANTS,
  isSystemPostPrototypeKind as isSystemPostPrototypeKindContract,
  isSystemPostPrototypeRole as isSystemPostPrototypeRoleContract,
  isSystemPostPrototypeScenario as isSystemPostPrototypeScenarioContract,
  isSystemPostPrototypeVariant as isSystemPostPrototypeVariantContract,
  type DrawState,
  type PrototypeEvent,
  type SystemPostPrototypeKind as SystemPostPrototypeKindContract,
  type SystemPostPrototypeRole as SystemPostPrototypeRoleContract,
  type SystemPostPrototypeScenario as SystemPostPrototypeScenarioContract,
  type SystemPostPrototypeVariant as SystemPostPrototypeVariantContract,
  type WorkItem,
  type VariantProps,
} from "./-system-post-contracts.ts";
import {
  cloneWorkItems,
  commandForDraw,
  commandForWorkItem,
  drawStateLabel,
  roleLabel,
  stateLabel,
} from "./-system-post-operations.tsx";
import {
  BoardFirstVariant,
  MilestoneHeadline,
  SegmentedChoice,
} from "./-system-post-board-variant.tsx";
import {
  ControlRoomVariant,
  EventFirstVariant,
  MilestoneSummary,
} from "./-system-post-event-variants.tsx";

export type SystemPostPrototypeKind = SystemPostPrototypeKindContract;
export type SystemPostPrototypeRole = SystemPostPrototypeRoleContract;
export type SystemPostPrototypeScenario = SystemPostPrototypeScenarioContract;
export type SystemPostPrototypeVariant = SystemPostPrototypeVariantContract;

export function isSystemPostPrototypeKind(
  value: unknown
): value is SystemPostPrototypeKind {
  return isSystemPostPrototypeKindContract(value);
}

export function isSystemPostPrototypeRole(
  value: unknown
): value is SystemPostPrototypeRole {
  return isSystemPostPrototypeRoleContract(value);
}

export function isSystemPostPrototypeScenario(
  value: unknown
): value is SystemPostPrototypeScenario {
  return isSystemPostPrototypeScenarioContract(value);
}

export function isSystemPostPrototypeVariant(
  value: unknown
): value is SystemPostPrototypeVariant {
  return isSystemPostPrototypeVariantContract(value);
}

export function SystemPostExperiencePrototype({
  onPostChange,
  onRoleChange,
  onScenarioChange,
  onVariantChange,
  post,
  role,
  scenario,
  variant,
}: {
  onPostChange: (post: SystemPostPrototypeKind) => void;
  onRoleChange: (role: SystemPostPrototypeRole) => void;
  onScenarioChange: (scenario: SystemPostPrototypeScenario) => void;
  onVariantChange: (variant: SystemPostPrototypeVariant) => void;
  post: SystemPostPrototypeKind;
  role: SystemPostPrototypeRole;
  scenario: SystemPostPrototypeScenario;
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
  const workflowWritable = scenario === "active" || scenario === "reopened";
  const collaborationWritable = scenario !== "archived";

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
    if (!(selected && workflowWritable)) {
      return;
    }
    const command = commandForWorkItem(selected.state, role);
    if (!(command.enabled && command.nextState)) {
      return;
    }
    const nextState = command.nextState;
    setItems((current) =>
      current.map((item) =>
        item.id === selected.id
          ? {
              ...item,
              progress:
                nextState === "in_review" || nextState === "approved"
                  ? 100
                  : Math.max(item.progress, 15),
              state: nextState,
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
    if (!workflowWritable) {
      return;
    }
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
    if (coordinationItems.length > 0 || !workflowWritable) {
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
    workflowWritable,
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
          onScenarioChange={(nextScenario) => {
            setPostTab(null);
            onScenarioChange(nextScenario);
          }}
          post={post}
          role={role}
          scenario={scenario}
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
          <SystemPostScenarioEntry
            actionItemCount={
              post === "milestone" ? items.length : coordinationItems.length
            }
            collaborationWritable={collaborationWritable}
            drawState={drawState}
            items={items}
            post={post}
            postTab={postTab}
            scenario={scenario}
            setPostTab={setPostTab}
            workflowWritable={workflowWritable}
          >
            {variant === "A" ? <BoardFirstVariant {...shared} /> : null}
            {variant === "B" ? <EventFirstVariant {...shared} /> : null}
            {variant === "C" ? (
              <ControlRoomVariant key={post} {...shared} />
            ) : null}
          </SystemPostScenarioEntry>
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

function PrototypeHeader({
  drawState,
  onPostChange,
  onReset,
  onRoleChange,
  onScenarioChange,
  post,
  role,
  scenario,
  selected,
  variant,
}: {
  drawState: DrawState;
  onPostChange: (post: SystemPostPrototypeKind) => void;
  onReset: () => void;
  onRoleChange: (role: SystemPostPrototypeRole) => void;
  onScenarioChange: (scenario: SystemPostPrototypeScenario) => void;
  post: SystemPostPrototypeKind;
  role: SystemPostPrototypeRole;
  scenario: SystemPostPrototypeScenario;
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
            <SegmentedChoice
              label="Scenario"
              onChange={(value) =>
                onScenarioChange(value as SystemPostPrototypeScenario)
              }
              options={SCENARIO_OPTIONS}
              value={scenario}
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

interface SystemPostScenarioEntryProps {
  actionItemCount: number;
  children: ReactNode;
  collaborationWritable: boolean;
  drawState: DrawState;
  items: WorkItem[];
  post: SystemPostPrototypeKind;
  postTab: "actions" | "discussion" | null;
  scenario: SystemPostPrototypeScenario;
  setPostTab: (tab: "actions" | "discussion" | null) => void;
  workflowWritable: boolean;
}

function SystemPostScenarioEntry(props: SystemPostScenarioEntryProps) {
  if (props.scenario === "restricted") {
    return (
      <Frame>
        <FramePanel className="flex min-h-28 items-center justify-center gap-2 text-muted-foreground text-sm">
          <ShieldCheck className="size-4" /> Restricted update
        </FramePanel>
      </Frame>
    );
  }
  if (props.scenario === "loading") {
    return (
      <Card aria-label="Loading System Post" className="animate-pulse">
        <CardPanel className="space-y-3 p-4">
          <div className="h-9 w-48 rounded-lg bg-muted" />
          <div className="h-4 w-3/4 rounded bg-muted" />
          <div className="h-24 rounded-xl bg-muted/70" />
          <p className="text-muted-foreground text-xs">Loading System Post…</p>
        </CardPanel>
      </Card>
    );
  }
  if (props.scenario === "empty") {
    return (
      <Frame>
        <FramePanel className="py-10 text-center">
          <ListChecks className="mx-auto size-5 text-muted-foreground" />
          <p className="mt-3 font-medium text-sm">
            No System Posts in this view
          </p>
          <p className="mt-1 text-muted-foreground text-xs">
            Valid Milestones always have at least one Sub-milestone; this is a
            feed result state, not an empty Milestone.
          </p>
        </FramePanel>
      </Frame>
    );
  }
  if (props.scenario === "error") {
    return (
      <Card>
        <CardPanel className="py-8 text-center">
          <AlertTriangle className="mx-auto size-5 text-destructive" />
          <p className="mt-3 font-medium text-sm">System Post unavailable</p>
          <p className="mt-1 text-muted-foreground text-xs">
            The collaboration feed remains usable while this governed projection
            retries.
          </p>
          <Button className="mt-4" size="sm" type="button" variant="outline">
            <RotateCcw className="size-4" /> Retry
          </Button>
        </CardPanel>
      </Card>
    );
  }
  return <SystemCollaborationPost {...props} />;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This throwaway prototype deliberately exposes the full post-shell state matrix together for product review.
function SystemCollaborationPost({
  actionItemCount,
  children,
  collaborationWritable,
  drawState,
  items,
  post,
  postTab,
  scenario,
  setPostTab,
  workflowWritable,
}: SystemPostScenarioEntryProps) {
  const milestone = post === "milestone";
  const [collapsed, setCollapsed] = useState(false);
  const behindScheduleCount = items.filter(
    (item) => item.state === "behind_schedule"
  ).length;
  const reviewCount = items.filter((item) => item.state === "in_review").length;
  const lifecycleLabel =
    scenario === "resolved"
      ? "Resolved"
      : scenario === "reopened"
        ? "Reopened"
        : scenario === "archived"
          ? "Archived"
          : "Active";
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
              <Badge
                variant={
                  scenario === "resolved"
                    ? "success"
                    : scenario === "reopened"
                      ? "info"
                      : scenario === "archived"
                        ? "secondary"
                        : "success"
                }
              >
                {lifecycleLabel}
              </Badge>
              {scenario === "archived" ? (
                <Badge variant="outline">Read-only</Badge>
              ) : null}
            </CardDescription>
          </div>
          <div className="flex items-center gap-1">
            <Button
              aria-label={
                collapsed ? "Expand System Post" : "Collapse System Post"
              }
              onClick={() => {
                setCollapsed((current) => !current);
                setPostTab(null);
              }}
              size="sm"
              type="button"
              variant="ghost"
            >
              {collapsed ? (
                <ChevronDown className="size-4" />
              ) : (
                <ChevronUp className="size-4" />
              )}
              <span className="hidden sm:inline">
                {collapsed ? "Expand" : "Collapse"}
              </span>
            </Button>
            <Button
              aria-label="More actions for this System Post"
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              ···
            </Button>
          </div>
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
        {scenario === "resolved" ? (
          <div className="rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm">
            Resolved after final approval. Workflow commands are locked, while
            the existing Discussion thread remains available.
          </div>
        ) : scenario === "reopened" ? (
          <div className="rounded-lg border border-info/30 bg-info/10 px-3 py-2 text-sm">
            Reopened by a canonical Milestone reactivation. Prior history is
            preserved and governed commands are active again.
          </div>
        ) : scenario === "archived" ? (
          <div className="rounded-lg border border-dashed bg-muted/45 px-3 py-2 text-sm">
            This Build collaboration archive is read-only. Content, reports, and
            evidence remain viewable; shared writes are disabled.
          </div>
        ) : null}
        {milestone ? <MilestoneHeadline /> : null}
        {collapsed ? (
          <div className="space-y-2 border-t pt-3">
            {milestone ? <MilestoneSummary items={items} /> : null}
            <div className="flex flex-wrap gap-1.5">
              {milestone ? (
                <>
                  <Badge variant="info">
                    <PlayCircle className="mr-1 size-3" /> 53% complete
                  </Badge>
                  <Badge variant="warning">
                    <AlertTriangle className="mr-1 size-3" />{" "}
                    {behindScheduleCount} behind
                  </Badge>
                  <Badge variant="outline">
                    <Users className="mr-1 size-3" /> 7 participants
                  </Badge>
                  <Badge variant="outline">
                    <ListChecks className="mr-1 size-3" /> {items.length - 1}{" "}
                    outstanding
                  </Badge>
                  <Badge variant="outline">
                    <CalendarCheck className="mr-1 size-3" /> 1 active visit
                  </Badge>
                  <Badge variant="secondary">
                    <Activity className="mr-1 size-3" /> {reviewCount + 2} new
                    updates
                  </Badge>
                </>
              ) : (
                <>
                  <Badge variant="warning">{drawStateLabel(drawState)}</Badge>
                  <Badge variant="outline">
                    <Banknote className="mr-1 size-3" /> $184,000 requested
                  </Badge>
                  <Badge variant="outline">0 generated items</Badge>
                </>
              )}
            </div>
          </div>
        ) : (
          children
        )}
      </CardPanel>
      {collapsed ? null : (
        <>
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
              onClick={() =>
                setPostTab(postTab === "actions" ? null : "actions")
              }
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
                    Replies, mentions, rich text, attachments, revision history,
                    and unread state use the existing post thread.
                  </p>
                  <Button
                    disabled={!collaborationWritable}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Reply to thread
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="font-medium text-sm">
                    {milestone
                      ? workflowWritable
                        ? "Governed work is summarized in the System Post above."
                        : "Governed work is preserved as a read-only projection."
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
        </>
      )}
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
