"use client";

import {
  type Announcements,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  AlertTriangle,
  CalendarClock,
  ClipboardCheck,
  UserPlus,
} from "lucide-react";
import {
  type FormEvent,
  useMemo,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";

import {
  type ContractorAssignmentCostDraft,
  type ContractorDrawerAvailableContractor,
  type ContractorProfileDraft,
  ContractorQuickAddDrawer,
} from "./ContractorQuickAddDrawer.tsx";
import {
  AssignmentDialog,
  RemoveAssignmentDialog,
} from "./contractor-planning-dialogs.tsx";
import {
  AssignmentWorkflowBar,
  ContractorProfileCard,
  ContractorRosterPanel,
  contractorInvitationState,
  MilestoneAssignmentPanel,
  PlanningMetric,
} from "./contractor-planning-panels.tsx";

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
    email?: string;
    name: string;
    onboardingStatus?: "profile_only" | "invited" | "account_linked";
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

export type ProposalContractor = NonNullable<
  ContractorPlanningModel["proposalContractors"]
>[number];
export type MilestoneAssignment = NonNullable<
  ContractorPlanningModel["milestoneAssignments"]
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
  onRemoveFromMilestone?: (input: {
    assignmentId: string;
    contractorId: string;
    milestoneKey: string;
    reason: string;
    submilestoneKey?: string;
  }) => Promise<void> | void;
  onAttachAndInviteExisting?: (input: {
    contractorId: string;
    role: string;
  }) => Promise<void> | void;
  onAttachExisting?: (input: {
    contractorId: string;
    role: string;
  }) => Promise<void> | void;
  onCreateAndAttach?: (input: {
    contractor: ContractorProfileDraft;
    role?: string;
  }) =>
    | Promise<void | string | { contractorId?: string }>
    | void
    | string
    | { contractorId?: string };
  onInviteCreatedContractor?: (contractorId: string) => Promise<void> | void;
  planning?: ContractorPlanningModel | null;
  roleLabel?: "builder" | "lender";
};

export type AssignmentForm = {
  contractorId: string;
  estimatedCost: string;
  estimatedHours: string;
  milestoneKey: string;
  role: string;
  submilestoneKey: string;
};

export type AssignmentFilter = "all" | "assigned" | "unassigned";

type AssignDialogState = {
  contractorId: string;
  milestoneKey: string;
};

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
  onRemoveFromMilestone,
  onAttachAndInviteExisting,
  onAttachExisting,
  onCreateAndAttach,
  onInviteCreatedContractor,
  planning,
  roleLabel = "builder",
}: ContractorPlanningPanelProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [invitePendingContractorId, setInvitePendingContractorId] = useState<
    string | null
  >(null);
  const [error, setError] = useState("");
  const [inviteError, setInviteError] = useState("");
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
  const [removeAssignment, setRemoveAssignment] =
    useState<MilestoneAssignment | null>(null);
  const [removalReason, setRemovalReason] = useState("");
  const [removalPending, setRemovalPending] = useState(false);
  const [removalError, setRemovalError] = useState("");
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
    } catch {
      setError(
        "We could not save this crew assignment. Review the fields and try again."
      );
    } finally {
      setPending(false);
    }
  };

  const submitRemoval = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!(removeAssignment && onRemoveFromMilestone)) {
      return;
    }
    const reason = removalReason.trim();
    if (!reason) {
      setRemovalError("A removal reason is required.");
      return;
    }
    setRemovalPending(true);
    setRemovalError("");
    try {
      await onRemoveFromMilestone({
        assignmentId: removeAssignment._id,
        contractorId: removeAssignment.contractorId,
        milestoneKey: removeAssignment.milestoneKey,
        reason,
        submilestoneKey: removeAssignment.submilestoneKey,
      });
      setRemoveAssignment(null);
      setRemovalReason("");
    } catch {
      setRemovalError(
        "We could not remove this crew assignment. Refresh and try again."
      );
    } finally {
      setRemovalPending(false);
    }
  };

  const inviteContractor = async (contractor: ProposalContractor) => {
    const invitation = contractorInvitationState(contractor);
    if (
      !(
        canMutate &&
        onInviteCreatedContractor &&
        invitation.kind === "not_invited"
      )
    ) {
      return;
    }
    setInvitePendingContractorId(contractor.contractorId);
    setInviteError("");
    try {
      await onInviteCreatedContractor(contractor.contractorId);
    } catch {
      setInviteError(
        "We could not send this invitation. Confirm the contractor email and try again."
      );
    } finally {
      setInvitePendingContractorId(null);
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
            {canMutate && (onCreateAndAttach || onAttachExisting) ? (
              <Button
                className="shrink-0"
                data-testid="proposal-add-contractor"
                onClick={() => setDrawerOpen(true)}
                type="button"
              >
                <UserPlus />
                Add contractor
              </Button>
            ) : null}
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
          {inviteError ? (
            <p className="mt-3 text-destructive text-sm" role="alert">
              {inviteError}
            </p>
          ) : null}

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
                invitePendingContractorId={invitePendingContractorId}
                onAssignmentFilterChange={setAssignmentFilter}
                onInviteContractor={
                  canMutate && onInviteCreatedContractor
                    ? inviteContractor
                    : undefined
                }
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
                invitePendingContractorId={invitePendingContractorId}
                onAssign={(milestoneKey) => {
                  if (!selectedContractorId) {
                    return;
                  }
                  openAssignDialog(selectedContractorId, milestoneKey);
                }}
                onEditAssignment={
                  canMutate
                    ? (milestoneKey, contractorId) => {
                        openAssignDialog(contractorId, milestoneKey);
                      }
                    : undefined
                }
                onRemoveAssignment={
                  canMutate && onRemoveFromMilestone
                    ? (assignment) => {
                        setRemovalError("");
                        setRemovalReason("");
                        setRemoveAssignment(assignment);
                      }
                    : undefined
                }
                onInviteContractor={
                  canMutate && onInviteCreatedContractor
                    ? inviteContractor
                    : undefined
                }
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

      <RemoveAssignmentDialog
        assignment={removeAssignment}
        error={removalError}
        onOpenChange={(open) => {
          if (!open) {
            setRemoveAssignment(null);
            setRemovalReason("");
            setRemovalError("");
          }
        }}
        onReasonChange={setRemovalReason}
        pending={removalPending}
        reason={removalReason}
        submitRemoval={submitRemoval}
      />

      <ContractorQuickAddDrawer
        availableContractors={planning?.availableContractors ?? []}
        createLabel="Create and add"
        description={`Add a contractor to this ${roleLabel} planning roster with equipment, capability, pay, and contact details.`}
        onAttachAndInviteExisting={
          onAttachAndInviteExisting
            ? ({ contractorId, role }) =>
                onAttachAndInviteExisting({ contractorId, role })
            : undefined
        }
        onAttachExisting={
          onAttachExisting
            ? ({ contractorId, role }) =>
                onAttachExisting({ contractorId, role })
            : undefined
        }
        onCreate={({ contractor, role }) =>
          onCreateAndAttach?.({ contractor, role })
        }
        onInviteCreatedContractor={onInviteCreatedContractor}
        onOpenChange={setDrawerOpen}
        open={drawerOpen}
        requireRole
        title="Add contractor to proposal"
      />
    </Frame>
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
