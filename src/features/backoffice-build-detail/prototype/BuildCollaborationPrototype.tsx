"use client";

import {
  AtSign,
  Building2,
  CalendarClock,
  Check,
  ChevronRight,
  CircleDot,
  ClipboardList,
  Eye,
  FileText,
  Filter,
  Flag,
  HardHat,
  List,
  LockKeyhole,
  MessageCircle,
  MoreHorizontal,
  Paperclip,
  Pin,
  Plus,
  Search,
  ShieldCheck,
  SquareKanban,
  Users,
  Workflow,
} from "lucide-react";
import type { ReactNode } from "react";

import {
  type PrototypeVariant,
  PrototypeVariantSwitcher,
} from "#/components/prototype/PrototypeVariantSwitcher.tsx";
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
import { Tabs, TabsList, TabsPanel, TabsTab } from "#/components/ui/tabs.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import { cn } from "#/lib/utils.ts";
import { InteractiveFamiliarFeedPrototype } from "./InteractiveFamiliarFeedPrototype.tsx";

/**
 * PROTOTYPE — THROWAWAY.
 * Three collaboration variants, switchable with ?variant=, on the isolated
 * /prototype/build-collaboration route.
 */

export type BuildCollaborationVariant = "A" | "B" | "C";

const PROTOTYPE_VARIANTS = [
  { key: "A", name: "Interactive familiar feed" },
  { key: "B", name: "Audience rooms" },
  { key: "C", name: "Context workstreams" },
] as const satisfies readonly PrototypeVariant[];

export function isBuildCollaborationVariant(
  value: unknown
): value is BuildCollaborationVariant {
  return value === "A" || value === "B" || value === "C";
}

export function BuildCollaborationPrototype({
  onVariantChange,
  variant,
}: {
  onVariantChange: (variant: string) => void;
  variant: BuildCollaborationVariant;
}) {
  return (
    <main className="min-h-svh bg-muted/30 px-3 py-4 pb-28 text-foreground sm:px-5 lg:px-7">
      <div className="mx-auto flex max-w-[1560px] flex-col gap-4">
        <PrototypeHeader variant={variant} />
        <ExistingBuildOverview />
        {variant === "A" ? <InteractiveFamiliarFeedPrototype /> : null}
        {variant === "B" ? <AudienceRoomsVariant /> : null}
        {variant === "C" ? <ContextWorkstreamsVariant /> : null}
      </div>
      <PrototypeVariantSwitcher
        current={variant}
        onChange={onVariantChange}
        variants={PROTOTYPE_VARIANTS}
      />
    </main>
  );
}

function PrototypeHeader({ variant }: { variant: BuildCollaborationVariant }) {
  const decision =
    variant === "A"
      ? "Does this feed make daily coordination feel obvious, accountable, and safely permissioned?"
      : variant === "B"
        ? "Do explicit rooms prevent disclosure without fragmenting the build?"
        : "Does navigating by work context make collaboration more actionable?";

  return (
    <Frame>
      <FramePanel className="flex flex-col gap-4 p-4 lg:flex-row lg:items-end lg:justify-between lg:p-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="warning">Throwaway prototype</Badge>
            <Badge variant="outline">Live Build · Home</Badge>
          </div>
          <h1 className="mt-3 text-balance font-semibold text-2xl tracking-tight md:text-3xl">
            1480 St. Clair Ave W
          </h1>
          <p className="mt-1 max-w-3xl text-muted-foreground text-sm">
            Permission-aware collaboration for the builder, homeowner,
            contractors, and lender team.
          </p>
        </div>
        <div className="max-w-xl rounded-lg border border-dashed bg-muted/40 px-3 py-2">
          <p className="font-medium text-xs">Question this variant answers</p>
          <p className="mt-1 text-muted-foreground text-sm">{decision}</p>
        </div>
      </FramePanel>
    </Frame>
  );
}

function ExistingBuildOverview() {
  return (
    <Frame data-testid="prototype-existing-build-overview">
      <FramePanel className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-5">
          <div>
            <p className="font-semibold text-sm">Build Overview</p>
            <p className="text-muted-foreground text-xs">
              Existing production region—outside the prototype.
            </p>
          </div>
          <Badge variant="outline">Remains unchanged</Badge>
        </div>
        <Tabs className="gap-0" defaultValue="current">
          <TabsList className="mx-4 mt-2 sm:mx-5" variant="underline">
            <TabsTab value="current">Current</TabsTab>
            <TabsTab value="draws">Draws</TabsTab>
            <TabsTab value="build">Build</TabsTab>
            <TabsTab value="loan">Loan</TabsTab>
          </TabsList>
          <TabsPanel className="p-4 pt-3 sm:p-5 sm:pt-3" value="current">
            <div className="grid gap-3 lg:grid-cols-[1.15fr_0.85fr]">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="info">In progress</Badge>
                  <span className="font-semibold">
                    Foundation &amp; footings
                  </span>
                </div>
                <p className="mt-2 max-w-3xl text-muted-foreground text-sm">
                  Current milestone, draw readiness, completion authority, and
                  existing operational controls remain exactly where they are.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <Metric label="Complete" value="38%" />
                <Metric label="Next draw" value="$184k" />
                <Metric label="Open visits" value="1" />
              </div>
            </div>
          </TabsPanel>
          <TabsPanel className="p-4 sm:p-5" value="draws">
            <p className="text-muted-foreground text-sm">
              Existing draw summary. Capital and Term Requests will move into
              this sub-tab.
            </p>
          </TabsPanel>
          <TabsPanel className="p-4 sm:p-5" value="build">
            <p className="text-muted-foreground text-sm">
              Existing non-financial build metadata remains unchanged.
            </p>
          </TabsPanel>
          <TabsPanel className="p-4 sm:p-5" value="loan">
            <p className="text-muted-foreground text-sm">
              Existing loan details remain unchanged.
            </p>
          </TabsPanel>
        </Tabs>
      </FramePanel>
    </Frame>
  );
}

export function FamiliarFeedVariant() {
  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <section className="flex min-w-0 flex-col gap-4">
        <Card>
          <CardHeader className="grid-cols-[auto_1fr] gap-3 p-4">
            <PersonAvatar initials="CO" tone="blue" />
            <div className="min-w-0">
              <CardTitle className="text-sm">Share an update</CardTitle>
              <CardDescription className="text-xs">
                Post to everyone or choose who can participate.
              </CardDescription>
            </div>
          </CardHeader>
          <CardPanel className="p-4 pt-0">
            <Textarea
              aria-label="Prototype post composer"
              placeholder="What should everyone know about this build?"
            />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline">
                <Users />
                Everyone on this build
              </Button>
              <Button size="sm" variant="ghost">
                <AtSign />
                Mention
              </Button>
              <Button size="sm" variant="ghost">
                <Paperclip />
                Attach build item
              </Button>
              <Button className="ml-auto" size="sm">
                Post
              </Button>
            </div>
          </CardPanel>
        </Card>

        <Card render={<article />}>
          <CardHeader className="grid-cols-[auto_1fr_auto] gap-3 p-4">
            <PersonAvatar initials="AC" tone="amber" />
            <div className="min-w-0">
              <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
                Alex Chen
                <span className="font-normal text-muted-foreground">
                  · Builder PM
                </span>
              </CardTitle>
              <CardDescription className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                Today, 10:42 AM
                <AudienceBadge label="Builder + lender teams" />
              </CardDescription>
            </div>
            <Button aria-label="Post options" size="icon-sm" variant="ghost">
              <MoreHorizontal />
            </Button>
          </CardHeader>
          <CardPanel className="p-4 pt-0">
            <p className="text-sm leading-6">
              Footing inspection is complete.{" "}
              <span className="font-medium text-primary">@Maya Singh</span>, the
              engineer’s seal is the final dependency before Draw 3 can move
              forward.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <EntityChip icon={<Eye />} label="Site Visit SV-18" />
              <EntityChip icon={<Building2 />} label="Foundation · 92%" />
              <EntityChip icon={<FileText />} label="Inspection report" />
            </div>
          </CardPanel>
          <CardFooter className="block border-t p-0">
            <Tabs defaultValue="discussion">
              <TabsList
                className="w-full justify-start px-4"
                variant="underline"
              >
                <TabsTab value="discussion">
                  <MessageCircle />
                  Discussion 12
                </TabsTab>
                <TabsTab value="actions">
                  <ClipboardList />
                  Action Items 3
                </TabsTab>
              </TabsList>
              <TabsPanel className="p-4" value="discussion">
                <PinnedReply />
                <Comment
                  author="Maya Singh"
                  body="I have the engineer’s revised PDF. Uploading it against the site visit now."
                  initials="MS"
                  tone="violet"
                >
                  <Comment
                    author="Priya Raman"
                    body="Once it lands, I can finish the lender review today."
                    initials="PR"
                    nested
                    tone="blue"
                  />
                </Comment>
                <Button className="mt-2" size="sm" variant="ghost">
                  View 10 more comments
                </Button>
              </TabsPanel>
              <TabsPanel className="p-4" value="actions">
                <ActionList />
              </TabsPanel>
            </Tabs>
          </CardFooter>
        </Card>

        <RestrictedSlot label="This update is limited to other build participants." />

        <Card render={<article />}>
          <CardHeader className="grid-cols-[auto_1fr_auto] gap-3 p-4">
            <PersonAvatar initials="MR" tone="green" />
            <div>
              <CardTitle className="text-sm">Marco Ruiz · Contractor</CardTitle>
              <CardDescription className="mt-1 text-xs">
                Yesterday, 4:18 PM · Everyone on this build
              </CardDescription>
            </div>
            <Pin className="size-4 text-primary" />
          </CardHeader>
          <CardPanel className="p-4 pt-0">
            <p className="text-sm leading-6">
              Concrete delivery has moved to Thursday at 7:30 AM. Access from
              the west lane needs to remain clear.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <EntityChip icon={<CalendarClock />} label="Concrete delivery" />
              <EntityChip icon={<HardHat />} label="Foundation crew" />
            </div>
          </CardPanel>
        </Card>
      </section>

      <aside className="flex flex-col gap-4 xl:sticky xl:top-4">
        <RailSection icon={<Pin />} subtitle="3 visible posts" title="Pinned">
          <RailLink label="Site access rules" meta="Pinned by Alex" />
          <RailLink label="Draw 3 sign-off" meta="2 open actions" />
        </RailSection>
        <RailSection icon={<Flag />} subtitle="5 open" title="My Action Items">
          <ActionRow
            code="DF-184"
            label="Upload stamped report"
            status="Blocked"
          />
          <ActionRow code="DF-190" label="Book site revisit" status="Todo" />
        </RailSection>
        <RailSection icon={<Users />} subtitle="18 people" title="Participants">
          <AvatarStack />
          <Button className="mt-3 w-full" size="sm" variant="outline">
            View everyone
          </Button>
        </RailSection>
      </aside>
    </div>
  );
}

function AudienceRoomsVariant() {
  const rooms = [
    ["Everyone on this Build", "3", "18"],
    ["Builder Team", "1", "6"],
    ["Lender & Broker Team", "4", "8"],
    ["Homeowner Coordination", "", "4"],
    ["Contractor Coordination", "2", "11"],
  ] as const;

  return (
    <Frame className="overflow-hidden">
      <div className="grid min-h-[720px] xl:grid-cols-[17rem_minmax(0,1fr)_19rem]">
        <FramePanel className="rounded-r-none rounded-b-none border-r-0 p-3 xl:rounded-bl-xl">
          <div className="flex items-center justify-between px-2 py-2">
            <div>
              <p className="font-semibold text-sm">Collaboration rooms</p>
              <p className="text-muted-foreground text-xs">10 unread</p>
            </div>
            <Button aria-label="Room filters" size="icon-sm" variant="ghost">
              <Filter />
            </Button>
          </div>
          <div className="mt-2 flex flex-col gap-1">
            {rooms.map(([label, unread, people]) => {
              const selected = label === "Lender & Broker Team";
              return (
                <Button
                  className={cn(
                    "h-auto justify-start gap-3 px-2 py-2.5 text-left",
                    selected && "bg-primary/10 text-foreground"
                  )}
                  key={label}
                  variant="ghost"
                >
                  <span
                    className={cn(
                      "flex size-8 items-center justify-center rounded-lg bg-muted",
                      selected && "bg-primary/15 text-primary"
                    )}
                  >
                    {selected ? <ShieldCheck /> : <Users />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{label}</span>
                    <span className="block text-muted-foreground text-xs">
                      {people} people
                    </span>
                  </span>
                  {unread ? <Badge variant="info">{unread}</Badge> : null}
                </Button>
              );
            })}
          </div>
          <div className="mt-4 border-t px-2 pt-4">
            <Button className="w-full justify-start" size="sm" variant="ghost">
              <Pin />
              Pinned across my rooms
            </Button>
            <Button className="w-full justify-start" size="sm" variant="ghost">
              <Plus />
              Manage rooms
            </Button>
          </div>
        </FramePanel>

        <FramePanel className="rounded-none border-r-0 p-0">
          <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-semibold text-lg">
                  Lender &amp; Broker Team
                </h2>
                <Badge variant="warning">
                  <LockKeyhole />
                  Private room
                </Badge>
              </div>
              <p className="mt-1 text-muted-foreground text-xs">
                Credit, compliance, draw review, and lender-side coordination.
              </p>
            </div>
            <Button size="sm" variant="outline">
              <Eye />
              View 8 people
            </Button>
          </div>

          <div className="flex flex-col gap-4 p-4">
            <Card className="border-primary/25 bg-primary/3">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <ShieldCheck className="size-4 text-primary" />
                  Posting to Lender &amp; Broker Team
                </CardTitle>
                <CardDescription className="text-xs">
                  Only the eight people shown in this room can view this post,
                  its replies, or its Action Items.
                </CardDescription>
              </CardHeader>
              <CardPanel className="p-4 pt-2">
                <Textarea
                  aria-label="Room post composer"
                  placeholder="Share a private lender-side update…"
                />
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="ghost">
                    <AtSign />
                    Mention
                  </Button>
                  <Button size="sm" variant="ghost">
                    <Paperclip />
                    Attach build item
                  </Button>
                  <Button className="ml-auto" size="sm" variant="outline">
                    Preview audience
                  </Button>
                  <Button size="sm">Post to room</Button>
                </div>
              </CardPanel>
            </Card>

            <Card render={<article />}>
              <CardHeader className="grid-cols-[auto_1fr_auto] gap-3 p-4">
                <PersonAvatar initials="PR" tone="blue" />
                <div>
                  <CardTitle className="text-sm">
                    Priya Raman · Lender Operations
                  </CardTitle>
                  <CardDescription className="mt-1 text-xs">
                    Today, 11:08 AM · Lender &amp; Broker Team
                  </CardDescription>
                </div>
                <Pin className="size-4 text-primary" />
              </CardHeader>
              <CardPanel className="p-4 pt-0">
                <p className="text-sm leading-6">
                  Draw 3 cannot advance until the revised site-visit report is
                  countersigned. I’ve added the approval steps below.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <EntityChip icon={<Eye />} label="Site Visit SV-18" />
                  <EntityChip icon={<Building2 />} label="Draw 3" />
                </div>
              </CardPanel>
              <CardFooter className="block border-t p-0">
                <Tabs defaultValue="actions">
                  <TabsList
                    className="w-full justify-start px-4"
                    variant="underline"
                  >
                    <TabsTab value="discussion">Discussion 6</TabsTab>
                    <TabsTab value="actions">Action Items 3</TabsTab>
                  </TabsList>
                  <TabsPanel className="p-4" value="discussion">
                    <Comment
                      author="Jules Mercer"
                      body="I’ll own the approval once the report is uploaded."
                      initials="JM"
                      tone="amber"
                    />
                    <RestrictedSlot
                      compact
                      label="Restricted reply — you do not have permission to view this."
                    />
                  </TabsPanel>
                  <TabsPanel className="p-4" value="actions">
                    <p className="mb-3 flex items-center gap-2 text-muted-foreground text-xs">
                      <LockKeyhole className="size-3.5" />
                      Visibility inherited from Lender &amp; Broker Team
                    </p>
                    <ActionList />
                  </TabsPanel>
                </Tabs>
              </CardFooter>
            </Card>
          </div>
        </FramePanel>

        <FramePanel className="rounded-l-none rounded-tr-none p-4 xl:rounded-tr-xl">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-primary" />
            <p className="font-semibold text-sm">Audience inspector</p>
          </div>
          <p className="mt-2 text-muted-foreground text-xs leading-5">
            This room is governed by a versioned access policy. Replies and
            Action Items cannot choose a wider audience.
          </p>
          <div className="mt-4">
            <AvatarStack />
            <p className="mt-3 font-medium text-sm">8 current participants</p>
            <p className="text-muted-foreground text-xs">
              3 lender staff · 2 admins · 2 brokers · 1 broker staff
            </p>
          </div>
          <div className="mt-5 border-t pt-4">
            <p className="font-semibold text-xs">Room state</p>
            <dl className="mt-3 grid gap-2 text-xs">
              <StateRow label="Policy version" value="v12" />
              <StateRow label="Pinned posts" value="2" />
              <StateRow label="Open actions" value="7" />
              <StateRow label="History access" value="Current members" />
            </dl>
          </div>
          <Button className="mt-5 w-full" size="sm" variant="outline">
            Manage room policy
          </Button>
        </FramePanel>
      </div>
    </Frame>
  );
}

function ContextWorkstreamsVariant() {
  const workstreams = [
    ["Foundation inspection", "Decision required", "3"],
    ["Draw 3 evidence", "Blocked", "2"],
    ["Framing", "Active", "4"],
    ["Concrete delivery", "Due soon", "1"],
    ["Site visit · Aug 12", "Active", "3"],
  ] as const;

  return (
    <Frame className="overflow-hidden">
      <div className="grid min-h-[760px] xl:grid-cols-[18rem_minmax(0,1fr)_21rem]">
        <FramePanel className="rounded-r-none rounded-b-none border-r-0 p-3 xl:rounded-bl-xl">
          <div className="px-2 py-2">
            <p className="font-semibold text-sm">Workstreams</p>
            <p className="text-muted-foreground text-xs">
              Collaboration grouped by build context
            </p>
          </div>
          <Button className="mt-2 w-full justify-start" variant="outline">
            <Search />
            Search work
          </Button>
          <div className="mt-4">
            <p className="px-2 font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
              Needs attention
            </p>
            <div className="mt-2 flex flex-col gap-1">
              {workstreams.map(([label, status, count], index) => (
                <Button
                  className={cn(
                    "h-auto items-start justify-start gap-3 px-2 py-2.5 text-left",
                    index === 0 && "bg-primary/10 text-foreground"
                  )}
                  key={label}
                  variant="ghost"
                >
                  <CircleDot
                    className={cn(
                      "mt-0.5 size-4",
                      status === "Blocked"
                        ? "text-destructive"
                        : status === "Decision required"
                          ? "text-warning-foreground"
                          : "text-primary"
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{label}</span>
                    <span className="block text-muted-foreground text-xs">
                      {status}
                    </span>
                  </span>
                  <Badge variant="outline">{count}</Badge>
                </Button>
              ))}
            </div>
          </div>
          <div className="mt-4 border-t px-2 pt-4">
            <p className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
              Filter by context
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge variant="info">Milestones</Badge>
              <Badge variant="outline">Draws</Badge>
              <Badge variant="outline">Evidence</Badge>
              <Badge variant="outline">Materials</Badge>
            </div>
          </div>
        </FramePanel>

        <FramePanel className="rounded-none border-r-0 p-0">
          <div className="border-b p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="warning">Decision required</Badge>
                  <Badge variant="outline">Milestone</Badge>
                </div>
                <h2 className="mt-2 font-semibold text-xl">
                  Foundation inspection
                </h2>
                <p className="mt-1 text-muted-foreground text-xs">
                  Due Aug 14 · blocks Draw 3 · 6 participants
                </p>
              </div>
              <Button size="sm">
                <Plus />
                Start collaboration
              </Button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <EntityChip icon={<Eye />} label="Site Visit SV-18" />
              <EntityChip icon={<FileText />} label="Evidence EP-204" />
              <EntityChip icon={<Building2 />} label="Draw 3" />
            </div>
          </div>

          <div className="flex flex-col gap-4 p-4">
            <Card className="border-primary/20 bg-primary/3">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Pin className="size-4 text-primary" />
                  Pinned in this workstream
                </CardTitle>
              </CardHeader>
              <CardPanel className="p-4 pt-2">
                <p className="font-medium text-sm">
                  Decision: engineer sign-off is required before lender review.
                </p>
                <p className="mt-1 text-muted-foreground text-xs">
                  Pinned by Priya Raman · 2 linked actions
                </p>
              </CardPanel>
            </Card>

            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline">
                Update
              </Button>
              <Button size="sm" variant="outline">
                Question
              </Button>
              <Button size="sm" variant="outline">
                Decision
              </Button>
              <Button size="sm" variant="outline">
                Blocker
              </Button>
            </div>

            <Card render={<article />}>
              <CardHeader className="grid-cols-[auto_1fr_auto] gap-3 p-4">
                <PersonAvatar initials="AC" tone="amber" />
                <div>
                  <CardTitle className="text-sm">Blocker · Alex Chen</CardTitle>
                  <CardDescription className="mt-1 text-xs">
                    Builder + lender staff · 10:42 AM
                  </CardDescription>
                </div>
                <Badge variant="warning">Blocked</Badge>
              </CardHeader>
              <CardPanel className="p-4 pt-0">
                <p className="text-sm leading-6">
                  The inspection report is missing the engineer’s seal. Draw 3
                  cannot enter review until the corrected report is attached.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <EntityChip icon={<Eye />} label="Site Visit SV-18" />
                  <EntityChip icon={<FileText />} label="Inspection report" />
                </div>
              </CardPanel>
              <CardFooter className="block border-t p-0">
                <Tabs defaultValue="discussion">
                  <TabsList
                    className="w-full justify-start px-4"
                    variant="underline"
                  >
                    <TabsTab value="discussion">Discussion 8</TabsTab>
                    <TabsTab value="actions">Action Items 3</TabsTab>
                    <TabsTab value="work">Linked Work 4</TabsTab>
                  </TabsList>
                  <TabsPanel className="p-4" value="discussion">
                    <Comment
                      author="Marco Ruiz"
                      body="The engineer has the revision and expects to return it by 2 PM."
                      initials="MR"
                      tone="green"
                    >
                      <Comment
                        author="Priya Raman"
                        body="Tag me when it lands and I’ll review immediately."
                        initials="PR"
                        nested
                        tone="blue"
                      />
                    </Comment>
                    <RestrictedSlot
                      compact
                      label="You do not have permission to view this update."
                    />
                  </TabsPanel>
                  <TabsPanel className="p-4" value="actions">
                    <ActionList />
                  </TabsPanel>
                  <TabsPanel className="p-4" value="work">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <LinkedWork label="Draw 3" state="Waiting on evidence" />
                      <LinkedWork label="SV-18" state="Report submitted" />
                      <LinkedWork label="EP-204" state="1 item missing" />
                      <LinkedWork label="Foundation" state="92% complete" />
                    </div>
                  </TabsPanel>
                </Tabs>
              </CardFooter>
            </Card>
          </div>
        </FramePanel>

        <FramePanel className="rounded-l-none rounded-tr-none p-4 xl:rounded-tr-xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-sm">Action docket</p>
              <p className="text-muted-foreground text-xs">
                Foundation inspection
              </p>
            </div>
            <div className="flex gap-1">
              <Button aria-label="List view" size="icon-sm" variant="secondary">
                <List />
              </Button>
              <Button aria-label="Board view" size="icon-sm" variant="ghost">
                <SquareKanban />
              </Button>
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-3">
            <ActionDocketGroup label="Todo">
              <ActionDocketCard
                code="DF-184"
                label="Upload stamped inspection report"
                meta="Maya · Due today"
              />
              <ActionDocketCard
                code="DF-190"
                label="Book follow-up site visit"
                meta="Marco · Tomorrow"
              />
            </ActionDocketGroup>
            <ActionDocketGroup label="In progress">
              <ActionDocketCard
                code="DF-177"
                label="Review foundation photos"
                meta="Priya · High"
              />
            </ActionDocketGroup>
            <ActionDocketGroup label="Done">
              <ActionDocketCard
                code="DF-162"
                label="Confirm concrete pour"
                meta="Completed yesterday"
                muted
              />
            </ActionDocketGroup>
          </div>
          <Button className="mt-4 w-full" size="sm" variant="outline">
            <Plus />
            Action item
          </Button>
        </FramePanel>
      </div>
    </Frame>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold text-sm">{value}</p>
    </div>
  );
}

function PersonAvatar({
  initials,
  tone = "blue",
}: {
  initials: string;
  tone?: "amber" | "blue" | "green" | "violet";
}) {
  return (
    <Avatar className="size-9">
      <AvatarFallback
        className={cn(
          tone === "blue" && "bg-blue-100 text-blue-800",
          tone === "amber" && "bg-amber-100 text-amber-800",
          tone === "green" && "bg-emerald-100 text-emerald-800",
          tone === "violet" && "bg-violet-100 text-violet-800"
        )}
      >
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}

function AudienceBadge({ label }: { label: string }) {
  return (
    <Badge variant="outline">
      <Users />
      {label}
    </Badge>
  );
}

function EntityChip({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <Badge render={<button type="button" />} size="lg" variant="secondary">
      {icon}
      {label}
      <ChevronRight />
    </Badge>
  );
}

function PinnedReply() {
  return (
    <div className="mb-3 flex gap-2 rounded-lg border border-primary/20 bg-primary/4 p-3">
      <Pin className="mt-0.5 size-3.5 shrink-0 text-primary" />
      <div>
        <p className="font-medium text-xs">Pinned reply</p>
        <p className="mt-1 text-muted-foreground text-xs">
          “Lender review can finish the same day the sealed report arrives.”
        </p>
      </div>
    </div>
  );
}

function Comment({
  author,
  body,
  children,
  initials,
  nested = false,
  tone,
}: {
  author: string;
  body: string;
  children?: ReactNode;
  initials: string;
  nested?: boolean;
  tone: "amber" | "blue" | "green" | "violet";
}) {
  return (
    <div className={cn("relative flex gap-3 py-2", nested && "ml-6")}>
      {nested ? (
        <div className="absolute top-0 -left-3 h-full w-px bg-border" />
      ) : null}
      <PersonAvatar initials={initials} tone={tone} />
      <div className="min-w-0 flex-1">
        <div className="rounded-xl bg-muted/55 px-3 py-2">
          <p className="font-medium text-xs">{author}</p>
          <p className="mt-1 text-sm leading-5">{body}</p>
        </div>
        <div className="mt-1 flex gap-3 px-2 text-muted-foreground text-xs">
          <button type="button">Reply</button>
          <button type="button">Pin</button>
          <span>18m</span>
        </div>
        {children}
      </div>
    </div>
  );
}

function RestrictedSlot({
  compact = false,
  label,
}: {
  compact?: boolean;
  label: string;
}) {
  return (
    <Card
      className={cn(
        "border-dashed bg-muted/25 shadow-none",
        compact ? "my-2" : undefined
      )}
      render={<article />}
    >
      <CardPanel
        className={cn("flex items-center gap-3", compact ? "p-3" : "p-4")}
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
          <LockKeyhole className="size-4 text-muted-foreground" />
        </span>
        <div>
          <p className="font-medium text-sm">Restricted update</p>
          <p className="mt-0.5 text-muted-foreground text-xs">{label}</p>
        </div>
      </CardPanel>
    </Card>
  );
}

function ActionList() {
  return (
    <div className="grid gap-2">
      <ActionRow
        code="DF-184"
        label="Upload stamped inspection report"
        status="Blocked"
      />
      <ActionRow
        code="DF-177"
        label="Review foundation photos"
        status="In progress"
      />
      <ActionRow code="DF-190" label="Book follow-up visit" status="Todo" />
    </div>
  );
}

function ActionRow({
  code,
  label,
  status,
}: {
  code: string;
  label: string;
  status: string;
}) {
  return (
    <button
      className="flex w-full items-center gap-3 rounded-lg border bg-background px-3 py-2 text-left hover:bg-muted/35"
      type="button"
    >
      <Flag
        className={cn(
          "size-4 shrink-0",
          status === "Blocked" ? "text-destructive" : "text-primary"
        )}
      />
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] text-muted-foreground">{code}</span>
        <span className="block truncate text-sm">{label}</span>
      </span>
      <Badge
        variant={
          status === "Blocked"
            ? "error"
            : status === "In progress"
              ? "info"
              : "outline"
        }
      >
        {status}
      </Badge>
    </button>
  );
}

function RailSection({
  children,
  icon,
  subtitle,
  title,
}: {
  children: ReactNode;
  icon: ReactNode;
  subtitle: string;
  title: string;
}) {
  return (
    <Frame>
      <FramePanel className="p-4">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 text-primary [&>svg]:size-4">{icon}</span>
          <div>
            <p className="font-semibold text-sm">{title}</p>
            <p className="text-muted-foreground text-xs">{subtitle}</p>
          </div>
        </div>
        <div className="mt-3">{children}</div>
      </FramePanel>
    </Frame>
  );
}

function RailLink({ label, meta }: { label: string; meta: string }) {
  return (
    <button
      className="flex w-full items-center gap-2 border-b py-2 text-left last:border-b-0"
      type="button"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">{label}</span>
        <span className="block text-muted-foreground text-xs">{meta}</span>
      </span>
      <ChevronRight className="size-4 text-muted-foreground" />
    </button>
  );
}

function AvatarStack() {
  const people = [
    ["CO", "blue"],
    ["AC", "amber"],
    ["MR", "green"],
    ["MS", "violet"],
  ] as const;
  return (
    <div className="flex -space-x-2">
      {people.map(([initials, tone]) => (
        <div className="rounded-full border-2 border-background" key={initials}>
          <PersonAvatar initials={initials} tone={tone} />
        </div>
      ))}
      <Avatar className="size-9 border-2 border-background">
        <AvatarFallback>+14</AvatarFallback>
      </Avatar>
    </div>
  );
}

function StateRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

function LinkedWork({ label, state }: { label: string; state: string }) {
  return (
    <Card render={<button type="button" />}>
      <CardPanel className="flex items-center gap-3 p-3 text-left">
        <Workflow className="size-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-sm">{label}</span>
          <span className="block truncate text-muted-foreground text-xs">
            {state}
          </span>
        </span>
        <ChevronRight className="size-4 text-muted-foreground" />
      </CardPanel>
    </Card>
  );
}

function ActionDocketGroup({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div>
      <p className="mb-2 font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
        {label}
      </p>
      <div className="grid gap-2">{children}</div>
    </div>
  );
}

function ActionDocketCard({
  code,
  label,
  meta,
  muted = false,
}: {
  code: string;
  label: string;
  meta: string;
  muted?: boolean;
}) {
  return (
    <Card
      className={cn("rounded-xl shadow-none", muted && "opacity-60")}
      render={<button type="button" />}
    >
      <CardPanel className="p-3 text-left">
        <div className="flex items-center gap-2">
          {muted ? (
            <Check className="size-3.5 text-success-foreground" />
          ) : (
            <Flag className="size-3.5 text-primary" />
          )}
          <span className="text-[11px] text-muted-foreground">{code}</span>
        </div>
        <p className="mt-2 text-sm leading-5">{label}</p>
        <p className="mt-1 text-muted-foreground text-xs">{meta}</p>
      </CardPanel>
    </Card>
  );
}
