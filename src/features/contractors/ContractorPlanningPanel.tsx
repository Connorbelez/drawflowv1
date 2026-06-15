"use client";

import {
  type Announcements,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  ClipboardCheck,
  Hammer,
  Search,
  UserPlus,
} from "lucide-react";
import {
  type Dispatch,
  type FormEvent,
  type SetStateAction,
  useMemo,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Card, CardContent } from "#/components/ui/card.tsx";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "#/components/ui/dialog.tsx";
import { Field, FieldLabel } from "#/components/ui/field.tsx";
import {
  Frame,
  FrameFooter,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
import {
  NativeSelect,
  NativeSelectOption,
} from "#/components/ui/native-select.tsx";
import { ScrollArea } from "#/components/ui/scroll-area.tsx";
import { initialsFor } from "#/features/backoffice-build-detail/format.ts";
import { cn } from "#/lib/utils.ts";

import {
  type ContractorAssignmentCostDraft,
  type ContractorDrawerAvailableContractor,
  type ContractorProfileDraft,
  ContractorQuickAddDrawer,
} from "./ContractorQuickAddDrawer.tsx";

export type ContractorPlanningMilestone = {
  milestoneKey: string;
  name: string;
  submilestoneSnapshot?: Array<{ key: string; name: string }>;
};

export type ContractorPlanningModel = {
  allocationCalendar?: Array<{
    assignmentId: string;
    contractorId: string;
    contractorName: string;
    dayEnd: number;
    dayStart: number;
    label: string;
    milestoneKey: string;
  }>;
  availableContractors?: ContractorDrawerAvailableContractor[];
  conflicts?: Array<{
    contractorId: string;
    contractorName: string;
    leftLabel: string;
    overlapEndDay: number;
    overlapStartDay: number;
    rightLabel: string;
  }>;
  equipmentSchedule?: Array<{
    contractorName: string;
    dayEnd: number;
    dayStart: number;
    equipmentKey: string;
    name: string;
    quantity: number;
  }>;
  materialSignals?: Array<{ key: string; label: string; source?: string }>;
  milestoneAssignments?: Array<{
    _id: string;
    contractorId: string;
    contractorName: string;
    estimatedCostCents?: number;
    estimatedHours?: number;
    milestoneKey: string;
    milestoneName: string;
    role: string;
    status: string;
    submilestoneKey?: string;
    submilestoneName?: string;
  }>;
  proposalContractors?: Array<{
    _id: string;
    agreedRateCents?: number;
    agreedRateUnit?: "hour" | "day" | "fixed";
    city?: string;
    contractorId: string;
    defaultPayRateCents?: number;
    defaultPayRateUnit?: "hour" | "day" | "fixed";
    name: string;
    role: string;
    status: string;
    trades?: string[];
  }>;
  recommendations?: Array<{
    contractorId: string;
    matchedSignals: Array<{ key: string; label: string }>;
    name: string;
    rateCents?: number;
    score: number;
    trades?: string[];
  }>;
  utilization?: Array<{
    assignedDays: number;
    contractorId: string;
    name: string;
    scheduledHours: number;
    utilizationPercent?: number | null;
    weeklyWindowHours?: number;
  }>;
};

type ProposalContractor = NonNullable<
  ContractorPlanningModel["proposalContractors"]
>[number];

type ContractorPlanningPanelProps = {
  canMutate?: boolean;
  milestones: ContractorPlanningMilestone[];
  onAssignToMilestone?: (input: {
    assignmentCost?: ContractorAssignmentCostDraft;
    contractorId: string;
    milestoneKey: string;
    role: string;
    submilestoneKeys?: string[];
  }) => Promise<void> | void;
  onAttachExisting?: (input: {
    contractorId: string;
    role: string;
  }) => Promise<void> | void;
  onCreateAndAttach?: (input: {
    contractor: ContractorProfileDraft;
    role?: string;
  }) => Promise<void> | void;
  planning?: ContractorPlanningModel | null;
  roleLabel?: "builder" | "lender";
};

type AssignmentForm = {
  contractorId: string;
  estimatedCost: string;
  estimatedHours: string;
  milestoneKey: string;
  role: string;
  submilestoneKey: string;
};

type AssignmentFilter = "all" | "assigned" | "unassigned";

type AssignDialogState = {
  contractorId: string;
  milestoneKey: string;
};

const contractorDragId = (contractorId: string) => `contractor:${contractorId}`;
const milestoneDropId = (milestoneKey: string) => `milestone:${milestoneKey}`;

function parseContractorDragId(id: string | number) {
  const value = String(id);
  return value.startsWith("contractor:")
    ? value.slice("contractor:".length)
    : null;
}

function parseMilestoneDropId(id: string | number) {
  const value = String(id);
  return value.startsWith("milestone:")
    ? value.slice("milestone:".length)
    : null;
}

export function ContractorPlanningPanel({
  canMutate = true,
  milestones,
  onAssignToMilestone,
  onAttachExisting,
  onCreateAndAttach,
  planning,
  roleLabel = "builder",
}: ContractorPlanningPanelProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [assignmentFilter, setAssignmentFilter] =
    useState<AssignmentFilter>("all");
  const [tradeFilter, setTradeFilter] = useState("all");
  const [selectedContractorId, setSelectedContractorId] = useState<
    string | null
  >(null);
  const [assignDialog, setAssignDialog] = useState<AssignDialogState | null>(
    null
  );
  const [draggingContractorId, setDraggingContractorId] = useState<
    string | null
  >(null);
  const [form, setForm] = useState<AssignmentForm>({
    contractorId: "",
    estimatedCost: "",
    estimatedHours: "",
    milestoneKey: "",
    role: "",
    submilestoneKey: "",
  });

  const proposalContractors = planning?.proposalContractors ?? [];
  const assignments = planning?.milestoneAssignments ?? [];

  const assignmentCountByContractor = useMemo(() => {
    const counts = new Map<string, number>();
    for (const assignment of assignments) {
      counts.set(
        assignment.contractorId,
        (counts.get(assignment.contractorId) ?? 0) + 1
      );
    }
    return counts;
  }, [assignments]);

  const tradeOptions = useMemo(() => {
    const trades = new Set<string>();
    for (const contractor of proposalContractors) {
      for (const trade of contractor.trades ?? []) {
        if (trade.trim()) {
          trades.add(trade);
        }
      }
    }
    return Array.from(trades).sort((a, b) => a.localeCompare(b));
  }, [proposalContractors]);

  const filteredContractors = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return proposalContractors.filter((contractor) => {
      const assignmentCount =
        assignmentCountByContractor.get(contractor.contractorId) ?? 0;
      if (assignmentFilter === "assigned" && assignmentCount === 0) {
        return false;
      }
      if (assignmentFilter === "unassigned" && assignmentCount > 0) {
        return false;
      }
      if (
        tradeFilter !== "all" &&
        !(contractor.trades ?? []).some((trade) => trade === tradeFilter)
      ) {
        return false;
      }
      if (!query) {
        return true;
      }
      const haystack = [
        contractor.name,
        contractor.role,
        contractor.city ?? "",
        ...(contractor.trades ?? []),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [
    assignmentCountByContractor,
    assignmentFilter,
    proposalContractors,
    searchQuery,
    tradeFilter,
  ]);

  const assignmentsByMilestone = useMemo(() => {
    const map = new Map<string, typeof assignments>();
    for (const milestone of milestones) {
      map.set(
        milestone.milestoneKey,
        assignments.filter(
          (assignment) => assignment.milestoneKey === milestone.milestoneKey
        )
      );
    }
    return map;
  }, [assignments, milestones]);

  const activeMilestone = milestones.find(
    (milestone) => milestone.milestoneKey === form.milestoneKey
  );
  const dialogContractor = proposalContractors.find(
    (contractor) => contractor.contractorId === form.contractorId
  );
  const canAssign =
    Boolean(onAssignToMilestone) &&
    canMutate &&
    form.contractorId.length > 0 &&
    form.milestoneKey.length > 0 &&
    form.role.trim().length > 0 &&
    !pending;

  const openAssignDialog = (contractorId: string, milestoneKey: string) => {
    const contractor = proposalContractors.find(
      (row) => row.contractorId === contractorId
    );
    const milestone = milestones.find(
      (row) => row.milestoneKey === milestoneKey
    );
    if (!(contractor && milestone)) {
      return;
    }
    setError("");
    setSelectedContractorId(contractorId);
    setForm({
      contractorId,
      estimatedCost: "",
      estimatedHours: "",
      milestoneKey,
      role: contractor.role || "Contractor",
      submilestoneKey: milestone.submilestoneSnapshot?.[0]?.key ?? "",
    });
    setAssignDialog({ contractorId, milestoneKey });
  };

  const handleDragStart = (event: DragStartEvent) => {
    const contractorId = parseContractorDragId(event.active.id);
    setDraggingContractorId(contractorId);
    if (contractorId) {
      setSelectedContractorId(contractorId);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setDraggingContractorId(null);
    if (!(canMutate && onAssignToMilestone)) {
      return;
    }
    const contractorId = parseContractorDragId(event.active.id);
    const milestoneKey = event.over
      ? parseMilestoneDropId(event.over.id)
      : null;
    if (!(contractorId && milestoneKey)) {
      return;
    }
    openAssignDialog(contractorId, milestoneKey);
  };

  const submitAssignment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!(canAssign && onAssignToMilestone)) {
      return;
    }
    setPending(true);
    setError("");
    try {
      await onAssignToMilestone({
        assignmentCost: {
          estimatedCostCents: moneyToCents(form.estimatedCost),
          estimatedHours: hoursFromInput(form.estimatedHours),
        },
        contractorId: form.contractorId,
        milestoneKey: form.milestoneKey,
        role: form.role.trim(),
        submilestoneKeys: form.submilestoneKey ? [form.submilestoneKey] : [],
      });
      setAssignDialog(null);
      setForm((prev) => ({
        ...prev,
        estimatedCost: "",
        estimatedHours: "",
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  };

  const draggingContractor = proposalContractors.find(
    (contractor) => contractor.contractorId === draggingContractorId
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  const dragAnnouncements = useMemo<Announcements>(
    () => ({
      onDragStart({ active }) {
        const contractorId = parseContractorDragId(active.id);
        const name =
          proposalContractors.find((row) => row.contractorId === contractorId)
            ?.name ?? "contractor";
        return `Picked up ${name} from the proposal roster`;
      },
      onDragOver({ over }) {
        if (!over) {
          return "";
        }
        const milestoneKey = parseMilestoneDropId(over.id);
        const name = milestones.find(
          (row) => row.milestoneKey === milestoneKey
        )?.name;
        return name ? `Over milestone ${name}` : "";
      },
      onDragEnd({ active, over }) {
        const contractorId = parseContractorDragId(active.id);
        const name =
          proposalContractors.find((row) => row.contractorId === contractorId)
            ?.name ?? "contractor";
        if (!over) {
          return `Cancelled drop for ${name}`;
        }
        const milestoneKey = parseMilestoneDropId(over.id);
        const milestoneName = milestones.find(
          (row) => row.milestoneKey === milestoneKey
        )?.name;
        return milestoneName
          ? `Dropped ${name} on ${milestoneName}`
          : `Dropped ${name}`;
      },
      onDragCancel({ active }) {
        const contractorId = parseContractorDragId(active.id);
        const name =
          proposalContractors.find((row) => row.contractorId === contractorId)
            ?.name ?? "contractor";
        return `Cancelled dragging ${name}`;
      },
    }),
    [milestones, proposalContractors]
  );

  const selectedContractor = proposalContractors.find(
    (contractor) => contractor.contractorId === selectedContractorId
  );

  const conflictCount = planning?.conflicts?.length ?? 0;

  return (
    <Frame data-testid="proposal-contractor-planning">
      <FramePanel className="flex flex-col gap-0 overflow-hidden p-0">
        <header className="border-border/70 border-b px-5 py-5 sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-2xl">
              <h2 className="font-semibold text-lg tracking-tight">
                Contractor planning
              </h2>
              <p className="mt-1.5 text-muted-foreground text-sm leading-relaxed">
                Build the proposal crew roster, assign contractors to
                milestones, and review permit fit and schedule signals before
                submission.
              </p>
            </div>
            <Button
              className="shrink-0"
              data-testid="proposal-add-contractor"
              disabled={!(canMutate && (onCreateAndAttach || onAttachExisting))}
              onClick={() => setDrawerOpen(true)}
              type="button"
            >
              <UserPlus />
              Add contractor
            </Button>
          </div>

          <dl
            className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border/80 bg-border/60 sm:grid-cols-4"
            data-testid="contractor-planning-status-bar"
          >
            <PlanningMetric label="Roster" value={proposalContractors.length} />
            <PlanningMetric label="Assignments" value={assignments.length} />
            <PlanningMetric
              label="Conflicts"
              tone={conflictCount > 0 ? "warning" : "default"}
              value={conflictCount}
            />
            <PlanningMetric
              label="Equipment holds"
              value={planning?.equipmentSchedule?.length ?? 0}
            />
          </dl>
        </header>

        <section
          aria-label="Crew assignment"
          className="flex min-h-0 flex-1 flex-col px-5 py-6 sm:px-6"
        >
          <AssignmentWorkflowBar
            isDragging={draggingContractorId !== null}
            selectedContractorName={selectedContractor?.name}
          />

          <DndContext
            accessibility={{ announcements: dragAnnouncements }}
            onDragEnd={handleDragEnd}
            onDragStart={handleDragStart}
            sensors={sensors}
          >
            <div className="mt-5 grid min-h-[min(28rem,calc(100vh-22rem))] overflow-hidden rounded-xl border border-border/80 bg-muted/15 lg:grid-cols-[minmax(16rem,20rem)_minmax(0,1fr)]">
              <ContractorRosterPanel
                assignmentCountByContractor={assignmentCountByContractor}
                assignmentFilter={assignmentFilter}
                canDrag={canMutate && Boolean(onAssignToMilestone)}
                className="min-h-0 border-border/70 lg:border-r"
                contractors={filteredContractors}
                onAssignmentFilterChange={setAssignmentFilter}
                onSearchChange={setSearchQuery}
                onSelectContractor={setSelectedContractorId}
                onTradeFilterChange={setTradeFilter}
                searchQuery={searchQuery}
                selectedContractorId={selectedContractorId}
                totalCount={proposalContractors.length}
                tradeFilter={tradeFilter}
                tradeOptions={tradeOptions}
              />

              <MilestoneAssignmentPanel
                assignmentsByMilestone={assignmentsByMilestone}
                canMutate={canMutate}
                className="min-h-0"
                draggingContractorId={draggingContractorId}
                milestones={milestones}
                onAssign={(milestoneKey) => {
                  if (!selectedContractorId) {
                    return;
                  }
                  openAssignDialog(selectedContractorId, milestoneKey);
                }}
                onEditAssignment={(milestoneKey, contractorId) => {
                  openAssignDialog(contractorId, milestoneKey);
                }}
                proposalContractors={proposalContractors}
                selectedContractorId={selectedContractorId}
              />
            </div>

            {typeof document !== "undefined" && draggingContractor
              ? createPortal(
                  <DragOverlay dropAnimation={null}>
                    <ContractorProfileCard
                      assignmentCount={
                        assignmentCountByContractor.get(
                          draggingContractor.contractorId
                        ) ?? 0
                      }
                      contractor={draggingContractor}
                      isDragging
                    />
                  </DragOverlay>,
                  document.body
                )
              : null}
          </DndContext>
        </section>

        <section
          aria-label="Planning intelligence"
          className="border-border/70 border-t bg-muted/10 px-5 py-8 sm:px-6"
        >
          <div className="mb-6 max-w-2xl">
            <h3 className="font-semibold text-base tracking-tight">
              Planning intelligence
            </h3>
            <p className="mt-1 text-muted-foreground text-sm">
              Permit signals, recommended crew, and schedule overlap from the
              current proposal roadmap.
            </p>
          </div>
          <PlanningInsightsSection planning={planning} />
        </section>
      </FramePanel>

      <AssignmentDialog
        activeMilestone={activeMilestone}
        canAssign={canAssign}
        contractor={dialogContractor}
        error={error}
        form={form}
        milestones={milestones}
        onOpenChange={(open) => {
          if (!open) {
            setAssignDialog(null);
            setError("");
          }
        }}
        open={assignDialog !== null}
        pending={pending}
        setForm={setForm}
        submitAssignment={submitAssignment}
      />

      <ContractorQuickAddDrawer
        availableContractors={planning?.availableContractors ?? []}
        createLabel="Create and add"
        description={`Add a contractor to this ${roleLabel} planning roster with schedule, equipment, capability, and pay details.`}
        onAttachExisting={
          onAttachExisting
            ? ({ contractorId, role }) =>
                onAttachExisting({ contractorId, role })
            : undefined
        }
        onCreate={({ contractor, role }) =>
          onCreateAndAttach?.({ contractor, role })
        }
        onOpenChange={setDrawerOpen}
        open={drawerOpen}
        requireRole
        title="Add contractor to proposal"
      />
    </Frame>
  );
}

function PlanningMetric({
  label,
  tone = "default",
  value,
}: {
  label: string;
  tone?: "default" | "warning";
  value: number;
}) {
  return (
    <div className="bg-background px-4 py-3">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd
        className={cn(
          "mt-0.5 font-semibold text-xl tabular-nums tracking-tight",
          tone === "warning" && value > 0 && "text-destructive"
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function AssignmentWorkflowBar({
  isDragging,
  selectedContractorName,
}: {
  isDragging: boolean;
  selectedContractorName?: string;
}) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <h3 className="font-semibold text-base tracking-tight">
          Crew assignment
        </h3>
        <p className="mt-1 max-w-xl text-muted-foreground text-sm">
          Select a contractor from the roster, then drag onto a milestone or use
          Assign crew.
        </p>
      </div>
      <ol className="flex flex-wrap items-center gap-2 text-sm">
        <li
          className={cn(
            "rounded-lg border px-3 py-1.5",
            selectedContractorName
              ? "border-primary/35 bg-primary/8 text-foreground"
              : "border-border/80 bg-background text-muted-foreground"
          )}
        >
          <span className="font-medium">1.</span> Select contractor
        </li>
        <li aria-hidden className="text-muted-foreground">
          <ArrowRight className="size-4" />
        </li>
        <li
          className={cn(
            "rounded-lg border px-3 py-1.5",
            isDragging
              ? "border-primary/35 bg-primary/8 text-foreground"
              : "border-border/80 bg-background text-muted-foreground"
          )}
        >
          <span className="font-medium">2.</span>{" "}
          {isDragging ? "Drop on milestone" : "Assign to milestone"}
        </li>
        {selectedContractorName ? (
          <li className="w-full text-muted-foreground text-xs lg:ms-2 lg:w-auto">
            Active:{" "}
            <span className="font-medium text-foreground">
              {selectedContractorName}
            </span>
          </li>
        ) : null}
      </ol>
    </div>
  );
}

function ContractorRosterPanel({
  assignmentCountByContractor,
  assignmentFilter,
  canDrag,
  className,
  contractors,
  onAssignmentFilterChange,
  onSearchChange,
  onSelectContractor,
  onTradeFilterChange,
  searchQuery,
  selectedContractorId,
  totalCount,
  tradeFilter,
  tradeOptions,
}: {
  assignmentCountByContractor: Map<string, number>;
  assignmentFilter: AssignmentFilter;
  canDrag: boolean;
  className?: string;
  contractors: ProposalContractor[];
  onAssignmentFilterChange: (value: AssignmentFilter) => void;
  onSearchChange: (value: string) => void;
  onSelectContractor: (contractorId: string) => void;
  onTradeFilterChange: (value: string) => void;
  searchQuery: string;
  selectedContractorId: string | null;
  totalCount: number;
  tradeFilter: string;
  tradeOptions: string[];
}) {
  return (
    <section className={cn("flex h-full min-h-0 flex-col", className)}>
      <header className="grid gap-3 border-border/70 border-b bg-background/50 px-4 py-4">
        <div className="flex items-center justify-between gap-2">
          <p className="font-medium text-sm">Proposal roster</p>
          <Badge className="tabular-nums" variant="outline">
            {contractors.length}/{totalCount}
          </Badge>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
          <Input
            aria-label="Search contractors"
            className="pl-9"
            nativeInput
            onChange={(event) => {
              onSearchChange((event.target as HTMLInputElement).value);
            }}
            placeholder="Search name, role, trade…"
            value={searchQuery}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <NativeSelect
            aria-label="Filter by assignment status"
            className="w-full"
            onChange={(event) => {
              onAssignmentFilterChange(
                event.currentTarget.value as AssignmentFilter
              );
            }}
            value={assignmentFilter}
          >
            <NativeSelectOption value="all">All roster</NativeSelectOption>
            <NativeSelectOption value="unassigned">
              Unassigned
            </NativeSelectOption>
            <NativeSelectOption value="assigned">
              On milestones
            </NativeSelectOption>
          </NativeSelect>
          <NativeSelect
            aria-label="Filter by trade"
            className="w-full"
            onChange={(event) => {
              onTradeFilterChange(event.currentTarget.value);
            }}
            value={tradeFilter}
          >
            <NativeSelectOption value="all">All trades</NativeSelectOption>
            {tradeOptions.map((trade) => (
              <NativeSelectOption key={trade} value={trade}>
                {trade}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      </header>

      <ScrollArea className="min-h-0 flex-1 bg-background/30 [--scroll-area-thumb-bg:var(--muted-foreground)]">
        <div className="grid gap-2 p-4">
          {contractors.length === 0 ? (
            <p className="rounded-lg border border-dashed px-3 py-6 text-center text-muted-foreground text-sm">
              {totalCount === 0
                ? "Add contractors to start building your crew roster."
                : "No contractors match your search or filters."}
            </p>
          ) : (
            contractors.map((contractor) => (
              <DraggableContractorCard
                assignmentCount={
                  assignmentCountByContractor.get(contractor.contractorId) ?? 0
                }
                canDrag={canDrag}
                contractor={contractor}
                isSelected={selectedContractorId === contractor.contractorId}
                key={contractor.contractorId}
                onSelect={() => {
                  onSelectContractor(contractor.contractorId);
                }}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </section>
  );
}

function DraggableContractorCard({
  assignmentCount,
  canDrag,
  contractor,
  isSelected,
  onSelect,
}: {
  assignmentCount: number;
  canDrag: boolean;
  contractor: ProposalContractor;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    disabled: !canDrag,
    id: contractorDragId(contractor.contractorId),
  });

  return (
    <ContractorProfileCard
      assignmentCount={assignmentCount}
      contractor={contractor}
      dragAttributes={canDrag ? attributes : undefined}
      dragListeners={canDrag ? listeners : undefined}
      isDragging={isDragging}
      isSelected={isSelected}
      onSelect={onSelect}
      setDragNodeRef={canDrag ? setNodeRef : undefined}
    />
  );
}

function ContractorProfileCard({
  assignmentCount,
  contractor,
  dragAttributes,
  dragListeners,
  isDragging = false,
  isSelected = false,
  onSelect,
  setDragNodeRef,
}: {
  assignmentCount: number;
  contractor: ProposalContractor;
  dragAttributes?: Record<string, unknown>;
  dragListeners?: Record<string, unknown>;
  isDragging?: boolean;
  isSelected?: boolean;
  onSelect?: () => void;
  setDragNodeRef?: (element: HTMLElement | null) => void;
}) {
  const isDraggable = Boolean(setDragNodeRef);
  const isInteractive = Boolean(onSelect);

  return (
    <Card
      className={cn(
        "motion-safe:transition-[border-color,box-shadow,opacity] motion-reduce:transition-none",
        isSelected && "border-primary/45 ring-1 ring-primary/25",
        isDragging && "opacity-40 shadow-md",
        isDraggable && "cursor-grab touch-none active:cursor-grabbing",
        isInteractive && "hover:border-primary/30"
      )}
      data-testid={`contractor-card-${contractor.contractorId}`}
      render={
        isInteractive ? (
          <div
            aria-label={`Select ${contractor.name}`}
            aria-selected={isSelected}
            className="block w-full rounded-[inherit] text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
            onClick={onSelect}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect?.();
              }
            }}
            ref={setDragNodeRef}
            role="button"
            tabIndex={0}
            {...dragListeners}
            {...dragAttributes}
          />
        ) : undefined
      }
    >
      <CardContent className="flex items-start gap-2 p-3">
        <ContractorProfileCardBody
          assignmentCount={assignmentCount}
          contractor={contractor}
        />
      </CardContent>
    </Card>
  );
}

function ContractorProfileCardBody({
  assignmentCount,
  contractor,
}: {
  assignmentCount: number;
  contractor: ProposalContractor;
}) {
  return (
    <>
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/12 font-semibold text-primary text-xs">
        {initialsFor(contractor.name)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-sm">
          {contractor.name}
        </span>
        <span className="block truncate text-muted-foreground text-xs">
          {contractor.role}
        </span>
        {contractor.trades && contractor.trades.length > 0 ? (
          <span className="mt-1.5 flex flex-wrap gap-1">
            {contractor.trades.slice(0, 3).map((trade) => (
              <Badge
                className="font-normal text-xs"
                key={trade}
                variant="outline"
              >
                {trade}
              </Badge>
            ))}
          </span>
        ) : null}
        <span className="mt-1.5 block text-muted-foreground text-xs">
          {assignmentCount === 0
            ? "Not assigned to milestones"
            : `${assignmentCount} milestone assignment${assignmentCount === 1 ? "" : "s"}`}
        </span>
      </span>
    </>
  );
}

function MilestoneAssignmentPanel({
  assignmentsByMilestone,
  canMutate,
  className,
  draggingContractorId,
  milestones,
  onAssign,
  onEditAssignment,
  proposalContractors,
  selectedContractorId,
}: {
  assignmentsByMilestone: Map<
    string,
    NonNullable<ContractorPlanningModel["milestoneAssignments"]>
  >;
  canMutate: boolean;
  className?: string;
  draggingContractorId: string | null;
  milestones: ContractorPlanningMilestone[];
  onAssign: (milestoneKey: string) => void;
  onEditAssignment: (milestoneKey: string, contractorId: string) => void;
  proposalContractors: ProposalContractor[];
  selectedContractorId: string | null;
}) {
  const isDragging = draggingContractorId !== null;

  return (
    <section className={cn("flex h-full min-h-0 flex-col", className)}>
      <header className="border-border/70 border-b bg-background/50 px-4 py-4">
        <p className="font-medium text-sm">Milestone assignments</p>
        <p className="mt-1 text-muted-foreground text-xs">
          {milestones.length} milestone{milestones.length === 1 ? "" : "s"} on
          this proposal
        </p>
      </header>
      <ScrollArea className="min-h-0 flex-1 [--scroll-area-thumb-bg:var(--muted-foreground)]">
        <div className="grid gap-3 p-4">
          {milestones.map((milestone) => (
            <DroppableMilestoneCard
              assignments={
                assignmentsByMilestone.get(milestone.milestoneKey) ?? []
              }
              canMutate={canMutate}
              isDragging={isDragging}
              key={milestone.milestoneKey}
              milestone={milestone}
              onAssign={() => {
                onAssign(milestone.milestoneKey);
              }}
              onEditAssignment={(contractorId) => {
                onEditAssignment(milestone.milestoneKey, contractorId);
              }}
              rosterEmpty={proposalContractors.length === 0}
              selectedContractorId={selectedContractorId}
            />
          ))}
        </div>
      </ScrollArea>
    </section>
  );
}

function DroppableMilestoneCard({
  assignments,
  canMutate,
  isDragging,
  milestone,
  onAssign,
  onEditAssignment,
  rosterEmpty,
  selectedContractorId,
}: {
  assignments: NonNullable<ContractorPlanningModel["milestoneAssignments"]>;
  canMutate: boolean;
  isDragging: boolean;
  milestone: ContractorPlanningMilestone;
  onAssign: () => void;
  onEditAssignment: (contractorId: string) => void;
  rosterEmpty: boolean;
  selectedContractorId: string | null;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: milestoneDropId(milestone.milestoneKey),
  });
  const showDropTarget = isDragging || isOver;
  const assignDisabled = !canMutate || rosterEmpty || !selectedContractorId;

  return (
    <Frame
      className={cn(
        "motion-safe:transition-[opacity,box-shadow] motion-reduce:transition-none",
        isOver && "ring-1 ring-primary/25"
      )}
      data-testid={`proposal-milestone-drop-${milestone.milestoneKey}`}
      ref={setNodeRef}
    >
      <FramePanel
        className={cn(
          "flex flex-col gap-0 p-0 motion-safe:transition-[border-color,background-color] motion-reduce:transition-none",
          isOver && "border-primary/45 bg-primary/5"
        )}
      >
        <FrameHeader className="flex-row items-center justify-between gap-3 border-border/60 border-b py-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary">
              <Hammer className="size-4" />
            </span>
            <FrameTitle className="truncate text-base">
              {milestone.name}
            </FrameTitle>
          </div>
          <Badge className="shrink-0 tabular-nums" variant="outline">
            {assignments.length} crew
          </Badge>
        </FrameHeader>

        <div className="grid gap-3 px-5 py-4">
          {showDropTarget ? (
            <div
              aria-label={`Drop zone for ${milestone.name}`}
              className={cn(
                "rounded-lg border border-dashed px-3 py-3 text-center text-muted-foreground text-xs motion-safe:transition-colors motion-reduce:transition-none",
                isOver
                  ? "border-primary/40 bg-primary/8"
                  : "border-border/80 bg-muted/15"
              )}
              role="region"
            >
              {isOver ? "Release to assign contractor" : "Drop here"}
            </div>
          ) : null}

          {assignments.length === 0 ? (
            <p className="text-muted-foreground text-xs">
              No crew assigned yet.
            </p>
          ) : (
            <ul className="divide-y divide-border/60 rounded-lg border border-border/60 bg-muted/10">
              {assignments.map((assignment) => (
                <li
                  className="flex items-center justify-between gap-2 px-3 py-2.5"
                  key={assignment._id}
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-sm">
                      {assignment.contractorName}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {assignment.role}
                      {assignment.submilestoneName
                        ? ` · ${assignment.submilestoneName}`
                        : " · Whole milestone"}
                    </p>
                  </div>
                  <Button
                    onClick={() => {
                      onEditAssignment(assignment.contractorId);
                    }}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    Edit
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <FrameFooter className="border-border/60 border-t py-3">
          <Button
            className="w-full sm:w-auto"
            data-testid={`proposal-milestone-assign-contractor-${milestone.milestoneKey}`}
            disabled={assignDisabled}
            onClick={onAssign}
            size="sm"
            title={
              assignDisabled && !rosterEmpty && !selectedContractorId
                ? "Select a contractor from the roster first"
                : undefined
            }
            type="button"
            variant="outline"
          >
            <UserPlus />
            Assign crew
          </Button>
        </FrameFooter>
      </FramePanel>
    </Frame>
  );
}

function AssignmentDialog({
  activeMilestone,
  canAssign,
  contractor,
  error,
  form,
  milestones,
  onOpenChange,
  open,
  pending,
  setForm,
  submitAssignment,
}: {
  activeMilestone?: ContractorPlanningMilestone;
  canAssign: boolean;
  contractor?: ProposalContractor;
  error: string;
  form: AssignmentForm;
  milestones: ContractorPlanningMilestone[];
  onOpenChange: (open: boolean) => void;
  open: boolean;
  pending: boolean;
  setForm: Dispatch<SetStateAction<AssignmentForm>>;
  submitAssignment: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const milestone = milestones.find(
    (row) => row.milestoneKey === form.milestoneKey
  );

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogPopup
        className="w-full sm:max-w-4xl"
        data-testid="assign-contractor-dialog"
      >
        <DialogHeader>
          <DialogTitle>Assign contractor to milestone</DialogTitle>
          <DialogDescription>
            {contractor?.name ?? "Contractor"} on{" "}
            {milestone?.name ?? "milestone"}
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="min-h-[20rem]">
          <form
            className="grid gap-6 sm:grid-cols-2"
            id="assign-contractor-form"
            onSubmit={submitAssignment}
          >
            <Field>
              <FieldLabel htmlFor="assign-contractor-role">Role</FieldLabel>
              <Input
                id="assign-contractor-role"
                nativeInput
                onChange={(event) => {
                  setForm((prev) => ({
                    ...prev,
                    role: (event.target as HTMLInputElement).value,
                  }));
                }}
                placeholder="Masonry lead"
                value={form.role}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="assign-contractor-submilestone">
                Submilestone
              </FieldLabel>
              <NativeSelect
                className="w-full"
                id="assign-contractor-submilestone"
                onChange={(event) => {
                  setForm((prev) => ({
                    ...prev,
                    submilestoneKey: event.currentTarget.value,
                  }));
                }}
                value={form.submilestoneKey}
              >
                <NativeSelectOption value="">
                  Milestone level
                </NativeSelectOption>
                {(activeMilestone?.submilestoneSnapshot ?? []).map(
                  (submilestone) => (
                    <NativeSelectOption
                      key={submilestone.key}
                      value={submilestone.key}
                    >
                      {submilestone.name}
                    </NativeSelectOption>
                  )
                )}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="assign-contractor-hours">
                Estimated hours
              </FieldLabel>
              <Input
                id="assign-contractor-hours"
                inputMode="decimal"
                nativeInput
                onChange={(event) => {
                  setForm((prev) => ({
                    ...prev,
                    estimatedHours: (event.target as HTMLInputElement).value,
                  }));
                }}
                placeholder="48"
                type="number"
                value={form.estimatedHours}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="assign-contractor-cost">
                Estimated cost
              </FieldLabel>
              <Input
                id="assign-contractor-cost"
                inputMode="decimal"
                nativeInput
                onChange={(event) => {
                  setForm((prev) => ({
                    ...prev,
                    estimatedCost: (event.target as HTMLInputElement).value,
                  }));
                }}
                placeholder="4320.00"
                type="number"
                value={form.estimatedCost}
              />
            </Field>
            {error ? (
              <p
                className="text-destructive text-sm md:col-span-2"
                role="alert"
              >
                {error}
              </p>
            ) : null}
          </form>
        </DialogPanel>
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>
            Cancel
          </DialogClose>
          <Button
            disabled={!canAssign}
            form="assign-contractor-form"
            loading={pending}
            type="submit"
          >
            <UserPlus />
            Confirm assignment
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

function ChipList({ empty, values }: { empty: string; values: string[] }) {
  if (values.length === 0) {
    return <p className="text-muted-foreground text-sm">{empty}</p>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map((value) => (
        <Badge key={value} variant="secondary">
          {value}
        </Badge>
      ))}
    </div>
  );
}

function PlanningInsightsSection({
  planning,
}: {
  planning?: ContractorPlanningModel | null;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-xl border border-border/80 bg-background p-5">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="size-4 text-primary" />
          <h4 className="font-medium text-sm">Permit fit</h4>
        </div>
        <div className="mt-4 grid gap-4">
          <ChipList
            empty="No permit or roadmap material signal detected yet."
            values={(planning?.materialSignals ?? []).map(
              (signal) => signal.label
            )}
          />
          <div className="grid gap-2">
            {(planning?.recommendations ?? []).slice(0, 4).map((row) => (
              <div
                className="rounded-lg border border-border/60 bg-muted/15 px-3 py-2.5"
                key={row.contractorId}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate font-medium text-sm">{row.name}</p>
                  <Badge variant="secondary">{row.score}</Badge>
                </div>
                <p className="mt-1 text-muted-foreground text-xs">
                  {row.matchedSignals.length > 0
                    ? row.matchedSignals
                        .map((signal) => signal.label)
                        .join(", ")
                    : "General fit"}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border/80 bg-background p-5">
        <div className="flex items-center gap-2">
          <CalendarClock className="size-4 text-primary" />
          <h4 className="font-medium text-sm">Scheduling intelligence</h4>
        </div>
        <div className="mt-4 grid gap-4">
          {(planning?.conflicts ?? []).length > 0 ? (
            (planning?.conflicts ?? []).map((conflict, index) => (
              <div
                className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm"
                key={`${conflict.contractorId}-${index}`}
              >
                <p className="flex items-center gap-2 font-medium">
                  <AlertTriangle className="size-4" />
                  {conflict.contractorName}
                </p>
                <p className="mt-1 text-muted-foreground text-xs">
                  Day {conflict.overlapStartDay}-{conflict.overlapEndDay}:{" "}
                  {conflict.leftLabel} overlaps {conflict.rightLabel}.
                </p>
              </div>
            ))
          ) : (
            <p className="rounded-lg border border-dashed px-3 py-4 text-muted-foreground text-sm">
              No contractor allocation conflicts detected.
            </p>
          )}
          <div className="grid gap-2">
            {(planning?.utilization ?? []).map((row) => (
              <div
                className="rounded-lg border border-border/60 bg-muted/15 px-3 py-2.5"
                key={row.contractorId}
              >
                <p className="truncate font-medium text-sm">{row.name}</p>
                <p className="mt-1 text-muted-foreground text-xs tabular-nums">
                  {row.scheduledHours}h scheduled ·{" "}
                  {row.utilizationPercent ?? 0}% of weekly window
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function moneyToCents(value: string) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return;
  }
  return Math.round(parsed * 100);
}

function hoursFromInput(value: string) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return;
  }
  return Math.round(parsed * 100) / 100;
}
