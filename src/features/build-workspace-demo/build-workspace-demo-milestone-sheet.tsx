import { addDays, format } from "date-fns";
import {
  Check,
  ClipboardCheck,
  MapPinOff,
  MoveRight,
  Plus,
  Scissors,
  ShieldCheck,
  Upload,
  UserPlus,
} from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Card, CardContent } from "#/components/ui/card.tsx";
import { Input } from "#/components/ui/input.tsx";
import {
  NativeSelect,
  NativeSelectOption,
} from "#/components/ui/native-select.tsx";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "#/components/ui/sheet.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import { ContractorQuickAddDrawer } from "#/features/contractors/ContractorQuickAddDrawer.tsx";
import { TimelineMilestoneContractorList } from "#/features/timeline-workspace/TimelineMilestoneContractorList.tsx";
import type { Id } from "../../../convex/_generated/dataModel";
import { parseGanttMilestoneScopeId } from "./build-workspace-contractor-planning.ts";
import {
  fromDateInputValue,
  milestoneStatuses,
  parseNumber,
  roleLabels,
  statusLabels,
  toDateInputValue,
} from "./build-workspace-demo-contracts";
import { DependencyList } from "./build-workspace-demo-inspection";
import { Field, IssueList, Panel } from "./build-workspace-demo-issues";
import type {
  DependencyHardness,
  DrawGroup,
  Milestone,
  MilestoneStatus,
} from "./types";
import { useBuildWorkspace } from "./workspace-adapter";

export function MilestoneDetailSheet({
  canFinalizeMilestones,
  milestone,
  draw,
  open,
  onOpenSubmilestone,
  onOpenChange,
  viewer,
}: {
  canFinalizeMilestones: boolean;
  milestone: Milestone;
  draw: DrawGroup | undefined;
  open: boolean;
  onOpenSubmilestone?: (submilestoneId: Id<"buildSubmilestones">) => void;
  onOpenChange: (open: boolean) => void;
  viewer: "builder" | "lender";
}) {
  const workspace = useBuildWorkspace();
  const isLenderViewer = viewer === "lender";
  const [draft, setDraft] = useState({
    actualCost: String(milestone.actualCost),
    completionReport: milestone.completionReport,
    estimatedCost: String(milestone.estimatedCost),
    estimatedDurationDays: String(milestone.estimatedDurationDays),
    lane: milestone.lane,
    name: milestone.name,
    notes: milestone.notes,
    progress: String(milestone.progress),
    startAt: toDateInputValue(milestone.startAt),
    status: milestone.status,
  });
  const [reason, setReason] = useState("Reviewed in demo workspace.");
  const [dependencyTarget, setDependencyTarget] = useState(
    workspace.milestones.find((item) => item.id !== milestone.id)?.id ?? ""
  );
  const [parentTarget, setParentTarget] = useState("");
  const [dependencyHardness, setDependencyHardnessDraft] =
    useState<DependencyHardness>("hard");
  const [assignContractorOpen, setAssignContractorOpen] = useState(false);

  const contractorMilestoneKey =
    workspace.resolveContractorMilestoneKey?.(milestone.id) ??
    parseGanttMilestoneScopeId(milestone.id).milestoneKey;
  const contractorScope = parseGanttMilestoneScopeId(milestone.id);
  const canAssignContractor = Boolean(
    workspace.assignContractorToMilestone || workspace.createAndAssignContractor
  );
  const contractorOptions =
    workspace.contractorPlanning?.availableContractors ??
    workspace.contractorPlanning?.proposalContractors?.map((contractor) => ({
      _id: contractor.contractorId,
      city: contractor.city,
      defaultPayRateCents: contractor.defaultPayRateCents,
      defaultPayRateUnit: contractor.defaultPayRateUnit,
      name: contractor.name,
      trades: contractor.trades,
    })) ??
    [];
  const parentMoveTargets =
    workspace.listSubmilestoneParentTargets?.(milestone.id) ?? [];
  const firstEnabledParentTarget = parentMoveTargets.find(
    (target) => !target.disabled
  );
  const canMoveParent =
    workspace.mode === "proposal" &&
    workspace.build.proposalStatus !== "submitted" &&
    Boolean(workspace.moveSubmilestoneToParent) &&
    Boolean(firstEnabledParentTarget);

  useEffect(() => {
    setDraft({
      actualCost: String(milestone.actualCost),
      completionReport: milestone.completionReport,
      estimatedCost: String(milestone.estimatedCost),
      estimatedDurationDays: String(milestone.estimatedDurationDays),
      lane: milestone.lane,
      name: milestone.name,
      notes: milestone.notes,
      progress: String(milestone.progress),
      startAt: toDateInputValue(milestone.startAt),
      status: milestone.status,
    });
    setDependencyTarget(
      workspace.milestones.find((item) => item.id !== milestone.id)?.id ?? ""
    );
    setParentTarget(firstEnabledParentTarget?.id ?? "");
    setAssignContractorOpen(false);
  }, [firstEnabledParentTarget?.id, milestone, workspace.milestones]);

  const incoming = workspace.dependencies.filter(
    (dependency) => dependency.toMilestoneId === milestone.id
  );
  const outgoing = workspace.dependencies.filter(
    (dependency) => dependency.fromMilestoneId === milestone.id
  );
  const currentDrawIndex = workspace.drawGroups.findIndex(
    (drawGroup) => drawGroup.id === milestone.drawGroupId
  );
  const previousDraw = workspace.drawGroups[currentDrawIndex - 1];
  const nextDraw = workspace.drawGroups[currentDrawIndex + 1];

  const saveMilestone = async () => {
    const duration = Math.max(
      1,
      parseNumber(draft.estimatedDurationDays, milestone.estimatedDurationDays)
    );
    const startAt = fromDateInputValue(draft.startAt);

    await workspace.updateMilestone(milestone.id, {
      estimatedCost: parseNumber(draft.estimatedCost, milestone.estimatedCost),
      estimatedDurationDays: duration,
      progress: Math.min(100, Math.max(0, parseNumber(draft.progress, 0))),
    });
    await workspace.moveMilestoneDates(
      milestone.id,
      startAt,
      addDays(startAt, duration - 1),
      reason
    );
  };

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        className="w-full overflow-y-auto border-border bg-popover text-foreground sm:max-w-xl"
        data-testid="milestone-detail-sheet"
      >
        <SheetHeader className="border-border border-b">
          <div className="flex items-center justify-between gap-3 pr-8">
            <div>
              <SheetTitle className="text-foreground">
                {milestone.code} / {milestone.name}
              </SheetTitle>
              <div className="mt-1 flex flex-wrap gap-1">
                <Badge className="border-cyan-300/20 bg-cyan-300/10 text-cyan-700 dark:text-cyan-100">
                  {draw?.label}
                </Badge>
                <Badge variant="outline">
                  {statusLabels[milestone.status]}
                </Badge>
                <Badge variant="outline">
                  {statusLabels[milestone.evidenceStatus]}
                </Badge>
                <IssueList
                  issues={milestone.issues}
                  surface="detail"
                  testIdPrefix={`detail-issue-${milestone.id}`}
                />
              </div>
            </div>
            <Button
              data-testid="milestone-detail-close"
              onClick={() => onOpenChange(false)}
              variant="outline"
            >
              Close
            </Button>
          </div>
        </SheetHeader>

        <div className="grid gap-4 p-4">
          <Panel title="Milestone Estimate">
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="Name">
                <Input
                  data-testid="milestone-name-input"
                  disabled
                  onChange={(event) => {
                    const { value } = event.currentTarget;

                    setDraft((current) => ({
                      ...current,
                      name: value,
                    }));
                  }}
                  value={draft.name}
                />
              </Field>
              <Field label="Status">
                <NativeSelect
                  className="w-full"
                  data-testid="milestone-status-select"
                  disabled
                  onChange={(event) => {
                    const value = event.currentTarget.value as MilestoneStatus;

                    setDraft((current) => ({
                      ...current,
                      status: value,
                    }));
                  }}
                  value={draft.status}
                >
                  {milestoneStatuses.map((status) => (
                    <NativeSelectOption key={status} value={status}>
                      {statusLabels[status]}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Estimated cost">
                <Input
                  data-testid="milestone-estimated-cost-input"
                  disabled={workspace.mode === "active"}
                  inputMode="numeric"
                  onBlur={(event) => {
                    if (
                      workspace.mode === "proposal" &&
                      workspace.build.proposalStatus !== "submitted"
                    ) {
                      void workspace.updateMilestone(milestone.id, {
                        estimatedCost: parseNumber(
                          event.currentTarget.value,
                          milestone.estimatedCost
                        ),
                      });
                    }
                  }}
                  onChange={(event) => {
                    const { value } = event.currentTarget;

                    setDraft((current) => ({
                      ...current,
                      estimatedCost: value,
                    }));
                  }}
                  value={draft.estimatedCost}
                />
              </Field>
              <Field
                label={
                  workspace.mode === "active"
                    ? "Requested draw amount"
                    : "Actual cost"
                }
              >
                <Input
                  data-testid="milestone-actual-cost-input"
                  disabled={workspace.mode === "proposal"}
                  inputMode="numeric"
                  onChange={(event) => {
                    const { value } = event.currentTarget;

                    setDraft((current) => ({
                      ...current,
                      actualCost: value,
                    }));
                  }}
                  value={draft.actualCost}
                />
              </Field>
              <Field label="Start date">
                <Input
                  data-testid="milestone-start-date-input"
                  onChange={(event) => {
                    const { value } = event.currentTarget;

                    setDraft((current) => ({
                      ...current,
                      startAt: value,
                    }));
                  }}
                  type="date"
                  value={draft.startAt}
                />
              </Field>
              <Field label="Duration days">
                <Input
                  data-testid="milestone-duration-input"
                  inputMode="numeric"
                  onBlur={(event) => {
                    if (
                      workspace.mode === "proposal" &&
                      workspace.build.proposalStatus !== "submitted"
                    ) {
                      void workspace.updateMilestone(milestone.id, {
                        estimatedDurationDays: Math.max(
                          1,
                          parseNumber(
                            event.currentTarget.value,
                            milestone.estimatedDurationDays
                          )
                        ),
                      });
                    }
                  }}
                  onChange={(event) => {
                    const { value } = event.currentTarget;

                    setDraft((current) => ({
                      ...current,
                      estimatedDurationDays: value,
                    }));
                  }}
                  value={draft.estimatedDurationDays}
                />
              </Field>
              <Field label="Lane">
                <Input
                  data-testid="milestone-lane-input"
                  disabled
                  onChange={(event) => {
                    const { value } = event.currentTarget;

                    setDraft((current) => ({
                      ...current,
                      lane: value,
                    }));
                  }}
                  value={draft.lane}
                />
              </Field>
              <Field label="Progress">
                <Input
                  data-testid="milestone-progress-input"
                  disabled={workspace.mode === "proposal"}
                  inputMode="numeric"
                  onChange={(event) => {
                    const { value } = event.currentTarget;

                    setDraft((current) => ({
                      ...current,
                      progress: value,
                    }));
                  }}
                  value={draft.progress}
                />
              </Field>
              {workspace.moveSubmilestoneToParent &&
              parentMoveTargets.length > 0 ? (
                <div className="grid gap-2 sm:col-span-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <Field label="Parent milestone">
                    <NativeSelect
                      className="w-full"
                      data-testid="move-to-parent-milestone-select"
                      disabled={!canMoveParent}
                      onChange={(event) =>
                        setParentTarget(event.currentTarget.value)
                      }
                      value={parentTarget}
                    >
                      {parentMoveTargets.map((target) => (
                        <NativeSelectOption
                          disabled={target.disabled}
                          key={target.id}
                          value={target.id}
                        >
                          {target.disabled && target.reason
                            ? `${target.label} (${target.reason})`
                            : target.label}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Button
                    className="self-end"
                    data-testid="move-to-parent-milestone"
                    disabled={!(canMoveParent && parentTarget)}
                    onClick={() =>
                      parentTarget &&
                      void workspace.moveSubmilestoneToParent?.(
                        milestone.id,
                        parentTarget
                      )
                    }
                    variant="outline"
                  >
                    <MoveRight />
                    Move
                  </Button>
                </div>
              ) : null}
            </div>
            <Field label="Notes">
              <Textarea
                data-testid="milestone-notes-input"
                disabled
                onChange={(event) => {
                  const { value } = event.currentTarget;

                  setDraft((current) => ({
                    ...current,
                    notes: value,
                  }));
                }}
                value={draft.notes}
              />
            </Field>
            <div className="flex justify-end">
              <Button
                data-testid="save-milestone"
                disabled={
                  workspace.mode === "proposal" &&
                  workspace.build.proposalStatus === "submitted"
                }
                onClick={() => void saveMilestone()}
              >
                <Check />
                Save milestone
              </Button>
            </div>
          </Panel>

          {milestone.submilestones?.length ? (
            <Panel title="Sub-milestones">
              <div className="grid gap-2">
                {milestone.submilestones.map((submilestone) =>
                  submilestone.canonicalId && onOpenSubmilestone ? (
                    <Button
                      aria-label={`Open Sub-milestone ${submilestone.name}`}
                      className="justify-start"
                      key={submilestone.key}
                      onClick={() =>
                        onOpenSubmilestone(submilestone.canonicalId!)
                      }
                      type="button"
                      variant="outline"
                    >
                      {submilestone.name}
                    </Button>
                  ) : (
                    <Card
                      className="rounded-md shadow-none"
                      key={submilestone.key}
                    >
                      <CardContent className="px-3 py-2 text-sm">
                        {submilestone.name}
                      </CardContent>
                    </Card>
                  )
                )}
              </div>
            </Panel>
          ) : null}

          {workspace.contractorPlanning || canAssignContractor ? (
            <Panel title="Contractors">
              {workspace.contractorPlanning ? (
                <TimelineMilestoneContractorList
                  milestoneKey={contractorMilestoneKey}
                  planning={workspace.contractorPlanning}
                  testIdPrefix="milestone-detail-contractor"
                />
              ) : (
                <p className="text-muted-foreground text-xs">
                  No contractors assigned to this milestone yet.
                </p>
              )}
              {canAssignContractor ? (
                <div className="flex justify-end">
                  <Button
                    data-testid="milestone-detail-assign-contractor"
                    onClick={() => setAssignContractorOpen(true)}
                    size="sm"
                    variant="outline"
                  >
                    <UserPlus />
                    Assign contractor
                  </Button>
                </div>
              ) : null}
            </Panel>
          ) : null}

          {workspace.mode === "proposal" ? (
            <Panel title="Draw Group Controls">
              <div className="grid gap-2 sm:grid-cols-2">
                <Field label="Move to draw">
                  <NativeSelect
                    className="w-full"
                    data-testid="move-to-draw-select"
                    disabled={workspace.build.proposalStatus === "submitted"}
                    onChange={(event) =>
                      void workspace.moveMilestoneToDrawGroup(
                        milestone.id,
                        event.currentTarget.value
                      )
                    }
                    value={milestone.drawGroupId}
                  >
                    {workspace.drawGroups.map((drawGroup) => (
                      <NativeSelectOption
                        key={drawGroup.id}
                        value={drawGroup.id}
                      >
                        {drawGroup.label} / {statusLabels[drawGroup.status]}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
                <div className="grid grid-cols-3 gap-2 self-end">
                  <Button
                    data-testid="split-draw"
                    disabled={
                      !draw || workspace.build.proposalStatus === "submitted"
                    }
                    onClick={() =>
                      draw &&
                      void workspace.splitDrawGroup(draw.id, milestone.id)
                    }
                    variant="outline"
                  >
                    <Scissors />
                    Split
                  </Button>
                  <Button
                    data-testid="merge-prev-draw"
                    disabled={
                      !previousDraw ||
                      workspace.build.proposalStatus === "submitted"
                    }
                    onClick={() =>
                      previousDraw &&
                      void workspace.mergeDrawGroups(
                        draw?.id ?? "",
                        previousDraw.id
                      )
                    }
                    variant="outline"
                  >
                    Merge prev
                  </Button>
                  <Button
                    data-testid="merge-next-draw"
                    disabled
                    title={
                      nextDraw
                        ? "Merge next is disabled in this demo; use the next draw's Merge prev control."
                        : "No next draw group."
                    }
                    variant="outline"
                  >
                    Merge next
                  </Button>
                </div>
              </div>
            </Panel>
          ) : null}

          {workspace.mode === "proposal" ? (
            <Panel title="Dependencies">
              <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                <NativeSelect
                  className="w-full"
                  data-testid="dependency-target-select"
                  onChange={(event) =>
                    setDependencyTarget(event.currentTarget.value)
                  }
                  value={dependencyTarget}
                >
                  {workspace.milestones
                    .filter((item) => item.id !== milestone.id)
                    .map((item) => (
                      <NativeSelectOption key={item.id} value={item.id}>
                        {item.code} / {item.name}
                      </NativeSelectOption>
                    ))}
                </NativeSelect>
                <NativeSelect
                  className="w-full"
                  data-testid="dependency-hardness-select"
                  onChange={(event) =>
                    setDependencyHardnessDraft(
                      event.currentTarget.value as DependencyHardness
                    )
                  }
                  value={dependencyHardness}
                >
                  <NativeSelectOption value="hard">Hard</NativeSelectOption>
                  <NativeSelectOption value="soft">Soft</NativeSelectOption>
                </NativeSelect>
                <Button
                  data-testid="add-dependency"
                  onClick={() =>
                    void workspace.addDependency(
                      dependencyTarget,
                      milestone.id,
                      dependencyHardness
                    )
                  }
                  variant="secondary"
                >
                  Add dependency
                </Button>
              </div>
              <DependencyList dependencies={[...incoming, ...outgoing]} />
            </Panel>
          ) : null}

          {workspace.mode === "active" ? (
            <Panel title="Evidence and Completion">
              <div className="grid gap-2 sm:grid-cols-2">
                <Button
                  data-testid="add-sample-evidence"
                  onClick={() => void workspace.addSampleEvidence(milestone.id)}
                  variant="outline"
                >
                  <Plus />
                  Add sample evidence
                </Button>
                <label className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-md border border-border bg-transparent px-3 text-sm hover:bg-muted/40">
                  <Upload className="size-4" />
                  Upload evidence
                  <input
                    className="sr-only"
                    data-testid="upload-evidence"
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0];
                      if (file) {
                        void workspace.uploadEvidence(milestone.id, file, true);
                      }
                    }}
                    type="file"
                  />
                </label>
                <Button
                  data-testid="upload-location-unverified"
                  onClick={() => {
                    const file = new File(
                      ["location unverified"],
                      "location-unverified.txt",
                      {
                        type: "text/plain",
                      }
                    );
                    void workspace.uploadEvidence(milestone.id, file, false);
                  }}
                  variant="outline"
                >
                  <MapPinOff />
                  Upload location-unverified
                </Button>
              </div>
              <Field label="Completion report">
                <Textarea
                  data-testid="completion-report-input"
                  onChange={(event) => {
                    const { value } = event.currentTarget;

                    setDraft((current) => ({
                      ...current,
                      completionReport: value,
                    }));
                  }}
                  value={draft.completionReport}
                />
              </Field>
              <Button
                data-testid="submit-completion-report"
                onClick={() =>
                  void workspace.submitCompletionClaim(
                    milestone.id,
                    Math.max(
                      0,
                      parseNumber(draft.actualCost, milestone.estimatedCost)
                    ) * 100
                  )
                }
                variant="secondary"
              >
                <ClipboardCheck />
                Submit completion report
              </Button>
            </Panel>
          ) : null}

          {workspace.mode === "active" && isLenderViewer ? (
            <Panel title="Lender Review, Site Visit, and Admin Approval">
              <Field label="Audit reason / review note">
                <Textarea
                  data-testid="audit-reason-input"
                  onChange={(event) => setReason(event.currentTarget.value)}
                  value={reason}
                />
              </Field>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button
                  data-testid="accept-evidence"
                  onClick={() =>
                    void workspace.reviewEvidence(milestone.id, true, reason)
                  }
                  variant="outline"
                >
                  Accept evidence
                </Button>
                <Button
                  data-testid="request-more-info"
                  onClick={() =>
                    void workspace.requestMoreInformation(milestone.id, reason)
                  }
                  variant="outline"
                >
                  Request more info
                </Button>
                <Button
                  data-testid="request-site-visit"
                  onClick={() =>
                    void workspace.requestSiteVisit(milestone.id, reason)
                  }
                  variant="outline"
                >
                  Request site visit
                </Button>
                <Button
                  data-testid="claim-site-visit"
                  onClick={() => void workspace.claimSiteVisit(milestone.id)}
                  variant="outline"
                >
                  Claim site visit
                </Button>
                <Button
                  data-testid="submit-site-visit-report"
                  onClick={() =>
                    void workspace.submitSiteVisitReport(milestone.id, {
                      completionObserved: true,
                      notes: reason,
                      recommendedOutcome: "approve",
                    })
                  }
                  variant="outline"
                >
                  Submit site visit report
                </Button>
                {canFinalizeMilestones ? (
                  <>
                    <Button
                      data-testid="reject-milestone"
                      onClick={() =>
                        void workspace.rejectMilestone(milestone.id, reason)
                      }
                      variant="outline"
                    >
                      Reject completion
                    </Button>
                    <Button
                      className="sm:col-span-2"
                      data-testid="approve-milestone"
                      onClick={() =>
                        void workspace.approveMilestone(milestone.id, reason)
                      }
                    >
                      <ShieldCheck />
                      Approve milestone
                    </Button>
                  </>
                ) : null}
              </div>
            </Panel>
          ) : null}

          <Panel title="Audit History">
            <div className="grid max-h-52 gap-2 overflow-y-auto pr-1">
              {workspace.auditEvents.slice(0, 10).map((event) => (
                <div
                  className="rounded-md border border-border bg-muted/30 p-2 text-xs"
                  key={event.id}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-foreground">
                      {event.message}
                    </span>
                    <span className="shrink-0 text-muted-foreground">
                      {format(new Date(event.timestamp), "MMM d, HH:mm")}
                    </span>
                  </div>
                  <div className="mt-1 text-muted-foreground">
                    {event.actor} / {roleLabels[event.role]}
                    {event.reason ? ` / ${event.reason}` : ""}
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </SheetContent>
      <ContractorQuickAddDrawer
        availableContractors={contractorOptions}
        createLabel="Create and assign"
        description="Assign an existing build contractor or create a profile and attach it to this milestone scope."
        onAttachExisting={async ({ assignmentCost, contractorId, role }) => {
          await workspace.assignContractorToMilestone?.({
            assignmentCost,
            contractorId,
            milestoneId: milestone.id,
            role,
            submilestoneKeys: contractorScope.submilestoneKeys,
          });
        }}
        onCreate={async ({ assignmentCost, contractor, role }) =>
          await workspace.createAndAssignContractor?.({
            assignmentCost,
            contractor,
            milestoneId: milestone.id,
            role: role ?? "Contractor",
            submilestoneKeys: contractorScope.submilestoneKeys,
          })
        }
        onInviteCreatedContractor={workspace.inviteContractor}
        onOpenChange={setAssignContractorOpen}
        open={assignContractorOpen}
        requireRole
        showAssignmentCost
        title={`Assign contractor to ${milestone.name}`}
      />
    </Sheet>
  );
}
