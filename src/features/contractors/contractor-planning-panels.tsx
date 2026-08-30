import {
  useDraggable,
  useDroppable,
} from "@dnd-kit/core";
import {
  ArrowRight,
  Hammer,
  MailPlus,
  Search,
  UserPlus,
} from "lucide-react";
import { useMemo } from "react";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Card, CardContent } from "#/components/ui/card.tsx";
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
import type {
  AssignmentFilter,
  ContractorPlanningMilestone,
  ContractorPlanningModel,
  MilestoneAssignment,
  ProposalContractor,
} from "./ContractorPlanningPanel.tsx";

export const contractorDragId = (contractorId: string) =>
  `contractor:${contractorId}`;
export const milestoneDropId = (milestoneKey: string) =>
  `milestone:${milestoneKey}`;

export function PlanningMetric({
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

export function AssignmentWorkflowBar({
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

export function ContractorRosterPanel({
  assignmentCountByContractor,
  assignmentFilter,
  canDrag,
  className,
  contractors,
  invitePendingContractorId,
  onAssignmentFilterChange,
  onInviteContractor,
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
  invitePendingContractorId: string | null;
  onAssignmentFilterChange: (value: AssignmentFilter) => void;
  onInviteContractor?: (contractor: ProposalContractor) => void;
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
                invitePending={
                  invitePendingContractorId === contractor.contractorId
                }
                isSelected={selectedContractorId === contractor.contractorId}
                key={contractor.contractorId}
                onInvite={onInviteContractor}
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
  invitePending,
  isSelected,
  onInvite,
  onSelect,
}: {
  assignmentCount: number;
  canDrag: boolean;
  contractor: ProposalContractor;
  invitePending: boolean;
  isSelected: boolean;
  onInvite?: (contractor: ProposalContractor) => void;
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
      invitePending={invitePending}
      isDragging={isDragging}
      isSelected={isSelected}
      onInvite={onInvite}
      onSelect={onSelect}
      setDragNodeRef={canDrag ? setNodeRef : undefined}
    />
  );
}

export function ContractorProfileCard({
  assignmentCount,
  contractor,
  dragAttributes,
  dragListeners,
  invitePending = false,
  isDragging = false,
  isSelected = false,
  onInvite,
  onSelect,
  setDragNodeRef,
}: {
  assignmentCount: number;
  contractor: ProposalContractor;
  dragAttributes?: ReturnType<typeof useDraggable>["attributes"];
  dragListeners?: ReturnType<typeof useDraggable>["listeners"];
  invitePending?: boolean;
  isDragging?: boolean;
  isSelected?: boolean;
  onInvite?: (contractor: ProposalContractor) => void;
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
        isDraggable && "touch-none",
        isInteractive && "hover:border-primary/30"
      )}
      data-testid={`contractor-card-${contractor.contractorId}`}
      ref={setDragNodeRef}
    >
      <CardContent className="grid gap-2 p-3">
        {isInteractive ? (
          <button
            {...dragListeners}
            {...dragAttributes}
            aria-label={`Select ${contractor.name}`}
            aria-pressed={isSelected}
            className={cn(
              "flex min-h-11 w-full items-start gap-2 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
              isDraggable && "cursor-grab active:cursor-grabbing"
            )}
            onClick={onSelect}
            type="button"
          >
            <ContractorProfileCardBody
              assignmentCount={assignmentCount}
              contractor={contractor}
            />
          </button>
        ) : (
          <div className="flex items-start gap-2">
            <ContractorProfileCardBody
              assignmentCount={assignmentCount}
              contractor={contractor}
            />
          </div>
        )}
        <ContractorInviteAction
          className="ml-12"
          contractor={contractor}
          pending={invitePending}
          onInvite={onInvite}
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

export function MilestoneAssignmentPanel({
  assignmentsByMilestone,
  canMutate,
  className,
  draggingContractorId,
  invitePendingContractorId,
  milestones,
  onAssign,
  onEditAssignment,
  onRemoveAssignment,
  onInviteContractor,
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
  invitePendingContractorId: string | null;
  milestones: ContractorPlanningMilestone[];
  onAssign: (milestoneKey: string) => void;
  onEditAssignment?: (milestoneKey: string, contractorId: string) => void;
  onRemoveAssignment?: (assignment: MilestoneAssignment) => void;
  onInviteContractor?: (contractor: ProposalContractor) => void;
  proposalContractors: ProposalContractor[];
  selectedContractorId: string | null;
}) {
  const isDragging = draggingContractorId !== null;
  const contractorsById = useMemo(
    () =>
      new Map(
        proposalContractors.map((contractor) => [
          contractor.contractorId,
          contractor,
        ])
      ),
    [proposalContractors]
  );

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
              invitePendingContractorId={invitePendingContractorId}
              key={milestone.milestoneKey}
              milestone={milestone}
              onAssign={() => {
                onAssign(milestone.milestoneKey);
              }}
              onEditAssignment={
                onEditAssignment
                  ? (contractorId) => {
                      onEditAssignment(milestone.milestoneKey, contractorId);
                    }
                  : undefined
              }
              onRemoveAssignment={onRemoveAssignment}
              onInviteContractor={onInviteContractor}
              proposalContractorsById={contractorsById}
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
  invitePendingContractorId,
  milestone,
  onAssign,
  onEditAssignment,
  onRemoveAssignment,
  onInviteContractor,
  proposalContractorsById,
  rosterEmpty,
  selectedContractorId,
}: {
  assignments: NonNullable<ContractorPlanningModel["milestoneAssignments"]>;
  canMutate: boolean;
  isDragging: boolean;
  invitePendingContractorId: string | null;
  milestone: ContractorPlanningMilestone;
  onAssign: () => void;
  onEditAssignment?: (contractorId: string) => void;
  onRemoveAssignment?: (assignment: MilestoneAssignment) => void;
  onInviteContractor?: (contractor: ProposalContractor) => void;
  proposalContractorsById: Map<string, ProposalContractor>;
  rosterEmpty: boolean;
  selectedContractorId: string | null;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: milestoneDropId(milestone.milestoneKey),
  });
  const showDropTarget = isDragging || isOver;
  const assignDisabled = rosterEmpty || !selectedContractorId;
  const assignmentRequirementId = `assign-${milestone.milestoneKey}-requirements`;

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
                <MilestoneAssignmentRow
                  assignment={assignment}
                  contractor={proposalContractorsById.get(
                    assignment.contractorId
                  )}
                  invitePending={
                    invitePendingContractorId === assignment.contractorId
                  }
                  key={assignment._id}
                  onEditAssignment={onEditAssignment}
                  onRemoveAssignment={onRemoveAssignment}
                  onInviteContractor={onInviteContractor}
                />
              ))}
            </ul>
          )}
        </div>

        {canMutate ? (
          <FrameFooter className="grid gap-2 border-border/60 border-t py-3">
            <Button
              aria-describedby={
                assignDisabled ? assignmentRequirementId : undefined
              }
              className="min-h-11 w-full sm:min-h-0 sm:w-auto"
              data-testid={`proposal-milestone-assign-contractor-${milestone.milestoneKey}`}
              disabled={assignDisabled}
              onClick={onAssign}
              size="sm"
              type="button"
              variant="outline"
            >
              <UserPlus />
              Assign crew
            </Button>
            {assignDisabled ? (
              <p
                className="text-muted-foreground text-xs"
                id={assignmentRequirementId}
              >
                {rosterEmpty
                  ? "Add a contractor to the proposal roster before assigning crew."
                  : "Select one contractor from the roster before assigning crew."}
              </p>
            ) : null}
          </FrameFooter>
        ) : null}
      </FramePanel>
    </Frame>
  );
}

function MilestoneAssignmentRow({
  assignment,
  contractor,
  invitePending,
  onEditAssignment,
  onRemoveAssignment,
  onInviteContractor,
}: {
  assignment: NonNullable<
    ContractorPlanningModel["milestoneAssignments"]
  >[number];
  contractor?: ProposalContractor;
  invitePending: boolean;
  onEditAssignment?: (contractorId: string) => void;
  onRemoveAssignment?: (assignment: MilestoneAssignment) => void;
  onInviteContractor?: (contractor: ProposalContractor) => void;
}) {
  return (
    <li
      className="grid gap-2 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
      data-testid={`proposal-milestone-assignment-${assignment._id}`}
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
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        {contractor ? (
          <ContractorInviteAction
            contractor={contractor}
            pending={invitePending}
            onInvite={onInviteContractor}
          />
        ) : null}
        {onEditAssignment ? (
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
        ) : null}
        {onRemoveAssignment ? (
          <Button
            onClick={() => onRemoveAssignment(assignment)}
            size="sm"
            type="button"
            variant="destructive-outline"
          >
            Remove
          </Button>
        ) : null}
      </div>
    </li>
  );
}

type ContractorInvitationState =
  | {
      description: string;
      kind: "not_invited";
      label: string;
    }
  | {
      description: string;
      kind: "invited";
      label: string;
    }
  | {
      description: string;
      kind: "joined";
      label: string;
    }
  | {
      description: string;
      kind: "no_email";
      label: string;
    };

export function contractorInvitationState(
  contractor: ProposalContractor
): ContractorInvitationState {
  if (contractor.onboardingStatus === "account_linked") {
    return {
      description: "This contractor has joined the platform.",
      kind: "joined",
      label: "Joined",
    };
  }
  if (contractor.onboardingStatus === "invited") {
    return {
      description: "This contractor already has an active platform invite.",
      kind: "invited",
      label: "Invited",
    };
  }
  if (!contractor.email?.trim()) {
    return {
      description: "Add an email to the contractor profile before inviting.",
      kind: "no_email",
      label: "No email",
    };
  }
  return {
    description: "Send this contractor a platform invite.",
    kind: "not_invited",
    label: "Not invited",
  };
}

function ContractorInviteAction({
  className,
  contractor,
  onInvite,
  pending,
}: {
  className?: string;
  contractor: ProposalContractor;
  onInvite?: (contractor: ProposalContractor) => void;
  pending: boolean;
}) {
  const invitation = contractorInvitationState(contractor);
  const canInvite = Boolean(onInvite) && invitation.kind === "not_invited";
  const showButton = Boolean(onInvite) && invitation.kind === "not_invited";

  return (
    <span className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <Badge
        className="shrink-0"
        title={invitation.description}
        variant={invitation.kind === "not_invited" ? "outline" : "secondary"}
      >
        {invitation.label}
      </Badge>
      {showButton ? (
        <Button
          aria-label={`Invite ${contractor.name} to platform`}
          disabled={!canInvite || pending}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (canInvite) {
              onInvite?.(contractor);
            }
          }}
          size="sm"
          title={invitation.description}
          type="button"
          variant="outline"
        >
          <MailPlus />
          {pending ? "Sending..." : "Invite"}
        </Button>
      ) : null}
    </span>
  );
}
