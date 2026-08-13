import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Clock3,
  FileCheck2,
  FileText,
  HelpCircle,
  MapPin,
  MessageSquareText,
  Search,
  ShieldCheck,
  Sparkles,
  Wrench,
  X,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import type {
  SidebarNavGroup,
  SidebarNavItem,
} from "#/components/app-shared.tsx";
import { AppShell } from "#/components/app-shell.tsx";
import { Badge, type BadgeProps } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Card } from "#/components/ui/card.tsx";
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "#/components/ui/collapsible.tsx";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "#/components/ui/frame.tsx";
import {
  NativeSelect,
  NativeSelectOption,
} from "#/components/ui/native-select.tsx";
import {
  Progress,
  ProgressIndicator,
  ProgressTrack,
} from "#/components/ui/progress.tsx";
import { Separator } from "#/components/ui/separator.tsx";
import {
  contractorNavGroups,
  footerNavLinks,
} from "#/features/contractor/contractorNav.tsx";
import { cn } from "#/lib/utils.ts";

// Three throwaway directions for Contractor Assigned Work, switchable on the
// /prototype/contractor-work route with ?variant=A through C.
export type ContractorWorkPrototypeVariant = "A" | "B" | "C";

export function isContractorWorkPrototypeVariant(
  value: unknown
): value is ContractorWorkPrototypeVariant {
  return value === "A" || value === "B" || value === "C";
}

type AssignmentKind = "build" | "proposal";
type AcknowledgementState =
  | "pending"
  | "accepted"
  | "clarification"
  | "declined";
type EvidenceState =
  | "not_started"
  | "in_progress"
  | "submitted"
  | "changes_requested"
  | "accepted"
  | "not_required";
type IssueState = "none" | "open" | "waiting_on_builder" | "resolved";

interface Assignment {
  acknowledgement: AcknowledgementState;
  assignmentLabel: string;
  buildId: string;
  changedFields?: string[];
  dateBucket: "today" | "next" | "later";
  evidence: EvidenceState;
  evidenceDetail: string;
  id: string;
  issue: IssueState;
  issueDetail?: string;
  milestone: string;
  nextAction: string;
  role: string;
  scope: string;
  stale?: boolean;
  subMilestone: string;
  window: string;
}

interface WorkGroup {
  address: string;
  assignments: Assignment[];
  builderContact: string;
  id: string;
  kind: AssignmentKind;
  name: string;
  permit?: string;
  plannedDateRange: string;
  revision: string;
}

const groups: WorkGroup[] = [
  {
    id: "harbour",
    kind: "build",
    name: "Harbourview Row Homes",
    address: "1187 Lake Shore Blvd W, Toronto",
    permit: "BLD-24-01872",
    plannedDateRange: "Aug 12, 2026 to Feb 19, 2027",
    builderContact: "Avery Chen · Northline Developments",
    revision: "Roadmap revision 12 · Aug 11",
    assignments: [
      {
        id: "windows-doors",
        buildId: "harbour",
        assignmentLabel: "Labour + materials assignment",
        milestone: "Building envelope",
        subMilestone: "Windows and exterior doors",
        role: "Glazing contractor",
        scope:
          "Supply and install 42 thermally broken window units, six exterior door assemblies, sill pans, perimeter membranes, and interior air seals.",
        window: "Mobilize Aug 14 · Complete Sep 04",
        acknowledgement: "pending",
        evidence: "not_started",
        evidenceDetail: "Pre-install photos and delivery tickets required",
        issue: "none",
        nextAction: "Respond by today, 4:00 PM",
        dateBucket: "today",
      },
      {
        id: "roofing",
        buildId: "harbour",
        assignmentLabel: "Labour assignment",
        milestone: "Building envelope",
        subMilestone: "Roof membrane and flashing",
        role: "Roofing contractor",
        scope:
          "Install two-ply modified bitumen membrane, parapet flashing, roof drains, and service penetrations across four blocks.",
        window: "Aug 18 to Aug 29",
        acknowledgement: "accepted",
        evidence: "changes_requested",
        evidenceDetail: "Add close-up photos at the west parapet termination",
        issue: "waiting_on_builder",
        issueDetail: "Builder confirming revised drain curb detail",
        nextAction: "Evidence update due Aug 13",
        dateBucket: "today",
      },
      {
        id: "cladding",
        buildId: "harbour",
        assignmentLabel: "Labour assignment",
        milestone: "Exterior finishes",
        subMilestone: "Masonry and panel cladding",
        role: "Envelope contractor",
        scope:
          "Install brick veneer, fibre cement panels, flashings, and sealants to the issued exterior elevation package.",
        window: "Sep 08 to Oct 02",
        acknowledgement: "accepted",
        evidence: "not_started",
        evidenceDetail: "Mock-up review required before production installation",
        issue: "none",
        nextAction: "Starts in 27 days",
        dateBucket: "later",
        stale: true,
        changedFields: ["South elevation sequencing", "Start date +3 days"],
      },
    ],
  },
  {
    id: "kingston",
    kind: "build",
    name: "Kingston Road Infill",
    address: "904 Kingston Rd, Toronto",
    permit: "BLD-25-00641",
    plannedDateRange: "Jul 06, 2026 to Dec 18, 2026",
    builderContact: "Morgan Patel · Junction Build Co.",
    revision: "Roadmap revision 8 · Aug 09",
    assignments: [
      {
        id: "rough-in",
        buildId: "kingston",
        assignmentLabel: "Labour assignment",
        milestone: "Mechanical rough-in",
        subMilestone: "Domestic water and drainage rough-in",
        role: "Plumbing contractor",
        scope:
          "Complete domestic water, sanitary, venting, and fixture carrier rough-in for six dwelling units.",
        window: "Aug 12 to Aug 22",
        acknowledgement: "accepted",
        evidence: "in_progress",
        evidenceDetail: "8 of 14 required field records added",
        issue: "open",
        issueDetail: "Sleeve conflict at Unit 3 requires clarification",
        nextAction: "Resolve field issue today",
        dateBucket: "today",
      },
      {
        id: "fixtures",
        buildId: "kingston",
        assignmentLabel: "Labour + materials assignment",
        milestone: "Interior completion",
        subMilestone: "Plumbing fixture installation",
        role: "Plumbing contractor",
        scope:
          "Supply and install scheduled plumbing fixtures, trim, isolation valves, and final connections for six units.",
        window: "Nov 02 to Nov 13",
        acknowledgement: "accepted",
        evidence: "not_required",
        evidenceDetail: "Evidence becomes available when work starts",
        issue: "none",
        nextAction: "Future assignment",
        dateBucket: "later",
      },
    ],
  },
  {
    id: "cedar",
    kind: "proposal",
    name: "Cedar Street Fourplex",
    address: "61 Cedar St, Guelph",
    plannedDateRange: "Proposed Oct 05 to Nov 13, 2026",
    builderContact: "Taylor Brooks · Fieldstone Homes",
    revision: "Proposal plan revision 4 · Aug 10",
    assignments: [
      {
        id: "proposal-electrical",
        buildId: "cedar",
        assignmentLabel: "Planning assignment",
        milestone: "Services planning",
        subMilestone: "Electrical service and rough-in",
        role: "Electrical contractor",
        scope:
          "Review the proposed service, suite distribution, panel schedule, and rough-in allowance before the Build is activated.",
        window: "Planning response due Aug 18",
        acknowledgement: "clarification",
        evidence: "not_required",
        evidenceDetail: "Execution evidence is unavailable during proposal planning",
        issue: "waiting_on_builder",
        issueDetail: "Waiting for proposed electrical room dimensions",
        nextAction: "Builder response expected Aug 14",
        dateBucket: "next",
      },
    ],
  },
];

const variantMeta: Record<
  ContractorWorkPrototypeVariant,
  { description: string; label: string }
> = {
  A: {
    label: "Action Command Center",
    description: "Urgent responses lead, with one selected assignment dossier.",
  },
  B: {
    label: "Build Assignment Docket",
    description: "Each Build keeps its complete assignment and plan record.",
  },
  C: {
    label: "Field Shift",
    description: "Today and the next 14 days form one chronological duty log.",
  },
};

const prototypeVariants: ContractorWorkPrototypeVariant[] = ["A", "B", "C"];

const prototypeNavGroups: SidebarNavGroup[] = contractorNavGroups.map(
  (group) => {
    const quotesItem: SidebarNavItem = {
      title: "Quotes",
      to: "/prototype/contractor-quotes" as never,
      icon: <FileText className="size-4" />,
      matchPrefix: true,
    };
    return {
      ...group,
      items: group.items.flatMap((item) =>
        item.title === "Work"
          ? [
              quotesItem,
              {
                ...item,
                to: "/prototype/contractor-work" as never,
                matchPrefix: true,
              },
            ]
          : [item]
      ),
    };
  }
);

export interface ContractorWorkWorkspacePrototypeProps {
  onVariantChange: (variant: ContractorWorkPrototypeVariant) => void;
  variant: ContractorWorkPrototypeVariant;
}

export function ContractorWorkWorkspacePrototype({
  onVariantChange,
  variant,
}: ContractorWorkWorkspacePrototypeProps) {
  const allAssignments = useMemo(
    () => groups.flatMap((group) => group.assignments),
    []
  );
  const [acknowledgements, setAcknowledgements] = useState<
    Record<string, AcknowledgementState>
  >(() =>
    Object.fromEntries(
      allAssignments.map((assignment) => [
        assignment.id,
        assignment.acknowledgement,
      ])
    )
  );
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set(["windows-doors"])
  );
  const [filter, setFilter] = useState("all");
  const [notice, setNotice] = useState(
    "Prototype state: pending work responses are available without changing Budget or Roadmap state."
  );
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("windows-doors");

  const currentGroups = useMemo(
    () =>
      groups
        .map((group) => ({
          ...group,
          assignments: group.assignments.filter((assignment) => {
            const acknowledgement = acknowledgements[assignment.id];
            const haystack = `${group.name} ${group.address} ${assignment.milestone} ${assignment.subMilestone} ${assignment.role}`.toLowerCase();
            const matchesSearch = haystack.includes(search.toLowerCase());
            const matchesFilter =
              filter === "all" ||
              (filter === "response" &&
                (acknowledgement === "pending" ||
                  acknowledgement === "clarification")) ||
              (filter === "active" &&
                group.kind === "build" && acknowledgement === "accepted") ||
              (filter === "planning" && group.kind === "proposal") ||
              (filter === "issues" && assignment.issue !== "none");
            return matchesSearch && matchesFilter;
          }),
        }))
        .filter((group) => group.assignments.length > 0),
    [acknowledgements, filter, search]
  );

  const selected =
    allAssignments.find((assignment) => assignment.id === selectedId) ??
    allAssignments[0];
  const selectedGroup =
    groups.find((group) => group.id === selected.buildId) ?? groups[0];

  const toggleExpanded = (id: string) => {
    setExpandedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const respond = (
    assignment: Assignment,
    acknowledgement: AcknowledgementState
  ) => {
    setAcknowledgements((previous) => ({
      ...previous,
      [assignment.id]: acknowledgement,
    }));
    setSelectedId(assignment.id);
    setExpandedIds((previous) => new Set(previous).add(assignment.id));
    setNotice(
      acknowledgement === "accepted"
        ? `${assignment.subMilestone} accepted. The assignment is now active in Work and Schedule.`
        : acknowledgement === "clarification"
          ? `Clarification requested for ${assignment.subMilestone}. The assignment remains pending.`
          : `${assignment.subMilestone} declined. The response is recorded for Builder and Backoffice review.`
    );
  };

  return (
    <AppShell
      contentClassName="bg-muted/30"
      sidebar={{
        brand: {
          label: "DrawFlow Contractor",
          to: "/prototype/contractor-work" as never,
        },
        footerLinks: footerNavLinks,
        groups: prototypeNavGroups,
      }}
    >
      <main className="min-h-full bg-muted/30 px-4 py-5 pb-24 sm:px-6 lg:px-8 lg:py-8 lg:pb-24">
        <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-6">
          <PrototypeHeader
            filter={filter}
            onFilterChange={setFilter}
            search={search}
            setSearch={setSearch}
          />

          <div
            aria-live="polite"
            className="flex items-start gap-2 rounded-xl border border-border/70 bg-background/65 px-3 py-2 text-muted-foreground text-xs shadow-xs/5 sm:items-center"
          >
            <Sparkles className="mt-0.5 size-3.5 shrink-0 text-primary sm:mt-0" />
            <span>{notice}</span>
            <span className="ml-auto hidden shrink-0 font-medium text-foreground/45 uppercase tracking-[0.16em] sm:inline">
              Prototype only
            </span>
          </div>

          {currentGroups.length === 0 ? (
            <Frame>
              <FramePanel className="py-12 text-center">
                <Search className="mx-auto size-5 text-muted-foreground" />
                <h2 className="mt-3 font-semibold">No matching assignments</h2>
                <p className="mx-auto mt-1 max-w-md text-muted-foreground text-sm">
                  Clear the search or choose another work state. Your assignment
                  record has not changed.
                </p>
                <Button
                  className="mt-4"
                  onClick={() => {
                    setFilter("all");
                    setSearch("");
                  }}
                  variant="outline"
                >
                  Clear filters
                </Button>
              </FramePanel>
            </Frame>
          ) : null}

          {variant === "A" && currentGroups.length > 0 ? (
            <ActionCommandCenter
              acknowledgements={acknowledgements}
              assignments={currentGroups.flatMap((group) => group.assignments)}
              groups={currentGroups}
              onRespond={respond}
              onSelect={(assignment) => {
                setSelectedId(assignment.id);
                setNotice(
                  `${assignment.subMilestone} selected. Its assignment record is open.`
                );
              }}
              selected={selected}
              selectedGroup={selectedGroup}
            />
          ) : null}

          {variant === "B" && currentGroups.length > 0 ? (
            <BuildAssignmentDocket
              acknowledgements={acknowledgements}
              expandedIds={expandedIds}
              groups={currentGroups}
              onRespond={respond}
              onToggle={toggleExpanded}
            />
          ) : null}

          {variant === "C" && currentGroups.length > 0 ? (
            <FieldShift
              acknowledgements={acknowledgements}
              assignments={currentGroups.flatMap((group) => group.assignments)}
              expandedIds={expandedIds}
              groups={currentGroups}
              onRespond={respond}
              onToggle={toggleExpanded}
            />
          ) : null}
        </div>
      </main>

      <PrototypeSwitcher onVariantChange={onVariantChange} variant={variant} />
    </AppShell>
  );
}

function PrototypeHeader({
  filter,
  onFilterChange,
  search,
  setSearch,
}: {
  filter: string;
  onFilterChange: (value: string) => void;
  search: string;
  setSearch: (value: string) => void;
}) {
  return (
    <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <h1 className="font-semibold text-4xl text-foreground tracking-[-0.04em] sm:text-5xl">
          Work
        </h1>
        <p className="mt-2 max-w-2xl text-muted-foreground text-sm sm:text-base">
          Assigned proposal and active Build scope, ordered around the next
          response and field action.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-[minmax(240px,1fr)_190px] lg:w-[520px]">
        <label className="relative block">
          <span className="sr-only">Search assigned work</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className="h-10 w-full rounded-xl border border-border/80 bg-background pl-9 text-sm shadow-xs/5 outline-none transition-shadow placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search Build, scope, or role"
            type="search"
            value={search}
          />
        </label>
        <NativeSelect
          aria-label="Filter assigned work"
          onChange={(event) => onFilterChange(event.target.value)}
          value={filter}
        >
          <NativeSelectOption value="all">All assigned work</NativeSelectOption>
          <NativeSelectOption value="response">Needs response</NativeSelectOption>
          <NativeSelectOption value="active">Active Builds</NativeSelectOption>
          <NativeSelectOption value="planning">Proposal planning</NativeSelectOption>
          <NativeSelectOption value="issues">Open issues</NativeSelectOption>
        </NativeSelect>
      </div>
    </header>
  );
}

function ActionCommandCenter({
  acknowledgements,
  assignments,
  groups: visibleGroups,
  onRespond,
  onSelect,
  selected,
  selectedGroup,
}: {
  acknowledgements: Record<string, AcknowledgementState>;
  assignments: Assignment[];
  groups: WorkGroup[];
  onRespond: (
    assignment: Assignment,
    acknowledgement: AcknowledgementState
  ) => void;
  onSelect: (assignment: Assignment) => void;
  selected: Assignment;
  selectedGroup: WorkGroup;
}) {
  const sorted = [...assignments].sort(
    (left, right) =>
      actionPriority(left, acknowledgements[left.id]) -
      actionPriority(right, acknowledgements[right.id])
  );

  return (
    <section className="grid items-start gap-4 xl:grid-cols-[minmax(320px,0.72fr)_minmax(0,1.28fr)]">
      <Frame className="xl:sticky xl:top-5">
        <FrameHeader>
          <FrameTitle>Next actions</FrameTitle>
          <FrameDescription>
            {sorted.length} assignments across {visibleGroups.length} Builds and
            proposals
          </FrameDescription>
        </FrameHeader>
        <FramePanel className="space-y-2 p-2">
          {sorted.map((assignment) => {
            const group = groupFor(assignment);
            const acknowledgement = acknowledgements[assignment.id];
            const selectedState = selected.id === assignment.id;
            return (
              <Card
                aria-pressed={selectedState}
                className={cn(
                  "w-full p-4 text-left transition-[border-color,background-color,transform] duration-150 active:scale-[0.995]",
                  selectedState && "border-primary/45 bg-primary/7",
                  acknowledgement === "pending" &&
                    !selectedState &&
                    "border-info/25 bg-info/5"
                )}
                key={assignment.id}
                onClick={() => onSelect(assignment)}
                render={<button type="button" />}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <ObjectBadge kind={group.kind} />
                      <AcknowledgementBadge state={acknowledgement} />
                    </div>
                    <p className="mt-3 font-semibold text-sm">
                      {assignment.subMilestone}
                    </p>
                    <p className="mt-1 truncate text-muted-foreground text-xs">
                      {group.name} · {assignment.role}
                    </p>
                  </div>
                  <ChevronRight
                    className={cn(
                      "mt-1 size-4 shrink-0 text-muted-foreground transition-transform",
                      selectedState && "translate-x-0.5 text-foreground"
                    )}
                  />
                </div>
                <div className="mt-4 flex items-center justify-between gap-3 border-border/70 border-t pt-3 text-xs">
                  <span className="text-muted-foreground">
                    {assignment.nextAction}
                  </span>
                  <IssueBadge issue={assignment.issue} compact />
                </div>
              </Card>
            );
          })}
        </FramePanel>
      </Frame>

      <Frame>
        <AssignmentDetail
          acknowledgement={acknowledgements[selected.id]}
          assignment={selected}
          group={selectedGroup}
          onRespond={onRespond}
        />
      </Frame>
    </section>
  );
}

function BuildAssignmentDocket({
  acknowledgements,
  expandedIds,
  groups: visibleGroups,
  onRespond,
  onToggle,
}: {
  acknowledgements: Record<string, AcknowledgementState>;
  expandedIds: Set<string>;
  groups: WorkGroup[];
  onRespond: (
    assignment: Assignment,
    acknowledgement: AcknowledgementState
  ) => void;
  onToggle: (id: string) => void;
}) {
  return (
    <section className="space-y-4" aria-label="Build assignment dockets">
      {visibleGroups.map((group) => {
        const completed = group.assignments.filter(
          (assignment) => acknowledgements[assignment.id] === "accepted"
        ).length;
        const value = (completed / group.assignments.length) * 100;
        return (
          <Frame key={group.id}>
            <FramePanel className="p-0">
              <div className="p-5 sm:p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <ObjectBadge kind={group.kind} />
                      {group.assignments.some(
                        (assignment) =>
                          acknowledgements[assignment.id] === "pending"
                      ) ? (
                        <Badge variant="info">
                          <CircleAlert className="size-3" /> Response required
                        </Badge>
                      ) : null}
                    </div>
                    <h2 className="mt-3 font-semibold text-xl tracking-[-0.02em] sm:text-2xl">
                      {group.name}
                    </h2>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground text-xs sm:text-sm">
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin className="size-3.5" /> {group.address}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarClock className="size-3.5" />
                        {group.plannedDateRange}
                      </span>
                      {group.permit ? (
                        <span className="inline-flex items-center gap-1.5">
                          <ShieldCheck className="size-3.5" /> Permit {group.permit}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="w-full shrink-0 lg:w-72">
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="font-medium">Assignment response</span>
                      <span className="text-muted-foreground">
                        {completed} of {group.assignments.length} accepted
                      </span>
                    </div>
                    <Progress className="mt-2" value={value}>
                      <ProgressTrack>
                        <ProgressIndicator />
                      </ProgressTrack>
                    </Progress>
                    <p className="mt-2 text-muted-foreground text-xs">
                      {group.revision}
                    </p>
                  </div>
                </div>
              </div>

              <div className="hidden grid-cols-[minmax(220px,1.5fr)_minmax(150px,0.8fr)_minmax(145px,0.75fr)_minmax(130px,0.7fr)_minmax(120px,0.6fr)_36px] gap-3 border-border/70 border-t bg-muted/28 px-5 py-2 font-medium text-muted-foreground text-xs uppercase tracking-[0.08em] lg:grid">
                <span>Milestone / Sub-milestone</span>
                <span>Work window</span>
                <span>Acknowledgement</span>
                <span>Evidence</span>
                <span>Issue</span>
                <span className="sr-only">Expand</span>
              </div>

              <div className="divide-y divide-border/70 border-border/70 border-t lg:border-t-0">
                {group.assignments.map((assignment) => (
                  <AssignmentLedgerRow
                    acknowledgement={acknowledgements[assignment.id]}
                    assignment={assignment}
                    expanded={expandedIds.has(assignment.id)}
                    group={group}
                    key={assignment.id}
                    onRespond={onRespond}
                    onToggle={() => onToggle(assignment.id)}
                  />
                ))}
              </div>
            </FramePanel>
          </Frame>
        );
      })}
    </section>
  );
}

function AssignmentLedgerRow({
  acknowledgement,
  assignment,
  expanded,
  group,
  onRespond,
  onToggle,
}: {
  acknowledgement: AcknowledgementState;
  assignment: Assignment;
  expanded: boolean;
  group: WorkGroup;
  onRespond: (
    assignment: Assignment,
    acknowledgement: AcknowledgementState
  ) => void;
  onToggle: () => void;
}) {
  return (
    <Collapsible onOpenChange={onToggle} open={expanded}>
      <CollapsibleTrigger className="block w-full text-left">
        <div
          className={cn(
            "grid gap-3 px-5 py-4 transition-colors hover:bg-muted/35 lg:grid-cols-[minmax(220px,1.5fr)_minmax(150px,0.8fr)_minmax(145px,0.75fr)_minmax(130px,0.7fr)_minmax(120px,0.6fr)_36px] lg:items-center",
            acknowledgement === "pending" && "bg-info/6"
          )}
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Wrench className="size-4 shrink-0 text-muted-foreground" />
              <span className="font-medium text-xs">{assignment.milestone}</span>
            </div>
            <p className="mt-1 font-semibold text-sm">
              {assignment.subMilestone}
            </p>
            <p className="mt-1 text-muted-foreground text-xs">
              {assignment.role}
            </p>
          </div>
          <LedgerMobileField label="Work window">
            <span className="text-sm">{assignment.window}</span>
          </LedgerMobileField>
          <LedgerMobileField label="Acknowledgement">
            <AcknowledgementBadge state={acknowledgement} />
          </LedgerMobileField>
          <LedgerMobileField label="Evidence">
            <EvidenceBadge state={assignment.evidence} />
          </LedgerMobileField>
          <LedgerMobileField label="Issue">
            <IssueBadge issue={assignment.issue} />
          </LedgerMobileField>
          <span className="absolute top-4 right-4 grid size-8 place-items-center text-muted-foreground lg:static">
            <ChevronDown
              className={cn(
                "size-4 transition-transform duration-200",
                expanded && "rotate-180"
              )}
            />
          </span>
        </div>
      </CollapsibleTrigger>
      <CollapsiblePanel>
        <div className="border-border/70 border-t bg-muted/20 p-4 sm:p-5">
          <AssignmentDetail
            acknowledgement={acknowledgement}
            assignment={assignment}
            compact
            group={group}
            onRespond={onRespond}
          />
        </div>
      </CollapsiblePanel>
    </Collapsible>
  );
}

function FieldShift({
  acknowledgements,
  assignments,
  expandedIds,
  groups: visibleGroups,
  onRespond,
  onToggle,
}: {
  acknowledgements: Record<string, AcknowledgementState>;
  assignments: Assignment[];
  expandedIds: Set<string>;
  groups: WorkGroup[];
  onRespond: (
    assignment: Assignment,
    acknowledgement: AcknowledgementState
  ) => void;
  onToggle: (id: string) => void;
}) {
  const buckets: Array<{
    description: string;
    id: Assignment["dateBucket"];
    label: string;
  }> = [
    {
      id: "today",
      label: "Today · Wednesday, August 12",
      description: "Responses and field actions due now",
    },
    {
      id: "next",
      label: "Next 14 days",
      description: "Planning and mobilization through August 26",
    },
    {
      id: "later",
      label: "Later",
      description: "Accepted future scope",
    },
  ];

  return (
    <section className="mx-auto w-full max-w-5xl" aria-label="Field shift">
      <Frame>
        <FrameHeader className="sm:flex-row sm:items-center sm:justify-between">
          <div>
            <FrameTitle>Field shift</FrameTitle>
            <FrameDescription>
              Today and the next 14 days, ordered by the action you owe
            </FrameDescription>
          </div>
          <Badge className="mt-3 sm:mt-0" variant="info">
            <CircleAlert className="size-3" />
            {
              assignments.filter(
                (assignment) => acknowledgements[assignment.id] === "pending"
              ).length
            }{" "}
            response required
          </Badge>
        </FrameHeader>
        {buckets.map((bucket) => {
          const bucketAssignments = assignments
            .filter((assignment) => assignment.dateBucket === bucket.id)
            .sort(
              (left, right) =>
                actionPriority(left, acknowledgements[left.id]) -
                actionPriority(right, acknowledgements[right.id])
            );
          if (bucketAssignments.length === 0) {
            return null;
          }
          return (
            <FramePanel className="p-0" key={bucket.id}>
              <div className="px-5 py-4">
                <h2 className="font-semibold text-sm">{bucket.label}</h2>
                <p className="mt-0.5 text-muted-foreground text-xs">
                  {bucket.description}
                </p>
              </div>
              <div className="divide-y divide-border/70 border-border/70 border-t">
                {bucketAssignments.map((assignment) => {
                  const group =
                    visibleGroups.find((item) => item.id === assignment.buildId) ??
                    groupFor(assignment);
                  const expanded = expandedIds.has(assignment.id);
                  return (
                    <Collapsible
                      key={assignment.id}
                      onOpenChange={() => onToggle(assignment.id)}
                      open={expanded}
                    >
                      <CollapsibleTrigger className="block w-full text-left">
                        <div
                          className={cn(
                            "relative grid gap-3 px-5 py-4 transition-colors hover:bg-muted/35 sm:grid-cols-[120px_minmax(0,1fr)_auto] sm:items-start",
                            acknowledgements[assignment.id] === "pending" &&
                              "bg-info/6"
                          )}
                        >
                          <div className="flex items-center gap-2 text-muted-foreground text-xs sm:block">
                            <Clock3 className="size-3.5 sm:mb-1" />
                            <span>{shiftTime(assignment)}</span>
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <ObjectBadge kind={group.kind} />
                              <AcknowledgementBadge
                                state={acknowledgements[assignment.id]}
                              />
                              {assignment.stale ? (
                                <Badge variant="warning">Plan changed</Badge>
                              ) : null}
                            </div>
                            <p className="mt-2 font-semibold text-sm">
                              {assignment.subMilestone}
                            </p>
                            <p className="mt-1 text-muted-foreground text-xs">
                              {group.name} · {group.address}
                            </p>
                            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs">
                              <span>{assignment.role}</span>
                              <EvidenceBadge state={assignment.evidence} />
                              <IssueBadge issue={assignment.issue} />
                            </div>
                          </div>
                          <span className="absolute top-4 right-4 grid size-8 place-items-center text-muted-foreground sm:static">
                            <ChevronDown
                              className={cn(
                                "size-4 transition-transform duration-200",
                                expanded && "rotate-180"
                              )}
                            />
                          </span>
                        </div>
                      </CollapsibleTrigger>
                      <CollapsiblePanel>
                        <div className="border-border/70 border-t bg-muted/20 p-4 sm:p-5">
                          <AssignmentDetail
                            acknowledgement={acknowledgements[assignment.id]}
                            assignment={assignment}
                            compact
                            group={group}
                            onRespond={onRespond}
                          />
                        </div>
                      </CollapsiblePanel>
                    </Collapsible>
                  );
                })}
              </div>
            </FramePanel>
          );
        })}
      </Frame>
    </section>
  );
}

function AssignmentDetail({
  acknowledgement,
  assignment,
  compact = false,
  group,
  onRespond,
}: {
  acknowledgement: AcknowledgementState;
  assignment: Assignment;
  compact?: boolean;
  group: WorkGroup;
  onRespond: (
    assignment: Assignment,
    acknowledgement: AcknowledgementState
  ) => void;
}) {
  return (
    <FramePanel className={cn(compact ? "p-0 shadow-none" : "p-5 sm:p-6")}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <ObjectBadge kind={group.kind} />
            <AcknowledgementBadge state={acknowledgement} />
            {assignment.stale ? (
              <Badge variant="warning">
                <AlertTriangle className="size-3" /> Plan changed
              </Badge>
            ) : null}
          </div>
          <h2 className="mt-3 font-semibold text-xl tracking-[-0.02em] sm:text-2xl">
            {assignment.subMilestone}
          </h2>
          <p className="mt-1 text-muted-foreground text-sm">
            {assignment.milestone} · {group.name}
          </p>
        </div>
        <Button size="sm" variant="outline">
          Open Build collaboration <ArrowUpRight className="size-4" />
        </Button>
      </div>

      {acknowledgement === "pending" ? (
        <div className="mt-5 rounded-xl border border-info/25 bg-info/7 p-4">
          <div className="flex items-start gap-3">
            <CircleAlert className="mt-0.5 size-5 shrink-0 text-info" />
            <div>
              <p className="font-semibold text-sm">Your response is required</p>
              <p className="mt-1 max-w-2xl text-muted-foreground text-sm">
                Accepting activates this exact {assignment.assignmentLabel.toLowerCase()}.
                It does not approve a Milestone, release a Draw, or change the
                current Budget or Roadmap.
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button onClick={() => onRespond(assignment, "accepted")}>
              <Check className="size-4" /> Accept assignment
            </Button>
            <Button
              onClick={() => onRespond(assignment, "clarification")}
              variant="outline"
            >
              <HelpCircle className="size-4" /> Request clarification
            </Button>
            <Button
              onClick={() => onRespond(assignment, "declined")}
              variant="outline"
            >
              <X className="size-4" /> Decline or dispute scope
            </Button>
          </div>
        </div>
      ) : null}

      {assignment.stale ? (
        <div className="mt-5 rounded-xl border border-warning/25 bg-warning/7 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm">
                Plan changed after this assignment was accepted
              </p>
              <p className="mt-1 text-muted-foreground text-sm">
                Your assignment remains visible and active. Review the changed
                fields against the accepted plan snapshot.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {assignment.changedFields?.map((field) => (
                  <Badge key={field} variant="warning">
                    {field}
                  </Badge>
                ))}
              </div>
              <Button className="mt-4" size="sm" variant="outline">
                Compare current plan to accepted snapshot
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <Separator className="my-5" />

      <div className="grid gap-5 lg:grid-cols-3">
        <DetailSection icon={<BriefcaseBusiness />} title="Scope basis">
          <p>{assignment.scope}</p>
          <DetailLine label="Assignment" value={assignment.assignmentLabel} />
          <DetailLine label="Your role" value={assignment.role} />
          <DetailLine label="Plan record" value={group.revision} />
        </DetailSection>
        <DetailSection icon={<CalendarClock />} title="Execution record">
          <DetailLine label="Work window" value={assignment.window} />
          <DetailLine label="Evidence" value={assignment.evidenceDetail} />
          <DetailLine
            label="Permit"
            value={group.permit ? group.permit : "Not issued during proposal planning"}
          />
        </DetailSection>
        <DetailSection icon={<MessageSquareText />} title="Response record">
          <DetailLine
            label="Acknowledgement"
            value={acknowledgementLabel(acknowledgement)}
          />
          <DetailLine
            label="Issue"
            value={assignment.issueDetail ?? issueLabel(assignment.issue)}
          />
          <DetailLine label="Contact" value={group.builderContact} />
        </DetailSection>
      </div>

      {acknowledgement === "accepted" ? (
        <div className="mt-5 flex flex-col gap-2 border-border/70 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-muted-foreground text-xs">
            Supporting evidence informs Builder and Backoffice review. It does
            not determine Milestone completion.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button size="sm">
              <FileCheck2 className="size-4" />
              {assignment.evidence === "not_started"
                ? "Add supporting evidence"
                : "Open evidence"}
            </Button>
            <Button size="sm" variant="outline">
              Request clarification
            </Button>
          </div>
        </div>
      ) : null}
    </FramePanel>
  );
}

function DetailSection({
  children,
  icon,
  title,
}: {
  children: ReactNode;
  icon: ReactNode;
  title: string;
}) {
  return (
    <section>
      <div className="flex items-center gap-2 font-semibold text-sm [&_svg]:size-4 [&_svg]:text-muted-foreground">
        {icon}
        <h3>{title}</h3>
      </div>
      <div className="mt-3 space-y-3 text-sm">{children}</div>
    </section>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-medium text-muted-foreground text-xs uppercase tracking-[0.06em]">
        {label}
      </p>
      <p className="mt-1">{value}</p>
    </div>
  );
}

function LedgerMobileField({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div>
      <p className="mb-1 font-medium text-muted-foreground text-[10px] uppercase tracking-[0.08em] lg:hidden">
        {label}
      </p>
      {children}
    </div>
  );
}

function ObjectBadge({ kind }: { kind: AssignmentKind }) {
  return kind === "build" ? (
    <Badge variant="success">
      <Building2 className="size-3" /> Active Build
    </Badge>
  ) : (
    <Badge variant="warning">
      <BriefcaseBusiness className="size-3" /> Proposal planning
    </Badge>
  );
}

function AcknowledgementBadge({ state }: { state: AcknowledgementState }) {
  const meta: Record<
    AcknowledgementState,
    { icon: ReactNode; label: string; variant: BadgeProps["variant"] }
  > = {
    pending: {
      icon: <CircleAlert className="size-3" />,
      label: "Response required",
      variant: "info",
    },
    accepted: {
      icon: <CircleCheck className="size-3" />,
      label: "Accepted",
      variant: "success",
    },
    clarification: {
      icon: <HelpCircle className="size-3" />,
      label: "Clarification requested",
      variant: "warning",
    },
    declined: {
      icon: <X className="size-3" />,
      label: "Declined",
      variant: "destructive",
    },
  };
  return <Badge variant={meta[state].variant}>{meta[state].icon}{meta[state].label}</Badge>;
}

function EvidenceBadge({ state }: { state: EvidenceState }) {
  const labels: Record<EvidenceState, string> = {
    not_started: "Not started",
    in_progress: "In progress",
    submitted: "Submitted",
    changes_requested: "Changes requested",
    accepted: "Accepted",
    not_required: "Not required yet",
  };
  const variants: Record<EvidenceState, BadgeProps["variant"]> = {
    not_started: "secondary",
    in_progress: "info",
    submitted: "info",
    changes_requested: "warning",
    accepted: "success",
    not_required: "secondary",
  };
  return (
    <Badge variant={variants[state]}>
      <FileCheck2 className="size-3" /> {labels[state]}
    </Badge>
  );
}

function IssueBadge({
  compact = false,
  issue,
}: {
  compact?: boolean;
  issue: IssueState;
}) {
  const variants: Record<IssueState, BadgeProps["variant"]> = {
    none: "secondary",
    open: "destructive",
    waiting_on_builder: "warning",
    resolved: "success",
  };
  return (
    <Badge variant={variants[issue]}>
      {issue === "none" ? (
        <CircleCheck className="size-3" />
      ) : (
        <CircleAlert className="size-3" />
      )}
      {compact && issue === "none" ? "Clear" : issueLabel(issue)}
    </Badge>
  );
}

function issueLabel(issue: IssueState) {
  switch (issue) {
    case "none":
      return "No issue";
    case "open":
      return "Open issue";
    case "waiting_on_builder":
      return "Waiting on Builder";
    case "resolved":
      return "Resolved";
  }
}

function acknowledgementLabel(state: AcknowledgementState) {
  switch (state) {
    case "pending":
      return "Pending contractor response";
    case "accepted":
      return "Accepted and assignment active";
    case "clarification":
      return "Clarification requested before acceptance";
    case "declined":
      return "Declined and returned for review";
  }
}

function groupFor(assignment: Assignment) {
  return groups.find((group) => group.id === assignment.buildId) ?? groups[0];
}

function actionPriority(
  assignment: Assignment,
  acknowledgement: AcknowledgementState
) {
  if (acknowledgement === "pending") {
    return 0;
  }
  if (assignment.issue === "open") {
    return 1;
  }
  if (assignment.evidence === "changes_requested") {
    return 2;
  }
  if (acknowledgement === "clarification") {
    return 3;
  }
  if (assignment.dateBucket === "today") {
    return 4;
  }
  return 5;
}

function shiftTime(assignment: Assignment) {
  if (assignment.acknowledgement === "pending") {
    return "Due 4:00 PM";
  }
  if (assignment.issue === "open") {
    return "Field issue";
  }
  if (assignment.dateBucket === "next") {
    return "Within 14 days";
  }
  if (assignment.dateBucket === "later") {
    return "Future scope";
  }
  return "In progress";
}

function PrototypeSwitcher({
  onVariantChange,
  variant,
}: {
  onVariantChange: (variant: ContractorWorkPrototypeVariant) => void;
  variant: ContractorWorkPrototypeVariant;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.matches("input, textarea, select, [contenteditable='true']")
      ) {
        return;
      }
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
        return;
      }
      event.preventDefault();
      const currentIndex = prototypeVariants.indexOf(variant);
      const nextIndex =
        event.key === "ArrowRight"
          ? (currentIndex + 1) % prototypeVariants.length
          : (currentIndex - 1 + prototypeVariants.length) %
            prototypeVariants.length;
      onVariantChange(prototypeVariants[nextIndex]);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onVariantChange, variant]);

  if (import.meta.env.PROD) {
    return null;
  }

  const currentIndex = prototypeVariants.indexOf(variant);
  const move = (direction: -1 | 1) => {
    onVariantChange(
      prototypeVariants[
        (currentIndex + direction + prototypeVariants.length) %
          prototypeVariants.length
      ]
    );
  };

  return (
    <div
      className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4"
      data-prototype-only="true"
    >
      <div className="flex items-center gap-1 rounded-full border border-foreground/15 bg-foreground px-2 py-1.5 text-background shadow-2xl">
        <button
          aria-label="Previous prototype variant"
          className="grid size-8 place-items-center rounded-full transition-colors hover:bg-background/15 focus-visible:ring-2 focus-visible:ring-background"
          onClick={() => move(-1)}
          type="button"
        >
          <ArrowLeft className="size-4" />
        </button>
        <div className="min-w-[190px] px-3 text-center">
          <p className="font-semibold text-xs">
            {variant} · {variantMeta[variant].label}
          </p>
          <p className="hidden text-background/65 text-xs sm:block">
            {variantMeta[variant].description}
          </p>
        </div>
        <button
          aria-label="Next prototype variant"
          className="grid size-8 place-items-center rounded-full transition-colors hover:bg-background/15 focus-visible:ring-2 focus-visible:ring-background"
          onClick={() => move(1)}
          type="button"
        >
          <ArrowRight className="size-4" />
        </button>
      </div>
    </div>
  );
}
