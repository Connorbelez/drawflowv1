import {
  ArrowRight,
  CheckCircle2,
  History,
  Landmark,
  LockKeyhole,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "#/components/ui/badge.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Checkbox } from "#/components/ui/checkbox.tsx";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogTitle,
} from "#/components/ui/dialog.tsx";
import { Label } from "#/components/ui/label.tsx";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";

export interface ProposalLenderAssignmentRecord {
  assignedAt: number;
  assignedByRole?: string;
  assignedByWorkosUserId?: string;
  assignmentId: string;
  lenderBrokerageId?: string;
  lenderOrganizationId: string;
  lenderOrganizationName: string;
  status: "current" | "withdrawn";
  withdrawalReason?: string;
  withdrawnAt?: number;
  withdrawnByWorkosUserId?: string;
}

export interface ProposalLenderOrganizationOption {
  lenderOrganizationId: string;
  lenderOrganizationName: string;
}

export interface ProposalLenderApprovalSummary {
  approvalId: string;
  approvedAt?: number;
  status: "approved" | "declined";
}

type AssignmentDialogView = "assign" | "details" | "repair" | "withdraw";

export function ProposalLenderAssignmentSection({
  assignment,
  assignmentHistory = [],
  approval,
  lenderOrganizations,
  lenderOrganizationsPending = false,
  onAssign,
  onDialogOpenChange,
  onEditReviewPolicy,
  onRepairLenderConfirmation,
  onWithdraw,
  proposal,
  needsConfirmationRepair = false,
}: {
  assignment?: ProposalLenderAssignmentRecord | null;
  assignmentHistory?: readonly ProposalLenderAssignmentRecord[];
  approval?: ProposalLenderApprovalSummary | null;
  lenderOrganizations: readonly ProposalLenderOrganizationOption[];
  lenderOrganizationsPending?: boolean;
  onAssign?: (
    lenderOrganizationId: string,
    reason: string
  ) => Promise<unknown> | unknown;
  onDialogOpenChange?: (open: boolean) => void;
  onEditReviewPolicy?: () => void;
  onRepairLenderConfirmation?: (reason: string) => Promise<unknown> | unknown;
  onWithdraw?: (
    assignmentId: string,
    reason: string
  ) => Promise<unknown> | unknown;
  proposal: {
    buildName: string;
    location: string;
    status: "approved" | "closed" | "draft" | "submitted";
  };
  needsConfirmationRepair?: boolean;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogView, setDialogView] = useState<AssignmentDialogView>("assign");
  const [selectedOrganizationId, setSelectedOrganizationId] = useState("");
  const [assignmentReason, setAssignmentReason] = useState("");
  const [assignmentAcknowledged, setAssignmentAcknowledged] = useState(false);
  const [withdrawalReason, setWithdrawalReason] = useState("");
  const [withdrawalAcknowledged, setWithdrawalAcknowledged] = useState(false);
  const [repairReason, setRepairReason] = useState("");
  const [pending, setPending] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const currentAssignment =
    assignment?.status === "current" ? assignment : null;
  const visibleAssignment = assignment ?? assignmentHistory[0] ?? null;
  const selectedOrganization = lenderOrganizations.find(
    (organization) =>
      organization.lenderOrganizationId === selectedOrganizationId
  );
  const canAssign = canAssignLender({
    currentAssignment,
    onAssign,
    proposalStatus: proposal.status,
  });
  const canWithdraw = canWithdrawLender({
    currentAssignment,
    onWithdraw,
    proposalStatus: proposal.status,
  });

  const openDialog = () => {
    setSelectedOrganizationId("");
    setAssignmentReason("");
    setAssignmentAcknowledged(false);
    setWithdrawalReason("");
    setWithdrawalAcknowledged(false);
    setRepairReason("");
    setDialogView(visibleAssignment ? "details" : "assign");
    setDialogOpen(true);
    onDialogOpenChange?.(true);
  };

  const handleOpenChange = (open: boolean) => {
    setDialogOpen(open);
    onDialogOpenChange?.(open);
    if (!open) {
      requestAnimationFrame(() => triggerRef.current?.focus());
    }
  };

  const openReviewPolicy = () => {
    handleOpenChange(false);
    onEditReviewPolicy?.();
  };

  const handleOrganizationChange = (organizationId: string) => {
    setSelectedOrganizationId(organizationId);
    setAssignmentAcknowledged(false);
  };

  const confirmAssignment = async () => {
    if (
      !(canAssign && onAssign && selectedOrganization && assignmentAcknowledged)
    ) {
      return;
    }
    const reason = assignmentReason.trim();
    if (!reason) {
      toast.error("Assignment reason required.");
      return;
    }
    setPending(true);
    try {
      await onAssign(selectedOrganization.lenderOrganizationId, reason);
      setAnnouncement(
        `${selectedOrganization.lenderOrganizationName} is assigned. Lender confirmation is next.`
      );
      toast.success("Lender assigned.");
      handleOpenChange(false);
    } catch (error) {
      toast.error(proposalActionErrorMessage(error));
    } finally {
      setPending(false);
    }
  };

  const confirmWithdrawal = async () => {
    if (
      !(
        canWithdraw &&
        onWithdraw &&
        currentAssignment &&
        withdrawalAcknowledged
      )
    ) {
      return;
    }
    const reason = withdrawalReason.trim();
    if (!reason) {
      toast.error("Withdrawal reason required.");
      return;
    }
    setPending(true);
    try {
      await onWithdraw(currentAssignment.assignmentId, reason);
      setAnnouncement(
        `${currentAssignment.lenderOrganizationName} was withdrawn. The internal closing path is restored.`
      );
      toast.success("Lender assignment withdrawn.");
      handleOpenChange(false);
    } catch (error) {
      toast.error(proposalActionErrorMessage(error));
    } finally {
      setPending(false);
    }
  };

  const confirmRepair = async () => {
    if (!(onRepairLenderConfirmation && needsConfirmationRepair)) {
      return;
    }
    const reason = repairReason.trim();
    if (!reason) {
      toast.error("Repair reason required.");
      return;
    }
    setPending(true);
    try {
      await onRepairLenderConfirmation(reason);
      setAnnouncement(
        "The current proposal revision and lender confirmation cycle are ready for review."
      );
      toast.success("Lender confirmation restored.");
      handleOpenChange(false);
    } catch (error) {
      toast.error(proposalActionErrorMessage(error));
    } finally {
      setPending(false);
    }
  };

  let supportingText =
    "Optional · assigning a lender adds confirmation before closing";
  if (proposal.status !== "approved" && proposal.status !== "closed") {
    supportingText =
      "Available after Back Office approval · internal closing remains available";
  } else if (proposal.status === "closed" && !visibleAssignment) {
    supportingText = "Proposal closed · lender assignment is unavailable";
  }
  if (currentAssignment) {
    supportingText =
      approval?.status === "approved"
        ? `${currentAssignment.lenderOrganizationName} · confirmed for closing`
        : `${currentAssignment.lenderOrganizationName} · awaiting confirmation`;
  } else if (visibleAssignment?.status === "withdrawn") {
    supportingText =
      "Previous assignment withdrawn · internal closing restored";
  }

  return (
    <>
      <div className="grid w-full min-w-0 grid-cols-1 items-center gap-3 sm:flex sm:flex-wrap sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Landmark className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-sm">Lender assignment</p>
              {currentAssignment ? (
                <Badge
                  size="sm"
                  variant={approval?.status === "approved" ? "success" : "info"}
                >
                  {approval?.status === "approved"
                    ? "Confirmed"
                    : "Awaiting confirmation"}
                </Badge>
              ) : null}
            </div>
            <p className="mt-0.5 text-muted-foreground text-xs leading-relaxed">
              {supportingText}
            </p>
          </div>
        </div>
        <Button
          className="w-full sm:w-auto"
          disabled={!(canAssign || canWithdraw || visibleAssignment)}
          onClick={openDialog}
          ref={triggerRef}
          size="sm"
          variant={visibleAssignment ? "outline" : "default"}
        >
          {visibleAssignment ? "View assignment" : "Assign lender"}
          <ArrowRight />
        </Button>
      </div>

      <AssignmentDialog
        acknowledged={assignmentAcknowledged}
        approval={approval}
        assigned={visibleAssignment}
        assignmentHistory={assignmentHistory}
        assignmentReason={assignmentReason}
        canAssign={canAssign}
        canWithdraw={canWithdraw}
        lenderOrganizations={lenderOrganizations}
        lenderOrganizationsPending={lenderOrganizationsPending}
        needsConfirmationRepair={needsConfirmationRepair}
        onAcknowledgedChange={setAssignmentAcknowledged}
        onAssignmentReasonChange={setAssignmentReason}
        onConfirmAssignment={confirmAssignment}
        onConfirmRepair={confirmRepair}
        onConfirmWithdrawal={confirmWithdrawal}
        onEditReviewPolicy={onEditReviewPolicy ? openReviewPolicy : undefined}
        onOpenChange={handleOpenChange}
        onRepairReasonChange={setRepairReason}
        onSelectedOrganizationChange={handleOrganizationChange}
        onViewChange={setDialogView}
        onWithdrawalAcknowledgedChange={setWithdrawalAcknowledged}
        onWithdrawalReasonChange={setWithdrawalReason}
        open={dialogOpen}
        pending={pending}
        proposal={proposal}
        repairReason={repairReason}
        selectedOrganization={selectedOrganization}
        selectedOrganizationId={selectedOrganizationId}
        view={dialogView}
        withdrawalAcknowledged={withdrawalAcknowledged}
        withdrawalReason={withdrawalReason}
      />

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </>
  );
}

function canAssignLender(input: {
  currentAssignment: ProposalLenderAssignmentRecord | null;
  onAssign?: (
    lenderOrganizationId: string,
    reason: string
  ) => Promise<unknown> | unknown;
  proposalStatus: "approved" | "closed" | "draft" | "submitted";
}) {
  return Boolean(
    input.onAssign &&
      input.proposalStatus === "approved" &&
      !input.currentAssignment
  );
}

function canWithdrawLender(input: {
  currentAssignment: ProposalLenderAssignmentRecord | null;
  onWithdraw?: (
    assignmentId: string,
    reason: string
  ) => Promise<unknown> | unknown;
  proposalStatus: "approved" | "closed" | "draft" | "submitted";
}) {
  return Boolean(
    input.onWithdraw &&
      input.currentAssignment &&
      input.proposalStatus === "approved"
  );
}

function AssignmentDialog({
  acknowledged,
  assigned,
  assignmentHistory,
  assignmentReason,
  approval,
  canAssign,
  canWithdraw,
  lenderOrganizations,
  lenderOrganizationsPending,
  onAcknowledgedChange,
  onAssignmentReasonChange,
  onConfirmAssignment,
  onConfirmRepair,
  onConfirmWithdrawal,
  onEditReviewPolicy,
  onOpenChange,
  onRepairReasonChange,
  onSelectedOrganizationChange,
  onViewChange,
  onWithdrawalAcknowledgedChange,
  onWithdrawalReasonChange,
  open,
  pending,
  proposal,
  repairReason,
  selectedOrganization,
  selectedOrganizationId,
  view,
  withdrawalAcknowledged,
  withdrawalReason,
  needsConfirmationRepair,
}: {
  acknowledged: boolean;
  assigned: ProposalLenderAssignmentRecord | null;
  assignmentHistory: readonly ProposalLenderAssignmentRecord[];
  assignmentReason: string;
  approval?: ProposalLenderApprovalSummary | null;
  canAssign: boolean;
  canWithdraw: boolean;
  lenderOrganizations: readonly ProposalLenderOrganizationOption[];
  lenderOrganizationsPending: boolean;
  onAcknowledgedChange: (checked: boolean) => void;
  onAssignmentReasonChange: (reason: string) => void;
  onConfirmAssignment: () => void;
  onConfirmRepair: () => void;
  onConfirmWithdrawal: () => void;
  onEditReviewPolicy?: () => void;
  onOpenChange: (open: boolean) => void;
  onRepairReasonChange: (reason: string) => void;
  onSelectedOrganizationChange: (organizationId: string) => void;
  onViewChange: (view: AssignmentDialogView) => void;
  onWithdrawalAcknowledgedChange: (checked: boolean) => void;
  onWithdrawalReasonChange: (reason: string) => void;
  open: boolean;
  pending: boolean;
  proposal: {
    buildName: string;
    location: string;
    status: "approved" | "closed" | "draft" | "submitted";
  };
  repairReason: string;
  selectedOrganization?: ProposalLenderOrganizationOption;
  selectedOrganizationId: string;
  view: AssignmentDialogView;
  withdrawalAcknowledged: boolean;
  withdrawalReason: string;
  needsConfirmationRepair: boolean;
}) {
  if (assigned && view === "withdraw") {
    return (
      <WithdrawAssignmentDialog
        acknowledged={withdrawalAcknowledged}
        assigned={assigned}
        onAcknowledgedChange={onWithdrawalAcknowledgedChange}
        onBack={() => onViewChange("details")}
        onConfirm={onConfirmWithdrawal}
        onOpenChange={onOpenChange}
        onReasonChange={onWithdrawalReasonChange}
        open={open}
        pending={pending}
        reason={withdrawalReason}
      />
    );
  }

  if (assigned && view === "details") {
    return (
      <AssignedLenderDialog
        approval={approval}
        assigned={assigned}
        assignmentHistory={assignmentHistory}
        canWithdraw={canWithdraw}
        needsConfirmationRepair={needsConfirmationRepair}
        onAssign={() => onViewChange("assign")}
        onEditReviewPolicy={onEditReviewPolicy}
        onOpenChange={onOpenChange}
        onRepair={() => onViewChange("repair")}
        onWithdraw={() => onViewChange("withdraw")}
        open={open}
        pending={pending}
      />
    );
  }

  if (assigned && view === "repair") {
    return (
      <RepairLenderConfirmationDialog
        assigned={assigned}
        onBack={() => onViewChange("details")}
        onConfirm={onConfirmRepair}
        onOpenChange={onOpenChange}
        onReasonChange={onRepairReasonChange}
        open={open}
        pending={pending}
        reason={repairReason}
      />
    );
  }

  return (
    <FocusedAssignmentDialog
      acknowledged={acknowledged}
      assignmentReason={assignmentReason}
      canAssign={canAssign}
      lenderOrganizations={lenderOrganizations}
      lenderOrganizationsPending={lenderOrganizationsPending}
      onAcknowledgedChange={onAcknowledgedChange}
      onAssignmentReasonChange={onAssignmentReasonChange}
      onConfirm={onConfirmAssignment}
      onEditReviewPolicy={onEditReviewPolicy}
      onOpenChange={onOpenChange}
      onSelectedOrganizationChange={onSelectedOrganizationChange}
      open={open}
      pending={pending}
      proposal={proposal}
      selectedOrganization={selectedOrganization}
      selectedOrganizationId={selectedOrganizationId}
    />
  );
}

function FocusedAssignmentDialog({
  acknowledged,
  assignmentReason,
  canAssign,
  lenderOrganizations,
  lenderOrganizationsPending,
  onAcknowledgedChange,
  onAssignmentReasonChange,
  onConfirm,
  onEditReviewPolicy,
  onOpenChange,
  onSelectedOrganizationChange,
  open,
  pending,
  proposal,
  selectedOrganization,
  selectedOrganizationId,
}: {
  acknowledged: boolean;
  assignmentReason: string;
  canAssign: boolean;
  lenderOrganizations: readonly ProposalLenderOrganizationOption[];
  lenderOrganizationsPending: boolean;
  onAcknowledgedChange: (checked: boolean) => void;
  onAssignmentReasonChange: (reason: string) => void;
  onConfirm: () => void;
  onEditReviewPolicy?: () => void;
  onOpenChange: (open: boolean) => void;
  onSelectedOrganizationChange: (organizationId: string) => void;
  open: boolean;
  pending: boolean;
  proposal: {
    buildName: string;
    location: string;
    status: "approved" | "closed" | "draft" | "submitted";
  };
  selectedOrganization?: ProposalLenderOrganizationOption;
  selectedOrganizationId: string;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Assign lender</DialogTitle>
          <DialogDescription>
            Give one Lender Organization access to review {proposal.buildName}.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-6">
          <ProposalAssignmentContext status={proposal.status} />
          <div className="grid gap-2">
            <Label htmlFor="production-lender-organization">
              Lender Organization
            </Label>
            <Select
              disabled={lenderOrganizationsPending || pending}
              onValueChange={(value) =>
                onSelectedOrganizationChange(value as string)
              }
              value={selectedOrganizationId}
            >
              <SelectTrigger id="production-lender-organization">
                <SelectValue placeholder="Select a lender organization">
                  {(value) =>
                    lenderOrganizations.find(
                      (organization) =>
                        organization.lenderOrganizationId === value
                    )?.lenderOrganizationName ?? "Select a lender organization"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectPopup>
                {lenderOrganizations.map((organization) => (
                  <SelectItem
                    key={organization.lenderOrganizationId}
                    value={organization.lenderOrganizationId}
                  >
                    <span className="flex min-w-0 flex-col py-0.5">
                      <span className="break-words font-medium leading-tight">
                        {organization.lenderOrganizationName}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
            {lenderOrganizationsPending ? (
              <p className="text-muted-foreground text-xs" role="status">
                Loading eligible lender organizations...
              </p>
            ) : lenderOrganizations.length === 0 ? (
              <p className="text-muted-foreground text-xs" role="status">
                No eligible lender organizations are available.
              </p>
            ) : null}
          </div>
          <ReviewPolicySnapshot onEditReviewPolicy={onEditReviewPolicy} />
          <AssignmentImpact />
          <div className="grid gap-2">
            <Label htmlFor="production-lender-assignment-reason">
              Assignment reason
            </Label>
            <Textarea
              id="production-lender-assignment-reason"
              onChange={(event) => onAssignmentReasonChange(event.target.value)}
              placeholder="Explain why this lender is assigned to the proposal."
              value={assignmentReason}
            />
          </div>
          <label
            className="flex cursor-pointer items-start gap-3 text-sm has-disabled:cursor-not-allowed has-disabled:opacity-64"
            htmlFor="production-lender-assignment-acknowledgement"
          >
            <Checkbox
              checked={acknowledged}
              disabled={!selectedOrganization || pending}
              id="production-lender-assignment-acknowledgement"
              onCheckedChange={onAcknowledgedChange}
            />
            <span className="leading-relaxed">
              {selectedOrganization
                ? `Assign ${selectedOrganization.lenderOrganizationName} to ${proposal.buildName}.`
                : "Select a Lender Organization before confirming the assignment."}
            </span>
          </label>
        </DialogPanel>
        <DialogFooter>
          <DialogClose
            render={
              <Button disabled={pending} variant="outline">
                Cancel
              </Button>
            }
          />
          <Button
            aria-describedby="production-lender-assignment-readiness"
            disabled={
              pending ||
              !canAssign ||
              !(selectedOrganization && acknowledged && assignmentReason.trim())
            }
            onClick={onConfirm}
          >
            {pending ? "Assigning..." : "Assign lender"}
          </Button>
          <span className="sr-only" id="production-lender-assignment-readiness">
            Select an organization, enter a reason, and acknowledge the
            assignment to continue.
          </span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AssignedLenderDialog({
  assigned,
  assignmentHistory,
  approval,
  canWithdraw,
  needsConfirmationRepair,
  onAssign,
  onEditReviewPolicy,
  onOpenChange,
  onRepair,
  onWithdraw,
  open,
  pending,
}: {
  assigned: ProposalLenderAssignmentRecord;
  assignmentHistory: readonly ProposalLenderAssignmentRecord[];
  approval?: ProposalLenderApprovalSummary | null;
  canWithdraw: boolean;
  needsConfirmationRepair: boolean;
  onAssign?: () => void;
  onEditReviewPolicy?: () => void;
  onOpenChange: (open: boolean) => void;
  onRepair: () => void;
  onWithdraw: () => void;
  open: boolean;
  pending: boolean;
}) {
  const confirmed = approval?.status === "approved";
  const withdrawn = assigned.status === "withdrawn";
  const priorAssignments = assignmentHistory.filter(
    (candidate) => candidate.assignmentId !== assigned.assignmentId
  );
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Lender assignment</DialogTitle>
          <DialogDescription>
            {withdrawn
              ? "Historical assignment for this proposal."
              : "Current assignment for this proposal."}
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-6">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-info" />
            <div className="min-w-0">
              <p className="break-words font-semibold">
                {assigned.lenderOrganizationName}
              </p>
              <p className="mt-1 text-muted-foreground text-sm">
                {withdrawn
                  ? "Assignment withdrawn"
                  : confirmed
                    ? "Lender confirmation recorded"
                    : "Awaiting guided lender confirmation"}
              </p>
            </div>
          </div>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Next actor</dt>
              <dd className="mt-1 font-semibold">
                {confirmed
                  ? "Back Office or eligible lender user"
                  : withdrawn
                    ? "Back Office"
                    : "Eligible lender user"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Closing eligibility</dt>
              <dd className="mt-1 font-semibold">
                {withdrawn
                  ? "Internal closing restored"
                  : confirmed
                    ? "Confirmation gate passed"
                    : "Blocked until confirmation"}
              </dd>
            </div>
          </dl>
          <ReviewPolicySnapshot onEditReviewPolicy={onEditReviewPolicy} />
          {needsConfirmationRepair && !withdrawn ? (
            <div className="grid gap-3 border-t pt-4">
              <div>
                <h3 className="font-semibold text-sm">
                  Lender confirmation needs restoration
                </h3>
                <p className="mt-1 text-muted-foreground text-xs leading-relaxed">
                  The approved proposal is assigned, but its current review
                  cycle is missing.
                </p>
              </div>
              <Button onClick={onRepair} size="sm" variant="outline">
                Restore lender confirmation
              </Button>
            </div>
          ) : null}
          {priorAssignments.length > 0 ? (
            <div className="grid gap-3 border-t pt-4">
              <div className="flex items-center gap-2">
                <History className="size-4 text-muted-foreground" />
                <h3 className="font-semibold text-sm">Assignment history</h3>
              </div>
              <ul className="grid gap-2 text-sm">
                {priorAssignments.map((history) => (
                  <li
                    className="grid gap-1 border-b pb-2 last:border-0 last:pb-0"
                    key={history.assignmentId}
                  >
                    <span className="break-words font-medium">
                      {history.lenderOrganizationName}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {history.status === "withdrawn" ? "Withdrawn" : "Current"}
                      {history.withdrawalReason
                        ? ` · ${history.withdrawalReason}`
                        : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="text-muted-foreground text-sm leading-relaxed">
            Assignment starts the existing guided confirmation. Closing and
            activation remain separate actions.
          </p>
        </DialogPanel>
        <DialogFooter className="sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {withdrawn && onAssign ? (
              <Button onClick={onAssign}>Assign another lender</Button>
            ) : null}
            {withdrawn ? null : (
              <Button
                disabled={pending || !canWithdraw}
                onClick={onWithdraw}
                variant="destructive-outline"
              >
                Withdraw assignment
              </Button>
            )}
          </div>
          <DialogClose render={<Button disabled={pending}>Done</Button>} />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RepairLenderConfirmationDialog({
  assigned,
  onBack,
  onConfirm,
  onOpenChange,
  onReasonChange,
  open,
  pending,
  reason,
}: {
  assigned: ProposalLenderAssignmentRecord;
  onBack: () => void;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  onReasonChange: (reason: string) => void;
  open: boolean;
  pending: boolean;
  reason: string;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Restore lender confirmation</DialogTitle>
          <DialogDescription>
            Recreate the missing review revision and confirmation cycle for{" "}
            {assigned.lenderOrganizationName}.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-5">
          <div className="space-y-2 text-sm leading-relaxed">
            <p>
              This keeps the approved proposal unchanged and opens a fresh
              lender review of its current terms.
            </p>
            <p className="text-muted-foreground">
              The repair is recorded in the proposal history and notifies
              eligible lender reviewers.
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="production-lender-confirmation-repair-reason">
              Repair reason
            </Label>
            <Textarea
              id="production-lender-confirmation-repair-reason"
              onChange={(event) => onReasonChange(event.target.value)}
              placeholder="Explain why the missing lender review state is being restored."
              value={reason}
            />
          </div>
        </DialogPanel>
        <DialogFooter>
          <Button disabled={pending} onClick={onBack} variant="outline">
            Back
          </Button>
          <Button disabled={pending || !reason.trim()} onClick={onConfirm}>
            {pending ? "Restoring..." : "Restore confirmation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WithdrawAssignmentDialog({
  acknowledged,
  assigned,
  onAcknowledgedChange,
  onBack,
  onConfirm,
  onOpenChange,
  onReasonChange,
  open,
  pending,
  reason,
}: {
  acknowledged: boolean;
  assigned: ProposalLenderAssignmentRecord;
  onAcknowledgedChange: (checked: boolean) => void;
  onBack: () => void;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  onReasonChange: (reason: string) => void;
  open: boolean;
  pending: boolean;
  reason: string;
}) {
  const acknowledgementRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    if (open) {
      requestAnimationFrame(() => acknowledgementRef.current?.focus());
    }
  }, [open]);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Withdraw lender assignment?</DialogTitle>
          <DialogDescription>
            Remove {assigned.lenderOrganizationName} from this proposal before
            closing.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-5">
          <Badge variant="warning">Available before closing only</Badge>
          <div className="space-y-3 text-sm leading-relaxed">
            <p>
              Current lender authority is removed and the normal internal
              closing path is restored.
            </p>
            <p className="text-muted-foreground">
              The former lender keeps an authorized read-only historical record
              of the proposal content available during its assignment.
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="production-lender-withdrawal-reason">
              Withdrawal reason
            </Label>
            <Textarea
              id="production-lender-withdrawal-reason"
              onChange={(event) => onReasonChange(event.target.value)}
              placeholder="Explain why the assignment is withdrawn."
              value={reason}
            />
          </div>
          <label
            className="flex cursor-pointer items-start gap-3 text-sm"
            htmlFor="production-lender-withdrawal-acknowledgement"
          >
            <Checkbox
              checked={acknowledged}
              disabled={pending}
              id="production-lender-withdrawal-acknowledgement"
              onCheckedChange={onAcknowledgedChange}
              ref={acknowledgementRef}
            />
            <span className="leading-relaxed">
              Withdraw {assigned.lenderOrganizationName} and restore internal
              closing.
            </span>
          </label>
        </DialogPanel>
        <DialogFooter>
          <Button disabled={pending} onClick={onBack} variant="outline">
            Back
          </Button>
          <Button
            disabled={pending || !acknowledged || !reason.trim()}
            onClick={onConfirm}
            variant="destructive"
          >
            {pending ? "Withdrawing..." : "Withdraw assignment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProposalAssignmentContext({
  status,
}: {
  status: "approved" | "closed" | "draft" | "submitted";
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <Badge variant={status === "approved" ? "success" : "outline"}>
        {proposalStatusLabel(status)}
      </Badge>
      <Badge variant="outline">Current revision</Badge>
    </div>
  );
}

function ReviewPolicySnapshot({
  onEditReviewPolicy,
}: {
  onEditReviewPolicy?: () => void;
} = {}) {
  return (
    <section
      aria-labelledby="production-current-review-policy"
      className="space-y-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3
              className="font-semibold text-sm"
              id="production-current-review-policy"
            >
              Review policy boundary
            </h3>
            <Badge variant="outline">Back Office owned</Badge>
          </div>
          <p className="mt-1 max-w-md text-muted-foreground text-xs leading-relaxed">
            Policy configuration and locking remain canonical Back Office
            concerns. The lender can review this boundary but cannot edit it
            from the assignment flow.
          </p>
        </div>
        <Button
          disabled={!onEditReviewPolicy}
          onClick={onEditReviewPolicy}
          size="sm"
          variant="outline"
        >
          Edit review policy
        </Button>
      </div>
      <dl className="grid gap-x-5 gap-y-3 text-xs sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Policy owner</dt>
          <dd className="mt-1 font-semibold">Back Office</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Lender access</dt>
          <dd className="mt-1 font-semibold">Read-only</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Revision scope</dt>
          <dd className="mt-1 font-semibold">Current proposal revision</dd>
        </div>
      </dl>
    </section>
  );
}

function proposalStatusLabel(
  status: "approved" | "closed" | "draft" | "submitted"
) {
  return status === "approved"
    ? "Approved"
    : status === "closed"
      ? "Closed"
      : status === "submitted"
        ? "Submitted"
        : "Draft";
}

function AssignmentImpact() {
  const rows = [
    {
      icon: Users,
      text: "Eligible lender users can review the current proposal revision.",
    },
    {
      icon: LockKeyhole,
      text: "Closing waits for lender confirmation of this revision.",
    },
    {
      icon: ShieldCheck,
      text: "The assigned lender cannot edit the Back Office review policy.",
    },
  ];

  return (
    <div className="grid gap-3 border-t pt-4">
      <h3 className="font-semibold text-sm">Assignment effect</h3>
      <ul className="grid gap-3">
        {rows.map(({ icon: Icon, text }) => (
          <li
            className="flex items-start gap-2 text-muted-foreground text-xs leading-relaxed"
            key={text}
          >
            <Icon className="mt-0.5 size-4 shrink-0 text-foreground" />
            <span>{text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function proposalActionErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Assignment action failed.";
}
