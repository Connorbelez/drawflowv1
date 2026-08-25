"use client";

import { useMutation } from "convex/react";
import { ShieldAlert, UserPlus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Card,
  CardDescription,
  CardHeader,
  CardPanel,
  CardTitle,
} from "#/components/ui/card.tsx";
import { Frame, FramePanel } from "#/components/ui/frame.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Label } from "#/components/ui/label.tsx";
import { Separator } from "#/components/ui/separator.tsx";
import { api as apiRef } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  type ContractorAssignmentCostDraft,
  type ContractorDrawerAvailableContractor,
  type ContractorProfileDraft,
  ContractorQuickAddDrawer,
} from "../contractors/ContractorQuickAddDrawer.tsx";
import type {
  CanonicalWorkspaceBootstrap,
  CanonicalWorkspaceCollection,
  NavigationProps,
} from "./submilestone-detail-canonical-contracts.ts";
import {
  arrayValue,
  booleanValue,
  canMutate,
  capability,
  collectionRows,
  errorMessage,
  isStaleConflict,
  milestoneKeyFor,
  numberValue,
  object,
  optionalNumber,
  revisionFor,
  stableCommandKey,
  statusLabel,
  stringValue,
  submilestoneKeyFor,
  submilestoneNameFor,
} from "./submilestone-detail-canonical-contracts.ts";
import { CommandError } from "./submilestone-detail-canonical-command.tsx";
import { Metric } from "./submilestone-detail-canonical-overview.tsx";

export function CanonicalPeoplePanel({
  bootstrap,
  buildId,
  buildSubmilestoneId,
  collection,
  historyCollection,
  companionActionItemId: _companionActionItemId,
  onRetry,
  organizationId,
  readOnly,
  viewerCapacity: _viewerCapacity,
}: NavigationProps & {
  bootstrap: CanonicalWorkspaceBootstrap;
  collection: CanonicalWorkspaceCollection | undefined;
  historyCollection?: CanonicalWorkspaceCollection;
}) {
  const assignContractor = useMutation(
    apiRef.production_proposals.assignActiveBuildContractorToMilestone
  );
  const createAndAttach = useMutation(
    apiRef.production_proposals.createAndAttachActiveBuildContractor
  );
  const removeContractor = useMutation(
    apiRef.production_proposals.removeActiveBuildContractorFromMilestone
  );
  const people = object(bootstrap.people);
  const rows = collectionRows(collection);
  const assignedCount = numberValue(people.assigned, 0);
  const assignedProjection =
    people.assignedPerson ?? people.assignedContractor ?? people.assigned;
  const assigned =
    normalizeAssignedPerson(assignedProjection) ??
    normalizeAssignedPerson(
      rows.find((row) => stringValue(row.status).toLowerCase() !== "removed")
    ) ??
    (assignedCount > 0
      ? {
          contractorId: "redacted",
          displayName: "Participant redacted",
          redacted: true,
          role: "Contractor",
          status: "active",
        }
      : null);
  const history = [
    ...arrayValue(people.history).map(object),
    ...collectionRows(historyCollection),
  ];
  const historyRows =
    history.length > 0
      ? history
      : rows.filter(
          (row) =>
            !assigned ||
            stringValue(row.contractorId ?? row.id) !== assigned.contractorId
        );
  const participants = projectedPeopleParticipants(
    people.participants ??
      people.authorizedParticipants ??
      people.buildParticipants ??
      bootstrap.participants
  );
  const participantsPartial = booleanValue(people.participantsPartial, false);
  const available = projectedContractorCandidates(
    people.contractorCandidates,
    people.authorizedContractorCandidates,
    people.availableContractors,
    people.contractors,
    bootstrap.contractorCandidates
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removeReason, setRemoveReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const commandKeysRef = useRef(new Map<string, string>());
  const createdContractorsRef = useRef(new Map<string, string>());
  const workflowRevision = revisionFor(bootstrap);
  const hasRevision = workflowRevision !== undefined;
  const assignmentCapability = capability(bootstrap, "addAssignment");
  const removeCapability = capability(bootstrap, "removeAssignment");
  const assignmentAllowed =
    hasRevision && canMutate(bootstrap, readOnly, "addAssignment");
  const removeAllowed =
    Boolean(assigned) &&
    !assigned?.redacted &&
    assigned?.contractorId !== "redacted" &&
    hasRevision &&
    canMutate(bootstrap, readOnly, "removeAssignment");
  const milestoneKey = milestoneKeyFor(bootstrap);
  const submilestoneKey = submilestoneKeyFor(bootstrap);
  const targetScope = {
    buildId,
    buildSubmilestoneId,
    milestoneKey,
    submilestoneKey,
  };

  useEffect(() => {
    setDrawerOpen(false);
    setRemoveOpen(false);
    setRemoveReason("");
    setBusy(false);
    setError("");
    commandKeysRef.current.clear();
    createdContractorsRef.current.clear();
  }, [buildId, buildSubmilestoneId, milestoneKey, submilestoneKey]);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await action();
      setDrawerOpen(false);
      setRemoveOpen(false);
      setRemoveReason("");
    } catch (caught) {
      setError(errorMessage(caught));
      if (isStaleConflict(caught)) {
        onRetry?.();
      }
      throw caught;
    } finally {
      setBusy(false);
    }
  };

  const assignmentInput = async ({
    assignmentCost,
    contractorId,
    role,
  }: {
    assignmentCost?: ContractorAssignmentCostDraft;
    contractorId: string;
    role: string;
  }) => {
    if (workflowRevision === undefined) {
      throw new Error(
        "Refresh this Sub-milestone before changing its Work Allocation; its current version is unavailable."
      );
    }
    const fingerprint = JSON.stringify({
      ...targetScope,
      assignmentCost,
      contractorId: contractorId as Id<"contractorProfiles">,
      role,
    });
    const idempotencyKey = stableCommandKey(
      commandKeysRef.current,
      "submilestone-assignment",
      fingerprint
    );
    await assignContractor({
      ...(assignmentCost ?? {}),
      buildId,
      contractorId: contractorId as Id<"contractorProfiles">,
      expectedRevisions: { [submilestoneKey]: workflowRevision },
      idempotencyKey,
      milestoneKey,
      role,
      submilestoneKeys: [submilestoneKey],
      workosOrganizationId: organizationId,
    });
    commandKeysRef.current.delete(fingerprint);
    onRetry?.();
  };

  const removeAssignment = async () => {
    if (assigned?.redacted || assigned?.contractorId === "redacted") {
      throw new Error(
        "The assigned Contractor is redacted and cannot be removed."
      );
    }
    if (!(assigned && workflowRevision !== undefined)) {
      throw new Error(
        "Refresh this Sub-milestone before changing its Work Allocation; its current version is unavailable."
      );
    }
    const fingerprint = JSON.stringify({
      ...targetScope,
      contractorId: assigned.contractorId as Id<"contractorProfiles">,
      reason: removeReason.trim(),
    });
    const idempotencyKey = stableCommandKey(
      commandKeysRef.current,
      "submilestone-assignment-removal",
      fingerprint
    );
    await removeContractor({
      buildId,
      contractorId: assigned.contractorId as Id<"contractorProfiles">,
      expectedRevision: workflowRevision,
      idempotencyKey,
      milestoneKey,
      reason: removeReason.trim(),
      submilestoneKey,
      workosOrganizationId: organizationId,
    });
    commandKeysRef.current.delete(fingerprint);
    onRetry?.();
  };

  const createInput = async ({
    assignmentCost,
    contractor,
    role,
  }: {
    assignmentCost?: ContractorAssignmentCostDraft;
    contractor: ContractorProfileDraft;
    role?: string;
  }) => {
    const resolvedRole = role ?? contractor.trades[0] ?? "Contractor";
    const intentKey = JSON.stringify({
      ...targetScope,
      assignmentCost,
      contractor,
      role: resolvedRole,
    });
    const retainedContractorId = createdContractorsRef.current.get(intentKey);
    const contractorId =
      retainedContractorId ??
      stringValue(
        object(
          await createAndAttach({
            buildId,
            contractor,
            role: resolvedRole,
            workosOrganizationId: organizationId,
          })
        ).contractorId
      );
    if (!contractorId) {
      throw new Error(
        "The contractor profile was created without an id; the assignment was not changed."
      );
    }
    if (!retainedContractorId) {
      createdContractorsRef.current.set(intentKey, contractorId);
    }
    await assignmentInput({ assignmentCost, contractorId, role: resolvedRole });
    createdContractorsRef.current.delete(intentKey);
    return { contractorId };
  };

  return (
    <div className="space-y-4" data-testid="submilestone-people-collection">
      <Frame>
        <FramePanel className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-medium text-sm">People and Work Allocation</p>
              <p className="mt-1 text-muted-foreground text-xs">
                Names and contact details are redacted when your role cannot
                identify participants.
              </p>
            </div>
            {assignmentAllowed ? (
              <Button
                disabled={busy}
                onClick={() => setDrawerOpen(true)}
                size="sm"
                type="button"
              >
                <UserPlus aria-hidden="true" />
                Add assignment
              </Button>
            ) : null}
          </div>
          <Separator />
          <dl className="grid gap-4 sm:grid-cols-3">
            <Metric
              label="Participants"
              value={String(
                numberValue(people.participantCount, assigned ? 1 : 0)
              )}
            />
            <Metric
              label="Allocation history"
              value={String(
                numberValue(people.historyCount, historyRows.length)
              )}
            />
            <Metric
              label="Current state"
              value={
                assigned ? statusLabel(assigned.status) : "Assignment required"
              }
            />
          </dl>
          {assigned ? (
            <Card className="shadow-none">
              <CardHeader className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-sm">
                      {assigned.redacted
                        ? "Participant redacted"
                        : assigned.displayName}
                    </CardTitle>
                    <CardDescription>
                      {assigned.role || "Contractor"}
                    </CardDescription>
                  </div>
                  <Badge
                    variant={
                      assigned.status === "removed" ? "warning" : "success"
                    }
                  >
                    {statusLabel(assigned.status)}
                  </Badge>
                </div>
              </CardHeader>
              {removeAllowed ? (
                <CardPanel className="space-y-2 p-3 pt-0">
                  {removeOpen ? (
                    <div className="space-y-2">
                      <Label className="space-y-1 text-xs">
                        <span>Removal reason</span>
                        <Input
                          aria-label="Removal reason"
                          onChange={(event) =>
                            setRemoveReason(event.target.value)
                          }
                          value={removeReason}
                        />
                      </Label>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          disabled={busy || removeReason.trim().length < 3}
                          onClick={() =>
                            void run(removeAssignment).catch(() => undefined)
                          }
                          size="sm"
                          type="button"
                          variant="destructive"
                        >
                          Remove assignment
                        </Button>
                        <Button
                          onClick={() => setRemoveOpen(false)}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      onClick={() => setRemoveOpen(true)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <X aria-hidden="true" />
                      Remove assignment
                    </Button>
                  )}
                </CardPanel>
              ) : null}
            </Card>
          ) : (
            <Frame>
              <FramePanel className="flex items-center gap-2 p-3 text-muted-foreground text-sm">
                <ShieldAlert
                  aria-hidden="true"
                  className="size-4 text-warning"
                />
                Assignment required before a Contractor can operate this
                Sub-milestone.
              </FramePanel>
            </Frame>
          )}
          {participants.length > 0 ? (
            <section
              aria-labelledby="build-participants-heading"
              className="space-y-2"
              data-testid="submilestone-build-participants"
            >
              <h3
                className="font-medium text-sm"
                id="build-participants-heading"
              >
                Build participants
              </h3>
              {participantsPartial ? (
                <p className="text-muted-foreground text-xs">
                  Showing the first page of authorized build participants.
                </p>
              ) : null}
              <div className="divide-y">
                {participants.map((participant, index) => (
                  <div
                    className="flex items-center justify-between gap-3 p-3 text-sm"
                    data-participant-id={participant.id}
                    key={participant.id || `participant-${index}`}
                  >
                    <div className="min-w-0">
                      <p className="break-words font-medium">
                        {participant.redacted
                          ? "Participant redacted"
                          : participant.displayName}
                      </p>
                      <p className="break-words text-muted-foreground text-xs">
                        {participant.role}
                        {!participant.redacted && participant.email
                          ? ` · ${participant.email}`
                          : ""}
                      </p>
                    </div>
                    <Badge
                      variant={
                        participant.status === "removed" ? "warning" : "outline"
                      }
                    >
                      {statusLabel(participant.status)}
                    </Badge>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
          {!(readOnly || hasRevision) &&
          (assignmentCapability.allowed || removeCapability.allowed) ? (
            <p className="text-muted-foreground text-sm" role="status">
              Refresh this Sub-milestone before changing its Work Allocation;
              its current version is unavailable.
            </p>
          ) : null}
          {historyRows.length > 0 ? (
            <section
              aria-labelledby="allocation-history-heading"
              className="space-y-2"
            >
              <h3
                className="font-medium text-sm"
                id="allocation-history-heading"
              >
                Allocation history
              </h3>
              <div className="space-y-2">
                {historyRows.map((row, index) => {
                  const normalized = normalizeAssignedPerson(row);
                  return (
                    <div
                      className="flex flex-col items-start gap-1 border-b pb-2 text-sm last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                      key={stringValue(
                        row.id ?? row.assignmentId,
                        `history-${index}`
                      )}
                    >
                      <span className="break-words">
                        {normalized?.redacted
                          ? "Participant redacted"
                          : (normalized?.displayName ?? "Allocation event")}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {statusLabel(
                          row.historyType ?? row.status ?? "updated"
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}
          {error ? <CommandError error={error} retry={null} /> : null}
        </FramePanel>
      </Frame>
      {assignmentAllowed ? (
        <ContractorQuickAddDrawer
          availableContractors={available}
          createLabel="Create and assign"
          description="Attach an existing contractor or create a contractor profile, then assign it only to this Sub-milestone."
          onAttachExisting={async ({ assignmentCost, contractorId, role }) => {
            await run(() =>
              assignmentInput({ assignmentCost, contractorId, role })
            );
          }}
          onCreate={async ({ assignmentCost, contractor, role }) => {
            let result: unknown;
            await run(async () => {
              result = await createInput({ assignmentCost, contractor, role });
            });
            return result as { contractorId?: string } | undefined;
          }}
          onOpenChange={setDrawerOpen}
          open={drawerOpen}
          requireRole
          showAssignmentCost
          title={`Assign contractor to ${submilestoneNameFor(bootstrap)}`}
        />
      ) : null}
    </div>
  );
}

function normalizeAssignedPerson(value: unknown) {
  const row = object(value);
  const contractorId = stringValue(row.contractorId ?? row.id);
  if (!contractorId) {
    return null;
  }
  const redacted =
    booleanValue(row.redacted, false) || !stringValue(row.displayName);
  return {
    contractorId,
    displayName: redacted
      ? "Participant redacted"
      : stringValue(row.displayName),
    redacted,
    role: stringValue(row.role),
    status: stringValue(row.status, "active"),
  };
}

function projectedPeopleParticipants(value: unknown) {
  return arrayValue(value)
    .map((entry) => normalizeBuildParticipant(object(entry)))
    .filter((entry): entry is BuildParticipantProjection => entry !== null);
}

function normalizeBuildParticipant(
  value: Record<string, unknown>
): BuildParticipantProjection {
  const displayName = stringValue(value.displayName ?? value.name);
  const role = stringValue(value.role ?? value.participantRole, "Participant");
  const redacted = booleanValue(value.redacted, false) || !displayName;
  const id = stringValue(
    value.id ?? value.participantId ?? value.workosUserId ?? value.userId
  );
  return {
    displayName: redacted ? "Participant redacted" : displayName,
    email: redacted ? undefined : stringValue(value.email) || undefined,
    id,
    redacted,
    role,
    status: stringValue(value.status, "active"),
  } satisfies BuildParticipantProjection;
}

interface BuildParticipantProjection {
  displayName: string;
  email?: string;
  id: string;
  redacted: boolean;
  role: string;
  status: string;
}

function projectedContractorCandidates(...values: unknown[]) {
  const candidates = values.flatMap((value) => arrayValue(value));
  const byId = new Map<string, ContractorDrawerAvailableContractor>();
  for (const value of candidates) {
    const candidate = toAvailableContractor(object(value));
    if (candidate._id && !byId.has(candidate._id)) {
      byId.set(candidate._id, candidate);
    }
  }
  return [...byId.values()];
}

function toAvailableContractor(
  value: Record<string, unknown>
): ContractorDrawerAvailableContractor {
  const redacted = booleanValue(value.redacted, false);
  return {
    _id: stringValue(
      value._id ?? value.id ?? value.contractorId ?? value.profileId
    ),
    city: redacted ? undefined : stringValue(value.city) || undefined,
    defaultPayRateCents: redacted
      ? undefined
      : optionalNumber(value.defaultPayRateCents),
    defaultPayRateUnit:
      value.defaultPayRateUnit === "hour" ||
      value.defaultPayRateUnit === "day" ||
      value.defaultPayRateUnit === "fixed"
        ? value.defaultPayRateUnit
        : undefined,
    email: redacted ? undefined : stringValue(value.email) || undefined,
    name: redacted
      ? "Contractor redacted"
      : stringValue(value.name ?? value.displayName, "Contractor"),
    onboardingStatus:
      value.onboardingStatus === "invited" ||
      value.onboardingStatus === "account_linked"
        ? value.onboardingStatus
        : "profile_only",
    trades: redacted
      ? []
      : arrayValue(value.trades ?? value.specialties).filter(
          (trade): trade is string => typeof trade === "string"
        ),
  };
}
