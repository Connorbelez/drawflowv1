"use client";

import {
  AlertTriangle,
  CalendarClock,
  Gauge,
  Hammer,
  Sparkles,
  UserPlus,
  Users,
  Wrench,
} from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "#/components/ui/card.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
import {
  NativeSelect,
  NativeSelectOption,
} from "#/components/ui/native-select.tsx";
import {
  ContractorQuickAddDrawer,
  type ContractorAssignmentCostDraft,
  type ContractorDrawerAvailableContractor,
  type ContractorProfileDraft,
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
  const proposalContractors = planning?.proposalContractors ?? [];
  const assignments = planning?.milestoneAssignments ?? [];
  const [form, setForm] = useState<AssignmentForm>(() => ({
    contractorId: proposalContractors[0]?.contractorId ?? "",
    estimatedCost: "",
    estimatedHours: "",
    milestoneKey: milestones[0]?.milestoneKey ?? "",
    role: proposalContractors[0]?.role ?? "Contractor",
    submilestoneKey: "",
  }));
  const activeMilestone = milestones.find(
    (milestone) => milestone.milestoneKey === form.milestoneKey,
  );
  const selectedContractor = proposalContractors.find(
    (contractor) => contractor.contractorId === form.contractorId,
  );
  const canAssign =
    Boolean(onAssignToMilestone) &&
    canMutate &&
    form.contractorId.length > 0 &&
    form.milestoneKey.length > 0 &&
    form.role.trim().length > 0 &&
    !pending;
  const contractorOptions = useMemo(
    () =>
      proposalContractors.map((contractor) => ({
        label: `${contractor.name} / ${contractor.role}`,
        value: contractor.contractorId,
      })),
    [proposalContractors],
  );

  const selectMilestoneForAssignment = (milestoneKey: string) => {
    const milestone = milestones.find((row) => row.milestoneKey === milestoneKey);
    const firstContractor = proposalContractors[0];
    setForm((prev) => ({
      ...prev,
      contractorId: prev.contractorId || firstContractor?.contractorId || "",
      milestoneKey,
      role: prev.role || firstContractor?.role || "Contractor",
      submilestoneKey: milestone?.submilestoneSnapshot?.[0]?.key ?? "",
    }));
  };

  const submitAssignment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canAssign || !onAssignToMilestone) return;
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

  return (
    <Frame data-testid="proposal-contractor-planning">
      <FramePanel className="grid gap-4 p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-5xl">
            <h2 className="font-semibold text-lg tracking-tight">
              Contractor planning
            </h2>
            <p className="mt-1 max-w-4xl text-muted-foreground text-sm">
              Add contractors to this proposal first, then assign those
              contractors to milestone or submilestone work before closing.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              data-testid="proposal-add-contractor"
              disabled={!canMutate || !(onCreateAndAttach || onAttachExisting)}
              onClick={() => setDrawerOpen(true)}
              type="button"
            >
              <UserPlus />
              Add contractor
            </Button>
          </div>
        </div>

        <section className="grid grid-flow-dense gap-3 lg:grid-cols-3">
          <PlanningMetricCard
            icon={<Users className="size-4" />}
            label="Proposal roster"
            value={String(proposalContractors.length)}
          />
          <PlanningMetricCard
            icon={<Gauge className="size-4" />}
            label="Open conflicts"
            tone={(planning?.conflicts?.length ?? 0) > 0 ? "warning" : "default"}
            value={String(planning?.conflicts?.length ?? 0)}
          />
          <PlanningMetricCard
            icon={<Wrench className="size-4" />}
            label="Equipment holds"
            value={String(planning?.equipmentSchedule?.length ?? 0)}
          />
        </section>

        <section className="grid grid-flow-dense gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Hammer className="size-4" />
                Milestone assignments
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 p-4 pt-2">
              <div className="grid gap-2">
                {milestones.map((milestone) => {
                  const milestoneAssignments = assignments.filter(
                    (assignment) =>
                      assignment.milestoneKey === milestone.milestoneKey,
                  );
                  return (
                    <div
                      className="group grid gap-3 rounded-lg border bg-card/70 p-3 transition-colors hover:bg-accent/35 md:grid-cols-[minmax(0,1fr)_auto]"
                      data-testid={`proposal-milestone-contractor-card-${milestone.milestoneKey}`}
                      key={milestone.milestoneKey}
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-sm">
                          {milestone.name}
                        </p>
                        <p className="mt-1 text-muted-foreground text-xs">
                          {milestoneAssignments.length === 0
                            ? "No contractor assigned"
                            : milestoneAssignments
                                .map(
                                  (assignment) =>
                                    `${assignment.contractorName} / ${assignment.role}`,
                                )
                                .join(", ")}
                        </p>
                      </div>
                      <Button
                        data-testid={`proposal-milestone-assign-contractor-${milestone.milestoneKey}`}
                        disabled={!canMutate || proposalContractors.length === 0}
                        onClick={() =>
                          selectMilestoneForAssignment(milestone.milestoneKey)
                        }
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        <UserPlus />
                        Assign contractor
                      </Button>
                    </div>
                  );
                })}
              </div>

              <form
                className="grid gap-3 rounded-lg border bg-muted/24 p-3 md:grid-cols-2"
                onSubmit={submitAssignment}
              >
                <Field label="Contractor">
                  <NativeSelect
                    className="w-full"
                    disabled={proposalContractors.length === 0}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      const next = proposalContractors.find(
                        (contractor) =>
                          contractor.contractorId === value,
                      );
                      setForm((prev) => ({
                        ...prev,
                        contractorId: value,
                        role: next?.role || prev.role,
                      }));
                    }}
                    value={form.contractorId}
                  >
                    <NativeSelectOption value="">
                      Select contractor
                    </NativeSelectOption>
                    {contractorOptions.map((option) => (
                      <NativeSelectOption key={option.value} value={option.value}>
                        {option.label}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
                <Field label="Milestone">
                  <NativeSelect
                    className="w-full"
                    onChange={(event) =>
                      selectMilestoneForAssignment(event.currentTarget.value)
                    }
                    value={form.milestoneKey}
                  >
                    {milestones.map((milestone) => (
                      <NativeSelectOption
                        key={milestone.milestoneKey}
                        value={milestone.milestoneKey}
                      >
                        {milestone.name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
                <Field label="Submilestone">
                  <NativeSelect
                    className="w-full"
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setForm((prev) => ({
                        ...prev,
                        submilestoneKey: value,
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
                      ),
                    )}
                  </NativeSelect>
                </Field>
                <Field label="Role">
                  <Input
                    nativeInput
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setForm((prev) => ({
                        ...prev,
                        role: value,
                      }));
                    }}
                    placeholder="Masonry lead"
                    value={form.role}
                  />
                </Field>
                <Field label="Estimated hours">
                  <Input
                    inputMode="decimal"
                    nativeInput
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setForm((prev) => ({
                        ...prev,
                        estimatedHours: value,
                      }));
                    }}
                    placeholder="48"
                    type="number"
                    value={form.estimatedHours}
                  />
                </Field>
                <Field label="Estimated cost">
                  <Input
                    inputMode="decimal"
                    nativeInput
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setForm((prev) => ({
                        ...prev,
                        estimatedCost: value,
                      }));
                    }}
                    placeholder="4320.00"
                    type="number"
                    value={form.estimatedCost}
                  />
                </Field>
                <div className="flex flex-wrap items-center gap-2 md:col-span-2">
                  <Button disabled={!canAssign} type="submit">
                    <UserPlus />
                    {pending ? "Assigning..." : "Attach contractor"}
                  </Button>
                  {selectedContractor ? (
                    <p className="text-muted-foreground text-xs">
                      {selectedContractor.name} is on the proposal roster as{" "}
                      {selectedContractor.role}.
                    </p>
                  ) : null}
                </div>
                {error ? (
                  <p className="text-destructive text-sm md:col-span-2">
                    {error}
                  </p>
                ) : null}
              </form>
            </CardContent>
          </Card>

          <div className="grid content-start gap-4">
            <Card>
              <CardHeader className="p-4 pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Sparkles className="size-4" />
                  Permit fit
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 p-4 pt-2">
                <ChipList
                  empty="No permit or roadmap material signal detected yet."
                  values={(planning?.materialSignals ?? []).map(
                    (signal) => signal.label,
                  )}
                />
                <div className="grid gap-2">
                  {(planning?.recommendations ?? []).slice(0, 4).map((row) => (
                    <div className="rounded-lg border bg-background/60 p-3" key={row.contractorId}>
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate font-medium text-sm">{row.name}</p>
                        <Badge variant="secondary">{row.score}</Badge>
                      </div>
                      <p className="mt-1 text-muted-foreground text-xs">
                        {row.matchedSignals.length > 0
                          ? row.matchedSignals.map((signal) => signal.label).join(", ")
                          : "General fit"}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="p-4 pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <CalendarClock className="size-4" />
                  Scheduling intelligence
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 p-4 pt-2">
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
                  <p className="rounded-lg border border-dashed p-3 text-muted-foreground text-sm">
                    No contractor allocation conflicts detected.
                  </p>
                )}
                <div className="grid gap-2">
                  {(planning?.utilization ?? []).map((row) => (
                    <div className="rounded-lg border bg-background/60 p-3" key={row.contractorId}>
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate font-medium text-sm">{row.name}</p>
                        <span className="text-muted-foreground text-xs tabular-nums">
                          {row.utilizationPercent ?? 0}%
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{
                            width: `${Math.min(100, row.utilizationPercent ?? 0)}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </section>
      </FramePanel>

      <ContractorQuickAddDrawer
        availableContractors={planning?.availableContractors ?? []}
        createLabel="Create and add"
        description={`Add a contractor to this ${roleLabel} planning roster with schedule, equipment, capability, and pay details.`}
        onAttachExisting={
          onAttachExisting
            ? ({ contractorId, role }) => onAttachExisting({ contractorId, role })
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

function PlanningMetricCard({
  icon,
  label,
  tone = "default",
  value,
}: {
  icon: React.ReactNode;
  label: string;
  tone?: "default" | "warning";
  value: string;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-3 p-4">
        <span
          className={
            tone === "warning"
              ? "grid size-9 place-items-center rounded-lg bg-warning/15 text-warning"
              : "grid size-9 place-items-center rounded-lg bg-primary/15 text-primary"
          }
        >
          {icon}
        </span>
        <div>
          <CardTitle className="text-base">{value}</CardTitle>
          <p className="text-muted-foreground text-xs">{label}</p>
        </div>
      </CardHeader>
    </Card>
  );
}

function Field({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="font-medium text-muted-foreground text-xs uppercase">
        {label}
      </span>
      {children}
    </label>
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

function moneyToCents(value: string) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return Math.round(parsed * 100);
}

function hoursFromInput(value: string) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return Math.round(parsed * 100) / 100;
}
